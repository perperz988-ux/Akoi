// Inventory storage and the crafting system.
import { B } from '../world/Blocks';
import type { Stack } from '../world/World';
import { I, ITEMS, item, maxStack } from './Items';

export class Inventory {
  slots: (Stack | null)[];
  selected = 0;
  constructor(size = 36) { this.slots = new Array(size).fill(null); }

  get held(): Stack | null { return this.slots[this.selected]; }

  /** Adds items, returns the count that did not fit. */
  add(id: number, count: number, dur?: number): number {
    const ms = maxStack(id);
    if (ms > 1) for (let i = 0; i < this.slots.length && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < ms) { const n = Math.min(count, ms - s.count); s.count += n; count -= n; }
    }
    for (let i = 0; i < this.slots.length && count > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(count, ms);
        this.slots[i] = { id, count: n, ...(dur !== undefined ? { dur } : item(id).tool ? { dur: item(id).tool!.durability } : {}) };
        count -= n;
      }
    }
    return count;
  }
  addStack(s: Stack): number { return this.add(s.id, s.count, s.dur); }

  count(id: number): number { let n = 0; for (const s of this.slots) if (s && s.id === id) n += s.count; return n; }

  remove(id: number, count: number): boolean {
    if (this.count(id) < count) return false;
    for (let i = this.slots.length - 1; i >= 0 && count > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) { const n = Math.min(count, s.count); s.count -= n; count -= n; if (s.count <= 0) this.slots[i] = null; }
    }
    return true;
  }

  consumeHeld(n = 1) {
    const s = this.held;
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[this.selected] = null;
  }

  clear() { this.slots.fill(null); }

  serialize() { return { slots: this.slots.map((s) => (s ? { ...s } : null)), selected: this.selected }; }
  load(d: any) {
    if (!d) return;
    this.slots = new Array(this.slots.length).fill(null);
    (d.slots || []).forEach((s: Stack | null, i: number) => { if (s && ITEMS[s.id] && i < this.slots.length) this.slots[i] = { ...s }; });
    this.selected = Math.max(0, Math.min(8, d.selected | 0));
  }
}

// ------------------------------------------------------------------------------------------
// Crafting
// ------------------------------------------------------------------------------------------
export type Station = 'hand' | 'bench' | 'kiln';
type Ing = [string | number, number];
export interface Recipe { id: number; station: Station; inputs: Ing[]; out: number; count: number; group: string }

export const TAGS: Record<string, number[]> = {
  planks: [B.ASH_PLANKS, B.PINE_PLANKS],
  logs: [B.ASH_LOG, B.PINE_LOG, B.PALM_LOG],
  leaves: [B.ASH_LEAVES, B.PINE_LEAVES, B.PALM_LEAVES],
  fuel: [I.coal, B.ASH_LOG, B.PINE_LOG, B.PALM_LOG, B.ASH_PLANKS, B.PINE_PLANKS, I.stick],
  stoneish: [B.RUBBLE, B.STONE],
};
export const TAG_NAMES: Record<string, string> = { planks: 'Any Boards', logs: 'Any Log', leaves: 'Any Leaves', fuel: 'Fuel (coal/wood)', stoneish: 'Rubble or Stone' };

export const RECIPES: Recipe[] = [];
let rid = 0;
function rc(station: Station, group: string, out: number, count: number, ...inputs: Ing[]) { RECIPES.push({ id: rid++, station, inputs, out, count, group }); }

