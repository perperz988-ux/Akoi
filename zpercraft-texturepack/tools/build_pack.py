import sys, os, json, uuid, shutil, zipfile
from PIL import Image
raw, icon_src, out = sys.argv[1], sys.argv[2], sys.argv[3]
T = lambda n: Image.open(f'{raw}/tiles/{n}.png').convert('RGBA')
I = lambda n: Image.open(f'{raw}/items/{n}.png').convert('RGBA')
if os.path.exists(out): shutil.rmtree(out)
B, IT = f'{out}/textures/blocks', f'{out}/textures/items'
written = []
def save(img, path):
    p = f'{out}/textures/{path}.png'; os.makedirs(os.path.dirname(p), exist_ok=True); img.save(p); written.append(path)

blocks = {
 'stone':['stone'], 'rubble':['cobblestone'], 'mossy_rubble':['cobblestone_mossy'],
 'deepstone':['deepslate/cobbled_deepslate'], 'slate':['deepslate/deepslate','deepslate/deepslate_top','tuff'],
 'dirt':['dirt','coarse_dirt'], 'grass_top':['grass_top','grass_carried'], 'grass_side':['grass_side','grass_side_carried'],
 'frost_side':['grass_side_snowed'], 'snow':['snow'], 'sand':['sand'], 'gravel':['gravel'], 'clay':['clay'],
 'sandstone':['sandstone_normal'], 'sandstone_top':['sandstone_top','sandstone_bottom'], 'ice':['ice'],
 'magma':['magma'], 'mud':['mud'], 'moss':['moss_block'],
 'ash_log':['log_oak'], 'ash_log_top':['log_oak_top'], 'ash_planks':['planks_oak'], 'ash_sapling':['sapling_oak'],
 'ash_leaves':['leaves_oak','leaves_oak_carried'], 'ash_leaves_o':['leaves_oak_opaque'],
 'pine_log':['log_spruce'], 'pine_log_top':['log_spruce_top'], 'pine_planks':['planks_spruce'], 'pine_sapling':['sapling_spruce'],
 'pine_leaves_o':['leaves_spruce_opaque'],
 'palm_log':['log_jungle'], 'palm_log_top':['log_jungle_top'], 'palm_leaves':['leaves_jungle','leaves_jungle_carried'], 'palm_leaves_o':['leaves_jungle_opaque'],
 'silver_log':['log_birch'], 'silver_log_top':['log_birch_top'], 'silver_leaves_o':['leaves_birch_opaque'],
 'charred_log':['huge_fungus/crimson_log_side'], 'charred_log_top':['huge_fungus/crimson_log_top'], 'ember_leaves_o':['nether_wart_block'],
 'basalt':['basalt_side'], 'basalt_top':['basalt_top'], 'ash_soil':['netherrack'],
 'skystone':['end_stone'], 'cloud':['powder_snow'],
 'coal_ore':['coal_ore'], 'copper_ore':['copper_ore'], 'iron_ore':['iron_ore'], 'sunstone_ore':['gold_ore'],
 'azurite_ore':['diamond_ore'], 'glowshard_ore':['emerald_ore'], 'frostquartz_ore':['lapis_ore'], 'rubellite_ore':['redstone_ore'],
 'emberite_ore':['quartz_ore','nether_gold_ore'],
 'deep_coal_ore':['deepslate/deepslate_coal_ore'], 'deep_copper_ore':['deepslate/deepslate_copper_ore'], 'deep_iron_ore':['deepslate/deepslate_iron_ore'],
 'deep_sunstone_ore':['deepslate/deepslate_gold_ore'], 'deep_azurite_ore':['deepslate/deepslate_diamond_ore'], 'deep_glowshard_ore':['deepslate/deepslate_emerald_ore'],
 'deep_frostquartz_ore':['deepslate/deepslate_lapis_ore'], 'deep_rubellite_ore':['deepslate/deepslate_redstone_ore'],
 'copper_block':['copper_block'], 'iron_block':['iron_block'], 'sunstone_block':['gold_block'], 'azurite_block':['diamond_block'],
 'frostquartz_block':['lapis_block'], 'rubellite_block':['redstone_block'], 'emberite_block':['netherite_block'], 'starstone_block':['emerald_block'],
 'stone_bricks':['stonebrick'], 'clay_bricks':['brick'], 'glass':['glass'],
 'workbench_top':['crafting_table_top'], 'workbench_side':['crafting_table_side'], 'workbench_front':['crafting_table_front'],
 'kiln_front':['furnace_front_on','furnace_front_off'], 'kiln_side':['furnace_side'], 'kiln_top':['furnace_top'],
 'crate_side':['barrel_side'], 'crate_top':['barrel_top','barrel_bottom','barrel_top_open'],
 'keg_side':['tnt_side'], 'keg_top':['tnt_top','tnt_bottom'],
 'door_lower':['door_wood_lower'], 'door_upper':['door_wood_upper'], 'farmland':['farmland_wet','farmland_dry'],
 'lumen_lamp':['glowstone'], 'lantern':['redstone_lamp_on','sea_lantern'],
 'cloth_white':['wool_colored_white'], 'cloth_red':['wool_colored_red'], 'cloth_blue':['wool_colored_blue'],
 'cloth_green':['wool_colored_green'], 'cloth_yellow':['wool_colored_yellow'], 'cloth_black':['wool_colored_black'],
 'pillar_side':['quartz_block_lines'], 'pillar_top':['quartz_block_lines_top','quartz_block_top','quartz_block_side'],
 'tall_grass':['tallgrass','tallgrass_carried'], 'sunpetal':['flower_dandelion'], 'bluebell':['flower_cornflower','flower_blue_orchid'],
 'berry_bush':['sweet_berry_bush_stage0','sweet_berry_bush_stage1','sweet_berry_bush_stage2'], 'berry_bush_ripe':['sweet_berry_bush_stage3'],
 'cactus':['cactus_side'], 'cactus_top':['cactus_top','cactus_bottom'], 'dry_shrub':['deadbush'], 'glowcap':['mushroom_red','mushroom_brown'],
 'glow_vine':['cave_vines_body_berries','cave_vines_head_berries'], 'crystal_block':['amethyst_block'], 'crystal_shard':['amethyst_cluster'],
 'torch':['torch_on'], 'ladder':['ladder'], 'bookshelf':['bookshelf'], 'ash_rift':['portal'],
}
for s in range(8): blocks[f'grain{s}'] = [f'wheat_stage_{s}']
for src, dsts in blocks.items():
    img = T(src)
    for d in dsts: save(img, 'blocks/' + d)

