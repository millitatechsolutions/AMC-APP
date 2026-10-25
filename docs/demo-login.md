# Requested local accounts

Hosting is paused. These simple credentials are for local testing:

| Portal | Email | Password |
| --- | --- | --- |
| PowerVision Head Office | admin@powervision.test | 12345 |
| UBL Office | admin@ubl.test | 12345 |
| Technician | admin@technician.test | 12345 |

These are login identifiers, not real mailboxes. No emails are sent.

After updating, stop the app with **Ctrl+C**. Double-click **RESET-DEMO-USERS.bat** once, wait for completion, then run **START-AMC.bat** again. macOS/Linux: `node --env-file-if-exists=.env scripts/reset-demo-users.mjs --confirm-reset`.

The command backs up SQLite under `data/backups/`, removes current accounts/sessions/invitations and creates three active accounts. Reports, images, drafts, stock and historical audits remain. Only untouched visits are assigned to the new technician; started visits and old report authors stay unchanged.

GitHub contains code, not your ignored local database. Run this command on the computer whose users should be replaced. Normal startup never resets users. New registration/password changes still require 12–128 characters; only this explicit local command provisions the requested short password. Hosted execution is blocked.
