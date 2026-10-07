# Dhaivakrupa Ujjeevakeerthanalu – Telugu Christian Songs

The site menus, buttons and messages are in English. Song lyrics, categories and the Bible text stay in Telugu (the Bible has a Telugu / English / Both switch).

## Deploy
1. Push this folder to a GitHub repo (branch `main`).
2. Netlify → Add new site → Import from Git. Build command `node build.js`, publish dir `dist` (already in netlify.toml).
3. Site settings → Identity → Enable Identity. Registration: Invite only. Services → Git Gateway → Enable.
4. Identity → Invite users (your email). Accept the invite email.
5. Open `https://YOUR-SITE.netlify.app/admin/` and log in.
6. In `admin/config.yml` replace `YOUR-SITE` with your real Netlify URL.

## Adding songs
Admin → Songs → New Song. Type/paste lyrics in the Text box, upload a Photo of the song, or both.
Each save commits to Git and Netlify rebuilds in about a minute.

## Site settings
Admin → Site Settings → General Settings: name, tagline, logo, verse, colours, contact links, footer.

## Local testing
`npx decap-server` in one terminal, `node build.js && npx serve dist` in another, then open /admin/.

## Upload songs via XML
Admin → Songs → New Song → **XML file upload**. Use the format in `sample-songs.xml` (one or many `<song>` blocks with title, title_en, category, writer, scale, lyrics, youtube). Every song in the file is added to the site on the next build. Save the entry with a category and it is used for songs that don't specify one.