// hand
rc('hand', 'Basics', B.ASH_PLANKS, 4, [B.ASH_LOG, 1]);
rc('hand', 'Basics', B.PINE_PLANKS, 4, [B.PINE_LOG, 1]);
rc('hand', 'Basics', B.ASH_PLANKS, 3, [B.PALM_LOG, 1]);
rc('hand', 'Basics', I.stick, 4, ['planks', 2]);
rc('hand', 'Basics', B.WORKBENCH, 1, ['planks', 4]);
rc('hand', 'Basics', B.TORCH, 4, [I.coal, 1], [I.stick, 1]);
rc('hand', 'Basics', B.TORCH, 2, [B.GLOWCAP, 1], [I.stick, 1]);
rc('hand', 'Decor', B.CLOTH_WHITE, 1, [I.fiber, 4]);
rc('hand', 'Decor', B.CLOTH_WHITE, 1, [I.fur, 2]);
rc('hand', 'Decor', B.CLOTH_RED, 1, [B.CLOTH_WHITE, 1], [I.berries, 1]);
rc('hand', 'Decor', B.CLOTH_YELLOW, 1, [B.CLOTH_WHITE, 1], [B.SUNPETAL, 1]);
rc('hand', 'Decor', B.CLOTH_BLUE, 1, [B.CLOTH_WHITE, 1], [B.BLUEBELL, 1]);
rc('hand', 'Decor', B.CLOTH_GREEN, 1, [B.CLOTH_WHITE, 1], ['leaves', 1]);
rc('hand', 'Decor', B.CLOTH_BLACK, 1, [B.CLOTH_WHITE, 1], [I.coal, 1]);
rc('hand', 'Materials', I.copper_ingot, 9, [B.COPPER_BLOCK, 1]);
rc('hand', 'Materials', I.iron_ingot, 9, [B.IRON_BLOCK, 1]);
rc('hand', 'Materials', I.sunstone_ingot, 9, [B.SUNSTONE_BLOCK, 1]);
rc('hand', 'Materials', I.azurite, 9, [B.AZURITE_BLOCK, 1]);
rc('hand', 'Materials', I.glow_dust, 2, [I.glowshard, 1]);
rc('hand', 'Food', I.glowcap_stew, 1, [B.GLOWCAP, 2], [I.bucket, 1]);
// bench
for (const [tier, mat] of [['wood', 'planks'], ['stone', 'stoneish'], ['copper', I.copper_ingot], ['iron', I.iron_ingot], ['azure', I.azurite]] as [string, string | number][]) {
  const extra: Ing[] = tier === 'azure' ? [[I.sunstone_ingot, 1]] : [];
  rc('bench', 'Tools', I[`${tier}_pick`], 1, [mat, 3], [I.stick, 2], ...extra);
  rc('bench', 'Tools', I[`${tier}_axe`], 1, [mat, 3], [I.stick, 2], ...extra);
  rc('bench', 'Tools', I[`${tier}_spade`], 1, [mat, 1], [I.stick, 2], ...extra);
  rc('bench', 'Weapons', I[`${tier}_blade`], 1, [mat, 2], [I.stick, 1], ...(tier === 'azure' ? [[I.gloom_essence, 2] as Ing, ...extra] : []));
}
rc('bench', 'Tools', I.wood_tiller, 1, ['planks', 2], [I.stick, 2]);
rc('bench', 'Tools', I.stone_tiller, 1, ['stoneish', 2], [I.stick, 2]);
rc('bench', 'Furniture', B.CRATE, 1, ['planks', 8]);
rc('bench', 'Furniture', I.door, 1, ['planks', 6]);
rc('bench', 'Furniture', B.KILN, 1, [B.RUBBLE, 8]);
rc('bench', 'Furniture', B.LUMEN_LAMP, 1, [B.GLASS, 1], [I.glow_dust, 4]);
rc('bench', 'Building', B.STONE_BRICKS, 4, [B.STONE, 4]);
rc('bench', 'Building', B.STONE_PILLAR, 2, [B.STONE_BRICKS, 2]);
rc('bench', 'Building', B.TILE_FLOOR, 4, [B.STONE_BRICKS, 2], [B.SANDSTONE, 2]);
rc('bench', 'Building', B.SANDSTONE, 1, [B.SAND, 4]);
rc('bench', 'Building', B.MOSSY_RUBBLE, 2, [B.RUBBLE, 2], [I.fiber, 1]);
rc('bench', 'Building', B.COPPER_BLOCK, 1, [I.copper_ingot, 9]);
rc('bench', 'Building', B.IRON_BLOCK, 1, [I.iron_ingot, 9]);
rc('bench', 'Building', B.SUNSTONE_BLOCK, 1, [I.sunstone_ingot, 9]);
rc('bench', 'Building', B.AZURITE_BLOCK, 1, [I.azurite, 9]);
rc('bench', 'Food', I.bread, 1, [I.grain_item, 3]);
// kiln (all need fuel)
rc('kiln', 'Smelting', I.copper_ingot, 1, [B.COPPER_ORE, 1], ['fuel', 1]);
rc('kiln', 'Smelting', I.iron_ingot, 1, [B.IRON_ORE, 1], ['fuel', 1]);
rc('kiln', 'Smelting', I.sunstone_ingot, 1, [B.SUNSTONE_ORE, 1], ['fuel', 1]);
rc('kiln', 'Smelting', B.GLASS, 2, [B.SAND, 2], ['fuel', 1]);
rc('kiln', 'Smelting', B.STONE, 2, [B.RUBBLE, 2], ['fuel', 1]);
rc('kiln', 'Smelting', B.CLAY_BRICKS, 4, [B.CLAY, 4], ['fuel', 1]);
rc('kiln', 'Smelting', I.bucket, 1, [B.CLAY, 3], ['fuel', 1]);
rc('kiln', 'Smelting', I.coal, 1, ['logs', 1], ['fuel', 1]);
rc('kiln', 'Cooking', I.cooked_meat, 2, [I.raw_meat, 2], ['fuel', 1]);

export function ingredientIds(ing: string | number): number[] { return typeof ing === 'string' ? TAGS[ing] : [ing]; }
export function ingredientName(ing: string | number): string { return typeof ing === 'string' ? TAG_NAMES[ing] : item(ing).name; }

function countIng(inv: Inventory, ing: string | number) { return ingredientIds(ing).reduce((a, id) => a + inv.count(id), 0); }

export function canCraft(inv: Inventory, r: Recipe, creative: boolean): boolean {
  if (creative) return true;
  return r.inputs.every(([ing, n]) => countIng(inv, ing) >= n);
}

/** Crafts once. Returns the number of output items that did not fit (-1 when the recipe could not be crafted). */
export function craft(inv: Inventory, r: Recipe, creative: boolean): number {
  if (!canCraft(inv, r, creative)) return -1;
  if (!creative) {
    const snapshot = inv.serialize();
    for (const [ing, n] of r.inputs) {
      let need = n;
      for (const id of ingredientIds(ing)) {
        const take = Math.min(inv.count(id), need);
        if (take > 0) { inv.remove(id, take); need -= take; }
        if (need <= 0) break;
      }
      if (need > 0) { inv.load(snapshot); return -1; }
    }
  }
  return inv.add(r.out, r.count);
}

export function recipesFor(stations: Set<Station>): Recipe[] { return RECIPES.filter((r) => stations.has(r.station)); }
