// Scheduled every 10 minutes: when a NEW song appears on the site, send ONE push notification to every subscriber who has notifications on.
// Works with the app and the browser closed (real Web Push). Needs the same VAPID_* env vars as the daily verse (see README).
// Scheduled functions run only on the published (production) deploy.
// The first run only remembers the songs that already exist (no notification), so nothing old is announced.
// Only songs with a date (added from the admin / contributor studio) in the last 3 days are announced; imported "ref-" songs never are.
import webpush from "web-push";
import { getStore } from "@netlify/blobs";

const addedAt = x => {
  let v = Date.parse(String(x.date || "").replace(" ", "T"));
  if (!v) { const m = String(x.id).match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/); v = m ? Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : 0; }
  return v || 0;
};

export default async () => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) { console.log("VAPID keys are not set; skipping"); return; }
  const base = (process.env.SITE_URL || process.env.URL || process.env.DEPLOY_URL || "").replace(/\/$/, "");
  if (!base) { console.log("song-check: site URL unknown (set SITE_URL); skipping"); return; }

  let songs;
  try {
    const r = await fetch(base + "/data.json?t=" + Date.now(), { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    songs = (await r.json()).songs || [];
  } catch (e) { console.log("song-check: failed", e.message); return; }
  if (!songs.length) return;

  const st0 = getStore({ name: "songs", consistency: "strong" });
  const st = await st0.get("state", { type: "json" }).catch(() => null);
  const ids = songs.map(s => s.id);
  if (!st) { await st0.setJSON("state", { seen: ids }); console.log("song-check: first run, remembered", ids.length); return; }

  const seen = new Set(st.seen || []);
  const now = Date.now();
  const fresh = songs.filter(s => !seen.has(s.id) && addedAt(s) && now - addedAt(s) < 3 * 864e5 && addedAt(s) <= now + 864e5).sort((a, b) => addedAt(b) - addedAt(a));
  await st0.setJSON("state", { seen: [...new Set([...ids, ...(st.seen || [])])] });       // mark first, so an overlapping run cannot announce it twice
  if (!fresh.length) return;

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const store = getStore({ name: "push", consistency: "strong" });
  const { blobs } = await store.list();
  const newest = fresh[0];
  const payload = JSON.stringify({ type: "song", id: newest.id, title: newest.title || "", cat: newest.category || "", count: fresh.length });
  let sent = 0;
  for (let i = 0; i < blobs.length; i += 20) {
    await Promise.all(blobs.slice(i, i + 20).map(async ({ key }) => {
      const d = await store.get(key, { type: "json" }).catch(() => null);
      if (!d || !d.topics) return;
      const t = d.topics, on = typeof t.songs === "boolean" ? t.songs : !!(t.verse || t.live || t.shorts);   // older subscribers follow their other switches
      if (!on) return;
      try { await webpush.sendNotification(d.sub, payload, { TTL: 24 * 3600 }); sent++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await store.delete(key).catch(() => {}); else console.log("song push failed", e.statusCode); }
    }));
  }
  console.log("new song alert sent to", sent, "for", newest.id, "(" + fresh.length + " new)");
};

export const config = { schedule: "*/10 * * * *" };
