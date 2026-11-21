import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Poi, POIS, PoiKind } from '../world/CityLayout';
import { VEHICLES, VehicleDef, defById } from '../vehicles/VehicleDefs';
import { WEAPONS, WEAPON_ORDER } from '../combat/Weapons';
import { OwnedVehicle } from '../vehicles/VehicleManager';
import { formatMoney } from '../core/MathUtil';

export interface MenuRow { label: string; sub?: string; price?: number; disabled?: boolean; action?: () => void; header?: boolean; keepOpen?: boolean; swatch?: number }
export interface MenuDef { title: string; subtitle?: string; build: () => MenuRow[]; onClose?: () => void }

export interface Business { id: string; name: string; price: number; incomePerHour: number; level: number; pending: number; owned: boolean }
export const BUSINESSES: Omit<Business, 'level' | 'pending' | 'owned'>[] = [
  { id: 'garage_port', name: 'Dockside Customs', price: 120000, incomePerHour: 260 },
  { id: 'gas1', name: 'Sunfuel (Midtown)', price: 45000, incomePerHour: 90 },
  { id: 'food_noodle', name: 'Lucky Noodle', price: 38000, incomePerHour: 75 },
  { id: 'club', name: 'Neon Reef', price: 210000, incomePerHour: 520 },
  { id: 'marina', name: 'Vela Marina Boats', price: 175000, incomePerHour: 400 },
  { id: 'carwash', name: 'Bubble Bay Wash', price: 29000, incomePerHour: 60 },
];
export const PROPERTIES = [
  { id: 'safe_midtown', price: 0 }, { id: 'safe_beach', price: 85000 }, { id: 'safe_island', price: 340000 },
];
export const FRIENDS: Record<string, { name: string; role: string; perk: string }> = {
  odessa: { name: 'Odessa Vance', role: 'Garage owner & fixer', perk: 'Garage discounts' },
  teo: { name: 'Teo Marquez', role: 'Street racer', perk: 'Delivers your cars free' },
  hart: { name: 'Det. Lena Hart', role: 'PSPD detective', perk: 'Can clear one wanted level' },
  juno: { name: 'Juno Park', role: 'Fixer & hacker', perk: 'Reveals hidden jobs' },
};
const PAINTS = [0x111111, 0xf5f5f5, 0xc0392b, 0x1f3a5f, 0x2e7d4f, 0xe0b020, 0xff5a1f, 0x8e44ad, 0x3a86ff, 0x7f8c8d, 0xb5179e, 0x2ec4b6];

export class Economy {
  money = 2500;
  totalEarned = 0;
  properties = new Set<string>(['safe_midtown']);
  businesses: Record<string, Business> = {};
  friends: Record<string, number> = { odessa: 0, teo: 0, hart: 0, juno: 0 };
  outfit = { shirt: 0x1f6f8b, pants: 0x23262d, jacket: 0 };
  ledger: { t: number; amt: number; why: string }[] = [];
  lastIncomeHour = -1;
  tipsUnlocked = new Set<string>();
  buffs: { speed: number; tipsy: number; heal: number } = { speed: 0, tipsy: 0, heal: 0 };
  constructor(private g: Game) {
    for (const b of BUSINESSES) this.businesses[b.id] = { ...b, level: 0, pending: 0, owned: false };
  }

  addCash(n: number, why = '') { this.money += Math.floor(n); this.totalEarned += Math.max(0, n); this.ledger.push({ t: this.g.time, amt: n, why }); if (this.ledger.length > 30) this.ledger.shift(); this.g.hud?.moneyDelta(+n); if (n >= 50) this.g.audio.cash(); }
  spend(n: number, why = ''): boolean { if (this.money < n) return false; this.money -= Math.floor(n); this.ledger.push({ t: this.g.time, amt: -n, why }); this.g.hud?.moneyDelta(-n); return true; }
  canAfford(n: number) { return this.money >= n; }

  isOpen(p: Poi) {
    const h = this.g.env.hour;
    if (p.open === 0 && p.close === 24) return true;
    return p.open < p.close ? h >= p.open && h < p.close : h >= p.open || h < p.close;
  }
  discount(kind: string) {
    let d = 0;
    if ((kind === 'garage' || kind === 'carwash') && this.friends.odessa >= 40) d += 0.15;
    if (this.friends.odessa >= 80 && kind === 'garage') d += 0.1;
    return 1 - d;
  }
  adjustFriend(id: string, n: number) { this.friends[id] = Math.min(100, (this.friends[id] ?? 0) + n); this.g.hud?.toast(`${FRIENDS[id].name}: relationship +${n}`); }
  friendUnlocked(id: string) { return this.g.missions.isFriendUnlocked(id); }

