import * as THREE from 'three';
import type { MissionDef, Ctx } from './missions';
import { MissionFail } from './missions';
import { poiById, Poi, POIS, coastX, route } from '../world/layout';
import { rng } from '../core/math';
import { Look } from '../actors/humanoid';
import type { Vehicle } from '../vehicles/vehicle';
import type { Actor } from '../actors/actor';

// ------------------------------------------------------------------------------------ original cast
export const CAST: Record<string, { name: string; role: string; look: Look }> = {
  beto: { name: 'Tío Beto', role: 'Fixer', look: { skin: 0xb27650, top: 0xf2ece0, bottom: 0xd8ccb0, shoes: 0x6a4a2a, hair: 0x9a9a9a, hairStyle: 'short', build: 1.25, height: 1.72, beard: true } },
  marisol: { name: 'Marisol Vega', role: 'Mechanic', look: { skin: 0xd49a72, top: 0x2a3a5a, vest: 0x2a3a5a, bottom: 0x2a3a5a, shoes: 0x1c1c1e, hair: 0x2e1e12, hairStyle: 'bun', female: true, height: 1.64 } },
  earl: { name: 'Earl Boudreaux', role: 'Swamp bar owner', look: { skin: 0xe8b996, top: 0x8a3a2a, bottom: 0x3a4a6a, shoes: 0x4a3a2a, hair: 0xc8c0b0, hairStyle: 'cap', hat: 0x3a4a3a, build: 1.2, height: 1.82, beard: true } },
  ferro: { name: 'Det. Ana Ferro', role: 'BVPD Detective', look: { skin: 0xc98c64, top: 0xf2f2f2, jacket: 0x1c2a40, bottom: 0x1c2a40, shoes: 0x111111, hair: 0x1a120c, hairStyle: 'long', female: true, height: 1.7 } },
  dez: { name: 'Dez Moreau', role: 'Debtor', look: { skin: 0x8d5636, top: 0xf0a040, bottom: 0x1c1c1e, shoes: 0xf0f0f0, hair: 0x101010, hairStyle: 'buzz', height: 1.78 } },
  kane: { name: 'Victor Kane', role: 'Developer', look: { skin: 0xf3d2bf, top: 0xf2ece0, jacket: 0x1c1c1e, bottom: 0x1c1c1e, shoes: 0x111111, hair: 0xc8a060, hairStyle: 'short', height: 1.86 } },
};
const out = (p: Poi, d = 3) => ({ x: p.door.x + Math.sin(p.face) * d, z: p.door.z + Math.cos(p.face) * d });

