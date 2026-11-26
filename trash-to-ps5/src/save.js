// Save/load (localStorage): slot 0 = autosave, 1..3 = manual.
import { PLACES } from './world.js';
const KEY = (s) => `trash2ps5_slot_${s}`;
const SET = 'trash2ps5_settings', END = 'trash2ps5_endings';

export function loadSettings() { try { return JSON.parse(localStorage.getItem(SET)) || {}; } catch { return {}; } }
export function saveSettings(s) { try { localStorage.setItem(SET, JSON.stringify(s)); } catch {} }
export function endings() { try { return JSON.parse(localStorage.getItem(END)) || []; } catch { return []; } }
export function addEnding(id) { const e = endings(); if (!e.includes(id)) e.push(id); try { localStorage.setItem(END, JSON.stringify(e)); } catch {} }
export function info(slot) { try { const d = JSON.parse(localStorage.getItem(KEY(slot))); return d ? { m: d.story.m, day: d.day, time: d.time, saved: d.saved } : null; } catch { return null; } }

export function serialize(G) {
  return {
    v: 1, saved: Date.now(), time: G.time, day: G.day, money: G.money, inv: G.inv, flags: G.flags,
    player: { x: G.player.pos.x, z: G.player.pos.z, yaw: G.player.yaw }, story: G.story.serialize(),
    threads: G.threads, contacts: G.contacts, notes: G.notes, gallery: G.gallery, discovered: [...G.discovered], scanned: G.scanned, visitedZones: G.visitedZones,
    piles: G.world.piles.filter((p) => p.searched).map((p) => p.id), cars: G.world.cars.filter((c) => c.searched).map((c) => c.id),
  };
}
export function save(G, slot) {
  let d = serialize(G);
  try { localStorage.setItem(KEY(slot), JSON.stringify(d)); }
  catch { d.gallery = d.gallery.slice(0, 3); try { localStorage.setItem(KEY(slot), JSON.stringify(d)); } catch { d.gallery = []; try { localStorage.setItem(KEY(slot), JSON.stringify(d)); } catch {} } }
  if (slot === 0) G.ui && G.ui.saveIcon();
}
export function load(G, slot) {
  let d; try { d = JSON.parse(localStorage.getItem(KEY(slot))); } catch { return false; } if (!d) return false;
  reset(G);
  Object.assign(G, { time: d.time, day: d.day, money: d.money, inv: d.inv || {}, flags: d.flags || {}, threads: d.threads || {}, contacts: d.contacts || G.contacts, notes: d.notes || [], gallery: d.gallery || [], scanned: d.scanned || {}, visitedZones: d.visitedZones || { city: true, lot: true } });
  G.discovered = new Set(d.discovered || []);
  G.player.pos.set(d.player.x, 0, d.player.z); G.player.yaw = d.player.yaw; G.player.pitch = 0;
  G.story.load(d.story);
  for (const id of d.piles || []) { const p = G.world.piles[id]; if (p) { p.searched = true; for (const [n, i] of p.idx) G.world.S.dim(n, i, 0.6); } }
  for (const id of d.cars || []) { const c = G.world.cars[id]; if (c) c.searched = true; }
  applyFlags(G);
  // resume a fox chase that was in progress
  if (G.story.m === 7 && G.story.s === 1 && !G.flags.foxArrived) G.startFoxChase();
  for (const th of Object.values(G.threads)) th.replies && (th.replies = null);
  return true;
}
export function applyFlags(G) {
  const W = G.world, f = G.flags;
  W.setGate('junk', !!f.gateOpen); W.setGate('inner', !!f.innerOpen); W.setGate('back', !!f.backOpen);
  G.setPower(!!f.power);
  W.dyn.tunnelCover.visible = !f.tunnelOpen; W.dyn.fakeMound.visible = !f.boxOpened; W.dyn.fakeBox.rotation.set(0, -Math.PI / 2, f.boxOpened ? 0.5 : 0); W.dyn.gold.visible = !G.has('gold');
  if (f.vaultOpen) { W.dyn.vaultDoor.position.x = 1200 + 2.9; W.dyn.vaultDoor.rotation.y = 0; W.dyn.vaultCol.on = false; }
  if (f.ended) W.dyn.ps5.visible = false;
  for (const g of Object.values(W.gates)) g.t = g.open ? 1 : 0;
  G.nav.rebuild();
}
// fresh state for a new game
export function reset(G) {
  Object.assign(G, { flags: {}, inv: {}, money: 5, time: 8 * 60, day: 1, notes: [], gallery: [], threads: {}, contacts: ['milo', 'mom', 'unknown'], scanned: {}, visitedZones: { city: true, lot: true }, msgQueue: [], mode: 'walk', modal: null, energyT: 0 });
  G.discovered = new Set(['home', 'store', 'pawn', 'pizza', 'gas', 'gate']);
  G.player.pos.set(-150, 0, 246); G.player.yaw = 0; G.player.pitch = 0;
  G.story.m = 0; G.story.s = 0; G.story.c = {}; G.story.photos = {}; G.story.done = false; G.story.started = false; G.story.pending = 0;
  for (const p of G.world.piles) if (p.searched) { p.searched = false; for (const [n, i] of p.idx) G.world.S.dim(n, i, 1); }
  for (const c of G.world.cars) c.searched = false;
  const W = G.world; W.dyn.vaultDoor.position.x = 1200; W.dyn.vaultCol.on = true; W.dyn.ps5.visible = true; W.dyn.ps5.position.set(1200, 1.1, -15);
  applyFlags(G);
  for (const n of Object.values(G.npcs)) { n.script = null; n.setPos(n.def.start[0], n.def.start[1]); }
}
export { PLACES };
