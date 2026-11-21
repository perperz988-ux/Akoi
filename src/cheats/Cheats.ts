import * as THREE from 'three';
import type { Game } from '../core/Game';
import { MenuDef, MenuRow } from '../economy/Economy';
import { VEHICLES } from '../vehicles/VehicleDefs';
import { WEAPONS, WEAPON_ORDER } from '../combat/Weapons';
import { POIS } from '../world/CityLayout';
import { formatMoney } from '../core/MathUtil';

/** Cheat / sandbox tools. Available in Free Roam from the start; in the story via Pause → Cheats. */
export class Cheats {
  god = false; infAmmo = false; infStamina = false; neverWanted = false; vehGod = false; noclip = false;
  superJump = false; superSpeed = false; infNitro = false; slowmo = false; noTraffic = false; noPeds = false; noEvents = false;
  private page = 'main';
  constructor(private g: Game) {}

  update() {
    const g = this.g, p = g.player;
    if (this.god) { p.health = p.maxHealth; }
    if (this.infStamina) p.stamina = 100 + p.skills.stamina * 60;
    if (this.infAmmo) for (const id of p.loadout.owned) { const w = WEAPONS[id]; if (w.kind === 'melee') continue; p.loadout.mag[id] = w.mag; p.loadout.ammo[id] = Math.max(p.loadout.ammo[id] ?? 0, 99); }
    if (this.neverWanted) { g.police.disabled = true; if (g.police.wantedLevel) g.police.clearWanted(); } else if (g.police.disabled && !g.missions.active) g.police.disabled = false;
    const v = p.vehicle;
    if (v) { if (this.vehGod) { v.health = v.maxHealth; v.burning = false; v.engineDead = false; v.exploded = false; } if (this.infNitro) v.nitroFuel = 1; }
    g.traffic.enabled = !this.noTraffic; g.peds.enabled = !this.noPeds; g.events.enabled = !this.noEvents;
    if (this.noTraffic) for (const c of [...g.vehicles.list]) if (c.role === 'traffic' && c !== v) g.traffic.despawn(c);
    if (this.noPeds) for (const n of [...g.peds.npcs]) if (n.faction === 'civ' && !n.vehicle && !n.tag) g.peds.release(n);
  }

  open() { this.page = 'main'; this.show(); }
  private show() {
    const g = this.g;
    g.hud.openMenu({ title: 'Cheats', subtitle: 'Sandbox tools', build: () => this.rows() });
  }
  private tog(label: string, key: keyof Cheats, sub?: string): MenuRow {
    const on = this[key] as boolean;
    return { label: `${on ? '✅' : '⬜'} ${label}`, sub, action: () => { (this as any)[key] = !on; if (key === 'noclip' && on) { this.g.player.vy = 0; } this.g.hud.toast(`${label}: ${!on ? 'ON' : 'OFF'}`); }, keepOpen: true };
  }
  private go(label: string, page: string, sub?: string): MenuRow { return { label: `${label}  ›`, sub, action: () => { this.page = page; this.g.hud.refreshMenu(); }, keepOpen: true }; }
  private back(): MenuRow { return { label: '‹ Back to cheat menu', action: () => { this.page = 'main'; this.g.hud.refreshMenu(); }, keepOpen: true }; }

