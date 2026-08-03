#!/usr/bin/env python3

import io
import json
import re
import time
import sys
import zipfile
from datetime import datetime, timezone
from http.client import IncompleteRead
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

import pandas as pd
from erddapy import ERDDAP


# Shore station datasets from the CalOOS ERDDAP.
DATASETS = [
    {
        "name": "Humboldt",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "edu_humboldt_humboldt",
    },
    {
        "name": "Santa Cruz Wharf",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "edu_ucsc_scwharf1",
    },
    {
        "name": "Trinidad Head",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "edu_humboldt_tdp",
    },
    {
        "name": "Bodega Bay",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "bodega-bay-bml_wts",
    },
    {
        "name": "Morro Bay",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "edu_calpoly_marine_morro",
    },
    {
        "name": "Moss Landing",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "mlml_mlml_sea",
    },
    {
        "name": "Tiburon",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "tiburon-water-tibc1",
    },
    {
        "name": "Newport Pier",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "newport-pier-automated-shore-sta",
    },
    {
        "name": "Scripps Pier",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "scripps-pier-automated-shore-sta-1",
    },
    {
        "name": "Stearns Wharf",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "stearns-wharf-automated-shore-st-1",
    },
    {
        "name": "Santa Monica Pier",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "santa-monica-pier-automated-shor-1",
    },
]

TIME_VARIABLE = "time"
TEMPERATURE_VARIABLE_CANDIDATES = [
    "sea_water_temperature",
    "sea_water_temperature_ctd",
]
TEMPERATURE_EXCLUDE_ABOVE = 28
TEMPERATURE_EXCLUDE_BELOW = 6
DOWNLOAD_RETRIES = 3
RETRY_DELAY_SECONDS = 2


def load_dataset_info(server: str, dataset_id: str) -> dict:
    erddap = ERDDAP(server=server, protocol="tabledap")
    info_url = erddap.get_info_url(dataset_id=dataset_id, response="json")
    with urlopen(info_url) as response:
        return json.load(response)


def available_variables(info: dict) -> set[str]:
    table = info["table"]
    column_names = table["columnNames"]
    rows = table["rows"]
    variable_name_index = column_names.index("Variable Name")
    row_type_index = column_names.index("Row Type")

    return {
        row[variable_name_index]
        for row in rows
        if row[row_type_index] == "variable"
    }


def metadata_rows(info: dict) -> tuple[list[str], list[list[object]]]:
    table = info["table"]
    return table["columnNames"], table["rows"]


def find_attribute_value(
    info: dict,
    *,
    row_type: str,
    attribute_name: str,
    variable_name: str | None = None,
) -> str | None:
    column_names, rows = metadata_rows(info)
    row_type_index = column_names.index("Row Type")
    variable_name_index = column_names.index("Variable Name")
    attribute_name_index = column_names.index("Attribute Name")
    value_index = column_names.index("Value")

    for row in rows:
        if row[row_type_index] != row_type:
            continue
        if variable_name is not None and row[variable_name_index] != variable_name:
            continue
        if row[attribute_name_index] != attribute_name:
            continue
        value = row[value_index]
        return None if value is None else str(value)

    return None


def parse_float_list(value: str | None) -> list[float]:
    if not value:
        return []
    matches = re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", value)
    return [float(match) for match in matches]


def extract_coordinate(info: dict, variable_name: str, global_attribute_name: str) -> float | None:
    variable_actual_range = find_attribute_value(
        info,
        row_type="attribute",
        variable_name=variable_name,
        attribute_name="actual_range",
    )
    values = parse_float_list(variable_actual_range)
    if values:
        return sum(values) / len(values)

    global_value = find_attribute_value(
        info,
        row_type="global",
        attribute_name=global_attribute_name,
    )
    values = parse_float_list(global_value)
    if values:
        return sum(values) / len(values)

    return None


def extract_station_coordinates(info: dict) -> tuple[float | None, float | None]:
    latitude = extract_coordinate(info, "latitude", "geospatial_lat_min")
    longitude = extract_coordinate(info, "longitude", "geospatial_lon_min")
    return latitude, longitude


