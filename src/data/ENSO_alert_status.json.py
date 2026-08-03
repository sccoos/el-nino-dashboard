#!/usr/bin/env python3

import json
import re
import sys
from html import unescape
from urllib.request import Request, urlopen


URL = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml"


def fetch_html(url: str) -> str:
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; ENSO-alert-status-script/1.0)"
        },
    )
    with urlopen(request) as response:
        return response.read().decode("utf-8", errors="replace")


def extract_alert_status(html: str) -> str:
    compact_html = " ".join(html.split())
    match = re.search(
        r"ENSO Alert System Status:.*?<a\b[^>]*>(.*?)</a>",
        compact_html,
        re.IGNORECASE | re.DOTALL,
    )
    if not match:
        raise ValueError("Could not find ENSO Alert System Status on the NOAA page.")

    status = re.sub(r"<[^>]+>", "", match.group(1))
    return unescape(status).strip()


def main() -> None:
    try:
        html = fetch_html(URL)
        status = extract_alert_status(html)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)

    print(json.dumps({"ENSO_Alert_System_Status": status}))


if __name__ == "__main__":
    main()
