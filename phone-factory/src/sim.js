// PHONE FACTORY — simulation core (pure logic, no DOM).
import { HW, CPU, RAM, STORAGE, BATTERY, DISPLAY, CAMERA, SPEAKER, COOLING, MODEM, CHARGING, FRAMES, BACKS, RESEARCH, RES, AUDIENCES, REGIONS, AD_STYLES, RIVALS, FACTORIES, STAGES, ROLES, FIRST, LAST, TESTS, REVIEW_POS, REVIEW_NEG, REVIEWERS, EVENT_TYPES, PROMOTE } from './data.js';

export const clamp = (v, a = 0, b = 100) => (v < a ? a : v > b ? b : v);
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const byId = (list, id) => list.find((x) => x.id === id) || list[0];
export const fmtMoney = (n) => (!isFinite(n) ? '∞' : (n < 0 ? '-' : '') + '$' + (Math.abs(n) >= 1e9 ? (Math.abs(n) / 1e9).toFixed(2) + 'B' : Math.abs(n) >= 1e6 ? (Math.abs(n) / 1e6).toFixed(2) + 'M' : Math.abs(n) >= 1e4 ? (Math.abs(n) / 1e3).toFixed(1) + 'k' : Math.round(Math.abs(n)).toLocaleString('en-US')));
export const fmtNum = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toLocaleString('en-US'));
export const dateOf = (day) => { const d = new Date(2026, 0, 1 + Math.floor(day)); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };

// ---------------- defaults ----------------
export function defaultOS() {
  return {
    name: 'Nimbus OS', wallpaper: 'aurora', c1: '#3a0ca3', c2: '#f72585', iconShape: 'squircle', iconStyle: 'gradient', palette: 'vivid', cols: 4, dock: true,
    font: 'sans', lockClock: 'big', animations: 'smooth', dark: true, accent: '#4cc9f0',
    apps: ['Phone', 'Messages', 'Camera', 'Gallery', 'Browser', 'Mail', 'Maps', 'Music', 'Store', 'Clock', 'Weather', 'Settings'],
    control: ['Wi-Fi', 'Bluetooth', 'Airplane', 'Flashlight', 'Rotation', 'Do Not Disturb', 'Battery Saver', 'Hotspot'],
    widgets: true, gestures: false, assistant: false, aod: false,
  };
}
export function defaultDesign(id, name = 'Model 1') {
  return {
    id, name, rev: 1, created: 0, prototype: false, tests: {}, testRev: 0, flags: [], hidden: [], found: [],
    ext: { w: 70, h: 145, t: 10, r: 8, bezel: 6, shape: 'bezel', back: 'plastic', frame: 'plastic', color: '#2b2d42', frameColor: '#8d99ae', accent: '#ef233c',
      camLayout: 'single', camCount: 1, camSize: 1, flash: 'single', buttons: 'right', actionKey: false, speakers: 'mono', port: 'micro', wireless: false,
      fingerprint: 'none', face: 'none', logo: true, fold: 'none', ip: false },
    hw: { cpu: 'cpu1', ram: 'ram1', storage: 'st1', battery: 'bat1', display: 'dsp1', camera: 'cam1', speaker: 'spk1', cooling: 'cool0', modem: 'mod1', charging: 'chg1' },
  };
}
export function newState(company, mode = 'campaign') {
  const s = {
    v: 1, mode, day: 0, money: mode === 'sandbox' ? Infinity : 80000, rep: 15,
    company: { name: company || 'Startup Inc.', logo: { shape: 'circle', bg: '#ff3d71', fg: '#ffffff', glyph: (company || 'S')[0].toUpperCase(), font: 'bold' } },
    os: defaultOS(), researched: {}, researching: null, rp: 0,
    employees: [], candidates: [], nextEmp: 1, factories: [{ type: 'garage', stations: Array(10).fill(1) }],
    designs: [], nextDesign: 1, products: [], inventory: {}, orders: [], pipeline: STAGES.map(() => []), qcRejected: 0,
    regions: { home: true }, rivals: [], effects: [], news: [], missions: { done: [] },
    stats: { sold: 0, revenue: 0, produced: 0, intl: 0, milestones: {}, spent: 0 }, flags: {}, history: [], lastDaily: 0, cineQueue: [],
  };
  s.employees.push({ id: 0, name: 'You (Founder)', role: 'engineer', skill: 3, salary: 0, founder: true });
  hire(s, { role: 'worker', name: 'Sam Ortiz', skill: 2 }, true); hire(s, { role: 'worker', name: 'Lea Brandt', skill: 2 }, true);
  for (const r of RIVALS) s.rivals.push({ id: r.id, name: r.name, color: r.color, rep: r.rep, phones: [], nextLaunch: Math.floor(rnd(5, 40)) });
  for (const r of s.rivals) rivalLaunch(s, r, true);
  refreshCandidates(s);
  if (mode === 'sandbox') { for (const r of RESEARCH) s.researched[r.id] = true; for (const g of Object.keys(s.regions)) s.regions[g] = true; for (const r of REGIONS) s.regions[r.id] = true; s.rep = 60; s.factories.push({ type: 'mega', stations: Array(10).fill(5) }); for (let i = 0; i < 150; i++) hire(s, { role: 'worker' }, true); for (let i = 0; i < 20; i++) hire(s, { role: 'researcher' }, true); }
  const d = defaultDesign(s.nextDesign++, 'Model 1'); s.designs.push(d);
  news(s, '🚀', `${s.company.name} is founded in a tiny garage. The dream: build a phone.`);
  return s;
}
export const has = (s, id) => !id || s.mode === 'sandbox' || !!s.researched[id];
export const sandbox = (s) => s.mode === 'sandbox';
export function news(s, icon, text, kind = 'info') { s.news.unshift({ day: s.day, icon, text, kind }); if (s.news.length > 80) s.news.pop(); s._newNews = (s._newNews || []).concat([{ icon, text, kind }]); }
function spend(s, amount, what) { if (sandbox(s)) return true; if (s.money < amount) return false; s.money -= amount; s.stats.spent += amount; return true; }
export function canAfford(s, amount) { return sandbox(s) || s.money >= amount; }

// ---------------- design limits & stats ----------------
export function limits(s) {
  const sb = sandbox(s);
  return {
    w: sb ? [20, 320] : [55, 90], h: sb ? [40, 420] : [100, 185], t: sb ? [3, 40] : [6.5, 16], r: [0, sb ? 60 : 20],
    bezel: [sb ? 0 : has(s, 'r_bezel2') ? 1 : has(s, 'r_bezel1') ? 3 : 6, sb ? 40 : 14],
    camCount: [1, sb ? 20 : has(s, 'r_camarray') ? 8 : has(s, 'r_multicam') ? 4 : 2], camSize: [0.6, sb ? 3 : 1.6],
  };
}
export function hwItem(kind, id) { return byId(HW[kind], id); }

