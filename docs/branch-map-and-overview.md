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

## Satellite map and demo branch pins

Without a Google key, the interactive map uses **Esri World Imagery** satellite tiles through locally bundled Leaflet 1.9.4. The imagery is real satellite/aerial basemap imagery; the branch pins remain explicitly labelled synthetic demo locations. Panning, zooming and selectable branch markers use the same assigned branches and progress totals. Map attribution remains visible. A Google browser key selects Google hybrid imagery instead, with map-type controls.

Satellite imagery requires internet access to `server.arcgisonline.com`. If tiles fail or cannot load, the map switches to a clearly labelled local geographic fallback and keeps the assigned branch list usable. The fallback contains country outlines, not satellite imagery. In the current Codex cloud machine the imagery host returned a network-proxy denial, so real satellite tiles have **not** been validated here. The host is included in the proposed environment settings; review/save those settings and publish to retain the setup. Saving a draft alone does not change the current network policy.

Green pins represent branches where all selected FSRs have been submitted; amber pins represent branches with visits remaining. Select a pin or branch name to see totals and open its visits. Nearby demo pins in the local fallback are visually separated with leader lines so they remain selectable.

These are **not verified UBL branch locations**. Only synthetic assets whose serials follow `DEMO-ENGINE-*` receive illustrative city coordinates. Assets with supplied numeric coordinates retain them, and real assets without coordinates remain unmapped. There is no guessed geocoding of real banking data. Real branch location import/editing is a later feature.

`public/branch-map.geojson` contains Pakistan and neighboring country outlines derived from Natural Earth's 1:110m countries data. Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson . Natural Earth data is public domain: https://www.naturalearthdata.com/about/terms-of-use/ .

Leaflet is pinned to version 1.9.4, downloaded from the npm registry and checked against its published SHA512 integrity before vendoring. Its BSD-2-Clause license is retained at `public/vendor/leaflet/LICENSE`. The map does not download JavaScript from a third-party CDN.

## Optional live Google Maps

Google Maps integration is implemented, but a real Google Maps session was **not** validated because no Maps browser API key is configured. To enable it on your own computer:

1. In Google Cloud, create/select a project, enable billing and **Maps JavaScript API**, then create a browser API key. Google may charge for usage.
2. Restrict the key to **Maps JavaScript API** and your actual website HTTP referrers. For the local demo, permit only the loopback addresses/ports you use, for example `http://127.0.0.1:3000/*` (add the actual alternate port if needed).
3. Copy `.env.example` to `.env` in the extracted project folder. Set `GOOGLE_MAPS_BROWSER_KEY` locally. Optionally set `GOOGLE_MAPS_MAP_ID` to your map ID; the example map ID is used if omitted.
4. Restart using `START-AMC.bat`, `bash start-amc.sh` or `npm start`.

Do not send the key in chat or commit `.env`. Browser map keys are intentionally delivered to the browser, so referrer and API restrictions are essential; never use an unrestricted server credential as this key. Google Maps defaults to hybrid satellite imagery, displays the same assigned branch coordinates and supports panning, zoom and map-type selection. A Google load/authorization failure tries the keyless Esri satellite map; unavailable imagery ultimately falls back to the labelled geographic view. The assigned branch list remains available in either mode.

For Codex cloud testing with Google Maps enabled, the environment settings must supply `GOOGLE_MAPS_BROWSER_KEY` securely and allow required Google Maps destinations (`maps.googleapis.com`, `maps.gstatic.com`; Google subresource domains as needed). An injected generic Google application credential is not a Maps JavaScript browser key. Keep the demo bound to loopback; enabling maps does not change the demo authentication/deployment boundary.
