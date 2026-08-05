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
        style: {"--enso-status-color": statusColor}
      },
      createElement(
        "a",
        {
          className: "enso-alert-card__link",
          href: "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml",
          target: "_blank",
          rel: "noreferrer"
        },
        status || "Status unavailable"
      )
    )
  );
}

function getStatusColor(status) {
  const normalizedStatus = String(status ?? "").trim().toLowerCase();

  if (normalizedStatus === "el niño advisory") return "#b42318";
  if (normalizedStatus === "el niño watch") return "#f79009";
  if (normalizedStatus === "la niña advisory") return "#175cd3";
  if (normalizedStatus === "la niña watch") return "#56b4ef";
  return "#102a43";
}

export function renderENSOAlertCard(data) {
  const container = document.createElement("div");
  const root = createRoot(container);
  root.render(createElement(ENSOAlertCard, {status: data?.ENSO_Alert_System_Status}));
  return container;
}