  /** Business income ticks per in-game hour. */
  update(dt: number) {
    const g = this.g;
    const h = Math.floor(g.env.hour + (g.env.day - 1) * 24);
    if (this.lastIncomeHour < 0) this.lastIncomeHour = h;
    while (h > this.lastIncomeHour) {
      this.lastIncomeHour++;
      for (const b of Object.values(this.businesses)) if (b.owned) b.pending += b.incomePerHour * (1 + (b.level - 1) * 0.5) * (0.7 + Math.random() * 0.6);
    }
    this.buffs.speed = Math.max(0, this.buffs.speed - dt); this.buffs.tipsy = Math.max(0, this.buffs.tipsy - dt); this.buffs.heal = Math.max(0, this.buffs.heal - dt);
    if (this.buffs.heal > 0) g.player.health = Math.min(g.player.maxHealth, g.player.health + dt * 6);
  }
  collectIncome() { let total = 0; for (const b of Object.values(this.businesses)) if (b.owned) { total += b.pending; b.pending = 0; } if (total > 0) this.addCash(total, 'Business income'); else this.g.hud?.toast('Nothing to collect yet'); }
  pendingIncome() { let t = 0; for (const b of Object.values(this.businesses)) if (b.owned) t += b.pending; return Math.floor(t); }

  // ------------------------------------------------------------ vehicles
  buyVehicle(def: VehicleDef, at: { x: number; z: number; yaw: number }, color?: number) {
    if (!this.spend(def.price, 'Vehicle: ' + def.name)) { this.g.hud?.toast('Not enough money'); return null; }
    const o: OwnedVehicle = { uid: 'v' + Date.now().toString(36) + Math.floor(Math.random() * 999), defId: def.id, color: color ?? def.colors[0], mods: { engine: 0, brakes: 0, tires: 0, armor: 0 }, premium: false, health: def.hp, plate: '', stored: false, x: at.x, z: at.z, yaw: at.yaw };
    this.g.vehicles.owned.push(o);
    const v = this.g.vehicles.spawnOwned(o, at.x, at.z, at.yaw);
    o.plate = v.plate; v.keepOwned = true;
    this.g.hud?.toast(`Purchased ${def.maker} ${def.name}`);
    this.g.bus.emit('vehicleBought', o);
    return v;
  }
  sellValue(o: OwnedVehicle) { const d = defById(o.defId); return Math.floor(d.price * 0.45 * (0.5 + 0.5 * o.health / d.hp) + (o.mods.engine + o.mods.brakes + o.mods.tires + o.mods.armor) * d.price * 0.02); }

