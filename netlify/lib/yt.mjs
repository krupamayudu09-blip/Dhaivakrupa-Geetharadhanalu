// Shared YouTube helpers (used by /api/youtube and the scheduled live-check).
// - With the env var YOUTUBE_API_KEY (free, YouTube Data API v3): last 20 videos + exact live status.
// - Without it: the channel's public RSS feed (YouTube only publishes the last 15 there) + a best-effort live check.
import { getStore } from "@netlify/blobs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const PAGE_HEADERS = { "user-agent": UA, "accept-language": "en-US,en;q=0.9", cookie: "CONSENT=YES+1; SOCS=CAI" };
const CH = /^UC[\w-]{22}$/;
const sig = () => AbortSignal.timeout(8000);
const fail = (code, msg) => Object.assign(new Error(msg || code), { code });

/** The channel is normally set in Admin -> YouTube & Android App; if that is empty, the YouTube link from Site Settings is used. */
export function withSettings(media, settings) {
  const m = media || {}, st = settings || {};
  return { ...m, youtube: String(m.youtube || "").trim() || String(st.youtube || "").trim() };
}

/** Turns whatever the admin pasted (URL, @handle, channel id) into { id } | { handle } | { page } | null */
export function parseChannel(media) {
  const idField = String(media.youtube_channel_id || "").trim();
  if (CH.test(idField)) return { id: idField };
  let raw = String(media.youtube || "").trim();
  if (!raw) return null;
  if (CH.test(raw)) return { id: raw };
  if (/^@[\w.\-]+$/.test(raw)) return { handle: raw.slice(1) };
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw.replace(/^\/+/, "");
  let u; try { u = new URL(raw); } catch { return null; }
  if (!/(^|\.)youtube\.com$/i.test(u.hostname)) return null;
  const path = decodeURIComponent(u.pathname);
  let m = path.match(/^\/channel\/(UC[\w-]{22})/); if (m) return { id: m[1] };
  m = path.match(/^\/@([\w.\-]+)/); if (m) return { handle: m[1] };
  m = path.match(/^\/(c|user)\/([\w.\-]+)/); if (m) return { page: `https://www.youtube.com/${m[1]}/${m[2]}` };
  return null;
}

const decode = s => String(s || "")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, "&");

function openStore() { try { return getStore({ name: "youtube", consistency: "strong" }); } catch { return null; } }

async function resolveId(ref, apiKey, store) {
  if (ref.id) return ref.id;
  const ck = "chan:" + (ref.handle ? "@" + ref.handle : ref.page);
  const hit = store && (await store.get(ck).catch(() => null));
  if (hit && CH.test(hit)) return hit;
  let id = "";
  if (apiKey && ref.handle) {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent("@" + ref.handle)}&key=${apiKey}`, { signal: sig() });
    const j = await r.json().catch(() => ({}));
    id = j.items && j.items[0] && j.items[0].id || "";
  }
  if (!CH.test(id)) {
    const page = ref.page || `https://www.youtube.com/@${ref.handle}`;
    const html = await (await fetch(page, { headers: PAGE_HEADERS, signal: sig() })).text();
    const m = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)
      || html.match(/<meta itemprop="(?:channelId|identifier)" content="(UC[\w-]{22})"/)
      || html.match(/"externalId":"(UC[\w-]{22})"/)
      || html.match(/"channelId":"(UC[\w-]{22})"/);
    id = m ? m[1] : "";
  }
  if (!CH.test(id)) throw fail("channel_not_found", "Could not find the channel ID from the link (YouTube may be blocking the lookup). Paste the 24-character channel ID in Admin -> YouTube & Android App.");
  if (store) await store.set(ck, id).catch(() => {});
  return id;
}

const isoSec = d => { const m = String(d || "").match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; };

