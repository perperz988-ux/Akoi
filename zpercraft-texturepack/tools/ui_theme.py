"""Recolour Bedrock's UI textures to ZperCraft's menu palette (voxel/src/ui/style.css).
Greys -> navy/teal slate ramp (luminance kept so text stays readable), greens -> ZperCraft amber.
usage: python3 -I ui_theme.py <vanilla textures dir> <out textures dir>"""
import os, sys, colorsys
import numpy as np
from PIL import Image
VAN, OUT = sys.argv[1], sys.argv[2]
# luminance ramp: --bg #0b1320, --panel2 #182638, slate #3a5568, --dim #93a8b3, --ink #e9f1f2
RAMP = np.array([[0, 6, 10, 18], [30, 14, 24, 38], [70, 36, 58, 82], [120, 70, 104, 122], [170, 120, 156, 168], [215, 176, 200, 206], [255, 240, 247, 248]], dtype=np.float32)
AMBER = (0.105, 0.76)   # hue / saturation of #f2a93b
TEAL = (0.48, 0.65)     # #3fb7a8
SKIP = ('panorama', 'title', 'mpp_', 'realms_', 'csb', 'Demo', 'promo', 'store_', 'marketplace', 'flag', 'skin', 'achievement')

def ramp(L):
    out = np.zeros(L.shape + (3,), np.float32)
    for c in range(3): out[..., c] = np.interp(L, RAMP[:, 0], RAMP[:, c + 1])
    return out

def theme(a):
    rgb = a[..., :3] / 255.0
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    L = (a[..., :3] @ np.array([.299, .587, .114], np.float32))
    out = a.copy()
    grey = sat < 0.18
    out[..., :3] = np.where(grey[..., None], ramp(L), out[..., :3])
    # hue-based swaps for coloured UI parts
    flat = rgb.reshape(-1, 3)
    hsv = np.array([colorsys.rgb_to_hsv(*c) for c in flat]).reshape(rgb.shape)
    h = hsv[..., 0]
    green = (~grey) & (h > 0.2) & (h < 0.45)
    if green.any():
        v = hsv[..., 2] * 1.05
        new = np.array([colorsys.hsv_to_rgb(AMBER[0], min(1, s * 0 + AMBER[1]), min(1, vv)) for s, vv in zip(hsv[..., 1][green], v[green])]) * 255
        out[green, :3] = new
    blue = (~grey) & (h > 0.5) & (h < 0.7)   # Bedrock's blue highlight -> ZperCraft teal
    if blue.any():
        new = np.array([colorsys.hsv_to_rgb(TEAL[0], TEAL[1], vv) for vv in hsv[..., 2][blue]]) * 255
        out[blue, :3] = new
    return out

n = 0
for root in ('ui', 'gui'):
    for dp, _, fs in os.walk(f'{VAN}/{root}'):
        for f in fs:
            if not f.endswith('.png') or any(s in f for s in SKIP): continue
            src = os.path.join(dp, f)
            try: im = Image.open(src)
            except Exception: continue
            if im.mode not in ('RGBA', 'RGB', 'LA', 'L', 'P'): continue
            had_alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
            a = np.asarray(im.convert('RGBA')).astype(np.float32)
            if a.size > 4096 * 4096 * 4: continue
            res = Image.fromarray(np.clip(theme(a), 0, 255).astype(np.uint8), 'RGBA')
            dst = os.path.join(OUT, os.path.relpath(src, VAN)); os.makedirs(os.path.dirname(dst), exist_ok=True)
            (res if had_alpha else res.convert('RGB')).save(dst); n += 1
print(n, 'ui textures themed')
