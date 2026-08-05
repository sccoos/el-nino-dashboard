#!/usr/bin/env python3

import io
import json
import re
import time
import sys
import zipfile
from datetime import datetime, timezone
from http.client import IncompleteRead
from typing import Dict, List, Optional, Set, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

import pandas as pd
from erddapy import ERDDAP


# Shore station datasets from the CalOOS ERDDAP.
DATASETS = [
    {
        "name": "Humboldt",
        "type": "Shore Station",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "edu_humboldt_humboldt",
        "temperature_field": "sea_water_temperature",
        "temperature_qc_field": "sea_water_temperature_qc_agg",
    },
    {
        "name": "Santa Cruz Wharf",
        "type": "Shore Station",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "edu_ucsc_scwharf1",
        "temperature_field": "sea_water_temperature",
        "temperature_qc_field": "sea_water_temperature_qc_agg",
    },
    {
        "name": "Trinidad Head",
        "type": "Shore Station",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "edu_humboldt_tdp",
        "temperature_field": "sea_water_temperature",
        "temperature_qc_field": "sea_water_temperature_qc_agg",
    },
    {
        "name": "Bodega Bay",
        "type": "Shore Station",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "bodega-bay-bml_wts",
        "temperature_field": "sea_water_temperature",
        "temperature_qc_field": "sea_water_temperature_qc_agg",
    },
    {
        "name": "Morro Bay",
        "type": "Shore Station",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "edu_calpoly_marine_morro",
        "temperature_field": "sea_water_temperature",
        "temperature_qc_field": "sea_water_temperature_qc_agg",
    },
    {
        "name": "Moss Landing",
        "type": "Shore Station",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "mlml_mlml_sea",
        "temperature_field": "sea_water_temperature",
        "temperature_qc_field": "sea_water_temperature_qc_agg",
    },
    {
        "name": "Tiburon",
        "type": "Shore Station",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "tiburon-water-tibc1",
        "temperature_field": "sea_water_temperature",
        "temperature_qc_field": "sea_water_temperature_qc_agg",
    },
    {
        "name": "Newport Pier",
        "type": "Shore Station",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "newport-pier-automated-shore-sta",
        "temperature_field": "sea_water_temperature_ctd",
        "temperature_qc_field": "sea_water_temperature_ctd_qc_agg",
    },
    {
        "name": "Scripps Pier",
        "type": "Shore Station",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "scripps-pier-automated-shore-sta-1",
        "temperature_field": "sea_water_temperature_ctd",
        "temperature_qc_field": "sea_water_temperature_ctd_qc_agg",
    },
    {
        "name": "Stearns Wharf",
        "type": "Shore Station",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "stearns-wharf-automated-shore-st-1",
        "temperature_field": "sea_water_temperature_ctd",
        "temperature_qc_field": "sea_water_temperature_ctd_qc_agg",
    },
    {
        "name": "Santa Monica Pier",
        "type": "Shore Station",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "santa-monica-pier-automated-shor-1",
        "temperature_field": "sea_water_temperature_ctd",
        "temperature_qc_field": "sea_water_temperature_ctd_qc_agg",
    },
    {
        "name": "Monterey Bay Aquarium Seawater Intake",
        "type": "Shore Station",
        "server": "https://erddap.cencoos.org/erddap",
        "dataset_id": "monterey-bay-aquarium-seawate",
        "temperature_field": "sea_water_temperature",
        "temperature_qc_field": "sea_water_temperature_qc_agg",
    },
    {
        "name": "M1 Mooring",
        "type": "Mooring",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "org_mbari_m1",
        "temperature_field": "sea_water_temperature",
        "temperature_qc_field": "sea_water_temperature_qc_agg",
        "temperature_at_depth": -1,
    },
    {
        "name": "Del Mar Mooring",
        "type": "Mooring",
        "server": "https://sensors.erddap.caloos.org/erddap",
        "dataset_id": "del-mar-mooring-1",
        "temperature_field": "sea_water_temperature",
        "temperature_qc_field": "sea_water_temperature_qc_agg",
        "temperature_at_depth": 0,
    }
]

