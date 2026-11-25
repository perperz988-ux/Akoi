// Inventory storage and the crafting system.
import { B, BX, COLOR_BLOCKS, DYES, STRIPPED } from '../world/Blocks';
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
  planks: [B.ASH_PLANKS, B.PINE_PLANKS, BX.silver_planks, BX.palm_planks, BX.charred_planks],
  logs: [B.ASH_LOG, B.PINE_LOG, B.PALM_LOG, B.SILVER_LOG, B.CHARRED_LOG, ...Object.values(STRIPPED)],
  leaves: [B.ASH_LEAVES, B.PINE_LEAVES, B.PALM_LEAVES],
  fuel: [I.coal, B.ASH_LOG, B.PINE_LOG, B.PALM_LOG, B.SILVER_LOG, B.CHARRED_LOG, ...Object.values(STRIPPED), B.ASH_PLANKS, B.PINE_PLANKS, BX.silver_planks, BX.palm_planks, BX.charred_planks, I.stick, BX.coal_block],
  dyes: DYES.map((d) => I[`dye_${d.key}`]),
  stoneish: [B.RUBBLE, B.STONE],
};
export const TAG_NAMES: Record<string, string> = { dyes: 'Any Dye', planks: 'Any Boards', logs: 'Any Log', leaves: 'Any Leaves', fuel: 'Fuel (coal/wood)', stoneish: 'Rubble or Stone' };

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
// ---- expansion ----
rc('kiln', 'Cooking', I.cooked_fish, 2, [I.raw_fish, 2], ['fuel', 1]);
rc('kiln', 'Smelting', I.emberite_ingot, 1, [B.EMBERITE_ORE, 1], ['fuel', 1]);
rc('bench', 'Food', I.berry_pie, 1, [I.grain_item, 2], [I.berries, 4]);
rc('hand', 'Basics', B.LADDER, 3, [I.stick, 7]);
rc('hand', 'Decor', B.RUG_RED, 3, [B.CLOTH_RED, 2]);
rc('hand', 'Decor', B.RUG_BLUE, 3, [B.CLOTH_BLUE, 2]);
rc('hand', 'Building', B.MOSSY_RUBBLE, 2, [B.RUBBLE, 2], [B.MOSS, 1]);
rc('bench', 'Furniture', B.BED, 1, [B.CLOTH_WHITE, 3], ['planks', 3]);
rc('bench', 'Furniture', B.LANTERN, 1, [I.iron_ingot, 2], [B.TORCH, 1]);
rc('bench', 'Furniture', B.BOOKSHELF, 1, ['planks', 6], [B.CLOTH_WHITE, 2]);
rc('bench', 'Furniture', B.FENCE, 3, [I.stick, 4], ['planks', 2]);
rc('bench', 'Building', B.STONE_SLAB, 6, [B.STONE_BRICKS, 3]);
rc('bench', 'Building', B.PLANK_SLAB, 6, ['planks', 3]);
rc('bench', 'Building', B.STONE_STAIRS, 4, [B.STONE_BRICKS, 6]);
rc('bench', 'Building', B.PLANK_STAIRS, 4, ['planks', 6]);
rc('bench', 'Building', B.CRYSTAL_BLOCK, 1, [I.prism_shard, 4]);
rc('bench', 'Weapons', I.bow, 1, [I.stick, 3], [I.fiber, 3]);
rc('hand', 'Weapons', I.arrow, 4, [I.stick, 1], [I.fiber, 1], [B.RUBBLE, 1]);
rc('bench', 'Tools', I.fishing_line, 1, [I.stick, 3], [I.fiber, 2]);
rc('bench', 'Explosives', B.BLAST_KEG, 1, [B.SAND, 4], [I.coal, 4]);
for (const [blk, it] of [[B.FROSTQUARTZ_BLOCK, I.frostquartz], [B.RUBELLITE_BLOCK, I.rubellite], [B.EMBERITE_BLOCK, I.emberite_ingot], [B.STARSTONE_BLOCK, I.starstone]]) {
  rc('bench', 'Building', blk, 1, [it, 9]);
  rc('hand', 'Materials', it, 9, [blk, 1]);
}
for (const [tier, mat] of [['copper', I.copper_ingot], ['iron', I.iron_ingot], ['azure', I.azurite], ['ember', I.emberite_ingot]] as [string, number][]) {
  rc('bench', 'Armor', I[`${tier}_helm`], 1, [mat, 5]);
  rc('bench', 'Armor', I[`${tier}_vest`], 1, [mat, 8]);
  rc('bench', 'Armor', I[`${tier}_greaves`], 1, [mat, 7]);
  rc('bench', 'Armor', I[`${tier}_boots`], 1, [mat, 4]);
}
rc('bench', 'Tools', I.ember_pick, 1, [I.emberite_ingot, 3], [I.stick, 2], [I.starstone, 1]);
rc('bench', 'Tools', I.ember_axe, 1, [I.emberite_ingot, 3], [I.stick, 2], [I.starstone, 1]);
rc('bench', 'Tools', I.ember_spade, 1, [I.emberite_ingot, 1], [I.stick, 2], [I.starstone, 1]);
rc('bench', 'Weapons', I.ember_blade, 1, [I.emberite_ingot, 2], [I.stick, 1], [I.starstone, 1], [I.gloom_essence, 2]);
rc('bench', 'Dimensions', B.SKY_RIFT, 1, [I.frostquartz, 4], [I.glow_dust, 2], [I.prism_shard, 2]);
rc('bench', 'Dimensions', B.ASH_RIFT, 1, [I.rubellite, 2], [B.SLATE, 4], [I.coal, 2]);

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