  // ------------------------------------------------------------ menus per POI
  poiMenu(p: Poi): MenuDef | null {
    const g = this.g;
    const pl = g.player;
    const open = this.isOpen(p);
    if (!open) { g.hud?.toast(`${p.name} is closed (opens ${String(p.open).padStart(2, '0')}:00)`); return null; }
    const heal = (cost: number, hp: number, stam = true, label = 'Meal') => () => { if (this.spend(cost, label)) { pl.health = Math.min(pl.maxHealth, pl.health + hp); if (stam) pl.stamina = 100 + pl.skills.stamina * 60; g.audio.eat(); g.hud?.toast(`+${hp} health`); } else g.hud?.toast('Not enough money'); };
    const mk = (title: string, build: () => MenuRow[], subtitle?: string): MenuDef => ({ title, subtitle: subtitle ?? p.name, build });
    switch (p.kind as PoiKind) {
      case 'restaurant': return mk('Menu', () => [
        { label: 'Daily special', sub: 'Restores 45 health & stamina', price: 28, action: heal(28, 45) },
        { label: 'Quick bite', sub: 'Restores 20 health', price: 12, action: heal(12, 20) },
        { label: 'Feast with a friend', header: true },
        ...this.hangoutRows(65, 'dinner'),
      ]);
      case 'gas': return mk('Convenience', () => [
        { label: 'Snack bar', sub: '+15 health', price: 5, action: heal(5, 15, false, 'Snack') },
        { label: 'Energy drink', sub: 'Faster sprint for 90s', price: 8, action: () => { if (this.spend(8, 'Drink')) { this.buffs.speed = 90; g.hud?.toast('Energized'); } } },
        { label: 'Body armor vest', sub: '+50 armor', price: 350, action: () => { if (this.spend(350, 'Armor')) { pl.armor = Math.min(100, pl.armor + 50); g.hud?.toast('Armor equipped'); } else g.hud?.toast('Not enough money'); } },
      ]);
      case 'hotel': return mk('Front desk', () => [
        { label: 'Rent a room (sleep to morning)', sub: 'Fully heals, saves progress', price: 90, action: () => { if (this.spend(90, 'Hotel')) { g.interiors.exit(); g.sleepUntil(7); } else g.hud?.toast('Not enough money'); } },
        { label: 'Room service', sub: '+30 health', price: 40, action: heal(40, 30) },
      ]);
      case 'hospital': return mk('Emergency desk', () => [
        { label: 'Full treatment', sub: 'Restore health', price: 150, action: () => { if (this.spend(150, 'Treatment')) { pl.health = pl.maxHealth; g.hud?.toast('Treated'); } else g.hud?.toast('Not enough money'); } },
        { label: 'Armor plating', sub: '+100 armor', price: 600, action: () => { if (this.spend(600, 'Armor')) { pl.armor = 100; g.hud?.toast('Armor fitted'); } } },
      ]);
      case 'police': return mk('Station desk', () => [
        { label: 'Pay off a favour', sub: g.police.wantedLevel ? `Clears wanted level — $${g.police.wantedLevel * 2500}` : 'No active wanted level', price: g.police.wantedLevel * 2500, disabled: g.police.wantedLevel === 0, action: () => { const c = g.police.wantedLevel * 2500; if (this.spend(c, 'Favour')) { g.police.clearWanted(); g.hud?.toast('Heat cleared'); } else g.hud?.toast('Not enough money'); } },
        { label: 'Detective Hart', sub: this.friends.hart >= 60 ? 'Call in a favour (free, once a day)' : 'Raise your relationship to 60 to unlock', disabled: this.friends.hart < 60 || !g.police.wantedLevel, action: () => { g.police.clearWanted(); g.hud?.toast('Hart made some calls'); } },
      ]);
      case 'clothing': return mk('Fitting room', () => [
        { label: 'Shirt colour', header: true },
        ...[0x1f6f8b, 0xc0392b, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xecf0f1, 0x2c3e50, 0xe67e22, 0x111111].map((c) => ({ label: 'Shirt', swatch: c, price: 45, action: () => { if (this.spend(45, 'Clothes')) { this.outfit.shirt = c; this.applyOutfit(); } else g.hud?.toast('Not enough money'); }, keepOpen: true })),
        { label: 'Trousers', header: true },
        ...[0x23262d, 0x34495e, 0x7b6a4f, 0x4a6fa5, 0xe8e8e8, 0x555a60].map((c) => ({ label: 'Trousers', swatch: c, price: 40, action: () => { if (this.spend(40, 'Clothes')) { this.outfit.pants = c; this.applyOutfit(); } else g.hud?.toast('Not enough money'); }, keepOpen: true })),
        { label: this.outfit.jacket ? 'Remove tactical vest' : 'Tactical vest (cosmetic)', price: 80, action: () => { if (this.spend(80, 'Clothes')) { this.outfit.jacket = this.outfit.jacket ? 0 : 0x2b2f36; this.applyOutfit(); } }, keepOpen: true },
      ]);
      case 'gear': return mk('Armory', () => {
        const rows: MenuRow[] = [];
        for (const id of WEAPON_ORDER) {
          const w = WEAPONS[id]; if (id === 'fists') continue;
          const owned = pl.loadout.owned.includes(id);
          if (!owned) rows.push({ label: w.name, sub: `${w.kind} · ${w.damage}${w.pellets > 1 ? 'x' + w.pellets : ''} dmg · ${w.rate}/s`, price: w.price, action: () => { if (this.spend(w.price, w.name)) { pl.giveWeapon(id, w.mag * 2); g.hud?.toast(`Bought ${w.name}`); } else g.hud?.toast('Not enough money'); }, keepOpen: true });
          else if (w.kind !== 'melee') rows.push({ label: `${w.name} ammo (+${w.mag * 2})`, sub: `Reserve ${pl.loadout.ammo[id] ?? 0}`, price: w.ammoPrice * 2, action: () => { if (this.spend(w.ammoPrice * 2, 'Ammo')) pl.addAmmo(id, w.mag * 2); else g.hud?.toast('Not enough money'); }, keepOpen: true });
        }
        rows.push({ label: 'Body armor vest', sub: 'Full armor', price: 450, action: () => { if (this.spend(450, 'Armor')) pl.armor = 100; }, keepOpen: true });
        return rows;
      });
      case 'club': return mk('Neon Reef', () => [
        { label: 'Cocktail', sub: 'Tipsy for a minute (sway & easy-going)', price: 35, action: () => { if (this.spend(35, 'Drinks')) { this.buffs.tipsy = 60; g.hud?.toast('Cheers!'); } } },
        { label: 'Dance until 3 AM', sub: 'Pass the night, +relationship with Juno', price: 60, action: () => { if (this.spend(60, 'Cover')) { g.interiors.exit(); g.sleepUntil(3, false); if (this.friendUnlocked('juno')) this.adjustFriend('juno', 6); g.hud?.toast('What a night'); } } },
        ...this.hangoutRows(80, 'night out'),
      ]);
      case 'bar': return mk('Bar', () => [
        { label: 'Whiskey', sub: 'Tipsy for a minute', price: 18, action: () => { if (this.spend(18, 'Drinks')) { this.buffs.tipsy = 50; } } },
        { label: 'Listen to the regulars', sub: 'Reveal a tip on the map', price: 20, action: () => { if (this.spend(20, 'Tip')) g.markers.revealRandomTip(); } },
        ...this.hangoutRows(40, 'drinks'),
      ]);
      case 'cinema': return mk('Box office', () => [
        { label: 'Watch a movie (2h)', sub: 'Relax. Time passes.', price: 25, action: () => { if (this.spend(25, 'Cinema')) { g.interiors.exit(); g.env.setHour(g.env.hour + 2); g.hud?.toast('The credits roll…'); } } },
        ...this.hangoutRows(50, 'a movie'),
      ]);
      case 'gym': return mk('Boxing gym', () => [
        { label: 'Strength training', sub: 'Stronger melee', price: 40, action: () => { if (this.spend(40, 'Gym')) { pl.skills.strength = Math.min(1, pl.skills.strength + 0.08); g.env.setHour(g.env.hour + 1); g.hud?.toast('Strength +'); } } },
        { label: 'Cardio', sub: 'More stamina', price: 40, action: () => { if (this.spend(40, 'Gym')) { pl.skills.stamina = Math.min(1, pl.skills.stamina + 0.08); g.env.setHour(g.env.hour + 1); g.hud?.toast('Stamina +'); } } },
        { label: 'Shooting range', sub: 'Better accuracy', price: 60, action: () => { if (this.spend(60, 'Range')) { pl.skills.shooting = Math.min(1, pl.skills.shooting + 0.06); g.hud?.toast('Accuracy +'); } } },
      ]);
      case 'carwash': return mk('Car wash', () => [
        { label: 'Wash & wax current vehicle', sub: 'Dries the finish; repairs dents', price: Math.floor(60 * this.discount('carwash')), disabled: !pl.vehicle, action: () => { const v = pl.vehicle; if (v && this.spend(Math.floor(60 * this.discount('carwash')), 'Wash')) { v.health = Math.min(v.maxHealth, v.health + v.maxHealth * 0.3); g.hud?.toast('Squeaky clean'); } } },
      ]);
      case 'taxi': return mk('Sol Cab dispatch', () => this.taxiRows());
      case 'metro': return mk('Old Metro', () => POIS.filter((q) => q.kind === 'metro' && q.id !== p.id).map((q) => ({ label: `To ${q.name.replace('Old Metro: ', '')}`, sub: 'Fast travel', price: 15, action: () => { if (this.spend(15, 'Metro fare')) { g.interiors.exit(); g.teleportTo(q.x, q.z + 3, Math.PI); g.hud?.toast('Arrived'); } else g.hud?.toast('Not enough money'); } })));
      case 'airport': return mk('Terminal', () => [
        { label: 'Charter to Coral Key Villa', sub: 'Skip the traffic', price: 350, action: () => { if (this.spend(350, 'Flight')) { g.interiors.exit(); const s = g.poi('safe_island'); g.teleportTo(s.x, s.z + 3, Math.PI); } } },
        { label: 'Charter to Vela Marina', price: 250, action: () => { if (this.spend(250, 'Flight')) { g.interiors.exit(); const s = g.poi('marina'); g.teleportTo(s.x, s.z + 3, Math.PI); } } },
      ]);
      case 'helipad': return mk('Skyport Helicopter Rental', () => [
        { label: 'Rent a Kite H3 (1 use)', sub: 'Spawns on the pad', price: 1500, action: () => { if (this.spend(1500, 'Heli rental')) { g.interiors.exit(); g.vehicles.spawn('kite_h3', p.x + 6, p.z - 10, 0, 'owned', 0xe8e8e8); g.hud?.toast('Helicopter is ready on the pad'); } else g.hud?.toast('Not enough money'); } },
      ]);
      case 'dealer': return mk('Solano Motorhaus', () => this.dealerRows(p, ['sports', 'super', 'muscle', 'sedan', 'compact', 'suv', 'pickup', 'bike']));
      case 'marina': return mk('Vela Marina', () => this.dealerRows(p, ['boat', 'jetski'], { x: 1218, z: p.z - 60, yaw: Math.PI / 2 }));
      case 'garage': return mk(p.name, () => this.garageRows(p));
      case 'safehouse': return mk(p.name, () => this.safehouseRows(p));
      case 'realestate': return mk('Bayline Realty', () => this.realtyRows());
      default: return null;
    }
  }

