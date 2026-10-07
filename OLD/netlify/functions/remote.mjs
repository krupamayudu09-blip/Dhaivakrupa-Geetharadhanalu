// Remote control relay for the projector. Stores a tiny room record in Netlify Blobs.
// Low-latency version: the projector and the viewers LONG-POLL (the request is held open until something
// changes) instead of asking once a second, so a tap on the phone reaches the screen almost instantly.
// State and commands live in two separate records so a command can never be overwritten by a state update.
import { getStore } from "@netlify/blobs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const OK = new Set(["next", "prev", "goto", "blank", "theme", "bg", "sizeup", "sizedown", "nsong", "psong", "start", "song", "bible", "nch", "pch", "madd", "mdel", "tcolor", "bcolor", "creset"]);
const valid = r => /^\d{6}$/.test(r);
const TTL = 6 * 3600e3;
const HOLD = 7000;          // longest a request is held open (Netlify's default function limit is 10 s)
const STEP = 200;           // how often a held request looks for news
const sleep = ms => new Promise(r => setTimeout(r, ms));
const idOk = x => /^[a-z0-9]{2,24}$/i.test(x);

// WebRTC signalling mailbox: one tiny blob per message (so concurrent senders can never overwrite each other).
// Only used for the few messages that set up the direct phone <-> projector connection; the slides never go through here.
async function takeSigs(store, room, to) {
  const { blobs } = await store.list({ prefix: `${room}.s.${to}.` });
  if (!blobs.length) return [];
  const keys = blobs.map(b => b.key).sort();
  const got = await Promise.all(keys.map(async k => { const m = await store.get(k, { type: "json" }); await store.delete(k); return m; }));
  return got.filter(m => m && Date.now() - m.t < 60000).map(m => ({ from: m.from, d: m.d }));
}

export default async (req) => {
  const store = getStore({ name: "remote", consistency: "strong" });
  const url = new URL(req.url);

  if (req.method === "GET") {
    const room = url.searchParams.get("room") || "";
    if (!valid(room)) return J({ error: "bad room" }, 400);
    const sg = url.searchParams.get("sig");
    if (sg) {                                   // a phone/preview waiting for the projector's WebRTC answer
      if (!idOk(sg)) return J({ error: "bad id" }, 400);
      const t1 = Date.now();
      for (;;) {
        const sigs = await takeSigs(store, room, sg);
        if (sigs.length || Date.now() - t1 > HOLD) return J({ sigs });
        await sleep(150);
      }
    }
    const rev = +url.searchParams.get("rev") || 0, wait = url.searchParams.get("wait") === "1" && rev > 0;
    const t0 = Date.now();
    let d;
    for (;;) {
      d = await store.get(room, { type: "json" });
      if (!d || Date.now() - d.t > TTL) return J({ error: "none" }, 404);
      if (!wait || (d.rev || 0) !== rev || Date.now() - t0 > HOLD) break;
      await sleep(STEP);
    }
    const age = Date.now() - d.t;
    if (wait && (d.rev || 0) === rev) return J({ same: true, rev, age });       // nothing changed: tiny answer
    const state = { ...d.state };
    if (url.searchParams.get("full") !== "1") delete state.slides;
    if (url.searchParams.get("screen") !== "1") { delete state.st; delete state.bgd; }     // full slide content is only sent to the full-screen preview page
    return J({ state, age, rev: d.rev || 0 });
  }

  if (req.method === "POST") {
    let b; try { b = await req.json(); } catch { return J({ error: "bad json" }, 400); }
    const room = String(b.room || "");
    if (!valid(room)) return J({ error: "bad room" }, 400);
    const ck = room + ".c";

    if (b.role === "pj") {                      // projector: push state and/or pull commands
      if (b.state || b.hb) {
        let d = await store.get(room, { type: "json" });
        if (d && Date.now() - d.t > TTL) d = null;
        d = d || { state: {}, rev: 0 };
        if (b.state) {
          let bgd = b.state.bgd !== undefined ? b.state.bgd : d.state?.bgd;           // custom photo background (small JPEG data URL), sent only when it changes
          if (typeof bgd !== "string" || bgd.length > 700000 || (bgd && !bgd.startsWith("data:image/jpeg;base64,"))) bgd = "";
          d.state = { ...b.state, bgd, slides: b.state.slides || d.state?.slides, st: b.state.st || d.state?.st };
          d.rev = (d.rev || 0) + 1;             // a real change: wakes every waiting viewer
        }
        d.t = Date.now();                       // heartbeat (no rev bump)
        await store.setJSON(room, d);
      }
      const ack = +b.ack || 0, wait = b.wait ? HOLD : 0, t0 = Date.now();
      let c, cmds, sigs = [];
      for (;;) {
        c = (await store.get(ck, { type: "json" })) || { cmds: [], seq: 0 };
        cmds = (c.cmds || []).filter(x => x.id > ack);
        if (wait) sigs = await takeSigs(store, room, "pj");
        if (cmds.length || sigs.length || !wait || Date.now() - t0 > wait) break;
        await sleep(150);
      }
      let ch = cmds.length !== (c.cmds || []).length;
      if (ack > (c.seq || 0)) { c.seq = ack; ch = true; }   // room was reset: keep new ids above the projector's ack
      if (ch) { c.cmds = cmds; await store.setJSON(ck, c); }
      return J({ cmds, sigs });
    }
    if (b.role === "sig") {                    // WebRTC setup message from one side to the other
      const from = String(b.from || ""), to = String(b.to || "");
      if (!idOk(from) || !idOk(to) || !b.d || JSON.stringify(b.d).length > 8000) return J({ error: "bad sig" }, 400);
      const key = `${room}.s.${to}.${String(Date.now()).padStart(14, "0")}${Math.random().toString(36).slice(2, 7)}`;
      await store.setJSON(key, { from, d: b.d, t: Date.now() });
      return J({ ok: true });
    }
    if (b.role === "ct") {                      // controller: queue a command
      const d = await store.get(room, { type: "json" });
      if (!d || Date.now() - d.t > TTL) return J({ error: "none" }, 404);
      if (!OK.has(b.cmd)) return J({ error: "bad cmd" }, 400);
      const c = (await store.get(ck, { type: "json" })) || { cmds: [], seq: 0 };
      c.cmds = [...(c.cmds || []), { id: ++c.seq, cmd: b.cmd, arg: typeof b.arg === "string" && /^[\w.:\-]{1,60}$/.test(b.arg) ? b.arg : (+b.arg || 0) }].slice(-30);
      await store.setJSON(ck, c);
      return J({ ok: true });
    }
  }
  return J({ error: "method" }, 405);
};

export const config = { path: "/api/remote" };
