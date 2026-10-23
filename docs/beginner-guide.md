# Start here — no programming experience needed

This application has separate PowerVision Head Office, UBL Office and Technician sign-in pages. The first owner creates an account; all other accounts are registered by the appropriate administrator.

## Use a permanent online link

Recommended when you want to see updates without repeatedly downloading the project: follow [Ek online link — Render setup](online-hosting.md). Once hosted, bookmark the app's HTTPS link. GitHub updates deploy automatically; wait for Render to show **Live**, then refresh. You will not need Node.js or a running terminal on your laptop. Hosting with permanent data storage is paid; review the plan before creating it. The deployment files are prepared, but the owner must connect Render/GitHub and deploy before a live link exists.

## Run on your computer

1. Install **Node.js 24 or newer** from the official Node.js website. npm is included.
2. On [GitHub](https://github.com/millitatechsolutions/AMC-APP), choose **Code → Download ZIP**. Extract it and open the project folder. Do not run it inside the ZIP.
3. For an update, copy the old `data` folder and optional `.env` into the new extraction **before first start**, keeping the old folder as a backup.
4. Windows: double-click `START-AMC.bat`. macOS/Linux: run `bash start-amc.sh` from a terminal in that folder.
5. Wait for **The AMC demo is running**. Type the printed local address and port into your browser on that same computer. Keep the terminal open while using the app.
6. Select **Set up PowerVision**, then create your owner account. Follow [Registration aur portal access](portal-access.md) to register technicians and set up UBL access.
7. Stop the server with Ctrl+C in its terminal. Accounts and saved records remain available on the next start.

The same starter can be run with `node scripts/start.mjs`. It installs dependencies, runs validation/tests, selects a free port from 3000–3010, and checks health without resetting records. The Windows wrapper has not been tested on a physical Windows machine in this Linux environment.

## Try the full workflow

1. PowerVision owner: register a technician under **People & Technicians** and give them the activation link. They set their password and sign in to Technician.
2. PowerVision owner: invite the first UBL administrator. That administrator activates their account and registers the UBL branch reviewer for the branch to be tested.
3. Assign an untouched visit to the active technician in PowerVision's service visit register. Branch 0005 is an out-of-warranty example; branch 0001 is a warranty example.
4. Technician: start the assigned visit, complete the core sections, enter applicable paper FSR details, and upload completed paper/before/after images. Current running hours must not be below the saved 1,000-hour baseline. Use synthetic details for these demo assets.
5. Technician: select any actually consumed inventory items and quantities, compare the paper image at review and submit. Drafts can be saved and resumed.
6. UBL and PowerVision: open the same detailed report. Each can record a manual image-verification decision. The matching branch reviewer can acknowledge or request corrections.
7. PowerVision: check inventory movements and reconciliation. Acknowledged out-of-warranty example visits are payable at the stored PKR 3,500 rate; warranty visits remain PKR 0.
8. UBL Office: open **AMC Excel report**, choose the month and download the 69-column workbook. Its Data sources sheet explains where each column comes from.

Fresh data contains 12 synthetic UBL assets. Real branches and GPS coordinates have not been imported. Overview counts performed visits after FSR submission, and polls every 15 seconds. Satellite imagery needs internet; an explicitly labelled map fallback remains usable if it cannot load.

## Common problems

| What you see | What to do |
| --- | --- |
| Node is not recognized | Install Node.js 24 or newer, close the old terminal and try again. |
| Browser cannot connect | Keep the starter running and use the port printed there on the same computer. |
| No technician visits | Activate the technician account and assign an unstarted visit from PowerVision. Check the stored visit month. |
| Invitation expired | Ask the responsible administrator to reissue it. |
| Wrong portal / access restricted | Use the sign-in page for your registered account. A URL change does not grant another portal's permission. |
| Password forgotten | Ask your portal administrator for a reset link. |
| FSR cannot submit | Complete the fields identified by the form and provide valid images up to 2 MB each. |
| Submitted FSR cannot be edited | The matching branch must request a correction first. Acknowledged reports remain locked. |
| Setup stops with an error | Keep the error message and share it for troubleshooting; do not delete the database. |

## Cloud environment

The cloud setup runs a local service for development. Its local address belongs to that cloud machine; the onboarding screen does not provide a browser preview on your laptop. Use the [online hosting setup](online-hosting.md) for a permanent shared browser link, or the local steps above to run it on your computer. To retain the prepared cloud development setup, review/save environment settings and publish the environment. Publishing that development environment does not publish the application as a public website.

[Portal access](portal-access.md) · [Paper FSR](fsr-v02-and-ubl-reports.md) · [Inventory](inventory-management.md) · [Technician app](technician-app.md)