export function computeStats(d, s) {
  const e = d.ext, hw = d.hw;
  const cpu = hwItem('cpu', hw.cpu), ram = hwItem('ram', hw.ram), sto = hwItem('storage', hw.storage), bat = hwItem('battery', hw.battery), dsp = hwItem('display', hw.display);
  const cam = hwItem('camera', hw.camera), spk = hwItem('speaker', hw.speaker), cool = hwItem('cooling', hw.cooling), mod = hwItem('modem', hw.modem), chg = hwItem('charging', hw.charging);
  const frame = byId(FRAMES, e.frame), back = byId(BACKS, e.back);
  const fold = e.fold !== 'none';
  const sw = Math.max(5, e.w - 2 * e.bezel) * (e.fold === 'book' ? 2 : 1), sh = Math.max(5, e.h - 2 * e.bezel - (e.shape === 'bezel' ? 6 : 0)) * (e.fold === 'flip' ? 1.9 : 1);
  const screenArea = sw * sh, bodyArea = e.w * e.h * (e.fold === 'book' ? 2 : e.fold === 'flip' ? 1.9 : 1);
  const s2b = clamp(screenArea / bodyArea, 0, 1);
  const diag = Math.hypot(sw, sh) / 25.4;
  const vol = (e.w * e.h * e.t) / 1000 * (fold ? 1.9 : 1); // cm³
  const fanT = cool.thick || 0;
  const mAh = Math.round(bat.density * Math.max(1, vol * 0.36 - fanT * 2));
  const wh = (mAh * 3.85) / 1000;
  const power = 0.25 + cpu.power * 0.5 + dsp.power * (screenArea / 9000) * Math.sqrt(dsp.hz / 60) + mod.power + (e.camCount > 3 ? 0.05 * e.camCount : 0);
  const hours = wh / (power * 0.5);
  const metal = ['aluminum', 'steel', 'titanium'].includes(e.frame) ? 2 : 0;
  const heat = 31 + cpu.heat + dsp.q / 25 + bat.heat - cool.cap - (e.t - 7) * 0.8 - metal + (fold ? 2 : 0) + (e.w < 40 ? 4 : 0) - Math.min(6, (vol - 90) / 40);
  const throttle = heat > 42 ? clamp(1 - (heat - 42) * 0.035, 0.4, 1) : 1;
  const perfRaw = clamp(cpu.perf * 0.85 + ram.perf);
  const performance = clamp(perfRaw * throttle);
  const ip = !!(e.ip && has(s, 'r_ip')) && e.port !== 'micro';
  const camCount = e.camCount;
  const cameraScore = clamp(cam.q * (1 + 0.12 * Math.min(camCount - 1, 4) + 0.015 * Math.max(0, camCount - 5)) * (0.82 + 0.18 * Math.min(e.camSize, 1.6)) + (e.flash === 'none' ? -4 : e.flash === 'ring' ? 5 : e.flash === 'dual' ? 3 : 0));
  const displayScore = clamp(dsp.q * (0.8 + 0.25 * s2b) + Math.min(8, (diag - 5) * 3));
  const durability = clamp(frame.strength * 0.5 + back.strength * 0.3 + (e.t - 7) * 2 + (ip ? 12 : 0) - (fold ? 15 : 0) + (e.w < 40 || e.h < 80 ? 10 : 0) - (diag > 9 ? 10 : 0));
  const thin = clamp(14 - e.t, 0, 8);
  const shapeBonus = { bezel: 0, notch: 4, drop: 5, punch: 9, pill: 10, none: 14 }[e.shape] || 0;
  const camWeird = camCount > 6 ? (camCount - 6) * 2.5 : 0;
  const design = clamp(frame.prem * 0.3 + back.prem * 0.25 + s2b * 30 + thin * 1.5 + shapeBonus + (fold ? 8 : 0) - camWeird - (diag > 9 ? 8 : 0) + (e.logo ? 2 : 0));
  const software = osScore(s.os, s, cpu);
  const features = clamp(({ none: 0, back: 10, side: 14, under: 20 }[e.fingerprint] || 0) + ({ none: 0, '2d': 8, '3d': 20 }[e.face] || 0) + (e.wireless ? 12 : 0) + (ip ? 14 : 0) + mod.q * 0.15 + (mod.sat ? 10 : 0) + ({ mono: 0, stereo: 5, quad: 9 }[e.speakers] || 0) + spk.q * 0.08 + (fold ? 10 : 0) + (cpu.npu ? 8 : 0) + (e.actionKey ? 3 : 0) + (e.port === 'usbc' ? 4 : e.port === 'magnetic' ? 6 : e.port === 'none' ? 6 : 0));
  const battery = clamp(hours * 4.2);
  const thermals = clamp(100 - (heat - 34) * 5.5);
  const storage = clamp((Math.log2(sto.gb) - 2) * 11);
  const chargeMins = Math.round((wh / Math.max(5, chg.watts * 0.75)) * 60 + 15);
  // weight & cost
  const weight = Math.round(25 + vol * 0.55 + frame.density * (e.w + e.h) * e.t * 0.006 + (mAh / 1000) * bat.wpm + cool.w + camCount * 3 + (fold ? 60 : 0) + screenArea / 800);
  const extraCams = Math.max(0, camCount - 1) * cam.cost * 0.45;
  const sizeK = Math.max(0.5, screenArea / 9000);
  let cost = cpu.cost + ram.cost + sto.cost + (mAh / 1000) * bat.costPer1k + dsp.cost * sizeK + cam.cost + extraCams + spk.cost * ({ mono: 1, stereo: 1.6, quad: 2.5 }[e.speakers] || 1) + cool.cost + mod.cost + chg.cost;
  cost += frame.cost * Math.max(0.6, vol / 90) + back.cost + (e.wireless ? 6 : 0) + ({ none: 0, back: 3, side: 4, under: 9 }[e.fingerprint] || 0) + ({ none: 0, '2d': 2, '3d': 14 }[e.face] || 0) + (fold ? 140 : 0) + (ip ? 5 : 0) + 5 + (e.flash === 'ring' ? 3 : 1);
  cost = Math.round(cost * 0.75 * 100) / 100;
  const scores = { performance, battery, camera: cameraScore, display: displayScore, design, durability, software, features, thermals, storage };
  const overall = Math.round(performance * 0.17 + battery * 0.14 + cameraScore * 0.15 + displayScore * 0.13 + design * 0.12 + durability * 0.08 + software * 0.09 + features * 0.07 + thermals * 0.05);
  return { scores, overall, mAh, hours: Math.round(hours * 10) / 10, heat: Math.round(heat * 10) / 10, weight, cost, diag: Math.round(diag * 10) / 10, s2b, chargeMins, ip, throttle, perfRaw, vol, power };
}
export function osScore(os, s, cpu) {
  let v = 38 + (has(s, 'r_os2') ? 14 : 0) + (has(s, 'r_os3') ? 14 : 0) + (has(s, 'r_os4') ? 12 : 0);
  const perf = cpu ? cpu.perf : 30;
  v += { none: -6, snappy: 5, smooth: perf >= 25 ? 8 : -4, bouncy: perf >= 20 ? 7 : -3, cinematic: perf >= 55 ? 11 : -10 }[os.animations] || 0;
  const n = os.apps.length; v += n >= 8 && n <= 14 ? 5 : -Math.abs(n - 11) * 1.2;
  if (os.dark) v += 2; if (os.widgets && has(s, 'r_os3')) v += 3; if (os.gestures && has(s, 'r_os3')) v += 4; if (os.assistant && has(s, 'r_os4') && cpu && cpu.npu) v += 9; if (os.aod && has(s, 'r_dsp3')) v += 2;
  if (os.control.length >= 6) v += 2;
  return clamp(Math.round(v));
}

