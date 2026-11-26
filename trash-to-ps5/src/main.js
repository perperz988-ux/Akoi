// TRASH TO PS5 — first-person story adventure. Game core.
import * as THREE from 'three';
import { loadAssets } from './assets.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { World, PLACES, zoneAt, ZONES, LOCATIONS, makeWhiteBox } from './world.js';
import { Nav, NPC } from './npc.js';
import { Story, ITEMS, JUNK_TABLE, CONTACTS, DIALOGUES, AMBIENT, MISSIONS } from './story.js';
import { UI } from './ui.js';
import { Phone } from './phone.js';
import { Cinematics } from './cinematic.js';
import { Humanoid } from './rig.js';
import { clamp, weighted, fmtTime, lerp } from './rng.js';
import * as Save from './save.js';

const EYE = 1.65;

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.settings = Object.assign({ master: 0.8, music: 0.5, sfx: 0.8, sens: 1, fov: 75, quality: 'high', invert: false, bob: true }, Save.loadSettings());
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog(0x9fc3e0, 60, 330);
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.08, 900);
    this.scene.add(this.camera);
    this.audio = new Audio(); this.input = new Input(this.canvas);
    this.flags = {}; this.inv = {}; this.money = 0; this.time = 8 * 60; this.day = 1; this.notes = []; this.gallery = []; this.threads = {}; this.contacts = ['milo', 'mom', 'unknown']; this.discovered = new Set(['home', 'store', 'pawn', 'pizza', 'gas', 'gate']);
    this.scanned = {}; this.visitedZones = { city: true, lot: true }; this.zone = 'city'; this.area = 'out'; this.modal = null; this.mode = 'walk'; this.state = 'boot'; this.t = 0; this.msgQueue = []; this.ambientT = 120; this.energyT = 0; this.flashOn = true;
    this.player = { pos: new THREE.Vector3(-150, 0, 252), vy: 0, yaw: Math.PI, pitch: 0, onGround: true, bob: 0, stepT: 0 };
    this.applyQuality(); addEventListener('resize', () => this.resize()); this.resize();
  }
  async boot() {
    this.ui = new UI(this); this.ui.loading(0);
    await loadAssets((p) => this.ui.loading(p * 0.8));
    this.setupLights();
    this.world = new World(this); this.world.build(); this.ui.loading(0.9);
    this.nav = new Nav(this.world.col);
    this.story = new Story(this); this.phone = new Phone(this); this.cine = new Cinematics(this);
    this.setupInteractables(); this.setupNPCs();
    this.kai = new Humanoid('skater-male'); this.kai.root.visible = false; this.scene.add(this.kai.root); // the player's body, only for cutscenes
    this.ui.loading(1);
    this.state = 'title'; this.ui.title(); this.audio.setMusic('title');
    this.camera.position.set(0, 70, 180); this.camera.lookAt(0, 0, -60); this.time = 18.5 * 60;
    const clock = new THREE.Clock();
    const loop = () => { requestAnimationFrame(loop); const dt = Math.min(clock.getDelta(), 0.05); if (!window.__manual) this.frame(dt); };
    loop();
    window.__game = this;
    document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && this.state === 'play' && !this.modal && !this.ui.dlg && !this.cine.active && this.mode === 'walk' && !this.lockInput && performance.now() - (this._modalClosed || 0) > 300) this.ui.pause(); });
  }
  // ---------- setup ----------
  setupLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a4a3a, 1.0); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.2); this.sun.castShadow = true;
    const s = this.sun.shadow; s.mapSize.set(2048, 2048); s.camera.left = -60; s.camera.right = 60; s.camera.top = 60; s.camera.bottom = -60; s.camera.near = 1; s.camera.far = 260; s.bias = -0.0004; s.normalBias = 0.04;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.flash = new THREE.SpotLight(0xfff4dd, 0, 38, 0.48, 0.45, 1.3); this.flash.position.set(0.25, -0.2, 0); this.camera.add(this.flash); this.flash.target.position.set(0, -0.6, -6); this.camera.add(this.flash.target);
    this.pool = []; for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffd9a0, 0, 22, 1.6); this.scene.add(l); this.pool.push(l); }
    this.fireLight = new THREE.PointLight(0xff7a2a, 0, 18, 1.5); this.scene.add(this.fireLight);
    // stars
    const g = new THREE.BufferGeometry(), pts = []; for (let i = 0; i < 1200; i++) { const a = Math.random() * 6.28, b = Math.random() * 1.4 + 0.1; pts.push(Math.cos(a) * Math.cos(b) * 700, Math.sin(b) * 700, Math.sin(a) * Math.cos(b) * 700); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false })); this.scene.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf4f1e0, fog: false })); this.scene.add(this.moon);
  }
  setupInteractables() {
    const W = this.world, add = (o) => W.addInter(o);
    add({ x: 0, y: 1.5, z: 100, r: 4, label: () => (this.flags.gateOpen ? null : 'Gate is closed 🔒'), action: () => this.toast(this.story.m >= 1 ? 'Talk to the old worker at the gate.' : "It's locked. Who'd want to go in there anyway?") });
    add({ x: 0, y: 1.5, z: 0, r: 4, label: () => (this.flags.innerOpen ? null : this.has('key') ? '🗝️ Unlock gate with Rusty Key' : 'Locked Yard 🔒'), action: () => {
      if (!this.has('key')) return this.toast('Locked. Gus said he lost the key somewhere in the Car Graveyard.');
      this.flags.innerOpen = true; this.take('key'); W.setGate('inner', true); this.sfx('gate'); this.nav.rebuild(); this.discover('lockedyard'); this.discover('shack'); this.discover('mountains'); this.toast('🔓 The Locked Yard is open!'); this.story.emit({ type: 'use', id: 'innerGate' });
    } });
    add({ x: 116, y: 1.5, z: -80, r: 4, label: () => (this.flags.power ? null : 'Electric gate — no power ⚡'), action: () => this.toast('No power. The whole security system is dead.') });
    add({ x: PLACES.generator[0], y: 1, z: PLACES.generator[1], r: 2.6, label: () => (this.flags.power ? 'Generator (running)' : this.has('fuse') ? '🔌 Install the 30A fuse' : 'Generator (needs a fuse)'), action: () => {
      if (this.flags.power) return this.toast('Bzzzzzz. It works. Earl is still asleep.');
      if (!this.has('fuse')) return this.toast('The fuse slot is empty. Someone in the junkyard must have a 30-amp fuse.');
      this.take('fuse'); this.setPower(true); this.sfx('power'); this.shake(0.4); this.toast('⚡ POWER RESTORED! The electric gate is open.'); this.discover('containers'); this.story.emit({ type: 'use', id: 'generator' });
    } });
    add({ x: PLACES.monitor[0], y: 1.3, z: PLACES.monitor[1] - 1.4, r: 2.4, label: () => (this.flags.power ? '📹 Watch the old footage' : 'Monitor (no power)'), action: () => (this.flags.power ? this.playCine('footage') : this.toast('Black screen. Needs power.')) });
    add({ x: PLACES.fakeBox[0], y: 0.4, z: PLACES.fakeBox[1], r: 3.4, hold: 1.4, label: () => (this.story.m === 7 && this.story.s === 0 ? '⛏️ Dig out the white box' : null), action: () => this.playCine('discovery') });
    add({ x: PLACES.tunnel[0], y: 1.3, z: PLACES.tunnel[1] - 1.6, r: 3.6, label: () => (!this.flags.tunnelOpen ? null : this.has('flashlight') ? '🕳️ Enter the tunnel' : 'Too dark… you need a 🔦 flashlight'), action: () => {
      if (!this.has('flashlight')) return this.toast("It's PITCH black down there. Get a flashlight (Quik Stop or Scrapper Sam).");
      this.teleport(1000, -2, Math.PI, 'Underground Tunnels'); this.flashOn = true; this.discover('tunnel'); this.story.emit({ type: 'use', id: 'tunnel' });
    } });
    add({ x: 1000, y: 1.5, z: 1.4, r: 2.4, label: () => '🪜 Climb out', action: () => this.teleport(PLACES.tunnel[0], PLACES.tunnel[1] + 1.5, 0) });
    add({ x: 1091.6, y: 1.5, z: -80, r: 2.6, label: () => '🪜 Climb up the ladder', action: () => { this.teleport(PLACES.hatch[0] + 1.5, PLACES.hatch[1], Math.PI / 2); this.discover('secret'); this.story.emit({ type: 'use', id: 'tunnelExit' }); } });
    add({ x: PLACES.hatch[0], y: 0.3, z: PLACES.hatch[1], r: 2.2, label: () => '🕳️ Climb down the hatch', action: () => this.teleport(1088, -80, -Math.PI / 2, 'Underground Tunnels') });
    add({ x: PLACES.secretDoor[0] - 0.5, y: 1.3, z: PLACES.secretDoor[1], r: 2.8, label: () => '🚪 Enter the building', action: () => { this.teleport(1200, 7.5, 0, 'Secret Building'); this.story.emit({ type: 'use', id: 'secretDoor' }); } });
    add({ x: 1200, y: 1.3, z: 9.6, r: 2.2, label: () => (this.cine.active ? null : '🚪 Exit building'), action: () => this.teleport(PLACES.secretDoor[0] - 2, PLACES.secretDoor[1], -Math.PI / 2) });
    add({ x: PLACES.diary[0], y: 0.9, z: PLACES.diary[1], r: 2.2, label: () => "📔 Read Gus's diary", action: () => this.dialog('diary') });
    add({ x: 1202.2, y: 1.2, z: -10.6, r: 2.4, label: () => (this.flags.vaultOpen ? null : '🔢 Enter vault code'), action: () => this.ui.keypad((code) => {
      if (code === '4120') { this.flags.vaultOpen = true; this.story.emit({ type: 'use', id: 'vault' }); this.playCine('final'); return true; }
      this.sfx('error'); this.toast(code === '0214' ? '❌ WRONG. A sticky note says: "not the time, genius."' : code === '6969' || code === '1234' ? '❌ Bro. No.' : '❌ ACCESS DENIED'); return false;
    }) });
    add({ x: PLACES.backGate[0], y: 1.5, z: PLACES.backGate[1], r: 4, label: () => (this.flags.backOpen ? null : this.player.pos.z < PLACES.backGate[1] ? '🔩 Unbolt the back gate' : 'Bolted from the other side'), action: () => {
      if (this.player.pos.z >= PLACES.backGate[1]) return this.toast('Bolted shut from the other side. What is back there?');
      this.flags.backOpen = true; W.setGate('back', true); this.sfx('gate'); this.nav.rebuild(); this.toast('Shortcut opened to the Container Maze.');
    } });
    add({ x: PLACES.trailerHidden[0], y: 0.3, z: PLACES.trailerHidden[1], r: 2.6, label: () => (this.flags.trapdoor ? '🚪 Open the trapdoor' : null), action: () => { this.teleport(1400, 3.6, Math.PI, 'Hidden Room'); this.discover('trapdoor'); } });
    add({ x: 1400, y: 1.4, z: 4.6, r: 2, label: () => '🪜 Climb up', action: () => this.teleport(PLACES.trailerHidden[0] + 1.5, PLACES.trailerHidden[1] + 3, 0) });
    add({ x: 1400, y: 1.05, z: -4, r: 2.4, label: () => (this.has('gold') ? null : '🏆 Take the GOLDEN CONTROLLER'), action: () => { this.give('gold'); this.world.dyn.gold.visible = false; this.sfx('reveal'); this.ui.banner('LEGENDARY ITEM', 'GOLDEN CONTROLLER 🏆'); this.msg('milo', 'bro why do i feel a disturbance in the force', 4); } });
    add({ x: -150, y: 1.3, z: 249, r: 3, label: () => '🏠 Home', action: () => this.dialog([{ s: 'me', t: 'Home sweet home. Smells like old pizza.', c: [{ t: '😴 Sleep until 8 AM', fx: () => this.sleep() }, { t: '💾 Save game', fx: () => { Save.save(this, 1); this.toast('💾 Saved to slot 1'); } }, { t: 'Leave' }] }]) });
    add({ x: 40, y: 1.3, z: 185, r: 3, label: () => '🛒 Quik Stop', action: () => this.dialog('dev_shop') });
    add({ x: 100, y: 1.3, z: 185, r: 3, label: () => '💰 Pawn & Pay', action: () => this.dialog('pawn_shop') });
    add({ x: -40, y: 1.3, z: 185, r: 3, label: () => '🍕 Pizza Bro', action: () => this.toast('🍕 "CLOSED — ran out of cheese. Again."') });
  }
  setupNPCs() {
    const G = this, sh = (h) => h;
    const defs = [
      { id: 'gus', name: 'Old Gus', model: 'survivor-male', hat: 'hardhat', speed: 1.3, start: [34, 76], talk: (G) => (G.story.m === 1 && G.story.s === 1 ? 'gus_gate' : G.story.m === 3 ? 'gus_box' : 'gus_idle'), important: (G) => (G.story.m === 1 && G.story.s === 1) || G.story.m === 3,
        present: (G) => G.story.m < 9 || G.flags.ended,
        routine: (h, G) => {
          if (G.flags.gusAtGate) return { at: [3, 97.4], anim: 'idle', ry: 0 };
          if (h < 7 || h >= 22) return { at: [37, 82], anim: 'sleep', ry: Math.PI };
          if (h < 10) return { at: [33.5, 79.2], anim: 'work', ry: Math.PI };
          if (h < 13) return { at: [20, 40], wander: 28 };
          if (h < 14) return { at: [37, 82], anim: 'sit', ry: Math.PI };
          if (h < 19) return G.flags.innerOpen ? { at: [-10, -35], wander: 30 } : { at: [-40, 30], wander: 30 };
          return G.flags.innerOpen ? { at: [-40, -98], anim: 'search', ry: Math.PI } : { at: [-150, 82], anim: 'search' };
        } },
      { id: 'rosa', name: 'Rosa', model: 'skater-female', speed: 1.4, start: [-74, 76], talk: (G) => (G.story.m === 5 && G.story.s === 2 ? 'rosa_fuse' : G.story.m === 5 && G.story.s === 4 ? 'rosa_give' : 'rosa_idle'), important: (G) => G.story.m === 5 && (G.story.s === 2 || G.story.s === 4),
        routine: (h) => (h >= 7 && h < 19 ? { at: [-72, 76.6], anim: 'work', ry: 0 } : { at: [-86, 70], anim: 'sit', ry: Math.PI / 2 }) },
      { id: 'earl', name: 'Earl', model: 'male', tint: 0x9fb4ff, hat: 'cap', speed: 1.1, start: [-60, -41], talk: (G) => (G.story.m === 5 && G.story.s === 1 ? 'earl_cam' : 'earl_idle'), important: (G) => G.story.m === 5 && G.story.s === 1,
        routine: (h, G) => (h >= 8 && h < 20 ? { at: [-61.5, -40.5], anim: 'sleep', ry: 0 } : { at: [0, -40], wander: 40 }) },
      { id: 'sam', name: 'Scrapper Sam', model: 'survivor-female', hat: 'cap', speed: 1.6, start: [-176, 32], talk: () => 'sam_trade',
        routine: (h, G) => { if (h < 6 || h >= 21) return { at: [-176, 31.5], anim: 'sit', ry: 0 }; const spots = [[-120, 40], [60, 80], [-30, 20]]; if (G.flags.innerOpen) spots.push([-100, -50], [-120, -120]); const s = spots[Math.floor(h / 2) % spots.length]; return { at: s, wander: 14, key: 'sam' + s }; } },
      { id: 'milo', name: 'Milo', model: 'male', speed: 1.5, start: [30, 178], talk: () => 'milo_city', present: (G) => G.hour >= 10 && G.hour < 18 && !G.cine.active, routine: () => ({ at: [30, 179], wander: 6 }) },
      { id: 'stranger', name: '???', model: 'skater-male', tint: 0x55556a, hat: 'hood', speed: 1.4, start: [-95, 152], talk: () => 'stranger',
        present: (G) => (G.hour >= 20 || G.hour < 5) && G.story.m >= 1 && G.story.m <= 9 && G.area === 'out', routine: (h, G) => { const spots = [[-92, 152], [-22, 112], [-140, 228]]; return { at: spots[G.day % 3], anim: 'idle', ry: 0 }; } },
      { id: 'bolt', name: 'BOLT-9000', model: 'robot', anim: { height: 1.5 }, idleClip: 'Idle', speed: 1, start: [-68, 72], talk: () => 'bolt', routine: (h) => ({ at: [-68, 72], ry: Math.PI / 2 }) },
      { id: 'fox', name: 'Bandit 🦊', model: 'fox', anim: { length: 1.0 }, idleClip: 'Survey', walkClip: 'Walk', runClip: 'Run', speed: 1.6, start: [-150, 84], talk: () => [{ s: 'me', t: 'Hey little buddy.' }, { s: 'me', t: G.pick(['*the fox stares into your soul*', '*the fox steals a crumb from your pocket*', '*the fox yips*'] ) }],
        present: (G) => !(G.story.m === 7 && G.story.s === 0),
        routine: (h, G) => (G.story.m >= 8 || G.flags.foxArrived ? { at: [-26, -245], wander: 6 } : G.flags.innerOpen ? { at: [-40, -100], wander: 10 } : { at: [-150, 84], wander: 10 }) },
    ];
    this.npcs = {}; for (const d of defs) this.npcs[d.id] = new NPC(this, d);
    if (this.npcs.bolt.rig.mixer) this.npcs.bolt.forceClip = null;
  }
  // ---------- state helpers used by story/UI ----------
  get hour() { return Math.floor(this.time / 60) % 24; }
  pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  sfx(n, p) { this.audio.sfx(n, p); }
  has(id) { return (this.inv[id] || 0) > 0; }
  give(id, n = 1, quiet = false) { this.inv[id] = (this.inv[id] || 0) + n; const it = ITEMS[id]; if (!quiet && it) this.ui.itemToast(it, n); this.story && this.story.emit({ type: 'item', id }); }
  take(id, n = 1) { this.inv[id] = Math.max(0, (this.inv[id] || 0) - n); if (!this.inv[id]) delete this.inv[id]; }
  buy(id, price) { if (this.money < price) { this.sfx('error'); this.toast(`Not enough money 💸 (need $${price})`); return; } this.money -= price; this.sfx('coin'); this.give(id); }
  sellJunk(who) {
    let total = 0, n = 0; for (const [id, c] of Object.entries(this.inv)) { const it = ITEMS[id]; if (!it || it.story || it.use) continue; if (id === 'copper' && this.story.m === 5 && this.story.s <= 4) continue; total += it.value * c; n += c; delete this.inv[id]; }
    if (!n) return this.toast('You have no junk to sell. (Story items are not for sale.)');
    total = Math.round(total * (who === 'pawn' ? 1.2 : 1)); this.money += total; this.sfx('coin'); this.toast(`💰 Sold ${n} junk items for $${total}`);
  }
  useItem(id) {
    const it = ITEMS[id]; if (!it || !it.use || !this.has(id)) return;
    this.take(id);
    if (it.use === 'drink') { this.energyT = 60; this.sfx('drink'); this.toast('⚡ BRO ENERGY! Sprint speed up for 60s.'); }
    if (it.use === 'eat') { this.sfx('drink'); this.toast(this.pick(['🍕 …It tasted like a shoe. Worth it.', '🍕 Your stomach files a complaint.', '🍕 Surprisingly fire.'])); }
  }
  toast(t) { this.ui.toast(t); }
  note(id, title, text) { if (this.notes.some((n) => n.id === id)) return; this.notes.unshift({ id, title, text, day: this.day, time: this.time }); this.ui.toast('📝 New note: ' + title); }
  discover(id) { if (this.discovered.has(id)) return; this.discovered.add(id); const l = LOCATIONS.find((l) => l.id === id); if (l && this.state === 'play') this.ui.toast('🗺️ Map updated: ' + l.name); }
  addContact(id) { if (!this.contacts.includes(id)) { this.contacts.push(id); this.toast(`📇 New contact: ${CONTACTS[id].name}`); } }
  msg(contact, text, delay = 0) { this.msgQueue.push({ contact, text, at: this.t + delay }); }
  offerReply(contact, options, then, delay = 0) { this.msgQueue.push({ contact, replies: { options, then }, at: this.t + delay + 0.01 }); }
  thread(c) { return this.threads[c] || (this.threads[c] = { msgs: [], unread: 0, replies: null }); }
  deliver(contact, text) {
    const th = this.thread(contact); th.msgs.push({ me: false, text, t: this.time }); th.unread++;
    if (!this.contacts.includes(contact)) this.contacts.push(contact);
    this.sfx('ding'); this.ui.notify(CONTACTS[contact], text); this.phone.refresh();
  }
  reply(contact, i) {
    const th = this.thread(contact), r = th.replies; if (!r) return;
    th.msgs.push({ me: true, text: r.options[i], t: this.time }); th.replies = null; this.sfx('click');
    if (typeof r.then === 'function') r.then(this, i); else if (typeof r.then === 'string') this.msg(contact, r.then, 2);
    this.phone.refresh(); this.story.emit({ type: 'reply', id: contact });
  }
  npcPos(id) { const n = this.npcs[id]; return n ? [n.pos.x, n.pos.z] : null; }
  // ---------- world actions ----------
  setPower(on) { this.flags.power = on; this.world.setGate('elec', on); this.nav.rebuild(); this.world.genLight.material.color.set(on ? 0x22ff44 : 0xff2200); this.world.monitorScreen.material.color.set(on ? 0x2a3a2a : 0x050505); }
  searchPile(pl) {
    pl.searched = true; for (const [n, i] of pl.idx) this.world.S.dim(n, i, 0.6);
    this.sfx('rummage'); this.shake(0.15);
    const st = this.story; let item;
    if (st.m === 2 && pl.zone === 'A' && (st.c.searchA || 0) === 2) item = 'receipt';
    else if (this.flags.copperBoost && (this.inv.copper || 0) < 3 && (this.flags.copperMiss = (this.flags.copperMiss || 0) + 1) >= 2) { item = 'copper'; this.flags.copperMiss = 0; }
    else item = weighted(Math.random, JUNK_TABLE);
    if (item) { this.give(item); this.sfx(ITEMS[item].story ? 'found' : 'junk'); if (item === 'receipt') this.note('receipt', 'The Receipt', '1x PS5 — paid by M. DELGADO. Somebody BOUGHT a PS5… and threw it away??'); }
    else if (Math.random() < 0.5) { const c = 1 + Math.floor(Math.random() * 6); this.money += c; this.sfx('coin'); this.toast(`🪙 Found $${c} in loose change`); }
    else this.toast(this.pick(['Nothing but smells. 🤢', 'Just… wet cardboard.', 'A raccoon looked at you. You looked away first.', 'Nothing. But you feel stronger.']));
    this.story.emit({ type: 'search', zone: pl.zone, pile: pl.id });
  }
  searchCar(c) {
    c.searched = true; this.sfx('rummage');
    if (c.key && !this.has('key') && !this.flags.innerOpen) { this.give('key'); this.sfx('found'); this.ui.banner('FOUND IT', '🗝️ Rusty Key — "LOCKED YARD"'); this.msg('gus', 'u found my key?? keep it. i mean. ok. go ahead. 😅', 5); return; }
    const r = this.pick([['oldphone', 'An ancient phone in the glovebox!'], ['cassette', 'A mixtape in the tape deck.'], [null, 'Just crumbs and a parking ticket from 1994.'], ['spoon', 'A bent spoon? Why?'], [null, 'A note: "Gus was here. Nap #3,412."'], ['battery', 'Batteries under the seat.']]);
    if (r[0]) this.give(r[0]); this.toast('🚗 ' + r[1]);
  }
  sleep() {
    this.ui.fade(1, 0.6); setTimeout(() => { if (this.time % 1440 > 8 * 60) this.day++; this.time = this.day * 1440 + 8 * 60; this.newDay(); this.autosave(); this.ui.fade(0, 1); this.toast('☀️ Good morning! Garbage piles have been restocked.'); }, 800);
  }
  newDay() { for (const p of this.world.piles) if (p.searched) { p.searched = false; for (const [n, i] of p.idx) this.world.S.dim(n, i, 1); } for (const c of this.world.cars) if (!c.key) c.searched = false; }
  teleport(x, z, yaw, title) {
    this.ui.fade(1, 0.25); this.lockInput = true;
    setTimeout(() => { this.player.pos.set(x, 0, z); this.player.yaw = yaw; this.player.pitch = 0; this.updateArea(); this.ui.fade(0, 0.5); this.lockInput = false; if (title) this.ui.areaTitle(title); }, 300);
  }
  updateArea() {
    const z = zoneAt(this.player.pos.x, this.player.pos.z); const id = z ? z.id : 'city'; if (this.state === 'play') this.visitedZones[id] = true;
    if (id !== this.zone) { this.zone = id; if (z && this.state === 'play') { this.ui.areaTitle(z.name); const loc = { A: 'gate', B: 'lockedyard', C: 'containers', D: 'mountains', S: 'secret' }[id]; if (loc) this.discover(loc); } this.story.emit({ type: 'zone', id }); }
    this.area = z && z.interior ? z.id : 'out';
  }
  startFoxChase() {
    const f = this.npcs.fox; const [bx, bz] = PLACES.fakeBox;
    f.setPos(bx + 0.8, bz, -Math.PI / 2); f.visible = true; f.mesh.visible = true; this.flags.foxArrived = false;
    const pts = [[bx + 1, bz + 3], [150, -189], [128, -187], [118, -170], [116, -130], [116, -90], [90, -70], [40, -70], [10, -110], [-5, -150], [-25, -200], [-40, -228], [-30, -246]];
    f.runScript({ pts, speed: 7.5, anim: 'run', waitFor: (n) => Math.hypot(this.player.pos.x - n.pos.x, this.player.pos.z - n.pos.z) < 22, onDone: () => { this.flags.foxArrived = true; this.flags.tunnelOpen = true; this.world.dyn.tunnelCover.visible = false; this.sfx('raccoon'); this.toast('🦊 Bandit dug through the junk and vanished into a hole!'); f.setPos(-26, -245); } });
    this.audio.setMusic('tension');
  }
  playCine(name) { this.cine.play(name); }
  shake(a) { this.shakeA = Math.max(this.shakeA || 0, a); }
  // ---------- dialogue ----------
  dialog(key, npc) {
    const nodes = typeof key === 'string' ? DIALOGUES[key](this) : Array.isArray(key) ? key : key(this);
    if (npc) npc.talking = true; this.modal = 'dialog';
    this.ui.dialog(nodes, () => { if (npc) npc.talking = false; this.modal = null; if (typeof key === 'string') this.story.emit({ type: 'talk', id: key }); });
  }
  talkTo(npc) { const k = npc.def.talk(this); this.dialog(k, npc); }
  // ---------- story hooks ----------
  missionBanner(m) { const M = MISSIONS[m]; this.sfx('start'); this.ui.banner(`MISSION ${m + 1}`, M.title); this.onObjective(); }
  missionComplete(m) { this.sfx('mission'); this.ui.banner('MISSION COMPLETE', MISSIONS[m].title + ' ✔'); this.money += 10 + m * 5; this.audio.setMusic('explore'); }
  onObjective() { this.ui && this.ui.objective(); this.phone && this.phone.refresh(); }
  autosave() { if (this.state === 'play' && !this.flags.ended) Save.save(this, 0); }
  // ---------- game flow ----------
  newGame() {
    Save.reset(this); this.state = 'cine'; this.ui.hideTitle(); this.audio.init(); this.audio.setMusic('cine');
    this.playCine('intro');
  }
  startPlay() { this.state = 'play'; this.ui.showHud(true); this.audio.setMusic('explore'); this.updateArea(); }
  continueGame(slot) { const ok = Save.load(this, slot); if (!ok) return this.toast('No save found'); this.ui.hideTitle(); this.audio.init(); this.startPlay(); this.ui.objective(); this.ui.areaTitle(zoneAt(this.player.pos.x, this.player.pos.z)?.name || 'Bellmont'); }
  pointerLock() { if (!this.input.touchMode && document.pointerLockElement !== this.canvas && this.state === 'play' && !this.modal) this.canvas.requestPointerLock?.(); }
  // ---------- per frame ----------
  fastForward(sec) { this._noRender = true; for (let t = 0; t < sec; t += 0.05) this.frame(0.05); this._noRender = false; }
  frame(dt) {
    this.t += dt; const inp = this.input; inp.update();
    if (this.state === 'play' || this.state === 'cine') {
      if (!this.cine.active && !this.modal && this.state === 'play') this.time += dt * (this.area === 'out' ? 1 : 1);
      const prevDay = this.day; this.day = Math.floor(this.time / 1440) + 1; if (this.day !== prevDay) this.newDay();
      // message queue
      for (let i = 0; i < this.msgQueue.length; i++) { const q = this.msgQueue[i]; if (this.t >= q.at && !this.cine.active) { this.msgQueue.splice(i, 1); if (q.replies) { this.thread(q.contact).replies = q.replies; this.phone.refresh(); } else this.deliver(q.contact, q.text); i--; } }
      if (this.state === 'play' && !this.cine.active) {
        this.ambientT -= dt; if (this.ambientT < 0 && this.story.m >= 2 && !this.flags.ended) { this.ambientT = 150 + Math.random() * 120; const a = this.pick(AMBIENT); if (a[0] !== 'sam' || this.contacts.includes('sam') || Math.random() < 0.5) { this.msg(a[0], a[1], 0); this.offerReply(a[0], a[2], a[3], 1); } }
        this.handleInput(dt); this.updatePlayer(dt); this.updateInteract(dt); this.updateTools(dt);
        this.story.update(); this.updateArea();
      }
      for (const n of Object.values(this.npcs)) n.update(dt);
      this.world.update(dt, this.t);
      this.cine.update(dt);
      if (!this.cine.active) this.updateCamera(dt);
      this.updateEnv(dt);
      if (this.energyT > 0) this.energyT -= dt;
      this.ui.update(dt);
    } else if (this.state === 'title') {
      const a = this.t * 0.05; this.camera.position.set(Math.sin(a) * 160, 60, 40 + Math.cos(a) * 160); this.camera.lookAt(0, 0, -60); this.updateEnv(dt); this.world && this.world.update(dt, this.t);
      for (const n of Object.values(this.npcs || {})) n.update(dt);
    }
    if (this.shakeA) { this.camera.position.x += (Math.random() - 0.5) * this.shakeA * 0.3; this.camera.position.y += (Math.random() - 0.5) * this.shakeA * 0.3; this.shakeA = Math.max(0, this.shakeA - dt * 1.5); }
    if (!this._noRender) this.renderer.render(this.scene, this.camera);
    if (this._snap) { const cb = this._snap; this._snap = null; cb(this.canvas); }
    if (!this._noRender) inp.endFrame();
  }
  handleInput(dt) {
    const i = this.input;
    if (this.modal) { if (i.hit('back')) this.ui.back(); else if (this.modal === 'phone' && (i.hit('phone') || i.hit('map'))) this.phone.close(); return; }
    if (i.hit('phone')) { this.phone.open(); return; }
    if (i.hit('map')) { this.phone.open('map'); return; }
    if (i.hit('inv')) { this.ui.inventory(); return; }
    if (i.hit('light') && this.has('flashlight')) { this.flashOn = !this.flashOn; this.sfx('click'); }
    if (i.hit('back')) { if (this.mode !== 'walk') { this.setMode('walk'); return; } this.ui.pause(); return; }
    if (i.hit('cam')) this.setMode(this.mode === 'camera' ? 'walk' : 'camera');
  }
  setMode(m) { this.mode = m; this.ui.setMode(m); if (m === 'walk') this.audio.setMusic(this.story.m === 7 && this.story.s === 1 ? 'tension' : 'explore'); }
  updatePlayer(dt) {
    const P = this.player, i = this.input, s = this.settings.sens;
    if (this.lockInput) return;
    P.yaw -= i.look.x * 0.0026 * s; P.pitch -= i.look.y * 0.0026 * s * (this.settings.invert ? -1 : 1); P.pitch = clamp(P.pitch, -1.45, 1.45);
    const sprint = i.is('sprint') && this.mode === 'walk';
    const speed = sprint ? (this.energyT > 0 ? 10 : 7) : 4.2;
    const f = i.move.y, r = i.move.x, sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    const dx = (-sy * f + cy * r) * speed * dt, dz = (-cy * f - sy * r) * speed * dt;
    P.pos.x += dx; P.pos.z += dz;
    this.world.col.resolve(P.pos, 0.35, P.pos.y + 0.3);
    if (i.hit('jump') && P.onGround) { P.vy = 5.2; P.onGround = false; }
    P.vy -= 15 * dt; P.pos.y += P.vy * dt; if (P.pos.y <= 0) { P.pos.y = 0; P.vy = 0; P.onGround = true; }
    const moving = Math.hypot(dx, dz) / dt;
    if (moving > 0.5 && P.onGround) { P.bob += dt * (sprint ? 13 : 9); P.stepT -= dt; if (P.stepT < 0) { P.stepT = sprint ? 0.3 : 0.45; this.sfx('step', sprint ? 1.3 : 1); } } else P.bob *= 0.9;
    P.moving = moving;
  }
  updateCamera(dt) {
    const P = this.player, c = this.camera;
    const bob = this.settings.bob ? Math.sin(P.bob) * 0.05 * Math.min(1, P.moving / 4) : 0;
    c.position.set(P.pos.x, P.pos.y + EYE + bob, P.pos.z);
    c.rotation.order = 'YXZ'; c.rotation.set(P.pitch, P.yaw, (this.settings.bob ? Math.sin(P.bob * 0.5) * 0.006 * Math.min(1, P.moving / 4) : 0));
    const zoom = this.mode === 'camera' ? this.ui.camZoom || 1 : 1;
    const fov = (this.input.is('sprint') && P.moving > 5 ? this.settings.fov + 6 : this.settings.fov) / zoom;
    if (Math.abs(c.fov - fov) > 0.1) { c.fov = lerp(c.fov, fov, Math.min(1, dt * 8)); c.updateProjectionMatrix(); }
  }
  // look-at interaction
  updateInteract(dt) {
    if (this.modal || this.mode === 'camera') { this.ui.prompt(null); return; }
    const c = this.camera, fwd = new THREE.Vector3(); c.getWorldDirection(fwd); const P = this.player.pos;
    let best = null, bestScore = 1e9; const v = new THREE.Vector3();
    const consider = (x, y, z, r, label, it) => {
      const d = Math.hypot(P.x - x, P.z - z); if (d > r) return;
      v.set(x - c.position.x, y - c.position.y, z - c.position.z); const len = v.length(); v.divideScalar(len || 1);
      const ang = Math.acos(clamp(v.dot(fwd), -1, 1)); const lim = d < 1.6 ? 0.9 : 0.42 + 0.6 / Math.max(1, len);
      if (ang > lim) return; const score = ang + d * 0.05; if (score < bestScore) { bestScore = score; best = { label, it }; }
    };
    for (const it of this.world.inter) { if (!it.on) continue; if (Math.abs(it.x - P.x) > 12 || Math.abs(it.z - P.z) > 12) continue; const l = it.label(); if (l) consider(it.x, it.y, it.z, it.r, l, it); }
    for (const n of Object.values(this.npcs)) if (n.visible && !n.script) consider(n.pos.x, 1.3, n.pos.z, 3.2, `💬 Talk to ${n.name}`, { npc: n });
    this.ui.prompt(best ? best.label : null, best && best.it.hold ? 'hold' : 'tap');
    const i = this.input;
    if (!best) { this.holdT = 0; return; }
    if (best.it.hold) {
      if (i.is('act') && performance.now() - (this.ui.dlgEnded || 0) > 300) { this.holdT = (this.holdT || 0) + dt; this.holdItem = best.it; if (Math.random() < dt * 8) this.sfx('rummage'); this.ui.holdProgress(this.holdT / best.it.hold); if (this.holdT >= best.it.hold) { this.holdT = 0; this.ui.holdProgress(0); i.release('act'); best.it.action(); } }
      else { this.holdT = 0; this.ui.holdProgress(0); }
    } else if (i.consume('act') && performance.now() - (this.ui.dlgEnded || 0) > 300) { if (best.it.npc) this.talkTo(best.it.npc); else best.it.action(); }
  }
  // phone camera & scanner
  updateTools(dt) {
    if (this.mode === 'scanner') {
      const P = this.player.pos; let best = null, bd = 1e9;
      for (const s of this.world.scannables) { if (this.scanned[s.id]) continue; if (s.kind === 'car' && (this.flags.innerOpen || this.has('key'))) continue; if (s.kind === 'story' && !this.scanRelevant(s)) continue; const d = Math.hypot(P.x - s.x, P.z - s.z); if (d < bd) { bd = d; best = s; } }
      const range = 45, str = best && bd < range ? 1 - bd / range : 0;
      let dir = 0; if (best) { const a = Math.atan2(-(best.x - P.x), -(best.z - P.z)); dir = ((a - this.player.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; }
      this.scanT = (this.scanT || 0) - dt; if (str > 0 && this.scanT < 0) { this.scanT = 0.15 + (1 - str) * 1.2; this.sfx('scan', str); }
      const inRange = best && bd < best.r;
      if (inRange && (this.input.is('act') || this.input.is('scan'))) { this.scanHold = (this.scanHold || 0) + dt; if (this.scanHold > 1.4) { this.scanHold = 0; this.doScan(best); } } else this.scanHold = 0;
      this.ui.scanner(str, dir, best && bd < range ? best : null, inRange, (this.scanHold || 0) / 1.4, bd);
    }
    if (this.mode === 'camera') {
      if (this.input.consume('act') || this.input.consume('scan')) this.takePhoto();
      if (this.input.wheel) this.ui.camZoom = clamp((this.ui.camZoom || 1) - this.input.wheel * 0.25, 1, 4);
    }
  }
  scanRelevant(s) { if (s.id === 'fakebox') return this.story.m >= 6; if (s.id === 'tunnel') return this.story.m >= 7; return true; }
  doScan(s) {
    this.scanned[s.id] = true; this.sfx('scanDone');
    if (s.kind === 'car') { if (s.car.key) { this.ui.scanResult('🔑 METAL DETECTED', 'Small key-shaped object in the glovebox of this car!'); s.car.hint = true; } else this.ui.scanResult('🚗 SCAN COMPLETE', this.pick(['Crumbs. Regret. A single fry.', 'Nothing metal. Just vibes.', 'Detected: 1 old sandwich (sentient?)', 'No key. Smells like nap though.'])); return; }
    if (s.kind === 'rare') {
      const n = Object.keys(this.scanned).filter((k) => /^r\d$/.test(k)).length;
      const lore = { r1: 'A cartridge from a console nobody remembers. Blowing on it does nothing. You tried.', r2: 'The teddy bear is warm. Why is it warm.', r3: 'Space rock. Or a potato. Scanner says "yes".', r4: 'A toilet made of solid gold. Sam says it was "a gift". From who??', r5: 'Picks up 3 channels: static, polka, and something saying "find the trapdoor".', r6: 'You did not watch it. Good choice.', r7: 'Carbon dating says: 1997. Still edible? (No.)', r8: 'Network name: "GUS_GAMING_BUNKER_5G". Password protected. Interesting…' };
      this.ui.scanResult(`💎 RARE FIND ${n}/8`, `${s.name}: ${lore[s.id]}`); this.note(s.id, '💎 ' + s.name, lore[s.id]); this.money += 15;
      if (n === 8) { this.ui.banner('JUNK GOD', 'All 8 rare objects scanned!'); this.flags.junkGod = true; }
      if (s.id === 'r5' || n >= 4) { this.flags.trapdoorHint = true; }
      return;
    }
    if (s.id === 'fakebox') this.ui.scanResult('📦 CARDBOARD BOX', 'Contents: unknown. …Was that movement?');
    if (s.id === 'tunnel') { this.ui.scanResult('🕳️ HOLLOW GROUND', 'Something dug a tunnel under this mountain.'); this.discover('tunnel'); }
    if (s.id === 'trapdoor') { this.flags.trapdoor = true; this.ui.scanResult('🚪 HOLLOW FLOOR', 'There is a trapdoor under this trailer!'); this.discover('trapdoor'); }
  }
  takePhoto() {
    this.sfx('shutter'); this.ui.flash();
    const cam = this.camera, P = this.player.pos; const caught = [];
    for (const t of this.world.photoTargets) {
      const d = Math.hypot(P.x - t.x, P.z - t.z); if (d > 22) continue;
      const v = new THREE.Vector3(t.x, t.y, t.z).project(cam); if (v.z > 1 || Math.abs(v.x) > 0.75 || Math.abs(v.y) > 0.75) continue;
      caught.push(t);
    }
    for (const n of Object.values(this.npcs)) { if (!n.visible) continue; const d = n.pos.distanceTo(P); if (d > 18) continue; const v = new THREE.Vector3(n.pos.x, 1.2, n.pos.z).project(cam); if (v.z < 1 && Math.abs(v.x) < 0.6 && Math.abs(v.y) < 0.7) caught.push({ id: 'npc_' + n.id, name: n.name }); }
    this._snap = (canvas) => {
      const c = document.createElement('canvas'); c.width = 320; c.height = Math.round(320 * canvas.height / canvas.width); c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
      const img = c.toDataURL('image/jpeg', 0.72);
      const label = caught.length ? caught.map((t) => t.name).join(', ') : this.pick(['Garbage (artistic)', 'Nothing in particular', 'Vibes', 'Blurry trash']);
      this.gallery.unshift({ img, label, day: this.day, time: this.time }); if (this.gallery.length > 14) this.gallery.pop();
      let story = false;
      for (const t of caught) if (/^clue\d$/.test(t.id) && !this.story.photos[t.id]) { this.story.photos[t.id] = true; story = true; this.note(t.id, '📷 ' + t.name, { clue1: 'Big boot prints heading deeper into the maze. Size 12. Old-man boots.', clue2: 'A snack wrapper… chewed. Fox teeth marks. Someone was feeding a fox.', clue3: '"G WAS HERE". Who is G?? (It\'s obviously Gus.)' }[t.id]); }
      this.ui.toast(story ? `📸 CLUE PHOTOGRAPHED: ${caught.filter((t) => /^clue/.test(t.id)).map((t) => t.name).join(', ')} (${this.story.photoCount()}/3)` : `📸 Saved to Gallery: ${label}`);
      this.story.emit({ type: 'photo' });
    };
  }
  // ---------- environment ----------
  updateEnv(dt) {
    const h = (this.time / 60) % 24, inside = this.area !== 'out';
    const day = clamp(Math.sin(((h - 6) / 24) * Math.PI * 2) * 1.6 + 0.35, 0, 1); this.night = 1 - day;
    const sunA = ((h - 6) / 24) * Math.PI * 2;
    const P = this.state === 'play' || this.state === 'cine' ? this.camera.position : new THREE.Vector3();
    this.sun.position.set(P.x + Math.cos(sunA) * 120, Math.max(15, Math.sin(sunA) * 150), P.z + 60); this.sun.target.position.set(P.x, 0, P.z);
    const dusk = clamp(1 - Math.abs(day - 0.45) * 3, 0, 1);
    const sky = new THREE.Color().setRGB(0.52, 0.72, 0.92).lerp(new THREE.Color(0.98, 0.55, 0.32), dusk * 0.55).lerp(new THREE.Color(0.02, 0.03, 0.08), this.night);
    if (inside) sky.setRGB(0.01, 0.01, 0.012);
    this.scene.background = sky; this.scene.fog.color.copy(sky);
    this.scene.fog.near = inside ? 2 : 40; this.scene.fog.far = inside ? 45 : 320 - this.night * 120;
    this.sun.intensity = inside ? 0 : day * 2.4 + 0.05; this.sun.color.setRGB(1, 0.92 - dusk * 0.25, 0.85 - dusk * 0.4);
    this.hemi.intensity = inside ? 0.14 : 0.25 + day * 0.85; this.hemi.color.setRGB(0.75 - this.night * 0.4, 0.85 - this.night * 0.35, 1);
    if (this.cctvOn) { this.hemi.intensity = 1.6; this.hemi.color.setRGB(1, 1, 1); this.scene.fog.far = 400; }
    this.stars.material.opacity = inside ? 0 : this.night; this.stars.position.copy(P); this.moon.visible = !inside && this.night > 0.3; this.moon.position.set(P.x - 300, 260, P.z - 400);
    this.world.B.glowMat.color.setScalar(inside ? 1 : 0.35 + this.night * 0.75);
    // light pool → nearest lamps (street lamps only at night)
    this.poolT = (this.poolT || 0) - dt;
    if (this.poolT < 0) {
      this.poolT = 0.4;
      const lamps = this.world.lamps.filter((l) => (l.interior ? inside : !inside && this.night > 0.35)).map((l) => [l, (l.x - P.x) ** 2 + (l.z - P.z) ** 2]).sort((a, b) => a[1] - b[1]);
      this.pool.forEach((pl, k) => { const e = lamps[k]; if (e && e[1] < 60 * 60) { pl.position.set(e[0].x, e[0].y, e[0].z); pl.color.set(e[0].color); pl.userData.l = e[0]; pl.userData.on = true; } else { pl.userData.on = false; } });
    }
    for (const pl of this.pool) { const l = pl.userData.l; pl.intensity = pl.userData.on ? (l && l.flicker && Math.random() < 0.05 ? 3 : inside ? 9 : 14) : 0; }
    const fz = this.world.fire, fd = Math.hypot(P.x - fz.x, P.z - fz.z); this.fireLight.position.set(fz.x, 1, fz.z); this.fireLight.intensity = fd < 70 && !inside ? (6 + Math.sin(this.t * 13) * 1.5 + Math.random()) * (0.4 + this.night) : 0;
    const needLight = inside || this.night > 0.45;
    this.flash.intensity = this.has('flashlight') && this.flashOn && needLight && this.state === 'play' && !this.cine.active ? 40 : 0;
    this.audio.setEnv(this.night, inside);
  }
  applyQuality() {
    const q = this.settings.quality; this.renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'low' ? 0.75 : q === 'medium' ? 1 : 1.5));
    this.renderer.shadowMap.enabled = q !== 'low';
    if (this.sun) { this.sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024); if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; } }
    this.scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => (m.needsUpdate = true)); } });
    this.audio.vol = { master: this.settings.master, music: this.settings.music, sfx: this.settings.sfx }; this.audio.applyVol(); this.input.sens = this.settings.sens;
    if (this.camera) { this.camera.fov = this.settings.fov; this.camera.updateProjectionMatrix(); }
  }
  resize() { const w = innerWidth, h = innerHeight; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
}

const G = new Game(); G.boot();
