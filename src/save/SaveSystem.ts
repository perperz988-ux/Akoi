import type { Game } from '../core/Game';

export interface SlotInfo { slot: number; used: boolean; time: number; money: number; chapter: string; playTime: number; day: number; name: string }
const KEY = (s: number) => `portsolano.save.${s}`;
const SETTINGS_KEY = 'portsolano.settings';

/**
 * Persistent storage: Capacitor Filesystem (app-private storage on Android) with
 * localStorage as mirror / web fallback. Multiple slots + autosave.
 */
export class SaveSystem {
  currentSlot = 1;
  autosaveT = 0;
  private cap: any = null;
  ready: Promise<void>;
  lastSaveAt = 0;

  constructor(private g: Game) {
    this.ready = this.initCap();
  }
  private async initCap() {
    try {
      const w: any = window;
      if (w.Capacitor?.isNativePlatform?.()) {
        const fs = await import('@capacitor/filesystem');
        this.cap = fs;
      }
    } catch { this.cap = null; }
  }

  private async writeRaw(name: string, data: string) {
    try { localStorage.setItem(name, data); } catch { /* quota */ }
    if (this.cap) { try { await this.cap.Filesystem.writeFile({ path: name + '.json', data, directory: this.cap.Directory.Data, encoding: this.cap.Encoding.UTF8, recursive: true }); } catch (e) { console.warn('save fs failed', e); } }
  }
  private async readRaw(name: string): Promise<string | null> {
    if (this.cap) { try { const r = await this.cap.Filesystem.readFile({ path: name + '.json', directory: this.cap.Directory.Data, encoding: this.cap.Encoding.UTF8 }); if (r?.data) return String(r.data); } catch { /* fall through */ } }
    try { return localStorage.getItem(name); } catch { return null; }
  }
  private async delRaw(name: string) { try { localStorage.removeItem(name); } catch { /* */ } if (this.cap) { try { await this.cap.Filesystem.deleteFile({ path: name + '.json', directory: this.cap.Directory.Data }); } catch { /* */ } } }

  snapshot() {
    const g = this.g;
    const p = g.player;
    return {
      v: 2, time: Date.now(),
      player: p.toSave(),
      economy: g.economy.toSave(),
      missions: g.missions.toSave(),
      world: {
        freeRoam: g.freeRoam, hour: g.env.hour, day: g.env.day, weather: g.env.weather, wanted: g.police.wantedLevel, heat: g.police.heat,
        vehicles: g.vehicles.owned.map((o) => { const live = g.vehicles.list.find((v) => v.ownerId === o.uid); if (live) { o.x = live.x; o.z = live.z; o.yaw = live.yaw; o.health = live.health; o.mods = { ...live.mods }; o.color = live.color; o.premium = live.premium; } return { ...o }; }),
        currentVehicle: p.vehicle?.ownerId ?? null,
        waypoint: g.markers.waypoint,
        discovered: [...g.markers.discovered],
      },
      settings: g.settings.toJSON(),
    };
  }

  async save(slot = this.currentSlot) {
    await this.ready;
    this.currentSlot = slot;
    const snap = this.snapshot();
    await this.writeRaw(KEY(slot), JSON.stringify(snap));
    const info: SlotInfo = { slot, used: true, time: snap.time, money: snap.economy.money, chapter: this.g.freeRoam ? 'Free Roam' : this.g.missions.chapterName(), playTime: snap.player.stats.timePlayed, day: snap.world.day, name: 'Kit Calder' };
    await this.writeRaw(KEY(slot) + '.meta', JSON.stringify(info));
    this.lastSaveAt = this.g.time;
    return true;
  }

  async listSlots(): Promise<SlotInfo[]> {
    await this.ready;
    const out: SlotInfo[] = [];
    for (let s = 1; s <= 3; s++) {
      const raw = await this.readRaw(KEY(s) + '.meta');
      if (raw) { try { out.push(JSON.parse(raw)); continue; } catch { /* */ } }
      out.push({ slot: s, used: false, time: 0, money: 0, chapter: '', playTime: 0, day: 1, name: '' });
    }
    return out;
  }
  async hasAny() { return (await this.listSlots()).some((s) => s.used); }

  async load(slot: number) {
    await this.ready;
    const raw = await this.readRaw(KEY(slot));
    if (!raw) return false;
    try { const d = JSON.parse(raw); this.currentSlot = slot; this.g.applySave(d); return true; } catch (e) { console.error('load failed', e); return false; }
  }
  async remove(slot: number) { await this.delRaw(KEY(slot)); await this.delRaw(KEY(slot) + '.meta'); }

  saveSettings(json: any) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(json)); } catch { /* */ } this.writeRaw(SETTINGS_KEY, JSON.stringify(json)); }
  loadSettings(): any { try { const r = localStorage.getItem(SETTINGS_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
  async loadSettingsAsync(): Promise<any> { await this.ready; const raw = await this.readRaw(SETTINGS_KEY); try { return raw ? JSON.parse(raw) : null; } catch { return null; } }

  update(dt: number) {
    this.autosaveT += dt;
    if (this.autosaveT > 150 && this.g.state === 'playing' && this.g.player.mode === 'foot' || this.autosaveT > 150 && this.g.player.inVehicle && this.g.police.wantedLevel === 0) {
      this.autosaveT = 0;
      if (this.g.police.wantedLevel === 0 && !this.g.missions.active) this.save(this.currentSlot).then(() => this.g.hud?.toast('Autosaved', 1.2));
    }
  }
}