## Notifications, recently viewed, categories
- 🔔 in the top bar lists songs added in the last 7 days (by each song's Date in the admin); a red badge counts the ones not yet seen.
- Below the song index, the home screen shows the last 5 songs the visitor opened (kept on their device).
- The song index has **By letter / By category** views. Admin → **Categories** lets you add, rename, reorder categories; pick them in each song's Category field. XML-uploaded songs with a new category name are added automatically.

## Song order
Songs are shown in Telugu alphabetical order, grouped by first letter, with a letter jump bar.

## Bible
Telugu and English (KJV) Bible text lives in `bible/` (one JSON file per book, loaded on demand and cached for offline reading). Source: aruljohn/Bible-telugu and aruljohn/Bible-kjv (MIT licence code; please confirm the Telugu translation's copyright status for your use).

## Install as an app
Open the site on a phone and choose "Add to Home Screen".

## Projector mode
Open any song or Bible chapter and tap **Projector**. Each verse/stanza becomes a full-screen slide with auto-fitting large text.
Keys: → / Space next, ← back, B blank screen, F full screen, + / − text size, Esc close. Touch: swipe or tap left/right. In the Bible, tap verses first to project only the selected ones.

## Remote control (phone controls the projector)
Uses a Netlify Function (`netlify/functions/remote.mjs`) + Netlify Blobs; no extra setup after deploy (`npm install` runs automatically).
1. On the projector device open a song → **📽 Projector** → tap **📱**. A 6-digit code and link appear.
2. On your phone open the link (or About → రిమోట్ కంట్రోల్ and enter the code).
3. Phone buttons: previous/next, blank, colour theme, background, text size, and tap any slide in the list to jump.
The code is kept, so the phone stays connected when you start the next song. Rooms expire after 6 hours of inactivity. Remote needs the deployed site (or `netlify dev`) — it won't work with a plain static server.

## Presentation backgrounds
Admin → Site Settings → **Presentation backgrounds** (add images, and set the darkness slider for readable text). A single song can override with its own **Presentation background**. In the projector, tap 🖼 to cycle through backgrounds, or choose "My image…" at the end of the cycle to use a picture from the device.

## This meeting (schedule)
Tab **Meeting**: name the meeting, add songs with ＋ (on any song row or in the picker on that page), reorder with ▲▼, remove with ✕. **📽 Present** projects the whole list in order (▶ on a row starts from that song). **🔗 Share** gives a link that loads the same list on another device. The list is saved on the device.

### Control from another phone
On the meeting page tap **📱 రిమోట్** → open the link on a phone. The phone shows the meeting's songs: tap a song and the presentation starts on the projector device. While presenting, the phone has next/previous slide, next/previous song, blank, theme, background and text size. Keep the projector device's page open. Turn remote off with "ఆపండి" when finished.

### Phone remote tabs
- **ప్రదర్శన** – current slide, next/previous slide, song or chapter, blank, theme, background, text size, and the slide/verse list.
- **సమావేశం** – the scheduled songs (from the projector device). Tap a song to start from it; ✕ removes it.
- **పాటలు** – every song with search and a Telugu alphabet strip (tap a letter to see only songs starting with it). Tap a song to project it; ＋ adds it to the meeting list.
- **బైబిల్** – choose language, Old/New Testament, book, then chapter; the verses are projected one per slide, with previous/next chapter buttons.

## Schedule songs (site + admin, always in sync)
- **On the site:** tap ＋ on any song (or use the Meeting tab). The change is sent to the server automatically, with no passcode.
- **In the admin:** open **"Schedule / షెడ్యూల్"** (header link, the 📋 button at the bottom-right of `/admin/`, or `/admin/schedule.html`). Search songs, tap ＋, reorder with ▲▼, remove with ✕, name the meeting. Every change saves automatically.
- Both sides follow each other live, without refreshing: changes appear on other devices within about 4 seconds, and in the admin within about 2 seconds (poll times are the `4000` in `index.html` and `2000` in `admin/schedule.html`; larger numbers use fewer Netlify function calls).
- **Realtime site (no refresh):** songs, colours, fonts and logo changed in the admin appear by themselves a moment after Netlify finishes its rebuild (checked every 15 s and when the app is reopened). Settings apply instantly in place; the screen is redrawn only when safe, never while presenting, on the preview/remote pages, or while typing. Songs are re-checked right before every presentation starts.
- **Meeting name:** shared the same way. Clearing songs keeps the name (admin: tick/untick "Keep the meeting name when clearing songs").
- If two people change the list at the same moment, the last save wins.
- Note: because there is no passcode, anyone who opens the site can change the shared schedule. `MEETING_PASSCODE` is no longer used.

## Custom fonts (Telugu and English)
Admin → Site Settings → General Settings → **Telugu font / English font**.
- Pick a Google font from each list (Telugu letters use the Telugu font; English letters and numbers use the English font), or
- Upload your own font file (.woff2, .woff, .ttf or .otf) in "upload your own". An uploaded file overrides the dropdown.
- Leave both on Default to keep the original look. Fonts apply everywhere: songs, Bible, menus and the projector. Google fonts are cached for offline use after the first load.
- Please make sure you have the licence to use any font file you upload.

## Recently viewed Bible chapters / verses
The Bible tab shows the last 10 chapters opened (with the verse number if a verse was tapped) below the book list. The phone remote's **Bible** tab shows the same list; tap one to project it. Stored on each device.

## Verse of the day at 8:00 AM (push notification)
Every day the 🔔 page shows one verse (chosen from the list in `daily-verses.json`; edit that file to add or remove verses: `[book number, chapter, verse]`). Visitors can tap **Send me a verse every day at 8 AM** to get it as a notification.

One-time server setup (needed for real push notifications that arrive even when the app is closed):
1. Run `npx web-push generate-vapid-keys` on your computer.
2. Netlify → Site settings → Environment variables, add: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` (for example `mailto:you@example.com`).
3. Redeploy. The scheduled function `netlify/functions/daily-verse.mjs` runs every 30 minutes and sends each subscriber their verse at 8:00 AM in their own time zone (India = 8:00 AM IST), once per day. Scheduled functions run only on the published (production) deploy.

Without these keys, the button still works in a simpler mode: the notification appears when the visitor opens the app after 8 AM. On iPhone, push works only after "Add to Home Screen" (iOS 16.4+).

In the Bible tab, a recently viewed entry that has a verse number now opens the chapter scrolled to (and highlighting) that verse.

## Favicon
Admin → Site Settings → General Settings → **Favicon image**: upload a square PNG/SVG/ICO/JPG (at least 192×192 px recommended). It appears in the browser tab and as the iPhone home-screen icon. If no image is uploaded, the **Favicon emoji** is used. Visitors see the change after the site rebuilds (about a minute after saving).

## Tenglish search (search Telugu songs in English letters)
Every song search (home, Meeting picker, phone remote) understands English-letter spellings of Telugu words: `yesu`, `yesayya`, `devudu`, `keerthana`, `stuthi`, `prabhuvu`, `jeevam` all find the matching Telugu songs. Spellings are matched by sound (long/short vowels, th/t, dh/d, w/v, doubled letters are treated alike), several words can be typed (`yesu raju`), and titles are listed before lyrics matches. Telugu typing and English titles keep working as before. Home search covers title, writer and lyrics; the Meeting picker and remote search title and writer.

## Custom web-app icon
Admin → Site Settings → General Settings:
- **App icon**: a square PNG, 512×512 or larger (logo centred). Used as the installed-app / home-screen icon (Android, iPhone, desktop) and in notifications.
- **App icon – maskable version** (optional): a full-square version for Android's round/rounded icons; fill the whole square with your background colour and keep the logo inside the centre 60%. If empty, the App icon is used.
- **App name under the icon**: optional short name; empty uses the Telugu site name.
The web-app manifest is generated at build time from these settings (the Main colour becomes the app's theme colour). Phones update the icon after the rebuild; an already-installed app may need to be removed and added again to show a new icon (iPhone always does).

## Full-screen preview link
Shows exactly what the projector shows, live, on any other screen (a TV, a second laptop, a phone) with one link.
1. On the projector device tap **📱** (or 📱 Remote on the Meeting page) – the panel now has **🖥 Full-screen preview** (opens it) and **Copy preview link** (`https://YOUR-SITE/#/screen/123456`).
2. On the other screen open that link, then tap **⛶ Full screen** (or press `F`). Buttons hide by themselves after 3 seconds; move the mouse or touch to bring them back.
3. The phone remote page also has a **🖥 Full-screen preview** button.
The preview follows slide changes, blank screen, colour theme and the background image. It is view-only and needs the projector device to keep its page open with remote switched on. It uses the same 6-digit code as the remote; the Netlify function `remote.mjs` was updated, so redeploy it too. iPhone Safari cannot go full screen for web pages (use "Add to Home Screen" for that).

### Preview link only (default)
By default the projection is shown **only on the preview link**: pressing 📽 Present / ▶ (or starting a song from the phone remote) does not open the projector on the device you are using. Instead remote is switched on automatically and a small bar appears at the bottom (slide counter, ‹ ›, blank, copy preview link, ⏹ Stop). Open the preview link on the screen you want to project on. The panels no longer open the preview by themselves – they show the link and a **Copy preview link** button.
To project full screen on the same device again, untick **Show the projection on the preview link only** (Meeting page, or the 📱 panel).

## Bible verse search (reference + shortcut words)
Bible tab (and the phone remote's Bible tab) has a search box. Type a reference with a shortcut, e.g. `jn 3:16`, `john 3 16`, `ps 23`, `gen 1:1-5`, `1 cor 13:4-7`, `i john 4:8`, `rev 22`, a Telugu name (`యోహాను 3:16`, `యోహా 3`) or Telugu in English letters (`yohanu 3:16`). Results show the verse text; tap to open (verses are highlighted), or tap 📽 to project it. One verse projects the chapter starting at that verse; a range (`16-18`) projects only those verses. If a shortcut matches several books (`jo`), all are listed.

## Presentation look
- 🎨 (top-bar of the projector, and in the preview-only bar) opens colour wheels for **text colour** and **background colour**, plus Dark / Blue / Light presets and Reset. The phone remote has the same two wheels on the Presenting tab. Colours show live on the preview link.
- **Custom photo background:** 🎨 → *Upload photo* (or 🖼 cycle → "My image…"). The photo is shrunk, remembered on that device, and shown on the preview link too. *Remove photo* clears it.
- **Site logo** (Admin → Site Settings → Logo; falls back to the App icon) is shown in the top-right corner of the presentation and the preview. Redeploy `netlify/functions/remote.mjs` too.

## v22 – speed + double-click
- **Remote / projector / preview latency**: the projector and the phone now use long-polling (`/api/remote` holds the request until something changes) instead of a 1-second timer, state is pushed the moment a slide changes, the phone shows next/previous instantly, songs project from already-loaded data, and text fitting needs far fewer layout passes. Deploy the updated `netlify/functions/remote.mjs` together with `index.html`.
- **Bible**: double-click (or double-tap) a verse to send it to the presentation (several selected verses → only those).

## v23 – direct connection (milliseconds)
- Phone remote and preview link now open a **WebRTC data channel straight to the projector**. Taps and slide changes travel peer-to-peer (a few ms on the same Wi-Fi) instead of through the server. The remote shows a ⚡ when the direct link is active.
- The server (`netlify/functions/remote.mjs`) is only used for the short setup messages (a small mailbox) and as an automatic fallback: if the network blocks direct links (some mobile carriers / strict firewalls), everything keeps working through the long-poll link from v22.
- Uses Google's public STUN servers (`stun.l.google.com`). No TURN relay is configured; add one to `RTC_CFG` in `index.html` if you need direct links across strict networks.
- Deploy `index.html`, `sw.js` and `netlify/functions/remote.mjs` together.

## v24 – Sermons tab, YouTube live alerts, APK download

### 1. Set the YouTube channel (Admin)
Admin → Site Settings → **YouTube & Android App** → **YouTube channel link**. Any form works: `https://www.youtube.com/@yourchannel`, `https://www.youtube.com/channel/UC…`, `/c/name`, `/user/name` or just `@yourchannel`. If a link is ever not recognised, paste the 24-character channel ID (starts with `UC`) in the field below it. Change the link at any time; the site updates after the rebuild (about a minute).

This one link drives:
- the **Sermons** tab (bottom bar): the last 20 videos, tap one to watch it inside the app (or open it in YouTube / share it);
- **Latest videos** on the home screen: the last 4, directly below the song index (the Sermons tab has the full list);
- the **live alert** (below).

### 2. Free YouTube API key (recommended)
YouTube's public feed only lists the last **15** videos, so for the full **20** and exact live detection add a free key:
1. console.cloud.google.com → create a project → *APIs & Services* → enable **YouTube Data API v3** → *Credentials* → *Create API key* (restrict it to the YouTube Data API v3).
2. Netlify → Site settings → Environment variables → add `YOUTUBE_API_KEY` → redeploy.

Without the key everything still works, but with up to 15 videos, and live detection is "best effort" (it reads the channel's public live page, which YouTube can change). The server asks YouTube at most once every 2 minutes for all visitors together (cached in Netlify Blobs), using about 1,500 of the 10,000 free daily API units.

### 3. Live alerts
- **In the app:** while anyone has the app open, a red **LIVE NOW** bar appears on every screen (checked every minute) and the 🔔 shows a badge.
- **Notification (app closed):** `netlify/functions/live-check.mjs` runs every 2 minutes; when the channel goes live it sends one push notification per stream to everyone who tapped **🔔 Alert me when we go live** (Sermons tab, or 🔔 page). Tapping it opens the live stream in the app. It uses the same VAPID keys as the daily verse (see above) and, like the daily verse, runs only on the published deploy. The daily verse and live alerts are separate switches on the 🔔 page.
- Admin → YouTube & Android App → **Send an alert when the channel goes live** turns the whole feature off.
- iPhone: push works only after "Add to Home Screen" (iOS 16.4+). Without VAPID keys the alert is still shown while the app is open.
- The scheduled check runs about 21,600 times a month. Change `*/2` in `live-check.mjs` (`export const config`) to `*/5` to use fewer Netlify function calls.

### 4. Android app (APK)
Admin → Site Settings → **YouTube & Android App** → **Android app (APK) – upload**, then optionally the version and a short note. Visitors get a **⬇ Download APK** card on the home screen (hidden once the site is installed as an app) and on the About tab, showing the version and file size.
- Android asks them to allow "Install unknown apps" for the browser the first time.
- Large files: GitHub rejects files over 100 MB and the admin upload may fail well before that (roughly 50 MB). In that case put the APK in a GitHub Release (or any host) and paste its `https://` link in the same field; the download card then links straight to it.
- The APK is never stored in the offline cache.
- Upload only an APK you built and signed yourself.

### Files added / changed in v24
`netlify/lib/yt.mjs`, `netlify/functions/youtube.mjs` (feed API), `netlify/functions/live-check.mjs` (scheduled alert), `netlify/functions/push.mjs` (separate verse / live subscriptions), `netlify/functions/daily-verse.mjs`, `content/youtube_app.json`, `admin/config.yml`, `build.js`, `sw.js`, `index.html`. Deploy all of them together.

### Automatic notifications (v25)
When someone opens the site, it asks for notification permission and, once allowed, subscribes that device to **both** the daily 8 AM verse and the YouTube live alert automatically. Chrome/Edge/Android ask a moment after the site opens; Safari, iPhone (installed app only) and Firefox ask on the first tap. People can still turn either off on the 🔔 page; turning both off is remembered and they are not asked again. A refused browser prompt is not repeated for 7 days. It is not asked on the projector/remote screens. Still required once on your side: the VAPID keys above and the YouTube channel in Admin.

## v26 – Shorts tab + 📝 Bible notes

### Shorts tab (bottom bar)
Shows the channel's YouTube **Shorts** as a vertical grid; tap one to play it in the app (‹ Previous / Next › buttons, or arrow keys), open it in YouTube, or share it. It uses the same channel as the Sermons tab (Admin → YouTube & Android App → YouTube channel link), so there is nothing new to set up.
- `netlify/functions/shorts.mjs` (`/api/shorts`) + `getShorts()` in `netlify/lib/yt.mjs`. Every channel has a hidden Shorts-only playlist (its channel id with `UC` → `UUSH`); with `YOUTUBE_API_KEY` it is read through the Data API (up to 30 Shorts with date/length), without a key through the playlist's public RSS feed, then the channel's `/shorts` page as a last resort. Cached in Netlify Blobs for 5 minutes for all visitors together.
- The Sermons tab is unchanged, so a Short can also appear there (YouTube lists Shorts among a channel's uploads).

### 📝 Bible notes (top bar)
The 📝 button next to 🔔 lists every Bible reference **sent to the projector in the last 7 days**, grouped by Today / Yesterday / date, with the time and a short text preview. Tap a row to open it in the Bible, **📽** to project it again, **✕** to remove it, **Clear all** to empty the list. Telugu / English / Both switch the reference names.
- Logged: a chapter or verse projected from the Bible tab (📽 Projector, double-click a verse, selected verses), from Bible search, or sent from the phone remote's Bible tab. Chapter ‹ › changes on the projector are logged too. The same verse sent twice on one day is shown once as "sent N times".
- Entries older than 7 days are removed automatically. The list is stored **on each device** (like "Recently viewed"): the projector device lists everything it projected; a phone remote lists what was sent from that phone.
- Files changed: `index.html`, `sw.js` (cache v26), `netlify/lib/yt.mjs`, new `netlify/functions/shorts.mjs`. Deploy all of them together.

## New Short alerts (automatic push notification)
When the channel posts a new YouTube Short, every visitor with notifications on gets one push notification (title + thumbnail); tapping it opens that Short in the swipe feed.
- `netlify/functions/short-check.mjs` runs every 10 minutes (production deploy only), reads the newest Shorts (`latestShorts()` in `netlify/lib/yt.mjs`) and sends ONE notification per check, grouped as "N new Shorts" when several appear. The first run only remembers the existing Shorts, so nothing old is announced; anything older than 3 days is never announced.
- Uses the same `VAPID_*` environment variables as the daily verse and live alert; no new setup. A `YOUTUBE_API_KEY` makes detection faster and more reliable, but is optional.
- Visitors: 🔔 → **New Shorts** card turns it off or on. Devices subscribed earlier are on by default. Admin → YouTube & Android App → **Send an alert when a new YouTube Short is posted** switches it off for everyone.
- Files changed: `index.html`, `sw.js` (cache v29), `netlify/lib/yt.mjs`, `netlify/functions/push.mjs`, new `netlify/functions/short-check.mjs`, `admin/config.yml`, `content/youtube_app.json`. Deploy all of them together.

## All Shorts / only 15 showing
Without `YOUTUBE_API_KEY`, YouTube only gives the newest 15 Shorts (its RSS limit) and scraping the full list often fails from Netlify's servers. To show every Short: Google Cloud Console → enable **YouTube Data API v3** → create an API key (no HTTP-referrer restriction, since it is used server-side) → Netlify → Site settings → Environment variables → add `YOUTUBE_API_KEY` → **Clear cache and deploy**. The Shorts tab then reads the full Shorts playlist (up to 500). If the key is set but wrong, the Shorts tab now shows the API error under the title.