// audience fit (0..1) for a stat set
export function fit(scores, aud) { const A = AUDIENCES[aud]; let q = 0; for (const [k, w] of Object.entries(A.w)) q += (scores[k] || 0) * w; return q / 100; }
export function bestAudience(scores, price) {
  let best = null, bv = -1e9; for (const a of Object.keys(AUDIENCES)) { const u = utility(scores, price, a, 50, 0, 3.5, 0); if (u > bv) { bv = u; best = a; } } return best;
}
export function utility(scores, price, aud, rep, hype, rating, age) {
  const A = AUDIENCES[aud]; const q = fit(scores, aud);
  const ratio = price / A.ideal;
  let pp = ratio > 1 ? A.sens * (ratio - 1) * 1.6 : 0;
  if (A.luxury && ratio < 0.5) pp += (0.5 - ratio) * 2.5; // luxury buyers distrust cheap phones
  if (!A.luxury) pp -= Math.min(0.5, (1 - Math.min(1, ratio)) * 0.6 * A.sens / 1.5);
  return 3.2 * q - pp + (rep / 100) * 0.9 + hype + (rating - 3) * 0.35 - Math.min(1.2, age / 450);
}

// ---------------- design editing ----------------
export function touchDesign(d) { d.rev++; }
export function designErrors(d, s) {
  const errs = []; const e = d.ext;
  for (const [k, list] of Object.entries(HW)) { const it = hwItem(k, d.hw[k]); if (it.req && !has(s, it.req)) errs.push(`${it.name} needs research`); }
  const L = limits(s); if (e.camCount > L.camCount[1]) errs.push(`Max ${L.camCount[1]} cameras (research more)`);
  if (e.bezel < L.bezel[0]) errs.push(`Bezels thinner than ${L.bezel[0]} mm need research`);
  if (e.port === 'none' && !e.wireless) errs.push('Portless phones need wireless charging');
  return errs;
}
export function prototypeCost(d, s) { const st = computeStats(d, s); const eng = s.employees.filter((x) => x.role === 'engineer').length; return Math.round(st.cost * 3 + 1500 * Math.max(0.4, 1 - eng * 0.06)); }
export function buildPrototype(s, d) {
  if (designErrors(d, s).length) return 'Fix design errors first';
  const c = prototypeCost(d, s); if (!spend(s, c)) return 'Not enough money';
  d.prototype = true; d.protoRev = d.rev; d.tests = {}; d.testRev = d.rev; d.found = [];
  // hidden defects depend on complexity and engineering team
  const st = computeStats(d, s); const eng = s.employees.filter((x) => x.role === 'engineer').reduce((a, x) => a + x.skill, 0);
  const risk = clamp(0.35 - eng * 0.025 + (d.ext.fold !== 'none' ? 0.2 : 0) + (st.heat > 44 ? 0.15 : 0), 0.04, 0.8);
  d.hidden = []; for (const f of ['overheat', 'battery', 'camera', 'fragile', 'leak', 'software']) if (Math.random() < risk / 3) d.hidden.push(f);
  news(s, '🧪', `Prototype of ${d.name} built (${fmtMoney(c)}).`);
  if (!s.flags.firstProto) { s.flags.firstProto = true; s.cineQueue.push({ name: 'prototype', design: d.id }, { name: 'boot', design: d.id }); }
  return null;
}
export function testCost(s) { const t = s.employees.filter((x) => x.role === 'tester').length; return Math.round(600 * Math.max(0.35, 1 - t * 0.12)); }
export function runTest(s, d, id) {
  if (!d.prototype || d.protoRev !== d.rev) return { err: 'Build a prototype of this revision first' };
  if (!spend(s, testCost(s))) return { err: 'Not enough money' };
  const st = computeStats(d, s); const testers = s.employees.filter((x) => x.role === 'tester').reduce((a, x) => a + x.skill, 0);
  const detect = clamp(0.55 + testers * 0.06, 0, 0.97); let r;
  const reveal = (f) => { if (d.hidden.includes(f) && Math.random() < detect && !d.found.includes(f)) { d.found.push(f); return true; } return false; };
  switch (id) {
    case 'perf': { const P = st.scores.performance; const score = Math.round(P * 1000 + rnd(-800, 800)); r = { score, pass: P >= 8, detail: `Benchmark: ${fmtNum(score)} pts${st.throttle < 1 ? ` · throttled to ${Math.round(st.throttle * 100)}%` : ''}`, value: P }; if (reveal('software')) r.found = 'software'; break; }
    case 'battery': { const h = st.hours * (d.hidden.includes('battery') ? 0.7 : 1) * rnd(0.95, 1.05); r = { score: Math.round(h * 10) / 10, pass: h >= 7, detail: `${st.mAh} mAh · ${h.toFixed(1)} h mixed use`, value: st.scores.battery }; if (reveal('battery')) r.found = 'battery'; break; }
    case 'camera': { const v = st.scores.camera * rnd(0.92, 1.05); r = { score: Math.round(v), pass: v >= 7, detail: `Image score ${Math.round(v)}/100 · ${d.ext.camCount} camera${d.ext.camCount > 1 ? 's' : ''}`, value: v }; if (reveal('camera')) r.found = 'camera'; break; }
    case 'drop': { const p = clamp(st.scores.durability / 100 + 0.05, 0.05, 0.98) * (d.hidden.includes('fragile') ? 0.6 : 1); let ok = 0; for (let i = 0; i < 10; i++) if (Math.random() < p) ok++; r = { score: ok, pass: ok >= 6, detail: `${ok}/10 drops from 1.5 m survived`, value: ok * 10 }; if (reveal('fragile')) r.found = 'fragile'; break; }
    case 'temp': { const t = st.heat + (d.hidden.includes('overheat') ? 5 : 0) + rnd(-1, 1); r = { score: Math.round(t * 10) / 10, pass: t <= 45, detail: `Peak ${t.toFixed(1)} °C under load`, value: clamp(100 - (t - 34) * 5) }; if (reveal('overheat')) r.found = 'overheat'; break; }
    case 'charge': { const chg = hwItem('charging', d.hw.charging); const t = st.heat - 4 + chg.heat; r = { score: st.chargeMins, pass: st.chargeMins <= 180 && t <= 46, detail: `0→100% in ${st.chargeMins} min · ${t.toFixed(1)} °C`, value: clamp(100 - st.chargeMins / 2) }; break; }
    case 'gaming': { const fps = Math.round(clamp(st.scores.performance * 1.6 * (hwItem('display', d.hw.display).hz / 60) * 0.8, 5, 240) * (d.hidden.includes('overheat') ? 0.7 : 1)); r = { score: fps, pass: fps >= 20 && st.heat <= 47, detail: `${fps} fps average · ${st.heat.toFixed(1)} °C`, value: clamp(fps / 1.2) }; if (reveal('overheat')) r.found = 'overheat'; break; }
    case 'water': { const ok = st.ip && !d.hidden.includes('leak'); r = { score: ok ? 68 : 0, pass: ok, detail: ok ? 'IP68 — survived 30 min at 1.5 m' : st.ip ? 'Leak detected at the seals!' : 'No water sealing (needs IP68 research + sealed port)', value: ok ? 100 : 0 }; if (reveal('leak')) r.found = 'leak'; break; }
  }
  d.tests[id] = r;
  return r;
}
export function allTested(d) { return d.prototype && d.protoRev === d.rev && TESTS.every((t) => d.tests[t.id]); }
export function fixCost(d) { return 3000 + d.found.length * 4000; }
export function fixDefects(s, d) { if (!d.found.length) return 'Nothing to fix'; const c = fixCost(d); if (!spend(s, c)) return 'Not enough money'; d.hidden = d.hidden.filter((f) => !d.found.includes(f)); news(s, '🛠️', `Engineers fixed ${d.found.length} defect(s) in ${d.name}.`); d.found = []; return null; }
// flags that stick to a launched product from failed tests + hidden defects
export function productFlags(d) {
  const f = new Set();
  const t = d.tests;
  if (t.drop && !t.drop.pass) f.add('fragile'); if (t.temp && !t.temp.pass) f.add('overheat'); if (t.gaming && !t.gaming.pass) f.add('overheat');
  if (t.battery && !t.battery.pass) f.add('battery'); if (t.camera && !t.camera.pass) f.add('camera'); if (t.water && !t.water.pass) f.add('nowater');
  for (const h of d.hidden) f.add(h);
  return [...f];
}

