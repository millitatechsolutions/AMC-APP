# Start here — no programming experience needed

This project is a working demonstration of generator maintenance management. You can try the service-report, branch confirmation and payment process using made-up records. You do not need to create a database account, buy hosting or supply a password to run this demo.

## What has already been done in Codex

- The application files have been created in `/workspace/AMC-APP`.
- Node.js and npm are already available in this cloud machine.
- A local database has been created automatically with synthetic records.
- The application and workflow tests have been run.
- Installation and startup instructions are saved in the environment configuration draft.

To retain the cloud environment, review and save the draft in environment settings, then publish the environment. Publication saves the prepared environment; it does not publish the application as a public website. No public website or Android APK has been deployed. The project source repository is `millitatechsolutions/AMC-APP` on GitHub.

The onboarding screen does not support viewing the local application through a browser preview. Typing the cloud machine's local address into your laptop's browser will not open it. To view and try it yourself now, use the download and local-computer steps below.

## Run on your own computer

1. Install **Node.js version 24 LTS or newer** from the official Node.js website (`nodejs.org`). Use the installer for your Windows, macOS or Linux computer. npm is included with Node.js.
2. Open `https://github.com/millitatechsolutions/AMC-APP`, select **Code → Download ZIP**, and extract the download. Open the extracted project folder (usually `AMC-APP-main`). Do not run the app while it is still inside the zip. You can also use the supplied **AMC-APP-starter.zip** if available.
3. **Windows:** double-click `START-AMC.bat`. **macOS/Linux:** open a terminal in that folder and enter `bash start-amc.sh`.
4. Wait for the message **“The AMC demo is running”**. Keep the terminal window open.
5. In your browser's address bar, type `127.0.0.1:3000`. If the terminal reports a different port, use that number instead (for example, `127.0.0.1:3001`). This address works on the computer where you started the app.
6. When you finish, return to the terminal and press **Ctrl+C**. To use it again, repeat step 3. Your local demo records are kept.

Alternatively, from the extracted folder, one command performs installation, checks and startup:

```sh
node scripts/start.mjs
```

The starter checks Node.js, runs the existing validation/tests, and chooses a free local port between 3000 and 3010. It does not reset your database. The Windows and macOS/Linux starter files call the same script. The Windows wrapper is provided but has not been tested on Windows in this Linux environment.

## Explore the screens

The first screen now shows an assigned-branch map and three cards: **AMC**, **Warranty** and **Total**. Each card shows total, performed and remaining visits. Technician FSR submissions update these counts automatically within 15 seconds; use **Refresh now** for an immediate check. Select a branch pin to view its progress. Locations are illustrative demo locations. The satellite map uses Esri imagery without a Google key and requires internet. If imagery cannot load, a clearly labelled geographic fallback appears; [optional Google Maps connection instructions](branch-map-and-overview.md) explain how to use Google Maps later.

Start with the selector labelled **Demo workspace** at the top of the screen:

- **PowerVision Head Office:** see all demo assets, visit progress, audit history and payment reconciliation.
- **UBL Head Office:** see UBL branch progress and complete submitted FSR reports; this workspace is read-only.
- **Assigned Technician:** complete an assigned visit's Field Service Report (FSR), including technical readings and three images.
- **UBL Branch 0001 Reviewer:** review the warranty visit for branch 0001.
- **UBL Branch 0005 Reviewer (AMC):** review the out-of-warranty visit for branch 0005.
- **PowerVision Management:** see that vendor's visits and payment statement.

Both PowerVision workspaces also have **Inventory**. Add your stock items or receive stock there. In the technician FSR's **Issue / Job Management** step, choose used materials and enter quantities. Submitting deducts stock and stores the material record; saving a draft does not. UBL and PowerVision see those material details in the report. [Inventory walkthrough](inventory-management.md).

The cloud instance may contain previously submitted demo examples at branch 0005. The download starts with fresh synthetic records, so that you can try the entire process yourself.

## Try a complete example

