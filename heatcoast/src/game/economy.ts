import type { Game } from './game';
import { Poi, poiById } from '../world/layout';
import { WEAPONS } from '../combat/weapons';
import { fmtMoney, rng } from '../core/math';
import { VDEFS, vdef } from '../vehicles/models';
import type { Actor } from '../actors/actor';
import { Look } from '../actors/humanoid';

export interface Item { id: string; name: string; desc: string; price: number; heal?: number; armor?: number; stamina?: number }
export const ITEMS: Record<string, Item> = {
  snack: { id: 'snack', name: 'Gator Chips', desc: '+25 health', price: 6, heal: 25 },
  soda: { id: 'soda', name: 'Sol Cola', desc: '+15 health, +stamina', price: 4, heal: 15, stamina: 40 },
  cuban: { id: 'cuban', name: 'Cuban Sandwich', desc: '+60 health', price: 14, heal: 60 },
  medkit: { id: 'medkit', name: 'First Aid Kit', desc: 'Full health', price: 120, heal: 999 },
  vest: { id: 'vest', name: 'Kevlar Vest', desc: '+100 armour', price: 450, armor: 100 },
};
export interface MenuItem { label: string; sub?: string; price?: number; action?: () => void; disabled?: boolean; keep?: boolean }
const OUTFITS: { name: string; price: number; patch: Partial<Look> }[] = [
  { name: 'Miami Linen', price: 180, patch: { top: 0xf2ece0, jacket: undefined, bottom: 0xd8ccb0 } },
  { name: 'Midnight Leather', price: 650, patch: { top: 0x111111, jacket: 0x1c1c1e, bottom: 0x1c1c1e } },
  { name: 'Hawaiian Heat', price: 90, patch: { top: 0xe8503a, jacket: undefined, bottom: 0x2a3a5a } },
  { name: 'Track Day', price: 220, patch: { top: 0x2a6ac0, jacket: 0x1c2a40, bottom: 0x1c1c1e } },
  { name: 'Bayou Camo', price: 160, patch: { top: 0x4a5a3a, jacket: 0x5a5a3a, bottom: 0x3a3a2a } },
  { name: 'Signature Look', price: 0, patch: {} },
];
const TALK = ['Nice day for it.', 'Don\'t mind me, just heading to work.', 'You look familiar… you on TV?', 'Have you tried the Flamingo Diner? Best pancakes in the county.', 'Watch out at night around the port.', 'They say a gator ate a tourist\'s phone yesterday.'];

/** Money, bank feed, inventory, shops, services. */
export class Economy {
  money = 0; log: { t: string; amt: number; day: number }[] = []; inv: Record<string, number> = {};
  owned: { uid: string; def: string; color: number; mods: any }[] = [];
  constructor(private g: Game) {}
  reset() { this.money = 1500; this.log = []; this.inv = { snack: 2, soda: 1 }; this.owned = []; }
  earn(n: number, why: string) { this.money += n; this.log.unshift({ t: why, amt: n, day: this.g.env.day }); this.log.length = Math.min(this.log.length, 60); this.g.hud.moneyFx(n); this.g.audio.cash(); }
  spend(n: number, why: string) { if (n > this.money) return false; this.money -= n; if (n > 0) { this.log.unshift({ t: why, amt: -n, day: this.g.env.day }); this.g.hud.moneyFx(-n); } return true; }
  use(id: string) {
    const it = ITEMS[id]; if (!it || !this.inv[id]) return; this.inv[id]--; const P = this.g.player;
    if (it.heal) P.hp = Math.min(P.maxHp, P.hp + it.heal); if (it.armor) P.armor = Math.min(100, P.armor + it.armor); if (it.stamina) P.stamina = 100;
    this.g.hud.toast(`Used ${it.name}`); this.g.audio.click();
  }
  update(_dt: number) { /* passive income could go here */ }

