# Requested local accounts

Hosting is paused. These simple credentials are for local testing:

| Portal | Email | Password |
| --- | --- | --- |
| PowerVision Head Office | admin@gmail.com | pak1234 |
| UBL Office | admin@gmail.com | pak1234 |
| Technician | admin@gmail.com | pak1234 |

The same email is supported independently in each portal. No automatic emails are sent. Choose the portal you intend to use.

## Apply the new defaults to all three portals

Stop the app with **Ctrl+C**, update to the latest project, then double-click **SET-DEFAULT-LOGINS.bat**. Wait until all three login checks pass, and run **START-AMC.bat** from this same folder again. This command backs up the database and updates the known default accounts in place, preserving account IDs, technician assignments and saved records. Run it once on each local database you want to update. Existing sessions for these defaults are revoked.

macOS/Linux: `node --env-file-if-exists=.env scripts/reset-demo-users.mjs --confirm-reset --defaults`.

## UBL / technician incorrect password

Pull the latest changes, stop the app terminal with **Ctrl+C**, then run **RESET-UBL-TECHNICIAN.bat**. Wait for both login checks to pass and start **START-AMC.bat** again from this same folder. Use `admin@gmail.com` on the **UBL** sign-in page and `admin@gmail.com` on the **Technician** sign-in page, both with `pak1234`. Enter the email exactly as **admin@gmail.com**.

This targeted repair creates either account if missing or resets it in place if present. It preserves PowerVision credentials/sessions, other users, existing technician IDs/assignments, drafts, reports and inventory. Previous UBL/technician sessions and invitation/reset links for these two IDs are revoked. It also clears failed-login counters and makes a database backup. Missing new technicians still need visit assignments from PowerVision.

macOS/Linux: `node --env-file-if-exists=.env scripts/reset-demo-users.mjs --confirm-reset --ubl-technician`.

## Replace all three accounts

After updating, stop the app with **Ctrl+C**. Double-click **RESET-DEMO-USERS.bat** once, wait for completion, then run **START-AMC.bat** again. macOS/Linux: `node --env-file-if-exists=.env scripts/reset-demo-users.mjs --confirm-reset`.

The command backs up SQLite under `data/backups/`, removes current accounts/sessions/invitations and creates three active accounts. Reports, images, drafts, stock and historical audits remain. Only untouched visits are assigned to the new technician; started visits and old report authors stay unchanged.

GitHub contains code, not your ignored local database. Run this command on the computer whose users should be replaced. Normal startup never resets users. New registration/password changes still require 12–128 characters; only this explicit local command provisions the requested short password. Hosted execution is blocked.
