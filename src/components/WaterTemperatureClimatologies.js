import {createElement, useId, useState} from "npm:react";
import {createRoot} from "npm:react-dom/client";
import * as d3 from "npm:d3";

const DEFAULT_WIDTH = 760;
const DEFAULT_HEIGHT = 360;
const DEFAULT_MARGIN = {top: 24, right: 4, bottom: 42, left: 56};
const ANOMALY_DOMAIN = [-4, 0, 4];

function normalizeRows(rows) {
  return rows
    .map((row) => ({
      time: row.time ? new Date(row.time) : null,
      year: toNumber(row.year),
      day_of_year: Number(row.day_of_year),
      current_year_daily_mean: toNumber(row.current_year_daily_mean),
      climatology_min: toNumber(row.historical_climatology_min),
      climatology_max: toNumber(row.historical_climatology_max),
      historical_climatology_mean: toNumber(row.historical_climatology_mean),
      historical_climatology_p90: toNumber(row.historical_climatology_p90),
      year_to_date_anomaly: toNumber(row.year_to_date_anomaly)
    }))
    .filter((row) => Number.isFinite(row.day_of_year))
    .sort((a, b) => a.day_of_year - b.day_of_year);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function lineOrNull(line, data) {
  const path = line(data);
  return path ?? null;
}

export function WaterTemperatureClimatology({
  rows,
  stationName = "Shore Station",
  stationOptions = null,
  selectedStationKey = null,
  onStationChange = null,
  hoveredDay = null,
  onHoveredDayChange = null,
  stationType = null,
  historicalStartYear = null,
  historicalEndYear = null,
  currentYearDaysExceedingHistoricalMax = null,
  currentYearDaysExceedingHistoricalP90 = null,
  sourceUrl = null,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  margin = DEFAULT_MARGIN
}) {
  const plotId = useId();
  const [internalHoveredDay, setInternalHoveredDay] = useState(null);
  const activeHoveredDay = hoveredDay ?? internalHoveredDay;
  const normalizedRows = normalizeRows(rows);

  const handleHoveredDayChange = (nextHoveredDay) => {
    if (hoveredDay == null) {
      setInternalHoveredDay(nextHoveredDay);
    }
    onHoveredDayChange?.(nextHoveredDay);
  };

  if (!normalizedRows.length) {
    return createElement(
      "article",
      {className: "climatology-card"},
      createElement("h3", {className: "climatology-card__title"}, stationName),
      createElement("p", {className: "climatology-card__empty"}, "No climatology data available.")
    );
  }

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const yValues = normalizedRows.flatMap((row) => [
    row.current_year_daily_mean,
    row.climatology_min,
    row.climatology_max,
    row.historical_climatology_mean,
    row.historical_climatology_p90
  ]).filter(Number.isFinite);

  const xScale = d3.scaleLinear()
    .domain([1, 366])
    .range([0, innerWidth]);

  const yExtent = d3.extent(yValues);
  const yPadding = ((yExtent[1] ?? 1) - (yExtent[0] ?? 0)) * 0.12 || 1;
  const yScale = d3.scaleLinear()
    .domain([
      (yExtent[0] ?? 0) - yPadding,
      (yExtent[1] ?? 1) + yPadding
    ])
    .nice()
    .range([innerHeight, 0]);

  const line = d3.line()
    .defined((d) => Number.isFinite(d.value))
    .x((d) => xScale(d.day_of_year))
    .y((d) => yScale(d.value));

  const currentYearSeries = normalizedRows.map((row) => ({
    day_of_year: row.day_of_year,
    value: row.current_year_daily_mean
  }));
  const historicalMeanSeries = normalizedRows.map((row) => ({
    day_of_year: row.day_of_year,
    value: row.historical_climatology_mean
  }));
  const historicalP90Series = normalizedRows.map((row) => ({
    day_of_year: row.day_of_year,
    value: row.historical_climatology_p90
  }));
  const climatologyMinSeries = normalizedRows.map((row) => ({
    day_of_year: row.day_of_year,
    value: row.climatology_min
  }));
  const climatologyMaxSeries = normalizedRows.map((row) => ({
    day_of_year: row.day_of_year,
    value: row.climatology_max
  }));

  const area = d3.area()
    .defined((d) => Number.isFinite(d.climatology_min) && Number.isFinite(d.climatology_max))
    .x((d) => xScale(d.day_of_year))
    .y0((d) => yScale(d.climatology_min))
    .y1((d) => yScale(d.climatology_max));

  const areaPath = area(normalizedRows);
  const anomalyColor = d3.scaleLinear()
    .domain(ANOMALY_DOMAIN)
    .range(["#0b3c8c", "#ffffff", "#8b1e1e"])
    .clamp(true);
  const anomalyArea = d3.area()
    .defined((d) =>
      Number.isFinite(d.current_year_daily_mean) &&
      Number.isFinite(d.historical_climatology_mean) &&
      Number.isFinite(d.year_to_date_anomaly)
    )
    .x((d) => xScale(d.day_of_year))
    .y0((d) => yScale(d.historical_climatology_mean))
    .y1((d) => yScale(d.current_year_daily_mean));
  const dayBandWidth = innerWidth / 366;
  const xTicks = [1, 60, 121, 182, 244, 305, 366];
  const monthLabels = [
    {day: 1, label: "Jan"},
    {day: 60, label: "Mar"},
    {day: 121, label: "May"},
    {day: 182, label: "Jul"},
    {day: 244, label: "Sep"},
    {day: 305, label: "Nov"}
  ];
  const hoveredRow = activeHoveredDay == null
    ? null
    : normalizedRows.find((row) => row.day_of_year === activeHoveredDay) ?? null;
  const tooltipX = hoveredRow ? xScale(hoveredRow.day_of_year) : null;
  const tooltipY = hoveredRow
    ? yScale(firstFiniteValue([
        hoveredRow.current_year_daily_mean,
        hoveredRow.historical_climatology_mean,
        hoveredRow.climatology_max,
        hoveredRow.climatology_min
      ]))
    : null;

  return createElement(
    "article",
    {className: "climatology-card"},
    createElement("div", {className: "climatology-card__header"},
      createElement("div", {className: "climatology-card__header-left"},
        createElement("p", {className: "climatology-card__eyebrow"}, "California Coastal Climatology"),
        stationOptions && onStationChange
          ? createElement(
              "label",
              {className: "climatology-card__station-select-wrap"},
              createElement(
                "select",
                {
                  value: selectedStationKey ?? "",
                  onChange: (event) => onStationChange(event.target.value),
                  className: "climatology-card__station-select",
                  "aria-label": "Select station"
                },
                buildStationOptionGroups(stationOptions).map((group) =>
                  createElement(
                    "optgroup",
                    {
                      key: group.type,
                      label: group.type
                    },
                    group.stations.map((station) =>
                      createElement(
                        "option",
                        {
                          key: station.key,
                          value: station.key
                        },
                        station.name
                      )
                    )
                  )
                )
              )
            )
          : createElement("h3", {className: "climatology-card__title"}, stationName)
      ),
    ),
    createElement(
      "svg",
      {
        viewBox: `0 0 ${width} ${height}`,
        className: "climatology-card__svg",
        role: "img",
        "aria-labelledby": `${plotId}-title ${plotId}-desc`,
        onMouseLeave: () => handleHoveredDayChange(null),
        onMouseMove: (event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const svgX = ((event.clientX - bounds.left) / bounds.width) * width;
          const plotX = svgX - margin.left;

          if (plotX < 0 || plotX > innerWidth) {
            handleHoveredDayChange(null);
            return;
          }

          const day = clampDay(Math.round(xScale.invert(plotX)));
          handleHoveredDayChange(day);
        }
      },
      createElement("title", {id: `${plotId}-title`}, `${stationName} climatology plot`),
      createElement(
        "desc",
        {id: `${plotId}-desc`},
        "Line chart of historical climatology mean and 90th percentile, climatology minimum and maximum range, and the current year daily mean."
      ),
      createElement("g", {transform: `translate(${margin.left},${margin.top})`},
        createElement(
          "g",
          null,
          yScale.ticks(5).map((tick) =>
            createElement(
              "g",
              {key: `y-grid-${tick}`, transform: `translate(0,${yScale(tick)})`},
              createElement("line", {
                x1: 0,
                x2: innerWidth,
                y1: 0,
                y2: 0,
                stroke: "#dbe7f3",
                strokeDasharray: "4 6"
              }),
              createElement("text", {
                x: -12,
                y: 4,
                textAnchor: "end",
                fill: "#5b7083",
                fontSize: 11
              }, tick.toFixed(1))
            )
          )
        ),
        createElement(
          "g",
          null,
          xTicks.map((tick) =>
            createElement(
              "line",
              {
                key: `x-grid-${tick}`,
                x1: xScale(tick),
                x2: xScale(tick),
                y1: 0,
                y2: innerHeight,
                stroke: "#eef4f9"
              }
            )
          )
        ),
        areaPath ? createElement("path", {
          d: areaPath,
          fill: "#ffffff",
          opacity: 1
        }) : null,
        ...normalizedRows
          .filter((row) =>
            Number.isFinite(row.current_year_daily_mean) &&
            Number.isFinite(row.historical_climatology_mean) &&
            Number.isFinite(row.year_to_date_anomaly)
          )
          .map((row) =>
            createElement("rect", {
              key: `anomaly-day-${row.day_of_year}`,
              x: xScale(row.day_of_year) - dayBandWidth / 2,
              y: Math.min(
                yScale(row.current_year_daily_mean),
                yScale(row.historical_climatology_mean)
              ),
              width: dayBandWidth + 1,
              height: Math.abs(
                yScale(row.current_year_daily_mean) -
                yScale(row.historical_climatology_mean)
              ),
              rx: 2.5,
              ry: 2.5,
              fill: anomalyColor(row.year_to_date_anomaly),
              opacity: 0.95
            })
          ),
        createElement("path", {
          d: lineOrNull(line, historicalMeanSeries),
          fill: "none",
          stroke: "#111111",
          strokeWidth: 1.5,
          strokeDasharray: "5 5"
        }),
        createElement(
          "g",
          null,
          createElement("path", {
            d: lineOrNull(line, climatologyMinSeries),
            fill: "none",
            stroke: "#b6c0cc",
            strokeWidth: 1.2
          }),
          createElement("path", {
            d: lineOrNull(line, climatologyMaxSeries),
            fill: "none",
            stroke: "#b6c0cc",
            strokeWidth: 1.2
          })
        ),
        createElement("path", {
          d: lineOrNull(line, currentYearSeries),
          fill: "none",
          stroke: "#111111",
          strokeWidth: 1.8
        }),
        createElement("path", {
          d: lineOrNull(line, historicalP90Series),
          fill: "none",
          stroke: "#2f855a",
          strokeWidth: 1.8,
          strokeDasharray: "6 4"
        }),
        createElement("line", {
          x1: 0,
          x2: innerWidth,
          y1: innerHeight,
          y2: innerHeight,
          stroke: "#7b8ea3"
        }),
        createElement("line", {
          x1: 0,
          x2: 0,
          y1: 0,
          y2: innerHeight,
          stroke: "#7b8ea3"
        }),
        hoveredRow ? createElement(
          "g",
          null,
          createElement("line", {
            x1: tooltipX,
            x2: tooltipX,
            y1: 0,
            y2: innerHeight,
            stroke: "#102a43",
            strokeDasharray: "4 4",
            opacity: 0.45
          }),
          tooltipDot(tooltipX, yScale(hoveredRow.climatology_min), "#b6c0cc"),
          tooltipDot(tooltipX, yScale(hoveredRow.climatology_max), "#b6c0cc"),
          tooltipDot(tooltipX, yScale(hoveredRow.historical_climatology_mean), "#111111"),
          Number.isFinite(hoveredRow.current_year_daily_mean)
            ? tooltipDot(tooltipX, yScale(hoveredRow.current_year_daily_mean), "#111111")
            : null,
          createElement(
            "g",
            {
              transform: tooltipTransform(tooltipX, tooltipY, innerWidth)
            },
            createElement("rect", {
              width: 188,
              height: 116,
              rx: 12,
              fill: "#102a43",
              opacity: 0.95
            }),
            createElement("text", {
              x: 12,
              y: 22,
              fill: "#f8fbff",
              fontSize: 12,
              fontWeight: 700
            }, formatTooltipDate(hoveredRow)),
            tooltipText(
              12,
              40,
              "#ffffff",
              `${formatFocusYear(hoveredRow)}: ${formatTemperature(hoveredRow.current_year_daily_mean)}`
            ),
            createElement("text", {
              x: 12,
              y: 60,
              fill: "#cbd5e1",
              fontSize: 11,
              fontWeight: 700
            }, "Historical"),
            tooltipText(12, 76, "#ffffff", `Mean: ${formatTemperature(hoveredRow.historical_climatology_mean)}`),
            tooltipText(12, 92, "#d1d5db", `Max: ${formatTemperature(hoveredRow.climatology_max)}`),
            tooltipText(12, 108, "#d1d5db", `Min: ${formatTemperature(hoveredRow.climatology_min)}`)
          )
        ) : null,
        monthLabels.map(({day, label}) =>
          createElement("text", {
            key: label,
            x: xScale(day),
            y: innerHeight + 24,
            textAnchor: "middle",
            fill: "#5b7083",
            fontSize: 11
          }, label)
        ),
        createElement("text", {
          x: innerWidth / 2,
          y: innerHeight + 38,
          textAnchor: "middle",
          fill: "#102a43",
          fontSize: 12,
          fontWeight: 600
        }, "Day of Year"),
        createElement("text", {
          transform: `translate(${-42},${innerHeight / 2}) rotate(-90)`,
          textAnchor: "middle",
          fill: "#102a43",
          fontSize: 12,
          fontWeight: 600
        }, "Water Temperature (°C)"),
        createElement(
          "foreignObject",
          {
            x: 8,
            y: 8,
            width: Math.min(innerWidth - 16, 190),
            height: 56
          },
          createElement(
            "div",
            {
              xmlns: "http://www.w3.org/1999/xhtml",
              className: "climatology-card__colorbar-overlay"
            },
            createElement(
              "div",
              {className: "climatology-card__colorbar-wrap"},
              createElement("span", {className: "climatology-card__colorbar-label"}, "Temperature anomaly (°C)"),
              renderColorbar(plotId, anomalyColor),
              createElement("div", {className: "climatology-card__colorbar-ticks"},
                createElement("span", null, "-4"),
                createElement("span", null, "0"),
                createElement("span", null, "4")
              )
            )
          )
        ),
        createElement(
          "foreignObject",
          {
            x: 8,
            y: innerHeight - 26,
            width: innerWidth - 16,
            height: 20
          },
          createElement(
            "div",
            {
              xmlns: "http://www.w3.org/1999/xhtml",
              className: "climatology-card__legend-overlay"
            },
            createElement("div", {className: "climatology-card__legend"},
              legendItem("#111111", "Historical mean", "dashed"),
              legendItem("#2f855a", "Historical 90th percentile", "dashed"),
              legendItem("#111111", "Current year"),
              legendItem("#8a94a6", "Climatology range")
            )
          )
        )
      )
    ),
    createElement(
      "div",
      {className: "climatology-card__notes"},
      `Historic climatology for ${stationName} calculated from ${formatYearRange(historicalStartYear, historicalEndYear)} with 7-day smoothing. This year to date, ${stationName} has observed ${formatDayCount(currentYearDaysExceedingHistoricalMax)} new maximum daily mean temperatures, and ${formatDayCount(currentYearDaysExceedingHistoricalP90)} days where daily mean temperature exceeded the threshold for marine heatwave (`,
      createElement(
        "a",
        {
          href: "https://doi.org/10.1016/j.pocean.2015.12.014",
          target: "_blank",
          rel: "noreferrer"
        },
        "Hobday et al. 2016"
      ),
      "). Source: ",
      sourceUrl
        ? createElement(
            "a",
            {
              href: sourceUrl,
              target: "_blank",
              rel: "noreferrer"
            },
            sourceUrl
          )
        : "Unavailable"
    )
  );
}

function clampDay(day) {
  return Math.max(1, Math.min(366, day));
}

function buildStationOptionGroups(stationOptions) {
  const groups = new Map();
  for (const station of stationOptions) {
    const type = station.type ?? "Other";
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(station);
  }

  return Array.from(groups.entries())
    .map(([type, stations]) => ({
      type,
      stations: [...stations].sort((a, b) => {
        const latitudeDifference = toSortableLatitude(b.latitude) - toSortableLatitude(a.latitude);
        return latitudeDifference || a.name.localeCompare(b.name);
      })
    }))
    .sort((a, b) => a.type.localeCompare(b.type));
}

function toSortableLatitude(value) {
  return Number.isFinite(Number(value)) ? Number(value) : -Infinity;
}

function firstFiniteValue(values) {
  for (const value of values) {
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function formatValue(value) {
  return Number.isFinite(value) ? d3.format(".2f")(value) : "N/A";
}

function formatTemperature(value) {
  return Number.isFinite(value) ? `${formatValue(value)} °C` : "N/A";
}

function formatTooltipDate(row) {
  if (Number.isFinite(row.day_of_year)) {
    const referenceDate = d3.utcDay.offset(new Date(Date.UTC(2025, 0, 1)), row.day_of_year - 1);
    return d3.utcFormat("%B %-d")(referenceDate);
  }
  return "Unknown date";
}

function formatFocusYear(row) {
  return Number.isFinite(row.year) ? String(row.year) : "Current year";
}

function formatYearRange(startYear, endYear) {
  return Number.isFinite(startYear) && Number.isFinite(endYear)
    ? `${startYear} - ${endYear}`
    : "Unavailable";
}

function formatDayCount(value) {
  return Number.isFinite(Number(value)) ? String(value) : "N/A";
}

function tooltipTransform(x, y, innerWidth) {
  const tooltipWidth = 188;
  const tooltipHeight = 116;
  const offsetX = x > innerWidth - tooltipWidth - 16 ? -tooltipWidth - 14 : 14;
  const offsetY = y < 110 ? 14 : -tooltipHeight - 14;
  return `translate(${x + offsetX},${y + offsetY})`;
}

function tooltipDot(x, y, color) {
  return createElement("circle", {
    cx: x,
    cy: y,
    r: 4,
    fill: color,
    stroke: "#ffffff",
    strokeWidth: 1.5
  });
}

function tooltipText(x, y, fill, label) {
  return createElement(
    "text",
    {
      x,
      y,
      fill,
      fontSize: 11.5
    },
    label
  );
}

function renderColorbar(plotId, anomalyColor) {
  const gradientId = `${plotId}-anomaly-gradient`;
  const stops = d3.range(0, 1.0001, 0.1).map((t) => {
    const value = -4 + t * 8;
    return createElement("stop", {
      key: value,
      offset: `${t * 100}%`,
      stopColor: anomalyColor(value)
    });
  });

  return createElement(
    "svg",
    {viewBox: "0 0 220 14", className: "climatology-card__colorbar-svg", "aria-hidden": true},
    createElement(
      "defs",
      null,
      createElement("linearGradient", {id: gradientId, x1: "0%", x2: "100%", y1: "0%", y2: "0%"}, ...stops)
    ),
    createElement("rect", {
      x: 0,
      y: 0,
      width: 220,
      height: 14,
      rx: 7,
      fill: `url(#${gradientId})`,
      stroke: "#cbd5e1"
    })
  );
}

function legendItem(color, label, style = "solid") {
  return createElement(
    "div",
    {key: label, className: "climatology-card__legend-item"},
    createElement("span", {
      className: "climatology-card__legend-swatch",
      style: {
        background: style === "solid" ? color : "transparent",
        border: `2px ${style === "dashed" ? "dashed" : "solid"} ${color}`
      }
    }),
    createElement("span", null, label)
  );
}

export function renderWaterTemperatureClimatology(rows, options = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  root.render(createElement(WaterTemperatureClimatology, {...options, rows}));
  return container;
}

function SelectableWaterTemperatureClimatology({
  stationRowsByKey,
  stationOptions,
  initialStationKey,
  onStationChange,
  hoveredDay,
  onHoveredDayChange,
  apiRef,
  width,
  height,
  margin
}) {
  const fallbackKey = stationOptions[0]?.key ?? null;
  const [selectedStationKey, setSelectedStationKey] = useState(initialStationKey ?? fallbackKey);
  const selectedStation = stationOptions.find((station) => station.key === selectedStationKey) ?? stationOptions[0];
  const rows = selectedStation ? stationRowsByKey[selectedStation.key] ?? [] : [];
  const handleStationChange = (nextStationKey) => {
    setSelectedStationKey(nextStationKey);
    onStationChange?.(nextStationKey);
  };

  if (apiRef) {
    apiRef.current = {
      setStationKey: handleStationChange
    };
  }

  return createElement(WaterTemperatureClimatology, {
    rows,
    stationName: selectedStation?.name ?? "Station",
    stationOptions,
    selectedStationKey: selectedStation?.key ?? null,
    onStationChange: handleStationChange,
    hoveredDay,
    onHoveredDayChange,
    stationType: selectedStation?.type ?? null,
    historicalStartYear: selectedStation?.historical_climatology_start_year ?? null,
    historicalEndYear: selectedStation?.historical_climatology_end_year ?? null,
    currentYearDaysExceedingHistoricalMax:
      selectedStation?.current_year_days_exceeding_historical_max ?? null,
    currentYearDaysExceedingHistoricalP90:
      selectedStation?.current_year_days_exceeding_historical_p90 ?? null,
    sourceUrl: selectedStation?.source_url ?? null,
    width,
    height,
    margin
  });
}

export function renderSelectableWaterTemperatureClimatology({
  stationRowsByKey,
  stationOptions,
  initialStationKey = null,
  onStationChange = null,
  hoveredDay = null,
  onHoveredDayChange = null,
  width,
  height,
  margin
}) {
  const container = document.createElement("div");
  const apiRef = {current: null};
  const root = createRoot(container);
  root.render(
      createElement(SelectableWaterTemperatureClimatology, {
        stationRowsByKey,
        stationOptions,
        initialStationKey,
        onStationChange,
        hoveredDay,
        onHoveredDayChange,
        apiRef,
        width,
        height,
        margin
      })
  );
  container.setStationKey = (stationKey) => apiRef.current?.setStationKey?.(stationKey);
  return container;
}
