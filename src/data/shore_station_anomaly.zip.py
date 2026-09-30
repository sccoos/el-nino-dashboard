#!/usr/bin/env python3

import io
import json
import base64
import os
import re
import time
import sys
import zipfile
from datetime import datetime, timezone
from http.client import IncompleteRead
from typing import Dict, List, Optional, Set, Tuple
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

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
        "name": "Cal Poly Pier",
        "type": "Shore Station",
        "server": "https://erddap.caloos.org/erddap",
        "dataset_id": "san-luis-bay-cal-poly-pier-shore",
        "temperature_field": "sea_water_temperature",
        "temperature_qc_field": "sea_water_temperature_qc_agg",
        "temperature_at_depth": -1,
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
        "server": "https://erddap.cencoos.org/erddap",
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
    },
    {
        "name": "CCE1",
        "type": "Mooring",
        "server": "https://www.pmel.noaa.gov",
        "dataset_id": "pmel_cce1",
        "source_type": "pmel_dat",
        "source_url": "https://www.pmel.noaa.gov/co2/pco2data/cce1/alldata/mooring_cce1-all_xco2_pres-xco2seadryair-xco2airdryair-ph-sss-sst-chl-ntu-sc_o2-sc_o2_mgl-sc_o2_umolkg-sigmatheta.dat",
        "credentials_env_prefix": "PMEL_CCE1",
        "temperature_field": "SST",
        "source_temperature_field": "Sea Surface Temperature (deg C)",
        "latitude": 33.452565,
        "longitude": -122.460433,
    },
    {
        "name": "CCE2",
        "type": "Mooring",
        "server": "https://www.pmel.noaa.gov",
        "dataset_id": "pmel_cce2",
        "source_type": "pmel_dat",
        "source_url": "https://www.pmel.noaa.gov/co2/pco2data/cce2/alldata/coastal_cce2-all_xco2_pres-xco2seadryair-xco2airdryair-ph-sss-sst-chl-ntu-sc_o2-sc_o2_mgl-sc_o2_umolkg-sigmatheta.dat",
        "credentials_env_prefix": "PMEL_CCE2",
        "temperature_field": "SST",
        "source_temperature_field": "Sea Surface Temperature (deg C)",
        "latitude": 34.303672,
        "longitude": -120.802338,
    }
]

TIME_VARIABLE = "time"
# TEMPERATURE_EXCLUDE_ABOVE = 28
# TEMPERATURE_EXCLUDE_BELOW = 6
VALID_TEMPERATURE_QC_FLAGS = {1,2}
DOWNLOAD_RETRIES = 1
RETRY_DELAY_SECONDS = 2
CLIMATOLOGY_POOLING_WINDOW = 11
CLIMATOLOGY_SMOOTHING_WINDOW = 31


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


def pmel_credentials(dataset: dict) -> Tuple[str, str]:
    prefix = dataset["credentials_env_prefix"]
    username = os.environ.get(f"{prefix}_USERNAME")
    password = os.environ.get(f"{prefix}_PASSWORD")
    if username and password:
        return username, password
    raise RuntimeError(
        f"{prefix}_USERNAME and {prefix}_PASSWORD must be set to download "
        f"the authenticated PMEL file for {dataset['name']}."
    )


