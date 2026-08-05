import {createElement, useEffect, useId, useRef} from "npm:react";
import {createRoot} from "npm:react-dom/client";
import * as maplibregl from "npm:maplibre-gl";

const DEFAULT_CENTER = [-122.4194, 37.7749];
const DEFAULT_ZOOM = 1;
const DEFAULT_STYLE = {
  version: 8,
  sources: {
    maplibre: {
      type: "vector",
      tiles: ["https://demotiles.maplibre.org/tiles/{z}/{x}/{y}.pbf"],
      minzoom: 0,
      maxzoom: 6,
      attribution: "© CARTO, © OpenStreetMap contributors"
    }
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#d8f2ff"
      }
    },
    {
      id: "countries-fill",
      type: "fill",
      source: "maplibre",
      "source-layer": "countries",
      paint: {
        "fill-color": "#f3f7ea",
        "fill-outline-color": "#c4d6c8"
      }
    },
    {
      id: "coastline",
      type: "line",
      source: "maplibre",
      "source-layer": "countries",
      paint: {
        "line-color": "#83acc1",
        "line-width": 1.1
      }
    },
    {
      id: "geolines",
      type: "line",
      source: "maplibre",
      "source-layer": "geolines",
      filter: ["!=", ["get", "name"], "International Date Line"],
      paint: {
        "line-color": "#8db5cc",
        "line-width": 0.7,
        "line-dasharray": [2, 2]
      }
    }
  ]
};

export function MHWMap({
  title = "Marine Heatwave Map",
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  styleUrl = DEFAULT_STYLE,
  workerUrl = null,
  height = null,
  stations = [],
  interactive = true,
  showNavigation = true
}) {
  const mapId = useId();
  const containerRef = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const container = containerRef.current;
    const validStations = stations.filter((station) =>
      Number.isFinite(Number(station.longitude)) &&
      Number.isFinite(Number(station.latitude))
    );
    const stationMarkers = [];
    let stationBoundsApplied = false;

    if (workerUrl) {
      maplibregl.setWorkerUrl(workerUrl);
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center,
      zoom,
      attributionControl: true,
      interactive
    });

    mapRef.current = map;

    const addStationMarkers = () => {
      if (stationMarkers.length) return;

      const bounds = new maplibregl.LngLatBounds();

      for (const station of validStations) {
        const longitude = Number(station.longitude);
        const latitude = Number(station.latitude);
        const popup = new maplibregl.Popup({offset: 18}).setText(station.name ?? "Station");

        const marker = new maplibregl.Marker({color: "#0f766e"})
          .setLngLat([longitude, latitude])
          .setPopup(popup)
          .addTo(map);

        stationMarkers.push(marker);
        bounds.extend([longitude, latitude]);
      }

      if (!stationBoundsApplied && !bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: 48,
          maxZoom: 7
        });
        stationBoundsApplied = true;
      }
    };

    let animationFrame = null;
    const resizeMap = () => {
      if (animationFrame != null) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        map.resize();
        animationFrame = null;
      });
    };
    const resizeObserver = new ResizeObserver(() => {
      resizeMap();
    });
    resizeObserver.observe(container);

    if (showNavigation) {
      map.addControl(new maplibregl.NavigationControl(), "top-right");
    }

    map.on("style.load", () => {
      addStationMarkers();
    });

    map.on("load", () => {
      addStationMarkers();
      resizeMap();
    });

    return () => {
      resizeObserver.disconnect();
      if (animationFrame != null) cancelAnimationFrame(animationFrame);
      for (const marker of stationMarkers) marker.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [center, interactive, showNavigation, stations, styleUrl, workerUrl, zoom]);

  return createElement(
    "article",
    {style: cardStyle},
    createElement("p", {style: eyebrowStyle}, title),
    createElement("div", {
      ref: containerRef,
      id: mapId,
      style: {
        ...mapStyle,
        ...(height == null ? {height: "100%"} : {height: `${height}px`})
      },
      role: "img",
      "aria-label": title
    })
  );
}

export function renderMHWMap(options = {}) {
  const container = document.createElement("div");
  container.style.height = "100%";
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
  fontFamily: '"Avenir Next", "Segoe UI", sans-serif',
  height: "100%",
  boxSizing: "border-box",
  display: "flex",
  flexDirection: "column"
};

const eyebrowStyle = {
  margin: 0,
  fontSize: "0.76rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#5b7083",
  marginBottom: "0.75rem"
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
  minHeight: "280px",
  flex: "1 1 auto"
};
