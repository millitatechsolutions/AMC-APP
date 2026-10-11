# Assigned-branch map and service overview

The front page now places the assigned UBL branch map alongside three summary cards:

| Card | Included visits | Counts |
|---|---|---|
| AMC gensets | OOW assets | Total, performed, remaining |
| Warranty gensets | Warranty assets | Total, performed, remaining |
| Total gensets | Both categories | Total, performed, remaining |

**Performed** means the assigned technician has submitted an FSR for the selected monthly visit. **Remaining** means no FSR has been submitted. A report rejected by the branch remains a performed technician visit but is explicitly counted as needing correction. Resubmitting it does not increase the performed count. Client acknowledgement is shown separately and remains mandatory for OOW payment eligibility.

All map locations and counts follow the selected month, search, region, warranty and status filters and the current user's assignments. Multiple gensets at one branch are grouped into a single branch pin. Missing coordinates do not remove a branch or genset from the totals. The current database has one monthly visit per asset; a production solution with multiple maintenance types will need an agreed distinct-asset counting policy.

The screen checks for technician responses every 15 seconds while Overview is visible and no form, dropdown or dialog is in use. **Refresh now** checks immediately. Polling requests receive FSR references rather than image payloads; visit detail retrieves the authorized full FSR when opened. A temporary connection failure is indicated beside the last-checked time and retried automatically. Android clients are not delivered yet; the current technician web interface supplies the actual stored responses.

## Demo map

The current map uses locally bundled Natural Earth geographic outlines and clearly labelled synthetic city coordinates. No map account or internet connection is required for the local geographic view. Green pins represent branches where all selected FSRs have been submitted; amber pins represent branches with visits remaining. Select a pin or branch name to see totals and open its visits. Nearby demo pins are visually separated with leader lines so they remain selectable.

These are **not verified UBL branch locations**. Only synthetic assets whose serials follow the existing `DEMO-ENGINE-*` naming receive illustrative city coordinates. Assets with supplied numeric coordinates retain them, and real assets without coordinates remain unmapped. There is no guessed geocoding of real banking data. Real branch location import/editing is a later feature.

`public/branch-map.geojson` contains Pakistan and neighboring country outlines derived from Natural Earth's 1:110m countries data. Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson . Natural Earth data is public domain: https://www.naturalearthdata.com/about/terms-of-use/ . The local map is a geographic view, not Google Maps.

## Optional live Google Maps

Google Maps integration is implemented, but a real Google Maps session was **not** validated because no Maps browser API key is configured. To enable it on your own computer:

1. In Google Cloud, create/select a project, enable billing and **Maps JavaScript API**, then create a browser API key. Google may charge for usage.
2. Restrict the key to **Maps JavaScript API** and your actual website HTTP referrers. For the local demo, permit only the loopback addresses/ports you use, for example `http://127.0.0.1:3000/*` (add the actual alternate port if needed).
3. Copy `.env.example` to `.env` in the extracted project folder. Set `GOOGLE_MAPS_BROWSER_KEY` locally. Optionally set `GOOGLE_MAPS_MAP_ID` to your map ID; the example map ID is used if omitted.
4. Restart using `START-AMC.bat`, `bash start-amc.sh` or `npm start`.

Do not send the key in chat or commit `.env`. Browser map keys are intentionally delivered to the browser, so referrer and API restrictions are essential; never use an unrestricted server credential as this key. Google Maps displays the same assigned branch coordinates and supports panning and zoom. Missing/failed Google script loading falls back to the local map; an authorization failure reports that the local map is shown instead. The assigned branch list remains available in either mode.

For Codex cloud testing with Google Maps enabled, the environment settings must supply `GOOGLE_MAPS_BROWSER_KEY` securely and allow required Google Maps destinations (`maps.googleapis.com`, `maps.gstatic.com`; Google subresource domains as needed). An injected generic Google application credential is not a Maps JavaScript browser key. Keep the demo bound to loopback; enabling maps does not change the demo authentication/deployment boundary.
