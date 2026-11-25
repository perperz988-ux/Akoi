// Block registry. Shared by the main thread and the generation/meshing workers,
// so this module must not import three.js or touch the DOM.

export const CHUNK = 16;
export const HEIGHT = 128;
export const SECTIONS = HEIGHT / CHUNK;
/** Sentinel id returned for positions inside chunks that are not loaded yet (treated as solid). */
export const UNLOADED = 255;

export const SHAPE_NONE = 0;
export const SHAPE_CUBE = 1;
export const SHAPE_CROSS = 2;
export const SHAPE_LIQUID = 3;
export const SHAPE_BOX = 4;

export const RENDER_OPAQUE = 0;
export const RENDER_CUTOUT = 1;
export const RENDER_WATER = 2;
export const RENDER_NONE = 3;

export type Mat = 'stone' | 'wood' | 'grass' | 'dirt' | 'sand' | 'gravel' | 'glass' | 'snow' | 'cloth' | 'metal' | 'leaves' | 'water' | 'plant';
export type ToolKind = 'pick' | 'axe' | 'spade' | 'none';

// ---- texture tiles (indices into the atlas; painted by gfx/Atlas.ts) ----
const tileNames: string[] = [];
export function tile(name: string): number {
  let i = tileNames.indexOf(name);
  if (i < 0) { i = tileNames.length; tileNames.push(name); }
  return i;
}
export const TILE_NAMES = tileNames;
export const ATLAS_COLS = 32;
export const ATLAS_CELL = 32; // 16px tile + 8px wrapped padding each side (mip-safe)
export const ATLAS_TILE = 16;
export const ATLAS_SIZE = 1024;

export const B = {
  AIR: 0, DEEPSTONE: 1, STONE: 2, DIRT: 3, GRASS: 4, SAND: 5, GRAVEL: 6, CLAY: 7, SANDSTONE: 8, SNOW: 9, ICE: 10,
  WATER: 11, MAGMA: 12, ASH_LOG: 13, ASH_LEAVES: 14, PINE_LOG: 15, PINE_LEAVES: 16, PALM_LOG: 17, PALM_LEAVES: 18,
  ASH_PLANKS: 19, PINE_PLANKS: 20, RUBBLE: 21, STONE_BRICKS: 22, CLAY_BRICKS: 23, GLASS: 24, COAL_ORE: 25,
  COPPER_ORE: 26, IRON_ORE: 27, SUNSTONE_ORE: 28, AZURITE_ORE: 29, GLOWSHARD_ORE: 30, TALL_GRASS: 31, SUNPETAL: 32,
  BLUEBELL: 33, BERRY_BUSH: 34, CACTUS: 35, DRY_SHRUB: 36, GLOWCAP: 37, TORCH: 38, WORKBENCH: 39, KILN: 40,
  CRATE: 41, DOOR_LOWER: 42, DOOR_UPPER: 43, FARMLAND: 44, GRAIN: 45, LUMEN_LAMP: 46, CLOTH_WHITE: 47,
  CLOTH_RED: 48, CLOTH_BLUE: 49, CLOTH_GREEN: 50, CLOTH_YELLOW: 51, CLOTH_BLACK: 52, MOSSY_RUBBLE: 53,
  TILE_FLOOR: 54, COPPER_BLOCK: 55, IRON_BLOCK: 56, SUNSTONE_BLOCK: 57, AZURITE_BLOCK: 58, SLATE: 59,
  FROST_GRASS: 60, STONE_PILLAR: 61, ASH_SAPLING: 62, PINE_SAPLING: 63,
  MOSS: 64, GLOW_VINE: 65, CRYSTAL_BLOCK: 66, CRYSTAL_SHARD: 67, FROSTQUARTZ_ORE: 68, RUBELLITE_ORE: 69, BASALT: 70,
  ASH_SOIL: 71, CHARRED_LOG: 72, EMBER_LEAVES: 73, EMBERITE_ORE: 74, SKY_GRASS: 75, SKYSTONE: 76, CLOUD: 77,
  STARSTONE_ORE: 78, SILVER_LEAVES: 79, SKY_RIFT: 80, ASH_RIFT: 81, LADDER: 82, BED: 83, STONE_SLAB: 84, PLANK_SLAB: 85,
  STONE_STAIRS: 86, PLANK_STAIRS: 87, FENCE: 88, LANTERN: 89, BOOKSHELF: 90, RUG_RED: 91, RUG_BLUE: 92, BLAST_KEG: 93,
  FROSTQUARTZ_BLOCK: 94, RUBELLITE_BLOCK: 95, EMBERITE_BLOCK: 96, STARSTONE_BLOCK: 97, MUD: 98, SILVER_LOG: 99,
} as const;

export interface BlockDef {
  id: number;
  key: string;
  name: string;
  shape: number;
  render: number;
  solid: boolean;      // has collision
  opaque: boolean;     // full cube that hides neighbour faces and blocks light
  filter: number;      // extra light attenuation for non-opaque blocks
  light: number;       // emitted block light 0..15
  hardness: number;    // base seconds; -1 = unbreakable / not targetable
  tool: ToolKind;
  tier: number;        // minimum tool tier for drops (0 = hand)
  mat: Mat;
  tex: number[];       // tile per face: +x,-x,+y,-y,+z,-z
  texMeta?: (meta: number, face: number) => number;
  cullSame?: boolean;  // hide faces between two blocks of this type (glass, leaves on low)
  replaceable?: boolean;
  support?: 'soil' | 'sand' | 'farmland' | 'solid' | 'any' | 'ceiling';
  climb?: boolean;
  soft?: boolean;      // cancels fall damage
  item: boolean;       // obtainable as an inventory item / shown in creative catalog
  catalog: boolean;
  damage?: number;     // contact damage per hit
}

export const BLOCKS: BlockDef[] = [];

function all(t: string) { const i = tile(t); return [i, i, i, i, i, i]; }
function tbs(top: string, bottom: string, side: string) { const t = tile(top), b = tile(bottom), s = tile(side); return [s, s, t, b, s, s]; }
function front(top: string, bottom: string, side: string, fr: string) { const t = tile(top), b = tile(bottom), s = tile(side), f = tile(fr); return [s, s, t, b, f, s]; }

