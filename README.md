# leadbot — restaurants (aur dusre businesses) ke leads + outreach

Ye bot khud leads dhoondta hai, unki website se email, Instagram aur WhatsApp nikalta hai, har ek ke liye personalized message likhta hai, aur:
- **Email:** khud bhejta hai (Gmail se, din ki limit ke saath)
- **WhatsApp:** dashboard pe har lead ka **"Open in WhatsApp"** button. Click karo, message pehle se likha hoga, tum sirf **Send** dabao.

WhatsApp jaan boojh ke automatic nahi. Unknown numbers ko bulk automatic messages bhejne se tumhara number ban ho sakta hai. Ek click + send safe hai aur zyada personal lagta hai.

## Keys / cheezein jo chahiye

| Kya | Zaroori? | Kahan se | Kharcha |
|---|---|---|---|
| Gemini API key | Haan (warna simple template use hoga) | aistudio.google.com → Get API key. WhatsApp bot wali hi key chalegi | Free tier |
| Gmail App Password | Sirf email ke liye | Neeche steps | Free |
| Demo video link | Bohot behtar | WhatsApp bot ka 1-minute screen recording → YouTube (Unlisted) | Free |
| Google Places API key | Optional | console.cloud.google.com → Places API (New) | Billing account chahiye, monthly free allowance ke andar free |

### Gmail App Password (5 minute)
1. Ek **alag Gmail** banao outreach ke liye (apni main email ki reputation bachao), jaise `hassan.whatsappbots@gmail.com`
2. Google Account → Security → **2-Step Verification ON**
3. Google Account → search "**App passwords**" → naam "leadbot" → 16-letter password copy karo
4. `.env` mein `SMTP_USER` = woh Gmail, `SMTP_PASS` = woh 16-letter password (spaces hata do)

> Gmail se roz 20–30 se zyada cold emails mat bhejo. Default limit 25/day hai aur har email ke beech 45 second ka gap hai, taake account spam mein flag na ho.

## Leads kahan se aate hain
- **Default: OpenStreetMap.** Bilkul free, koi key nahi. Lekin Pakistan mein har restaurant ka number OSM pe nahi hota. Bot website se number/email nikalne ki koshish karta hai.
- **Behtar: Google Places.** Number, rating aur reviews ke saath bohot zyada leads. Key ho to bot khud use karega.
- **Instagram:** Bohot se restaurants ki website hi unka Instagram hai. Bot link dikha deta hai, wahan bio mein aksar WhatsApp number hota hai.

## Chalana

**Local / pehli dafa:**
```bash
npm install
cp .env.example .env && nano .env
npm run find -- --city Lahore --kind restaurants --area "Johar Town"
npm run email                 # DRY RUN: sirf dikhata hai kya jayega
npm run email -- --send       # asli bhejta hai
npm start                     # dashboard http://localhost:3200
```
`--kind` mein ye bhi chal sakte hain: `cafes`, `clinics`, `salons`, `shops`.

**VPS pe:**
```bash
cp .env.example .env && nano .env
docker compose up -d --build
docker compose exec leads node --no-warnings scripts/find.js --city Lahore --area "Johar Town"
```
Dashboard se bhi "Find + draft" aur "Send queued emails" chal jate hain.

Dashboard kholna: `ssh -L 3200:localhost:3200 root@VPS_IP` → `http://localhost:3200`. Phone se kholna ho to tradebot README wala Caddy tareeqa use karo (`leads.yourdomain.com` → port 3200).

## Roz ka routine (30–45 min)
1. Dashboard → **new** leads → 10–15 ko "Open in WhatsApp" → Send
2. Jo reply kare → status **replied** / **interested**, notes mein likho kya kaha
3. Interested ko demo video bhejo → **demo**
4. Haan kare → **won** 🎉 → WhatsApp bot mein unki JSON file banao
5. "Send queued emails" (din mein ek dafa)

Koi kahe "dobara message mat karna" → status **skip** (email wale ke liye **Opt-out** button).

## Files
```
src/sources/osm.js     OpenStreetMap (free)
src/sources/places.js  Google Places (optional)
src/enrich.js          website se email / Instagram / WhatsApp
src/drafts.js          Gemini personalized messages + template fallback
src/mailer.js          Gmail sender: dry-run, daily limit, delay, opt-out
src/server.js          dashboard (pipeline statuses, WhatsApp buttons)
scripts/               find, draft, email
```
