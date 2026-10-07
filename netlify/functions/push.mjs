// Stores browser push subscriptions. Each subscription has topics: { verse, live, shorts } (daily Bible verse, YouTube live alerts, new YouTube Shorts).
// Needs env var VAPID_PUBLIC_KEY (see README). GET returns the public key; POST subscribes / updates topics; DELETE unsubscribes.
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const id = ep => createHash("sha1").update(ep).digest("hex");

export default async (req) => {
  if (req.method === "GET") return J({ key: process.env.VAPID_PUBLIC_KEY || "" });
  const store = getStore({ name: "push", consistency: "strong" });
  let b; try { b = await req.json(); } catch { return J({ error: "bad" }, 400); }
  if (req.method === "POST") {
    const sub = b.sub;
    if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys) return J({ error: "bad" }, 400);
    const tz = typeof b.tz === "string" && /^[A-Za-z_\/+\-0-9]{1,60}$/.test(b.tz) ? b.tz : "Asia/Kolkata";
    // older app versions send no topics: they only ever subscribed to the daily verse
    const topics = b.topics && typeof b.topics === "object" ? { verse: !!b.topics.verse, live: !!b.topics.live, shorts: b.topics.shorts !== false } : { verse: true, live: false, shorts: true };
    if (!topics.verse && !topics.live && !topics.shorts) { await store.delete(id(sub.endpoint)); return J({ ok: true }); }
    const old = await store.get(id(sub.endpoint), { type: "json" }).catch(() => null);
    await store.setJSON(id(sub.endpoint), { sub, tz, topics, last: (old && old.last) || "" });
    return J({ ok: true });
  }
  if (req.method === "DELETE") {
    if (typeof b.endpoint === "string") await store.delete(id(b.endpoint));
    return J({ ok: true });
  }
  return J({ error: "method" }, 405);
};

export const config = { path: "/api/push" };
