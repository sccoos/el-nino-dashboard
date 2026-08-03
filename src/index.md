```js
import {renderENSOAlertCard} from "./components/ENSOAlertCard.js";

const ensoAlertStatus = await FileAttachment("data/ENSO_alert_status.json").json();
const ensoAlertCard = renderENSOAlertCard(ensoAlertStatus);

const page = document.createElement("div");
page.className = "dashboard-page";
page.append(ensoAlertCard);
display(page);
```
