/* Shared by the website and scheduler. Upload Unicode fonts in Site Settings. */
window.applySiteFonts = async function(settings = {}) {
  const root = document.documentElement.style;
  const defaults = {
    serif: '"Noto Serif Telugu", Georgia, serif',
    sans: '"Noto Sans Telugu", system-ui, sans-serif'
  };
  const loaded = await Promise.all(['te', 'en'].map(async lang => {
    const file = settings['font_' + lang + '_file'];
    if (!file || !window.FontFace) return '';
    const family = lang === 'te' ? 'DhaivakrupaTelugu' : 'DhaivakrupaEnglish';
    try {
      const url = new URL(file, location.href);
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      const face = new FontFace(family, 'url(' + JSON.stringify(url.href) + ')', {
        unicodeRange: lang === 'te' ? 'U+0C00-0C7F,U+200C-200D' : 'U+0000-0BFF,U+0C80-10FFFF',
        display: 'swap'
      });
      await face.load();
      document.fonts.add(face);
      return '"' + family + '"';
    } catch (error) {
      console.warn('Custom ' + lang + ' font unavailable; using the default font.');
      return '';
    }
  }));
  const prefix = loaded.filter(Boolean).join(', ');
  for (const key of ['serif', 'sans']) root.setProperty('--' + key, (prefix ? prefix + ', ' : '') + defaults[key]);
};
