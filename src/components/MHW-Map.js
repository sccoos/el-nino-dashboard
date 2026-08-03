import {createElement, useEffect, useId, useRef} from "npm:react";
import {createRoot} from "npm:react-dom/client";
import * as maplibregl from "npm:maplibre-gl";

const MAPLIBRE_WORKER_URL = new URL("../vendor/maplibre-gl-worker.mjs", import.meta.url).href;
const DEFAULT_CENTER = [-122.4194, 37.7749];
const DEFAULT_ZOOM = 4.25;
const DEFAULT_HEIGHT = 440;
const DEFAULT_STYLE = "https://openmaptiles.github.io/positron-gl-style/style-cdn.json";

maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);

export function MHWMap({
  title = "Marine Heatwave Map",
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  styleUrl = DEFAULT_STYLE,
  height = DEFAULT_HEIGHT,
  stations = [],
  interactive = true,
  showNavigation = true
}) {
  const mapId = useId();
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const validStations = stations.filter((station) =>
      Number.isFinite(Number(station.longitude)) &&
      Number.isFinite(Number(station.latitude))
    );

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center,
      zoom,
      attributionControl: true,
      interactive
    });

    mapRef.current = map;

    if (showNavigation) {
      map.addControl(new maplibregl.NavigationControl(), "top-right");
    }

    map.on("load", () => {
      const bounds = new maplibregl.LngLatBounds();

      for (const station of validStations) {
        const longitude = Number(station.longitude);
        const latitude = Number(station.latitude);
        const popup = new maplibregl.Popup({offset: 18}).setText(station.name ?? "Station");

        new maplibregl.Marker({color: "#0f766e"})
          .setLngLat([longitude, latitude])
          .setPopup(popup)
          .addTo(map);

        bounds.extend([longitude, latitude]);
      }

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: 48,
          maxZoom: 7
        });
      }

      map.resize();
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [center, interactive, showNavigation, stations, styleUrl, zoom]);

  return createElement(
    "article",
    {style: cardStyle},
    createElement("p", {style: eyebrowStyle}, title),
    createElement("div", {
      ref: containerRef,
      id: mapId,
      style: {
        ...mapStyle,
        height: `${height}px`
      },
      role: "img",
      "aria-label": title
    })
  );
}

export function renderMHWMap(options = {}) {
  const container = document.createElement("div");
  const root = createRoot(container);
  root.render(createElement(MHWMap, options));
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

const eyebrowStyle = {
  margin: 0,
  fontSize: "0.76rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#5b7083"
};

const titleStyle = {
  margin: "0.25rem 0 0",
  fontSize: "1.25rem",
  color: "#102a43"
};

const descriptionStyle = {
  margin: "0.45rem 0 0.9rem",
  fontSize: "0.95rem",
  color: "#486581"
};

const mapStyle = {
  width: "100%",
  borderRadius: "16px",
  overflow: "hidden",
  border: "1px solid #d7e3f0",
  background: "#dce9f5",
  minHeight: "280px"
};
