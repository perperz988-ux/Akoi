// Inlines the built JS + CSS into one standalone HTML file: flight/dist/skyward.html
import fs from 'node:fs'; import path from 'node:path';
const d = 'flight/dist'; let html = fs.readFileSync(path.join(d, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+)"[^>]*>/g, (_, f) => `<style>${fs.readFileSync(path.join(d, f), 'utf8')}</style>`);
html = html.replace(/<script type="module"[^>]*src="\.?\/?([^"]+)"[^>]*><\/script>/g, (_, f) => `<script type="module">${fs.readFileSync(path.join(d, f), 'utf8').replace(/<\/script/g, '<\\/script')}</script>`);
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
const icon = path.join(d, 'icon.png'); if (fs.existsSync(icon)) html = html.replace(/href="\.\/icon\.png"/g, `href="data:image/png;base64,${fs.readFileSync(icon).toString('base64')}"`);
fs.writeFileSync(path.join(d, 'skyward.html'), html); console.log('written', (html.length / 1024).toFixed(0) + ' KB');
