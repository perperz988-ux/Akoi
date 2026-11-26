// Fictional phone OS rendered to a canvas (used for the 3D screen and the OS designer preview).
export const APP_ICONS = {
  'Teléfono': '📞', Mensajes: '💬', 'Cámara': '📷', 'Galería': '🖼️', Navegador: '🌐', Correo: '✉️', Mapas: '🗺️', 'Música': '🎵', Tienda: '🛍️', Reloj: '⏰', Tiempo: '⛅', Ajustes: '⚙️',
  Notas: '📝', Calculadora: '🧮', Cartera: '💳', Salud: '❤️', Juegos: '🎮', 'Vídeo': '🎬', Archivos: '📁', Calendario: '📅', Podcasts: '🎙️', Deporte: '🏃', Traductor: '🈯', Asistente: '✨',
};
export const ALL_APPS = Object.keys(APP_ICONS);
export const CONTROL_TILES = { 'Wi-Fi': '📶', Bluetooth: '🔵', 'Modo avión': '✈️', Linterna: '🔦', 'Rotación': '🔄', 'No molestar': '🌙', 'Ahorro batería': '🔋', 'Punto acceso': '📡', 'Cámara': '📷', 'Grabar pantalla': '⏺️', Calculadora: '🧮', NFC: '💳', 'Modo oscuro': '🌓', 'Ubicación': '📍', 'Modo juego': '🎮', 'SOS satélite': '🛰️' };
export const WALLPAPERS = ['aurora', 'waves', 'dots', 'mesh', 'solid', 'stripes', 'galaxy', 'sunset'];
export const PALETTES = { vivid: ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff2d55'], pastel: ['#ffadad', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff'], mono: ['#2b2d42', '#3d405b', '#4a4e69', '#22223b', '#33415c'], neon: ['#ff00e6', '#00f0ff', '#39ff14', '#fffb00', '#ff6b00', '#b026ff'], earth: ['#606c38', '#283618', '#dda15e', '#bc6c25', '#8d6346', '#a3b18a'] };
const FONTS = { sans: 'system-ui, Segoe UI, Roboto, sans-serif', rounded: '"Arial Rounded MT Bold", "Varela Round", system-ui, sans-serif', mono: 'ui-monospace, Menlo, monospace', serif: 'Georgia, "Times New Roman", serif' };

function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
function shapePath(g, shape, x, y, s) {
  g.beginPath();
  if (shape === 'circle') g.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
  else if (shape === 'square') { rr(g, x, y, s, s, s * 0.08); }
  else if (shape === 'teardrop') { g.moveTo(x + s / 2, y); g.arcTo(x + s, y, x + s, y + s, s * 0.05); g.arcTo(x + s, y + s, x, y + s, s / 2); g.arcTo(x, y + s, x, y, s / 2); g.arcTo(x, y, x + s, y, s / 2); g.closePath(); }
  else if (shape === 'hex') { for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; const px = x + s / 2 + Math.cos(a) * s / 2, py = y + s / 2 + Math.sin(a) * s / 2; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.closePath(); }
  else rr(g, x, y, s, s, s * 0.27);
}
export function drawWallpaper(g, W, H, os, t = 0) {
  const { c1, c2 } = os;
  if (os.wallpaper === 'solid') { g.fillStyle = c1; g.fillRect(0, 0, W, H); return; }
  const gr = g.createLinearGradient(0, 0, W * 0.4, H); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.save();
  switch (os.wallpaper) {
    case 'aurora': for (let i = 0; i < 4; i++) { const x = W * (0.2 + 0.25 * i) + Math.sin(t * 0.5 + i) * 20, y = H * (0.25 + 0.15 * i); const rg = g.createRadialGradient(x, y, 0, x, y, W * 0.6); rg.addColorStop(0, i % 2 ? 'rgba(255,255,255,0.25)' : 'rgba(0,255,200,0.22)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); } break;
    case 'waves': g.globalAlpha = 0.18; g.fillStyle = '#fff'; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 8) g.lineTo(x, H * (0.35 + k * 0.1) + Math.sin(x / 40 + k + t) * 14); g.lineTo(W, H); g.fill(); } break;
    case 'dots': g.globalAlpha = 0.22; g.fillStyle = '#fff'; for (let y = 10; y < H; y += 22) for (let x = 10 + ((y / 22) % 2) * 11; x < W; x += 22) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); } break;
    case 'mesh': g.globalAlpha = 0.15; g.strokeStyle = '#fff'; g.lineWidth = 1; for (let i = -H; i < W; i += 26) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + H, H); g.stroke(); g.beginPath(); g.moveTo(i + H, 0); g.lineTo(i, H); g.stroke(); } break;
    case 'stripes': g.globalAlpha = 0.2; g.fillStyle = '#fff'; for (let i = -H; i < W; i += 40) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 18, 0); g.lineTo(i + 18 + H, H); g.lineTo(i + H, H); g.fill(); } break;
    case 'galaxy': for (let i = 0; i < 160; i++) { const x = (i * 97) % W, y = (i * 61) % H; g.fillStyle = `rgba(255,255,255,${0.3 + ((i * 13) % 7) / 10})`; g.fillRect(x, y, 1.5, 1.5); } { const rg = g.createRadialGradient(W * 0.6, H * 0.4, 0, W * 0.6, H * 0.4, W * 0.7); rg.addColorStop(0, 'rgba(255,200,255,0.35)'); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); } break;
    case 'sunset': { const x = W / 2, y = H * 0.55; const rg = g.createRadialGradient(x, y, 0, x, y, W * 0.35); rg.addColorStop(0, 'rgba(255,230,120,0.9)'); rg.addColorStop(1, 'rgba(255,120,60,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(30,10,40,0.5)'; g.fillRect(0, H * 0.62, W, H); } break;
  }
  g.restore();
}
function statusBar(g, W, s, os, fg, time) {
  g.fillStyle = fg; g.font = `600 ${14 * s}px ${FONTS[os.font]}`; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(time, 18 * s, 16 * s);
  g.textAlign = 'right'; g.fillText('5G ▮▮▮ 87%', W - 16 * s, 16 * s);
}
export function drawIcon(g, x, y, sz, os, name, i) {
  const pal = PALETTES[os.palette] || PALETTES.vivid; const col = pal[i % pal.length];
  g.save(); shapePath(g, os.iconShape, x, y, sz);
  if (os.iconStyle === 'outline') { g.strokeStyle = col; g.lineWidth = sz * 0.07; g.fillStyle = 'rgba(0,0,0,0.25)'; g.fill(); g.stroke(); }
  else if (os.iconStyle === 'neon') { g.shadowColor = col; g.shadowBlur = sz * 0.4; g.fillStyle = '#0b0b14'; g.fill(); g.shadowBlur = 0; g.strokeStyle = col; g.lineWidth = sz * 0.05; g.stroke(); }
  else if (os.iconStyle === 'glass') { g.fillStyle = 'rgba(255,255,255,0.22)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5; g.stroke(); }
  else if (os.iconStyle === 'gradient') { const gr = g.createLinearGradient(x, y, x + sz, y + sz); gr.addColorStop(0, col); gr.addColorStop(1, pal[(i + 3) % pal.length]); g.fillStyle = gr; g.fill(); }
  else { g.fillStyle = col; g.fill(); }
  g.restore();
  g.font = `${sz * 0.55}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(APP_ICONS[name] || '❔', x + sz / 2, y + sz / 2 + sz * 0.03);
}
// screen: 'lock' | 'home' | 'control' | 'settings' | 'app:<name>' | 'boot' ; opts: { t, time, boot (0..1), company, logoCanvas, cut }
export function renderOS(canvas, os, screen, opts = {}) {
  const g = canvas.getContext('2d'); const W = canvas.width, H = canvas.height, s = W / 360, t = opts.t || 0;
  const fg = '#fff'; const time = opts.time || '9:41'; const font = FONTS[os.font] || FONTS.sans;
  g.save(); g.clearRect(0, 0, W, H);
  if (screen === 'off') { g.fillStyle = '#05060a'; g.fillRect(0, 0, W, H); g.restore(); return; }
  if (screen === 'boot') {
    const b = opts.boot || 0; g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    if (b > 0.05) { g.globalAlpha = Math.min(1, (b - 0.05) * 4) * (b > 0.75 ? Math.max(0, 1 - (b - 0.75) * 4) : 1); if (opts.logoCanvas) { const ls = W * 0.36; g.drawImage(opts.logoCanvas, W / 2 - ls / 2, H * 0.36 - ls / 2, ls, ls); } g.fillStyle = '#fff'; g.font = `700 ${22 * s}px ${font}`; g.textAlign = 'center'; g.fillText(opts.company || '', W / 2, H * 0.5); g.font = `400 ${14 * s}px ${font}`; g.globalAlpha *= 0.7; g.fillText(os.name, W / 2, H * 0.55);
      g.globalAlpha = 1; g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 3 * s; g.beginPath(); g.arc(W / 2, H * 0.72, 16 * s, 0, 7); g.stroke(); g.strokeStyle = os.accent; g.beginPath(); g.arc(W / 2, H * 0.72, 16 * s, t * 5, t * 5 + 1.6); g.stroke(); }
    g.restore(); drawCut(g, W, H, opts.cut, s); return;
  }
  drawWallpaper(g, W, H, os, t);
  if (screen === 'lock') {
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, 0, W, H); statusBar(g, W, s, os, fg, '');
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const [hh, mm] = time.split(':');
    if (os.lockClock === 'stacked') { g.font = `800 ${110 * s}px ${font}`; g.fillText(hh, W / 2, H * 0.3); g.fillText(mm, W / 2, H * 0.44); }
    else if (os.lockClock === 'minimal') { g.font = `300 ${44 * s}px ${font}`; g.textAlign = 'left'; g.fillText(time, 24 * s, H * 0.2); }
    else if (os.lockClock === 'center') { g.font = `200 ${72 * s}px ${font}`; g.fillText(time, W / 2, H * 0.48); }
    else { g.font = `700 ${84 * s}px ${font}`; g.fillText(time, W / 2, H * 0.27); }
    g.font = `500 ${16 * s}px ${font}`; g.textAlign = os.lockClock === 'minimal' ? 'left' : 'center'; g.fillText('Viernes, 13 de marzo', os.lockClock === 'minimal' ? 24 * s : W / 2, os.lockClock === 'stacked' ? H * 0.5 : os.lockClock === 'minimal' ? H * 0.24 : os.lockClock === 'center' ? H * 0.53 : H * 0.12);
    if (os.widgets) { g.fillStyle = 'rgba(255,255,255,0.18)'; rr(g, W * 0.1, H * 0.62, W * 0.8, H * 0.1, 18 * s); g.fill(); g.fillStyle = fg; g.font = `600 ${14 * s}px ${font}`; g.textAlign = 'left'; g.fillText('⛅ 21°  ·  🔋 87%  ·  🎵 Sonando', W * 0.15, H * 0.675); }
    g.fillStyle = 'rgba(255,255,255,0.85)'; rr(g, W / 2 - 60 * s, H - 18 * s, 120 * s, 5 * s, 3 * s); g.fill();
    g.font = `${26 * s}px sans-serif`; g.textAlign = 'center'; g.fillText('🔦', W * 0.18, H - 50 * s); g.fillText('📷', W * 0.82, H - 50 * s);
  } else if (screen === 'home' || screen.startsWith('app:') || screen === 'control') {
    statusBar(g, W, s, os, fg, time);
    const cols = os.cols, apps = os.apps, sz = (W - 40 * s) / cols * 0.66, gapX = (W - 40 * s) / cols;
    let y0 = 54 * s;
    if (os.widgets) { g.fillStyle = 'rgba(255,255,255,0.18)'; rr(g, 20 * s, y0, W - 40 * s, 92 * s, 22 * s); g.fill(); g.fillStyle = fg; g.textAlign = 'left'; g.font = `700 ${34 * s}px ${font}`; g.fillText(time, 36 * s, y0 + 46 * s); g.font = `500 ${13 * s}px ${font}`; g.fillText('⛅ 21° Soleado · 3 eventos hoy', 36 * s, y0 + 72 * s); y0 += 108 * s; }
    const dockN = os.dock ? Math.min(cols, apps.length) : 0; const gridApps = apps.slice(0, Math.max(0, apps.length - dockN));
    gridApps.forEach((a, i) => { const c = i % cols, r = Math.floor(i / cols); const x = 20 * s + c * gapX + (gapX - sz) / 2, y = y0 + r * (sz + 30 * s); drawIcon(g, x, y, sz, os, a, i); g.fillStyle = fg; g.font = `500 ${11 * s}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(a, x + sz / 2, y + sz + 14 * s); });
    if (dockN) { g.fillStyle = 'rgba(255,255,255,0.2)'; rr(g, 14 * s, H - sz - 46 * s, W - 28 * s, sz + 26 * s, 28 * s); g.fill(); apps.slice(apps.length - dockN).forEach((a, i) => { const x = 20 * s + i * gapX + (gapX - sz) / 2; drawIcon(g, x, H - sz - 33 * s, sz, os, a, i + 5); }); }
    if (os.gestures) { g.fillStyle = 'rgba(255,255,255,0.85)'; rr(g, W / 2 - 60 * s, H - 12 * s, 120 * s, 5 * s, 3 * s); g.fill(); }
    if (screen === 'control') {
      g.fillStyle = os.dark ? 'rgba(10,10,20,0.72)' : 'rgba(240,240,250,0.72)'; g.fillRect(0, 0, W, H);
      const tiles = os.control; const tw = (W - 50 * s) / 4;
      tiles.forEach((name, i) => { const c = i % 4, r = Math.floor(i / 4); const x = 20 * s + c * (tw + 3.3 * s), y = 60 * s + r * (tw + 26 * s); const on = (i * 7) % 3 !== 0; g.fillStyle = on ? os.accent : os.dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'; rr(g, x, y, tw, tw, tw * 0.3); g.fill(); g.font = `${tw * 0.45}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(CONTROL_TILES[name] || '•', x + tw / 2, y + tw / 2); g.font = `500 ${10 * s}px ${font}`; g.fillStyle = os.dark ? '#fff' : '#222'; g.fillText(name.length > 11 ? name.slice(0, 10) + '…' : name, x + tw / 2, y + tw + 10 * s); });
      const by = 60 * s + Math.ceil(tiles.length / 4) * (tw + 26 * s) + 6 * s;
      for (const [k, lab] of [[0, '☀️'], [1, '🔊']]) { g.fillStyle = os.dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'; rr(g, 20 * s, by + k * 50 * s, W - 40 * s, 38 * s, 19 * s); g.fill(); g.fillStyle = os.accent; rr(g, 20 * s, by + k * 50 * s, (W - 40 * s) * (0.65 - k * 0.2), 38 * s, 19 * s); g.fill(); g.font = `${18 * s}px sans-serif`; g.textAlign = 'left'; g.fillStyle = '#fff'; g.fillText(lab, 32 * s, by + k * 50 * s + 20 * s); }
    }
    if (screen.startsWith('app:')) {
      const name = screen.slice(4); const k = Math.min(1, opts.appT ?? 1);
      g.save(); g.globalAlpha = k; g.fillStyle = os.dark ? '#111318' : '#f4f4f8'; g.fillRect(0, 0, W, H);
      g.fillStyle = os.dark ? '#fff' : '#111'; statusBar(g, W, s, os, os.dark ? '#fff' : '#111', time);
      g.font = `800 ${28 * s}px ${font}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(name, 22 * s, 80 * s);
      drawIcon(g, W / 2 - 50 * s, H * 0.3, 100 * s, os, name, ALL_APPS.indexOf(name));
      g.fillStyle = os.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'; for (let i = 0; i < 5; i++) { rr(g, 22 * s, H * 0.5 + i * 46 * s, W - 44 * s, 36 * s, 10 * s); g.fill(); }
      g.restore();
    }
  } else if (screen === 'settings') {
    g.fillStyle = os.dark ? '#0f1016' : '#f2f2f7'; g.fillRect(0, 0, W, H); const tc = os.dark ? '#fff' : '#111';
    statusBar(g, W, s, os, tc, time); g.fillStyle = tc; g.font = `800 ${30 * s}px ${font}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText('Ajustes', 20 * s, 72 * s);
    const AN = { none: 'ninguna', snappy: 'rápida', smooth: 'suave', bouncy: 'elástica', cinematic: 'cinemática' }; const rows = [['📶', 'Wi-Fi', 'Casa_5G'], ['🔵', 'Bluetooth', 'Sí'], ['🔔', 'Notificaciones', ''], ['🌓', 'Modo oscuro', os.dark ? 'Sí' : 'No'], ['🎞️', 'Animaciones', AN[os.animations] || os.animations], ['🔋', 'Batería', '87%'], ['🔒', 'Privacidad y seguridad', ''], ['✨', 'Asistente', os.assistant ? 'Sí' : 'No'], ['ℹ️', 'Acerca de ' + os.name, 'v' + (opts.osVersion || '1.0')]];
    rows.forEach(([ic, a, b], i) => { const y = 96 * s + i * 50 * s; g.fillStyle = os.dark ? '#1c1c24' : '#fff'; rr(g, 14 * s, y, W - 28 * s, 44 * s, 12 * s); g.fill(); g.font = `${18 * s}px sans-serif`; g.textBaseline = 'middle'; g.fillText(ic, 26 * s, y + 22 * s); g.fillStyle = tc; g.font = `500 ${15 * s}px ${font}`; g.fillText(a, 56 * s, y + 22 * s); g.textAlign = 'right'; g.fillStyle = os.accent; g.fillText(b + ' ›', W - 26 * s, y + 22 * s); g.textAlign = 'left'; });
  }
  g.restore(); drawCut(g, W, H, opts.cut, s);
}
// draw the front-camera cut-out (notch / punch / pill / drop)
function drawCut(g, W, H, cut, s) {
  if (!cut || cut === 'bezel' || cut === 'none') return;
  g.fillStyle = '#000';
  if (cut === 'notch') { rr(g, W / 2 - 70 * s, -10, 140 * s, 36 * s, 16 * s); g.fill(); }
  else if (cut === 'drop') { g.beginPath(); g.arc(W / 2, 12 * s, 12 * s, 0, 7); g.fill(); }
  else if (cut === 'punch') { g.beginPath(); g.arc(W / 2, 22 * s, 9 * s, 0, 7); g.fill(); }
  else if (cut === 'pill') { rr(g, W / 2 - 46 * s, 10 * s, 92 * s, 26 * s, 13 * s); g.fill(); }
}
// tap → which app/area was touched on home screen (for the interactive preview)
export function hitHome(os, x, y, W, H) {
  const s = W / 360, cols = os.cols, sz = (W - 40 * s) / cols * 0.66, gapX = (W - 40 * s) / cols; let y0 = 54 * s + (os.widgets ? 108 * s : 0);
  const dockN = os.dock ? Math.min(cols, os.apps.length) : 0; const grid = os.apps.slice(0, os.apps.length - dockN);
  for (let i = 0; i < grid.length; i++) { const c = i % cols, r = Math.floor(i / cols); const ix = 20 * s + c * gapX + (gapX - sz) / 2, iy = y0 + r * (sz + 30 * s); if (x >= ix && x <= ix + sz && y >= iy && y <= iy + sz) return grid[i]; }
  if (dockN) for (let i = 0; i < dockN; i++) { const ix = 20 * s + i * gapX + (gapX - sz) / 2, iy = H - sz - 33 * s; if (x >= ix && x <= ix + sz && y >= iy && y <= iy + sz) return os.apps[os.apps.length - dockN + i]; }
  return null;
}
export const ANIM_EASE = { none: () => 1, snappy: (k) => 1 - Math.pow(1 - k, 4), smooth: (k) => k * k * (3 - 2 * k), bouncy: (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2), cinematic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2) };
export const ANIM_DUR = { none: 0.01, snappy: 0.18, smooth: 0.35, bouncy: 0.5, cinematic: 0.8 };

// ---------- company logo ----------
export const LOGO_GLYPHS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '⚡', '★', '◆', '●', '▲', '♥', '☁', '❄', '☀', '♛', '∞', 'Ω', 'π', '🍃', '🔥', '🌀', '🦊', '🐺', '🚀', '💠'];
export function drawLogo(canvas, logo, size = canvas.width) {
  const g = canvas.getContext('2d'); g.clearRect(0, 0, canvas.width, canvas.height); const s = size, c = s / 2;
  g.save(); g.fillStyle = logo.bg;
  g.beginPath();
  if (logo.shape === 'circle') g.arc(c, c, s * 0.48, 0, Math.PI * 2);
  else if (logo.shape === 'square') rr(g, s * 0.04, s * 0.04, s * 0.92, s * 0.92, s * 0.22);
  else if (logo.shape === 'shield') { g.moveTo(c, s * 0.03); g.lineTo(s * 0.92, s * 0.18); g.quadraticCurveTo(s * 0.9, s * 0.78, c, s * 0.97); g.quadraticCurveTo(s * 0.1, s * 0.78, s * 0.08, s * 0.18); g.closePath(); }
  else if (logo.shape === 'hex') { for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3 - Math.PI / 2; const x = c + Math.cos(a) * s * 0.48, y = c + Math.sin(a) * s * 0.48; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); }
  else if (logo.shape === 'diamond') { g.moveTo(c, s * 0.02); g.lineTo(s * 0.98, c); g.lineTo(c, s * 0.98); g.lineTo(s * 0.02, c); g.closePath(); }
  if (logo.shape !== 'none') g.fill();
  g.fillStyle = logo.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const fonts = { bold: '900 ' + s * 0.55 + 'px "Arial Black", Impact, sans-serif', serif: '700 ' + s * 0.58 + 'px Georgia, serif', round: '700 ' + s * 0.55 + 'px "Arial Rounded MT Bold", system-ui, sans-serif', thin: '200 ' + s * 0.6 + 'px system-ui, sans-serif', mono: '700 ' + s * 0.52 + 'px ui-monospace, monospace' };
  g.font = /\p{Extended_Pictographic}/u.test(logo.glyph) ? `${s * 0.5}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif` : fonts[logo.font] || fonts.bold;
  g.fillText(logo.glyph, c, c + s * 0.04);
  g.restore();
  return canvas;
}