// ---- expansion 2: dyes, colour families, stone variants and decor ----
const dye = (k: string) => I[`dye_${k}`];
const C = COLOR_BLOCKS;
// dyes from plants and materials
for (const [k, src, n] of [['snow', I.bone, 3], ['snow', BX.cupflower_snow, 1], ['ember', I.berries, 1], ['ember', BX.crimson_bloom, 2], ['sun', B.SUNPETAL, 2],
  ['tide', B.BLUEBELL, 2], ['moss', B.CACTUS, 2], ['night', I.coal, 2], ['amber', BX.cupflower_amber, 2], ['orchid', BX.orchid_puff, 2], ['blossom', BX.cupflower_blossom, 2],
  ['mist', BX.starburst_daisy, 2], ['bark', BX.capshroom_brown, 2], ['sprout', B.TALL_GRASS, 1]] as [string, number, number][]) rc('hand', 'Dyes', dye(k), n, [src, 1]);
rc('hand', 'Dyes', dye('moss'), 1, ['leaves', 2]);
// mixed dyes
for (const [k, a, b] of [['amber', 'ember', 'sun'], ['orchid', 'dusk', 'blossom'], ['sky', 'tide', 'snow'], ['sprout', 'moss', 'snow'], ['blossom', 'ember', 'snow'],
  ['ash', 'night', 'snow'], ['mist', 'ash', 'snow'], ['lagoon', 'tide', 'moss'], ['dusk', 'tide', 'ember']]) rc('hand', 'Dyes', dye(k), 2, [dye(a), 1], [dye(b), 1]);
