// Inlines the built JS + CSS (+ icon) into one standalone HTML file: dist/zpercraft.html
import fs from 'node:fs'; import path from 'node:path';
const d = 'dist'; let html = fs.readFileSync(path.join(d, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+)"[^>]*>/g, (_, f) => `<style>${fs.readFileSync(path.join(d, f), 'utf8')}</style>`);
html = html.replace(/<script type="module"[^>]*src="\.?\/?([^"]+)"[^>]*><\/script>/g, (_, f) => `<script type="module">${fs.readFileSync(path.join(d, f), 'utf8').replace(/<\/script/g, '<\\/script')}</script>`);
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
html = html.replace(/<link rel="icon" href="icon.png" \/>/, `<link rel="icon" href="data:image/png;base64,${fs.readFileSync(path.join(d, 'icon.png')).toString('base64')}" />`);
fs.writeFileSync(path.join(d, 'zpercraft.html'), html); console.log('written', (html.length / 1024).toFixed(0) + ' KB');
