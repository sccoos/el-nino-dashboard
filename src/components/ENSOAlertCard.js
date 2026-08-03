import {createElement} from "npm:react";
import {createRoot} from "npm:react-dom/client";

export function ENSOAlertCard({status}) {
  const statusColor = getStatusColor(status);

  return createElement(
    "article",
    {
      style: {
        border: "1px solid #d7e3f0",
        borderRadius: "16px",
        padding: "1.25rem",
        background: "linear-gradient(180deg, #ffffff 0%, #f4f8fb 100%)",
        boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
        maxWidth: "320px",
        fontFamily: '"Avenir Next", "Segoe UI", sans-serif'
      }
    },
    createElement(
      "p",
      {
        style: {
          margin: "0 0 0.5rem",
          fontSize: "0.78rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#5b7083"
        }
      },
      "ENSO Alert System Status"
    ),
    createElement(
      "p",
      {
        style: {
          margin: 0,
          fontSize: "1.35rem",
          fontWeight: 700,
          color: statusColor
        }
      },
      status || "Status unavailable"
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