async function apiVideos(id, key, n, prefix = "UU") {
  const g = async url => { const r = await fetch(url, { signal: sig() }); const j = await r.json(); if (!r.ok) throw fail("api_error", "YouTube API " + r.status + ": " + (j.error && j.error.message || "")); return j; };
  // the channel's "uploads" playlist is the channel id with UC -> UU; the Shorts-only playlist is UC -> UUSH
  const pl = await g(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=${prefix}${id.slice(2)}&key=${key}`);
  const ids = (pl.items || []).map(i => i.contentDetails && i.contentDetails.videoId).filter(Boolean);
  if (!ids.length) return [];
  const vs = await g(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,liveStreamingDetails&id=${ids.join(",")}&maxResults=50&key=${key}`);
  const by = new Map((vs.items || []).map(v => [v.id, v]));
  // private / deleted videos are missing from videos.list, so ask for 50 and keep the first n that exist
  return ids.map(i => by.get(i)).filter(Boolean).slice(0, n).map(v => ({
    id: v.id, title: v.snippet.title, t: v.snippet.publishedAt, dur: isoSec(v.contentDetails && v.contentDetails.duration),
    live: v.snippet.liveBroadcastContent === "live" ? "live" : v.snippet.liveBroadcastContent === "upcoming" ? "upcoming" : (v.liveStreamingDetails && v.liveStreamingDetails.actualEndTime ? "ended" : ""),   // "ended" = a finished live stream
  }));
}