  enterPoi(p: Poi) {
    const g = this.g;
    if (!g.isOpen(p)) { g.hud.toast(`${p.name} is closed (opens ${p.open[0]}:00)`); return; }
    if (g.police.stars > 0 && p.kind !== 'hospital') { g.hud.toast('Lose the cops first'); return; }
    if (p.interior) { g.interiors.enter(p); return; }
    this.openPoiMenu(p);
  }
  openPoiMenu(p: Poi) {
    const g = this.g, P = g.player;
    const items: MenuItem[] = [];
    switch (p.kind) {
      case 'store': case 'gas': for (const it of Object.values(ITEMS)) if (it.id !== 'vest') items.push({ label: it.name, sub: it.desc, price: it.price, keep: true, action: () => this.buyItem(it.id) }); break;
      case 'gunshop':
        for (const w of Object.values(WEAPONS)) { if (w.id === 'fists') continue; const own = P.owned.includes(w.id);
          items.push({ label: w.name, sub: own ? `Owned · ammo ${P.ammo[w.id] ?? 0}` : `${w.kind === 'gun' ? `Damage ${w.dmg}${w.pellets ? '×' + w.pellets : ''} · ${w.auto ? 'Auto' : 'Semi'} · Mag ${w.mag}` : 'Melee'}`, price: own ? undefined : w.price, keep: true, disabled: own, action: () => { if (this.spend(w.price, w.name)) { P.giveWeapon(w.id, w.mag * 3); P.selectWeapon(w.id); g.hud.toast(`Bought ${w.name}`); } else g.hud.toast('Not enough money'); } });
          if (own && w.kind === 'gun') items.push({ label: `${w.name} ammo ×${w.mag * 2}`, price: w.ammoPrice, keep: true, action: () => { if (this.spend(w.ammoPrice, 'Ammo')) P.ammo[w.id] = (P.ammo[w.id] ?? 0) + w.mag * 2; else g.hud.toast('Not enough money'); } }); }
        items.push({ label: ITEMS.vest.name, sub: ITEMS.vest.desc, price: ITEMS.vest.price, keep: true, action: () => { if (this.spend(450, 'Armour')) P.armor = 100; } });
        break;
      case 'clothes':
        for (const o of OUTFITS) items.push({ label: o.name, sub: `For ${P.name.split(' ')[0]}`, price: o.price, action: () => { if (!this.spend(o.price, 'Clothes')) { g.hud.toast('Not enough money'); return; } const base = P.heroId === 'rosa' ? (g as any).ROSA_BASE ?? P.look : P.look; const look = o.name === 'Signature Look' ? (P.heroId === 'rosa' ? ROSA_DEF() : JACE_DEF()) : { ...base, ...o.patch }; P.rebuildBody(look); g.hud.toast(`New look: ${o.name}`); } });
        break;
      case 'garage': {
        const v = P.vehicle; if (!v) { g.hud.toast('Drive a car in to use the garage'); return; }
        items.push({ label: 'Repair & clean', sub: `Health ${Math.round(v.health / 10)}%`, price: Math.round((1000 - v.health) * 0.8) + 50, action: () => { if (this.spend(Math.round((1000 - v.health) * 0.8) + 50, 'Repair')) { v.health = 1000; v.burnT = 0; g.hud.toast('Good as new'); } } });
        items.push({ label: 'Respray (lose the heat)', sub: 'Clears 1–2 star wanted level', price: 400, action: () => { if (this.spend(400, 'Respray')) { const c = rng.pick([0x1c1c1e, 0xf2f2f2, 0x7a1f1f, 0x2a3f5f, 0x4a5a4a, 0xe8c030]); v.parts.paint.color.setHex(c); v.color = c; if (g.police.stars <= 2) g.police.clear(); g.hud.toast('Fresh paint'); } } });
        for (const [k, name, price] of [['engine', 'Engine tune', 1800], ['brakes', 'Race brakes', 1200], ['armor', 'Armour plating', 2500]] as const) { const lvl = (v.mods as any)[k]; items.push({ label: `${name} (level ${lvl + 1})`, price: price * (lvl + 1), disabled: lvl >= 3, keep: true, action: () => { if (this.spend(price * (lvl + 1), name)) { (v.mods as any)[k]++; g.hud.toast(`${name} installed`); } } }); }
        items.push({ label: 'Turbo', price: 5000, disabled: v.mods.turbo, keep: true, action: () => { if (this.spend(5000, 'Turbo')) v.mods.turbo = true; } });
        items.push({ label: 'Keep this car (save to garage)', sub: 'It will be delivered when you call Marisol', price: 500, action: () => { if (this.spend(500, 'Registration')) { this.owned.push({ uid: 'c' + Date.now(), def: v.def.id, color: v.color, mods: { ...v.mods } }); v.role = 'owned'; g.hud.toast('Car saved to your garage'); } } });
        break;
      }
      case 'hospital': items.push({ label: 'Get patched up', sub: 'Full health', price: 200, action: () => { if (this.spend(200, 'Treatment')) { P.hp = P.maxHp; } } }); break;
      case 'police': items.push({ label: 'Pay outstanding fines', sub: g.police.stars ? 'Clears your wanted level' : 'Nothing outstanding', price: 1000 * Math.max(1, g.police.stars), disabled: !g.police.stars, action: () => { if (this.spend(1000 * g.police.stars, 'Fines')) g.police.clear(); } }); break;
      case 'hotel': items.push({ label: 'Rent a suite (sleep 8h & save)', price: 350, action: () => { if (this.spend(350, 'Hotel')) this.sleep(8); } }); break;
      case 'bank': items.push({ label: 'Check balance', sub: fmtMoney(this.money), action: () => g.phone.openApp('bank') }); break;
      case 'club': items.push({ label: 'Hit the dance floor', sub: 'Pass an hour, relax', price: 40, action: () => { if (this.spend(40, 'Cover charge')) { g.env.setHour(g.env.hour + 1); g.bond = Math.min(100, g.bond + 4); g.hud.toast('Rosa & Jace danced the night away (+bond)'); } } }); items.push({ label: 'Bottle service', price: 600, action: () => { if (this.spend(600, 'Bottle service')) { g.bond = Math.min(100, g.bond + 8); g.phone.pulsePost('club'); } } }); break;
      case 'bar': items.push({ label: 'Grab a drink', price: 12, action: () => { if (this.spend(12, 'Drinks')) { P.hp = Math.min(P.maxHp, P.hp + 10); g.hud.toast('Cheers'); } } }); items.push({ label: 'Shoot pool with the locals', sub: 'Win or lose $50', action: () => { if (this.money >= 50) { if (rng.chance(0.5 + P.skills.shooting * 0.3)) this.earn(50, 'Pool winnings'); else this.spend(50, 'Pool loss'); g.env.setHour(g.env.hour + 0.5); } } }); break;
      case 'restaurant': case 'diner': items.push({ label: 'Order food', sub: 'Full health', price: 25, action: () => { if (this.spend(25, p.name)) P.hp = P.maxHp; } }); break;
      case 'airport': items.push({ label: 'Charter flight to Palmetto Springs', price: 300, action: () => { if (this.spend(300, 'Charter')) { const m = poiById('motel'); g.teleport(m.door.x + 3, m.door.z, Math.PI / 2); } } }); items.push({ label: 'Charter flight to Downtown helipad', price: 300, action: () => { if (this.spend(300, 'Charter')) { const a = poiById('apt'); g.teleport(a.door.x - 3, a.door.z, -Math.PI / 2); } } }); break;
      case 'safehouse': items.push({ label: 'Sleep & save', action: () => this.sleep(8) }); break;
    }
    g.menus.list(p.name, poiBlurb(p), items);
  }
  buyItem(id: string) { const it = ITEMS[id]; if (this.spend(it.price, it.name)) { this.inv[id] = (this.inv[id] ?? 0) + 1; this.g.hud.toast(`Bought ${it.name}`); } else this.g.hud.toast('Not enough money'); }
  sleep(h: number) { const g = this.g; g.hud.fade(true).then(() => { g.env.setHour(g.env.hour + h); if (g.env.hour < h) g.env.day++; g.player.hp = g.player.maxHp; g.saves.save(); g.hud.toast('Game saved'); g.hud.fade(false); }); }
  talkTo(n: Actor) {
    const g = this.g, P = g.player;
    if (P.aiming && WEAPONS[P.weapon].kind === 'gun') { // robbery
      const take = n.ai?.cash ?? rng.int(10, 120); n.ai.cash = 0; this.earn(take, 'Robbery'); n.ai.state = 'flee'; n.ai.fx = P.x; n.ai.fz = P.z; n.ai.t = 0; g.bubble(n, 'Take it! Just take it!'); g.reportCrime(2, n.x, n.z, 40, true); return;
    }
    n.yaw = Math.atan2(P.x - n.x, P.z - n.z); g.bubble(n, rng.pick(TALK)); n.hum.lookAt = null;
  }
  vehicleDelivery(uid: string) { const o = this.owned.find((x) => x.uid === uid); if (!o) return; const g = this.g, P = g.player; const yaw = P.yaw; const v = g.vehicles.spawn(o.def, P.x + Math.cos(yaw) * 6, P.z - Math.sin(yaw) * 6, yaw, o.color, 'owned'); v.physics = true; v.mods = { ...o.mods }; v.ownerUid = uid; g.hud.toast(`Marisol dropped off your ${vdef(o.def).name}`); }
  dealerItems(): MenuItem[] { return VDEFS.filter((d) => d.price > 0).map((d) => ({ label: `${d.maker} ${d.name}`, sub: `Top speed ${Math.round(d.vmax * 3.6)} km/h`, price: d.price, action: () => { if (this.spend(d.price, `${d.name} purchase`)) { const uid = 'c' + Date.now(); this.owned.push({ uid, def: d.id, color: d.colors[0], mods: { engine: 0, brakes: 0, armor: 0, turbo: false } }); this.vehicleDelivery(uid); } else this.g.hud.toast('Not enough money'); } })); }
  toSave() { return { money: this.money, log: this.log.slice(0, 30), inv: this.inv, owned: this.owned }; }
  fromSave(d: any) { this.money = d.money ?? 0; this.log = d.log ?? []; this.inv = d.inv ?? {}; this.owned = d.owned ?? []; }
}
import { ROSA, JACE } from '../actors/humanoid';
const ROSA_DEF = () => ROSA, JACE_DEF = () => JACE;
function poiBlurb(p: Poi) { return ({ store: 'Snacks, drinks & first aid', gas: 'Fuel up and grab a snack', gunshop: 'Licensed firearms & armour', clothes: 'Designer & street wear', garage: 'Repairs, paint & performance', hospital: 'Emergency care', police: 'Bahía Verde Police Dept.', hotel: 'Five-star beachfront', bank: 'Gulf Coast Savings & Trust', club: 'VIP nights on Coral Mile', bar: 'Cold beer, warm welcome', restaurant: 'Authentic Cuban kitchen', diner: 'Open late, pie all day', airport: 'Charter flights', safehouse: 'Home sweet hideout' } as Record<string, string>)[p.kind] ?? ''; }
