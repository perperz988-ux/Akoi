import type { Game } from './game';

const KEY = (s: number) => `heatcoast.save.${s}`;
export interface SlotMeta { slot: number; used: boolean; time: number; money: number; chapter: string; day: number; hero: string }

/** Three manual slots + autosave (slot 0), stored in localStorage with validation & error handling. */
export class SaveSystem {
  slot = 1; private autoT = 0;
  constructor(private g: Game) {}
  snapshot() {
    const g = this.g, P = g.player;
    g.heroes[P.heroId] = P.toState();
    const pHero = { ...(g.heroes[g.partner.heroId] ?? g.defaultHero(g.partner.heroId, g.partner.x, g.partner.z)), x: g.partner.x, z: g.partner.z, look: g.partner.look };
    g.heroes[g.partner.heroId] = pHero;
    return {
      v: 1, time: Date.now(), active: P.heroId, heroes: g.heroes, bond: g.bond,
      inVehicle: P.vehicle ? { def: P.vehicle.def.id, color: P.vehicle.color, yaw: P.vehicle.yaw } : null,
      economy: g.economy.toSave(), missions: g.missions.toSave(), phone: g.phone.toSave(), stats: P.stats,
      world: { hour: g.env.hour, day: g.env.day, weather: g.env.weather },
    };
  }
  save(slot = this.slot) {
    try {
      const s = this.snapshot(); localStorage.setItem(KEY(slot), JSON.stringify(s));
      const meta: SlotMeta = { slot, used: true, time: s.time, money: s.economy.money, chapter: this.g.missions.chapterName(), day: s.world.day, hero: this.g.player.name };
      localStorage.setItem(KEY(slot) + '.meta', JSON.stringify(meta)); return true;
    } catch (e) { console.warn('save failed', e); this.g.hud.toast('Could not save — storage full or blocked'); return false; }
  }
  autosave() { if (this.g.state !== 'play' || this.g.player.dead) return; this.save(0); }
  slots(): SlotMeta[] { const out: SlotMeta[] = []; for (let s = 0; s <= 3; s++) { try { const r = localStorage.getItem(KEY(s) + '.meta'); if (r) { out.push(JSON.parse(r)); continue; } } catch { /* */ } out.push({ slot: s, used: false, time: 0, money: 0, chapter: '', day: 1, hero: '' }); } return out; }
  hasAny() { return this.slots().some((s) => s.used); }
  latest() { return this.slots().filter((s) => s.used).sort((a, b) => b.time - a.time)[0]; }
  remove(slot: number) { try { localStorage.removeItem(KEY(slot)); localStorage.removeItem(KEY(slot) + '.meta'); } catch { /* */ } }
  async load(slot: number) {
    const g = this.g; let d: any;
    try { const r = localStorage.getItem(KEY(slot)); if (!r) throw new Error('empty'); d = JSON.parse(r); if (!d.heroes || !d.active) throw new Error('corrupt'); }
    catch (e) { g.hud.toast('That save could not be loaded'); return false; }
    this.slot = slot || 1;
    await g.hud.fade(true);
    g.resetWorld();
    g.economy.fromSave(d.economy ?? {}); g.missions.fromSave(d.missions ?? {}); g.phone.fromSave(d.phone ?? {}); g.bond = d.bond ?? 50;
    g.heroes = d.heroes; const act = d.active as 'rosa' | 'jace', other = act === 'rosa' ? 'jace' : 'rosa';
    g.player.fromState(g.heroes[act]!); Object.assign(g.player.stats, d.stats ?? {});
    const o = g.heroes[other] ?? g.defaultHero(other, g.player.x + 2, g.player.z);
    g.partner.rebuild(o.look); g.partner.name = o.name; g.partner.heroId = other; g.partner.placeAt(o.x, o.z, o.yaw); g.partner.dead = false; g.partner.hp = g.partner.maxHp; g.partner.equip('pistol');
    g.env.setHour(d.world?.hour ?? 10); g.env.day = d.world?.day ?? 1; g.env.setWeather(d.world?.weather ?? 'clear');
    if (d.inVehicle) { const v = g.vehicles.spawn(d.inVehicle.def, g.player.x, g.player.z, d.inVehicle.yaw, d.inVehicle.color, 'player'); v.physics = true; g.vehicles.seat(v, g.player, 0); g.player.mode = 'vehicle'; g.vehicles.seat(v, g.partner, 1); }
    g.cam.snapBehind(g.player.yaw);
    await g.preload();
    g.state = 'play'; g.paused = false; g.menus.showTitle(false); g.menus.closeAll(); g.hud.show(true); g.touch.show(true);
    await g.hud.fade(false); g.audio.init(); g.hud.toast('Game loaded');
    g.missions.afterLoad();
    return true;
  }
  update(dt: number) { this.autoT += dt; if (this.autoT > 120 && !this.g.missions.active && this.g.police.stars === 0 && this.g.player.mode !== 'dead') { this.autoT = 0; this.autosave(); this.g.hud.toast('Autosaved', 1.2); } }
}
