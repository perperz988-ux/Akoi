"""Re-skin every Bedrock entity texture (mobs, animals, players...) in ZperCraft's mob style.

ZperCraft mobs (voxel/src/game/Models.ts) are flat-coloured boxes with face shading and glowing eyes,
so every texture is flattened to a few solid colours (k-means, no noise). Mobs that have a ZperCraft
counterpart are also repainted with that mob's palette (luminance-ranked palette transfer).

usage: python3 -I mobs.py <vanilla textures dir> <out pack dir>
"""
import os, sys
import numpy as np
from PIL import Image

VAN, OUT = sys.argv[1], sys.argv[2]
SKIP_SUFFIX = ('_mer', '_mers', '_normal', '_heightmap')
SKIP_DIRS = ('entity/chest', 'entity/bed')   # already done with the block textures

def rgb(c): return [v * 255 for v in c]
def hexc(h): return [(h >> 16) & 255, (h >> 8) & 255, h & 255]
# ZperCraft mob palettes, straight from Models.ts (+ the glow colour used for eyes / small details)
PAL = {
 'gloomling':   ([rgb([0.2, 0.14, 0.28]), rgb([0.32, 0.22, 0.42]), rgb([0.62, 0.58, 0.66])], hexc(0xd6ff5a)),
 'crawler':     ([rgb([0.24, 0.22, 0.24]), rgb([0.32, 0.3, 0.3]), rgb([0.42, 0.4, 0.4])], hexc(0xff4a30)),
 'mossback':    ([rgb([0.46, 0.34, 0.22]), rgb([0.36, 0.62, 0.3]), rgb([0.56, 0.6, 0.38]), rgb([0.82, 0.74, 0.54])], None),
 'hopkin':      ([rgb([0.62, 0.45, 0.3]), rgb([0.95, 0.66, 0.66]), rgb([0.93, 0.87, 0.74])], None),
 'glimmerwing': ([rgb([0.2, 0.18, 0.28]), hexc(0xc48bff), hexc(0x6ff0e0)], hexc(0xfff6c0)),
 'stingwisp':   ([rgb([0.12, 0.1, 0.1]), rgb([0.95, 0.78, 0.2])], hexc(0xff3a3a)),
 'cloudray':    ([rgb([0.62, 0.7, 0.95]), rgb([0.78, 0.84, 0.98]), rgb([0.96, 0.97, 1.0])], hexc(0xbfe8ff)),
 'cinderhound': ([rgb([0.22, 0.18, 0.18]), rgb([0.35, 0.28, 0.26])], hexc(0xff6a20)),
 'avatar':      ([rgb([0.26, 0.24, 0.3]), rgb([0.36, 0.24, 0.16]), rgb([0.16, 0.42, 0.46]), rgb([0.86, 0.68, 0.52]), rgb([0.92, 0.62, 0.22])], None),
}
# vanilla texture path prefix -> ZperCraft mob
MAP = [
 ('entity/zombie/zombie', 'gloomling'), ('entity/zombie/husk', 'gloomling'), ('entity/zombie/drowned', 'gloomling'),
 ('entity/spider/', 'crawler'),
 ('entity/cow/', 'mossback'), ('entity/turtle/', 'mossback'),
 ('entity/rabbit/', 'hopkin'),
 ('entity/bat', 'glimmerwing'),
 ('entity/bee/', 'stingwisp'),
 ('entity/phantom', 'cloudray'),
 ('entity/hoglin/', 'cinderhound'),
 ('entity/steve', 'avatar'), ('entity/alex', 'avatar'),
]
def mob_for(rel):
    for pre, m in MAP:
        if rel.startswith(pre): return m
    return None