// ---------------- company: employees, research, factories, regions ----------------
export function refreshCandidates(s) {
  s.candidates = []; const roles = Object.keys(ROLES);
  for (let i = 0; i < 6; i++) { const role = roles[i % roles.length === 0 ? 0 : Math.floor(Math.random() * roles.length)]; const skill = 1 + Math.floor(Math.random() * 5); s.candidates.push({ name: pick(FIRST) + ' ' + pick(LAST), role, skill, salary: Math.round(ROLES[role].salary * (0.7 + 0.15 * skill) / 10) * 10 }); }
  s.candRefresh = s.day + 30;
}
export function hire(s, c, free = false) {
  const role = c.role, skill = c.skill || 2 + Math.floor(Math.random() * 3);
  const e = { id: s.nextEmp++, name: c.name || pick(FIRST) + ' ' + pick(LAST), role, skill, salary: c.salary || Math.round(ROLES[role].salary * (0.7 + 0.15 * skill) / 10) * 10 };
  if (!free && !spend(s, Math.round(e.salary * 0.5))) return 'Not enough money for the signing bonus';
  s.employees.push(e); return null;
}
export function hireBulk(s, role, n) { let k = 0; for (let i = 0; i < n; i++) if (!hire(s, { role })) k++; return k; }
export function fire(s, id) { const i = s.employees.findIndex((e) => e.id === id && !e.founder); if (i >= 0) s.employees.splice(i, 1); }
export const count = (s, role) => s.employees.filter((e) => e.role === role).length;
export function rpPerDay(s) { return 0.6 + s.employees.filter((e) => e.role === 'researcher').reduce((a, e) => a + 0.6 + e.skill * 0.2, 0); }
export function canResearch(s, id) { const r = RES[id]; return r && !s.researched[id] && r.pre.every((p) => s.researched[p]); }
export function startResearch(s, id) {
  if (!canResearch(s, id)) return 'Locked';
  if (s.researching === id) return null;
  const r = RES[id]; if (!spend(s, r.cost)) return 'Not enough money';
  s.researching = id; s.rp = 0; return null;
}
export function factoryRate(s) {
  const workers = count(s, 'worker'); const need = s.factories.reduce((a, f) => a + byId(FACTORIES, f.type).workers, 0);
  const staff = need ? clamp(workers / need, 0.15, 1.25) : 1;
  const auto = has(s, 'r_auto') ? 1.3 : 1; const acc = s.effects.some((e) => e.type === 'accident') ? 0.4 : 1;
  const rates = STAGES.map((_, i) => s.factories.reduce((a, f) => a + byId(FACTORIES, f.type).base * (0.7 + 0.3 * f.stations[i]), 0) * staff * auto * acc);
  return { rates, staff, need, workers, cap: Math.min(...rates) };
}
export function buildFactory(s, type) {
  const F = byId(FACTORIES, type); if (F.req && !has(s, F.req)) return 'Needs research';
  if (!spend(s, F.cost)) return 'Not enough money';
  s.factories.push({ type, stations: Array(10).fill(1) }); news(s, '🏭', `New ${F.name} opened!`);
  if (!s.flags.factoryOpened) { s.flags.factoryOpened = true; s.cineQueue.push({ name: 'factory', type }); }
  return null;
}
export function upgradeCost(s, fi, st) { const f = s.factories[fi], F = byId(FACTORIES, f.type); return Math.round((F.cost * 0.04 + 1500) * f.stations[st]); }
export function upgradeStation(s, fi, st) { const f = s.factories[fi]; if (f.stations[st] >= 5) return 'Max level'; const c = upgradeCost(s, fi, st); if (!spend(s, c)) return 'Not enough money'; f.stations[st]++; return null; }
export function unlockRegion(s, id) { const R = REGIONS.find((r) => r.id === id); if (R.global && !has(s, 'r_global')) return 'Research Global logistics first'; if (!spend(s, R.cost)) return 'Not enough money'; s.regions[id] = true; news(s, '🌍', `Distribution deal signed: ${R.name}!`); return null; }

