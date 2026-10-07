// Scheduled every 2 minutes: when the channel goes live, send ONE push notification to every subscriber who turned on live alerts.
// Needs the same VAPID_* env vars as the daily verse (see README). Scheduled functions run only on the published (production) deploy.
import webpush from "web-push";
import { getStore } from "@netlify/blobs";
import media from "../../content/youtube_app.json";
import settings from "../../content/settings.json";
import { getFeed, withSettings } from "../lib/yt.mjs";

export default async () => {
  if (media.live_alerts === false) return;
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) { console.log("VAPID keys are not set; skipping"); return; }

  let feed; try { feed = await getFeed(withSettings(media, settings), { force: true }); } catch (e) { console.log("live-check: feed failed", e.message); return; }
  const live = feed && feed.live;
  if (!live) return;

  const yt = getStore({ name: "youtube", consistency: "strong" });
  const st = (await yt.get("live-state", { type: "json" }).catch(() => null)) || { done: [] };
  if (st.done.includes(live.id)) return;                       // already announced this stream
  st.done = [live.id, ...st.done].slice(0, 30);
  await yt.setJSON("live-state", st);                          // mark first, so an overlapping run cannot announce it twice

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const store = getStore({ name: "push", consistency: "strong" });
  const { blobs } = await store.list();
  const payload = JSON.stringify({ type: "live", id: live.id, title: live.title || "" });
  let sent = 0;
  for (let i = 0; i < blobs.length; i += 20) {
    await Promise.all(blobs.slice(i, i + 20).map(async ({ key }) => {
      const d = await store.get(key, { type: "json" }).catch(() => null);
      if (!d || !d.topics || !d.topics.live) return;
      try { await webpush.sendNotification(d.sub, payload, { TTL: 1800, urgency: "high" }); sent++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await store.delete(key).catch(() => {}); else console.log("live push failed", e.statusCode); }
    }));
  }
  console.log("live alert sent to", sent, "for", live.id);
};

export const config = { schedule: "*/2 * * * *" };