TIME_VARIABLE = "time"
# TEMPERATURE_EXCLUDE_ABOVE = 28
# TEMPERATURE_EXCLUDE_BELOW = 6
VALID_TEMPERATURE_QC_FLAGS = {1,2}
DOWNLOAD_RETRIES = 1
RETRY_DELAY_SECONDS = 2


def load_dataset_info(server: str, dataset_id: str) -> dict:
    erddap = ERDDAP(server=server, protocol="tabledap")
    info_url = erddap.get_info_url(dataset_id=dataset_id, response="json")
    with urlopen(info_url) as response:
        return json.load(response)


def available_variables(info: dict) -> Set[str]:
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


def metadata_rows(info: dict) -> Tuple[List[str], List[List[object]]]:
    table = info["table"]
    return table["columnNames"], table["rows"]


def find_attribute_value(
    info: dict,
    *,
    row_type: str,
    attribute_name: str,
    variable_name: Optional[str] = None,
) -> Optional[str]:
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


def parse_float_list(value: Optional[str]) -> List[float]:
    if not value:
        return []
    matches = re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", value)
    return [float(match) for match in matches]


def extract_coordinate(
    info: dict, variable_name: str, global_attribute_name: str
) -> Optional[float]:
    global_value = find_attribute_value(
        info,
        row_type="global",
        attribute_name=global_attribute_name,
    )
    values = parse_float_list(global_value)
    if values:
        return sum(values) / len(values)

    variable_actual_range = find_attribute_value(
        info,
        row_type="attribute",
        variable_name=variable_name,
        attribute_name="actual_range",
    )
    values = parse_float_list(variable_actual_range)
    if values:
        return sum(values) / len(values)

    return None


def extract_station_coordinates(info: dict) -> Tuple[Optional[float], Optional[float]]:
    latitude = extract_coordinate(info, "latitude", "geospatial_lat_min")
    longitude = extract_coordinate(info, "longitude", "geospatial_lon_min")
    return latitude, longitude


def parse_numeric_constraint(value: object) -> object:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value

    text = str(value).strip()
    if not text:
        return None

    numeric = float(text)
    return int(numeric) if numeric.is_integer() else numeric