/** Every video of a playlist (all pages, newest first). prefix "UUSH" = the channel's Shorts. */
async function apiAll(id, key, prefix, max = 500, withLive = false) {
  const g = async url => { const r = await fetch(url, { signal: sig() }); const j = await r.json(); if (!r.ok) throw fail("api_error", "YouTube API " + r.status + ": " + (j.error && j.error.message || "")); return j; };
  const ids = []; let tok = "";
  do {
    let pl;
    try { pl = await g(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=${prefix}${id.slice(2)}${tok ? "&pageToken=" + encodeURIComponent(tok) : ""}&key=${key}`); }
    catch (e) { if (!ids.length) throw e; break; }   // a later page failing keeps what was already read
    (pl.items || []).forEach(i => { const v = i.contentDetails && i.contentDetails.videoId; if (v && !ids.includes(v)) ids.push(v); });
    tok = pl.nextPageToken || "";
  } while (tok && ids.length < max);
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const vs = await g(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails${withLive ? ",liveStreamingDetails" : ""}&id=${ids.slice(i, i + 50).join(",")}&maxResults=50&key=${key}`);
    const by = new Map((vs.items || []).map(v => [v.id, v]));
    ids.slice(i, i + 50).map(x => by.get(x)).filter(Boolean).forEach(v => out.push({
      id: v.id, title: v.snippet.title, t: v.snippet.publishedAt, dur: isoSec(v.contentDetails && v.contentDetails.duration),
      live: withLive ? (v.snippet.liveBroadcastContent === "live" ? "live" : v.snippet.liveBroadcastContent === "upcoming" ? "upcoming" : (v.liveStreamingDetails && v.liveStreamingDetails.actualEndTime ? "ended" : "")) : "",
    }));
  }
  return out;
}

// YouTube's public feeds sometimes answer 404 for a valid channel (they are flaky from data-centre IPs), so several routes are tried in turn:
// 1) the channel feed, 2) the same channel's "uploads" playlist feed, 3) the channel's /videos web page.
async function feedXml(url) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/atom+xml,application/xml,text/xml,*/*" }, signal: sig() });
  if (!r.ok) throw fail("feed_failed", "HTTP " + r.status);
  return r.text();
}
function parseFeed(xml, n) {
  const tag = (b, t) => { const m = b.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return m ? m[1] : ""; };
  return (xml.match(/<entry>[\s\S]*?<\/entry>/g) || []).slice(0, n).map(e => ({ id: tag(e, "yt:videoId"), title: decode(tag(e, "title")), t: tag(e, "published"), dur: 0, live: "" })).filter(v => v.id);
}
async function pageVideos(id, n) {
  const html = await (await fetch(`https://www.youtube.com/channel/${id}/videos`, { headers: PAGE_HEADERS, signal: sig() })).text();
  const out = [], seen = new Set();
  const re = /"videoRenderer":\{"videoId":"([\w-]{11})"/g;
  let m;
  while ((m = re.exec(html)) && out.length < n) {
    if (seen.has(m[1])) continue; seen.add(m[1]);
    const t = html.slice(m.index, m.index + 3000).match(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/);
    let title = ""; try { title = t ? JSON.parse('"' + t[1] + '"') : ""; } catch { title = t ? t[1] : ""; }
    out.push({ id: m[1], title: title || "Video", t: "", dur: 0, live: "" });
  }
  if (!out.length) throw fail("page_failed", "no videos found on the channel page");
  return out;
}
async function rssVideos(id, n) {
  const errs = [];
  const routes = [
    ["channel feed", async () => parseFeed(await feedXml(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`), n)],
    ["uploads feed", async () => parseFeed(await feedXml(`https://www.youtube.com/feeds/videos.xml?playlist_id=UU${id.slice(2)}`), n)],
    ["channel page", () => pageVideos(id, n)],
  ];
  for (const [name, run] of routes) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const v = await run(); if (v.length) return v; errs.push(name + ": empty"); break; }
      catch (e) { if (attempt === 1) errs.push(name + ": " + (e.message || e)); }
    }
  }
  throw fail("feed_failed", "Could not load videos for channel " + id + " (" + errs.join("; ") + "). Open youtube.com/channel/" + id + " to confirm it is the right channel and has public videos. For a reliable fix add a free YOUTUBE_API_KEY in Netlify (see README).");
}

// Best-effort live check without an API key: the channel's /live page names the current stream when one is running.
async function livePage(id) {
  const html = await (await fetch(`https://www.youtube.com/channel/${id}/live`, { headers: PAGE_HEADERS, signal: sig() })).text();
  if (!/"isLiveNow":\s*true/.test(html)) return null;
  const m = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/);
  if (!m) return null;
  const t = html.match(/<meta property="og:title" content="([^"]*)"/);
  return { id: m[1], title: decode(t ? t[1] : "") };
}

/** EVERY video of the channel (finished live streams and normal uploads). Heavy, so it is cached for 30 minutes and shared by all visitors.
 *  With YOUTUBE_API_KEY: the whole uploads playlist through the Data API (up to 1000). Without a key: the uploads playlist page + the channel's /streams tab (finished live streams), merged with the RSS list. */
async function fullList(id, key, store, rss) {
  const ck = "all:" + id, cached = store ? await store.get(ck, { type: "json" }).catch(() => null) : null;
  if (cached && Date.now() - cached.t < 30 * 60e3 && Array.isArray(cached.v) && cached.v.length) return cached.v;
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rj) => setTimeout(() => rj(new Error("timeout")), ms))]);
  let list = [];
  try {
    if (key) list = await withTimeout(apiAll(id, key, "UU", 1000, true), 8000);
    else {
      const VR = [/\"videoRenderer\":\{\"videoId\":\"([\w-]{11})\"/g];
      const [up, st] = await Promise.all([
        withTimeout(scrapeShorts(`https://www.youtube.com/playlist?list=UU${id.slice(2)}`, 1000, 5000, [/\"playlistVideoRenderer\":\{\"videoId\":\"([\w-]{11})\"/g], ""), 8000).catch(() => []),
        withTimeout(scrapeShorts(`https://www.youtube.com/channel/${id}/streams`, 1000, 5000, VR, "ended"), 8000).catch(() => []),
      ]);
      const by = new Map((rss || []).map(v => [v.id, v])), seen = new Set();
      list = [...up, ...st, ...(rss || [])].filter(v => v && v.id && !seen.has(v.id) && seen.add(v.id)).map(v => ({ ...(by.get(v.id) || {}), ...v, t: (by.get(v.id) || {}).t || v.t || "", live: (st.some(x => x.id === v.id) ? "ended" : v.live) || "" }));
      // the lists can be incomplete without a key, so the ones seen before are kept (the list only grows)
      if (cached && cached.v) { const have = new Set(list.map(v => v.id)); list = list.concat(cached.v.filter(v => !have.has(v.id))); }
    }
  } catch (e) { console.log("YouTube full list failed:", e.message); if (cached && cached.v) return cached.v; throw e; }
  if (store && list.length) await store.setJSON(ck, { t: Date.now(), v: list }).catch(() => {});
  return list;
}

async function build(ref, media, store) {
  const key = process.env.YOUTUBE_API_KEY || "";
  const id = await resolveId(ref, key, store);
  let videos = null, source = "rss";
  let apiErr = "";
  if (key) { try { videos = await apiVideos(id, key, 20); source = "api"; } catch (e) { apiErr = e.message; console.log("YouTube API failed, using RSS:", e.message); } }
  if (!videos) videos = await rssVideos(id, 20);
  // all sermons: the newest 20 stay fresh (live status), the rest comes from the cached full list
  try {
    const all = await fullList(id, key, store, videos), have = new Set(videos.map(v => v.id));
    videos = videos.concat(all.filter(v => !have.has(v.id)).map(v => ({ ...v, live: v.live === "live" || v.live === "upcoming" ? "ended" : v.live })));
    if (videos.some(v => v.t)) videos.sort((a, b) => String(b.t || "").localeCompare(String(a.t || "")) || 0);
  } catch (e) { console.log("full list skipped:", e.message); }
  let live = null;
  if (source === "api") live = videos.find(v => v.live === "live") || null;
  else live = await livePage(id).catch(() => null);
  return {
    configured: true, channelId: id, channelUrl: String(media.youtube || "").trim() || `https://www.youtube.com/channel/${id}`,
    source, updated: Date.now(), videos, apiError: apiErr || undefined,
    live: live ? { id: live.id, title: live.title } : null,
  };
}

/** Cached feed. Everyone who opens the app shares one YouTube request per `maxAge` seconds. */
export async function getFeed(media, { force = false, maxAge = 120 } = {}) {
  const ref = parseChannel(media);
  if (!ref) return { configured: false };
  const store = openStore();
  const tag = "v2" + JSON.stringify(ref) + (process.env.YOUTUBE_API_KEY ? "k" : "");
  const cached = store ? await store.get("feed", { type: "json" }).catch(() => null) : null;
  if (!force && cached && cached.tag === tag && Date.now() - cached.t < maxAge * 1000) return cached.data;
  try {
    const data = await build(ref, media, store);
    if (store) await store.setJSON("feed", { t: Date.now(), tag, data }).catch(() => {});
    return data;
  } catch (e) {
    console.log("YouTube feed failed:", e.message);
    if (cached && cached.tag === tag) return { ...cached.data, stale: true };
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Shorts. YouTube keeps every channel's Shorts in a hidden playlist whose id is the channel id with "UC" replaced by "UUSH".
// - With YOUTUBE_API_KEY: that playlist through the Data API, every page (title, date, length): ALL the Shorts, up to 500.
// - Without it: the playlist's public web page + its "continuation" pages (all Shorts, up to 500), then the 15-item RSS feed, then the channel's /shorts page.
//   Without a key the list is also merged with the previous one, so it only grows.
// ---------------------------------------------------------------------------------------------
async function shortsPage(id, n) {
  const html = await (await fetch(`https://www.youtube.com/channel/${id}/shorts`, { headers: PAGE_HEADERS, signal: sig() })).text();
  const out = [], seen = new Set();
  const re = /\/shorts\/([\w-]{11})/g;
  let m;
  while ((m = re.exec(html)) && out.length < n) {
    if (seen.has(m[1])) continue; seen.add(m[1]);
    const near = html.slice(Math.max(0, m.index - 1500), m.index + 1500);
    const t = near.match(/\"accessibilityText\":\"((?:[^\"\\]|\\.)*)\"/) || near.match(/\"title\":\{\"(?:simpleText|content)\":\"((?:[^\"\\]|\\.)*)\"/);
    let title = ""; try { title = t ? JSON.parse('"' + t[1] + '"') : ""; } catch { title = t ? t[1] : ""; }
    out.push({ id: m[1], title: title.replace(/,\s*[\d.,]+\s*(?:[KMB]|lakh|crore)?\s*views?.*$/i, "") || "Short", t: "", dur: 0, live: "" });
  }
  if (!out.length) throw fail("page_failed", "no Shorts found on the channel page");
  return out;
}
/** No API key: scrape a YouTube page (the Shorts playlist, or the channel's Shorts tab) and follow its "continuation" pages until every Short is found (or ~6 s have passed). */
async function scrapeShorts(url, max = 500, ms = 6000, res = null, lf = "") {
  const deadline = Date.now() + ms;
  const html = await (await fetch(url, { headers: PAGE_HEADERS, signal: sig() })).text();
  const out = [], seen = new Set();
  // YouTube uses different renderers over time: playlistVideoRenderer, reelItemRenderer, and (newer) shortsLockupViewModel with a reelWatchEndpoint
  const RES = res || [/\"playlistVideoRenderer\":\{\"videoId\":\"([\w-]{11})\"/g, /\"reelItemRenderer\":\{\"videoId\":\"([\w-]{11})\"/g, /\"reelWatchEndpoint\":\{\"videoId\":\"([\w-]{11})\"/g];
  const grab = txt => {
    for (const re of RES) {
      re.lastIndex = 0; let m;
      while ((m = re.exec(txt))) {
        if (seen.has(m[1])) continue; seen.add(m[1]);
        const near = txt.slice(Math.max(0, m.index - 1200), m.index + 3000);
        const t = near.match(/\"title\":\{\"runs\":\[\{\"text\":\"((?:[^\"\\]|\\.)*)\"/) || near.match(/\"primaryText\":\{\"content\":\"((?:[^\"\\]|\\.)*)\"/) || near.match(/\"headline\":\{\"simpleText\":\"((?:[^\"\\]|\\.)*)\"/) || near.match(/\"accessibilityText\":\"((?:[^\"\\]|\\.)*)\"/);
        let title = ""; try { title = t ? JSON.parse('\"' + t[1] + '\"') : ""; } catch { title = t ? t[1] : ""; }
        out.push({ id: m[1], title: title.replace(/,\s*[\d.,]+\s*(?:[KMB]|lakh|crore)?\s*views?.*$/i, "") || (res ? "Video" : "Short"), t: "", dur: 0, live: lf });
      }
    }
  };
  const next = txt => { const all = [...txt.matchAll(/\"continuationCommand\":\{\"token\":\"([^\"]+)\"/g)]; return all.length ? all[all.length - 1][1] : ""; };
  grab(html);
  const key = (html.match(/\"INNERTUBE_API_KEY\":\"([^\"]+)\"/) || [])[1];
  const ver = (html.match(/\"INNERTUBE_CONTEXT_CLIENT_VERSION\":\"([^\"]+)\"/) || [])[1] || "2.20250101.00.00";
  let c = next(html);
  while (c && key && out.length < max && Date.now() < deadline) {
    let txt;
    try {
      const r = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${key}`, { method: "POST", headers: { ...PAGE_HEADERS, "content-type": "application/json" }, body: JSON.stringify({ context: { client: { clientName: "WEB", clientVersion: ver, hl: "en" } }, continuation: c }), signal: sig() });
      if (!r.ok) break; txt = await r.text();
    } catch { break; }
    const before = out.length; grab(txt); c = next(txt);
    if (out.length === before) break;
  }
  if (!out.length) throw fail("page_failed", "no Shorts found on " + url.replace(/^https:\/\/www\.youtube\.com/, ""));
  return out;
}
const playlistShorts = (id, max = 500) => scrapeShorts(`https://www.youtube.com/playlist?list=UUSH${id.slice(2)}`, max);
async function rssShorts(id, n) {
  const errs = [];
  const routes = [
    ["shorts feed", async () => parseFeed(await feedXml(`https://www.youtube.com/feeds/videos.xml?playlist_id=UUSH${id.slice(2)}`), n)],
    ["shorts page", () => shortsPage(id, n)],
  ];
  for (const [name, run] of routes) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const v = await run(); if (v.length) return v; errs.push(name + ": empty"); break; }
      catch (e) { if (attempt === 1) errs.push(name + ": " + (e.message || e)); }
    }
  }
  throw fail("feed_failed", "Could not load Shorts for channel " + id + " (" + errs.join("; ") + ").");
}

/** With the API key: the Shorts-only playlist (UUSH) often stops around 100, so the channel's FULL uploads list is also read and every video of 3 minutes or less (the Shorts length limit) is added.
 *  A big channel cannot be read within one function call, so the scan is RESUMABLE: each call reads for ~5 s, saves its place in Netlify Blobs and the next call continues (the app keeps asking until `partial` is false). */
async function scanUploads(id, key, store) {
  const k = "scan:" + id, now = Date.now();
  let st = store ? await store.get(k, { type: "json" }).catch(() => null) : null;
  if (!st) st = { tok: "", done: false, shorts: [], scanned: 0, t: now };
  else if (st.done && now - st.t > 12 * 3600e3) st = { ...st, tok: "", done: false, scanned: 0, t: now };   // read everything again twice a day
  if (st.done) return st;
  const g = async url => { const r = await fetch(url, { signal: sig() }); const j = await r.json(); if (!r.ok) throw fail("api_error", "YouTube API " + r.status + ": " + (j.error && j.error.message || "")); return j; };
  const have = new Set(st.shorts.map(v => v.id)), deadline = now + 3500;
  let first = true;
  while (!st.done && Date.now() < deadline) {
    try {
      const pl = await g(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=UU${id.slice(2)}${st.tok ? "&pageToken=" + encodeURIComponent(st.tok) : ""}&key=${key}`);
      const ids = (pl.items || []).map(i => i.contentDetails && i.contentDetails.videoId).filter(Boolean);
      if (ids.length) {
        const vs = await g(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${ids.join(",")}&maxResults=50&key=${key}`);
        (vs.items || []).forEach(v => {
          const dur = isoSec(v.contentDetails && v.contentDetails.duration);
          if (dur > 0 && dur <= 180 && !have.has(v.id)) { have.add(v.id); st.shorts.push({ id: v.id, title: v.snippet.title, t: v.snippet.publishedAt, dur, live: "" }); }
        });
      }
      st.scanned += ids.length; st.tok = pl.nextPageToken || ""; if (!st.tok) st.done = true;
    } catch (e) { if (first && !st.scanned && !st.shorts.length) throw e; break; }   // a later page failing keeps what was already read
    first = false;
  }
  if (store) await store.setJSON(k, st).catch(() => {});
  return st;
}

async function buildShorts(ref, media, store, old) {
  const key = process.env.YOUTUBE_API_KEY || "";
  const id = await resolveId(ref, key, store);
  let videos = null, source = "page", apiErr = "", partial = false;
  const tried = [];
  if (key) {
    try { videos = await apiAll(id, key, "UUSH", 1000); source = "api"; tried.push("api shorts playlist: " + videos.length); }
    catch (e) { apiErr = e.message; console.log("YouTube API (shorts playlist) failed:", e.message); videos = null; }
    try {
      // two independent routes run side by side: (1) the full uploads list through the API, (2) YouTube's own Shorts tab (the list people see on youtube.com) — merged, so a Short missing from one is found by the other
      const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rj) => setTimeout(() => rj(new Error("timeout")), ms))]);
      const [sc, tab] = await Promise.all([
        scanUploads(id, key, store),
        withTimeout(scrapeShorts(`https://www.youtube.com/channel/${id}/shorts`, 1000, 3000), 5000).then(v => ({ ok: true, v }), e => ({ ok: false, e: String(e.message || e).slice(0, 60) })),
      ]);
      const seenIds = new Set((videos || []).map(v => v.id)), tabNew = (tab.ok ? tab.v : []).filter(v => !seenIds.has(v.id));
      tried.push("youtube shorts tab: " + (tab.ok ? tab.v.length + " found, " + tabNew.length + " new" : "failed (" + tab.e + ")"));
      const have = new Set([...seenIds, ...tabNew.map(v => v.id)]), extra = sc.shorts.filter(v => !have.has(v.id)).concat(tabNew);
      partial = !sc.done;
      tried.push("uploads read: " + sc.scanned + (sc.done ? " (complete)" : " (still reading...)") + ", short clips found: " + sc.shorts.length + ", added: " + extra.length);
      if (extra.length || videos) { videos = (videos || []).concat(extra); source = "api"; if (videos.length) apiErr = ""; }
      videos && videos.sort((a, b) => String(b.t).localeCompare(String(a.t)));
    } catch (e) { if (!videos) apiErr = apiErr || e.message; tried.push("uploads: failed (" + String(e.message || e).slice(0, 80) + ")"); console.log("YouTube API (uploads) failed:", e.message); }
  }
  if (!videos) {
    // No API key: YouTube's RSS only has 15, so run EVERY route and merge them (a route that fails just adds nothing)
    source = "page";
    const routes = [
      ["playlist page", () => scrapeShorts(`https://www.youtube.com/playlist?list=UUSH${id.slice(2)}`, 500)],
      ["shorts tab", () => scrapeShorts(`https://www.youtube.com/channel/${id}/shorts`, 500)],
      ["rss feed", () => rssShorts(id, 30)],
    ];
    const got = [];
    for (const [name, run] of routes) {
      try { const v = await run(); got.push(...v); tried.push(name + ": " + v.length); }
      catch (e) { tried.push(name + ": failed (" + String(e.message || e).slice(0, 80) + ")"); }
    }
    const seen0 = new Set(); videos = got.filter(v => v && v.id && !seen0.has(v.id) && seen0.add(v.id));
    if (videos.length <= 30) source = "rss";
    // without the API the lists can be incomplete, so keep every Short seen before (the list only grows)
    const seen = new Set(videos.map(v => v.id));
    videos = videos.concat((old || []).filter(v => v && v.id && !seen.has(v.id))).slice(0, 1000);
    if (!videos.length && tried.every(x => /failed/.test(x)) && !tried.some(x => /404|no Shorts/i.test(x))) throw fail("feed_failed", "Could not load Shorts (" + tried.join("; ") + "). Add YOUTUBE_API_KEY in Netlify for a reliable list.");
  }
  return {
    configured: true, v: 4, channelId: id, channelUrl: String(media.youtube || "").trim() || `https://www.youtube.com/channel/${id}`,
    source, updated: Date.now(), videos, total: videos.length, apiError: apiErr || undefined,
    // YouTube's public RSS feed only ever lists the newest 15, so when it was the source the list is known to be incomplete
    limited: (!key || !!apiErr) && videos.length <= 30 || undefined, hasKey: !!key, partial: partial || undefined, tried: tried.length ? tried : undefined,
  };
}

/** Cached Shorts list (its own cache entry; shared by every visitor for `maxAge` seconds). */
export async function getShorts(media, { force = false, maxAge = 1800 } = {}) {
  const ref = parseChannel(media);
  if (!ref) return { configured: false };
  const store = openStore();
  const tag = "v4" + JSON.stringify(ref) + (process.env.YOUTUBE_API_KEY ? "k" : "");
  const cached = store ? await store.get("shorts", { type: "json" }).catch(() => null) : null;
  if (!force && cached && cached.tag === tag && Date.now() - cached.t < (cached.data && cached.data.partial ? 2 : maxAge) * 1000) return cached.data;
  try {
    const data = await buildShorts(ref, media, store, cached && cached.tag === tag && cached.data && cached.data.videos);
    if (store) await store.setJSON("shorts", { t: Date.now(), tag, data }).catch(() => {});
    return data;
  } catch (e) {
    console.log("YouTube Shorts failed:", e.message);
    if (cached && cached.tag === tag) return { ...cached.data, stale: true };
    throw e;
  }
}

/** The newest Shorts, uncached (a handful of items): used by the scheduled new-Short alert. */
export async function latestShorts(media) {
  const ref = parseChannel(media);
  if (!ref) return [];
  const key = process.env.YOUTUBE_API_KEY || "";
  const id = await resolveId(ref, key, openStore());
  if (key) { try { return await apiVideos(id, key, 15, "UUSH"); } catch (e) { console.log("latestShorts: API failed", e.message); } }
  try { return await rssShorts(id, 15); } catch { return await playlistShorts(id, 30); }
}
