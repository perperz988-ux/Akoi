// Cutscene director: timed shots with camera moves, actors, subtitles, titles, fades. Skippable.
import * as THREE from 'three';
import { PLACES, makeWhiteBox } from './world.js';
import { Humanoid } from './rig.js';
import { easeInOut, lerp } from './rng.js';
import { ENDINGS } from './story.js';
import * as Save from './save.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const dolly = (p0, p1, l0, l1, f0 = 50, f1 = f0) => (k) => ({ pos: p0.clone().lerp(p1, easeInOut(k)), look: l0.clone().lerp(l1, easeInOut(k)), fov: lerp(f0, f1, easeInOut(k)) });
const orbit = (c, r, h, a0, a1, look, fov = 45) => (k) => { const a = lerp(a0, a1, k); return { pos: V(c.x + Math.cos(a) * r, c.y + h, c.z + Math.sin(a) * r), look, fov }; };

export class Cinematics {
  constructor(G) { this.G = G; this.active = null; this.temp = []; }
  play(name) {
    const sc = SCRIPTS[name] && SCRIPTS[name](this.G, this); if (!sc) return;
    const G = this.G; this.active = Object.assign({ name, i: -1, t: 0, total: 0 }, sc);
    G.prevState = G.state; G.state = 'cine'; G.setMode && G.mode !== 'walk' && G.setMode('walk');
    G.ui.cineStart(sc.skippable !== false, () => this.skip()); document.exitPointerLock?.();
    if (sc.music) G.audio.setMusic(sc.music);
    if (sc.setup) sc.setup(G, this);
    this.next();
  }
  next() {
    const a = this.active; a.i++; a.t = 0;
    if (a.i >= a.shots.length) return this.end(false);
    const sh = a.shots[a.i]; if (sh.start) sh.start(this.G, this); if (sh.sub) this.G.ui.subtitle(sh.sub, sh.who); else if (sh.sub === null) this.G.ui.subtitle(null);
  }
  update(dt) {
    const a = this.active; if (!a) return; const sh = a.shots[a.i]; if (!sh) return;
    a.t += dt; const k = Math.min(1, a.t / sh.d);
    if (sh.cam) { const c = sh.cam(k, a.t); const cam = this.G.camera; cam.position.copy(c.pos); cam.up.set(0, 1, 0); cam.lookAt(c.look); if (c.fov && Math.abs(cam.fov - c.fov) > 0.01) { cam.fov = c.fov; cam.updateProjectionMatrix(); } }
    if (sh.update) sh.update(this.G, k, dt, a.t);
    for (const h of this.temp) if (h.update) h.update(dt, h.speed || 0, h.mode || 'idle');
    if (a.t >= sh.d) this.next();
  }
  skip() { if (this.active && this.active.skippable !== false) this.end(true); }
  end(skipped) {
    const a = this.active; if (!a) return; this.active = null; const G = this.G;
    G.ui.cineEnd(); G.ui.subtitle(null); G.ui.cctv(false);
    for (const t of this.temp) { if (t.root) G.scene.remove(t.root); else G.scene.remove(t); } this.temp = [];
    G.kai.root.visible = false; G.camera.fov = G.settings.fov; G.camera.updateProjectionMatrix();
    G.state = 'play';
    if (a.finish) a.finish(G, skipped);
    if (G.state === 'play') { G.ui.showHud(true); G.story.emit({ type: 'cine', id: a.name }); }
  }
  actor(model, opts = {}) { const h = new Humanoid(model, opts); this.G.scene.add(h.root); this.temp.push(h); return h; }
  obj(o) { this.G.scene.add(o); this.temp.push(o); return o; }
}

const kaiAt = (G, x, z, yaw, mode = 'idle') => { const k = G.kai; k.root.visible = true; k.root.position.set(x, 0, z); k.root.rotation.y = yaw; k.mode = mode; return k; };
const kaiTick = (G, dt, speed, mode) => G.kai.update(dt, speed, mode);

