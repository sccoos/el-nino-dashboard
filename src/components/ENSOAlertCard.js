import {createElement} from "npm:react";
import {createRoot} from "npm:react-dom/client";

export function ENSOAlertCard({status}) {
  const statusColor = getStatusColor(status);

  return createElement(
    "article",
    {
      className: "enso-alert-card"
    },
    createElement(
      "p",
      {className: "enso-alert-card__eyebrow"},
      "ENSO Alert System Status"
    ),
    createElement(
      "p",
      {
        className: "enso-alert-card__status",
        style: {color: statusColor}
      },
      createElement(
        "a",
        {
          className: "enso-alert-card__link",
          href: "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml",
          target: "_blank",
          rel: "noreferrer",
          style: {color: statusColor}
        },
        status || "Status unavailable"
      )
    )
  );
}

function getStatusColor(status) {
  const normalizedStatus = normalizeStatus(status);

  if (normalizedStatus.includes("el nino") && normalizedStatus.includes("advisory")) return "#b42318";
  if (normalizedStatus.includes("el nino") && normalizedStatus.includes("watch")) return "#f79009";
  if (normalizedStatus.includes("la nina") && normalizedStatus.includes("advisory")) return "#175cd3";
  if (normalizedStatus.includes("la nina") && normalizedStatus.includes("watch")) return "#56b4ef";
  return "#102a43";
}

function normalizeStatus(status) {
  return String(status ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function renderENSOAlertCard(data) {
  const container = document.createElement("div");
  const root = createRoot(container);
  root.render(createElement(ENSOAlertCard, {status: data?.ENSO_Alert_System_Status}));
  return container;
}