export function buildStory(): MissionDef[] {
  const L: MissionDef[] = [];
  // ---------------------------------------------------------------- 1
  L.push({ id: 'm1', title: 'Sunset Palms', chapter: 'Chapter 1 — Broke in Paradise', giver: 'beto', blurb: 'Three days hiding in a Palmetto Springs motel. Time to make a call.', requires: [], reward: 800, auto: true,
    start: () => out(poiById('motel'), 2.5),
    async run(m) {
      const g = m.g, motel = poiById('motel'), d = motel.door; m.lockSwitch = true;
      m.P.placeAt(d.x + 2.4, d.z - 0.8, Math.PI / 2); m.Q.placeAt(d.x + 3.6, d.z + 0.4, -Math.PI / 2);
      await m.shot([d.x + 24, 6, d.z + 16], [d.x + 9, 2.6, d.z + 6], [d.x + 3, 1.4, d.z], 5.5, [{ who: 'partner', text: 'Three days in this motel. The ice machine is judging me.' }]);
      await m.converse([
        { who: 'player', text: 'We have forty dollars and a car with no plates.' },
        { who: 'partner', text: 'Thirty-eight. I bought a Sol Cola.' },
        { who: 'player', text: 'Jace.' },
        { who: 'partner', text: 'It was ninety-six degrees, Rosa!' },
      ], {});
      const c = await m.choice('What now?', ['"We call Tío Beto."', '"We lay low a few more days."'], 14);
      if (c === 0) { g.bond += 2; await m.say([{ who: 'partner', text: 'Beto. Great. Can\'t wait to owe him a kidney.' }]); }
      else { g.bond -= 1; await m.say([{ who: 'partner', text: 'On thirty-eight dollars? I\'m starving. I\'m calling him.' }]); }
      m.lockSwitch = false;
      const diner = poiById('diner_town');
      m.text('jace', 'Breakfast first. Flamingo Diner, across the street. I\'m buying (with your money).');
      await m.goto(out(diner, 2).x, out(diner, 2).z, 'Walk to the Flamingo Diner', { radius: 3.5, foot: true });
      await m.call('beto', [
        { who: 'Tío Beto', text: 'Mija! I hear you two are hiding in Palmetto like raccoons.' },
        { who: 'player', text: 'We need work, Beto.' },
        { who: 'Tío Beto', text: 'Work I have. Go see Marisol at Pit Stop Customs, Calle Verde. Bring a car. Any car.' },
        { who: 'partner', text: '"Any car" means steal one, right?' },
        { who: 'Tío Beto', text: 'I never said that. I love you both. Click.' },
      ]);
      g.phone.unlockContact('marisol');
      m.obj('Get a car (find one, or carjack one)'); await m.until(() => !!m.P.vehicle);
      const gar = poiById('garage'), go = out(gar, 6);
      await m.goto(go.x, go.z, 'Drive to Pit Stop Customs in Calle Verde', { car: true, radius: 9, noCops: true });
      m.obj('Get out and meet Marisol'); await m.until(() => !m.P.vehicle);
      const mar = m.actor(gar.door.x, gar.door.z + Math.cos(gar.face) * 1.5, CAST.marisol.look, CAST.marisol.name);
      await m.converse([
        { who: 'Marisol Vega', text: 'So you\'re Beto\'s strays. You look like a bad decision.' },
        { who: 'partner', text: 'Two bad decisions. We come as a set.', to: mar },
        { who: 'Marisol Vega', text: 'Cute. I move cars. Clean ones out, dirty ones in. You drive?' },
        { who: 'player', text: 'I drove for the Ortega crew for six years. Never got caught.', to: mar },
        { who: 'Marisol Vega', text: 'Until you did. Fine. Come back when you\'re ready to work.' },
      ], { 'Marisol Vega': mar });
      mar.ai.story = false;
    } });
  // ---------------------------------------------------------------- 2
  L.push({ id: 'm2', title: 'Borrowed Wheels', chapter: 'Chapter 1 — Broke in Paradise', giver: 'marisol', blurb: 'Marisol has a buyer for a red Vento GT parked at Hotel Coralina.', requires: ['m1'], reward: 3000,
    start: () => out(poiById('garage'), 3),
    async run(m) {
      const g = m.g, hotel = poiById('hotel');
      await m.say([{ who: 'Marisol Vega', text: 'Red Vento GT, valet lot at Hotel Coralina. Owner\'s a crypto guy. He won\'t miss it.' }, { who: 'partner', text: 'Everybody misses a Vento.' }]);
      const p = { x: hotel.door.x + 10, z: hotel.door.z - 12 };
      const car = m.car('vento', p.x, p.z, Math.PI, 0xc0141c); car.locked = true;
      m.failIf(() => car.dead, 'The Vento was wrecked');
      await m.goto(p.x, p.z, 'Go to Hotel Coralina on Ocean Drive', { radius: 30 });
      m.obj('Steal the red Vento GT'); m.blips = [{ x: car.x, z: car.z, color: '#4dd0ff' }];
      await m.until(() => m.P.vehicle === car);
      g.police.report(2, car.x, car.z, null, true);
      await m.say([{ who: 'partner', text: 'Alarm! Alarm! Why is it always an alarm?!' }]);
      await m.loseCops();
      const gar = poiById('garage'), go = out(gar, 6);
      await m.goto(go.x, go.z, 'Deliver the Vento to Pit Stop Customs', { vehicle: car, radius: 8, noCops: true });
      m.obj('Leave the car'); await m.until(() => !m.P.vehicle);
      if (car.health < 600) { await m.say([{ who: 'Marisol Vega', text: 'You scratched it. I\'m docking you. Kidding. Mostly.' }]); g.economy.spend(Math.min(g.economy.money, 400), 'Damage fee'); }
      else await m.say([{ who: 'Marisol Vega', text: 'Not a scratch. Okay, getaway girl. I\'m impressed.' }]);
      car.role = 'parked'; car.locked = true;
    } });
  // ---------------------------------------------------------------- 3
  L.push({ id: 'm3', title: 'Collections', chapter: 'Chapter 2 — Debts', giver: 'beto', blurb: 'Dez Moreau owes Beto $5,000. He hangs around the Gulfstar at Port Lázaro.', requires: ['m2'], reward: 2500,
    start: () => out(poiById('casa'), 3),
    async run(m) {
      const g = m.g, gas = poiById('gas_port'), at = out(gas, 10);
      await m.call('beto', [{ who: 'Tío Beto', text: 'Dez Moreau. Five grand, eight months late. Port Lázaro Gulfstar.' }, { who: 'Tío Beto', text: 'No hospital, okay? Just... motivation.' }]);
      await m.goto(at.x, at.z, 'Find Dez at the Port Lázaro Gulfstar', { radius: 12 });
      const dez = m.actor(at.x + 3, at.z + 2, CAST.dez.look, CAST.dez.name, 'story');
      const t1 = m.actor(at.x + 5, at.z + 1, 'gang', 'Dez\'s Friend', 'story', 'bat'), t2 = m.actor(at.x + 4.5, at.z + 4, 'gang', 'Dez\'s Friend', 'story', 'pistol');
      const getaway = m.car('ramrod', at.x + 9, at.z + 6, 0, 0xe86a10); g.vehicles.seat(getaway, m.actor(at.x + 9, at.z + 6, 'gang', 'Driver', 'story'), 1);
      m.obj('Talk to Dez'); m.blips = [{ x: dez.x, z: dez.z, color: '#ffd34d' }];
      await m.until(() => Math.hypot(dez.x - m.P.x, dez.z - m.P.z) < 5 && !m.P.vehicle);
      await m.converse([{ who: 'Dez Moreau', text: 'Oh no. Beto sent the Bonnie-and-Clyde knockoffs.', to: m.P }, { who: 'player', text: 'Five thousand, Dez. Today.', to: dez }, { who: 'Dez Moreau', text: 'I got two thousand and a really good excuse.', to: m.P }], { 'Dez Moreau': dez });
      const c = await m.choice('Dez wants a deal', ['Threaten him', '"Take the two grand"', 'Let Jace handle it'], 15);
      if (c === 1) { g.economy.earn(2000, 'Dez (partial)'); await m.say([{ who: 'partner', text: 'Beto\'s gonna love that.' }]); m.def.reward = 500; g.bond -= 1; return; }
      if (c === 2) { await m.say([{ who: 'partner', text: 'Dez. Buddy. Look at my face. Do I look like I sleep?' }, { who: 'Dez Moreau', text: '...Okay, okay! Here! All of it!' }]); g.bond += 4; return; }
      await m.say([{ who: 'player', text: 'Five thousand, or I start with your knees.' }, { who: 'Dez Moreau', text: 'Get them!' }]);
      for (const a of [t1, t2]) { a.faction = 'enemy'; a.ai.brain = (s: Actor, dt: number) => g.events.hostileBrain(s, dt); }
      // Dez runs for the car
      dez.ai.brain = (s: Actor, dt: number) => { if (getaway.seats[0]) return; const dd = Math.hypot(getaway.x - s.x, getaway.z - s.z); if (dd > 2.5) g.peds.walkTo(s, getaway.x, getaway.z, 5, dt); else { g.vehicles.seat(getaway, s, 0); m.driveRoute(getaway, poiById('guns').door, 30); } };
      m.obj('Stop Dez before he gets away'); m.noWanted = false;
      m.failIf(() => Math.hypot(getaway.x - m.P.x, getaway.z - m.P.z) > 280, 'Dez got away');
      await m.until(() => { m.blips = [{ x: (dez.vehicle ? getaway : dez).x, z: (dez.vehicle ? getaway : dez).z, color: '#ff4d4d' }]; return dez.dead || dez.knockT > 0 || getaway.health < 450 || (getaway.speed < 0.5 && !!dez.vehicle && m.t > 20 && Math.hypot(getaway.x - m.P.x, getaway.z - m.P.z) < 15); });
      if (dez.dead) throw new MissionFail('Dez is dead — Beto wanted his money, not a body');
      if (dez.vehicle) g.vehicles.unseat(getaway, dez.seat);
      dez.pose = 'cower'; dez.ai.brain = (s: Actor) => { s.vx = s.vz = 0; s.pose = 'cower'; };
      await m.say([{ who: 'Dez Moreau', text: 'Okay! OKAY! Five grand! Take it!' }]);
      await m.loseCops();
    } });
  // ---------------------------------------------------------------- 4
  L.push({ id: 'm4', title: 'Gator Bend', chapter: 'Chapter 2 — Debts', giver: 'beto', blurb: 'Pick up a package from Earl at Gator\'s Rest, deep in the bayou.', requires: ['m3'], reward: 5000,
    start: () => out(poiById('motel'), 2.5),
    async run(m) {
      const g = m.g, bar = poiById('gator'), at = out(bar, 8);
      await m.say([{ who: 'player', text: 'Beto wants a package from the swamp. No questions.' }, { who: 'partner', text: 'I have SO many questions. Mostly about gators.' }]);
      await m.goto(at.x, at.z, 'Drive to Gator\'s Rest in Gator Bend Bayou', { radius: 12 });
      m.obj('Meet Earl'); await m.until(() => !m.P.vehicle);
      const earl = m.actor(bar.door.x, bar.door.z - 1.5, CAST.earl.look, CAST.earl.name);
      await m.converse([{ who: 'Earl Boudreaux', text: 'Beto\'s kids. You\'re smaller than I pictured.', to: m.P }, { who: 'partner', text: 'I\'m six-one.', to: earl }, { who: 'Earl Boudreaux', text: 'Like I said. Package is out back on the dock. Don\'t touch the cooler, that\'s my lunch.', to: m.Q }], { 'Earl Boudreaux': earl });
      const pk = { x: bar.x + 16, z: bar.z + 14 };
      await m.goto(pk.x, pk.z, 'Grab the package behind the bar', { radius: 3, foot: true });
      g.hud.toast('Package acquired'); await m.wait(0.8);
      await m.say([{ who: 'partner', text: 'Rosa. Headlights. Coming fast.' }]);
      const r1 = m.car('everglade', at.x - 60, at.z + 5, Math.PI / 2, 0x1c1c1e), r2 = m.car('gator', at.x + 70, at.z - 4, -Math.PI / 2, 0x3a3a3a);
      const foes: Actor[] = [];
      for (const [v, n] of [[r1, 3], [r2, 2]] as [Vehicle, number][]) for (let i = 0; i < n; i++) { const e = m.enemy(v.x + i * 1.5, v.z + 3 + i, i % 2 ? 'smg' : 'pistol'); foes.push(e); }
      m.obj('Survive the ambush'); m.noWanted = true;
      await m.until(() => { m.blips = foes.filter((f) => !f.dead).map((f) => ({ x: f.x, z: f.z, color: '#ff4d4d' })); return foes.every((f) => f.dead); });
      m.noWanted = false;
      await m.say([{ who: 'Earl Boudreaux', text: 'Those were Kane\'s boys! Go! I\'ll tell \'em you went to Georgia!' }]);
      const motel = poiById('motel'), mo = out(motel, 4);
      const chasers = [m.car('vento', at.x - 220, at.z, Math.PI / 2, 0x1a1a1a)];
      for (const v of chasers) { const d = m.enemy(v.x, v.z, 'smg'); g.vehicles.seat(v, d, 0); const gun = m.enemy(v.x, v.z, 'smg'); g.vehicles.seat(v, gun, 1); m.chase(v, () => m.P, 38); }
      let shoot = 0;
      await m.goto(mo.x, mo.z, 'Get the package back to the motel', { radius: 6, noCops: true, color: '#ffd34d' }).then(() => {}); void shoot;
    } });
  // ---------------------------------------------------------------- 5
  L.push({ id: 'm5', title: 'Picture This', chapter: 'Chapter 3 — Coral Mile', giver: 'ferro', blurb: 'A detective knows who you are. She wants photos of Victor Kane\'s accountant.', requires: ['m4'], reward: 4000,
    start: () => out(poiById('casa'), 3),
    async run(m) {
      const g = m.g, casa = poiById('casa');
      const ferro = m.actor(casa.door.x + 1.5, casa.door.z + Math.cos(casa.face) * 1.2, CAST.ferro.look, CAST.ferro.name);
      await m.converse([
        { who: 'Det. Ana Ferro', text: 'Rosa Delgado. Jace Holloway. Tampa PD would love a postcard.', to: m.P },
        { who: 'player', text: 'Is this the part where you arrest us?', to: ferro },
        { who: 'Det. Ana Ferro', text: 'This is the part where you help me bury Victor Kane. His accountant leaves the Velvet Room every night with a briefcase.', to: m.P },
        { who: 'Det. Ana Ferro', text: 'Follow him. Photograph the hand-off. Do that, and I lose your file.', to: m.Q },
      ], { 'Det. Ana Ferro': ferro });
      g.phone.unlockContact('ferro');
      const club = poiById('club'), cs = out(club, 9);
      await m.goto(cs.x, cs.z, 'Get a car and wait outside the Velvet Room', { radius: 14, car: true });
      const acct = m.actor(club.door.x, club.door.z, { skin: 0xf3d2bf, top: 0xf2f2f2, jacket: 0x2a2a2a, bottom: 0x2a2a2a, shoes: 0x111111, hair: 0x3a2616, hairStyle: 'short' }, 'The Accountant');
      const car = m.car('cortez', cs.x + 6, cs.z + 8, Math.PI, 0x1c1c1e); g.vehicles.seat(car, acct, 0);
      await m.say([{ who: 'partner', text: 'Black Cortez. That\'s him. Don\'t get close.' }]);
      const bank = poiById('bank'), dest = out(bank, 5);
      let arrived = false; m.driveRoute(car, dest, 15, () => { arrived = true; });
      let close = 0;
      m.failIf(() => Math.hypot(car.x - m.P.x, car.z - m.P.z) > 170, 'You lost him');
      m.failIf(() => close > 4, 'He spotted you');
      await m.until(() => { const d = Math.hypot(car.x - m.P.x, car.z - m.P.z); m.obj(d < 14 ? 'Too close! Back off' : d > 110 ? 'Don\'t lose him!' : 'Tail the accountant'); m.blips = [{ x: car.x, z: car.z, color: '#4dd0ff' }]; return arrived; }, (dt) => { const d = Math.hypot(car.x - m.P.x, car.z - m.P.z); close = d < 14 ? close + dt : Math.max(0, close - dt); });
      m.clearFails(); m.failIf(() => m.Q.dead, 'Partner down');
      g.vehicles.unseat(car, 0); acct.placeAt(dest.x, dest.z);
      const kane = m.actor(bank.door.x + 2, bank.door.z, CAST.kane.look, CAST.kane.name);
      kane.yaw = Math.atan2(acct.x - kane.x, acct.z - kane.z); acct.yaw = kane.yaw + Math.PI;
      m.obj('Open the phone Camera and photograph Kane with the accountant'); m.blips = [{ x: kane.x, z: kane.z, color: '#ffd34d' }];
      g.phone.message('ferro', 'Phone → Camera. Get both faces in the shot.');
      let got = false; const off = g.phone.onPhoto((visible) => { if (visible.includes(kane) && visible.includes(acct)) got = true; else g.hud.toast('Both of them need to be in the shot'); });
      try { await m.until(() => got); } finally { off(); }
      g.phone.toggle(false);
      const c = await m.choice('Who gets the photo?', ['Send it to Det. Ferro', 'Sell it to Tío Beto'], 0);
      if (c === 0) { g.phone.message('ferro', 'Good work. Your file just caught fire. Stay reachable.'); g.bond += 3; }
      else { g.economy.earn(3000, 'Beto bought the photo'); g.phone.message('beto', 'Leverage! Beautiful. $3,000 sent.'); g.phone.message('ferro', 'I know what you did. We\'re not done, Delgado.'); g.bond -= 2; }
      kane.ai.state = 'walk'; acct.ai.state = 'walk';
    } });
  // ---------------------------------------------------------------- 6
  L.push({ id: 'm6', title: 'Salt & Sun', chapter: 'Chapter 4 — The Big Score', giver: 'beto', blurb: 'Kane launders his money through Gulf Coast Savings. One last job.', requires: ['m5'], reward: 60000,
    start: () => out(poiById('apt'), 3),
    async run(m) {
      const g = m.g, bank = poiById('bank'), front = out(bank, 3);
      await m.converse([
        { who: 'player', text: 'Kane\'s cash sits in the Gulf Coast vault every Friday. Beto has the code.' },
        { who: 'partner', text: 'And after?' },
        { who: 'player', text: 'Airport. Hangar two. Earl\'s cousin flies us out.' },
        { who: 'partner', text: 'Earl has a cousin with a plane? That scares me more than the bank.' },
      ], {});
      await m.goto(front.x, front.z, 'Drive to Gulf Coast Savings — park out front', { radius: 10 });
      m.obj('Get out of the car'); await m.until(() => !m.P.vehicle);
      if (!m.P.owned.includes('smg')) { m.P.giveWeapon('smg', 120); g.hud.toast('Beto left you a Wasp SMG'); }
      m.P.selectWeapon('smg');
      await m.goto(bank.door.x, bank.door.z, 'Go inside the bank', { radius: 2.5, foot: true });
      await m.shot([bank.door.x + 6, 2.5, bank.door.z - 6], [bank.door.x + 3, 2, bank.door.z - 3], [bank.door.x, 1.4, bank.door.z], 3, [{ who: 'player', text: 'EVERYBODY DOWN! This is Kane\'s money, not yours!' }]);
      m.lockSwitch = true;
      let prog = 0; m.timer = null;
      const guards: Actor[] = [];
      m.obj('Stay at the vault while Jace cracks it'); m.noWanted = true;
      g.police.setStars(3);
      await m.until(() => { const near = Math.hypot(bank.door.x - m.P.x, bank.door.z - m.P.z) < 6; m.obj(near ? `Cracking the vault… ${Math.floor(prog * 100)}%` : 'Get back to the bank door!'); g.hud.progress(prog); return prog >= 1; }, (dt) => {
        if (Math.hypot(bank.door.x - m.P.x, bank.door.z - m.P.z) < 6) prog += dt / 35;
        if (guards.filter((x) => !x.dead).length < 3 && Math.random() < dt * 0.4) { const a = rng.next() * 6.28; guards.push(m.enemy(bank.door.x + Math.cos(a) * 30, bank.door.z + Math.sin(a) * 30, 'rifle', 'Kane Security', 110)); }
      });
      g.hud.progress(0); m.noWanted = false;
      g.economy.earn(5000, 'Loose cash from the vault');
      await m.say([{ who: 'partner', text: 'Vault\'s open! Bags are heavy — GO!' }]);
      g.police.setStars(4); m.lockSwitch = false;
      const hangar = { x: -1860, z: -1225 };
      await m.goto(hangar.x, hangar.z, 'Escape to Hangar 2 at Bahía Verde International', { radius: 14 });
      g.police.clear();
      await m.shot([hangar.x + 30, 8, hangar.z + 40], [hangar.x + 10, 4, hangar.z + 20], [hangar.x, 2, hangar.z - 20], 4, [{ who: 'partner', text: 'There\'s the plane. Rosa… we actually did it.' }]);
      await m.converse([{ who: 'player', text: 'Sixty thousand each, after Beto. It\'s not the Keys money, but it\'s a start.' }, { who: 'partner', text: 'I don\'t care where we land. As long as it\'s us.' }], {});
      const c = await m.choice('Where to?', ['"The Keys. Like we always said."', '"We stay. Bahía Verde is ours now."'], 0);
      if (c === 0) await m.say([{ who: 'partner', text: 'Little bar. No cops. And a porch.' }, { who: 'player', text: 'And no gators.' }]);
      else await m.say([{ who: 'partner', text: 'Kane\'s empire just got a vacancy. I like it.' }]);
      g.hud.bigMessage('SALT & SUN', 'Story complete — keep exploring Bahía Verde', '#f5c542');
    } });
  return L;
}