  private rows(): MenuRow[] {
    const g = this.g, p = g.player, e = g.env;
    const act = (label: string, fn: () => void, sub?: string, keep = true): MenuRow => ({ label, sub, action: fn, keepOpen: keep });
    switch (this.page) {
      case 'player': return [this.back(),
        this.tog('God mode', 'god', 'No damage'), this.tog('Infinite stamina', 'infStamina'), this.tog('Infinite ammo', 'infAmmo'),
        this.tog('Super jump', 'superJump'), this.tog('Super speed', 'superSpeed'), this.tog('Fly / noclip', 'noclip', 'Move with stick; Jump = up, Crouch = down, sprint = faster'),
        this.tog('Slow motion', 'slowmo'),
        act('Full health & armor', () => { p.health = p.maxHealth; p.armor = 100; g.hud.toast('Restored'); }),
        act('Give all weapons + ammo', () => { for (const id of WEAPON_ORDER) if (id !== 'fists') p.giveWeapon(id, WEAPONS[id].mag * 8); g.hud.toast('All weapons'); }),
        act('Max all skills', () => { for (const k of Object.keys(p.skills)) (p.skills as any)[k] = 1; g.hud.toast('Skills maxed'); })];
      case 'money': return [this.back(), ...[10000, 100000, 1000000, 10000000].map((n) => act(`+ ${formatMoney(n)}`, () => g.economy.addCash(n, 'Cheat'))),
        act('Own all safehouses', () => { for (const id of ['safe_midtown', 'safe_beach', 'safe_island']) g.economy.properties.add(id); g.hud.toast('Properties unlocked'); }),
        act('Own all businesses', () => { for (const b of Object.values(g.economy.businesses)) { b.owned = true; b.level = 3; } g.hud.toast('Businesses owned'); }),
        act('Unlock all contacts', () => { for (const id of ['odessa', 'teo', 'hart', 'juno']) { g.missions.friendsUnlocked.add(id); g.economy.friends[id] = 100; } g.hud.toast('Contacts unlocked'); })];
      case 'wanted': return [this.back(), this.tog('Never wanted', 'neverWanted', 'Police ignore you'),
        act('Clear wanted level', () => g.police.clearWanted()),
        ...[1, 2, 3, 4, 5].map((n) => act(`Set wanted level ${n} ★`, () => { g.police.disabled = false; this.neverWanted = false; g.police.clearWanted(); g.police.heat = [0.9, 3, 6.5, 11, 17][n - 1] + 0.01; g.police.wantedLevel = n; g.police.seen = true; g.police.lastKnown.set(p.x, p.y, p.z); g.hud.wantedChanged(n); }))];
      case 'vehicles': { const cls = ['sports', 'super', 'muscle', 'sedan', 'suv', 'pickup', 'bike', 'boat', 'heli', 'service']; return [this.back(), ...cls.map((c) => this.go(c[0].toUpperCase() + c.slice(1), 'veh:' + c))]; }
      case 'world': return [this.back(),
        act('Set time: Dawn 06:00', () => e.setHour(6)), act('Set time: Noon 12:00', () => e.setHour(12)), act('Set time: Sunset 18:30', () => e.setHour(18.5)), act('Set time: Midnight 00:00', () => e.setHour(0)),
        act(e.frozen ? 'Resume time' : 'Freeze time', () => { e.frozen = !e.frozen; }),
        act('Time speed: normal (1 min/s)', () => { e.timeScale = 1 / 60; }), act('Time speed: fast (10 min/s)', () => { e.timeScale = 1 / 6; }), act('Time speed: very fast', () => { e.timeScale = 1 / 1.5; }),
        ...(['clear', 'cloudy', 'rain', 'storm', 'fog'] as const).map((w) => act(`Weather: ${w}`, () => e.setWeather(w))),
        this.tog('No traffic', 'noTraffic'), this.tog('No pedestrians', 'noPeds'), this.tog('No random events', 'noEvents')];
      case 'chaos': return [this.back(),
        act('Explosion at my feet', () => { g.fx.explosion(p.x, p.y, p.z, 1); g.combat.explode(p.x, p.y, p.z, 9, 120, p, null); }),
        act('Explode all nearby vehicles', () => { for (const v of g.vehicles.list) if (Math.hypot(v.x - p.x, v.z - p.z) < 60 && v !== p.vehicle) g.vehicles.explode(v); }),
        act('Spawn 4 gang members (hostile)', () => this.spawnGang(4)), act('Spawn 4 police officers', () => this.spawnCops(4)),
        act('Repair & refuel current vehicle', () => { const v = p.vehicle; if (v) { v.health = v.maxHealth; v.burning = false; v.engineDead = false; g.vehicles.refreshVisual(v); } }),
        this.tog('Indestructible vehicle', 'vehGod'), this.tog('Infinite nitro', 'infNitro'),
        act('Launch my vehicle into the air', () => { const v = p.vehicle; if (v) v.vy = 22; })];
      case 'teleport': return [this.back(), ...POIS.filter((q) => q.kind !== 'construction').map((q) => act(q.name, () => { g.teleportTo(q.x, q.z + 4, Math.PI); }, q.kind, false)),
        act('Waypoint on map', () => { const w = g.markers.waypoint; if (w) g.teleportTo(w.x, w.z, 0); else g.hud.toast('Set a waypoint on the map first'); }, undefined, false)];
      default:
        if (this.page.startsWith('veh:')) {
          const c = this.page.slice(4); const map: Record<string, string[]> = { sports: ['sports'], super: ['super'], muscle: ['muscle'], sedan: ['sedan', 'compact'], suv: ['suv'], pickup: ['pickup', 'van', 'truck', 'bus'], bike: ['bike'], boat: ['boat', 'jetski'], heli: ['heli'], service: ['police', 'swat', 'ambulance', 'taxi'] };
          return [{ label: '‹ Vehicle classes', action: () => { this.page = 'vehicles'; g.hud.refreshMenu(); }, keepOpen: true }, ...VEHICLES.filter((d) => map[c].includes(d.cls)).map((d) => ({ label: `${d.maker} ${d.name}`, sub: `${Math.round(d.topSpeed * 3.6)} km/h`, swatch: d.colors[0], action: () => this.spawnVehicle(d.id) }))];
        }
        return [
          this.go('🧍 Player', 'player', 'God mode, fly, super jump, weapons'), this.go('💰 Money & unlocks', 'money'), this.go('⭐ Wanted level', 'wanted'),
          this.go('🚗 Spawn vehicle', 'vehicles', 'Cars, bikes, boats, helicopters'), this.go('🌦 Time, weather & world', 'world'), this.go('💥 Chaos', 'chaos'), this.go('📍 Teleport', 'teleport'),
        ];
    }
  }