interface Opts extends Partial<BlockDef> { tex: number[] }
function def(id: number, key: string, name: string, o: Opts) {
  const d: BlockDef = {
    id, key, name,
    shape: SHAPE_CUBE, render: RENDER_OPAQUE, solid: true, opaque: true, filter: 0, light: 0,
    hardness: 1, tool: 'none', tier: 0, mat: 'stone', item: true, catalog: true,
    ...o,
  };
  BLOCKS[id] = d;
  return d;
}
const plant = (o: Opts): Opts => ({ shape: SHAPE_CROSS, render: RENDER_CUTOUT, solid: false, opaque: false, hardness: 0, mat: 'plant', replaceable: false, support: 'soil', ...o });

def(0, 'air', 'Air', { tex: all('stone'), shape: SHAPE_NONE, render: RENDER_NONE, solid: false, opaque: false, hardness: -1, item: false, catalog: false, replaceable: true });
def(1, 'deepstone', 'Deepstone', { tex: all('deepstone'), hardness: -1, catalog: true });
def(2, 'stone', 'Stone', { tex: all('stone'), hardness: 1.5, tool: 'pick', tier: 1 });
def(3, 'dirt', 'Soil', { tex: all('dirt'), hardness: 0.5, tool: 'spade', mat: 'dirt' });
def(4, 'grass', 'Meadow Turf', { tex: tbs('grass_top', 'dirt', 'grass_side'), hardness: 0.6, tool: 'spade', mat: 'grass' });
def(5, 'sand', 'Sand', { tex: all('sand'), hardness: 0.5, tool: 'spade', mat: 'sand' });
def(6, 'gravel', 'Gravel', { tex: all('gravel'), hardness: 0.6, tool: 'spade', mat: 'gravel' });
def(7, 'clay', 'Clay', { tex: all('clay'), hardness: 0.6, tool: 'spade', mat: 'dirt' });
def(8, 'sandstone', 'Sandstone', { tex: tbs('sandstone_top', 'sandstone_top', 'sandstone'), hardness: 0.8, tool: 'pick', tier: 1 });
def(9, 'snow', 'Snowpack', { tex: all('snow'), hardness: 0.3, tool: 'spade', mat: 'snow' });
def(10, 'ice', 'Ice', { tex: all('ice'), hardness: 0.5, tool: 'pick', mat: 'glass', opaque: false, render: RENDER_CUTOUT, filter: 1, cullSame: true });
def(11, 'water', 'Water', { tex: all('water'), shape: SHAPE_LIQUID, render: RENDER_WATER, solid: false, opaque: false, filter: 2, hardness: -1, mat: 'water', replaceable: true, item: false, catalog: true });
def(12, 'magma', 'Magma', { tex: all('magma'), shape: SHAPE_LIQUID, render: RENDER_OPAQUE, solid: false, opaque: false, filter: 15, light: 15, hardness: -1, mat: 'water', replaceable: true, item: false, catalog: true, damage: 4 });
def(13, 'ash_log', 'Ashwood Log', { tex: tbs('ash_log_top', 'ash_log_top', 'ash_log'), hardness: 2, tool: 'axe', mat: 'wood' });
def(14, 'ash_leaves', 'Ashwood Leaves', { tex: all('ash_leaves'), hardness: 0.2, mat: 'leaves', render: RENDER_CUTOUT, opaque: false, filter: 1, tool: 'axe' });
def(15, 'pine_log', 'Pine Log', { tex: tbs('pine_log_top', 'pine_log_top', 'pine_log'), hardness: 2, tool: 'axe', mat: 'wood' });
def(16, 'pine_leaves', 'Pine Needles', { tex: all('pine_leaves'), hardness: 0.2, mat: 'leaves', render: RENDER_CUTOUT, opaque: false, filter: 1, tool: 'axe' });
def(17, 'palm_log', 'Palm Trunk', { tex: tbs('palm_log_top', 'palm_log_top', 'palm_log'), hardness: 1.6, tool: 'axe', mat: 'wood' });
def(18, 'palm_leaves', 'Palm Fronds', { tex: all('palm_leaves'), hardness: 0.2, mat: 'leaves', render: RENDER_CUTOUT, opaque: false, filter: 1, tool: 'axe' });
def(19, 'ash_planks', 'Ashwood Boards', { tex: all('ash_planks'), hardness: 2, tool: 'axe', mat: 'wood' });
def(20, 'pine_planks', 'Pine Boards', { tex: all('pine_planks'), hardness: 2, tool: 'axe', mat: 'wood' });
def(21, 'rubble', 'Rubble', { tex: all('rubble'), hardness: 2, tool: 'pick', tier: 1 });
def(22, 'stone_bricks', 'Hewn Stone', { tex: all('stone_bricks'), hardness: 2, tool: 'pick', tier: 1 });
def(23, 'clay_bricks', 'Fired Bricks', { tex: all('clay_bricks'), hardness: 2, tool: 'pick', tier: 1 });
def(24, 'glass', 'Glass', { tex: all('glass'), hardness: 0.3, mat: 'glass', opaque: false, render: RENDER_CUTOUT, cullSame: true });
def(25, 'coal_ore', 'Coal Seam', { tex: all('coal_ore'), hardness: 3, tool: 'pick', tier: 1 });
def(26, 'copper_ore', 'Copper Vein', { tex: all('copper_ore'), hardness: 3, tool: 'pick', tier: 2 });
def(27, 'iron_ore', 'Iron Vein', { tex: all('iron_ore'), hardness: 3, tool: 'pick', tier: 3 });
def(28, 'sunstone_ore', 'Sunstone Vein', { tex: all('sunstone_ore'), hardness: 3, tool: 'pick', tier: 4 });
def(29, 'azurite_ore', 'Azurite Geode', { tex: all('azurite_ore'), hardness: 3.5, tool: 'pick', tier: 4 });
def(30, 'glowshard_ore', 'Glowshard Cluster', { tex: all('glowshard_ore'), hardness: 2.5, tool: 'pick', tier: 2, light: 7 });
def(31, 'tall_grass', 'Wild Grass', plant({ tex: all('tall_grass'), replaceable: true }));
def(32, 'sunpetal', 'Sunpetal', plant({ tex: all('sunpetal') }));
def(33, 'bluebell', 'Duskbell', plant({ tex: all('bluebell') }));
def(34, 'berry_bush', 'Emberberry Bush', plant({ tex: all('berry_bush'), texMeta: (m) => tile(m ? 'berry_bush_ripe' : 'berry_bush'), hardness: 0.3 }));
def(35, 'cactus', 'Spineplant', { tex: tbs('cactus_top', 'cactus_top', 'cactus'), shape: SHAPE_BOX, render: RENDER_CUTOUT, opaque: false, hardness: 0.4, mat: 'plant', support: 'sand', damage: 1 });
def(36, 'dry_shrub', 'Dry Shrub', plant({ tex: all('dry_shrub'), support: 'sand', replaceable: true }));
def(37, 'glowcap', 'Glowcap', plant({ tex: all('glowcap'), light: 10, support: 'solid' }));
def(38, 'torch', 'Torch', { tex: all('torch'), shape: SHAPE_BOX, render: RENDER_CUTOUT, solid: false, opaque: false, light: 14, hardness: 0, mat: 'wood' });
def(39, 'workbench', 'Workbench', { tex: front('workbench_top', 'ash_planks', 'workbench_side', 'workbench_front'), hardness: 2.5, tool: 'axe', mat: 'wood' });
def(40, 'kiln', 'Kiln', { tex: front('kiln_top', 'kiln_top', 'kiln_side', 'kiln_front'), hardness: 3.5, tool: 'pick', tier: 1, light: 0 });
def(41, 'crate', 'Storage Crate', { tex: tbs('crate_top', 'crate_top', 'crate_side'), hardness: 2.5, tool: 'axe', mat: 'wood' });
def(42, 'door_lower', 'Door', { tex: all('door_lower'), shape: SHAPE_BOX, render: RENDER_CUTOUT, opaque: false, hardness: 3, tool: 'axe', mat: 'wood', item: false, catalog: false });
def(43, 'door_upper', 'Door', { tex: all('door_upper'), shape: SHAPE_BOX, render: RENDER_CUTOUT, opaque: false, hardness: 3, tool: 'axe', mat: 'wood', item: false, catalog: false });
def(44, 'farmland', 'Tilled Soil', { tex: tbs('farmland', 'dirt', 'dirt'), shape: SHAPE_BOX, render: RENDER_OPAQUE, opaque: false, hardness: 0.6, tool: 'spade', mat: 'dirt', item: false, catalog: false });
def(45, 'grain', 'Grain Stalks', plant({ tex: all('grain0'), texMeta: (m) => tile('grain' + Math.min(7, m)), support: 'farmland', item: false, catalog: false }));
def(46, 'lumen_lamp', 'Lumen Lamp', { tex: all('lumen_lamp'), hardness: 0.3, mat: 'glass', light: 15 });
def(47, 'cloth_white', 'Woven Cloth (Snow)', { tex: all('cloth_white'), hardness: 0.8, mat: 'cloth' });
def(48, 'cloth_red', 'Woven Cloth (Ember)', { tex: all('cloth_red'), hardness: 0.8, mat: 'cloth' });
def(49, 'cloth_blue', 'Woven Cloth (Tide)', { tex: all('cloth_blue'), hardness: 0.8, mat: 'cloth' });
def(50, 'cloth_green', 'Woven Cloth (Moss)', { tex: all('cloth_green'), hardness: 0.8, mat: 'cloth' });
def(51, 'cloth_yellow', 'Woven Cloth (Sun)', { tex: all('cloth_yellow'), hardness: 0.8, mat: 'cloth' });
def(52, 'cloth_black', 'Woven Cloth (Night)', { tex: all('cloth_black'), hardness: 0.8, mat: 'cloth' });
def(53, 'mossy_rubble', 'Mossy Rubble', { tex: all('mossy_rubble'), hardness: 2, tool: 'pick', tier: 1 });
def(54, 'tile_floor', 'Mosaic Tiles', { tex: all('tile_floor'), hardness: 1.5, tool: 'pick', tier: 1 });
def(55, 'copper_block', 'Copper Plating', { tex: all('copper_block'), hardness: 4, tool: 'pick', tier: 2, mat: 'metal' });
def(56, 'iron_block', 'Iron Plating', { tex: all('iron_block'), hardness: 5, tool: 'pick', tier: 3, mat: 'metal' });
def(57, 'sunstone_block', 'Sunstone Block', { tex: all('sunstone_block'), hardness: 4, tool: 'pick', tier: 3, mat: 'metal', light: 9 });
def(58, 'azurite_block', 'Azurite Block', { tex: all('azurite_block'), hardness: 5, tool: 'pick', tier: 4, mat: 'metal' });
def(59, 'slate', 'Slate', { tex: all('slate'), hardness: 3, tool: 'pick', tier: 1 });
def(60, 'frost_grass', 'Frost Turf', { tex: tbs('frost_top', 'dirt', 'frost_side'), hardness: 0.6, tool: 'spade', mat: 'snow' });
def(61, 'stone_pillar', 'Stone Pillar', { tex: tbs('pillar_top', 'pillar_top', 'pillar_side'), hardness: 2, tool: 'pick', tier: 1 });
def(62, 'ash_sapling', 'Ashwood Sapling', plant({ tex: all('ash_sapling') }));
def(63, 'pine_sapling', 'Pine Sapling', plant({ tex: all('pine_sapling') }));
// ---- caves ----
def(64, 'moss', 'Cave Moss', { tex: tbs('moss', 'dirt', 'moss_side'), hardness: 0.5, tool: 'spade', mat: 'grass' });
def(65, 'glow_vine', 'Glow Vine', plant({ tex: all('glow_vine'), light: 9, support: 'ceiling', hardness: 0 }));
def(66, 'crystal_block', 'Prism Crystal', { tex: all('crystal_block'), hardness: 1.5, tool: 'pick', tier: 1, mat: 'glass', light: 6 });
def(67, 'crystal_shard', 'Prism Shard Cluster', plant({ tex: all('crystal_shard'), light: 8, support: 'solid', hardness: 0.4, mat: 'glass' }));
def(68, 'frostquartz_ore', 'Frostquartz Vein', { tex: all('frostquartz_ore'), hardness: 3, tool: 'pick', tier: 3 });
def(69, 'rubellite_ore', 'Rubellite Vein', { tex: all('rubellite_ore'), hardness: 3.5, tool: 'pick', tier: 4, light: 3 });
def(70, 'basalt', 'Basalt', { tex: tbs('basalt_top', 'basalt_top', 'basalt'), hardness: 2.2, tool: 'pick', tier: 1 });
// ---- Ashen Wastes ----
def(71, 'ash_soil', 'Ash Soil', { tex: all('ash_soil'), hardness: 0.6, tool: 'spade', mat: 'sand' });
def(72, 'charred_log', 'Charred Log', { tex: tbs('charred_log_top', 'charred_log_top', 'charred_log'), hardness: 2, tool: 'axe', mat: 'wood' });
def(73, 'ember_leaves', 'Ember Leaves', { tex: all('ember_leaves'), hardness: 0.2, mat: 'leaves', render: RENDER_CUTOUT, opaque: false, filter: 1, tool: 'axe', light: 6 });
def(74, 'emberite_ore', 'Emberite Vein', { tex: all('emberite_ore'), hardness: 3.5, tool: 'pick', tier: 4, light: 4 });
// ---- Celestia ----
def(75, 'sky_grass', 'Sky Turf', { tex: tbs('sky_grass_top', 'skystone', 'sky_grass_side'), hardness: 0.6, tool: 'spade', mat: 'grass' });
def(76, 'skystone', 'Skystone', { tex: all('skystone'), hardness: 1.5, tool: 'pick', tier: 1 });
def(77, 'cloud', 'Cloud Puff', { tex: all('cloud'), hardness: 0.3, tool: 'spade', mat: 'cloth', soft: true });
def(78, 'starstone_ore', 'Starstone Vein', { tex: all('starstone_ore'), hardness: 3.5, tool: 'pick', tier: 4, light: 5 });
def(79, 'silver_leaves', 'Silverleaf', { tex: all('silver_leaves'), hardness: 0.2, mat: 'leaves', render: RENDER_CUTOUT, opaque: false, filter: 1, tool: 'axe' });
// ---- rifts (dimension gates) ----
def(80, 'sky_rift', 'Sky Rift', { tex: all('sky_rift'), hardness: 4, tool: 'pick', tier: 1, mat: 'glass', light: 12 });
def(81, 'ash_rift', 'Ember Rift', { tex: all('ash_rift'), hardness: 4, tool: 'pick', tier: 1, mat: 'glass', light: 12 });
// ---- building & furniture ----
def(82, 'ladder', 'Ladder', { tex: all('ladder'), shape: SHAPE_BOX, render: RENDER_CUTOUT, solid: false, opaque: false, hardness: 0.6, tool: 'axe', mat: 'wood', climb: true });
def(83, 'bed', 'Bedroll', { tex: tbs('bed_top', 'ash_planks', 'bed_side'), shape: SHAPE_BOX, render: RENDER_OPAQUE, opaque: false, hardness: 0.5, mat: 'cloth', soft: true });
def(84, 'stone_slab', 'Stone Slab', { tex: all('stone_bricks'), shape: SHAPE_BOX, opaque: false, hardness: 2, tool: 'pick', tier: 1 });
def(85, 'plank_slab', 'Board Slab', { tex: all('ash_planks'), shape: SHAPE_BOX, opaque: false, hardness: 2, tool: 'axe', mat: 'wood' });
def(86, 'stone_stairs', 'Stone Steps', { tex: all('stone_bricks'), shape: SHAPE_BOX, opaque: false, hardness: 2, tool: 'pick', tier: 1 });
def(87, 'plank_stairs', 'Board Steps', { tex: all('ash_planks'), shape: SHAPE_BOX, opaque: false, hardness: 2, tool: 'axe', mat: 'wood' });
def(88, 'fence', 'Fence Post', { tex: all('ash_planks'), shape: SHAPE_BOX, render: RENDER_CUTOUT, opaque: false, hardness: 2, tool: 'axe', mat: 'wood' });
def(89, 'lantern', 'Lantern', { tex: all('lantern'), shape: SHAPE_BOX, render: RENDER_CUTOUT, opaque: false, hardness: 1, tool: 'pick', mat: 'metal', light: 15 });
def(90, 'bookshelf', 'Bookshelf', { tex: tbs('ash_planks', 'ash_planks', 'bookshelf'), hardness: 1.5, tool: 'axe', mat: 'wood' });
def(91, 'rug_red', 'Rug (Ember)', { tex: all('cloth_red'), shape: SHAPE_BOX, render: RENDER_CUTOUT, solid: false, opaque: false, hardness: 0.2, mat: 'cloth', support: 'solid' });
def(92, 'rug_blue', 'Rug (Tide)', { tex: all('cloth_blue'), shape: SHAPE_BOX, render: RENDER_CUTOUT, solid: false, opaque: false, hardness: 0.2, mat: 'cloth', support: 'solid' });
def(93, 'blast_keg', 'Blast Keg', { tex: tbs('keg_top', 'keg_top', 'keg_side'), hardness: 0.5, mat: 'wood' });
def(94, 'frostquartz_block', 'Frostquartz Block', { tex: all('frostquartz_block'), hardness: 3, tool: 'pick', tier: 3, mat: 'glass' });
def(95, 'rubellite_block', 'Rubellite Block', { tex: all('rubellite_block'), hardness: 4, tool: 'pick', tier: 4, mat: 'metal' });
def(96, 'emberite_block', 'Emberite Block', { tex: all('emberite_block'), hardness: 5, tool: 'pick', tier: 4, mat: 'metal', light: 7 });
def(97, 'starstone_block', 'Starstone Block', { tex: all('starstone_block'), hardness: 5, tool: 'pick', tier: 4, mat: 'metal', light: 10 });
def(98, 'mud', 'Cave Mud', { tex: all('mud'), hardness: 0.5, tool: 'spade', mat: 'dirt' });
def(99, 'silver_log', 'Silverwood Log', { tex: tbs('silver_log_top', 'silver_log_top', 'silver_log'), hardness: 2, tool: 'axe', mat: 'wood' });