// ---------------- production ----------------
export function unitCost(s, d) { const st = computeStats(d, s); return st.cost * (s.effects.some((e) => e.type === 'shortage') ? 1.35 : 1); }
export function orderCost(s, d, qty) { const disc = qty >= 10000 ? 0.85 : qty >= 1000 ? 0.92 : 1; return Math.round(unitCost(s, d) * qty * disc); }
export function placeOrder(s, d, qty) {
  qty = Math.floor(qty); if (qty < 1) return 'Invalid quantity';
  if (!allTested(d) && !sandbox(s)) return 'Finish all tests on the prototype first';
  const c = orderCost(s, d, qty); if (!spend(s, c)) return 'Not enough money';
  const delay = s.effects.some((e) => e.type === 'shortage') ? 5 : 2;
  s.orders.push({ d: d.id, qty, arrive: s.day + delay }); news(s, '📦', `Ordered components for ${fmtNum(qty)}× ${d.name} (${fmtMoney(c)}). Arriving in ${delay} days.`);
  return null;
}
function defectRate(s, d) {
  const eng = s.employees.filter((x) => x.role === 'engineer').reduce((a, x) => a + x.skill, 0);
  const qc = s.factories.reduce((a, f) => Math.max(a, f.stations[7]), 1);
  return clamp(0.07 - eng * 0.004 + d.hidden.length * 0.02 + (d.ext.fold !== 'none' ? 0.03 : 0) - qc * 0.008, 0.005, 0.4);
}
// continuous production: moves units through stages
export function stepProduction(s, dt) {
  // arrivals
  for (let i = s.orders.length - 1; i >= 0; i--) { const o = s.orders[i]; if (s.day >= o.arrive) { s.pipeline[0].push({ d: o.d, n: o.qty }); s.orders.splice(i, 1); } }
  const { rates } = factoryRate(s); const moved = [];
  for (let st = STAGES.length - 1; st >= 0; st--) {
    let cap = rates[st] * dt; const q = s.pipeline[st];
    while (cap > 1e-6 && q.length) {
      const c = q[0]; const m = Math.min(cap, c.n); c.n -= m; cap -= m; if (c.n <= 1e-6) q.shift();
      if (st === STAGES.length - 1) { s.inventory[c.d] = (s.inventory[c.d] || 0) + m; s.stats.produced += m; s.stats.producedFloat = (s.stats.producedFloat || 0) + m; }
      else {
        let pass = m; if (st === 7) { const d = s.designs.find((x) => x.id === c.d); const rej = m * (d ? defectRate(s, d) : 0.05); pass -= rej; s.qcRejected += rej; }
        const nq = s.pipeline[st + 1]; const last = nq[nq.length - 1]; if (last && last.d === c.d) last.n += pass; else nq.push({ d: c.d, n: pass });
      }
      moved.push([st, m]);
    }
  }
  return moved;
}
export function inPipeline(s) { return s.pipeline.map((q) => q.reduce((a, c) => a + c.n, 0)); }

// ---------------- marketing & launch ----------------
export function adCost(style, budget) { return Math.round(budget * (AD_STYLES[style].costMult || 1)); }
export function launchProduct(s, d, opts) {
  if (!allTested(d) && !sandbox(s)) return 'All 8 tests must be run on the latest prototype';
  if (s.products.some((p) => p.d === d.id && p.status !== 'retired')) return 'This model is already launched';
  const regions = opts.regions.filter((r) => s.regions[r]); if (!regions.length) return 'Pick at least one unlocked region';
  const cost = adCost(opts.style, opts.budget); if (!spend(s, cost)) return 'Not enough money for the ad campaign';
  const st = computeStats(d, s);
  const p = { id: d.id, d: d.id, name: d.name, price: opts.price, audience: opts.audience, style: opts.style, promote: opts.promote.slice(0, 3), regions, status: 'scheduled', launchDay: s.day + Math.max(0, opts.delay | 0),
    stats: st, flags: productFlags(d), hype: {}, sold: 0, revenue: 0, returns: 0, reviews: [], rating: 0, nReviews: 0, ratingSum: 0, daily: [], preorders: 0, intl: 0, fake: [] };
  addHype(s, p, opts.audience, opts.style, cost);
  for (const k of p.promote) { const v = k === 'price' ? clamp(100 - (opts.price / 12)) : st.scores[k]; if (v < 40) p.fake.push(k); }
  s.products.push(p); news(s, '📣', `${d.name} announced! Launching ${p.launchDay === s.day ? 'today' : 'on ' + dateOf(p.launchDay)} at ${fmtMoney(opts.price)}.`);
  if (p.launchDay === s.day) doLaunch(s, p);
  return null;
}
export function addHype(s, p, aud, style, money) {
  const A = AD_STYLES[style]; const mk = 1 + count(s, 'marketer') * 0.12;
  let base = Math.log10(money / 800 + 1) * 0.55 * mk * (A.random ? rnd(0.2, 2.2) : 1);
  for (const a of Object.keys(AUDIENCES)) p.hype[a] = Math.min(3, (p.hype[a] || 0) + base * A.mult[a] * (a === aud ? 1 : 0.35));
}
export function runAd(s, p, style, budget, aud) { const c = adCost(style, budget); if (!spend(s, c)) return 'Not enough money'; addHype(s, p, aud, style, c); news(s, AD_STYLES[style].icon, `New ${AD_STYLES[style].name} ad for ${p.name} (${fmtMoney(c)}).`); return null; }
function doLaunch(s, p) {
  p.status = 'onsale'; p.launchDay = Math.floor(s.day); news(s, '🎉', `${p.name} is now on sale!`, 'good');
  if (!s.flags.firstLaunch) { s.flags.firstLaunch = true; s.cineQueue.push({ name: 'launch', product: p.id }); }
}
export function retire(s, p) { p.status = 'retired'; news(s, '📦', `${p.name} retired from sale.`); }
export function setPrice(p, price) { p.price = Math.max(1, Math.round(price)); }