1. Select **Assigned Technician**, then **AMC visits**.
2. Find branch **0005 / GEN-0005** and select **Complete FSR**.
3. Fill in all applicable fields. These are fake records, so use example readings; the current running-hours value must be at least **1,000**. For an issue or repair that did not occur, write **None**. If you choose a complaint logged on Here4you, also enter a fake complaint reference. If the radiator condition is Average or Bad, fill in the corresponding explanation.
4. Attach three JPEG, PNG or WebP images: before work, after work, and the stamped FSR. Each image must be at most 2 MB. For this demo use sample pictures containing no personal or bank information.
5. Submit the FSR. It is now waiting for branch review.
6. Select **UBL Branch 0005 Reviewer (AMC)**. Open the visit and choose **Acknowledge**. To reject instead, enter a reason and choose **Unacknowledge**.
7. Select **PowerVision Head Office**, then **Reconciliation**. An acknowledged branch 0005 visit contributes **PKR 3,500**. A pending or rejected visit contributes **PKR 0**.
8. Use **Export full month CSV** to download the statement. CSV opens in Excel or another spreadsheet app.

You can also acknowledge a warranty visit at branch 0001: it still contributes **PKR 0**.

## Common problems

| What you see | What to do |
|---|---|
| “node is not recognized” or “Install Node.js” | Install Node.js 24 or newer, close the terminal, and open it again. |
| Setup stops with an error | Keep the error message and share it in this chat; do not delete project files. |
| Browser says it cannot connect | Check that the terminal is still running, and use the port printed there. |
| The app opens but no visits appear | Clear search/region/warranty/status filters. If the month changed since first startup, select the month when the records were created. |
| Upload fails | Use JPEG, PNG or WebP; keep each image at or below 2 MB. |
| An FSR cannot be submitted | The form/API explains the missing value. Complete all applicable fields, including conditional explanations. |
| You cannot submit a visit again | A submitted record needs branch review. Only rejected records can be corrected and resubmitted. Acknowledged records are locked in this demo. |

## What the folders mean

- `public`: the screens shown in your browser.
- `src`: the application server and business rules.
- `tests`: automated checks of the workflow.
- `docs`: requirements and instructions.
- `scripts`: setup and startup helpers.
- `data`: your local demo database, created automatically. Do not delete or upload it.

Keep this version for learning and demonstrations. Real user accounts, Android applications, offline use and bank-approved deployment are listed in `docs/requirements-analysis.md` as later milestones.

## Get this update if you already downloaded an older version

1. Stop the old app using Ctrl+C in its terminal window. Close all AMC terminal windows before copying database files.
2. On GitHub, use Code → Download ZIP again, and extract the new version into a separate folder. Keep your old project folder as a backup.
3. Before starting the new version for the first time, copy the entire `data` folder from your old project into the newly extracted project folder. This preserves your local demo visits and photos. If the new folder already has a `data` folder, keep both versions safely instead of overwriting either database; ask for help transferring records.
4. If you already configured Google Maps, copy your local `.env` file separately into the new project folder; never upload it to GitHub.
5. Double-click START-AMC.bat (Windows) or run bash start-amc.sh (macOS/Linux), then reload the browser.

Node.js does not need to be installed again if version 24 or newer is already installed.

## Try the dedicated technician app

After upgrading and restarting the app, click **Technician app ↗** at the top of the dashboard. It opens in a new tab. Click **Open technician demo**, then **Visits**. Open a branch, start the visit, and follow the FSR sections using **Next**. Use **Save draft** or **Save & exit** to continue later. Once submitted, the same report appears in the client/company dashboard. Opening the technician tab keeps your dashboard's client/HO account separate.

You can try the phone-style layout on your computer. Actual phone access is not available from your computer's local-only demo server. This version has no Android APK; [the technician guide](technician-app.md) explains the delivered web app and remaining phone deployment steps.

## Open complete FSR reports in both offices

Select **PowerVision Head Office** or **UBL Head Office**, then **Reports**. Open a submitted FSR to see all technical fields, before/after/stamped-FSR photos, technician details, timestamps, branch decision and saved revisions. **Print report** opens the browser print dialog. Both workspaces use the same technician submission. [Detailed report guide](shared-fsr-reports.md).