// ---- expansion 2 (ids 100+): dye colour families, stone variants, decor, plants ----
export interface Dye { key: string; name: string; es: string; rgb: [number, number, number] }
export const DYES: Dye[] = [
  { key: 'snow', name: 'Snow', es: 'Nieve', rgb: [234, 232, 226] }, { key: 'amber', name: 'Amber', es: 'Ámbar', rgb: [226, 128, 44] },
  { key: 'orchid', name: 'Orchid', es: 'Orquídea', rgb: [186, 72, 176] }, { key: 'sky', name: 'Sky', es: 'Cielo', rgb: [96, 170, 222] },
  { key: 'sun', name: 'Sun', es: 'Sol', rgb: [236, 196, 60] }, { key: 'sprout', name: 'Sprout', es: 'Brote', rgb: [124, 196, 56] },
  { key: 'blossom', name: 'Blossom', es: 'Flor', rgb: [232, 140, 170] }, { key: 'ash', name: 'Ash', es: 'Ceniza', rgb: [84, 86, 94] },
  { key: 'mist', name: 'Mist', es: 'Niebla', rgb: [150, 152, 156] }, { key: 'lagoon', name: 'Lagoon', es: 'Laguna', rgb: [40, 140, 150] },
  { key: 'dusk', name: 'Dusk', es: 'Ocaso', rgb: [118, 58, 170] }, { key: 'tide', name: 'Tide', es: 'Marea', rgb: [52, 94, 186] },
  { key: 'bark', name: 'Bark', es: 'Corteza', rgb: [118, 78, 46] }, { key: 'moss', name: 'Moss', es: 'Musgo', rgb: [72, 146, 74] },
  { key: 'ember', name: 'Ember', es: 'Ascua', rgb: [196, 58, 52] }, { key: 'night', name: 'Night', es: 'Noche', rgb: [44, 42, 50] },
];
/** Block ids of the expansion, by key. */
export const BX: Record<string, number> = {};
/** Spanish names for expansion blocks (merged into the i18n table). */
export const NAMES_ES: Record<string, string> = {};
let nextId = 100;
function add(key: string, name: string, es: string, o: Opts) { const id = nextId++; if (id >= 255) throw new Error("block id space exhausted"); BX[key] = id; NAMES_ES[name] = es; return def(id, key, name, o); }
const EXISTING_CLOTH: Record<string, number> = { snow: B.CLOTH_WHITE, ember: B.CLOTH_RED, tide: B.CLOTH_BLUE, moss: B.CLOTH_GREEN, sun: B.CLOTH_YELLOW, night: B.CLOTH_BLACK };
const EXISTING_RUG: Record<string, number> = { ember: B.RUG_RED, tide: B.RUG_BLUE };
/** cloth / rug / smoothcast / fired clay / tinted glass block id per dye key */
export const COLOR_BLOCKS: Record<string, Record<string, number>> = { cloth: {}, rug: {}, smooth: {}, fclay: {}, tglass: {} };
for (const d of DYES) {
  COLOR_BLOCKS.cloth[d.key] = EXISTING_CLOTH[d.key] ?? add(`cloth_${d.key}`, `Woven Cloth (${d.name})`, `Tela tejida (${d.es})`, { tex: all(`cloth_${d.key}`), hardness: 0.8, mat: 'cloth' }).id;
}
for (const d of DYES) {
  const tex = all(EXISTING_CLOTH[d.key] !== undefined ? BLOCKS[EXISTING_CLOTH[d.key]].key : `cloth_${d.key}`);
  COLOR_BLOCKS.rug[d.key] = EXISTING_RUG[d.key] ?? add(`rug_${d.key}`, `Rug (${d.name})`, `Alfombra (${d.es})`, { tex, shape: SHAPE_BOX, render: RENDER_CUTOUT, solid: false, opaque: false, hardness: 0.2, mat: 'cloth', support: 'solid' }).id;
}
for (const d of DYES) COLOR_BLOCKS.smooth[d.key] = add(`smooth_${d.key}`, `Smoothcast (${d.name})`, `Hormigón (${d.es})`, { tex: all(`smooth_${d.key}`), hardness: 1.8, tool: 'pick', tier: 1 }).id;
for (const d of DYES) COLOR_BLOCKS.fclay[d.key] = add(`fclay_${d.key}`, `Fired Clay (${d.name})`, `Arcilla cocida (${d.es})`, { tex: all(`fclay_${d.key}`), hardness: 1.25, tool: 'pick', tier: 1 }).id;
for (const d of DYES) COLOR_BLOCKS.tglass[d.key] = add(`tglass_${d.key}`, `Tinted Glass (${d.name})`, `Cristal teñido (${d.es})`, { tex: all(`tglass_${d.key}`), hardness: 0.3, mat: 'glass', opaque: false, render: RENDER_CUTOUT, cullSame: true, filter: 1 }).id;

