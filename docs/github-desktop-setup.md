# GitHub Desktop — free setup, baar baar ZIP download nahi

GitHub Desktop app aapke Windows laptop par project ka ek connected folder banati hai. Uske baad GitHub se latest changes **Pull** karke isi folder mein aa jati hain. Yeh local setup hai: app isi laptop ke browser mein chalegi aur accounts/reports/photos isi laptop par save honge. Koi hosting plan ya payment nahi chahiye.

## Pehli dafa setup

1. [Official GitHub Desktop download](https://desktop.github.com/download/) kholein, **Download for Windows** karein aur downloaded installer run karein.
2. GitHub Desktop kholein aur **Sign in to GitHub.com** karein. Browser mein apne us GitHub account se authorize karein jisko `millitatechsolutions/AMC-APP` ki access hai. Password/token chat mein dene ki zaroorat nahi.
3. GitHub Desktop mein **File → Clone repository → URL** kholein. URL mein yeh paste karein:

   ```text
   https://github.com/millitatechsolutions/AMC-APP.git
   ```

4. **Local path** mein ek naya, khali location choose karein, jaise `Documents\GitHub\AMC-APP`, aur **Clone** click karein. Purane downloaded ZIP folder ko clone destination na banayein. **Current branch** `main` honi chahiye.
5. **Repository → Show in Explorer** se cloned project folder kholein. App start karne se pehle neeche purane data ka step karein agar pehle se records hain.
6. Cloned folder mein **START-AMC.bat** double-click karein. Node.js 24 ya newer installed hona chahiye; agar pehle install kar chuki hain to dobara install nahi karna.
7. **The AMC demo is running** ka wait karein. Terminal mein jo local address/port diya ho usay isi laptop ke browser mein kholein. App use karte waqt terminal khula rakhein. Existing data copy kiya ho to apne purane account se login karein; bilkul nayi installation ho to PowerVision owner account banayein.

GitHub Desktop apna Git saath install karta hai; is workflow ke liye alag Git command-line installation ki zaroorat nahi.

## Purane accounts, FSRs aur photos rakhna — sirf ek dafa

1. Purani app ke terminal mein **Ctrl+C** press karein aur app band hone ka wait karein. Clone ki app abhi start na karein.
2. Purane working project folder ko backup ke taur par rehne dein. Uske andar ka **poora `data` folder** copy karke naye cloned project ke andar paste karein. Accounts, FSR images, drafts, service records aur inventory isi database mein hain. Sirf `amc.sqlite` ko chalti app se alag copy na karein; poora folder app band karke copy karein.
3. Agar purane folder mein **`.env`** file hai to usay bhi naye cloned project mein copy karein. Purana source code ya `node_modules` copy na karein.
4. Naye clone mein agar pehle se data/reports ban chuke hain to overwrite na karein. Dono databases ko replace/merge karne se pehle help lein. Pehle se setup dikhna chahiye tha lekin owner setup aa raha ho to naya owner banane ke bajaye data-folder location check karein.

`data/` aur `.env` Git se ignored hain. Normal source updates inhein GitHub par upload nahi kartin aur tracked code ke saath replace nahi kartin. Phir bhi apne records ka backup rakhein.

## Har agla update

1. App mein apna draft save karein. App wale terminal mein **Ctrl+C** se server stop karein.
2. GitHub Desktop mein **AMC-APP** repository aur **main** branch select karein. **Fetch origin** click karein. Jab naye commits milen to **Pull origin** click karein. Agar **Fetch origin** hi dikhe aur koi new commit na ho, local project latest hai.
3. **Repository → Show in Explorer** kholein, isi cloned folder ka **START-AMC.bat** dobara run karein aur ready message ka wait karein. Starter dependencies aur checks khud chalata hai.
4. Browser refresh karein. Purani screen reh jaye to **Ctrl+F5** karein. Terminal agar doosra port dikhaye to usi naye port ko kholein.

Bas: **Save → Stop → Fetch/Pull → Start → Refresh**. ZIP download, folder change ya data dobara copy nahi karna.

## Agar koi masla aaye

| Screen par kya aaye | Kya karein |
| --- | --- |
| Repository not found / access denied | Sahi GitHub account se sign in karein aur us account ki AMC-APP repository access check karein. |
| Folder is not empty | Naya clone path choose karein; purane project/data ko delete na karein. |
| Local changes / merge conflict | **Discard changes**, reset ya force update na karein. Screen/error share karein taake local work preserve ho. |
| Fetch ke baad bhi naya UI nahi | Pull complete, sahi cloned folder restart aur browser Ctrl+F5 check karein. |
| Purane reports/account missing | App stop karein aur purane `data` folder ki sahi clone location check karein. Database delete ya naya owner create na karein. |

[Registration aur portal access](portal-access.md) · [Technician FSR](technician-app.md)
