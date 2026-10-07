// Who counts as an approved member?
//  - anyone who has the "contributor" or "admin" role (the admin approves a sign-up by giving the contributor role), or
//  - anyone the admin invited from Netlify Identity (the server sets invited_at, a person cannot fake it).
// A person who signed up by themselves has neither, so they are "pending" until the admin approves them.
export const isApproved = (u) => {
  if (!u) return false;
  const roles = (u.app_metadata && u.app_metadata.roles) || [];
  return roles.includes("contributor") || roles.includes("admin") || !!u.invited_at;
};

// Asks Netlify Identity itself who the token belongs to. Returns the user only when approved.
export async function approvedUser(req) {
  const a = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+/i.test(a)) return null;
  try {
    const r = await fetch(new URL("/.netlify/identity/user", req.url), { headers: { authorization: a } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.email && isApproved(u) ? u : null;
  } catch { return null; }
}

// Admin = the "admin" role only (full admin panel, approvals, clearing Bible notes). Contributors can add songs but are not admins.
export async function adminUser(req) {
  const u = await approvedUser(req);
  const roles = (u && u.app_metadata && u.app_metadata.roles) || [];
  return u && roles.includes("admin") ? u : null;
}