const stone = (t: string, h = 1.5): Opts => ({ tex: all(t), hardness: h, tool: 'pick', tier: 1 });
const stoneTbs = (top: string, side: string, h = 1.5): Opts => ({ tex: tbs(top, top, side), hardness: h, tool: 'pick', tier: 1 });
for (const [k, n, es] of [['rosestone', 'Rosestone', 'Piedra rosa'], ['chalkstone', 'Chalkstone', 'Piedra caliza'], ['fieldstone', 'Fieldstone', 'Piedra de campo']]) {
  add(k, n, es, stone(k));
  add(`${k}_polished`, `Polished ${n}`, `${es} pulida`, stone(`${k}_polished`));
}
add('duskstone', 'Duskstone', 'Piedra ocaso', stone('duskstone'));
add('duskstone_polished', 'Polished Duskstone', 'Piedra ocaso pulida', stone('duskstone_polished', 2));
add('duskstone_bricks', 'Duskstone Bricks', 'Ladrillos de piedra ocaso', stone('duskstone_bricks', 2));
add('slate_bricks', 'Slate Bricks', 'Ladrillos de pizarra', stone('slate_bricks', 3));
add('slate_tiles', 'Slate Tiles', 'Baldosas de pizarra', stone('slate_tiles', 3));
add('slate_polished', 'Polished Slate', 'Pizarra pulida', stone('slate_polished', 3));
add('smooth_stone', 'Smooth Stone', 'Piedra lisa', stone('smooth_stone', 2));
add('cracked_hewn', 'Cracked Hewn Stone', 'Piedra tallada agrietada', stone('cracked_hewn', 2));
add('mossy_hewn', 'Mossy Hewn Stone', 'Piedra tallada musgosa', stone('mossy_hewn', 2));
add('carved_hewn', 'Carved Hewn Stone', 'Piedra tallada cincelada', stone('carved_hewn', 2));
add('tuffrock', 'Tuffrock', 'Toba', stone('tuffrock'));
add('whitespar', 'Whitespar', 'Espato blanco', stone('whitespar', 0.8));
add('driprock', 'Driprock', 'Roca de goteo', stone('driprock'));
add('obsidite', 'Obsidite', 'Obsidita', { ...stone('obsidite', 12), tier: 4 });
add('smooth_sandstone', 'Smooth Sandstone', 'Arenisca lisa', stone('smooth_sandstone_top', 0.8));
add('cut_sandstone', 'Cut Sandstone', 'Arenisca cortada', stoneTbs('sandstone_top', 'cut_sandstone', 0.8));
add('rust_sand', 'Rust Sand', 'Arena rojiza', { tex: all('rust_sand'), hardness: 0.5, tool: 'spade', mat: 'sand' });
add('rust_sandstone', 'Rust Sandstone', 'Arenisca rojiza', stoneTbs('rust_sandstone_top', 'rust_sandstone', 0.8));
add('packed_ice', 'Packed Ice', 'Hielo compacto', { tex: all('packed_ice'), hardness: 0.5, tool: 'pick', mat: 'glass' });
add('glacier_ice', 'Glacier Ice', 'Hielo glaciar', { tex: all('glacier_ice'), hardness: 2.8, tool: 'pick', mat: 'glass' });
add('forest_litter', 'Forest Litter', 'Hojarasca', { tex: tbs('forest_litter_top', 'dirt', 'forest_litter_side'), hardness: 0.5, tool: 'spade', mat: 'dirt' });
add('fungal_turf', 'Fungal Turf', 'Césped fúngico', { tex: tbs('fungal_turf_top', 'dirt', 'fungal_turf_side'), hardness: 0.6, tool: 'spade', mat: 'grass' });
add('stony_soil', 'Stony Soil', 'Tierra pedregosa', { tex: all('stony_soil'), hardness: 0.5, tool: 'spade', mat: 'dirt' });
add('packed_mud', 'Packed Mud', 'Barro compacto', { tex: all('packed_mud'), hardness: 1, tool: 'pick', mat: 'dirt' });
add('mud_bricks', 'Mud Bricks', 'Ladrillos de barro', stone('mud_bricks'));
add('tidestone', 'Tidestone', 'Piedra marea', stone('tidestone'));
add('tidestone_bricks', 'Tidestone Bricks', 'Ladrillos de piedra marea', stone('tidestone_bricks'));
add('dark_tidestone', 'Dark Tidestone', 'Piedra marea oscura', stone('dark_tidestone'));
add('tide_lamp', 'Tide Lamp', 'Lámpara de marea', { tex: all('tide_lamp'), hardness: 0.3, mat: 'glass', light: 15 });
add('cinder_bricks', 'Cinder Bricks', 'Ladrillos de escoria', stone('cinder_bricks', 2));
add('red_cinder_bricks', 'Red Cinder Bricks', 'Ladrillos de escoria roja', stone('red_cinder_bricks', 2));
add('pale_quartz', 'Pale Quartz', 'Cuarzo pálido', stone('pale_quartz', 0.8));
add('quartz_bricks', 'Quartz Bricks', 'Ladrillos de cuarzo', stone('quartz_bricks', 0.8));
add('quartz_pillar', 'Quartz Pillar', 'Columna de cuarzo', stoneTbs('quartz_pillar_top', 'quartz_pillar', 0.8));
add('violet_tiles', 'Violet Tiles', 'Baldosas violeta', stone('violet_tiles'));
add('violet_pillar', 'Violet Pillar', 'Columna violeta', stoneTbs('violet_pillar_top', 'violet_pillar'));
add('skystone_bricks', 'Skystone Bricks', 'Ladrillos de piedra celeste', stone('skystone_bricks'));
add('bone_block', 'Bone Block', 'Bloque de hueso', stoneTbs('bone_block_top', 'bone_block', 2));
add('grain_bale', 'Grain Bale', 'Fardo de grano', { tex: tbs('grain_bale_top', 'grain_bale_top', 'grain_bale'), hardness: 0.5, mat: 'plant', soft: true });
add('melon', 'Melon', 'Melón', { tex: tbs('melon_top', 'melon_top', 'melon'), hardness: 1, tool: 'axe', mat: 'plant' });
add('gourd', 'Gourd', 'Calabaza', { tex: tbs('gourd_top', 'gourd_top', 'gourd'), hardness: 1, tool: 'axe', mat: 'plant' });
add('gourd_lantern', 'Gourd Lantern', 'Farol de calabaza', { tex: front('gourd_top', 'gourd_top', 'gourd', 'gourd_face'), hardness: 1, tool: 'axe', mat: 'plant', light: 15 });
add('sponge', 'Sponge', 'Esponja', { tex: all('sponge'), hardness: 0.6, mat: 'cloth' });
add('gel_block', 'Gel Block', 'Bloque de gel', { tex: all('gel_block'), hardness: 0.1, mat: 'cloth', soft: true });
add('amber_gel', 'Amber Gel', 'Gel ámbar', { tex: all('amber_gel'), hardness: 0.1, mat: 'cloth', soft: true });
add('honeycomb', 'Honeycomb Block', 'Bloque de panal', { tex: all('honeycomb'), hardness: 0.6, mat: 'cloth' });
add('coal_block', 'Coal Block', 'Bloque de carbón', { tex: all('coal_block'), hardness: 4, tool: 'pick', tier: 1, mat: 'metal' });
add('raw_iron_block', 'Raw Iron Block', 'Bloque de hierro en bruto', { tex: all('raw_iron_block'), hardness: 4, tool: 'pick', tier: 3 });
add('raw_copper_block', 'Raw Copper Block', 'Bloque de cobre en bruto', { tex: all('raw_copper_block'), hardness: 4, tool: 'pick', tier: 2 });
add('raw_sunstone_block', 'Raw Sunstone Block', 'Bloque de piedrasol en bruto', { tex: all('raw_sunstone_block'), hardness: 4, tool: 'pick', tier: 4 });
add('weathered_copper', 'Weathered Copper', 'Cobre desgastado', { tex: all('weathered_copper'), hardness: 4, tool: 'pick', tier: 2, mat: 'metal' });
add('verdigris_copper', 'Verdigris Copper', 'Cobre verdete', { tex: all('verdigris_copper'), hardness: 4, tool: 'pick', tier: 2, mat: 'metal' });
add('cut_copper', 'Cut Copper', 'Cobre cortado', { tex: all('cut_copper'), hardness: 4, tool: 'pick', tier: 2, mat: 'metal' });
add('silver_planks', 'Silverwood Boards', 'Tablas plateadas', { tex: all('silver_planks'), hardness: 2, tool: 'axe', mat: 'wood' });
add('palm_planks', 'Palm Boards', 'Tablas de palmera', { tex: all('palm_planks'), hardness: 2, tool: 'axe', mat: 'wood' });
add('charred_planks', 'Charred Boards', 'Tablas carbonizadas', { tex: all('charred_planks'), hardness: 2, tool: 'axe', mat: 'wood' });
/** log id -> stripped log id (axe use) */
export const STRIPPED: Record<number, number> = {};
for (const [log, k, n, es] of [[B.ASH_LOG, 'ash', 'Ashwood', 'fresno'], [B.PINE_LOG, 'pine', 'Pine', 'pino'], [B.PALM_LOG, 'palm', 'Palm', 'palmera'], [B.CHARRED_LOG, 'charred', 'Charred', 'carbonizado'], [B.SILVER_LOG, 'silver', 'Silverwood', 'plateado']] as [number, string, string, string][]) {
  STRIPPED[log] = add(`stripped_${k}`, `Stripped ${n} Log`, `Tronco de ${es} pelado`, { tex: tbs(`stripped_${k}_top`, `stripped_${k}_top`, `stripped_${k}`), hardness: 2, tool: 'axe', mat: 'wood' }).id;
}
add('glowpod', 'Glowpod', 'Vaina luminosa', { tex: all('glowpod'), hardness: 1, tool: 'axe', mat: 'plant', light: 15 });
for (const [k, n, es] of [['crimson_bloom', 'Crimson Bloom', 'Flor carmesí'], ['cupflower_amber', 'Amber Cupflower', 'Copaflor ámbar'], ['cupflower_snow', 'Snow Cupflower', 'Copaflor blanca'],
  ['cupflower_blossom', 'Blossom Cupflower', 'Copaflor rosa'], ['starburst_daisy', 'Starburst Daisy', 'Margarita estelar'], ['orchid_puff', 'Orchid Puff', 'Pompón orquídea']]) add(k, n, es, plant({ tex: all(k) }));