def choose_temperature_variable(variables: set[str]) -> str:
    for variable in TEMPERATURE_VARIABLE_CANDIDATES:
        if variable in variables:
            return variable
    raise ValueError(
        "No supported temperature variable found. "
        f"Expected one of {TEMPERATURE_VARIABLE_CANDIDATES}."
    )


def read_csv_with_retries(download_url: str) -> pd.DataFrame:
    last_error = None
    for attempt in range(1, DOWNLOAD_RETRIES + 1):
        try:
            with urlopen(download_url) as response:
                csv_bytes = response.read()
            return pd.read_csv(
                io.BytesIO(csv_bytes),
                low_memory=False,
            )
        except (IncompleteRead, HTTPError, URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt == DOWNLOAD_RETRIES:
                break
            time.sleep(RETRY_DELAY_SECONDS)

    raise RuntimeError(f"Failed to download dataset after {DOWNLOAD_RETRIES} attempts: {last_error}")


def fetch_station_data(server: str, dataset_id: str) -> tuple[pd.DataFrame, str, float | None, float | None]:
    info = load_dataset_info(server, dataset_id)
    variables = available_variables(info)
    temperature_variable = choose_temperature_variable(variables)
    latitude, longitude = extract_station_coordinates(info)

    erddap = ERDDAP(
        server=server,
        protocol="tabledap",
        response="csv",
    )
    erddap.dataset_id = dataset_id
    erddap.variables = [TIME_VARIABLE, temperature_variable]

    download_url = erddap.get_download_url(response="csv")
    frame = read_csv_with_retries(download_url)

    frame.columns = [column.split(" (", 1)[0] for column in frame.columns]
    frame = frame[[TIME_VARIABLE, temperature_variable]].copy()
    frame[TIME_VARIABLE] = pd.to_datetime(
        frame[TIME_VARIABLE],
        format="ISO8601",
        utc=True,
        errors="coerce",
    )
    frame[temperature_variable] = pd.to_numeric(frame[temperature_variable], errors="coerce")
    frame = frame.dropna(subset=[TIME_VARIABLE, temperature_variable])
    frame = frame[frame[temperature_variable] <= TEMPERATURE_EXCLUDE_ABOVE]
    frame = frame[frame[temperature_variable] >= TEMPERATURE_EXCLUDE_BELOW]
    frame = frame.sort_values(TIME_VARIABLE).reset_index(drop=True)

    if frame.empty:
        raise ValueError("Dataset returned no valid temperature observations.")

    return frame, temperature_variable, latitude, longitude


def climatology_day_of_year(series: pd.Series) -> pd.Series:
    month = series.dt.month
    day = series.dt.day
    day_of_year = series.dt.dayofyear

    # Remove leap day so climatologies always use a 365-day calendar.
    leap_day = (month == 2) & (day == 29)
    adjusted = day_of_year.where(~leap_day)

    # Shift leap-year dates after Feb. 29 back by one day.
    after_feb_29 = (series.dt.is_leap_year) & ((month > 2) | ((month == 2) & (day > 29)))
    adjusted = adjusted.where(~after_feb_29, adjusted - 1)
    return adjusted


def build_daily_products(frame: pd.DataFrame, temperature_variable: str) -> pd.DataFrame:
    daily = (
        frame.assign(date=frame[TIME_VARIABLE].dt.floor("D"))
        .groupby("date", as_index=False)[temperature_variable]
        .agg(["mean", "min", "max"])
        .reset_index()
        .rename(
            columns={
                "date": "time",
                "mean": "daily_mean",
                "min": "daily_min",
                "max": "daily_max",
            }
        )
    )

    daily["year"] = daily["time"].dt.year
    daily["day_of_year"] = climatology_day_of_year(daily["time"])
    daily = daily.dropna(subset=["day_of_year"]).copy()
    daily["day_of_year"] = daily["day_of_year"].astype(int)

    current_year = datetime.now(timezone.utc).year

    climatology = (
        daily.groupby("day_of_year", as_index=False)
        .agg(
            climatology_mean=("daily_mean", "mean"),
            climatology_min=("daily_mean", "min"),
            climatology_max=("daily_mean", "max"),
        )
    )

    historical_daily = daily[daily["year"] < current_year]
    historical_climatology = (
        historical_daily.groupby("day_of_year", as_index=False)
        .agg(
            historical_climatology_mean=("daily_mean", "mean"),
            historical_climatology_min=("daily_mean", "min"),
            historical_climatology_max=("daily_mean", "max"),
        )
    )

    current_year_daily = daily[daily["year"] == current_year][
        [
            "time",
            "day_of_year",
            "daily_mean",
        ]
    ].rename(columns={"daily_mean": "current_year_daily_mean"})

    result = climatology.merge(historical_climatology, on="day_of_year", how="left")
    result = result.merge(current_year_daily, on="day_of_year", how="left")
    result["year"] = current_year
    result["year_to_date_anomaly"] = (
        result["current_year_daily_mean"] - result["historical_climatology_mean"]
    )

    return result[
        [
            "time",
            "year",
            "day_of_year",
            "current_year_daily_mean",
            "climatology_min",
            "climatology_max",
            "historical_climatology_mean",
            "year_to_date_anomaly",
        ]
    ]


def station_slug(dataset: dict) -> str:
    if dataset.get("name"):
        return str(dataset["name"]).strip().lower().replace(" ", "_")
    return dataset["dataset_id"]


def build_archive() -> bytes:
    if not DATASETS:
        raise ValueError(
            "DATASETS is empty. Add the shoreline station dataset entries at the top "
            "of src/data/shore_station_anomaly.zip.py."
        )

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "stations": [],
        "notes": [
            "Daily values are computed from full-resolution ERDDAP observations binned by UTC day.",
            "Each output row represents one day_of_year climatology.",
            "Leap day (Feb. 29) is excluded so climatologies use a 365-day calendar.",
            "Dates after Feb. 29 in leap years are remapped down by one day_of_year.",
            "climatology_min and climatology_max summarize daily_mean across all years for each day_of_year.",
            "historical_climatology_mean excludes the current year.",
            "current_year_daily_mean is the current year's daily_mean for that day_of_year when available.",
            "year_to_date_anomaly is current_year_daily_mean minus the historical climatological daily mean for the same day_of_year.",
            f"Raw ERDDAP temperature values > {TEMPERATURE_EXCLUDE_ABOVE} are excluded before aggregation.",
        ],
    }

    buffer = io.BytesIO()
    station_frames = []
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for dataset in DATASETS:
            frame, temperature_variable, latitude, longitude = fetch_station_data(
                server=dataset["server"],
                dataset_id=dataset["dataset_id"],
            )
            daily = build_daily_products(frame, temperature_variable)

            slug = station_slug(dataset)
            parquet_station_name = f"{slug}.parquet"
            station_daily = daily.assign(
                station_name=dataset.get("name", dataset["dataset_id"]),
                station_key=slug,
                dataset_id=dataset["dataset_id"],
                server=dataset["server"],
                temperature_variable=temperature_variable,
            )
            station_frames.append(station_daily)

            manifest["stations"].append(
                {
                    "name": dataset.get("name", dataset["dataset_id"]),
                    "station_key": slug,
                    "dataset_id": dataset["dataset_id"],
                    "server": dataset["server"],
                    "temperature_variable": temperature_variable,
                    "latitude": latitude,
                    "longitude": longitude,
                    "rows": int(len(station_daily)),
                    "output_file": "shore_station_climatology.parquet",
                    "start_time": daily["time"].min().isoformat(),
                    "end_time": daily["time"].max().isoformat(),
                }
            )

        combined = pd.concat(station_frames, ignore_index=True)
        parquet_buffer = io.BytesIO()
        combined.to_parquet(parquet_buffer, index=False)
        archive.writestr("shore_station_climatology.parquet", parquet_buffer.getvalue())
        archive.writestr("manifest.json", json.dumps(manifest, indent=2))

    return buffer.getvalue()


def main() -> None:
    try:
        archive_bytes = build_archive()
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)

    sys.stdout.buffer.write(archive_bytes)


if __name__ == "__main__":
    main()
