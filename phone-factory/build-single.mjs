// Inlines the built JS + CSS into one standalone HTML file: release/phone-factory.html
import fs from 'node:fs'; import path from 'node:path';
const d = 'dist-pf'; let html = fs.readFileSync(path.join(d, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+)"[^>]*>/g, (_, f) => `<style>${fs.readFileSync(path.join(d, f), 'utf8')}</style>`);
html = html.replace(/<script type="module"[^>]*src="\.?\/?([^"]+)"[^>]*><\/script>/g, (_, f) => `<script type="module">${fs.readFileSync(path.join(d, f), 'utf8').replace(/<\/script/g, '<\\/script')}</script>`);
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
// inline favicons / touch icons as data URIs
html = html.replace(/(<link rel="(?:icon|apple-touch-icon)"[^>]*href=")\.?\/?([^"]+)"/g, (m, pre, f) => {
  if (f.startsWith('data:')) return m; const file = path.join(d, f); if (!fs.existsSync(file)) return m;
  const mime = f.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
  return `${pre}data:${mime};base64,${fs.readFileSync(file).toString('base64')}"`;
});
fs.mkdirSync('release', { recursive: true });
fs.writeFileSync('release/phone-factory.html', html); console.log('written release/phone-factory.html', (html.length / 1024).toFixed(0) + ' KB');