add('frond_fern', 'Frond Fern', 'Helecho', plant({ tex: all('frond_fern'), replaceable: true }));
add('capshroom_red', 'Red Capshroom', 'Hongo rojo', plant({ tex: all('capshroom_red'), support: 'solid', light: 1 }));
add('capshroom_brown', 'Brown Capshroom', 'Hongo café', plant({ tex: all('capshroom_brown'), support: 'solid' }));
// ---- Dreamhollow (4th dimension): ids 249-254 ----
add('dream_turf', 'Dream Turf', 'Césped de ensueño', { tex: tbs('dream_turf_top', 'dreamstone', 'dream_turf_side'), hardness: 0.6, tool: 'spade', mat: 'grass', light: 2 });
add('dreamstone', 'Dreamstone', 'Piedra de ensueño', stone('dreamstone'));
add('bloomcap_stem', 'Bloomcap Stem', 'Tallo de seta gigante', { tex: tbs('bloomcap_stem_top', 'bloomcap_stem_top', 'bloomcap_stem'), hardness: 1.5, tool: 'axe', mat: 'wood' });
add('bloomcap_cap', 'Bloomcap', 'Sombrero de seta gigante', { tex: tbs('bloomcap_cap_top', 'bloomcap_cap_under', 'bloomcap_cap'), hardness: 0.5, tool: 'axe', mat: 'leaves', light: 11 });
add('lumenite_ore', 'Lumenite Vein', 'Veta de lumenita', { tex: all('lumenite_ore'), hardness: 3, tool: 'pick', tier: 3, light: 6 });
add('dream_rift', 'Dream Rift', 'Grieta de ensueño', { tex: all('dream_rift'), hardness: 4, tool: 'pick', tier: 1, mat: 'glass', light: 12 });
export const FLOWERS = [B.SUNPETAL, B.BLUEBELL, BX.crimson_bloom, BX.cupflower_amber, BX.cupflower_snow, BX.cupflower_blossom, BX.starburst_daisy, BX.orchid_puff];
const RUG = new Uint8Array(256);
for (const id of Object.values(COLOR_BLOCKS.rug)) RUG[id] = 1;
export const isRug = (id: number) => RUG[id] === 1;

