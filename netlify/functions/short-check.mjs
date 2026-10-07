// Scheduled every 10 minutes: when the channel posts a NEW YouTube Short, send ONE push notification to every subscriber who has Short alerts on.
// Needs the same VAPID_* env vars as the daily verse / live alert (see README). Scheduled functions run only on the published (production) deploy.
// The first run only remembers the Shorts that already exist (no notification), so nothing old is announced.
import webpush from "web-push";
import { getStore } from "@netlify/blobs";
import media from "../../content/youtube_app.json";
import settings from "../../content/settings.json";
import { latestShorts, withSettings } from "../lib/yt.mjs";

export default async () => {
  if (media.short_alerts === false) return;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) { console.log("VAPID keys are not set; skipping"); return; }

  let list; try { list = await latestShorts(withSettings(media, settings)); } catch (e) { console.log("short-check: failed", e.message); return; }
  if (!list || !list.length) return;

  const yt = getStore({ name: "youtube", consistency: "strong" });
  const st = await yt.get("shorts-state", { type: "json" }).catch(() => null);
  const ids = list.map(v => v.id);
  if (!st) { await yt.setJSON("shorts-state", { seen: ids }); console.log("short-check: first run, remembered", ids.length); return; }

  const seen = new Set(st.seen || []);
  const fresh = list.filter(v => !seen.has(v.id) && (!v.t || Date.now() - new Date(v.t).getTime() < 3 * 864e5));   // never announce something older than 3 days
  await yt.setJSON("shorts-state", { seen: [...new Set([...ids, ...(st.seen || [])])].slice(0, 100) });          // mark first, so an overlapping run cannot announce it twice
  if (!fresh.length) return;

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const store = getStore({ name: "push", consistency: "strong" });
  const { blobs } = await store.list();
  const newest = fresh[0];
  const payload = JSON.stringify({ type: "short", id: newest.id, title: newest.title || "", count: fresh.length });
  let sent = 0;
  for (let i = 0; i < blobs.length; i += 20) {
    await Promise.all(blobs.slice(i, i + 20).map(async ({ key }) => {
      const d = await store.get(key, { type: "json" }).catch(() => null);
      if (!d || !d.topics || d.topics.shorts === false) return;                         // subscribers from before Short alerts existed count as on
      try { await webpush.sendNotification(d.sub, payload, { TTL: 6 * 3600 }); sent++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await store.delete(key).catch(() => {}); else console.log("short push failed", e.statusCode); }
    }));
  }
  console.log("new Short alert sent to", sent, "for", newest.id, "(" + fresh.length + " new)");
};

export const config = { schedule: "*/10 * * * *" };
