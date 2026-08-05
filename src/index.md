---
sql:
  shore_station_climatology: ./data/shore_station_anomaly/shore_station_climatology.parquet
---

```js
import {renderENSOAlertCard} from "./components/ENSOAlertCard.js";
import {renderSelectableWaterTemperatureClimatology} from "./components/WaterTemperatureClimatologies.js";

const ensoAlertStatus = await FileAttachment("data/ENSO_alert_status.json").json();
const ensoAlertCard = renderENSOAlertCard(ensoAlertStatus);
const shoreStationManifest = await FileAttachment("data/shore_station_anomaly/manifest.json").json();
const shoreStationRows = await sql`SELECT * FROM shore_station_climatology`;
const shoreStationRowsByKey = Object.groupBy(shoreStationRows, (row) => row.station_key);
const shoreStationOptions = shoreStationManifest.stations
  .map((station) => ({
    key: station.station_key,
    name: station.name,
    type: station.type,
    source_url: station.source_url,
    historical_climatology_start_year: station.historical_climatology_start_year,
    historical_climatology_end_year: station.historical_climatology_end_year
  }))
  .filter((station) => shoreStationRowsByKey[station.key]?.length);
const shoreStationClimatologyPlot = renderSelectableWaterTemperatureClimatology({
  stationRowsByKey: shoreStationRowsByKey,
  stationOptions: shoreStationOptions,
  initialStationKey: "humboldt"
});

const page = document.createElement("div");
page.className = "dashboard-page";

const cardPane = document.createElement("div");
cardPane.className = "dashboard-card-pane";
cardPane.append(ensoAlertCard);

const plotPane = document.createElement("div");
plotPane.className = "dashboard-plot-pane";
plotPane.append(shoreStationClimatologyPlot);

page.append(cardPane, plotPane);
display(page);
```
