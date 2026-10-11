# Technician application

A PowerVision Systems Pvt Ltd branded responsive technician web app is available at the `/technician/` path on the same running AMC server. The dashboard has a **Technician app ↗** link. It uses the shared database, assignments, FSR validation, client review and HO overview rather than a disconnected mock screen.

## Start and use it

1. Start the project with `START-AMC.bat`, `bash start-amc.sh` or `node scripts/start.mjs`.
2. Open your normal dashboard, then select **Technician app ↗**. Alternatively, append `/technician/` to the address you are already using in your browser.
3. Select **Open technician demo**. This is explicitly labelled demo access; there is no production password authentication.
4. On **Home** view assigned/performed/remaining totals and upcoming visits. **Visits** allows month/search/status filtering; **Reports** shows submitted reports and client decisions.
5. Open an assigned visit, verify the branch and asset, and select **Start visit & complete FSR**. The server records an immutable first-start timestamp. Pressing Start again does not create another start event.
6. Complete the FSR one section at a time. **Next** validates the current section and saves the draft. **Save draft** allows partial work. **Save & exit** saves before returning to assignments. Saved drafts survive browser/server restarts.
7. Add before/after/stamped-FSR images using the camera/gallery control. Supported file types are JPEG, PNG and WebP, up to 2 MB each. The camera-picker behavior depends on the actual device/browser and was not tested on a physical Android phone.
8. On **Review & submit**, check readings and photos, then submit. The API enforces all applicable mandatory fields again. A submitted report is read-only until a client rejects it and requests corrections.
9. In the company/client dashboard, select the matching branch reviewer to acknowledge or reject. The technician sees that response in Reports (list checks every 30 seconds or on reload); PowerVision and UBL head-office overviews check new submissions every 15 seconds. Both offices can open the same complete FSR in Reports, including all fields and photos.

The technician app has its own scoped demo-session cookie. Opening it does not change the active HO/client demo identity in another dashboard tab. The current demo includes one technician account assigned to the 12 synthetic assets. Actual technician provisioning and assignment management remain future work.

## Draft and workflow behavior

- Drafts are stored in the server's `technician_drafts` table, not browser local storage or the service-worker cache. They contain only editable FSR fields and evidence.
- Draft access and writes require the assigned technician, a started visit, and an editable visit state. HO, branch users and unrelated technicians cannot use the draft endpoints.
- Every save includes a revision number. A stale save from another window is rejected rather than overwriting a newer draft. Reopen the visit to load the latest saved copy; first preserve any unsaved edits you need to keep.
- Saving a draft or starting a visit does **not** increase the performed count. Only successful FSR submission does.
- Submission atomically stores the immutable FSR revision, clears its draft and records the action. Photos/fields in a partially completed draft cannot bypass required submission checks.
- If a save fails, the screen displays the error and retains the in-memory form; it does not report the draft as saved. Saving requires a connection to the server. Save before closing the page.
- Corrected reports reuse the same assigned visit and FSR reference; prior submitted revisions remain in history. The first visit-start timestamp is retained. The existing general dashboard FSR form remains compatible; reports submitted there without an explicit start have no measured start timestamp.

## Installable web app and boundaries

The technician interface includes a web app manifest, 192/512 icons, standalone display configuration and a service worker limited to public shell files. Where the browser offers installation, use its **Install app** action; an **Install technician app** button also appears in Account when that browser supplies an installation prompt. Installation was not validated on a physical Android device.

This is a **mobile-ready web app, not a native Android APK**. The service worker does not cache sessions, visit APIs, FSRs or photographs. It can recover public shell files when the network fails, but it does not provide offline visit data, offline draft storage or background FSR synchronization. The interface explicitly reports unsaved offline changes.

The existing server is restricted to loopback for the demo. Starting it on your Windows computer does not make it reachable from your phone. Actual phone use with shared assignments requires an approved hosted HTTPS backend and production individual-account authentication. Do not expose the demo via a tunnel or relax its bind restriction as a shortcut. Secure native Android delivery, encrypted offline storage/sync, GPS consent and production login remain documented milestones.

## API and data additions

Technician app requests are under `/api/technician/` and use an `amc_technician_session` HttpOnly/SameSite cookie scoped to `/api/technician`. They share the same business rules with existing dashboard APIs.

| Method | Technician path | Purpose |
|---|---|---|
| POST | /api/technician/session | Select synthetic technician identity only |
| DELETE | /api/technician/session | Sign out of technician app without signing out HO |
| GET | /api/technician/me | Current technician |
| GET | /api/technician/visits?summary=1 | Lightweight assigned-visit list |
| GET | /api/technician/assets | Assigned asset details |
| GET | /api/technician/fields | Shared mandatory FSR dictionary |
| GET | /api/technician/visits/:id | Full authorized visit/report |
| GET | /api/technician/visits/:id/report | Complete report, technician identity, company/client, submitted revisions and activity |
| POST | /api/technician/visits/:id/start | Idempotent first visit-start timestamp |
| GET | /api/technician/visits/:id/draft | Latest technician's saved draft, or null |
| POST | /api/technician/visits/:id/draft | `{ "values": { "visitPurpose": "AMC" }, "revision": 0 }` |
| POST | /api/technician/visits/:id/submit | Complete FSR; all validation enforced |

The new table is created additively at server startup; existing assets, visits and evidence are preserved. Back up/preserve the whole `data` folder with the app stopped when upgrading from a GitHub ZIP.

## Verified

Automated tests cover ownership, idempotent visit start, partial draft validation, persistence across database restarts, revision conflict detection, mandatory submission checks, atomic draft cleanup, isolated app/HO sessions and technician finance/review denial. Browser validation at a 390px mobile viewport exercised all 10 editable form sections, photo uploads, save/exit/resume, submission reaching HO, and branch acknowledgement returning to the technician. App shell registration and API cache exclusion passed with no JavaScript errors. Physical phone installation, live camera capture, native APK and offline synchronization were not tested or delivered.
