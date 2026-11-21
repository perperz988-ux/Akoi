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
export const ATLAS_COLS = 16;
export const ATLAS_CELL = 32; // 16px tile + 8px wrapped padding each side (mip-safe)
export const ATLAS_TILE = 16;
export const ATLAS_SIZE = 512;

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
  support?: 'soil' | 'sand' | 'farmland' | 'solid' | 'any';
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

// Unloaded sentinel behaves like an invisible solid wall.
BLOCKS[UNLOADED] = {
  id: UNLOADED, key: 'unloaded', name: 'Unloaded', shape: SHAPE_NONE, render: RENDER_NONE, solid: true, opaque: true,
  filter: 0, light: 0, hardness: -1, tool: 'none', tier: 0, mat: 'stone', tex: all('stone'), item: false, catalog: false,
};

// low-quality (opaque) leaf variants
export const FAST_LEAF: Record<number, number> = {
  [B.ASH_LEAVES]: tile('ash_leaves_o'), [B.PINE_LEAVES]: tile('pine_leaves_o'), [B.PALM_LEAVES]: tile('palm_leaves_o'),
};

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
    case B.FARMLAND: return [[0, 0, 0, 16, 15, 16]];
    default: return [[0, 0, 0, 16, 16, 16]];
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
