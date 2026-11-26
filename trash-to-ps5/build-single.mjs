// Inlines the built JS + CSS into one standalone HTML file: release/trash-to-ps5.html
import fs from 'node:fs'; import path from 'node:path';
const d = 'dist-ps5'; let html = fs.readFileSync(path.join(d, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+)"[^>]*>/g, (_, f) => `<style>${fs.readFileSync(path.join(d, f), 'utf8')}</style>`);
html = html.replace(/<script type="module"[^>]*src="\.?\/?([^"]+)"[^>]*><\/script>/g, (_, f) => `<script type="module">${fs.readFileSync(path.join(d, f), 'utf8').replace(/<\/script/g, '<\\/script')}</script>`);
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
fs.mkdirSync('release', { recursive: true });
fs.writeFileSync('release/trash-to-ps5.html', html); console.log('written release/trash-to-ps5.html', (html.length / 1024).toFixed(0) + ' KB');
