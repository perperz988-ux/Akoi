"""Build a full Minecraft Bedrock resource pack in the ZperCraft style.

usage: python3 -I zperify.py <vanilla textures dir> <zpercraft raw dir> <zpercraft icon> <out pack dir>

Every block / item texture of the vanilla pack gets a replacement:
  1. textures that exist in ZperCraft are copied exactly from the game's painters,
  2. common block families are re-painted with ports of ZperCraft's procedural painters
     (gfx/Atlas.ts) using the colours of the block they replace,
  3. everything else goes through a ZperCraft-look filter (flat palette, saturated,
     pixel jitter, dark item outline) that keeps the silhouette readable.
The vanilla image is only used as a reference (palette, alpha mask, size); it is never shipped.
"""
import os, sys, json, uuid, random, hashlib, colorsys
import numpy as np
from PIL import Image

VAN, RAW, ICON, OUT = sys.argv[1:5]
SKIP_SUFFIX = ('_mer', '_mers', '_normal', '_heightmap')

# ------------------------------------------------------------------ helpers
def clamp(a): return np.clip(a, 0, 255)
def mix(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
def lum(c): return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]
def seed_of(s): return int(hashlib.md5(s.encode()).hexdigest()[:8], 16)

class P:
    def __init__(self, seed, w=16, h=16):
        self.w, self.h = w, h
        self.d = np.zeros((h, w, 4), dtype=np.float32)
        self.rng = random.Random(seed_of(seed))
    def r(self): return self.rng.random()
    def set(self, x, y, c, a=255):
        x = int(x) % self.w; y = int(y) % self.h
        self.d[y, x, :3] = c[:3]; self.d[y, x, 3] = c[3] if len(c) > 3 else a
    def get(self, x, y): return tuple(self.d[int(y) % self.h, int(x) % self.w])
    def jitter(self, c, a): v = (self.r() - 0.5) * a; return (c[0] + v, c[1] + v, c[2] + v)
    def noise(self, c, amt, chroma=0, a=255):
        for y in range(self.h):
            for x in range(self.w):
                v = (self.r() - 0.5) * amt; h = (self.r() - 0.5) * chroma
                self.set(x, y, (c[0] + v + h, c[1] + v, c[2] + v - h), a)
    def shade(self, x, y, k): c = self.get(x, y); self.set(x, y, (c[0] * k, c[1] * k, c[2] * k, c[3]))
    def add(self, x, y, v): c = self.get(x, y); self.set(x, y, (c[0] + v, c[1] + v, c[2] + v, c[3]))
    def img(self): return Image.fromarray(clamp(self.d).astype(np.uint8), 'RGBA')

# ---- ports of ZperCraft's painters (voxel/src/gfx/Atlas.ts) ----
def stone_base(p, base, strata):
    p.noise(base, 22)
    for _ in range(4):
        y = int(p.r() * 16)
        for x in range(16):
            if p.r() < 0.75: p.set(x, y, p.jitter(strata, 10))
            if p.r() < 0.25: y += -1 if p.r() < 0.5 else 1
    for _ in range(10): p.add(int(p.r() * 16), int(p.r() * 16), 18)

def voronoi(p, n, base, mortar, var):
    pts = [(p.r() * 16, p.r() * 16, (p.r() - 0.5) * var) for _ in range(n)]
    for y in range(16):
        for x in range(16):
            d1 = d2 = 1e9; best = 0
            for i, (px, py, _) in enumerate(pts):
                for oy in (-16, 0, 16):
                    for ox in (-16, 0, 16):
                        d = (x + .5 - px - ox) ** 2 + (y + .5 - py - oy) ** 2
                        if d < d1: d2 = d1; d1 = d; best = i
                        elif d < d2: d2 = d
            edge = d2 ** .5 - d1 ** .5
            if edge < 1.1: p.set(x, y, p.jitter(mortar, 12))
            else:
                v = pts[best][2] + (p.r() - .5) * 14 + (-8 if edge < 2 else 6)
                p.set(x, y, (base[0] + v, base[1] + v, base[2] + v))