const SCRIPTS = {
  intro: (G, C) => ({
    music: 'cine',
    setup: (G) => { G.time = 22 * 60 + 47; G.ui.showHud(false); kaiAt(G, -36, 179.5, Math.PI / 2); },
    shots: [
      { d: 5, sub: 'Bellmont. 10:47 PM.', who: '', cam: dolly(V(-22, 2.2, 171), V(-18, 2.2, 172), V(-34, 1.4, 179.5), V(-26, 1.4, 179.5), 50),
        update: (G, k, dt) => { const k2 = G.kai; k2.root.position.x = -36 + k * 9; kaiTick(G, dt, 1.6, 'auto'); } },
      { d: 3, sub: '*bzzt bzzt*', who: '', start: (G) => { G.sfx('ding'); }, cam: dolly(V(-24, 1.7, 177), V(-25, 1.65, 178), V(-27, 1.5, 179.5), V(-27, 1.55, 179.5), 45),
        update: (G, k, dt) => kaiTick(G, dt, 0, 'phone') },
      { d: 3.5, start: (G) => { G.ui.fakeNotify('UNKNOWN NUMBER', "Bro… there's a PS5 in the junkyard."); G.sfx('ding'); }, sub: null,
        cam: dolly(V(-26.2, 1.75, 179.9), V(-26.3, 1.72, 179.8), V(-27, 1.55, 179.5), V(-27, 1.6, 179.5), 40), update: (G, k, dt) => kaiTick(G, dt, 0, 'phone') },
      { d: 3, sub: '…WHAT.', who: 'You', start: (G) => { G.sfx('sting'); G.kai.root.rotation.y = Math.PI / 2; }, cam: dolly(V(-24.5, 1.75, 179.5), V(-26.2, 1.68, 179.5), V(-27, 1.62, 179.5), V(-27, 1.62, 179.5), 50, 22), update: (G, k, dt) => kaiTick(G, dt, 0, 'shock') },
      { d: 0.35, start: (G) => { G.sfx('whoosh'); G.ui.flashWhite(); }, cam: () => ({ pos: V(-26.4, 1.66, 179.5), look: V(-27, 1.62, 179.5), fov: 15 }) },
      { d: 6.5, sub: null, start: (G) => { G.kai.root.visible = false; G.ui.bigTitle('FIND THE PS5', 'a junkyard adventure', 5.5); G.sfx('sting'); },
        cam: dolly(V(-60, 70, 160), V(-10, 40, 70), V(0, 0, -60), V(0, 0, -120), 55, 50) },
      { d: 2.5, start: (G) => { G.ui.fade(1, 0.8); }, cam: () => ({ pos: V(-10, 40, 70), look: V(0, 0, -120), fov: 50 }) },
    ],
    finish: (G) => { G.time = 8 * 60; G.player.pos.set(-150, 0, 246); G.player.yaw = 0; G.player.pitch = 0.05; G.ui.cardThen('NEXT MORNING', () => { G.startPlay(); G.ui.fade(0, 1.2); G.story.begin(0); }); G.state = 'cine'; G.ui.fade(1, 0.01); },
  }),
  welcome: (G, C) => {
    const p = G.player.pos.clone();
    return {
      shots: [
        { d: 5.5, sub: 'Somewhere in here… is a PS5.', who: 'You', start: (G) => { G.ui.bigTitle('JUNK MOUNTAIN SALVAGE', '420 acres of pure trash', 4.5); G.audio.setMusic('cine'); },
          cam: dolly(V(p.x, 1.7, p.z), V(p.x + 10, 28, p.z + 15), V(p.x, 1.5, p.z - 20), V(0, 0, -120), 70, 55) },
      ],
      finish: (G) => { G.audio.setMusic('explore'); },
    };
  },
  compound: (G, C) => ({
    shots: [
      { d: 4.5, sub: 'A secret building. Behind a wall. Behind a tunnel. In a junkyard. TOTALLY normal.', who: 'You', start: (G) => { G.ui.bigTitle('THE SECRET BUILDING', '(definitely just storage)', 4); G.sfx('sting'); },
        cam: dolly(V(78, 2, -262), V(110, 6, -250), V(100, 1.5, -262), V(165, 2, -262), 60, 45) },
    ],
  }),
  footage: (G, C) => {
    const fig = C.actor('survivor-male', { tint: 0x333340 }); fig.root.position.set(116, 0, -70);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), new THREE.MeshLambertMaterial({ color: 0x22222a })); hood.position.set(0, 1.68, -0.02); fig.root.add(hood);
    const box = makeWhiteBox(); box.scale.setScalar(0.8); box.position.set(0, 0.85, 0.45); fig.root.add(box);
    const fox = C.G.npcs.fox; const foxWas = fox.pos.clone();
    let foxRig = null; if (fox.rig.mixer) { foxRig = fox; }
    const path = [[116, -83], [116, -96], [118, -108]];
    return {
      music: 'tension',
      setup: (G) => { G.ui.cctv(true); G.ui.showHud(false); G._tSave = G.time; G.time = Math.floor(G.time / 1440) * 1440 + 2 * 60 + 14; },
      shots: [
        { d: 1.5, sub: null, cam: () => ({ pos: V(128, 6, -77.6), look: V(116, 0.5, -95), fov: 62 }) },
        { d: 11, cam: (k) => ({ pos: V(128, 6, -77.6), look: V(118 + k * 2, 0.5, -92 - k * 8), fov: 55 }),
          start: (G) => { fox.setPos(116, -79); fox.script = { pts: [[116, -92], [117.5, -104]], i: 0, speed: 2.1, anim: 'walk' }; fox.visible = true; fox.mesh.visible = true; },
          update: (G, k, dt) => { const t = k * (path.length - 1), i = Math.min(path.length - 2, Math.floor(t)), f = t - i; const x = lerp(path[i][0], path[i + 1][0], f), z = lerp(path[i][1], path[i + 1][1], f); fig.root.rotation.y = Math.atan2(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]); fig.root.position.set(x, 0, z); fig.speed = 1.3; fig.mode = 'carry'; } },
        { d: 3, sub: 'Is that… a FOX following him?', who: 'You', cam: () => ({ pos: V(128, 6, -77.6), look: V(118, 0.5, -106), fov: 32 }) },
        { d: 3.5, sub: 'Hoodie… white box… heading into the Container Maze. 2:14 AM.', who: 'You', start: (G) => { G.ui.cctv(false); }, cam: dolly(V(-60, 1.55, -40.3), V(-60, 1.5, -41.6), V(-60, 1.3, -42.6), V(-60, 1.3, -42.6), 50, 40) },
      ],
      finish: (G) => { if (G._tSave != null) { G.time = G._tSave; G._tSave = null; } fox.script = null; fox.setPos(foxWas.x, foxWas.z); G.note('footage', '📹 Security Footage', '11/23 — 02:14 AM. A hooded figure (great posture…) carried a WHITE BOX through the electric gate into the Container Maze. A fox followed him.'); G.discover('containers'); G.audio.setMusic('explore'); },
    };
  },
  discovery: (G, C) => {
    const [bx, bz] = PLACES.fakeBox; const box = G.world.dyn.fakeBox, mound = G.world.dyn.fakeMound;
    const junk = mound.children.slice(); junk.forEach((m) => (m.userData.v = V((Math.random() - 0.3) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 4)));
    let flying = false;
    return {
      music: 'tension',
      setup: (G) => { G.ui.showHud(false); kaiAt(G, bx - 2.4, bz, Math.PI / 2, 'idle'); },
      shots: [
        { d: 4.5, sub: null, cam: dolly(V(bx + 0.6, 1.2, bz + 6.5), V(bx + 0.2, 0.9, bz + 3.4), V(bx - 0.6, 0.6, bz), V(bx, 0.4, bz), 50, 40), update: (G, k, dt) => kaiTick(G, dt, 0, 'idle') },
        { d: 2.6, sub: '*digs frantically*', who: '', start: (G) => { flying = true; G.sfx('rummage'); }, cam: () => ({ pos: V(bx - 0.4, 2.7, bz + 3.4), look: V(bx - 0.8, 0.5, bz), fov: 50 }),
          update: (G, k, dt) => { kaiTick(G, dt, 0, 'search'); if (Math.random() < 0.2) G.sfx('rummage'); } },
        { d: 2.8, sub: null, start: (G) => { G.sfx('sting'); }, cam: dolly(V(bx - 1.3, 0.95, bz + 0.7), V(bx - 0.95, 0.72, bz + 0.45), V(bx, 0.35, bz), V(bx, 0.35, bz), 42, 30) },
        { d: 1.6, sub: "It isn't the PS5.", who: '', cam: () => ({ pos: V(bx - 0.95, 0.72, bz + 0.45), look: V(bx, 0.35, bz), fov: 30 }) },
        { d: 2.8, sub: 'NO WAY BRO…', who: 'You', cam: dolly(V(bx - 1.45, 1.62, bz + 0.25), V(bx - 1.65, 1.6, bz + 0.12), V(bx - 2.4, 1.55, bz), V(bx - 2.4, 1.55, bz), 45, 30), update: (G, k, dt) => kaiTick(G, dt, 0, 'shock') },
        { d: 2.2, sub: null, start: (G) => { G.sfx('thud'); }, cam: () => ({ pos: V(bx - 1.2, 1.1, bz + 2.4), look: V(bx - 0.4, 0.4, bz), fov: 45 }),
          update: (G, k, dt, t) => { box.rotation.z = Math.sin(t * 40) * 0.08 * (t > 0.6 ? 1 : 0); box.position.y = Math.abs(Math.sin(t * 25)) * 0.06 * (t > 1.2 ? 1 : 0); if (t > 1.2 && Math.random() < 0.1) G.sfx('thud'); kaiTick(G, dt, 0, 'shock'); } },
        { d: 2, sub: null, start: (G) => { G.ui.fade(1, 0.01); G.audio.setMusic('none'); }, cam: () => ({ pos: V(bx - 1.2, 1.1, bz + 2.4), look: V(bx - 0.4, 0.4, bz), fov: 45 }) },
      ],
      finish: (G) => {
        mound.visible = false; box.position.y = 0; box.rotation.set(0, -Math.PI / 2, 0.5); G.flags.boxOpened = true;
        G.ui.fade(0, 0.8); G.give('note'); G.note('nicetry', '📝 "Nice Try"', 'Inside the box: a note. "NICE TRY. —G.  P.S. the code isn\'t the time." …and a FOX jumped out of it.');
        G.toast('📦 The box was EMPTY — except for a note… and a FOX! 🦊'); G.sfx('raccoon');
        G.player.pos.set(bx - 3, 0, bz); G.player.yaw = -Math.PI / 2; G.player.pitch = -0.1;
      },
      shotsUpdate: (dt) => { if (flying) for (const m of junk) { m.userData.v.y -= 9.8 * dt; m.position.addScaledVector(m.userData.v, dt); m.rotation.x += dt * 5; if (m.position.y < 0.1) { m.position.y = 0.1; m.userData.v.set(0, 0, 0); } } },
    };
  },
  final: (G, C) => {
    const vd = G.world.dyn.vaultDoor, ps5 = G.world.dyn.ps5, c = V(1200, 1.4, -15);
    let lifted = false;
    return {
      music: 'none', skippable: true,
      setup: (G) => { G.ui.showHud(false); kaiAt(G, 1200, -9, Math.PI, 'idle'); G.kai.root.visible = false; },
      shots: [
        { d: 3, sub: '*CLUNK* …*hisssss*', who: '', start: (G) => { G.sfx('vault'); G.shake(0.3); }, cam: () => ({ pos: V(1198, 1.7, -4), look: V(1200, 1.6, -11), fov: 55 }),
          update: (G, k) => { vd.rotation.z = k * 3; if (k > 0.5) vd.position.x = 1200 + (k - 0.5) * 2 * 2.9; } },
        { d: 7, sub: null, start: (G) => { G.sfx('reveal'); G.audio.setMusic('cine'); G.world.dyn.vaultCol.on = false; }, cam: orbit(c, 2.6, 0.5, 0, Math.PI * 1.5, V(1200, 1.4, -15), 45) },
        { d: 4, sub: 'There it is. The PS5. It\'s… beautiful.', who: 'You', start: (G) => { G.kai.root.visible = true; G.kai.root.position.set(1200, 0, -11); G.kai.root.rotation.y = Math.PI; },
          cam: dolly(V(1201.6, 1.5, -17.2), V(1201.2, 1.5, -17.6), V(1200, 1.4, -13), V(1200, 1.5, -13.5), 50),
          update: (G, k, dt) => { G.kai.root.position.z = -11 - k * 3.2; kaiTick(G, dt, k < 0.95 ? 1.4 : 0, 'auto'); } },
        { d: 3.5, sub: '*picks it up*', who: '', start: (G) => { lifted = true; G.sfx('found'); }, cam: dolly(V(1198.6, 1.3, -16.4), V(1198.8, 1.7, -16.6), V(1200, 1.5, -14.3), V(1200, 1.9, -14.3), 45, 40),
          update: (G, k, dt) => { const p = G.kai.root.position; ps5.position.set(p.x, lerp(1.1, 1.75, k), lerp(-15, p.z - 0.45, k)); kaiTick(G, dt, 0, 'lift'); } },
        { d: 3, start: (G) => G.ui.fade(1, 2.4), cam: orbit(c, 2.2, 0.8, Math.PI * 1.5, Math.PI * 2, V(1200, 1.8, -14.3), 40), update: (G, k, dt) => kaiTick(G, dt, 0, 'cheer') },
        { d: 4.5, start: (G) => { G.ui.bigTitle('YOU FOUND IT.', '', 4.2, true); G.audio.setMusic('ending'); }, cam: () => ({ pos: V(1200, 1.8, -12), look: V(1200, 1.6, -15), fov: 40 }) },
      ],
      finish: (G) => {
        ps5.visible = false; G.flags.hasPS5 = true; G.ui.fade(0, 1); G.player.pos.set(1200, 0, -9); G.player.yaw = 0; G.player.pitch = 0;
        G.playCine('choice');
      },
    };
  },
  choice: (G, C) => {
    const gus = C.actor('survivor-male'); gus.root.position.set(1198, 0, 4); gus.root.rotation.y = Math.PI;
    const hh = G.npcs.gus.hat; if (hh) { const h2 = hh.clone(); const head = gus.b.Head; if (head) head.add(h2); }
    const ty = C.actor('skater-male', { tint: 0x8888aa }); ty.root.position.set(1202, 0, 5); ty.root.rotation.y = Math.PI;
    kaiAt(G, 1200, -9, 0, 'idle'); const ps5 = G.world.dyn.ps5; ps5.visible = true;
    return {
      music: 'cine', skippable: false,
      shots: [
        { d: 4, sub: 'HEY! Put that down! That\'s… uh… storage property!', who: 'Old Gus', cam: dolly(V(1200, 1.7, -8), V(1200.5, 1.7, -7), V(1200, 1.5, 4), V(1199, 1.5, 0), 50),
          update: (G, k, dt) => { gus.root.position.z = 4 - k * 6; gus.speed = 1.5; gus.mode = 'auto'; ty.root.position.z = 5 - k * 6; ty.speed = 1.5; ty.mode = 'auto'; const p = G.kai.root.position; ps5.position.set(p.x, 1.25, p.z + 0.4); kaiTick(G, dt, 0, 'carry'); } },
        { d: 4, sub: 'Gus?! It WAS you! The hoodie, the posture, the FOX!', who: 'You', start: () => { gus.speed = 0; ty.speed = 0; gus.mode = 'shock'; }, cam: () => ({ pos: V(1199.2, 1.6, -4), look: V(1199, 1.55, -2), fov: 45 }), update: (G, k, dt) => kaiTick(G, dt, 0, 'carry') },
        { d: 5, sub: "…and I'm the one who texted you. Name's Tyler. My mom threw MY PS5 away 'cause I got a D in math.", who: 'Tyler (the stranger)', start: () => { ty.mode = 'talk'; gus.mode = 'idle'; }, cam: () => ({ pos: V(1201, 1.6, -4.5), look: V(1202, 1.6, -1), fov: 40 }) },
        { d: 4, sub: "I'm banned from this junkyard. Long story. Forklift.", who: 'Tyler', cam: () => ({ pos: V(1201, 1.6, -4.5), look: V(1202, 1.6, -1), fov: 36 }) },
        { d: 4, sub: 'YOU DROVE IT INTO MY OFFICE!', who: 'Old Gus', start: () => { gus.mode = 'shock'; G.shake(0.2); }, cam: () => ({ pos: V(1198.4, 1.65, -4), look: V(1198, 1.6, -1.8), fov: 40 }) },
        { d: 3.5, sub: "So… it's your call, kid. You found it.", who: 'Old Gus', start: () => { gus.mode = 'idle'; }, cam: dolly(V(1200, 2.4, -1), V(1200, 2.2, -3), V(1200, 1.4, -9), V(1200, 1.4, -9), 50) },
      ],
      finish: (G) => {
        G.state = 'cine'; G.ui.showHud(false);
        const canSquad = (G.flags.strangerTalks || 0) >= 2 || Object.keys(G.scanned).filter((k) => /^r\d$/.test(k)).length >= 4 || G.flags.helpedRosa && G.notes.length >= 10;
        G.ui.choice('WHAT DO YOU DO WITH THE PS5?', [
          { t: '🎮 Keep it. Finders keepers.', v: G.has('gold') ? 'perfect' : 'keep' },
          { t: '🤝 Give it back to Tyler.', v: 'tyler' },
          { t: '💰 Sell it to Scrapper Sam ($300).', v: 'sell' },
          { t: canSquad ? '🛋️ Make it a squad thing.' : '🔒 ??? (get to know the junkyard better)', v: canSquad ? 'squad' : null },
        ], (v) => { G.cine.ending(v); });
      },
    };
  },
};
Cinematics.prototype.ending = function (id) {
  const G = this.G; const E = ENDINGS[id]; Save.addEnding(id); G.flags.ended = true; G.flags.ending = id;
  if (id === 'sell') G.money += 300;
  G.story.emit({ type: 'ending' }); G.audio.setMusic('ending'); G.sfx(id === 'sell' ? 'sting' : 'reveal');
  G.ui.endingScreen(E, id, () => { // keep exploring
    this.end && (this.active = null); G.state = 'play'; G.ui.showHud(true); G.ui.cineEnd(); G.world.dyn.ps5.visible = false;
    G.player.pos.set(-150, 0, 246); G.player.yaw = 0; G.time = G.day * 1440 + 9 * 60; G.updateArea(); G.audio.setMusic('explore');
    G.msg('milo', id === 'sell' ? '...' : 'BRO. LEGEND. 🏆', 2); Save.save(G, 0);
  });
};
// cine-wide per-frame hooks (e.g. flying junk)
const _upd = Cinematics.prototype.update;
Cinematics.prototype.update = function (dt) { if (this.active && this.active.shotsUpdate) this.active.shotsUpdate(dt); _upd.call(this, dt); };