// ---------------- rivals ----------------
function rivalTech(s, r) { const R = RIVALS.find((x) => x.id === r.id); return clamp(R.tech + s.day / 1600 + (r.boost || 0), 0, 0.9); }
export function rivalLaunch(s, r, quiet = false, better = false) {
  const R = RIVALS.find((x) => x.id === r.id); let t = rivalTech(s, r) + (better ? 0.12 : 0);
  const base = 15 + t * 82; const j = () => clamp(base + rnd(-8, 8));
  const sc = { performance: j(), battery: j(), camera: j(), display: j(), design: j(), durability: j(), software: j(), features: j(), thermals: j(), storage: j() };
  const style = R.style; if (style === 'premium') { sc.design += 10; sc.camera += 8; } if (style === 'gaming') { sc.performance += 12; sc.thermals += 8; sc.design -= 5; } if (style === 'budget') { sc.battery += 8; sc.design -= 8; }
  for (const k in sc) sc[k] = clamp(sc[k]);
  const overall = Math.round(sc.performance * 0.17 + sc.battery * 0.14 + sc.camera * 0.15 + sc.display * 0.13 + sc.design * 0.12 + sc.durability * 0.08 + sc.software * 0.09 + sc.features * 0.07 + sc.thermals * 0.05);
  const priceBase = { premium: 900, balanced: 550, budget: 220, gaming: 650 }[style];
  const price = Math.round((priceBase * (0.6 + t * 0.7)) / 10) * 10 - 1;
  const names = { mango: ['Mango', 'Pro', 'Max'], nova: ['Nova', 'Edge', 'Ultra'], kestrel: ['Kestrel', 'Lite', 'Go'], yuzu: ['Yuzu', 'Blaze', 'Turbo'] }[r.id];
  const num = r.phones.length + 1 + Math.floor(s.day / 365);
  const phone = { name: `${names[0]} ${num} ${pick(names.slice(1))}`, scores: sc, overall, price, launchDay: Math.floor(s.day), sold: 0, daily: [], hype: 0.6 };
  r.phones.unshift(phone); if (r.phones.length > 2) r.phones.length = 2;
  r.nextLaunch = s.day + R.every + Math.floor(rnd(-15, 20));
  if (!quiet) news(s, '📱', `${r.name} launches the ${phone.name} (score ${overall}, ${fmtMoney(price)}).`, better ? 'bad' : 'info');
  return phone;
}