  private hangoutRows(cost: number, what: string): MenuRow[] {
    const g = this.g;
    const rows: MenuRow[] = [{ label: 'Hang out', header: true }];
    for (const [id, f] of Object.entries(FRIENDS)) {
      if (!this.friendUnlocked(id)) continue;
      rows.push({ label: `${f.name}`, sub: `${what} · relationship ${this.friends[id]}/100`, price: cost, action: () => { if (this.spend(cost, 'Hangout')) { this.adjustFriend(id, 8); g.env.setHour(g.env.hour + 1.5); g.player.health = g.player.maxHealth; } else g.hud?.toast('Not enough money'); }, keepOpen: true });
    }
    if (rows.length === 1) rows.push({ label: 'No friends unlocked yet', sub: 'Progress the story to meet people', disabled: true });
    return rows;
  }

  private taxiRows(): MenuRow[] {
    const g = this.g;
    const dests = POIS.filter((q) => ['restaurant', 'hotel', 'club', 'hospital', 'dealer', 'marina', 'safehouse', 'airport', 'cinema'].includes(q.kind));
    const rows: MenuRow[] = dests.map((q) => {
      const dist = Math.hypot(q.x - g.player.x, q.z - g.player.z); const fare = Math.max(15, Math.floor(dist * 0.12));
      return { label: q.name, sub: `${Math.round(dist)} m`, price: fare, action: () => { if (this.spend(fare, 'Taxi')) { g.interiors.exit(); g.teleportTo(q.x, q.z + 3, Math.PI); g.env.setHour(g.env.hour + dist / 1500); } else g.hud?.toast('Not enough money'); } };
    });
    return rows;
  }