// Unloaded sentinel behaves like an invisible solid wall.
BLOCKS[UNLOADED] = {
  id: UNLOADED, key: 'unloaded', name: 'Unloaded', shape: SHAPE_NONE, render: RENDER_NONE, solid: true, opaque: true,
  filter: 0, light: 0, hardness: -1, tool: 'none', tier: 0, mat: 'stone', tex: all('stone'), item: false, catalog: false,
};

// low-quality (opaque) leaf variants
export const FAST_LEAF: Record<number, number> = {
  [B.ASH_LEAVES]: tile('ash_leaves_o'), [B.PINE_LEAVES]: tile('pine_leaves_o'), [B.PALM_LEAVES]: tile('palm_leaves_o'),
  [B.EMBER_LEAVES]: tile('ember_leaves_o'), [B.SILVER_LEAVES]: tile('silver_leaves_o'),
};
export const isLeaf = (id: number) => id === B.ASH_LEAVES || id === B.PINE_LEAVES || id === B.PALM_LEAVES || id === B.EMBER_LEAVES || id === B.SILVER_LEAVES;

// tiles only reached through texMeta must be registered up front, or the atlas (built once) and the
// meshing worker would never see them: ripe berry bush and the grain growth stages.
tile('berry_bush_ripe');
for (let i = 1; i < 8; i++) tile('grain' + i);