// ---------------- daily simulation: market, sales, reviews, salaries, events, missions ----------------
export function dailyStep(s) {
  const day = Math.floor(s.day);
  // scheduled launches
  for (const p of s.products) if (p.status === 'scheduled' && day >= p.launchDay) doLaunch(s, p);
  // research
  if (s.researching) { s.rp += rpPerDay(s) * (s.effects.some((e) => e.type === 'techFound') ? 2 : 1); const r = RES[s.researching]; if (s.rp >= r.rp) { s.researched[r.id] = true; news(s, '🔬', `Research complete: ${r.name}!`, 'good'); s.researching = null; s.rp = 0; s._researchDone = r.id; } }
  // rivals
  for (const r of s.rivals) if (day >= r.nextLaunch) rivalLaunch(s, r);
  // market
  const growth = 1 + day * 0.0006;
  const shortageSale = 1;
  const playerOnSale = s.products.filter((p) => p.status === 'onsale');
  const viral = s.effects.filter((e) => e.type === 'viral');
  const expo = s.effects.some((e) => e.type === 'expo') ? 1.35 : 1;
  const demand = {}; const rivalSold = {};
  for (const R of REGIONS) {
    for (const [aud, A] of Object.entries(AUDIENCES)) {
      const seg = R.daily * growth * A.share * expo;
      const opts = [];
      for (const p of playerOnSale) if (p.regions.includes(R.id)) {
        const viralK = viral.some((v) => v.product === p.id) ? 1.2 : 0;
        opts.push({ kind: 'p', ref: p, u: utility(p.stats.scores, p.price, aud, s.rep, (p.hype[aud] || 0) + viralK, p.nReviews ? p.rating : 3.5, day - p.launchDay) - (p.flags.length * 0.08) });
      }
      for (const r of s.rivals) for (const ph of r.phones) opts.push({ kind: 'r', ref: ph, u: utility(ph.scores, ph.price, aud, r.rep, ph.hype, 3.8, day - ph.launchDay) });
      const k = 2.6, u0 = 1.6; let den = Math.exp(k * u0); for (const o of opts) den += Math.exp(k * o.u);
      for (const o of opts) { const n = seg * Math.exp(k * o.u) / den; if (o.kind === 'p') { const key = o.ref.id; demand[key] = demand[key] || { total: 0, region: {}, aud: {} }; demand[key].total += n; demand[key].region[R.id] = (demand[key].region[R.id] || 0) + n; demand[key].aud[aud] = (demand[key].aud[aud] || 0) + n; } else { rivalSold[o.ref.name] = (rivalSold[o.ref.name] || 0) + n; if (R.id === 'home') rivalSold['home:' + o.ref.name] = (rivalSold['home:' + o.ref.name] || 0) + n; } }
    }
  }
  // rival sales tracking
  for (const r of s.rivals) for (const ph of r.phones) { const n = rivalSold[ph.name] || 0; ph.sold += n; ph.daily.push(n); if (ph.daily.length > 60) ph.daily.shift(); ph.homeDaily = ph.homeDaily || []; ph.homeDaily.push(rivalSold['home:' + ph.name] || 0); if (ph.homeDaily.length > 60) ph.homeDaily.shift(); ph.hype *= 0.99; }
  // fulfil player demand from inventory
  let dayRevenue = 0, daySold = 0;
  for (const p of playerOnSale) {
    const dm = demand[p.id]; const want = dm ? dm.total : 0; const inv = s.inventory[p.d] || 0;
    const sold = Math.min(want, inv);
    s.inventory[p.d] = inv - sold;
    const retRate = p.flags.reduce((a, f) => a + ({ fragile: 0.05, overheat: 0.04, battery: 0.03, camera: 0.01, leak: 0.03, nowater: 0.005, software: 0.02 }[f] || 0), 0.005);
    const returns = sold * retRate; const rev = (sold - returns) * p.price * 0.85;
    p.sold += sold; p.returns += returns; p.revenue += rev; p.daily.push(sold); if (p.daily.length > 60) p.daily.shift(); p.lastWant = want;
    const intl = dm ? Object.entries(dm.region).filter(([k]) => k !== 'home').reduce((a, [, v]) => a + v, 0) / Math.max(1e-9, want) * sold : 0;
    p.intl += intl; s.stats.intl += intl; p.homeDaily = p.homeDaily || []; p.homeDaily.push(sold - intl); if (p.homeDaily.length > 60) p.homeDaily.shift();
    p.soldOut = inv < want * 0.98;
    dayRevenue += rev; daySold += sold;
    for (const a in p.hype) p.hype[a] *= 0.975;
    // reviews
    const nrev = Math.min(4, Math.floor(sold / 25 + (Math.random() < (sold % 25) / 25 ? 1 : 0)) + (p.nReviews < 3 && sold > 0 ? 1 : 0));
    for (let i = 0; i < nrev; i++) addReview(s, p, dm);
  }
  if (!sandbox(s)) s.money += dayRevenue; s.stats.revenue += dayRevenue; s.stats.sold += daySold;
  s.dayRevenue = dayRevenue; s.daySold = daySold;
  // reputation drift
  const rated = playerOnSale.filter((p) => p.nReviews > 3);
  if (rated.length) { const avg = rated.reduce((a, p) => a + p.rating, 0) / rated.length; const target = clamp((avg - 1) * 25 + Math.min(20, Math.log10(s.stats.sold + 1) * 4)); s.rep += (target - s.rep) * 0.01; }
  // monthly costs
  if (day > 0 && day % 30 === 0) {
    const sal = s.employees.reduce((a, e) => a + e.salary, 0); const upkeep = s.factories.reduce((a, f) => a + byId(FACTORIES, f.type).upkeep, 0);
    if (!sandbox(s)) { s.money -= sal + upkeep; } news(s, '💸', `Monthly costs: salaries ${fmtMoney(sal)}, factories ${fmtMoney(upkeep)}.`);
    if (day >= s.candRefresh) refreshCandidates(s);
  }
  // effects expire
  s.effects = s.effects.filter((e) => e.until > day);
  // random events
  if (day > 25 && Math.random() < 1 / 28) randomEvent(s);
  // milestones
  for (const m of [1000, 10000, 100000, 1000000, 10000000]) if (s.stats.sold >= m && !s.stats.milestones[m]) { s.stats.milestones[m] = true; s.cineQueue.push({ name: 'milestone', n: m }); news(s, '🏆', `${fmtNum(m)} phones sold!`, 'good'); }
  // market share
  const share = marketShare(s); s.share = share;
  if (!s.flags.worldNo1 && share.length && share[0].me && s.stats.sold > 50000) { s.flags.worldNo1 = true; s.cineQueue.push({ name: 'world' }); news(s, '🌍', `${s.company.name} is now the LARGEST phone company in the world!`, 'good'); }
  if (day % 7 === 0) s.history.push({ day, money: isFinite(s.money) ? s.money : 0, sold: s.stats.sold, rep: s.rep, share: (share.find((x) => x.me) || {}).pct || 0 }); if (s.history.length > 300) s.history.shift();
  checkMissions(s);
  if (s.money < -50000 && !sandbox(s) && !s.flags.bankruptWarn) { s.flags.bankruptWarn = true; news(s, '⚠️', 'You are deep in debt! Cut costs or sell phones fast.', 'bad'); }
}
export function marketShare(s) {
  const rows = [{ name: s.company.name, me: true, color: '#ff3d71', last30: s.products.reduce((a, p) => a + p.daily.slice(-30).reduce((x, y) => x + y, 0), 0) }];
  for (const r of s.rivals) rows.push({ name: r.name, color: r.color, last30: r.phones.reduce((a, ph) => a + ph.daily.slice(-30).reduce((x, y) => x + y, 0), 0) });
  const tot = rows.reduce((a, r) => a + r.last30, 0) || 1; for (const r of rows) r.pct = (r.last30 / tot) * 100;
  return rows.sort((a, b) => b.last30 - a.last30);
}
function addReview(s, p, dm) {
  let aud = p.audience; if (dm) { let r = Math.random() * dm.total; for (const [a, v] of Object.entries(dm.aud)) { r -= v; if (r <= 0) { aud = a; break; } } }
  const A = AUDIENCES[aud]; const sc = p.stats.scores;
  let sat = fit(sc, aud) + (A.ideal / p.price - 1) * 0.12 * A.sens + rnd(-0.15, 0.15);
  const flags = p.flags.slice(); if (p.fake.length) flags.push('fake');
  const FW = { nowater: 0.025, camera: 0.06 }; let forced = null; for (const f of flags) if (Math.random() < (FW[f] ?? 0.14)) { forced = f; sat -= 0.35; break; }
  const stars = Math.round(clamp(1 + sat * 5.2, 1, 5));
  let text;
  if (forced) text = pick(REVIEW_NEG[{ fragile: 'durability', overheat: 'thermals', battery: 'battery', camera: 'camera', leak: 'water', nowater: 'water', software: 'software', fake: 'fake' }[forced]]);
  else {
    const keys = Object.keys(A.w).concat(['price']);
    const val = (k) => (k === 'price' ? clamp(100 * Math.min(1.5, A.ideal / p.price) / 1.5) : sc[k] || 0);
    keys.sort((a, b) => val(b) - val(a));
    text = stars >= 4 ? pick(REVIEW_POS[keys[0]] || REVIEW_POS.design) : stars <= 2 ? pick(REVIEW_NEG[keys[keys.length - 1]] || REVIEW_NEG.price) : pick(['It\'s fine. Does the job.', 'Decent phone, nothing special.', 'Good, but ' + pick(REVIEW_NEG[keys[keys.length - 1]] || ['could be better.']).toLowerCase()]);
  }
  const rv = { stars, text, who: pick(REVIEWERS), aud, day: Math.floor(s.day) };
  p.reviews.unshift(rv); if (p.reviews.length > 40) p.reviews.pop(); p.nReviews++; p.ratingSum += stars; p.rating = p.ratingSum / p.nReviews;
}
function randomEvent(s) {
  const day = Math.floor(s.day); const t = pick(EVENT_TYPES); const live = s.products.filter((p) => p.status === 'onsale');
  const ev = (o) => { s.effects.push(o); s._event = o; };
  switch (t) {
    case 'shortage': ev({ type: 'shortage', until: day + 15, icon: '⚠️', title: 'Component shortage!', text: 'A global chip shortage hits. Component costs +35% and deliveries take 5 days for 15 days.' }); break;
    case 'accident': { const loss = sandbox(s) ? 0 : Math.round(Math.min(Math.max(0, s.money) * 0.05, 40000)); s.money -= loss; ev({ type: 'accident', until: day + 6, icon: '🔥', title: 'Factory accident!', text: `A fire on the line. Production slowed by 60% for 6 days. Repairs cost ${fmtMoney(loss)}.` }); break; }
    case 'viralAd': if (live.length) { const p = pick(live); for (const a in p.hype) p.hype[a] = Math.min(3, p.hype[a] * 1.8 + 0.4); ev({ type: 'viralAd', until: day + 1, icon: '📈', title: 'Viral advertisement!', text: `An ad for ${p.name} went viral. Hype skyrockets!` }); } break;
    case 'rivalLaunch': { const r = pick(s.rivals); const ph = rivalLaunch(s, r, true, true); ph.hype = 1.2; r.boost = (r.boost || 0) + 0.03; ev({ type: 'rivalLaunch', until: day + 1, icon: '😱', title: `${r.name} strikes back!`, text: `${r.name} launched the ${ph.name} — score ${ph.overall} at ${fmtMoney(ph.price)}. Time to answer.` }); break; }
    case 'techFound': ev({ type: 'techFound', until: day + 10, icon: '💡', title: 'Breakthrough!', text: 'Your lab discovered a new technique. Research speed ×2 for 10 days.' }); break;
    case 'badReviews': { const bad = live.filter((p) => p.flags.length); if (bad.length) { const p = pick(bad); for (let i = 0; i < 6; i++) { const f = pick(p.flags); p.reviews.unshift({ stars: 1, text: pick(REVIEW_NEG[{ fragile: 'durability', overheat: 'thermals', battery: 'battery', camera: 'camera', leak: 'water', nowater: 'water', software: 'software' }[f]]), who: pick(REVIEWERS), aud: p.audience, day }); p.nReviews++; p.ratingSum += 1; } p.rating = p.ratingSum / p.nReviews; s.rep = Math.max(0, s.rep - 5); ev({ type: 'badReviews', until: day + 1, icon: '👎', title: 'Terrible reviews!', text: `A popular reviewer tore apart the ${p.name}: "${p.flags.join(', ')}". Reputation −5.` }); } break; }
    case 'viral': if (live.length) { const p = pick(live); ev({ type: 'viral', product: p.id, until: day + 7, icon: '🚀', title: 'Unexpected viral success!', text: `Everyone is suddenly talking about the ${p.name}. Demand surges for a week!` }); } break;
    case 'expo': ev({ type: 'expo', until: day + 10, icon: '🎪', title: 'World Mobile Expo', text: 'The biggest phone event of the year. Market demand +35% for 10 days!' }); break;
  }
  if (s._event) news(s, s._event.icon, s._event.title + ' ' + s._event.text, 'event');
}

