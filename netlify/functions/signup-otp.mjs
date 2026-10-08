// Contributor sign-up with an e-mail OTP (one-time code) and NO admin approval.
//   POST /.netlify/functions/signup-otp {op:"send",   email, name}               -> e-mails a 6-digit code
//   POST /.netlify/functions/signup-otp {op:"verify", email, name, password, code} -> checks the code, then creates the account
//                                                                                    already confirmed and with the "contributor" role
// The code proves the person owns the e-mail address; after that the account is approved at once.
// Needs these Netlify environment variables (use EITHER the Gmail pair, which needs no domain, OR the Resend pair):
//   GMAIL_USER, GMAIL_APP_PASSWORD  - a Gmail address and a Google App Password (2-Step Verification must be on)
//   RESEND_API_KEY  – API key from resend.com (free plan is enough)
//   OTP_FROM        – sender, e.g.  Dhaivakrupa <noreply@your-verified-domain.com>
// Codes are stored only as a hash (Netlify Blobs store "signup-otp"), expire after 10 minutes, allow 5 wrong tries and
// can be re-sent once a minute.
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { connectLambda, getStore } from "@netlify/blobs";

const J = (o, s = 200) => ({ statusCode: s, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(o) });
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const TTL = 10 * 60e3, GAP = 60e3, TRIES = 5;
const hash = (email, code) => createHash("sha256").update(`${email}|${code}|${process.env.OTP_SECRET || "dk-otp"}`).digest("hex");
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const clean = (v, n) => String(v == null ? "" : v).replace(/[\r\n<>]/g, " ").trim().slice(0, n);

async function sendMail(to, code, name) {
  const subject = `Your verification code: ${code}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:420px"><p>${name ? "Hello " + name.replace(/[&<>"]/g, "") + "," : "Hello,"}</p><p>Your contributor sign-up code is</p><p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:8px 0">${code}</p><p>It works for 10 minutes. If you did not ask for it, ignore this e-mail.</p></div>`;
  const text = `Your contributor sign-up code is ${code}. It works for 10 minutes.`;
  // Option 1 (no domain needed): a Gmail account with an App Password
  const gu = process.env.GMAIL_USER, gp = process.env.GMAIL_APP_PASSWORD;
  if (gu && gp) {
    try {
      const nodemailer = (await import("nodemailer")).default;
      const tr = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: gu, pass: String(gp).replace(/\s+/g, "") } });
      await tr.sendMail({ from: process.env.OTP_FROM || `Dhaivakrupa <${gu}>`, to, subject, html, text });
      return;
    } catch (e) { console.log("gmail send failed", e.message); throw Object.assign(new Error("Could not send the e-mail with Gmail. Check GMAIL_USER and GMAIL_APP_PASSWORD in Netlify (it must be an App Password, not the normal password)."), { status: 502 }); }
  }
  // Option 2: Resend with a verified domain
  const key = process.env.RESEND_API_KEY, from = process.env.OTP_FROM;
  if (!key || !from) throw Object.assign(new Error("E-mail sending is not set up yet. The admin must add GMAIL_USER and GMAIL_APP_PASSWORD (or RESEND_API_KEY and OTP_FROM) in Netlify."), { status: 503 });
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + key, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!r.ok) throw Object.assign(new Error("Could not send the e-mail (" + r.status + "). Check the OTP_FROM address / domain in Resend."), { status: 502 });
}

const run = async (event, context) => {
  if (event.httpMethod !== "POST") return J({ error: "method" }, 405);
  let b; try { b = JSON.parse(event.body || "{}"); } catch { return J({ error: "Bad request" }, 400); }
  const email = clean(b.email, 254).toLowerCase(), name = clean(b.name, 80);
  if (!EMAIL.test(email)) return J({ error: "Enter a valid e-mail address" }, 400);

  try { connectLambda(event); } catch {}
  const store = getStore({ name: "signup-otp" });   // writes/deletes: default mode (no strong-consistency requirement)
  // reads: try strong consistency, fall back to the default if this environment does not support it (BlobsConsistencyError)
  const readRec = async (k) => {
    try { return await getStore({ name: "signup-otp", consistency: "strong" }).get(k, { type: "json" }); }
    catch (e) { try { return await store.get(k, { type: "json" }); } catch { return null; } }
  };
  const key = createHash("sha256").update(email).digest("hex").slice(0, 40);
  const now = Date.now();
  const rec = await readRec(key);

  if (b.op === "send") {
    if (rec && now - rec.sent < GAP) return J({ error: `Please wait ${Math.ceil((GAP - (now - rec.sent)) / 1000)} seconds before asking for a new code` }, 429);
    const idn = context.clientContext && context.clientContext.identity;
    if (idn && idn.url && idn.token) {   // tell people who already have an account before they wait for an e-mail
      try {
        const r = await fetch(idn.url + "/admin/users?per_page=1&filter=" + encodeURIComponent(email), { headers: { authorization: "Bearer " + idn.token } });
        if (r.ok) { const j = await r.json(), l = Array.isArray(j) ? j : j.users || []; if (l.some((u) => String(u.email).toLowerCase() === email)) return J({ error: "This e-mail already has an account. Log in instead (or use “Forgot password”)." }, 409); }
      } catch {}
    }
    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    try { await sendMail(email, code, name); } catch (e) { return J({ error: e.message }, e.status || 502); }
    await store.setJSON(key, { h: hash(email, code), exp: now + TTL, sent: now, tries: 0 });
    return J({ ok: true });
  }

  if (b.op === "verify") {
    const code = clean(b.code, 10).replace(/\D/g, ""), password = String(b.password || "");
    if (password.length < 8) return J({ error: "Password must be at least 8 characters" }, 400);
    if (!rec || now > rec.exp) return J({ error: "The code has expired. Ask for a new one." }, 400);
    if (rec.tries >= TRIES) { await store.delete(key).catch(() => {}); return J({ error: "Too many wrong tries. Ask for a new code." }, 429); }
    if (code.length !== 6 || !same(hash(email, code), rec.h)) {
      await store.setJSON(key, { ...rec, tries: rec.tries + 1 });
      return J({ error: `Wrong code (${TRIES - rec.tries - 1} tries left)` }, 400);
    }
    const idn = context.clientContext && context.clientContext.identity;
    if (!idn || !idn.url || !idn.token) return J({ error: "Netlify Identity is not enabled for this site" }, 503);
    // create the account already confirmed and approved (contributor role) – no admin step
    const r = await fetch(idn.url + "/admin/users", {
      method: "POST",
      headers: { authorization: "Bearer " + idn.token, "content-type": "application/json" },
      body: JSON.stringify({ email, password, confirm: true, user_metadata: { full_name: name }, app_metadata: { roles: ["contributor"] } }),
    });
    if (r.status === 422 || r.status === 409) { await store.delete(key).catch(() => {}); return J({ error: "This e-mail already has an account. Log in instead." }, 409); }
    if (!r.ok) return J({ error: "Could not create the account (" + r.status + ")" }, 502);
    await store.delete(key).catch(() => {});   // a code works only once
    return J({ ok: true });
  }
  return J({ error: "op" }, 400);
};

// Safety wrapper: any unexpected crash is returned as a readable message instead of a blank 502.
export const handler = async (event, context) => {
  try { return await run(event, context); }
  catch (e) {
    console.log("signup-otp crashed:", e && e.stack || e);
    return J({ error: "Server problem: " + (e && e.name ? e.name + " - " : "") + (e && e.message ? e.message : String(e)) }, 500);
  }
};
