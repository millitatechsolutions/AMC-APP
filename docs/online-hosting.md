# Ek online link — har update ke liye ZIP download nahi

Render par ek dafa app host hone ke baad aap laptop ya phone ke browser mein wahi link khol sakti hain. GitHub ke `main` branch par changes push hone se Render naya version build/check karke deploy karega. Deploy **Live** hone par page refresh karein. Disk wali service deploy ke dauran thori der restart hoti hai; pehle draft save kar lein.

## Ek dafa karne wali setup

1. [Render par deploy setup kholein](https://render.com/deploy?repo=https://github.com/millitatechsolutions/AMC-APP) aur apne GitHub account se sign in/connect karein. Agar repository private ho to sirf **AMC-APP** ke liye access dein.
2. Blueprint mein `millitatechsolutions/AMC-APP`, branch **main** aur `render.yaml` select/review karein. Agar direct link repository select na karwaye to Render dashboard mein **New → Blueprint** se wahi repository connect karein.
3. **Create/Deploy se pehle cost dekhein.** Is configuration mein **Starter web service aur 1 GB persistent disk** hai, jo paid resources hain. Current total Render ki review screen par check karein; is repository mein koi payment, account ya service create nahi ki gayi. Free/temporary storage mein FSR data rakhne se redeploy par data khatam ho sakta hai.
4. Plan manzoor ho to Render par Blueprint create karein. Build/check/test complete hone aur service **Live** hone ka wait karein. Service page par jo `https://…onrender.com` address mile, usay bookmark karein.
5. Sirf pehli dafa: service ke **Environment** section mein generated **AMC_SETUP_KEY** dekhein/copy karein. Usay chat, GitHub ya kisi technician ko na dein. Apne app link ke aakhir mein `/setup` kholein; **Setup key** ke saath apna owner name, email, employee ID aur naya password enter karein. Yeh key owner setup tak mehdood hai; rozana login ke liye apna password use hoga.
6. PowerVision se technicians aur pehla UBL administrator register/invite karein. Technician ko visit assign karein. Har shakhs usi online link par apne portal mein sign in karega.

**Already saved local data:** laptop/cloud ki local database automatically Render par upload nahi hoti. Agar us mein reports/accounts preserve karne hain to pehla online owner banane se **pehle** existing database ki coordinated migration karni hogi. Nayi aur purani databases ko overwrite/merge na karein.

[Pehli online owner setup screen dekhein](screenshots/online-owner-setup-mobile.png) — screenshot mein fields khali hain; koi private key ya password nahi hai.

## Rozana changes kaise dekhein

1. Main project ki changes GitHub par push karunga.
2. Render apne aap build aur tests chalayega. Successful build ke baad service update hogi; failed build pichle successful version ko replace nahi karega.
3. Render par **Live** dikhne ke baad wahi bookmarked link refresh karein. ZIP download, Node.js install ya laptop ka terminal khula rakhna zaroori nahi.

PowerVision, UBL aur technician ke accounts/permissions alag rahenge. Company inventory sirf PowerVision ko milegi. Reports, photos, drafts, accounts aur inventory SQLite database mein attached disk par rahenge. Phone camera/file uploads ke liye HTTPS link use karein.

## Configuration reference

| Setting | Purpose |
| --- | --- |
| `NODE_VERSION=24` | Native SQLite-compatible Node runtime. |
| `AMC_HOSTED=1` | Explicit online mode; local installs retain their localhost defaults. |
| `AMC_TRUST_PROXY=1` | Permit the hosting proxy to report HTTPS. Use only behind the hosting provider's HTTPS proxy. |
| `AMC_DB_PATH=/var/data/amc.sqlite` | Database and uploaded images on the attached disk. Keep one service instance with this SQLite disk. |
| `AMC_SETUP_KEY` | Render generates a private key for claiming the first owner account. It is not returned by the status API. |
| `RENDER_EXTERNAL_HOSTNAME` | Render supplies the assigned public hostname automatically. |
| `AMC_PUBLIC_ORIGIN` | Optional exact `https://your-domain.example` origin when using your own domain. No path or wildcard. |

Build runs locked dependency installation, syntax checks and tests. Only the test subprocess uses localhost mode and isolated fixtures; runtime keeps hosted mode and uses `npm start` rather than the local-computer starter. Only the explicitly configured public host is accepted. Office sessions use Secure, HttpOnly cookies in hosted mode; write requests must come from the configured HTTPS origin. No public demo-login option is enabled.

The `/api/health` endpoint is a read-only health check and contains no private records. Health checks may use HTTP on an allowed host; portal pages, accounts and service APIs still require HTTPS.

The persistent disk survives normal builds/restarts; it is not an independent backup. Before using real service records, arrange verified database backups and a restore procedure. Do not copy a live SQLite file by itself: use a consistent SQLite backup or stop the app and preserve its database/WAL state. Removing the Render service/disk removes its stored data. Automatic database rollback/migration is not part of an application redeploy.

If Google Maps is configured later, restrict the browser key to the new online hostname. Default satellite maps use Esri and do not require a Google key.

## Current delivery status

This repository contains the deployment configuration and hosted-mode support. A Render account, billable resources, a live URL and external-host verification require the owner's Render connection and deployment. A local test or GitHub push alone does not make a public website live.