def ore(p, base_fn, gem, hi, count):
    base_fn()
    for _ in range(count):
        cx, cy = 2 + int(p.r() * 12), 2 + int(p.r() * 12)
        s = 1 if p.r() < .5 else 2
        for dy in range(-s, s + 1):
            for dx in range(-s, s + 1):
                if abs(dx) + abs(dy) > s: continue
                p.set(cx + dx, cy + dy, mix(gem, (0, 0, 0), (dx + dy + 2) * .08))
        p.set(cx - 1 + (0 if s > 1 else 1), cy - (1 if s > 1 else 0), hi)
        p.set(cx + s, cy + 1, mix(gem, (0, 0, 0), .45))

def bark(p, base, dark):
    p.noise(base, 16)
    for x in range(16):
        if p.r() < .4:
            ln, y0 = 3 + int(p.r() * 8), int(p.r() * 16)
            for j in range(ln): p.set(x, y0 + j, p.jitter(dark, 10))

def rings(p, bark_c, wood, ring):
    for y in range(16):
        for x in range(16):
            d = ((x - 7.5) ** 2 + (y - 7.5) ** 2) ** .5
            if d > 7: p.set(x, y, p.jitter(bark_c, 14))
            else: p.set(x, y, p.jitter(ring, 8) if int(d + p.r() * .6) % 2 == 0 else p.jitter(wood, 8))

def boards(p, base, line, vertical=False):
    import math
    for y in range(16):
        for x in range(16):
            a, b = (x, y) if vertical else (y, x)
            board = a // 4; off = (board * 7) % 16
            c = mix(base, (base[0] * .85, base[1] * .82, base[2] * .8), ((board * 37) % 5) / 5)
            c = p.jitter(c, 10)
            if math.sin((b + off) * .9 + board) > .85: c = mix(c, line, .35)
            if a % 4 == 3 or (b + off) % 16 == 0: c = line
            p.set(x, y, c)
    for board in range(4):
        a = board * 4 + 1; b = (board * 7 + 2) % 16
        p.set(a, b, (60, 50, 40)) if vertical else p.set(b, a, (60, 50, 40))

def leaves(p, base, hi, holes):
    p.d[:] = 0
    for _ in range(26):
        cx, cy, r = p.r() * 16, p.r() * 16, 1.4 + p.r() * 1.8
        col = mix(base, hi, p.r() * .6)
        for y in range(int(np.floor(cy - r)), int(cy + r) + 1):
            for x in range(int(np.floor(cx - r)), int(cx + r) + 1):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r: p.set(x, y, mix(col, (0, 0, 0), ((y - cy + r) / (2 * r)) * .3))
    for y in range(16):
        for x in range(16):
            if p.d[y, x, 3] == 0:
                if holes: p.set(x, y, (0, 0, 0), 0)
                else: p.set(x, y, mix(base, (0, 0, 0), .45))

def cloth(p, c):
    for y in range(16):
        for x in range(16):
            w = ((x + y) % 4 < 2) != ((x - y + 16) % 4 < 2)
            p.set(x, y, p.jitter(mix(c, (0, 0, 0), .12 if w else 0), 8))
    for x in range(16): p.shade(x, 0, .85); p.shade(x, 15, .85)

def metal(p, c, rivet):
    for y in range(16):
        for x in range(16):
            k = 1 + (8 - y) * .012
            if x == 0 or y == 0: k = 1.2
            if x == 15 or y == 15: k = .7
            if x in (7, 8): k *= .92
            p.set(x, y, p.jitter((c[0] * k, c[1] * k, c[2] * k), 6))
    for x, y in ((2, 2), (13, 2), (2, 13), (13, 13)):
        p.set(x, y, rivet); p.set(x + 1, y + 1, (rivet[0] * .6, rivet[1] * .6, rivet[2] * .6))

def stone_bricks(p, base, mortar):
    p.noise(base, 12)
    for y in range(16):
        for x in range(16):
            row = y // 8; ox = 4 if row else 0
            bx, by = (x + ox) % 8, y % 8
            if by == 7 or bx == 7: p.set(x, y, mortar)
            elif by == 0 or bx == 0: p.add(x, y, 22)
            elif by == 6 or bx == 6: p.add(x, y, -18)

def small_bricks(p, base, mortar):
    for y in range(16):
        for x in range(16):
            row = y // 4; ox = 3 if row % 2 else 0
            bx, by = (x + ox) % 6, y % 4
            if by == 3 or bx == 5: p.set(x, y, mortar)
            else: p.set(x, y, p.jitter((base[0] - row * 4, base[1] - row * 2, base[2] - row * 2), 16))

