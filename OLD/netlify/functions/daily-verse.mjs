// Scheduled every 30 minutes. Sends today's verse to each subscriber at 8:00 AM in THEIR time zone (once per day).
import webpush from "web-push";
import { getStore } from "@netlify/blobs";
import verses from "../../daily-verses.json";

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
// same function as in index.html, so the app and the notification always show the same verse
function pick(list, n) { const N = list.length; let s = Math.floor(N / 3) + 1; while (gcd(s, N) !== 1) s++; return list[(n * s) % N]; }

function localParts(tz) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23" });
  const o = {}; f.formatToParts(new Date()).forEach(p => { o[p.type] = +p.value; });
  return o;
}

export default async () => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) { console.log("VAPID keys are not set; skipping"); return; }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const store = getStore({ name: "push", consistency: "strong" });
  const { blobs } = await store.list();
  let sent = 0;
  for (const { key } of blobs) {
    const d = await store.get(key, { type: "json" }); if (!d) continue;
    if (d.topics && d.topics.verse === false) continue;   // subscribed to live alerts only
    let p; try { p = localParts(d.tz); } catch { p = localParts("Asia/Kolkata"); }
    if (p.hour !== 8) continue;
    const day = `${p.year}-${p.month}-${p.day}`;
    if (d.last === day) continue;
    const [b, c, v] = pick(verses, Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 864e5));
    try {
      await webpush.sendNotification(d.sub, JSON.stringify({ b, c, v }), { TTL: 6 * 3600 });
      d.last = day; await store.setJSON(key, d); sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await store.delete(key);   // unsubscribed
      else console.log("push failed", e.statusCode);
    }
  }
  console.log("daily verse sent to", sent);
};

export const config = { schedule: "*/30 * * * *" };
