// GET /api/youtube -> { configured, channelId, channelUrl, videos:[{id,title,t,dur,live}], live:{id,title}|null, source }
// The channel comes from Admin -> YouTube & Android App.
import media from "../../content/youtube_app.json";
import settings from "../../content/settings.json";
import { getFeed, withSettings } from "../lib/yt.mjs";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "public, max-age=20" } });

export default async () => {
  try { return J(await getFeed(withSettings(media, settings))); }
  catch (e) { return J({ configured: true, error: e.code || "unavailable", detail: String(e.message || "").slice(0, 300) }, 502); }
};

export const config = { path: "/api/youtube" };
