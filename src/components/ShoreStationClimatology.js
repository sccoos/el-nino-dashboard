import {createElement, useId, useState} from "npm:react";
import {createRoot} from "npm:react-dom/client";
import * as d3 from "npm:d3";

const DEFAULT_WIDTH = 760;
const DEFAULT_HEIGHT = 360;
const DEFAULT_MARGIN = {top: 24, right: 24, bottom: 42, left: 56};
const ANOMALY_DOMAIN = [-4, 0, 4];

function normalizeRows(rows) {
  return rows
    .map((row) => ({
      time: row.time ? new Date(row.time) : null,
      year: toNumber(row.year),
      day_of_year: Number(row.day_of_year),
      current_year_daily_mean: toNumber(row.current_year_daily_mean),
      climatology_min: toNumber(row.climatology_min),
      climatology_max: toNumber(row.climatology_max),
      historical_climatology_mean: toNumber(row.historical_climatology_mean),
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

export function ShoreStationClimatology({
  rows,
  stationName = "Shore Station",
  stationOptions = null,
  selectedStationKey = null,
  onStationChange = null,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  margin = DEFAULT_MARGIN
}) {
  const plotId = useId();
  const [hoveredDay, setHoveredDay] = useState(null);
  const normalizedRows = normalizeRows(rows);

  if (!normalizedRows.length) {
    return createElement(
      "article",
      {style: cardStyle},
      createElement("h3", {style: titleStyle}, stationName),
      createElement("p", {style: emptyStyle}, "No climatology data available.")
    );
  }

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;
  const yValues = normalizedRows.flatMap((row) => [
    row.current_year_daily_mean,
    row.climatology_min,
    row.climatology_max,
    row.historical_climatology_mean
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
  const hoveredRow = hoveredDay == null
    ? null
    : normalizedRows.find((row) => row.day_of_year === hoveredDay) ?? null;
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
    {style: cardStyle},
    createElement("div", {style: headerStyle},
      createElement("div", {style: headerColumnLeftStyle},
        createElement("p", {style: eyebrowStyle}, "Shore Station Climatology"),
        stationOptions && onStationChange
          ? createElement(
              "label",
              {style: stationSelectWrapStyle},
              createElement(
                "select",
                {
                  value: selectedStationKey ?? "",
                  onChange: (event) => onStationChange(event.target.value),
                  style: stationSelectStyle,
                  "aria-label": "Select shore station"
                },
                stationOptions.map((station) =>
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
          : createElement("h3", {style: titleStyle}, stationName)
      ),
      createElement(
        "div",
        {style: headerColumnCenterStyle},
        createElement(
          "div",
          {style: colorbarWrapStyle},
          createElement("span", {style: colorbarLabelStyle}, "Year-to-date anomaly"),
          renderColorbar(plotId, anomalyColor),
          createElement("div", {style: colorbarTicksStyle},
            createElement("span", null, "-4"),
            createElement("span", null, "0"),
            createElement("span", null, "4")
          )
        )
      ),
      createElement("div", {style: headerColumnRightStyle},
        createElement("div", {style: legendStyle},
          legendItem("#111111", "Historical mean", "dashed"),
          legendItem("#111111", "Current year"),
          legendItem("#8a94a6", "Climatology range")
        )
      )
    ),
    createElement(
      "svg",
      {
        viewBox: `0 0 ${width} ${height}`,
        style: svgStyle,
        role: "img",
        "aria-labelledby": `${plotId}-title ${plotId}-desc`
      },
      createElement("title", {id: `${plotId}-title`}, `${stationName} climatology plot`),
      createElement(
        "desc",
        {id: `${plotId}-desc`},
        "Line chart of historical climatology mean, climatology minimum and maximum range, and the current year daily mean."
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
        }, "Water Temperature (°C)")
      ),
      createElement("rect", {
        x: margin.left,
        y: margin.top,
        width: innerWidth,
        height: innerHeight,
        fill: "transparent",
        style: {cursor: "crosshair"},
        onMouseLeave: () => setHoveredDay(null),
        onMouseMove: (event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const relativeX = event.clientX - bounds.left;
          const scaledX = (relativeX / bounds.width) * innerWidth;
          const day = clampDay(Math.round(xScale.invert(scaledX)));
          setHoveredDay(day);
        }
      }
      )
    )
  );
}

function clampDay(day) {
  return Math.max(1, Math.min(366, day));
}

function buildAnomalySegments(rows) {
  return rows;
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
    {viewBox: "0 0 220 14", style: colorbarSvgStyle, "aria-hidden": true},
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
    {key: label, style: legendItemStyle},
    createElement("span", {
      style: {
        ...legendSwatchStyle,
        background: style === "solid" ? color : "transparent",
        border: `2px ${style === "dashed" ? "dashed" : "solid"} ${color}`
      }
    }),
    createElement("span", null, label)
  );
}

export function renderShoreStationClimatology(rows, options = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  root.render(createElement(ShoreStationClimatology, {...options, rows}));
  return container;
}

function SelectableShoreStationClimatology({
  stationRowsByKey,
  stationOptions,
  initialStationKey,
  width,
  height,
  margin
}) {
  const fallbackKey = stationOptions[0]?.key ?? null;
  const [selectedStationKey, setSelectedStationKey] = useState(initialStationKey ?? fallbackKey);
  const selectedStation = stationOptions.find((station) => station.key === selectedStationKey) ?? stationOptions[0];
  const rows = selectedStation ? stationRowsByKey[selectedStation.key] ?? [] : [];

  return createElement(ShoreStationClimatology, {
    rows,
    stationName: selectedStation?.name ?? "Shore Station",
    stationOptions,
    selectedStationKey: selectedStation?.key ?? null,
    onStationChange: setSelectedStationKey,
    width,
    height,
    margin
  });
}

export function renderSelectableShoreStationClimatology({
  stationRowsByKey,
  stationOptions,
  initialStationKey = null,
  width,
  height,
  margin
}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  root.render(
    createElement(SelectableShoreStationClimatology, {
      stationRowsByKey,
      stationOptions,
      initialStationKey,
      width,
      height,
      margin
    })
  );
  return container;
}

const cardStyle = {
  border: "1px solid #d7e3f0",
  borderRadius: "20px",
  padding: "1.25rem",
  background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
  boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
  fontFamily: '"Avenir Next", "Segoe UI", sans-serif'
};

const headerStyle = {
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  gap: "1rem",
  alignItems: "start",
  marginBottom: "0.75rem",
  width: "100%"
};

const eyebrowStyle = {
  margin: 0,
  fontSize: "0.76rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#5b7083"
};

const titleStyle = {
  margin: "0.2rem 0 0",
  fontSize: "1.25rem",
  color: "#102a43"
};

const stationSelectWrapStyle = {
  display: "inline-block",
  marginTop: "0.2rem"
};

const stationSelectStyle = {
  fontSize: "1.25rem",
  fontWeight: 700,
  color: "#102a43",
  border: "1px solid #d7e3f0",
  borderRadius: "12px",
  padding: "0.35rem 2.2rem 0.35rem 0.75rem",
  background: "#ffffff",
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.05)",
  fontFamily: '"Avenir Next", "Segoe UI", sans-serif'
};

const svgStyle = {
  width: "100%",
  height: "auto",
  display: "block",
  overflow: "visible"
};

const legendStyle = {
  display: "flex",
  gap: "0.85rem",
  flexWrap: "wrap",
  fontSize: "0.85rem",
  color: "#334e68"
};

const headerColumnLeftStyle = {
  justifySelf: "start",
  minWidth: 0
};

const headerColumnCenterStyle = {
  justifySelf: "center",
  display: "flex",
  justifyContent: "center",
  minWidth: 0
};

const headerColumnRightStyle = {
  justifySelf: "end",
  display: "flex",
  justifyContent: "flex-end",
  minWidth: 0
};

const colorbarWrapStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.35rem",
  marginBottom: "0.75rem"
};

const colorbarLabelStyle = {
  fontSize: "0.84rem",
  color: "#334e68",
  fontWeight: 600
};

const colorbarSvgStyle = {
  width: "220px",
  height: "14px",
  display: "block"
};

const colorbarTicksStyle = {
  display: "flex",
  justifyContent: "space-between",
  width: "220px",
  fontSize: "0.75rem",
  color: "#5b7083"
};

const legendItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "0.45rem"
};

const legendSwatchStyle = {
  width: "12px",
  height: "12px",
  borderRadius: "999px",
  display: "inline-block"
};

const emptyStyle = {
  margin: 0,
  color: "#5b7083"
};