  dealerRows(p: Poi, classes: string[], at?: { x: number; z: number; yaw: number }): MenuRow[] {
    const rows: MenuRow[] = [];
    const spawn = at ?? { x: p.x + 6, z: p.z + 10, yaw: 0 };
    for (const d of VEHICLES.filter((v) => classes.includes(v.cls) && v.price > 0).sort((a, b) => a.price - b.price)) {
      rows.push({ label: `${d.maker} ${d.name}`, sub: `${d.cls.toUpperCase()} · ${Math.round(d.topSpeed * 3.6)} km/h · ${Math.round(d.power / 745.7)} hp · ${d.seats} seats`, price: d.price, swatch: d.colors[0], action: () => { this.g.interiors.exit(); this.buyVehicle(d, spawn); }, keepOpen: false });
    }
    return rows;
  }

  garageRows(p: Poi): MenuRow[] {
    const g = this.g, v = g.player.vehicle;
    const disc = this.discount('garage');
    const rows: MenuRow[] = [];
    const owned = g.vehicles.owned;
    const stored = owned.filter((o) => o.stored);
    rows.push({ label: 'Your vehicles', header: true });
    if (!owned.length) rows.push({ label: 'No vehicles yet', sub: 'Buy one at Solano Motorhaus', disabled: true });
    for (const o of owned) {
      const d = defById(o.defId);
      const inWorld = !o.stored;
      rows.push({ label: `${d.maker} ${d.name}`, sub: o.stored ? 'In garage — tap to bring out' : (v && v.ownerId === o.uid ? 'Currently driving — tap to store' : 'Out in the city'), swatch: o.color, action: () => {
        if (o.stored) { g.interiors.exit(); g.vehicles.spawnOwned(o, p.x + 5, p.z + 12, 0); g.hud?.toast('Vehicle delivered outside'); }
        else if (v && v.ownerId === o.uid) { g.interiors.exit(); o.stored = true; o.health = v.health; g.vehicles.remove(v); g.hud?.toast('Stored in garage'); }
        else { const live = g.vehicles.list.find((x) => x.ownerId === o.uid); if (live) { g.markers.setWaypoint(live.x, live.z); g.hud?.toast('Marked on your map'); } }
      } });
      void inWorld;
    }
    void stored;
    if (v && v.ownerId) {
      const o = owned.find((x) => x.uid === v.ownerId)!; const d = v.def;
      rows.push({ label: 'Tune current vehicle', header: true });
      const up = (key: 'engine' | 'brakes' | 'tires' | 'armor', label: string, base: number) => {
        const lvl = v.mods[key]; const cost = Math.floor(base * (lvl + 1) * disc);
        rows.push({ label: `${label} L${lvl + 1}`, sub: lvl >= 3 ? 'Maxed' : `Level ${lvl}/3`, price: cost, disabled: lvl >= 3 || (d.tuning ?? 1) < lvl + 1, action: () => { if (this.spend(cost, label)) { v.mods[key]++; o.mods = { ...v.mods }; g.hud?.toast(`${label} upgraded`); } else g.hud?.toast('Not enough money'); }, keepOpen: true });
      };
      up('engine', 'Engine tuning', 1800); up('brakes', 'Brakes', 900); up('tires', 'Tires', 800); up('armor', 'Armor plating', 1500);
      rows.push({ label: 'Repair', sub: `${Math.round(v.health / v.maxHealth * 100)}% health`, price: Math.floor(250 * disc), disabled: v.health >= v.maxHealth, action: () => { if (this.spend(Math.floor(250 * disc), 'Repair')) { v.health = v.maxHealth; v.burning = false; v.engineDead = false; v.userData.wrecked = false; g.vehicles.refreshVisual(v); g.hud?.toast('Repaired'); } else g.hud?.toast('Not enough money'); }, keepOpen: true });
      rows.push({ label: 'Premium clearcoat finish', price: Math.floor(3000 * disc), disabled: v.premium, action: () => { if (this.spend(Math.floor(3000 * disc), 'Finish')) { v.premium = true; o.premium = true; v.setColor(v.color); } }, keepOpen: true });
      rows.push({ label: 'Respray', header: true });
      for (const c of PAINTS) rows.push({ label: 'Paint', swatch: c, price: Math.floor(200 * disc), action: () => { if (this.spend(Math.floor(200 * disc), 'Respray')) { v.setColor(c); o.color = c; } else g.hud?.toast('Not enough money'); }, keepOpen: true });
      rows.push({ label: 'Sell this vehicle', sub: `Offer ${formatMoney(this.sellValue(o))}`, action: () => { const val = this.sellValue(o); g.interiors.exit(); g.player.exitVehicle(true); g.vehicles.remove(v); owned.splice(owned.indexOf(o), 1); this.addCash(val, 'Vehicle sale'); } });
    } else rows.push({ label: 'Drive in an owned vehicle to tune it', disabled: true });
    return rows;
  }

