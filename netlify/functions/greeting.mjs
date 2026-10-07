// Admin greeting / custom popup.  /api/greeting
//   GET                 -> the current message (public): { id, title, text, image, btnLabel, btnUrl, popup, at, until }  or {}
//   GET ?img=ID         -> the picture of a message (JPEG)
//   GET ?history=1      -> admin only: { current, history }
//   POST (admin)        -> publish a message: { title, text, image (data:image/jpeg;base64,...), btnLabel, btnUrl, popup, push, days }
//                          popup: show it as a popup in the app; push: also send it as a notification to everyone who allowed notifications
//   DELETE (admin)      -> remove the current message (the popup stops showing)
// Stored in Netlify Blobs (store "greeting"). Needs the same VAPID_* environment variables as the daily verse for the notification part.
import webpush from "web-push";
import { getStore } from "@netlify/blobs";
import { adminUser } from "../lib/approved.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const ID = /^[\w-]{4,40}$/;
const clip = (v, n) => String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, n);
// a button may open an https:// page or a page of this site (/#/bible ...)
const safeUrl = u => { u = clip(u, 300); return /^https:\/\/[^\s"'<>]+$/i.test(u) || /^\/[#\w][^\s"'<>]*$/.test(u) ? u : ""; };
const short = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "\u2026" : t);

export default async (req) => {
  const store = getStore({ name: "greeting", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const img = url.searchParams.get("img");
    if (img) {
      if (!ID.test(img)) return J({ error: "bad" }, 400);
      const buf = await store.get("img-" + img, { type: "arrayBuffer" }).catch(() => null);
      if (!buf) return new Response("Not found", { status: 404 });
      return new Response(buf, { headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
    }
    if (url.searchParams.get("history")) {
      if (!(await adminUser(req))) return J({ error: "Admins only" }, 403);
      return J({ current: await store.get("current", { type: "json" }).catch(() => null), history: (await store.get("history", { type: "json" }).catch(() => null)) || [] });
    }
    const cur = await store.get("current", { type: "json" }).catch(() => null);
    if (!cur || (cur.until && Date.now() > cur.until)) return J({});
    return J(cur);
  }

  const admin = await adminUser(req);
  if (!admin) return J({ error: "Admins only. Log in at /admin/ first." }, 403);

  if (req.method === "DELETE") {
    const cur = await store.get("current", { type: "json" }).catch(() => null);
    await store.delete("current").catch(() => {});
    if (cur && cur.id) await store.delete("img-" + cur.id).catch(() => {});
    return J({ ok: true });
  }

  if (req.method !== "POST") return J({ error: "method" }, 405);
  let b; try { b = await req.json(); } catch { return J({ error: "bad request" }, 400); }

  const title = clip(b.title, 80), text = clip(b.text, 600);
  const popup = b.popup !== false, push = b.push === true;
  const days = Math.min(60, Math.max(1, parseInt(b.days) || 3));
  let imgBuf = null;
  if (b.image) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.image));
    if (!m) return J({ error: "The picture must be a JPEG" }, 400);
    imgBuf = Buffer.from(m[1], "base64");
    if (imgBuf.length > 1.5 * 1048576) return J({ error: "The picture is too big" }, 400);
  }
  if (!title && !text && !imgBuf) return J({ error: "Write a message or add a picture" }, 400);
  if (!popup && !push) return J({ error: "Choose popup, notification, or both" }, 400);

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const now = Date.now();
  if (imgBuf) await store.set("img-" + id, imgBuf);
  const msg = {
    id, title, text, image: imgBuf ? "/api/greeting?img=" + id : "",
    btnLabel: clip(b.btnLabel, 30), btnUrl: safeUrl(b.btnUrl), popup, at: now, until: now + days * 864e5
  };
  if (!msg.btnUrl) msg.btnLabel = "";
  if (!msg.btnLabel && msg.btnUrl) msg.btnLabel = "Open";

  const old = await store.get("current", { type: "json" }).catch(() => null);
  await store.setJSON("current", msg);

  // ---- notification ----
  let sent = 0, failed = 0, total = 0, pushNote = "";
  if (push) {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) pushNote = "Notification not sent: the VAPID keys are not set on Netlify (see README).";
    else {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
      const subs = getStore({ name: "push", consistency: "strong" });
      const { blobs } = await subs.list();
      // the push message is small: the picture is fetched by the service worker from /api/greeting?img=
      const payload = JSON.stringify({ type: "greeting", id, title: title || "\uD83D\uDE4F Greeting", text: short(text, 180), img: msg.image });
      const keys = blobs.map(x => x.key);
      for (let i = 0; i < keys.length; i += 20) {
        await Promise.all(keys.slice(i, i + 20).map(async key => {
          const d = await subs.get(key, { type: "json" }).catch(() => null);
          if (!d || !d.sub || (d.topics && d.topics.greet === false)) return;
          total++;
          try { await webpush.sendNotification(d.sub, payload, { TTL: 24 * 3600 }); sent++; }
          catch (e) {
            failed++;
            if (e.statusCode === 404 || e.statusCode === 410) await subs.delete(key).catch(() => {});   // unsubscribed
          }
        }));
      }
    }
  }

  // ---- history (last 15) and clean-up of old pictures ----
  const hist = ((await store.get("history", { type: "json" }).catch(() => null)) || []);
  hist.unshift({ id, title, text: short(text, 120), hasImage: !!imgBuf, popup, push, sent, at: now });
  for (const h of hist.splice(15)) if (h.hasImage) await store.delete("img-" + h.id).catch(() => {});
  await store.setJSON("history", hist);
  if (old && old.id && !hist.some(h => h.id === old.id)) await store.delete("img-" + old.id).catch(() => {});

  return J({ ok: true, id, popup, push, sent, failed, total, note: pushNote, until: msg.until });
};

export const config = { path: "/api/greeting" };
