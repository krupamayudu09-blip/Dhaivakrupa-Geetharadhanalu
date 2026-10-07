// Admin-only: list people who signed up, approve them (gives the "contributor" role) or reject / remove them.
// Uses the short-lived admin token Netlify hands to a function when the caller sends a valid Identity login.
import { isApproved } from "../lib/approved.mjs";

const J = (o, s = 200) => ({ statusCode: s, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(o) });
const rolesOf = (u) => (u && u.app_metadata && u.app_metadata.roles) || [];

export const handler = async (event, context) => {
  const idn = context.clientContext && context.clientContext.identity;
  const me = context.clientContext && context.clientContext.user;
  if (!idn || !idn.url || !idn.token || !me) return J({ error: "Please log in at /admin/ first" }, 401);

  const call = (path, init = {}) => fetch(idn.url + path, { ...init, headers: { authorization: "Bearer " + idn.token, "content-type": "application/json" } });

  // every user (paged)
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const r = await call(`/admin/users?page=${page}&per_page=100`);
    if (!r.ok) return J({ error: "Could not read users (" + r.status + ")" }, 502);
    const j = await r.json();
    const batch = Array.isArray(j) ? j : j.users || [];
    all.push(...batch);
    if (batch.length < 100) break;
  }

  // the caller must have the "admin" role
  const self = all.find((u) => u.id === me.sub || u.email === me.email);
  const mine = rolesOf(self);
  const admin = !!self && mine.includes("admin");
  if (!admin) return J({ error: "Admins only. Give your account the role 'admin' in Netlify → Identity → Edit user → Roles." }, 403);

  if (event.httpMethod === "GET") {
    const users = all.map((u) => ({
      id: u.id, email: u.email, name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || "",
      created_at: u.created_at, confirmed: !!u.confirmed_at, roles: rolesOf(u), invited: !!u.invited_at,
      status: isApproved(u) ? "approved" : "pending",
    }));
    return J({ users });
  }

  if (event.httpMethod === "POST") {
    let b; try { b = JSON.parse(event.body || "{}"); } catch { return J({ error: "bad request" }, 400); }
    const u = all.find((x) => x.id === b.id);
    if (!u) return J({ error: "User not found" }, 404);
    if (u.id === self.id) return J({ error: "You cannot change your own account here" }, 400);

    if (b.action === "approve") {
      const roles = [...new Set([...rolesOf(u), "contributor"])];
      // confirm:true also confirms the e-mail, so the person can log in right away
      const r = await call(`/admin/users/${u.id}`, { method: "PUT", body: JSON.stringify({ app_metadata: { ...(u.app_metadata || {}), roles }, confirm: true }) });
      return r.ok ? J({ ok: true }) : J({ error: "Could not approve (" + r.status + ")" }, 502);
    }
    if (b.action === "remove") {
      if (rolesOf(u).includes("admin")) return J({ error: "Remove admins in Netlify → Identity" }, 400);
      const r = await call(`/admin/users/${u.id}`, { method: "DELETE" });
      return r.ok ? J({ ok: true }) : J({ error: "Could not remove (" + r.status + ")" }, 502);
    }
    return J({ error: "Unknown action" }, 400);
  }
  return J({ error: "method" }, 405);
};