def glass(p, tint, alpha_inside):
    p.d[:] = 0
    hi, lo = mix(tint, (255, 255, 255), .55), mix(tint, (0, 0, 0), .15)
    if alpha_inside:
        for y in range(16):
            for x in range(16): p.set(x, y, tint, alpha_inside)
    for i in range(16):
        p.set(i, 0, hi); p.set(i, 15, lo); p.set(0, i, hi); p.set(15, i, lo)
    for i in range(3, 8): p.set(i, 11 - i, mix(hi, (255, 255, 255), .5), 230)
    for i in range(8, 11): p.set(i, 19 - i, mix(hi, (255, 255, 255), .5), 230)

# ------------------------------------------------------------------ palette analysis
def analyse(im):
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    fr = a[:min(a.shape[0], a.shape[1])]           # first frame of animated strips
    px = fr[fr[..., 3] > 100][:, :3]
    if len(px) == 0: px = np.array([[128, 128, 128]], dtype=np.float32)
    L = px @ np.array([.299, .587, .114])
    o = np.argsort(L)
    mean = tuple(px.mean(0))
    dark = tuple(px[o[:max(1, len(o) // 5)]].mean(0))
    light = tuple(px[o[-max(1, len(o) // 5):]].mean(0))
    sat = np.array([colorsys.rgb_to_hsv(*(c / 255))[1] * (c.max() / 255) for c in px])
    accent = tuple(px[np.argsort(sat)[-max(1, len(px) // 8):]].mean(0))
    meansat = float(sat.mean())
    full = bool((a[..., 3] > 250).all())
    return dict(mean=mean, dark=dark, light=light, accent=accent, sat=meansat, opaque=full, arr=a)

# ------------------------------------------------------------------ ZperCraft-look filter
OUTLINE = (26, 22, 30, 200)
def kmeans(px, k, it=8):
    rng = np.random.default_rng(0)
    cent = px[rng.choice(len(px), k, replace=False)] if len(px) >= k else px.copy()
    for _ in range(it):
        lab = ((px[:, None, :] - cent[None]) ** 2).sum(-1).argmin(1)
        for j in range(len(cent)):
            m = px[lab == j]
            if len(m): cent[j] = m.mean(0)
    return cent, lab

def zfilter(im, name, outline):
    a = np.asarray(im.convert('RGBA')).astype(np.float32).copy()
    m = a[..., 3] > 0
    px = a[m][:, :3]
    if len(px) == 0: return Image.fromarray(a.astype(np.uint8), 'RGBA')
    uniq = len(np.unique(px.astype(np.uint8), axis=0))
    k = int(min(6, max(2, uniq // 6), uniq))
    cent, lab = kmeans(px, k)
    q = cent[lab]
    # keep a little of the original so detail is not lost, but mostly the flat palette
    col = q * .78 + px * .22
    # ZperCraft look: richer colour, slightly cool shadows, warm highlights
    hsv = np.array([colorsys.rgb_to_hsv(*(c / 255)) for c in col])
    hsv[:, 1] = np.clip(hsv[:, 1] * 1.18, 0, 1)
    rgb = np.array([colorsys.hsv_to_rgb(*h) for h in hsv]) * 255
    L = (rgb @ np.array([.299, .587, .114]))[:, None]
    rgb += np.where(L < 90, np.array([-3, -1, 6]), np.array([4, 2, -2]))
    rng = np.random.default_rng(seed_of(name))
    rgb += rng.uniform(-5, 5, (len(rgb), 1))
    a[m, :3] = clamp(rgb)
    if outline:
        h, w = m.shape
        solid = a[..., 3] > 200
        nb = np.zeros_like(solid)
        nb[1:] |= solid[:-1]; nb[:-1] |= solid[1:]; nb[:, 1:] |= solid[:, :-1]; nb[:, :-1] |= solid[:, 1:]
        edge = nb & (a[..., 3] == 0)
        a[edge] = OUTLINE
    return Image.fromarray(clamp(a).astype(np.uint8), 'RGBA')

# ------------------------------------------------------------------ explicit ZperCraft textures
EXACT_BLOCKS = {
 'stone':['stone'], 'rubble':['cobblestone'], 'mossy_rubble':['cobblestone_mossy'],
 'deepstone':['deepslate/cobbled_deepslate'], 'slate':['deepslate/deepslate','deepslate/deepslate_top'],
 'dirt':['dirt'], 'grass_top':['grass_top','grass_carried'], 'grass_side':['grass_side','grass_side_carried'],
 'frost_side':['grass_side_snowed'], 'snow':['snow'], 'sand':['sand'], 'gravel':['gravel'], 'clay':['clay'],
 'sandstone':['sandstone_normal'], 'sandstone_top':['sandstone_top','sandstone_bottom'], 'ice':['ice'],
 'magma':['magma'], 'mud':['mud'], 'moss':['moss_block'],
 'ash_log':['log_oak'], 'ash_log_top':['log_oak_top'], 'ash_planks':['planks_oak'], 'ash_sapling':['sapling_oak'],
 'ash_leaves':['leaves_oak','leaves_oak_carried'], 'ash_leaves_o':['leaves_oak_opaque'],
 'pine_log':['log_spruce'], 'pine_log_top':['log_spruce_top'], 'pine_planks':['planks_spruce'], 'pine_sapling':['sapling_spruce'],
 'pine_leaves_o':['leaves_spruce_opaque'], 'pine_leaves':['leaves_spruce_carried'],
 'palm_log':['log_jungle'], 'palm_log_top':['log_jungle_top'], 'palm_leaves':['leaves_jungle','leaves_jungle_carried'], 'palm_leaves_o':['leaves_jungle_opaque'],
 'silver_log':['log_birch'], 'silver_log_top':['log_birch_top'], 'silver_leaves_o':['leaves_birch_opaque'], 'silver_leaves':['leaves_birch_carried'],
 'charred_log':['huge_fungus/crimson_log_side'], 'charred_log_top':['huge_fungus/crimson_log_top'], 'ember_leaves_o':['nether_wart_block'],
 'basalt':['basalt_side'], 'basalt_top':['basalt_top'], 'ash_soil':['netherrack'], 'skystone':['end_stone'],
 'coal_ore':['coal_ore'], 'copper_ore':['copper_ore'], 'iron_ore':['iron_ore'], 'sunstone_ore':['gold_ore'],
 'azurite_ore':['diamond_ore'], 'glowshard_ore':['emerald_ore'], 'frostquartz_ore':['lapis_ore'], 'rubellite_ore':['redstone_ore','lit_redstone_ore'],
 'emberite_ore':['quartz_ore'],
 'deep_coal_ore':['deepslate/deepslate_coal_ore'], 'deep_copper_ore':['deepslate/deepslate_copper_ore'], 'deep_iron_ore':['deepslate/deepslate_iron_ore'],
 'deep_sunstone_ore':['deepslate/deepslate_gold_ore'], 'deep_azurite_ore':['deepslate/deepslate_diamond_ore'], 'deep_glowshard_ore':['deepslate/deepslate_emerald_ore'],
 'deep_frostquartz_ore':['deepslate/deepslate_lapis_ore'], 'deep_rubellite_ore':['deepslate/deepslate_redstone_ore','deepslate/lit_deepslate_redstone_ore'],
 'copper_block':['copper_block'], 'iron_block':['iron_block'], 'sunstone_block':['gold_block'], 'azurite_block':['diamond_block'],
 'frostquartz_block':['lapis_block'], 'rubellite_block':['redstone_block'], 'emberite_block':['netherite_block'], 'starstone_block':['emerald_block'],
 'stone_bricks':['stonebrick'], 'clay_bricks':['brick'], 'glass':['glass'],
 'workbench_top':['crafting_table_top'], 'workbench_side':['crafting_table_side'], 'workbench_front':['crafting_table_front'],
 'kiln_front':['furnace_front_on'], 'kiln_side':['furnace_side'], 'kiln_top':['furnace_top'],
 'crate_side':['barrel_side'], 'crate_top':['barrel_top','barrel_bottom'],
 'keg_side':['tnt_side'], 'keg_top':['tnt_top','tnt_bottom'],
 'door_lower':['door_wood_lower'], 'door_upper':['door_wood_upper'], 'farmland':['farmland_wet','farmland_dry'],
 'lumen_lamp':['glowstone'], 'lantern':['redstone_lamp_on'],
 'cloth_white':['wool_colored_white'], 'cloth_red':['wool_colored_red'], 'cloth_blue':['wool_colored_blue'],
 'cloth_green':['wool_colored_green'], 'cloth_yellow':['wool_colored_yellow'], 'cloth_black':['wool_colored_black'],
 'pillar_side':['quartz_block_lines'], 'pillar_top':['quartz_block_lines_top','quartz_block_top','quartz_block_side','quartz_block_bottom'],
 'tall_grass':['tallgrass','tallgrass_carried'], 'sunpetal':['flower_dandelion'], 'bluebell':['flower_cornflower'],
 'berry_bush':['sweet_berry_bush_stage0','sweet_berry_bush_stage1','sweet_berry_bush_stage2'], 'berry_bush_ripe':['sweet_berry_bush_stage3'],
 'cactus':['cactus_side'], 'cactus_top':['cactus_top','cactus_bottom'], 'dry_shrub':['deadbush'], 'glowcap':['mushroom_red'],
 'glow_vine':['cave_vines_body_berries','cave_vines_head_berries'], 'crystal_block':['amethyst_block'], 'crystal_shard':['amethyst_cluster'],
 'torch':['torch_on'], 'ladder':['ladder'], 'bookshelf':['bookshelf'], 'ash_rift':['portal'], 'cloud':['powder_snow'],
}
for s in range(8): EXACT_BLOCKS[f'grain{s}'] = [f'wheat_stage_{s}']

EXACT_ITEMS = {
 'stick':['stick'], 'fiber':['string'], 'coal':['coal'], 'copper_ingot':['copper_ingot'], 'iron_ingot':['iron_ingot'],
 'sunstone_ingot':['gold_ingot'], 'azurite':['diamond'], 'glowshard':['emerald'], 'glow_dust':['glowstone_dust'],
 'frostquartz':['dye_powder_blue_new','lapis_lazuli'], 'rubellite':['redstone_dust'], 'emberite_ingot':['netherite_ingot'], 'prism_shard':['amethyst_shard'],
 'starstone':['nether_star'], 'crag_shard':['flint'], 'gloom_essence':['ender_pearl'], 'fur':['leather'],
 'berries':['sweet_berries'], 'raw_meat':['beef_raw'], 'cooked_meat':['beef_cooked'],
 'seeds':['seeds_wheat'], 'grain_item':['wheat'], 'bread':['bread'], 'door':['door_wood'], 'bucket':['bucket_empty'],
 'water_bucket':['bucket_water'], 'raw_fish':['fish_raw'], 'cooked_fish':['fish_cooked'],
 'ashfruit':['apple'], 'berry_pie':['pumpkin_pie'], 'bow':['bow_standby'], 'arrow':['arrow'],
 'fishing_line':['fishing_rod_uncast'], 'glowcap_stew':['mushroom_stew'],
}
TIER = {'wood':'wood','stone':'stone','copper':'copper','iron':'iron','azure':'diamond','ember':'netherite'}
KIND = {'pick':'pickaxe','axe':'axe','spade':'shovel','blade':'sword'}
for t, bt in TIER.items():
    for k, bk in KIND.items(): EXACT_ITEMS[f'{t}_{k}'] = [f'{bt}_{bk}']
EXACT_ITEMS['wood_tiller'] = ['wood_hoe']; EXACT_ITEMS['stone_tiller'] = ['stone_hoe']
for t, bt in {'copper':'copper','iron':'iron','azure':'diamond','ember':'netherite'}.items():
    for k, bk in {'helm':'helmet','vest':'chestplate','greaves':'leggings','boots':'boots'}.items(): EXACT_ITEMS[f'{t}_{k}'] = [f'{bt}_{bk}']

def raw(kind, n): return Image.open(f'{RAW}/{kind}/{n}.png').convert('RGBA')

# recolour a ZperCraft tool/armour icon to another metal (gold, chainmail...), leaving the wooden handle alone
HANDLE = {(120, 84, 50), (92, 62, 38), (90, 70, 50), OUTLINE[:3]}
def recolor(im, src_col, dst_col):
    a = np.asarray(im).astype(np.float32).copy()
    sl = lum(src_col)
    for y in range(a.shape[0]):
        for x in range(a.shape[1]):
            r, g, b, al = a[y, x]
            if al == 0 or (int(r), int(g), int(b)) in HANDLE: continue
            k = lum((r, g, b)) / sl
            a[y, x, :3] = [dst_col[0] * k, dst_col[1] * k, dst_col[2] * k]
    return Image.fromarray(clamp(a).astype(np.uint8), 'RGBA')

IRON = (216, 214, 218); STONE_T = (140, 142, 150)
extra_items = {}
for k, bk in KIND.items():
    extra_items[f'gold_{bk}'] = recolor(raw('items', f'iron_{k}'), IRON, (250, 204, 70))
for bt, col in {'gold': (250, 204, 70), 'iron': IRON, 'copper': (214, 124, 72), 'diamond': (70, 130, 236), 'netherite': (250, 110, 36)}.items():
    extra_items[f'{bt}_hoe'] = recolor(raw('items', 'stone_tiller'), STONE_T, col)
for k, bk in {'helm':'helmet','vest':'chestplate','greaves':'leggings','boots':'boots'}.items():
    extra_items[f'gold_{bk}'] = recolor(raw('items', f'iron_{k}'), IRON, (250, 204, 70))
    extra_items[f'chainmail_{bk}'] = recolor(raw('items', f'iron_{k}'), IRON, (150, 154, 168))
extra_items['bucket_lava'] = raw('items', 'water_bucket')
a = np.asarray(extra_items['bucket_lava']).copy()
for x in range(4, 12):
    a[5, x, :3] = (255, 140, 40); a[6, x, :3] = (220, 80, 30)
extra_items['bucket_lava'] = Image.fromarray(a, 'RGBA')

# ------------------------------------------------------------------ procedural rules for the rest
GRASS = (86, 164, 82); FOLIAGE = (70, 140, 64)
TINT_WORDS = ('grass', 'fern', 'leaves', 'vine', 'waterlily', 'lily', 'reeds', 'stem', 'tallgrass')
FIXED_TINT = {'leaves_spruce': (0x61, 0x99, 0x61), 'leaves_birch': (0x80, 0xa7, 0x55)}

def colourise_grey(info, im, name):
    """Bedrock ships biome-tinted textures as grey; with the neutral colour map they need colour baked in."""
    base = name.split('/')[-1]
    if info['sat'] > .12 or not any(w in base for w in TINT_WORDS): return im, info
    a = info['arr'].copy()
    tgt = FOLIAGE if 'leaves' in base or 'vine' in base else GRASS
    L = a[..., :3] @ np.array([.299, .587, .114])
    mean_l = max(1, L[a[..., 3] > 0].mean()) if (a[..., 3] > 0).any() else 128
    for i in range(3): a[..., i] = np.where(a[..., 3] > 0, tgt[i] * L / mean_l, a[..., i])
    im2 = Image.fromarray(clamp(a).astype(np.uint8), 'RGBA')
    return im2, analyse(im2)

def predivide(im, tint):
    a = np.asarray(im).astype(np.float32).copy()
    for i in range(3): a[..., i] = a[..., i] * 255 / tint[i]
    return Image.fromarray(clamp(a).astype(np.uint8), 'RGBA')

STONEY = ('stone', 'andesite', 'diorite', 'granite', 'tuff', 'calcite', 'blackstone', 'netherrack', 'dripstone',
          'deepslate', 'end_stone', 'obsidian', 'bedrock', 'basalt', 'smooth', 'cinnabar', 'sulfur', 'purpur')
SOILY = ('dirt', 'sand', 'mud', 'soul_soil', 'podzol', 'mycelium', 'nylium', 'snow', 'clay', 'gravel', 'concrete_powder', 'suspicious')
METALS = ('iron', 'gold', 'diamond', 'emerald', 'lapis', 'netherite', 'redstone', 'coal', 'copper', 'amethyst', 'quartz', 'raw_')

def procedural(name, info, im):
    """Returns a 16x16 ZperCraft-painted image for well-known block families, else None."""
    b = name.split('/')[-1]
    if im.size != (16, 16): return None
    m, d, l, acc = info['mean'], info['dark'], info['light'], info['accent']
    p = P(name)
    op = info['opaque']
    if b.startswith('glass') and not b.startswith('glass_pane'):
        stained = b != 'glass'
        glass(p, m if stained else (200, 225, 235), 110 if stained else 0); return p.img()
    if b == 'tinted_glass': glass(p, (60, 48, 76), 170); return p.img()
    if 'leaves' in b:
        holes = not (op or b.endswith('_opaque'))
        leaves(p, d if b.endswith('_opaque') else m, l, holes); return p.img()
    if not op: return None
    if b.endswith('_ore') or '_ore' in b:
        if 'deepslate' in b: base = lambda: voronoi(p, 9, (60, 60, 70), (30, 30, 38), 20)
        elif 'nether' in b or 'quartz' in b: base = lambda: p.noise((116, 52, 52), 24)
        else: base = lambda: stone_base(p, (124, 128, 138), (104, 108, 120))
        ore(p, base, acc, mix(acc, (255, 255, 255), .6), 5); return p.img()
    if 'planks' in b:
        boards(p, m, mix(d, (0, 0, 0), .25), 'bamboo' in b); return p.img()
    if any(w in b for w in ('_log', 'log_', '_stem', 'stem_', 'hyphae', '_wood')) and 'mushroom' not in b and 'pumpkin' not in b and 'melon' not in b:
        if 'top' in b: rings(p, d, l, m)
        else: bark(p, m, d)
        return p.img()
    if b.startswith('wool_colored') or b.startswith('carpet'): cloth(p, m); return p.img()
    if b.startswith('concrete_powder'):
        p.noise(m, 26, 6)
        for _ in range(14): p.set(int(p.r() * 16), int(p.r() * 16), mix(m, (255, 255, 255), .2))
        return p.img()
    if b.startswith('concrete'): p.noise(m, 9); return p.img()
    if b.startswith('hardened_clay') or b == 'hardened_clay':
        p.noise(m, 12)
        for y in range(0, 16, 4):
            for x in range(16):
                if p.r() < .6: p.shade(x, y, .93)
        return p.img()
    if b.startswith('shulker_top'): metal(p, m, l); return p.img()
    if any(b.startswith(w) or b == w + '_block' for w in METALS) and b.endswith('_block'):
        metal(p, m, mix(l, (255, 255, 255), .3)); return p.img()
    if 'cut_copper' in b or b.endswith('copper_block') or b in ('exposed_copper', 'weathered_copper', 'oxidized_copper'):
        metal(p, m, mix(l, (255, 255, 255), .3)); return p.img()
    if 'brick' in b and 'chiseled' not in b and 'cracked' not in b:
        if any(w in b for w in ('stone', 'deepslate', 'blackstone', 'tuff', 'end', 'mud', 'polished', 'quartz', 'prismarine', 'resin')):
            stone_bricks(p, m, mix(d, (0, 0, 0), .2))
        else: small_bricks(p, m, mix(l, (220, 210, 200), .4))
        return p.img()
    if 'cobble' in b or b == 'gravel' or b.startswith('suspicious_gravel'):
        voronoi(p, 9, m, mix(d, (0, 0, 0), .2), 30); return p.img()
    if any(w in b for w in SOILY) and 'side' not in b:
        p.noise(m, 22, 6)
        for _ in range(9):
            x, y = int(p.r() * 15), int(p.r() * 15); p.set(x, y, l); p.set(x + 1, y, d)
        return p.img()
    if any(w in b for w in STONEY) and not any(w in b for w in ('chiseled', 'pillar', 'lines', 'side', 'top', 'cracked', 'slab', 'stonecutter', 'button', 'pressure')):
        stone_base(p, m, d); return p.img()
    return None

# ------------------------------------------------------------------ build
written, stats = set(), {'zpercraft': 0, 'procedural': 0, 'filtered': 0}
def out_path(rel_no_ext, ext): return f'{OUT}/textures/{rel_no_ext}{ext}'
def save(im, rel_no_ext, ext='.png'):
    path = out_path(rel_no_ext, ext); os.makedirs(os.path.dirname(path), exist_ok=True)
    if ext == '.tga': im.convert('RGBA').save(path, compression=None)
    else: im.save(path)
    written.add(rel_no_ext)

import shutil
if os.path.exists(OUT): shutil.rmtree(OUT)

vanilla = {}
for root in ('blocks', 'items', 'entity/chest', 'entity/bed', 'models/armor'):
    for dp, _, fs in os.walk(f'{VAN}/{root}'):
        for f in fs:
            stem, ext = os.path.splitext(f)
            if ext not in ('.png', '.tga') or stem.endswith(SKIP_SUFFIX): continue
            rel = os.path.relpath(os.path.join(dp, stem), VAN)
            vanilla[rel] = ext

def ext_of(rel): return vanilla.get(rel, '.png')

def fit(src, rel):
    """Scale a 16x16 ZperCraft tile to the vanilla image size (keeps animated strips working)."""
    if rel not in vanilla: return src
    v = Image.open(f'{VAN}/{rel}{vanilla[rel]}')
    w, h = v.size
    if (w, h) == src.size: return src
    s = src.resize((w, w), Image.NEAREST)
    o = Image.new('RGBA', (w, h))
    for y in range(0, h, w): o.paste(s, (0, y))
    return o

for src, dsts in EXACT_BLOCKS.items():
    for d in dsts:
        rel = 'blocks/' + d; save(fit(raw('tiles', src), rel), rel, ext_of(rel)); stats['zpercraft'] += 1
for src, dsts in EXACT_ITEMS.items():
    for d in dsts:
        rel = 'items/' + d; save(fit(raw('items', src), rel), rel, ext_of(rel)); stats['zpercraft'] += 1
for d, im in extra_items.items():
    rel = 'items/' + d; save(fit(im, rel), rel, ext_of(rel)); stats['zpercraft'] += 1

# spruce / birch leaves carry a fixed engine tint: pre-divide so the result matches ZperCraft
for n, src in (('leaves_spruce', 'pine_leaves'), ('leaves_birch', 'silver_leaves')):
    rel = 'blocks/' + n; save(predivide(raw('tiles', src), FIXED_TINT[n]), rel, ext_of(rel)); stats['zpercraft'] += 1

# animated liquids
def strip(img, frames, grey=False):
    o = Image.new('RGBA', (16, 16 * frames))
    for f in range(frames):
        fr = Image.new('RGBA', (16, 16))
        for y in range(16):
            for x in range(16): fr.putpixel((x, y), img.getpixel(((x + f) % 16, (y + f // 2) % 16)))
        o.paste(fr, (0, 16 * f))
    if grey:
        a = np.asarray(o.convert('L')).astype(np.float32)
        a = np.clip(150 + a, 0, 255)
        o = Image.fromarray(np.dstack([a, a, a, np.full_like(a, 200)]).astype(np.uint8), 'RGBA')
    return o
for n in ('water_still_grey', 'water_flow_grey', 'water_still', 'water_flow', 'lava_still', 'lava_flow'):
    rel = 'blocks/' + n
    if rel not in vanilla: continue
    v = Image.open(f'{VAN}/{rel}{vanilla[rel]}')
    frames = max(1, v.size[1] // v.size[0])
    src = raw('tiles', 'magma' if 'lava' in n else 'water')
    save(strip(src, frames, 'grey' in n), rel, vanilla[rel]); stats['zpercraft'] += 1

for i in range(10):
    save(raw('tiles', f'crack{min(7, round(i * 7 / 9))}'), f'environment/destroy_stage_{i}'); stats['zpercraft'] += 1
for cm in ('grass', 'foliage'):
    p_ = f'{OUT}/textures/colormap/{cm}.png'; os.makedirs(os.path.dirname(p_), exist_ok=True)
    Image.new('RGB', (256, 256), (255, 255, 255)).save(p_)

for rel, ext in sorted(vanilla.items()):
    if rel in written: continue
    try: im = Image.open(f'{VAN}/{rel}{ext}').convert('RGBA')
    except Exception as e: print('skip', rel, e); continue
    info = analyse(im)
    im, info = colourise_grey(info, im, rel)
    base = rel.split('/')[-1]
    res = procedural(rel, info, im) if rel.startswith('blocks/') else None
    if res is not None:
        if base in FIXED_TINT: res = predivide(res, FIXED_TINT[base])
        stats['procedural'] += 1
    else:
        res = zfilter(im, rel, outline=rel.startswith('items/'))
        if base in FIXED_TINT: res = predivide(res, FIXED_TINT[base])
        stats['filtered'] += 1
    save(res, rel, ext)

Image.open(ICON).convert('RGBA').resize((256, 256), Image.LANCZOS).save(f'{OUT}/pack_icon.png')
json.dump({
 "format_version": 2,
 "header": {"name": "ZperCraft Completo", "description": "Todos los bloques y objetos de Minecraft con el estilo de ZperCraft",
            "uuid": "a3b8cd50-9eaf-4fce-ab67-e9aff7a52a3b", "version": [2, 1, 0], "min_engine_version": [1, 21, 0]},
 "modules": [{"type": "resources", "uuid": "94b7f274-c51f-4dae-a876-96f8a22b5bc3", "version": [2, 1, 0]}]
}, open(f'{OUT}/manifest.json', 'w'), indent=2, ensure_ascii=False)
print(stats, 'total', len(written))
