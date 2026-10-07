// Shared "this meeting" schedule. Visitors on the site and the admin page both read and update it.
import { getStore } from "@netlify/blobs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const store = getStore({ name: "schedule", consistency: "strong" });

  if (req.method === "GET") {
    const d = await store.get("current", { type: "json" });
    return J(d || { name: "", ids: [], t: 0 });
  }

  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { return J({ error: "bad" }, 400); }
    const ids = Array.isArray(b.ids) ? b.ids.map(String).filter(x => /^[\w.\-]{1,60}$/.test(x)).slice(0, 100) : [];
    const d = { name: String(b.name || "").slice(0, 100), ids, t: Date.now() };
    await store.setJSON("current", d);
    return J(d);
  }
  return J({ error: "method" }, 405);
};

export const config = { path: "/api/meeting" };