  spawnVehicle(id: string) {
    const g = this.g, p = g.player;
    const water = ['skipper', 'wavebreaker', 'splash_ski'].includes(id);
    if (p.inVehicle) p.exitVehicle(true);
    const x = p.x + Math.sin(p.yaw) * 3.6, z = p.z + Math.cos(p.yaw) * 3.6;
    const v = g.vehicles.spawn(id, x, z, p.yaw, 'owned', undefined, {});
    v.keepOwned = true; v.userData.keepAlive = true; v.setDetail('near'); v.engineOn = true;
    if (water && !require_water(x, z)) g.hud.toast('Boats need water — teleport to the marina');
    g.hud.closeMenu();
    setTimeout(() => { p.mode = 'foot'; p.tryEnterVehicle(); }, 80);
  }
  private spawnGang(n: number) {
    const g = this.g, p = g.player;
    for (let i = 0; i < n; i++) { const a = (i / n) * 6.28; const e = g.missions.spawnHostile({ m: { id: 'cheat' } } as any, p.x + Math.cos(a) * 14, p.z + Math.sin(a) * 14, 'rival', i % 2 ? 'rattler' : 'vigil9'); e.tag = null; e.userData.hostile = true; e.state = 'combat'; e.target = p; e.userData.keep = false; }
  }
  private spawnCops(n: number) {
    const g = this.g, p = g.player;
    for (let i = 0; i < n; i++) { const c = g.police.makeCop('cop'); const a = (i / n) * 6.28; c.x = p.x + Math.cos(a) * 12; c.z = p.z + Math.sin(a) * 12; c.y = p.y; g.police.foot.push(c); c.state = 'combat'; }
    g.police.disabled = false; this.neverWanted = false; g.police.heat = Math.max(g.police.heat, 3); g.police.wantedLevel = Math.max(2, g.police.wantedLevel); g.police.seen = true;
  }
}
import { isWater } from '../world/CityLayout';
const require_water = (x: number, z: number) => isWater(x, z);
void THREE;