// crack overlay tiles (painted after the block tiles)
export const CRACK_TILES: number[] = [];
for (let i = 0; i < 8; i++) CRACK_TILES.push(tile('crack' + i));

// ---- fast lookup tables ----
export const L_OPAQUE = new Uint8Array(256);
export const L_SOLID = new Uint8Array(256);
export const L_FILTER = new Uint8Array(256);
export const L_EMIT = new Uint8Array(256);
export const L_SHAPE = new Uint8Array(256);
export const L_RENDER = new Uint8Array(256);
export const L_CULLSAME = new Uint8Array(256);
export const L_CLIMB = new Uint8Array(256);
export const L_SOFT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const d = BLOCKS[i];
  if (!d) { L_RENDER[i] = RENDER_NONE; continue; }
  L_OPAQUE[i] = d.opaque ? 1 : 0;
  L_SOLID[i] = d.solid ? 1 : 0;
  L_FILTER[i] = d.filter;
  L_EMIT[i] = d.light;
  L_SHAPE[i] = d.shape;
  L_RENDER[i] = d.render;
  L_CULLSAME[i] = d.cullSame ? 1 : 0;
  L_CLIMB[i] = d.climb ? 1 : 0;
  L_SOFT[i] = d.soft ? 1 : 0;
}

export function blockDef(id: number): BlockDef { return BLOCKS[id] || BLOCKS[0]; }

