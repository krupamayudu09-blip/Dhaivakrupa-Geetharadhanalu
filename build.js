// Builds /dist: copies the site, bundles songs (+ XML uploads) and settings into data.json
const fs = require('fs'), path = require('path');
const out = 'dist';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
['index.html','admin','uploads','bible','manifest.webmanifest','sw.js','verse-img.js','icon.svg','daily-verses.json']
  .forEach(f => fs.existsSync(f) && fs.cpSync(f, path.join(out, f), { recursive: true }));
// A broken file (empty upload, leftover git conflict markers, bad JSON) must not stop the whole deploy: it is reported by name and skipped.
const BAD = [];
const read = f => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); }
  catch (e) { BAD.push(f); console.warn('!! SKIPPED unreadable file:', f, '-', e.message.split('\n')[0]); return null; }
};
const settings = (fs.existsSync('content/settings.json') && read('content/settings.json')) || {};
// Admin -> "YouTube & Android App" lives in its own file; merge it so the site sees one settings object.
const media = (fs.existsSync('content/youtube_app.json') && read('content/youtube_app.json')) || {};
Object.entries(media).forEach(([k, v]) => { if ((v !== '' && v != null) || !(k in settings)) settings[k] = v; });
// Admin -> "Daily Verse Image" (content/verse_image.json): merged into the same settings object (keys start with vi_)
const vimg = (fs.existsSync('content/verse_image.json') && read('content/verse_image.json')) || {};
Object.entries(vimg).forEach(([k, v]) => { settings[k] = v; });
// APK uploaded in the admin: the download card shows its size (links to other sites have no size)
(function apk() {
  const u = String(settings.apk_file || '').replace(/^\/+/, '');
  if (!u || /^https?:/i.test(u)) return;
  try { settings.apk_size = fs.statSync(u).size; console.log('APK:', u, (settings.apk_size / 1048576).toFixed(1) + ' MB'); }
  catch (e) { console.warn('APK file not found:', u); }
})();

// ---- Web-app icon (Admin → Site Settings → App icon): manifest + home-screen icon + notification icon ----
(function appIcon() {
  const ok = u => typeof u === 'string' && /^\/?[\w\-.\/%]+\.(png|jpe?g|webp|svg|gif)$/i.test(u);
  const norm = u => '/' + u.replace(/^\/+/, '');
  const icon = ok(settings.app_icon) ? norm(settings.app_icon) : '', mask = ok(settings.app_icon_maskable) ? norm(settings.app_icon_maskable) : '';
  const mime = u => ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml', gif: 'image/gif' })[u.split('.').pop().toLowerCase()];
  const pngSize = u => { try { const b = fs.readFileSync(u.slice(1)); if (b.length > 24 && b.toString('latin1', 1, 4) === 'PNG') return [b.readUInt32BE(16), b.readUInt32BE(20)]; } catch (e) {} return null; };
  const entries = [];
  const add = (u, purpose) => {
    if (!u) return;
    const sz = mime(u) === 'image/png' ? pngSize(u) : null, svg = mime(u) === 'image/svg+xml';
    if (!fs.existsSync(u.slice(1)) && !u.startsWith('/icon')) console.warn('App icon file not found:', u);
    if (svg) entries.push({ src: u, sizes: 'any', type: mime(u), purpose });
    else if (sz && sz[0] >= 512) { entries.push({ src: u, sizes: '192x192', type: mime(u), purpose }); entries.push({ src: u, sizes: '512x512', type: mime(u), purpose }); }
    else entries.push({ src: u, sizes: sz ? `${sz[0]}x${sz[1]}` : '512x512', type: mime(u), purpose });
  };
  if (icon) { add(icon, 'any'); add(mask || icon, 'maskable'); }
  else if (mask) { add(mask, 'maskable'); entries.push({ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }); }
  else entries.push({ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' });
  const name = settings.site_name_te || settings.site_name || 'Dhaivakrupa';
  const manifest = { name, short_name: (settings.app_short_name || '').trim() || name, start_url: '/', display: 'standalone', background_color: '#F4F7FC', theme_color: settings.ink || '#17305C', icons: entries };
  fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify(manifest));
  const shown = icon || '/icon.svg';
  ['index.html', 'sw.js'].forEach(f => { const p = path.join(out, f); if (fs.existsSync(p)) fs.writeFileSync(p, fs.readFileSync(p, 'utf8').split("'/icon.svg'").join(`'${shown}'`).split('"/icon.svg"').join(`"${shown}"`)); });
  if (settings.ink && fs.existsSync(path.join(out, 'index.html'))) { const p = path.join(out, 'index.html'); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('<meta name="theme-color" content="#17305C">', `<meta name="theme-color" content="${String(settings.ink).replace(/[^#\w]/g, '')}">`)); }
  console.log('App icon:', shown);
})();

