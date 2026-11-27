// ZperCraft · EDICIÓN MALDITA — motor de caos inyectado sobre el juego original.
(() => {
  const G = window.akoi, IDS = window.akoiIds || {};
  if (!G) return;
  const B = IDS.B || {}, I = IDS.I || {}, MOBS = IDS.M || [], U = IDS.T, DAY = IDS.D || 960;

  // Clases de Three.js sacadas de objetos que el juego ya creó
  const Mesh = G.crack.constructor, Box = G.crack.geometry.constructor;
  const Basic = G.crack.material.constructor, Group = G.hand.constructor;
  const Color = G.sky.fogColor.constructor, V3 = G.camera.position.constructor;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const playing = () => G.state === 'play' && G.world && G.player && G.player.alive;
  const P = () => G.player;
  const surf = (x, z) => { try { return G.world.surfaceY(Math.floor(x), Math.floor(z)); } catch { return -1; } };
  const toast = (t) => { try { G.ui && G.ui.toast(t); } catch {} };
  const vib = (ms) => { try { G.settings.haptics && navigator.vibrate && navigator.vibrate(ms); } catch {} };

  // ---------------------------------------------------------------- AUDIO
  let ac = null, master = null, drone = null;
  function audioInit() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
    // Zumbido grave permanente
    drone = ac.createGain(); drone.gain.value = 0;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    for (const f of [41, 41.7, 61.5]) { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(); }
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 90;
    lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    lp.connect(drone); drone.connect(master);
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, audioInit, { passive: true }));
  const vol = () => { try { return (G.audio.vol.master ?? 0.8) * (G.audio.vol.sfx ?? 0.9); } catch { return 0.7; } };
  function noiseBuf(sec) {
    const b = ac.createBuffer(1, ac.sampleRate * sec, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function env(g, t0, a, peak, rel) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + rel); }
  const sfx = {
    stinger() { if (!ac) return; const t = ac.currentTime, v = vol();
      for (const [f, d] of [[880, 0.7], [932, 0.7], [440, 1.4]]) { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f / 6, t + d); env(g, t, 0.01, 0.08 * v, d); o.connect(g); g.connect(master); o.start(t); o.stop(t + d + 0.1); }
      this.static(0.25, 0.25); },
    static(d = 0.35, amp = 0.3) { if (!ac) return; const t = ac.currentTime, s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
      s.buffer = noiseBuf(d + 0.05); f.type = 'highpass'; f.frequency.value = 1800; env(g, t, 0.005, amp * vol(), d); s.connect(f); f.connect(g); g.connect(master); s.start(t); },
    scream() { if (!ac) return; const t = ac.currentTime, v = vol();
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = noiseBuf(1.3); f.type = 'bandpass'; f.Q.value = 6;
      f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(500, t + 1.2); env(g, t, 0.01, 0.9 * v, 1.2); s.connect(f); f.connect(g); g.connect(master); s.start(t);
      for (const fr of [620, 655, 1240]) { const o = ac.createOscillator(), og = ac.createGain(); o.type = 'square';
        o.frequency.setValueAtTime(fr, t); o.frequency.exponentialRampToValueAtTime(fr * 0.45, t + 1.1); env(og, t, 0.01, 0.12 * v, 1.1); o.connect(og); og.connect(master); o.start(t); o.stop(t + 1.3); } },
    beat() { if (!ac) return; const t = ac.currentTime, v = vol();
      for (const dt of [0, 0.22]) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.setValueAtTime(70, t + dt); o.frequency.exponentialRampToValueAtTime(35, t + dt + 0.15);
        env(g, t + dt, 0.01, 0.5 * v, 0.18); o.connect(g); g.connect(master); o.start(t + dt); o.stop(t + dt + 0.3); } },
    whisper() { if (!ac) return; const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), p = ac.createStereoPanner();
      s.buffer = noiseBuf(1.8); f.type = 'bandpass'; f.Q.value = 12; f.frequency.setValueAtTime(rnd(700, 1400), t); f.frequency.linearRampToValueAtTime(rnd(500, 1800), t + 1.6);
      p.pan.value = Math.random() < 0.5 ? -0.9 : 0.9; env(g, t, 0.4, 0.25 * vol(), 1.3); s.connect(f); f.connect(g); g.connect(p); p.connect(master); s.start(t); },
  };

  // ---------------------------------------------------------------- UI
  const ui = document.getElementById('ui');
  const css = document.createElement('style');
  css.textContent = `
  #mld-ban{position:absolute;left:50%;top:20%;transform:translate(-50%,0);text-align:center;pointer-events:none!important;opacity:0;transition:opacity .3s;z-index:6;width:min(90vw,720px)}
  #mld-ban.on{opacity:1}
  #mld-ban .t{font-weight:900;font-size:clamp(22px,5.4vh,46px);letter-spacing:.08em;color:#ff2a1f;text-shadow:2px 0 #00e5ff,-2px 0 #ff00c8,0 4px 18px #000;animation:mldGl .25s steps(2) infinite}
  #mld-ban .s{margin-top:6px;font-size:13px;letter-spacing:.3em;text-transform:uppercase;color:#ffd6d2;text-shadow:0 1px 3px #000}
  #mld-ban .b{margin:10px auto 0;width:220px;height:4px;background:#0008;border-radius:2px;overflow:hidden}
  #mld-ban .b i{display:block;height:100%;background:#ff2a1f;width:100%}
  #mld-cd{position:absolute;left:calc(10px + var(--safe-l,0px));bottom:6px;padding:6px 8px;cursor:pointer;font:800 11px system-ui,sans-serif;letter-spacing:.2em;color:#ff6b61;text-shadow:0 1px 2px #000;pointer-events:auto!important;opacity:.85;z-index:7}
  #mld-vig{position:absolute;inset:0;pointer-events:none!important;box-shadow:inset 0 0 160px 50px #3a000099;z-index:1}
  #mld-scare{position:fixed;inset:0;background:#000;display:none;z-index:200;pointer-events:none;align-items:center;justify-content:center}
  #mld-scare.on{display:flex;animation:mldShake .08s infinite}
  #mld-scare .face{position:relative;width:min(70vh,70vw);height:min(70vh,70vw);background:#070707;box-shadow:0 0 120px #600}
  #mld-scare .face i{position:absolute;top:34%;width:20%;height:9%;background:#ff1a0d;box-shadow:0 0 40px 10px #ff1a0d}
  #mld-scare .face i:nth-child(1){left:18%} #mld-scare .face i:nth-child(2){right:18%}
  #mld-scare .face b{position:absolute;left:25%;right:25%;top:62%;height:20%;background:repeating-linear-gradient(90deg,#ddd 0 8%,#111 8% 12%)}
  #mld-flash{position:fixed;inset:0;pointer-events:none;z-index:150;opacity:0;background:repeating-linear-gradient(0deg,#fff2 0 2px,#0000 2px 4px),#800}
  @keyframes mldGl{0%{transform:translate(0,0) skewX(0)}50%{transform:translate(-2px,1px) skewX(-6deg)}100%{transform:translate(2px,-1px) skewX(4deg)}}
  @keyframes mldShake{0%{transform:translate(4px,-3px) scale(1.02)}50%{transform:translate(-5px,4px) scale(1.05)}100%{transform:translate(3px,2px)}}
  @keyframes mldFlick{0%,100%{opacity:1}47%{opacity:1}48%{opacity:.2}50%{opacity:1}83%{opacity:.6}}`;
  document.head.appendChild(css);
  const mk = (id, html = '') => { const d = document.createElement('div'); d.id = id; d.innerHTML = html; return d; };
  const ban = mk('mld-ban', '<div class="t"></div><div class="s"></div><div class="b"><i></i></div>');
  const cd = mk('mld-cd'), vig = mk('mld-vig');
  const scare = mk('mld-scare', '<div class="face"><i></i><i></i><b></b></div>');
  const flash = mk('mld-flash');
  ui.appendChild(vig); ui.appendChild(ban); ui.appendChild(cd);
  cd.title = 'Toca para desatar el caos ya';
  document.body.appendChild(scare); document.body.appendChild(flash);
  const banT = ban.querySelector('.t'), banS = ban.querySelector('.s'), banBar = ban.querySelector('.b'), banFill = ban.querySelector('.b i');
  let banTimer = 0;
  function banner(t, s, show = 3.2) { banT.textContent = t; banS.textContent = s || ''; ban.classList.add('on'); banTimer = show; }
  function glitchFlash(a = 0.75, ms = 160) { flash.style.transition = 'none'; flash.style.opacity = a; requestAnimationFrame(() => { flash.style.transition = `opacity ${ms}ms`; flash.style.opacity = 0; }); }

  // ---------------------------------------------------------------- ESTADO
  const S = { gravity: 0, invert: false, roll: 0, shake: 0, fovWave: 0, fog: 1, glitch: false, tint: 0, night: false, lava: false, lavaT: 0, beat: 0 };
  const baseTint = 0.8;

  // Cielo de sangre (se aplica también en el menú)
  const skyUpd = G.sky.update;
  const cTop = new Color(0.16, 0.0, 0.01), cHor = new Color(0.5, 0.04, 0.03), cFog = new Color(0.14, 0.01, 0.01), cHemi = new Color(0.9, 0.25, 0.2);
  let flick = 0;
  G.sky.update = function (t, ...rest) {
    const r = skyUpd.call(this, t, ...rest);
    try {
      const k = Math.min(1, baseTint + S.tint);
      const u = this.skyMat.uniforms;
      u.uTop.value.lerp(cTop, k); u.uHor.value.lerp(cHor, k);
      u.uSunCol.value.setRGB(1.4, 0.08, 0.04);
      if (U) { U.uSkyTop.value.copy(u.uTop.value); U.uSkyHorizon.value.copy(u.uHor.value); }
      this.fogColor.lerp(cFog, k); this.fog.color.copy(this.fogColor);
      this.fog.far *= 0.8 * S.fog; this.fog.near = this.fog.far * (S.fog < 1 ? 0.05 : 0.35);
      this.hemi.color.lerp(cHemi, k * 0.6);
      this.sun.color.lerp(new Color(1, 0.3, 0.25), k * 0.7);
      flick -= t;
      if (flick <= 0) { flick = rnd(6, 20); if (Math.random() < 0.5) this.flash = 0.12; }
    } catch {}
    return r;
  };

  // Entrada invertida
  const inUpd = G.input.update, inLook = G.input.takeLook;
  G.input.update = function (...a) { const r = inUpd.apply(this, a); if (S.invert) { this.moveX = -this.moveX; this.moveY = -this.moveY; } return r; };
  G.input.takeLook = function (...a) { const r = inLook.apply(this, a); if (S.invert && r) { r[0] = -r[0]; r[1] = -r[1]; } return r; };

  // Cámara: temblor, mundo al revés, FOV demente
  const camUpd = G.updateCameraAndSky;
  let fovSaved = null, fovT = 0;
  G.updateCameraAndSky = function (t) {
    const r = camUpd.call(this, t);
    const c = this.camera;
    if (S.shake > 0) { c.position.x += rnd(-1, 1) * S.shake; c.position.y += rnd(-1, 1) * S.shake; c.position.z += rnd(-1, 1) * S.shake; }
    if (S.roll) c.rotateZ(S.roll);
    if (S.fovWave) { if (fovSaved === null) fovSaved = c.fov; fovT += t; c.fov = Math.max(25, Math.min(150, fovSaved + Math.sin(fovT * 2.3) * 45 * S.fovWave)); c.updateProjectionMatrix(); }
    else if (fovSaved !== null) { c.fov = fovSaved; fovSaved = null; c.updateProjectionMatrix(); }
    c.updateMatrixWorld();
    return r;
  };

  // ---------------------------------------------------------------- HELPERS DE CAOS
  const mobType = (key) => MOBS.find((m) => m.key === key);
  function spawnAround(key, n, rMin, rMax) {
    const ty = mobType(key); if (!ty) return 0; let c = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = rnd(rMin, rMax), x = P().x + Math.cos(a) * d, z = P().z + Math.sin(a) * d, y = surf(x, z);
      if (y > 0) { try { G.mobs.spawn(ty, x, y + 1.05, z); c++; G.particles.puff(x, y + 1.5, z, 14, [0.1, 0, 0]); } catch {} }
    }
    return c;
  }
  const fleshBlocks = () => [B.CLOTH_RED, B.RUBELLITE_BLOCK, B.CLOTH_BLACK, B.BASALT, B.MUD, B.CLOTH_RED].filter((v) => v != null);
  const safe = (id) => id !== 0 && id !== B.WATER && id !== B.DEEPSTONE && id !== B.SKY_RIFT && id !== B.ASH_RIFT && id !== B.BED && id !== B.CRATE && id !== B.DOOR_LOWER && id !== B.DOOR_UPPER;
  function itemId(keys) { for (let i = 0; i < 8; i++) { const k = pick(keys); if (I[k] != null) return I[k]; } return null; }

  // ---------------------------------------------------------------- EVENTOS
  const EVENTS = [
    { id: 'grav', t: 'LA GRAVEDAD SE ROMPIÓ', s: 'flotas… y algo flota contigo', dur: 16, start() { S.gravity = 1; }, end() { S.gravity = 0; } },
    { id: 'inv', t: 'CONTROLES POSEÍDOS', s: 'tu cuerpo ya no te obedece', dur: 14, start() { S.invert = true; }, end() { S.invert = false; } },
    { id: 'roll', t: 'EL MUNDO SE DIO VUELTA', s: 'el cielo está abajo', dur: 12, start() { S.roll = Math.PI; }, end() { S.roll = 0; } },
    { id: 'quake', t: 'TERREMOTO MALDITO', s: 'la tierra tiene hambre', dur: 10, start() { S.shake = 0.12; vib(300); },
      tick(dt) { if (Math.random() < dt * 4) { const p = P(); G.particles.puff(p.x + rnd(-4, 4), p.y, p.z + rnd(-4, 4), 10, [0.3, 0.25, 0.2]); } }, end() { S.shake = 0; } },
    { id: 'blind', t: 'NIEBLA DE SANGRE', s: 'no ves nada. él sí.', dur: 18, start() { S.fog = 0.14; S.tint = 0.3; }, end() { S.fog = 1; S.tint = 0; } },
    { id: 'glitch', t: 'ERROR DE REALIDAD', s: 'r̷e̷a̷l̷i̷d̷a̷d̷.̷e̷x̷e̷ dejó de responder', dur: 9, start() { S.glitch = true; },
      tick() { G.renderer.domElement.style.filter = Math.random() < 0.5 ? `invert(1) hue-rotate(${(Math.random() * 360) | 0}deg)` : `saturate(4) hue-rotate(${(Math.random() * 90) | 0}deg) contrast(1.6)`; if (Math.random() < 0.05) sfx.static(0.1, 0.15); },
      end() { S.glitch = false; G.renderer.domElement.style.filter = ''; } },
    { id: 'fov', t: 'VISIÓN DEMENTE', s: 'tus ojos se derriten', dur: 12, start() { S.fovWave = 1; fovT = 0; }, end() { S.fovWave = 0; } },
    { id: 'night', t: 'NOCHE ETERNA', s: 'el sol no va a volver', dur: 30, start() { S.night = true; }, tick() { G.time = Math.floor(G.time / DAY) * DAY + DAY * 0.75; }, end() { S.night = false; } },
    { id: 'rain', t: 'LLUVIA DE SANGRE', s: 'no la toques', dur: 25, start() { G.rainTarget = 1; G.storm = true; S.tint = 0.25; }, end() { G.rainTarget = 0; G.storm = false; S.tint = 0; } },
    { id: 'lava', t: 'EL SUELO ES LAVA', s: 'salta. no pares. 3… 2… 1…', dur: 13, start() { S.lavaT = 3; },
      tick(dt) { const p = P(); if (S.lavaT > 0) { S.lavaT -= dt; return; }
        if (Math.random() < dt * 12) G.particles.flame(p.x + rnd(-1, 1), p.y + 0.05, p.z + rnd(-1, 1));
        if (p.body.onGround && !p.body.inWater) p.hurt(1, null, null, 'el suelo maldito'); } },
    { id: 'meteor', t: 'EL CIELO SE CAE', s: 'meteoros malditos', dur: 12, start() { this.n = 0; },
      tick(dt) { if (Math.random() < dt * 1.3) { const p = P(), a = Math.random() * 6.28, d = rnd(7, 22), x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, y = surf(x, z);
        if (y > 0) { G.particles.burst(x, y + 3, z, [1, 0.25, 0.05], 30); G.explode(x, y + 0.5, z, 2.6); } } } },
    { id: 'tnt', t: '¡CORRE!', s: 'hay barriles explosivos a tu alrededor', dur: 0, start() {
        if (B.BLAST_KEG == null) return; const p = P();
        for (let i = 0; i < 3; i++) { const a = Math.random() * 6.28, d = rnd(2.5, 4.5), x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d), y = surf(x, z) + 1;
          if (y > 1 && G.world.getBlock(x, y, z) === 0) { G.world.setBlock(x, y, z, B.BLAST_KEG); G.ignite(x, y, z, 3.5 + i * 0.4); } } } },
    { id: 'horde', t: 'LA HORDA DESPERTÓ', s: 'vienen por ti', dur: 0, start() { spawnAround('gloomling', 4, 10, 16) + spawnAround('crawler', 2, 10, 16); } },
    { id: 'wisps', t: 'ENJAMBRE', s: 'zumban en tu cabeza', dur: 0, start() { spawnAround('stingwisp', 5, 6, 12) || spawnAround('gloomling', 3, 8, 14); } },
    { id: 'flesh', t: 'TODO SE VUELVE CARNE', s: 'el mundo se pudre a tu alrededor', dur: 0, start() {
        const p = P(), F = fleshBlocks(); if (!F.length) return;
        for (let dx = -6; dx <= 6; dx++) for (let dz = -6; dz <= 6; dz++) { if (dx * dx + dz * dz > 36 || Math.random() < 0.25) continue;
          const x = Math.floor(p.x) + dx, z = Math.floor(p.z) + dz, y = surf(x, z); if (y <= 0) continue; const id = G.world.getBlock(x, y, z);
          if (safe(id)) G.world.setBlock(x, y, z, pick(F)); } } },
    { id: 'totem', t: 'UN TÓTEM APARECIÓ', s: 'no estaba ahí hace un segundo', dur: 0, start() {
        const p = P(), a = Math.random() * 6.28, x = Math.floor(p.x + Math.cos(a) * 8), z = Math.floor(p.z + Math.sin(a) * 8), y = surf(x, z) + 1; if (y <= 1) return;
        const col = B.CLOTH_BLACK ?? B.BASALT; for (let i = 0; i < 4; i++) if (G.world.getBlock(x, y + i, z) === 0) G.world.setBlock(x, y + i, z, col);
        if (B.LANTERN != null && G.world.getBlock(x, y + 4, z) === 0) G.world.setBlock(x, y + 4, z, B.LANTERN); sfx.whisper(); } },
    { id: 'tp', t: 'TELETRANSPORTE MALDITO', s: '¿dónde estás?', dur: 0, start() {
        const p = P(); for (let i = 0; i < 10; i++) { const a = Math.random() * 6.28, d = rnd(18, 34), x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, y = surf(x, z);
          if (y > 2) { p.setPos(Math.floor(x) + 0.5, y + 1.2, Math.floor(z) + 0.5); glitchFlash(1, 500); return; } } } },
    { id: 'shuffle', t: 'INVENTARIO POSEÍDO', s: 'tus cosas se mueven solas', dur: 0, start() {
        const s = P().inv.slots; for (let i = s.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [s[i], s[j]] = [s[j], s[i]]; } } },
    { id: 'gift', t: 'REGALO DEL ABISMO', s: '¿por qué te da esto?', dur: 0, start() {
        const id = itemId(['sunstone_ingot', 'azurite', 'glowshard', 'iron_ingot', 'gloom_essence', 'bone', 'coal', 'copper_ingot']);
        if (id != null) { const n = 1 + ((Math.random() * 6) | 0); P().inv.add(id, n); toast(`+${n} ${(IDS.N && IDS.N(id).name) || 'algo'}`); } } },
    { id: 'pact', t: 'PACTO DE SANGRE', s: 'vida completa… a cambio de tu hambre', dur: 0, start() { const p = P(); p.health = 20; p.hunger = Math.min(p.hunger, 3); } },
    { id: 'giant', t: 'MONSTRUOS GIGANTES', s: 'crecieron', dur: 20, start() { this.list = []; for (const m of G.mobs.mobs) { m.model.root.scale.setScalar(2.3); this.list.push(m); } if (!this.list.length) spawnAround('gloomling', 1, 12, 16); },
      tick() { for (const m of G.mobs.mobs) if (!this.list.includes(m)) { m.model.root.scale.setScalar(2.3); this.list.push(m); } },
      end() { for (const m of this.list) m.model.root.scale.setScalar(1); this.list = []; } },
    { id: 'hunt', t: 'ZPER TE ESTÁ CAZANDO', s: 'míralo a los ojos para que se vaya', dur: 0, start() { stalker.appear(true); } },
  ];

  let active = null, activeT = 0, nextT = 22, lastId = '';
  function runEvent(ev) {
    if (active && active.end) try { active.end(); } catch {}
    active = null;
    sfx.stinger(); glitchFlash(0.55, 220); vib(80);
    banner(ev.t, ev.s, ev.dur ? Math.min(ev.dur, 4) : 3.4);
    try { ev.start && ev.start(); } catch (e) { console.warn('maldito', ev.id, e); }
    if (ev.dur) { active = ev; activeT = ev.dur; }
    lastId = ev.id;
  }
  function randomEvent() { let ev; do ev = pick(EVENTS); while (ev.id === lastId); runEvent(ev); }

  // ---------------------------------------------------------------- ZPER MALDITO (la entidad)
  const stalker = (() => {
    const root = new Group(), black = new Basic({ color: 0x030303 }), red = new Basic({ color: 0xff1a0d, fog: false });
    const add = (w, h, d, x, y, z, m) => { const o = new Mesh(new Box(w, h, d), m); o.position.set(x, y, z); root.add(o); return o; };
    add(0.62, 2.4, 0.34, 0, 1.6, 0, black);           // torso
    add(0.6, 0.6, 0.6, 0, 3.1, 0, black);             // cabeza
    add(0.16, 2.6, 0.16, -0.42, 1.5, 0, black);       // brazos largos
    add(0.16, 2.6, 0.16, 0.42, 1.5, 0, black);
    add(0.2, 1.0, 0.2, -0.17, 0.25, 0, black);        // piernas
    add(0.2, 1.0, 0.2, 0.17, 0.25, 0, black);
    add(0.14, 0.07, 0.02, -0.14, 3.15, 0.31, red);    // ojos
    add(0.14, 0.07, 0.02, 0.14, 3.15, 0.31, red);
    root.visible = false; G.scene.add(root);
    const fwd = new V3(), to = new V3();
    let on = false, hunting = false, life = 0, seen = 0, wait = rnd(45, 80), beatT = 0;
    function place(close) {
      const p = P(), yaw = p.yaw;
      // detrás o a un costado de la vista
      const a = -yaw + Math.PI / 2 + Math.PI + rnd(-1.3, 1.3), d = close ? rnd(9, 13) : rnd(18, 28);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d, y = surf(x, z);
      if (y <= 0) return false; root.position.set(x, y + 1, z); return true;
    }
    function appear(hunt = false) { if (!place(hunt)) return; on = true; hunting = hunt; life = hunt ? 60 : 40; seen = 0; root.visible = true; if (hunt) sfx.whisper(); }
    function vanish(scared) { on = false; hunting = false; root.visible = false; wait = rnd(40, 95) * (G.sky.dayFactor < 0.5 ? 0.6 : 1); if (scared) { glitchFlash(0.9, 260); sfx.static(0.4, 0.35); toast(pick(['…', 'volverá', 'te vio', 'ya sabe dónde vives'])); } }
    function jumpscare() {
      scare.classList.add('on'); sfx.scream(); vib(500);
      setTimeout(() => scare.classList.remove('on'), 650);
      P().hurt(7, root.position.x, root.position.z, 'Zper Maldito');
      vanish(false);
    }
    function update(dt) {
      if (!playing()) { if (!G.world) { root.visible = false; on = false; } return; }
      if (!on) { wait -= dt; if (wait <= 0) appear(false); return; }
      const p = P(), c = G.camera;
      c.getWorldDirection(fwd);
      to.set(root.position.x - c.position.x, root.position.y + 2.6 - c.position.y, root.position.z - c.position.z);
      const dist = to.length(); to.normalize();
      const dot = fwd.dot(to);
      root.lookAt(p.x, root.position.y, p.z);
      life -= dt;
      if (dist < 16) { beatT -= dt; if (beatT <= 0) { beatT = 0.4 + dist / 16; sfx.beat(); } }
      if (dot > 0.965 && dist < 45) { seen += dt; if (seen > (hunting ? 0.9 : 0.45)) return vanish(true); }
      else {
        seen = Math.max(0, seen - dt);
        if (dot < 0.55) { // solo se mueve cuando no lo miras
          const sp = hunting ? 7 : 2.6, dx = p.x - root.position.x, dz = p.z - root.position.z, l = Math.hypot(dx, dz) || 1;
          const nx = root.position.x + (dx / l) * sp * dt, nz = root.position.z + (dz / l) * sp * dt, y = surf(nx, nz);
          if (y > 0) root.position.set(nx, y + 1, nz);
        }
      }
      if (Math.hypot(p.x - root.position.x, p.z - root.position.z) < 1.7) return jumpscare();
      if (life <= 0) vanish(false);
    }
    return { appear, update, vanish, get on() { return on; } };
  })();

  // ---------------------------------------------------------------- SUSURROS
  const WHISPERS = ['Zper te está mirando', 'no mires atrás', '¿escuchaste eso?', 'ya es tarde', 'este mundo no es tuyo', 'cuenta tus bloques', 'algo cavó debajo de ti',
    'no duermas', 'te extrañamos', 'él recuerda tu semilla', 'hay alguien en tu casa', 'sigue construyendo… para él', 'Z̴P̴E̴R̴', 'apaga la pantalla'];
  let whisperT = rnd(25, 45);

  // ---------------------------------------------------------------- BUCLE
  const gameUpd = G.updateGame;
  G.updateGame = function (t) {
    const r = gameUpd.call(this, t);
    try { tick(t); } catch (e) { console.warn('maldito tick', e); }
    return r;
  };
  let lastState = '';
  function tick(dt) {
    const isPlay = playing();
    if (S.gravity && isPlay && !P().flying) P().body.vy += 21 * dt;
    stalker.update(dt);
    if (!isPlay) return;
    // eventos
    if (active) {
      activeT -= dt;
      try { active.tick && active.tick(dt); } catch {}
      banBar.style.display = ''; banFill.style.width = Math.max(0, (activeT / active.dur) * 100) + '%';
      if (activeT <= 0) { try { active.end && active.end(); } catch {} active = null; }
    } else {
      banBar.style.display = 'none';
      nextT -= dt;
      if (nextT <= 0) { randomEvent(); nextT = rnd(24, 42); }
    }
    cd.textContent = active ? `CAOS ACTIVO · ${Math.ceil(activeT)}s` : `PRÓXIMO CAOS · ${Math.max(0, Math.ceil(nextT))}s`;
    whisperT -= dt;
    if (whisperT <= 0) { whisperT = rnd(35, 80); toast(pick(WHISPERS)); sfx.whisper(); }
  }
  // HUD, banner y zumbido según el estado (también en menús)
  let lt = performance.now();
  (function loop() {
    requestAnimationFrame(loop);
    const now = performance.now(), dt = Math.min(0.1, (now - lt) / 1000); lt = now;
    if (banTimer > 0) { banTimer -= dt; if (banTimer <= 0) ban.classList.remove('on'); }
    const inGame = G.state === 'play' || G.state === 'inventory';
    cd.style.display = inGame ? '' : 'none';
    vig.style.display = G.state === 'play' || G.state === 'menu' ? '' : 'none';
    if (!inGame && G.state !== 'pause') ban.classList.remove('on');
    if (drone && ac) drone.gain.setTargetAtTime((G.state === 'loading' ? 0.5 : 1) * 0.05 * vol(), ac.currentTime, 0.5);
    if (G.state !== lastState) {
      if (G.state === 'menu' || G.state === 'dead') { if (active && active.end) try { active.end(); } catch {} active = null; stalker.vanish(false); nextT = 22; }
      lastState = G.state;
    }
  })();

  cd.addEventListener('click', (e) => { e.stopPropagation(); if (playing() && !active) { randomEvent(); nextT = rnd(24, 42); } });
  // Tecla K: forzar caos ya. Ctrl+K: invocar a Zper.
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyK' || !playing()) return;
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); stalker.appear(true); } else randomEvent();
  });
  window.maldito = { events: EVENTS, run: (id) => { const ev = EVENTS.find((e) => e.id === id); ev && runEvent(ev); }, stalker, S };
})();