  safehouseRows(p: Poi): MenuRow[] {
    const g = this.g;
    const owned = this.properties.has(p.id);
    const price = PROPERTIES.find((x) => x.id === p.id)?.price ?? 0;
    const rows: MenuRow[] = [];
    if (!owned) { rows.push({ label: 'Buy this property', sub: 'Save point, wardrobe, garage', price, action: () => { if (this.spend(price, 'Property')) { this.properties.add(p.id); g.hud?.toast('You own ' + p.name); g.hud?.refreshMenu(); } else g.hud?.toast('Not enough money'); }, keepOpen: true }); return rows; }
    rows.push({ label: 'Save game', sub: 'Choose a slot from the pause menu or quick-save here', action: () => { g.saves.save(g.saves.currentSlot); g.hud?.toast('Game saved'); }, keepOpen: true });
    rows.push({ label: 'Sleep until morning', sub: 'Heals, advances time', action: () => { g.interiors.exit(); g.sleepUntil(7); } });
    rows.push({ label: 'Wait 3 hours', action: () => { g.env.setHour(g.env.hour + 3); g.hud?.toast('Time passes'); }, keepOpen: true });
    const pend = this.pendingIncome();
    rows.push({ label: 'Collect business income', sub: pend ? `${formatMoney(pend)} waiting` : 'Nothing waiting', disabled: pend <= 0, action: () => { this.collectIncome(); g.hud?.refreshMenu(); }, keepOpen: true });
    rows.push({ label: 'Garage', header: true });
    for (const o of g.vehicles.owned) { const d = defById(o.defId); rows.push({ label: `${d.maker} ${d.name}`, sub: o.stored ? 'Stored — bring out' : 'Out in the city', swatch: o.color, disabled: !o.stored, action: () => { g.interiors.exit(); g.vehicles.spawnOwned(o, p.x + 4, p.z + 12, 0); } }); }
    return rows;
  }