def kmeans(px, k, it=10):
    rng = np.random.default_rng(0)
    uniq = np.unique(px, axis=0)
    k = min(k, len(uniq))
    cent = uniq[rng.choice(len(uniq), k, replace=False)].astype(np.float32)
    for _ in range(it):
        lab = np.empty(len(px), np.int64)
        for s in range(0, len(px), 65536):   # chunked to keep memory low on big textures
            lab[s:s + 65536] = ((px[s:s + 65536, None, :] - cent[None]) ** 2).sum(-1).argmin(1)
        for j in range(k):
            m = px[lab == j]
            if len(m): cent[j] = m.mean(0)
    return cent, lab

LW = np.array([.299, .587, .114], np.float32)
def saturate(c, k):
    L = (c @ LW)[..., None]
    return L + (c - L) * k

def reskin(im, rel):
    a = np.asarray(im.convert('RGBA')).astype(np.float32).copy()
    m = a[..., 3] > 0
    px = a[m][:, :3]
    if len(px) < 4: return Image.fromarray(a.astype(np.uint8), 'RGBA')
    n_uniq = len(np.unique(px.astype(np.uint8), axis=0))
    k = int(min(8, max(2, n_uniq // 4)))
    cent, lab = kmeans(px, k)
    mob = mob_for(rel)
    if mob:
        pal, glow = PAL[mob]
        # palette ramp with ZperCraft's own face shading factors (top 1, sides .88/.78, bottom .55)
        ramp = sorted([[c[0] * f, c[1] * f, c[2] * f] for c in pal for f in (1, .88, .78, .55)], key=lambda c: c[0] * .299 + c[1] * .587 + c[2] * .114)
        ramp = np.array(ramp, np.float32)
        counts = np.bincount(lab, minlength=len(cent))
        order = np.argsort(cent @ LW)
        new = np.zeros_like(cent)
        for rank, j in enumerate(order):
            new[j] = ramp[int(round(rank / max(1, len(order) - 1) * (len(ramp) - 1)))]
        if glow is not None:   # the rarest cluster that stands out = eyes / small details -> ZperCraft glow
            sat = cent.max(1) - cent.min(1)
            score = np.where(counts < .06 * counts.sum(), sat + np.abs(cent @ LW - (cent @ LW).mean()), -1)
            if score.max() > 0: new[int(score.argmax())] = glow
        # keep a quarter of the vanilla shading so features stay readable
        col = new[lab] + (px - cent[lab]) * .25
    else:
        col = saturate(cent, 1.15)[lab]
        col = col + np.where((col @ LW)[:, None] < 90, np.array([-3, -1, 6], np.float32), np.array([4, 2, -2], np.float32))
    a[m, :3] = np.clip(col, 0, 255)
    if mob == 'gloomling' and a.shape[1] == 64:
        # humanoid skin layout: the eyes are the darkest pixels of the face row -> Gloomling's lime glow
        face = a[11:14, 8:16, :3] @ LW
        for idx in np.argsort(face, axis=None)[:4]:
            y, x = np.unravel_index(idx, face.shape); a[11 + y, 8 + x, :3] = PAL['gloomling'][1]
    return Image.fromarray(a.astype(np.uint8), 'RGBA')

done = 0; mapped = 0
for root in ('entity',):
    for dp, _, fs in os.walk(f'{VAN}/{root}'):
        for f in fs:
            stem, ext = os.path.splitext(f)
            if ext not in ('.png', '.tga') or stem.endswith(SKIP_SUFFIX): continue
            rel = os.path.relpath(os.path.join(dp, stem), VAN)
            if rel.startswith(SKIP_DIRS): continue
            try: im = Image.open(os.path.join(dp, f))
            except Exception: continue
            res = reskin(im, rel)
            dst = f'{OUT}/textures/{rel}{ext}'; os.makedirs(os.path.dirname(dst), exist_ok=True)
            res.save(dst, **({'compression': None} if ext == '.tga' else {}))
            done += 1; mapped += mob_for(rel) is not None
print(done, 'entity textures re-skinned,', mapped, 'with ZperCraft mob palettes')
