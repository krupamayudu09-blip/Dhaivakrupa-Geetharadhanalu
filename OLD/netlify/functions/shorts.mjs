// GET /api/shorts -> { configured, channelId, channelUrl, videos:[{id,title,t,dur}], source }
// The channel comes from Admin -> YouTube & Android App (same setting as the Sermons tab).
import media from "../../content/youtube_app.json";
import settings from "../../content/settings.json";
import { getShorts, withSettings } from "../lib/yt.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "public, max-age=60" } });

export default async () => {
  try { return J(await getShorts(withSettings(media, settings))); }
  catch (e) { return J({ configured: true, error: e.code || "unavailable", detail: String(e.message || "").slice(0, 300) }, 502); }
};

export const config = { path: "/api/shorts" };