  realtyRows(): MenuRow[] {
    const g = this.g;
    const rows: MenuRow[] = [{ label: 'Properties', header: true }];
    for (const pr of PROPERTIES) { if (pr.price === 0) continue; const poi = g.pois.find((x) => x.id === pr.id)!; const owned = this.properties.has(pr.id); rows.push({ label: poi.name, sub: owned ? 'Owned' : 'Safehouse', price: pr.price, disabled: owned, action: () => { if (this.spend(pr.price, 'Property')) { this.properties.add(pr.id); g.hud?.toast('Purchased ' + poi.name); } else g.hud?.toast('Not enough money'); }, keepOpen: true }); }
    rows.push({ label: 'Businesses (passive income)', header: true });
    for (const b of Object.values(this.businesses)) {
      if (!b.owned) rows.push({ label: b.name, sub: `Earns ~${formatMoney(b.incomePerHour)}/hr`, price: b.price, action: () => { if (this.spend(b.price, 'Business')) { b.owned = true; b.level = 1; g.hud?.toast(`You now own ${b.name}`); g.bus.emit('businessBought', b); } else g.hud?.toast('Not enough money'); }, keepOpen: true });
      else rows.push({ label: `${b.name} — upgrade to L${b.level + 1}`, sub: `Level ${b.level}/3 · ${formatMoney(b.incomePerHour * (1 + (b.level - 1) * 0.5))}/hr`, price: b.level * 25000, disabled: b.level >= 3, action: () => { const c = b.level * 25000; if (this.spend(c, 'Business upgrade')) b.level++; else g.hud?.toast('Not enough money'); }, keepOpen: true });
    }
    return rows;
  }

  applyOutfit() {
    const p = this.g.player;
    p.hum.torso.material = this.cm(this.outfit.shirt);
    for (const a of [p.hum.armL, p.hum.armR]) (a.children[0] as any).material = this.cm(this.outfit.shirt);
    for (const l of [p.hum.legL, p.hum.legR]) { (l.children[0] as any).material = this.cm(this.outfit.pants); (p.hum as any); }
    for (const s of [p.hum.shinL, p.hum.shinR]) (s.children[0] as any).material = this.cm(this.outfit.pants);
  }
  private cm(c: number) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }); }

  toSave() { return { money: this.money, totalEarned: this.totalEarned, properties: [...this.properties], businesses: this.businesses, friends: this.friends, outfit: this.outfit, lastIncomeHour: this.lastIncomeHour, tips: [...this.tipsUnlocked] }; }
  fromSave(s: any) { if (!s) return; this.money = s.money ?? this.money; this.totalEarned = s.totalEarned ?? 0; this.properties = new Set(s.properties ?? ['safe_midtown']); Object.assign(this.businesses, s.businesses ?? {}); Object.assign(this.friends, s.friends ?? {}); Object.assign(this.outfit, s.outfit ?? {}); this.lastIncomeHour = s.lastIncomeHour ?? -1; this.tipsUnlocked = new Set(s.tips ?? []); this.applyOutfit(); }
}
