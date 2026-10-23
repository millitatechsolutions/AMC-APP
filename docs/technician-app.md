# Technician application

The separate PowerVision technician web app uses registered accounts. PowerVision creates each technician under **People & Technicians**, provides a one-time activation link and assigns service visits after activation. The technician sets their password and signs in through the Technician landing page. There is no selectable demo identity or public role registration.

## Complete a visit

1. Sign in with the activated technician account. Only assigned visits appear; choose the stored assignment month when needed.
2. Confirm the client, branch and genset, then start the visit. The first-start timestamp is retained.
3. Use the section navigator to complete ten core service/evidence sections and thirteen optional paper-form sections. The dictionary has 225 fields, including every field in the supplied FSR V02 paper form.
4. Save a partial draft, save and exit, or continue with Next. Server drafts survive browser/server restarts and reject stale saves from a second window.
5. Select consumed tracked inventory items and quantities under **Issue / Job Management**. Paper spare-part text is a separate transcription and does not issue stock automatically.
6. Upload before/after photos and the completed signed/stamped paper FSR image. JPEG, PNG or WebP images are limited to 2 MB each. Optional signature crops use the same limit.
7. Compare the paper image against your entries at review. Enlarge/zoom/replace it when necessary, then submit.
8. Read the company/client manual comparison results and branch acknowledgment. If the matching branch requests a correction, update and resubmit; earlier snapshots and verification results remain available.

The client is UBL and the responsible company is taken from the service assignment. The technician cannot enter the PowerVision or UBL office portals with the technician account, manage office users or read the company stock ledger.

## Persistence and connectivity

Starting/saving a draft does not count as performed or deduct stock. Successful submission counts as performed and commits stock usage atomically. Corrections adjust only the quantity difference; manual review/rejection does not issue or return stock.

API paths remain `/api/technician/...`, with a separate portal-bound HttpOnly session cookie. Signout revokes the session. A missing/expired/disabled session returns the user to the technician sign-in page.

The service worker caches public static assets only. Private HTML, sessions, API responses, FSR values and photos are never cached. Offline FSR synchronization is not implemented; connectivity to the running server is required for visits, drafts and submission. Physical-phone camera/installation has not been validated in the Linux browser checks. This is a mobile web app, not a native APK.

[Account registration](portal-access.md) · [Paper FSR walkthrough](fsr-v02-and-ubl-reports.md)