export function faceTile(id: number, face: number, meta: number): number {
  const d = BLOCKS[id];
  if (!d) return 0;
  return d.texMeta ? d.texMeta(meta, face) : d.tex[face];
}

/** Sub-boxes (in 1/16 units) for SHAPE_BOX blocks. Used for meshing, collision and ray picking. */
export function blockBoxes(id: number, meta: number): number[][] {
  switch (id) {
    case B.TORCH:
      switch (meta) {
        case 1: return [[13, 3, 7, 15, 13, 9]];
        case 2: return [[1, 3, 7, 3, 13, 9]];
        case 3: return [[7, 3, 13, 9, 13, 15]];
        case 4: return [[7, 3, 1, 9, 13, 3]];
        default: return [[7, 0, 7, 9, 10, 9]];
      }
    case B.DOOR_LOWER:
    case B.DOOR_UPPER: {
      const f = ((meta & 3) + ((meta & 4) ? 1 : 0)) & 3;
      if (f === 0) return [[0, 0, 0, 16, 16, 3]];
      if (f === 1) return [[13, 0, 0, 16, 16, 16]];
      if (f === 2) return [[0, 0, 13, 16, 16, 16]];
      return [[0, 0, 0, 3, 16, 16]];
    }
    case B.CACTUS: return [[1, 0, 1, 15, 16, 15]];
    case B.LADDER:
      switch (meta) { case 1: return [[14, 0, 0, 16, 16, 16]]; case 2: return [[0, 0, 0, 2, 16, 16]]; case 3: return [[0, 0, 14, 16, 16, 16]]; default: return [[0, 0, 0, 16, 16, 2]]; }
    case B.BED: return [[0, 0, 0, 16, 7, 16]];
    case B.STONE_SLAB: case B.PLANK_SLAB: return meta ? [[0, 8, 0, 16, 16, 16]] : [[0, 0, 0, 16, 8, 16]];
    case B.STONE_STAIRS: case B.PLANK_STAIRS: {
      const back = meta === 0 ? [0, 8, 8, 16, 16, 16] : meta === 1 ? [0, 8, 0, 8, 16, 16] : meta === 2 ? [0, 8, 0, 16, 16, 8] : [8, 8, 0, 16, 16, 16];
      return [[0, 0, 0, 16, 8, 16], back];
    }
    case B.FENCE: return [[6, 0, 6, 10, 16, 10]];
    case B.LANTERN: return [[5, 0, 5, 11, 9, 11], [6, 9, 6, 10, 11, 10]];
    case B.RUG_RED: case B.RUG_BLUE: return [[0, 0, 0, 16, 1, 16]];
    case B.FARMLAND: return [[0, 0, 0, 16, 15, 16]];
    default: return isRug(id) ? [[0, 0, 0, 16, 1, 16]] : [[0, 0, 0, 16, 16, 16]];
  }
}

/** Boxes used for collision (solid blocks only) in block units. */
export function collisionBoxes(id: number, meta: number): number[][] | null {
  if (!L_SOLID[id]) return null;
  if (L_SHAPE[id] === SHAPE_BOX) return blockBoxes(id, meta);
  return FULL_BOX;
}
const FULL_BOX = [[0, 0, 0, 16, 16, 16]];

/** Boxes used for ray picking. */
export function pickBoxes(id: number, meta: number): number[][] {
  const s = L_SHAPE[id];
  if (s === SHAPE_BOX) return blockBoxes(id, meta);
  if (s === SHAPE_CROSS) return [[2, 0, 2, 14, id === B.GRAIN ? 4 + meta * 1.5 : 13, 14]];
  return FULL_BOX;
}

export function isLiquid(id: number) { return id === B.WATER || id === B.MAGMA; }