def read_pmel_dat_with_retries(dataset: dict) -> pd.DataFrame:
    """Download a PMEL mooring ASCII file with HTTP basic authentication.

    PMEL files place field names on row 15 and units/metadata on row 16; data begins
    on row 17. The parser therefore uses the row-15 names and skips row 16.
    """
    download_url = dataset["source_url"]
    username, password = pmel_credentials(dataset)
    authorization = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    request = Request(download_url, headers={"Authorization": f"Basic {authorization}"})

    last_error = None
    for attempt in range(1, DOWNLOAD_RETRIES + 1):
        try:
            with urlopen(request) as response:
                dat_bytes = response.read()
            lines = dat_bytes.decode("utf-8", errors="replace").splitlines()
            if len(lines) < 17:
                raise ValueError(
                    f"PMEL dataset '{dataset['name']}' is shorter than the documented 17-row header."
                )
            # PMEL defines field names on physical row 15 and starts records on row 17.
            # Slice those rows explicitly so Pandas cannot reinterpret the blank row 16.
            csv_text = "\n".join([lines[14], *lines[16:]])
            return pd.read_csv(
                io.StringIO(csv_text),
                sep=",",
                skipinitialspace=True,
                na_values=["-999", "-999.0", "NaN", "nan"],
                low_memory=False,
            )
        except (IncompleteRead, HTTPError, URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt == DOWNLOAD_RETRIES:
                break
            time.sleep(RETRY_DELAY_SECONDS)

    raise RuntimeError(
        f"Failed to download authenticated PMEL dataset '{dataset['name']}' from "
        f"{download_url} after {DOWNLOAD_RETRIES} attempts: {last_error}"
    )


def find_column(frame: pd.DataFrame, *candidates: str) -> Optional[str]:
    normalized = {
        re.sub(r"[^a-z0-9]", "", str(column).lower()): column
        for column in frame.columns
    }
    for candidate in candidates:
        column = normalized.get(re.sub(r"[^a-z0-9]", "", candidate.lower()))
        if column is not None:
            return str(column)
    return None


def pmel_timestamps(frame: pd.DataFrame) -> pd.Series:
    datetime_column = find_column(
        frame, "datetime_utc", "datetime", "timestamp", "date_time", "time"
    )
    if datetime_column:
        return pd.to_datetime(frame[datetime_column], utc=True, errors="coerce")

    year = find_column(frame, "year", "yyyy")
    month = find_column(frame, "month", "mm")
    day = find_column(frame, "day", "dd")
    hour = find_column(frame, "hour", "hh")
    minute = find_column(frame, "minute", "min")
    second = find_column(frame, "second", "sec")
    if not all([year, month, day]):
        raise ValueError(
            "PMEL file does not include a recognized UTC datetime column or year/month/day columns."
        )

    components = pd.DataFrame(
        {
            "year": pd.to_numeric(frame[year], errors="coerce"),
            "month": pd.to_numeric(frame[month], errors="coerce"),
            "day": pd.to_numeric(frame[day], errors="coerce"),
            "hour": pd.to_numeric(frame[hour], errors="coerce") if hour else 0,
            "minute": pd.to_numeric(frame[minute], errors="coerce") if minute else 0,
            "second": pd.to_numeric(frame[second], errors="coerce") if second else 0,
        }
    )
    return pd.to_datetime(components, utc=True, errors="coerce")


def fetch_pmel_mooring_data(
    dataset: dict,
) -> Tuple[pd.DataFrame, str, Optional[str], Optional[float], Optional[float]]:
    temperature_variable = dataset["temperature_field"]
    frame = read_pmel_dat_with_retries(dataset)

    temperature_column = find_column(
        frame, dataset.get("source_temperature_field", temperature_variable)
    )
    if temperature_column is None:
        raise ValueError(
            f"Configured temperature_field '{temperature_variable}' was not found in {dataset['name']}."
        )

    result = pd.DataFrame(
        {
            TIME_VARIABLE: pmel_timestamps(frame),
            temperature_variable: pd.to_numeric(frame[temperature_column], errors="coerce"),
        }
    ).dropna(subset=[TIME_VARIABLE, temperature_variable])
    result = result.sort_values(TIME_VARIABLE).reset_index(drop=True)
    if result.empty:
        raise ValueError(f"Dataset '{dataset['name']}' returned no valid SST observations.")

    # PMEL CCE files do not supply a temperature QC variable.
    return (
        result,
        temperature_variable,
        None,
        float(dataset["latitude"]),
        float(dataset["longitude"]),
    )


def fetch_erddap_station_data(
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


def fetch_station_data(
    dataset: dict,
) -> Tuple[pd.DataFrame, str, Optional[str], Optional[float], Optional[float]]:
    if dataset.get("source_type") == "pmel_dat":
        return fetch_pmel_mooring_data(dataset)
    return fetch_erddap_station_data(dataset)


def climatology_day_of_year(series: pd.Series) -> pd.Series:
    month = series.dt.month
    day = series.dt.day
    day_of_year = series.dt.dayofyear

    # Remove leap day so climatologies always use a 365-day calendar.
    leap_day = (month == 2) & (day == 29)
    adjusted = day_of_year.where(~leap_day)

    # Shift leap-year dates after Feb. 29 back by one day.
    # TODO fix this logic, 
    after_feb_29 = (series.dt.is_leap_year) & ((month > 2) | ((month == 2) & (day > 29)))
    adjusted = adjusted.where(~after_feb_29, adjusted - 1)
    return adjusted


def circular_rolling_mean(
    frame: pd.DataFrame, columns: List[str], window: int
) -> pd.DataFrame:
    """Smooth climatological day-of-year values across the Dec./Jan. boundary."""
    if frame.empty:
        return frame

    result = (
        frame.set_index("day_of_year")
        .reindex(range(1, 366))
        .rename_axis("day_of_year")
        .reset_index()
    )
    radius = window // 2
    for column in columns:
        padded = pd.concat(
            [result[column].iloc[-radius:], result[column], result[column].iloc[:radius]],
            ignore_index=True,
        )
        result[column] = (
            padded.rolling(window=window, center=True, min_periods=1)
            .mean()
            .iloc[radius : radius + len(result)]
            .to_numpy()
        )
    return result


def pooled_day_of_year_statistics(
    frame: pd.DataFrame, value_column: str, window: int
) -> pd.DataFrame:
    """Calculate climatology statistics from circular calendar-day neighborhoods."""
    if frame.empty:
        return pd.DataFrame(columns=["day_of_year", "mean", "p90"])

    radius = window // 2
    pooled = pd.concat(
        [
            frame.assign(
                day_of_year=((frame["day_of_year"] - 1 + offset) % 365) + 1
            )
            for offset in range(-radius, radius + 1)
        ],
        ignore_index=True,
    )
    return (
        pooled.groupby("day_of_year", as_index=False)
        .agg(
            mean=(value_column, "mean"),
            p90=(value_column, lambda values: values.quantile(0.9)),
        )
    )


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

    historical_daily = (
        daily[daily["year"] < current_year].sort_values("time").copy()
    )
    historical_climatology = pooled_day_of_year_statistics(
        historical_daily, "daily_mean", CLIMATOLOGY_POOLING_WINDOW
    ).rename(
        columns={
            "mean": "historical_climatology_mean",
            "p90": "historical_climatology_p90",
        }
    )
    historical_range = (
        historical_daily.groupby("day_of_year", as_index=False)
        .agg(
            historical_climatology_min=("daily_mean", "min"),
            historical_climatology_max=("daily_mean", "max"),
        )
    )
    historical_climatology = historical_climatology[
        ["day_of_year", "historical_climatology_mean", "historical_climatology_p90"]
    ].merge(historical_range, on="day_of_year", how="left")
    historical_climatology = circular_rolling_mean(
        historical_climatology,
        ["historical_climatology_mean", "historical_climatology_p90"],
        CLIMATOLOGY_SMOOTHING_WINDOW,
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
                "historical_climatology_min",
                "historical_climatology_max",
                "historical_climatology_mean",
                "historical_climatology_p90",
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
            "The long-term average and 90th percentile pool daily means from the target calendar day plus five days before and after, wrapping across Dec. 31/Jan. 1.",
            "These seasonal reference curves are then smoothed with a centered, circular 31-day moving mean to reduce short-term variability while preserving the annual cycle.",
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
            station_name = dataset.get("name", dataset["dataset_id"])
            try:
                frame, temperature_variable, temperature_qc_variable, latitude, longitude = fetch_station_data(dataset)
                daily, climatology_metadata = build_daily_products(frame, temperature_variable)
            except Exception as exc:
                raise RuntimeError(f"Failed to process station '{station_name}': {exc}") from exc

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
            current_year_days_exceeding_historical_max = int(
                station_daily["current_year_daily_mean"]
                .ge(station_daily["climatology_max"])
                .sum()
            )
            current_year_days_exceeding_historical_p90 = None
            if "historical_climatology_p90" in station_daily:
                current_year_days_exceeding_historical_p90 = int(
                    station_daily["current_year_daily_mean"]
                    .gt(station_daily["historical_climatology_p90"])
                    .sum()
                )

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
                    "current_year_days_exceeding_historical_max": current_year_days_exceeding_historical_max,
                    "current_year_days_exceeding_historical_p90": current_year_days_exceeding_historical_p90,
                    "source_url": dataset.get(
                        "source_url",
                        f"{dataset['server']}/tabledap/{dataset['dataset_id']}.html",
                    ),
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