def read_csv_with_retries(download_url: str) -> pd.DataFrame:
    last_error = None
    for attempt in range(1, DOWNLOAD_RETRIES + 1):
        try:
            with urlopen(download_url) as response:
                csv_bytes = response.read()
            return pd.read_csv(
                io.BytesIO(csv_bytes),
                skiprows=[1],
                low_memory=False,
            )
        except (IncompleteRead, HTTPError, URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt == DOWNLOAD_RETRIES:
                break
            time.sleep(RETRY_DELAY_SECONDS)

    raise RuntimeError(f"Failed to download dataset {download_url} after {DOWNLOAD_RETRIES} attempts: {last_error}")


def fetch_station_data(
    dataset: dict,
) -> Tuple[pd.DataFrame, str, Optional[str], Optional[float], Optional[float]]:
    server = dataset["server"]
    dataset_id = dataset["dataset_id"]
    temperature_variable = dataset["temperature_field"]
    temperature_qc_variable = dataset.get("temperature_qc_field")
    temperature_at_depth = parse_numeric_constraint(dataset.get("temperature_at_depth"))

    info = load_dataset_info(server, dataset_id)
    variables = available_variables(info)
    latitude, longitude = extract_station_coordinates(info)

    if temperature_variable not in variables:
        raise ValueError(
            f"Configured temperature_field '{temperature_variable}' was not found in {dataset_id}."
        )

    qc_variable = None
    if temperature_qc_variable and str(temperature_qc_variable).upper() != "NA":
        if temperature_qc_variable not in variables:
            raise ValueError(
                f"Configured temperature_qc_field '{temperature_qc_variable}' was not found in {dataset_id}."
            )
        qc_variable = temperature_qc_variable

    erddap = ERDDAP(
        server=server,
        protocol="tabledap",
        response="csv",
    )
    erddap.dataset_id = dataset_id
    erddap.variables = [TIME_VARIABLE, temperature_variable]
    if qc_variable:
        erddap.variables.append(qc_variable)
    if temperature_at_depth is not None:
        erddap.constraints = {"z=": temperature_at_depth}

    download_url = erddap.get_download_url(response="csv")
    frame = read_csv_with_retries(download_url)

    frame.columns = [column.split(" (", 1)[0] for column in frame.columns]
    selected_columns = [TIME_VARIABLE, temperature_variable]
    if qc_variable:
        selected_columns.append(qc_variable)
    frame = frame[selected_columns].copy()
    frame[TIME_VARIABLE] = pd.to_datetime(
        frame[TIME_VARIABLE],
        format="%Y-%m-%dT%H:%M:%SZ",
        utc=True,
        errors="coerce",
    )
    frame[temperature_variable] = pd.to_numeric(frame[temperature_variable], errors="coerce")
    if qc_variable:
        frame[qc_variable] = pd.to_numeric(frame[qc_variable], errors="coerce")
    frame = frame.dropna(subset=[TIME_VARIABLE, temperature_variable])
    if qc_variable:
        frame = frame[frame[qc_variable].isin(VALID_TEMPERATURE_QC_FLAGS)]
    # frame = frame[frame[temperature_variable] <= TEMPERATURE_EXCLUDE_ABOVE]
    # frame = frame[frame[temperature_variable] >= TEMPERATURE_EXCLUDE_BELOW]
    frame = frame.sort_values(TIME_VARIABLE).reset_index(drop=True)

    if frame.empty:
        raise ValueError(
            f"Dataset '{dataset.get('name', dataset_id)}' returned no valid temperature observations."
        )

    return frame, temperature_variable, qc_variable, latitude, longitude


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


def build_daily_products(
    frame: pd.DataFrame, temperature_variable: str
) -> Tuple[pd.DataFrame, Dict[str, Optional[int]]]:
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

    historical_start_year = None
    historical_end_year = None
    if not historical_daily.empty:
        historical_start_year = int(historical_daily["year"].min())
        historical_end_year = int(historical_daily["year"].max())

    return (
        result[
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
        ],
        {
            "historical_climatology_start_year": historical_start_year,
            "historical_climatology_end_year": historical_end_year,
        },
    )


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
            f"Only observations with temperature QC flags in {sorted(VALID_TEMPERATURE_QC_FLAGS)} are retained when a temperature_qc_field is configured.",
            "Raw temperature threshold filters are currently disabled in code.",
        ],
    }

    buffer = io.BytesIO()
    station_frames = []
    with zipfile.ZipFile(buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
        for dataset in DATASETS:
            frame, temperature_variable, temperature_qc_variable, latitude, longitude = fetch_station_data(dataset)
            daily, climatology_metadata = build_daily_products(frame, temperature_variable)

            slug = station_slug(dataset)
            station_daily = daily.assign(
                station_name=dataset.get("name", dataset["dataset_id"]),
                station_type=dataset["type"],
                station_key=slug,
                dataset_id=dataset["dataset_id"],
                server=dataset["server"],
                temperature_variable=temperature_variable,
                temperature_qc_variable=temperature_qc_variable,
            )
            station_frames.append(station_daily)

            manifest["stations"].append(
                {
                    "name": dataset.get("name", dataset["dataset_id"]),
                    "type": dataset["type"],
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
                    "historical_climatology_start_year": climatology_metadata[
                        "historical_climatology_start_year"
                    ],
                    "historical_climatology_end_year": climatology_metadata[
                        "historical_climatology_end_year"
                    ],
                    "source_url": f"{dataset['server']}/tabledap/{dataset['dataset_id']}.html",
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
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)

    sys.stdout.buffer.write(archive_bytes)


if __name__ == "__main__":
    main()