for (const d of DYES) {
  rc('hand', 'Colours', C.cloth[d.key], 1, [B.CLOTH_WHITE, 1], [dye(d.key), 1]);
  if (d.key !== 'ember' && d.key !== 'tide') rc('hand', 'Colours', C.rug[d.key], 3, [C.cloth[d.key], 2]);
  rc('bench', 'Colours', C.smooth[d.key], 8, [B.SAND, 4], [B.GRAVEL, 4], [dye(d.key), 1]);
  rc('kiln', 'Colours', C.fclay[d.key], 4, [B.CLAY, 4], [dye(d.key), 1], ['fuel', 1]);
  rc('bench', 'Colours', C.tglass[d.key], 8, [B.GLASS, 8], [dye(d.key), 1]);
}
// stone variants
for (const k of ['rosestone', 'chalkstone', 'fieldstone']) rc('bench', 'Stone', BX[`${k}_polished`], 4, [BX[k], 4]);
rc('bench', 'Stone', BX.duskstone, 4, [B.RUBBLE, 4], [I.coal, 1]);
rc('bench', 'Stone', BX.duskstone_polished, 4, [BX.duskstone, 4]);
rc('bench', 'Stone', BX.duskstone_bricks, 4, [BX.duskstone_polished, 4]);
rc('bench', 'Stone', BX.slate_polished, 4, [B.SLATE, 4]);
rc('bench', 'Stone', BX.slate_bricks, 4, [BX.slate_polished, 4]);
rc('bench', 'Stone', BX.slate_tiles, 4, [BX.slate_bricks, 4]);
rc('kiln', 'Stone', BX.smooth_stone, 1, [B.STONE, 1], ['fuel', 1]);
rc('kiln', 'Stone', BX.cracked_hewn, 1, [B.STONE_BRICKS, 1], ['fuel', 1]);
rc('hand', 'Stone', BX.mossy_hewn, 1, [B.STONE_BRICKS, 1], [B.MOSS, 1]);
rc('bench', 'Stone', BX.carved_hewn, 1, [B.STONE_SLAB, 2]);
rc('kiln', 'Stone', BX.obsidite, 1, [B.BASALT, 2], ['fuel', 2]);
rc('kiln', 'Stone', BX.smooth_sandstone, 1, [B.SANDSTONE, 1], ['fuel', 1]);
rc('bench', 'Stone', BX.cut_sandstone, 4, [B.SANDSTONE, 4]);
rc('bench', 'Stone', BX.rust_sand, 8, [B.SAND, 8], [dye('ember'), 1]);
rc('bench', 'Stone', BX.rust_sandstone, 1, [BX.rust_sand, 4]);
rc('bench', 'Stone', BX.packed_ice, 1, [B.ICE, 9]);
rc('bench', 'Stone', BX.glacier_ice, 1, [BX.packed_ice, 9]);
rc('hand', 'Stone', BX.forest_litter, 2, [B.DIRT, 2], ['leaves', 1]);
rc('hand', 'Stone', BX.fungal_turf, 2, [B.DIRT, 2], [BX.capshroom_red, 1]);
rc('hand', 'Stone', BX.stony_soil, 4, [B.DIRT, 2], [B.GRAVEL, 2]);
rc('hand', 'Stone', BX.packed_mud, 1, [B.MUD, 1], [I.grain_item, 1]);
rc('bench', 'Stone', BX.mud_bricks, 4, [BX.packed_mud, 4]);
rc('bench', 'Stone', BX.tidestone, 4, [B.STONE, 4], [dye('lagoon'), 1]);
rc('bench', 'Stone', BX.tidestone_bricks, 4, [BX.tidestone, 4]);
rc('bench', 'Stone', BX.dark_tidestone, 8, [BX.tidestone, 8], [dye('night'), 1]);
rc('kiln', 'Stone', BX.cinder_bricks, 1, [B.ASH_SOIL, 2], ['fuel', 1]);
rc('hand', 'Stone', BX.red_cinder_bricks, 2, [BX.cinder_bricks, 2], [I.berries, 2]);
rc('bench', 'Stone', BX.pale_quartz, 1, [I.frostquartz, 4]);
rc('bench', 'Stone', BX.quartz_bricks, 4, [BX.pale_quartz, 4]);
rc('bench', 'Stone', BX.quartz_pillar, 2, [BX.pale_quartz, 2]);
rc('bench', 'Stone', BX.violet_tiles, 4, [B.SKYSTONE, 4], [dye('dusk'), 1]);
rc('bench', 'Stone', BX.violet_pillar, 2, [BX.violet_tiles, 2]);
rc('bench', 'Stone', BX.skystone_bricks, 4, [B.SKYSTONE, 4]);
// decor & storage blocks
rc('bench', 'Decor', BX.tide_lamp, 1, [BX.tidestone, 4], [I.glow_dust, 4]);
rc('bench', 'Decor', BX.glowpod, 1, [I.glow_dust, 4], [B.GLOWCAP, 1]);
rc('hand', 'Decor', BX.gourd_lantern, 1, [BX.gourd, 1], [B.TORCH, 1]);
rc('bench', 'Decor', BX.sponge, 1, [I.fiber, 6], [dye('sun'), 1]);
rc('bench', 'Decor', BX.gel_block, 1, [I.gloom_essence, 4], [dye('sprout'), 1]);
rc('bench', 'Decor', BX.amber_gel, 1, [I.berries, 6], [dye('amber'), 1]);
rc('bench', 'Decor', BX.honeycomb, 1, [BX.amber_gel, 1], [I.fiber, 4]);
rc('hand', 'Food', I.melon_slice, 4, [BX.melon, 1]);
rc('bench', 'Food', BX.melon, 1, [I.melon_slice, 9]);
for (const [blk, it] of [[BX.bone_block, I.bone], [BX.grain_bale, I.grain_item], [BX.coal_block, I.coal], [BX.raw_iron_block, B.IRON_ORE], [BX.raw_copper_block, B.COPPER_ORE], [BX.raw_sunstone_block, B.SUNSTONE_ORE]]) {
  rc('bench', 'Storage', blk, 1, [it, 9]);
  rc('hand', 'Storage', it, 9, [blk, 1]);
}
rc('bench', 'Metal', BX.cut_copper, 4, [B.COPPER_BLOCK, 4]);
rc('hand', 'Metal', BX.weathered_copper, 1, [B.COPPER_BLOCK, 1], [B.MOSS, 1]);
rc('hand', 'Metal', BX.verdigris_copper, 1, [BX.weathered_copper, 1], [B.MOSS, 1]);
rc('hand', 'Basics', BX.silver_planks, 4, [B.SILVER_LOG, 1]);
rc('hand', 'Basics', BX.palm_planks, 4, [B.PALM_LOG, 1]);
rc('hand', 'Basics', BX.charred_planks, 4, [B.CHARRED_LOG, 1]);
rc('hand', 'Basics', B.ASH_PLANKS, 4, [STRIPPED[B.ASH_LOG], 1]);
rc('hand', 'Basics', B.PINE_PLANKS, 4, [STRIPPED[B.PINE_LOG], 1]);
rc('hand', 'Basics', BX.palm_planks, 4, [STRIPPED[B.PALM_LOG], 1]);
rc('hand', 'Basics', BX.charred_planks, 4, [STRIPPED[B.CHARRED_LOG], 1]);
rc('hand', 'Basics', BX.silver_planks, 4, [STRIPPED[B.SILVER_LOG], 1]);

// ---- Dreamhollow ----
rc('bench', 'Dimensions', BX.dream_rift, 1, [I.starstone, 2], [I.emberite_ingot, 2], [I.prism_shard, 4]);
rc('kiln', 'Smelting', I.lumenite, 1, [BX.lumenite_ore, 1], ['fuel', 1]);
rc('hand', 'Materials', I.glow_dust, 4, [I.lumenite, 1]);
rc('bench', 'Decor', BX.tide_lamp, 2, [I.lumenite, 1], [BX.tidestone, 4]);
rc('hand', 'Basics', BX.silver_planks, 2, [BX.bloomcap_stem, 1]);
rc('hand', 'Dyes', dye('orchid'), 2, [BX.bloomcap_cap, 1]);