// ---------------- missions ----------------
export const MISSIONS = [
  { id: 'm1', title: 'FIRST PHONE', desc: 'Design your first smartphone and build a working prototype.', reward: 15000, check: (s) => s.designs.some((d) => d.prototype), hint: 'Design → customize → Build prototype' },
  { id: 'm2', title: 'BUILD IT', desc: 'Test your prototype, then produce 100 phones in your factory.', reward: 20000, check: (s) => s.stats.produced >= 100, progress: (s) => `${Math.floor(s.stats.produced)}/100`, hint: 'Testing → run all 8 tests. Factory → order production' },
  { id: 'm3', title: 'LAUNCH', desc: 'Release your first phone to the market.', reward: 25000, check: (s) => s.products.some((p) => p.status === 'onsale'), hint: 'Marketing → set price, audience and ad → Launch' },
  { id: 'm4', title: 'COMPETE', desc: "Outsell a rival company's newest phone in your home country over 7 days.", reward: 60000, check: (s) => beatsRival(s), progress: (s) => { const b = bestVsRival(s); return b ? `you ${fmtNum(b.me)} vs ${fmtNum(b.them)} (${b.rival}) per week at home` : ''; }, hint: 'Better value for one audience + a strong ad + enough stock (upgrade the factory!)' },
  { id: 'm5', title: 'GO GLOBAL', desc: 'Sell 2,000 phones internationally.', reward: 150000, check: (s) => s.stats.intl >= 2000, progress: (s) => `${fmtNum(s.stats.intl)}/2,000`, hint: 'Research Global logistics, unlock a region in Market, launch there' },
  { id: 'm6', title: 'FLAGSHIP', desc: 'Launch a premium flagship: price ≥ $999, score ≥ 75 and rating ≥ 4.0★.', reward: 500000, check: (s) => s.products.some((p) => p.status !== 'scheduled' && p.price >= 999 && p.stats.overall >= 75 && p.nReviews >= 8 && p.rating >= 4), hint: 'Premium materials, great camera & display, luxury ad' },
  { id: 'm7', title: 'FUTURE', desc: 'Build and launch the most advanced phone in the world (score ≥ 92, better than every rival).', reward: 2000000, check: (s) => s.products.some((p) => p.status !== 'scheduled' && p.stats.overall >= 92 && s.rivals.every((r) => r.phones.every((ph) => ph.overall < p.stats.overall))), hint: 'Research the Future tech tree' },
];
function bestVsRival(s) {
  let best = null;
  const sum7 = (a) => (a || []).slice(-7).reduce((x, y) => x + y, 0);
  for (const p of s.products) { if (p.status !== 'onsale') continue; const me = sum7(p.homeDaily); for (const r of s.rivals) { const ph = r.phones[0]; if (!ph) continue; const them = sum7(ph.homeDaily); if (them < 10) continue; if (!best || me - them > best.me - best.them) best = { me, them, rival: ph.name }; } }
  return best;
}
function beatsRival(s) { const b = bestVsRival(s); return !!b && b.me > b.them && b.me > 15; }
export function currentMission(s) { return MISSIONS.find((m) => !s.missions.done.includes(m.id)); }
function checkMissions(s) {
  if (sandbox(s)) return;
  const m = currentMission(s); if (!m) return;
  if (m.check(s)) { s.missions.done.push(m.id); s.money += m.reward; news(s, '✅', `MISSION COMPLETE: ${m.title}! Reward ${fmtMoney(m.reward)}.`, 'good'); s._mission = m; if (s.missions.done.length === MISSIONS.length) { s.flags.campaignDone = true; s.cineQueue.push({ name: 'campaign' }); } }
}

// ---------------- main tick ----------------
export function tick(s, days) {
  const before = Math.floor(s.day); s.day += days;
  const moved = stepProduction(s, days);
  for (let d = before + 1; d <= Math.floor(s.day); d++) dailyStep(s);
  return moved;
}