// ------------------------------------------------------------------------------------ side activities
export function buildSide(): MissionDef[] {
  const L: MissionDef[] = [];
  L.push({ id: 's_courier', title: 'Courier Run', chapter: 'Side Job', giver: 'marisol', blurb: 'Deliver a sealed package across town before the clock runs out.', requires: ['m1'], reward: 600, side: true, repeatable: true,
    start: () => out(poiById('store_mid'), 3),
    async run(m) {
      const dests = POIS.filter((p) => p.kind !== 'airport' && Math.hypot(p.x - m.P.x, p.z - m.P.z) > 500 && Math.hypot(p.x - m.P.x, p.z - m.P.z) < 1500);
      const p = rng.pick(dests); const r = route(m.P.x, m.P.z, p.door.x, p.door.z); let len = 0; for (let i = 1; i < r.length; i++) len += Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z);
      m.timer = { label: 'Delivery', left: 20 + len / 17 }; m.def.reward = Math.round(200 + len * 0.5);
      m.text('marisol', `Package for ${p.name}. Don't open it. Don't shake it.`);
      await m.goto(out(p, 3).x, out(p, 3).z, `Deliver the package to ${p.name}`, { radius: 6 });
    } });
  const race = (id: string, title: string, cps: { x: number; z: number }[], reward: number, start: () => { x: number; z: number }, cars: string[]) => L.push({ id, title, chapter: 'Street Race', giver: 'marisol', blurb: 'Win a street race against three rivals.', requires: ['m2'], reward, side: true, repeatable: true, start,
    async run(m: Ctx) {
      const g = m.g; const s = start();
      if (!m.P.vehicle) { m.obj('Get a car for the race'); await m.until(() => !!m.P.vehicle); }
      await m.goto(s.x, s.z, 'Go to the starting line', { radius: 10, car: true });
      const yaw = Math.atan2(cps[0].x - s.x, cps[0].z - s.z);
      const pv = m.P.vehicle!; pv.place(s.x, s.z, yaw);
      const rivals: { v: Vehicle; cp: number }[] = cars.map((c, i) => { const rx = Math.cos(yaw) * (i - 1) * 4.5, rz = -Math.sin(yaw) * (i - 1) * 4.5; const v = m.car(c, s.x + rx - Math.sin(yaw) * 7, s.z + rz - Math.cos(yaw) * 7, yaw, rng.pick([0xf0c010, 0x2050c0, 0x7ac020, 0xc0141c])); g.vehicles.seat(v, m.actor(v.x, v.z, 'gang', 'Racer', 'story'), 0); return { v, cp: 0 }; });
      g.cam.snapBehind(yaw); m.noWanted = true;
      for (const n of [3, 2, 1]) { g.hud.bigMessage(String(n), '', '#fff', 0.8); g.audio.click(); pv.vx = pv.vz = 0; await m.wait(1); }
      g.hud.bigMessage('GO!', '', '#4dff7a', 0.8);
      for (const r of rivals) r.v.ai = { script: (v: Vehicle, dt: number) => { const t = cps[Math.min(r.cp, cps.length - 1)]; if (r.cp >= cps.length) { v.step(dt, { throttle: 0, steer: 0, handbrake: true }); return; } g.vehicles.aiSteer(v, t.x, t.z, 34 + rng.next() * 2, dt, true); if (Math.hypot(t.x - v.x, t.z - v.z) < 16) r.cp++; } };
      let cp = 0;
      m.failIf(() => rivals.some((r) => r.cp >= cps.length) && cp < cps.length, 'A rival won the race');
      await m.until(() => {
        const t = cps[cp]; m.blips = [{ x: t.x, z: t.z, color: '#ffd34d', radius: 14 }, ...(cps[cp + 1] ? [{ x: cps[cp + 1].x, z: cps[cp + 1].z, color: '#806a26' }] : [])];
        g.hud.setRoute(t.x, t.z);
        const pos = 1 + rivals.filter((r) => r.cp > cp || (r.cp === cp && Math.hypot(cps[cp].x - r.v.x, cps[cp].z - r.v.z) < Math.hypot(t.x - (m.P.vehicle?.x ?? m.P.x), t.z - (m.P.vehicle?.z ?? m.P.z)))).length;
        m.obj(`Checkpoint ${cp + 1}/${cps.length} · Position ${pos}/4`);
        const px = m.P.vehicle?.x ?? m.P.x, pz = m.P.vehicle?.z ?? m.P.z;
        if (Math.hypot(t.x - px, t.z - pz) < 16) { cp++; g.audio.click(); }
        return cp >= cps.length;
      });
      m.noWanted = false;
    } });
  const OD = 1408;
  race('s_race_ocean', 'Ocean Drive Sprint', [{ x: OD, z: -700 }, { x: OD, z: -1300 }, { x: 1152, z: -1408 }, { x: 896, z: -1100 }, { x: 896, z: -400 }, { x: 1152, z: -256 }, { x: OD, z: 200 }], 2500, () => ({ x: OD, z: 0 }), ['vento', 'furia', 'ramrod']);
  race('s_race_bayou', 'Bayou Rally', [{ x: -1280, z: 600 }, { x: -1280, z: 1024 }, { x: -1792, z: 1024 }, { x: -1792, z: 1500 }, { x: -1792, z: 1100 }, { x: -1000, z: 1024 }], 3200, () => ({ x: -1280, z: -100 }), ['gator', 'everglade', 'gator']);
  L.push({ id: 's_bounty', title: 'Bounty: El Cuchillo', chapter: 'Side Job', giver: 'beto', blurb: 'A Kane enforcer is hiding out in Port Lázaro. Beto pays for proof.', requires: ['m3'], reward: 3500, side: true, repeatable: true,
    start: () => out(poiById('bar_town'), 3),
    async run(m) {
      const spot = { x: 650 + rng.range(-120, 300), z: 1150 + rng.range(-150, 150) };
      await m.goto(spot.x, spot.z, 'Find El Cuchillo in Port Lázaro', { radius: 40 });
      const boss = m.enemy(spot.x, spot.z, 'shotgun', 'El Cuchillo', 220); const guards = [0, 1, 2].map((i) => m.enemy(spot.x + 6 * Math.cos(i * 2), spot.z + 6 * Math.sin(i * 2), i ? 'smg' : 'rifle'));
      void guards; m.obj('Take out El Cuchillo'); m.noWanted = false;
      await m.until(() => { m.blips = [{ x: boss.x, z: boss.z, color: '#ff4d4d' }]; return boss.dead; });
      await m.loseCops();
    } });
  L.push({ id: 's_photo', title: 'Pulse Trending: Sunline Sunset', chapter: 'Side Job', giver: 'pulse', blurb: 'Snap a photo of the sunset at Sunline Beach (17:00–20:00) for your followers.', requires: ['m1'], reward: 300, side: true, repeatable: true,
    start: () => ({ x: coastX(-200) - 60, z: -200 }),
    async run(m) {
      const g = m.g; const spot = { x: coastX(-200) - 30, z: -200 };
      await m.goto(spot.x, spot.z, 'Walk down to the water at Sunline Beach', { radius: 14, foot: true });
      m.obj('Open Camera and take a photo (between 17:00 and 20:00)');
      let ok = false; const off = g.phone.onPhoto(() => { if (g.env.hour >= 17 && g.env.hour <= 20) ok = true; else g.hud.toast('Wait for sunset (17:00–20:00)'); });
      try { await m.until(() => ok); } finally { off(); }
      g.phone.pulsePost('sunset'); g.phone.toggle(false);
    } });
  return L;
}
export const vec = THREE.Vector3;