// small file for the notification image (service worker reads it): pastor / church shown on the daily verse
const pick = (...v) => { for (const x of v) if (x != null && String(x).trim() !== '') return x; return ''; };   // first non-empty value
fs.writeFileSync(path.join(out, 'pastor.json'), JSON.stringify({
  // Daily Verse Image can override the pastor / church details; empty = the General Settings value
  name: pick(settings.vi_pastor_name, settings.pastor_name), phone: settings.vi_show_phone === false ? '' : pick(settings.vi_pastor_phone, settings.pastor_phone),
  church: pick(settings.vi_church_name, settings.church_name), photo: pick(settings.vi_pastor_photo, settings.pastor_photo),
  ink: settings.ink || '', accent: settings.accent || '',
  vi: { title: settings.vi_title || '', hlOn: settings.vi_hl_on !== false, hlColor: settings.vi_hl_color || '', showPastor: settings.vi_show_pastor !== false, showPhone: settings.vi_show_phone !== false, scale: +settings.vi_pastor_scale || 100,
    font: settings.vi_font || '', hlFont: settings.vi_hl_font || '', textSize: +settings.vi_text_size || 100, hlSize: +settings.vi_hl_size || 100, hls: settings.vi_hls || [],
    greetOn: settings.vi_greet_on === true, greet: settings.vi_greet || '', dateOn: settings.vi_date_on === true, dateLang: settings.vi_date_lang === 'te' ? 'te' : 'en',
    bgs: (settings.vi_bgs || []).filter(x => x && x.image).map(x => ({ image: x.image, theme: x.theme || '' })) } }));
const dec = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').trim();
const tag = (b, t) => { const m = b.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, 'i')); return m ? dec(m[1]) : ''; };
function parseXml(txt) {
  const blocks = txt.match(/<song[\s>][\s\S]*?<\/song>/gi) || [];
  return blocks.map(b => ({
    title: tag(b,'title'), title_en: tag(b,'title_en'), category: tag(b,'category'),
    writer: tag(b,'writer'), scale: tag(b,'scale'), lyrics: tag(b,'lyrics'), youtube: tag(b,'youtube')
  })).filter(s => s.title || s.lyrics);
}

const dir = 'content/songs', songs = [];
(fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : []).forEach(f => {
  const s = read(path.join(dir, f)); if (!s || typeof s !== 'object') return; s.id = f.replace(/\.json$/, '');
  if (s.published === false) return;
  let xml = [];
  if (s.xml_file) {
    const p = s.xml_file.replace(/^\//, '');
    try { xml = parseXml(fs.readFileSync(p, 'utf8')); } catch (e) { console.warn('XML not readable:', p); }
  }
  if (!xml.length) { if (s.title) songs.push(s); return; }
  xml.forEach((x, i) => {
    const o = { ...s, id: `${s.id}-${i + 1}` };
    Object.keys(x).forEach(k => { if (x[k]) o[k] = x[k]; });
    if (!x.title && xml.length === 1 && s.title) o.title = s.title;
    if (!o.title) return;
    delete o.xml_file; o.featured = !!s.featured && xml.length === 1;
    songs.push(o);
  });
});
songs.sort((a, b) => a.title.localeCompare(b.title, 'te'));
// categories managed in the admin (Categories), plus any category used by a song/XML that isn't listed
const cdir = 'content/categories', cats = [];
(fs.existsSync(cdir) ? fs.readdirSync(cdir).filter(f => f.endsWith('.json')) : []).forEach(f => {
  const c = read(path.join(cdir, f)); if (c && c.name) cats.push({ name: c.name, order: +c.order || 999 });
});
cats.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'te'));
songs.forEach(s => { if (s.category && !cats.some(c => c.name === s.category)) cats.push({ name: s.category, order: 999 }); });
fs.writeFileSync(path.join(out, 'data.json'), JSON.stringify({ settings, songs, categories: cats.map(c => c.name) }));
console.log(`Built ${songs.length} songs`);
if (BAD.length) console.warn(`Skipped ${BAD.length} unreadable file(s): ${BAD.join(', ')}`);
