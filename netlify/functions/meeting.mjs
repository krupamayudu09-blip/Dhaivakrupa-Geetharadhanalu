// Shared "this meeting" schedule. Visitors on the site and the admin page both read and update it.
import { getStore } from "@netlify/blobs";
import { approvedUser } from "../lib/approved.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// Only an approved contributor (invited, or a sign-up the admin approved) may change the list. The token is checked with Identity itself.
const whoIs = approvedUser;

export default async (req) => {
  const store = getStore({ name: "schedule", consistency: "strong" });

  if (req.method === "GET") {
    const d = await store.get("current", { type: "json" });
    return J(d || { name: "", date: "", ids: [], t: 0 });
  }

  if (req.method === "POST") {
    if (!(await whoIs(req))) return J({ error: "contributors only" }, 401);
    let b; try { b = await req.json(); } catch { return J({ error: "bad" }, 400); }
    const ids = Array.isArray(b.ids) ? b.ids.map(String).filter(x => /^[\w.\-]{1,60}$/.test(x)).slice(0, 100) : [];
    // date = the meeting date (YYYY-MM-DD). Shown together with the name everywhere. A request without a date keeps the saved one.
    const old = (await store.get("current", { type: "json" }).catch(() => null)) || {};
    const date = b.date === undefined ? String(old.date || "") : (/^\d{4}-\d{2}-\d{2}$/.test(String(b.date)) ? String(b.date) : "");
    const d = { name: String(b.name || "").slice(0, 100), date, ids, t: Date.now() };
    await store.setJSON("current", d);
    return J(d);
  }
  return J({ error: "method" }, 405);
};

export const config = { path: "/api/meeting" };