# Leaves with a fixed engine tint (spruce / birch): pre-divide so the tinted result matches ZperCraft.
def predivide(img, tint):
    px = img.load(); o = img.copy(); po = o.load()
    for y in range(img.height):
        for x in range(img.width):
            r,g,b,a = px[x,y]; po[x,y] = (min(255,r*255//tint[0]), min(255,g*255//tint[1]), min(255,b*255//tint[2]), a)
    return o
save(predivide(T('pine_leaves'), (0x61,0x99,0x61)), 'blocks/leaves_spruce'); save(T('pine_leaves'), 'blocks/leaves_spruce_carried')
save(predivide(T('silver_leaves'), (0x80,0xa7,0x55)), 'blocks/leaves_birch'); save(T('silver_leaves'), 'blocks/leaves_birch_carried')

# Liquids: animated vertical strips (16 frames). Water is grey so Bedrock's biome water colour tints it blue.
def strip(img, grey=False):
    frames = Image.new('RGBA', (16, 16*16))
    for f in range(16):
        fr = Image.new('RGBA', (16,16))
        for y in range(16):
            for x in range(16): fr.putpixel((x,y), img.getpixel(((x+f)%16, (y+f//2)%16)))
        frames.paste(fr, (0, 16*f))
    if grey:
        g = frames.convert('LA').convert('RGBA'); px = g.load()
        for y in range(g.height):
            for x in range(g.width):
                v = px[x,y][0]; v = min(255, 150 + v)  # light grey -> tint keeps colour
                px[x,y] = (v,v,v,200)
        frames = g
    return frames
save(strip(T('water'), True), 'blocks/water_still_grey'); save(strip(T('water'), True), 'blocks/water_flow_grey')
save(strip(T('magma')), 'blocks/lava_still'); save(strip(T('magma')), 'blocks/lava_flow')

# Block breaking stages (Bedrock has 10, ZperCraft has 8).
for i in range(10): save(T(f'crack{min(7, round(i*7/9))}'), f'environment/destroy_stage_{i}')

# Neutral biome colour maps so grass / leaves keep ZperCraft colours instead of being re-tinted.
for cm in ('grass', 'foliage'): 
    p = f'{out}/textures/colormap/{cm}.png'; os.makedirs(os.path.dirname(p), exist_ok=True)
    Image.new('RGB', (256,256), (255,255,255)).save(p); written.append('colormap/'+cm)

items = {
 'stick':['stick'], 'fiber':['string'], 'coal':['coal','charcoal'], 'copper_ingot':['copper_ingot'], 'iron_ingot':['iron_ingot'],
 'sunstone_ingot':['gold_ingot'], 'azurite':['diamond'], 'glowshard':['emerald'], 'glow_dust':['glowstone_dust'],
 'frostquartz':['lapis_lazuli'], 'rubellite':['redstone_dust'], 'emberite_ingot':['netherite_ingot'], 'prism_shard':['amethyst_shard'],
 'starstone':['nether_star'], 'crag_shard':['flint'], 'gloom_essence':['ender_pearl'], 'fur':['leather'],
 'berries':['sweet_berries'], 'raw_meat':['beef_raw','porkchop_raw'], 'cooked_meat':['beef_cooked','porkchop_cooked'],
 'seeds':['seeds_wheat'], 'grain_item':['wheat'], 'bread':['bread'], 'door':['door_wood'], 'bucket':['bucket_empty'],
 'water_bucket':['bucket_water'], 'raw_fish':['fish_raw','fish_salmon_raw'], 'cooked_fish':['fish_cooked','fish_salmon_cooked'],
 'ashfruit':['apple'], 'berry_pie':['pumpkin_pie'], 'bow':['bow_standby'], 'arrow':['arrow'],
 'fishing_line':['fishing_rod_uncast'], 'glowcap_stew':['mushroom_stew'],
}
tier = {'wood':'wood','stone':'stone','copper':'copper','iron':'iron','azure':'diamond','ember':'netherite'}
kind = {'pick':'pickaxe','axe':'axe','spade':'shovel','blade':'sword'}
for t,bt in tier.items():
    for k,bk in kind.items(): items[f'{t}_{k}'] = [f'{bt}_{bk}']
items['wood_tiller'] = ['wood_hoe']; items['stone_tiller'] = ['stone_hoe']
for t,bt in {'copper':'copper','iron':'iron','azure':'diamond','ember':'netherite'}.items():
    for k,bk in {'helm':'helmet','vest':'chestplate','greaves':'leggings','boots':'boots'}.items(): items[f'{t}_{k}'] = [f'{bt}_{bk}']
for src, dsts in items.items():
    img = I(src)
    for d in dsts: save(img, 'items/' + d)
# Hoes for higher tiers reuse the stone tiller recoloured by tier is not in-game; use the tiller art.
for bt in ('copper','iron','diamond','netherite'): save(I('stone_tiller'), f'items/{bt}_hoe')

# Block items that ZperCraft draws flat.
for src, d in [('torch','torch_on'),('ladder','ladder'),('ash_sapling','sapling_oak'),('pine_sapling','sapling_spruce')]: pass

Image.open(icon_src).convert('RGBA').resize((256,256), Image.LANCZOS).save(f'{out}/pack_icon.png')
manifest = {
 "format_version": 2,
 "header": {"name": "ZperCraft Texturas", "description": "Las texturas originales de ZperCraft para Minecraft Bedrock",
            "uuid": "e4f80794-ee59-4760-baad-692c74ed30a0", "version": [1,0,0], "min_engine_version": [1,20,0]},
 "modules": [{"type": "resources", "uuid": "086b1e19-cfb0-4368-bd88-e417633bbf1b", "version": [1,0,0]}]
}
json.dump(manifest, open(f'{out}/manifest.json','w'), indent=2, ensure_ascii=False)
print(len(written), 'textures')
