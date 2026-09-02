import {createElement, useEffect, useId, useRef} from "npm:react";
import {createRoot} from "npm:react-dom/client";
import * as maplibregl from "npm:maplibre-gl";

const DEFAULT_CENTER = [-122.4194, 37.7749];
const DEFAULT_ZOOM = 1;
const CALIFORNIA_COUNTIES_GEOJSON_URL = "https://services.gis.ca.gov/arcgis/rest/services/Boundaries/CA_Counties/FeatureServer/0/query?where=1%3D1&outFields=County&f=geojson";
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
    // californiaCounties: {
    //   type: "geojson",
    //   data: CALIFORNIA_COUNTIES_GEOJSON_URL
    // }
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
    },
    // {
    //   id: "california-counties-fill",
    //   type: "fill",
    //   source: "californiaCounties",
    //   paint: {
    //     "fill-color": "#ffffff",
    //     "fill-opacity": 0.04
    //   }
    // },
    // {
    //   id: "california-counties-outline",
    //   type: "line",
    //   source: "californiaCounties",
    //   paint: {
    //     "line-color": "#5b7083",
    //     "line-width": 1.1,
    //     "line-opacity": 0.7
    //   }
    // }
  ]
};

export function MHWMap({
  title = "Marine Heatwave Map",
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  styleUrl = DEFAULT_STYLE,
  workerUrl = null,
  apiRef = null,
  onStationSelect = null,
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
    const stationsByKey = new Map(
      validStations
        .filter((station) => station.station_key)
        .map((station) => [station.station_key, station])
    );
    const stationMarkersByKey = new Map();
    const stationPopupsByKey = new Map();
    const stationMarkers = [];
    let activePopupStationKey = null;
    let stationBoundsApplied = false;

    if (workerUrl) {
      maplibregl.setWorkerUrl(workerUrl);
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center,
      zoom,
      attributionControl: false,
      interactive
    });

    mapRef.current = map;

    const closeOpenPopups = () => {
      for (const popup of stationPopupsByKey.values()) {
        popup.remove();
      }
      activePopupStationKey = null;
    };

    const openStationPopup = (stationKey) => {
      const station = stationsByKey.get(stationKey);
      const marker = stationMarkersByKey.get(stationKey);
      const popup = stationPopupsByKey.get(stationKey);
      if (!station || !marker || !popup) return false;

      closeOpenPopups();
      popup
        .setLngLat([Number(station.longitude), Number(station.latitude)])
        .addTo(map);
      activePopupStationKey = stationKey;
      return true;
    };

    const flyToStation = (stationKey) => {
      const station = stationsByKey.get(stationKey);
      if (!station) return false;

      // Hide the prior station label while the map moves to the new selection.
      closeOpenPopups();
      const targetCenter = [Number(station.longitude), Number(station.latitude)];
      map.flyTo({
        center: targetCenter,
        zoom: Math.max(map.getZoom(), 6.5),
        essential: true
      });

      const openAfterMove = () => {
        openStationPopup(stationKey);
      };

      map.once("moveend", openAfterMove);
      return true;
    };

    if (apiRef) {
      apiRef.current = {
        flyToStation
      };
    }

    const addStationMarkers = () => {
      if (stationMarkers.length) return;

      const bounds = new maplibregl.LngLatBounds();

      for (const station of validStations) {
        const longitude = Number(station.longitude);
        const latitude = Number(station.latitude);
        const popup = new maplibregl.Popup({
          anchor: "top",
          offset: 18,
          closeButton: false,
          closeOnClick: false
        }).setText(station.name ?? "Station");

        const marker = new maplibregl.Marker({color: "#0f766e"})
          .setLngLat([longitude, latitude])
          .addTo(map);

        if (station.station_key) {
          stationMarkersByKey.set(station.station_key, marker);
          stationPopupsByKey.set(station.station_key, popup);
          marker.getElement().addEventListener("click", (event) => {
            event.stopPropagation();
            if (activePopupStationKey === station.station_key) {
              closeOpenPopups();
            } else {
              openStationPopup(station.station_key);
            }
            onStationSelect?.(station.station_key);
          });
        }

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

    map.addControl(
      new maplibregl.AttributionControl({compact: true}),
      "bottom-right"
    );

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
      if (apiRef) apiRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [apiRef, center, interactive, onStationSelect, showNavigation, stations, styleUrl, workerUrl, zoom]);

  return createElement(
    "article",
    {className: "mhw-map-card"},
    createElement("p", {className: "mhw-map-card__eyebrow"}, title),
    createElement("div", {
      ref: containerRef,
      id: mapId,
      className: "mhw-map-card__map",
      style: {
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
  const apiRef = {current: null};
  const root = createRoot(container);
  root.render(createElement(MHWMap, {...options, apiRef}));
  container.flyToStation = (stationKey) => apiRef.current?.flyToStation?.(stationKey) ?? false;
  return container;
}
