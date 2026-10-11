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

Start with the selector labelled **Demo workspace** at the top of the screen:

- **HO Operations:** see all demo assets, visit progress, audit history and payment reconciliation.
- **Assigned Technician:** complete an assigned visit's Field Service Report (FSR), including technical readings and three images.
- **Branch 0001 Reviewer:** review the warranty visit for branch 0001.
- **Branch 0005 Reviewer (OOW):** review the out-of-warranty visit for branch 0005.
- **Vendor Management:** see that vendor's visits and payment statement.

The cloud instance contains one completed example at branch 0005. The download starts with fresh synthetic records, so that you can try the entire process yourself.

## Try a complete example

1. Select **Assigned Technician**, then **AMC visits**.
2. Find branch **0005 / GEN-0005** and select **Complete FSR**.
3. Fill in all applicable fields. These are fake records, so use example readings; the current running-hours value must be at least **1,000**. For an issue or repair that did not occur, write **None**. If you choose a complaint logged on Here4you, also enter a fake complaint reference. If the radiator condition is Average or Bad, fill in the corresponding explanation.
4. Attach three JPEG, PNG or WebP images: before work, after work, and the stamped FSR. Each image must be at most 2 MB. For this demo use sample pictures containing no personal or bank information.
5. Submit the FSR. It is now waiting for branch review.
6. Select **Branch 0005 Reviewer (OOW)**. Open the visit and choose **Acknowledge**. To reject instead, enter a reason and choose **Unacknowledge**.
7. Select **HO Operations**, then **Reconciliation**. An acknowledged branch 0005 visit contributes **PKR 3,500**. A pending or rejected visit contributes **PKR 0**.
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
