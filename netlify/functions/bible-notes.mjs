// Shared "Bible notes": every Bible reference sent to the projector, visible to everyone for 7 days.
//   GET  /api/bible-notes                      -> { list:[{id,b,c,v,l,t,n}], t }
//   POST /api/bible-notes {op:"add",b,c,v,l}   -> adds (the same reference sent again the same day is counted, not repeated)
//   POST /api/bible-notes {op:"clear"}         -> ADMIN ONLY: removes every note
//   POST /api/bible-notes {op:"delete",id}     -> ADMIN ONLY: removes one note
// Notes cannot be deleted by visitors; each one disappears by itself after 7 days.
// Admin check: the request must carry a valid Netlify Identity token (Authorization: Bearer ...), the same login as /admin/.
import { getStore } from "@netlify/blobs";
import { adminUser, approvedUser } from "../lib/approved.mjs";

const WEEK = 7 * 864e5, DAY_OFFSET = 5.5 * 36e5;   // "same day" is counted in India time
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const day = t => Math.floor((t + DAY_OFFSET) / 864e5);
const prune = (a, now) => (Array.isArray(a) ? a : []).filter(x => x && typeof x.t === "number" && now - x.t < WEEK);

const isAdmin = async (req) => !!(await adminUser(req));

export default async (req) => {
  const store = getStore({ name: "biblenotes", consistency: "strong" });
  const now = Date.now();
  let list = prune(await store.get("log", { type: "json" }).catch(() => []), now);

  if (req.method === "GET") return J({ list, t: now });

  if (req.method === "POST") {
    let q; try { q = await req.json(); } catch { return J({ error: "bad" }, 400); }

    if (q.op === "clear" || q.op === "delete") {
      if (!(await isAdmin(req))) return J({ error: "auth" }, 401);
      list = q.op === "clear" ? [] : list.filter(x => x.id !== String(q.id || ""));
    } else if (q.op === "add") {
      if (!(await approvedUser(req))) return J({ error: "contributors only" }, 401);   // visitors cannot add notes
      const b = Number(q.b), c = Number(q.c), v = String(q.v || "");
      const l = ["te", "en", "both"].includes(q.l) ? q.l : "te";
      if (!(Number.isInteger(b) && b >= 0 && b <= 65 && Number.isInteger(c) && c >= 1 && c <= 150 && /^[\d,\-]{0,40}$/.test(v))) return J({ error: "bad" }, 400);
      const same = x => x.b === b && x.c === c && x.v === v;
      if (list.some(x => same(x) && now - x.t < 15000)) return J({ list, t: now });   // two screens reported the same send
      const k = list.findIndex(x => same(x) && day(x.t) === day(now));
      if (k >= 0) { const e = list.splice(k, 1)[0]; e.t = now; e.n = (e.n || 1) + 1; e.l = l; list.unshift(e); }
      else list.unshift({ id: now.toString(36) + Math.random().toString(36).slice(2, 6), b, c, v, l, t: now, n: 1 });
      list = list.slice(0, 300);
    } else return J({ error: "op" }, 400);

    await store.setJSON("log", list);
    return J({ list, t: now });
  }
  return J({ error: "method" }, 405);
};

export const config = { path: "/api/bible-notes" };
