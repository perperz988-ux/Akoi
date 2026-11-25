"""Install ZperCraft menu assets into a pack: themed UI, title logo, panorama (PNG + Radiance HDR).
usage: python3 -I menu_assets.py <pack dir> <themed ui textures dir> <title.png> <panorama dir> <zpercraft raw dir>"""
import os, sys, shutil
import numpy as np
from PIL import Image
PACK, THEMED, TITLE, PANO, RAW = sys.argv[1:6]
T = f'{PACK}/textures'
shutil.copytree(THEMED, T, dirs_exist_ok=True)
shutil.copy(TITLE, f'{T}/ui/title.png')

def write_hdr(img, path):
    a = np.asarray(img.convert('RGB')).astype(np.float32) / 255
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    m = lin.max(-1)
    e = np.where(m > 1e-32, np.ceil(np.log2(np.maximum(m, 1e-32))), 0)
    scale = np.where(m > 1e-32, 256.0 / np.exp2(e), 0)
    rgbe = np.zeros(a.shape[:2] + (4,), np.uint8)
    for c in range(3): rgbe[..., c] = np.clip(lin[..., c] * scale, 0, 255).astype(np.uint8)
    rgbe[..., 3] = np.where(m > 1e-32, e + 128, 0).astype(np.uint8)
    h, w = a.shape[:2]
    with open(path, 'wb') as f:
        f.write(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n' + f'-Y {h} +X {w}\n'.encode())
        for y in range(h):
            f.write(bytes([2, 2, w >> 8, w & 255]))
            for c in range(4): f.write(rle(rgbe[y, :, c]))

def rle(ch):
    """Radiance new-style run-length encoding of one channel of one scanline."""
    ch = ch.tolist(); n = len(ch); out = bytearray(); i = 0
    while i < n:
        j = i  # find next run of >= 4 equal bytes
        while j < n:
            k = j
            while k < n and k - j < 127 and ch[k] == ch[j]: k += 1
            if k - j >= 4: break
            j += 1
        while i < j:  # literal chunk before the run
            m = min(128, j - i); out.append(m); out.extend(ch[i:i + m]); i += m
        if j < n:
            out.append(128 + (k - j)); out.append(ch[j]); i = k
    return bytes(out)

for i in range(6):
    im = Image.open(f'{PANO}/panorama_{i}.png').convert('RGB')
    for name in (f'panorama_{i}', f'panorama_alternate_{i}'): im.save(f'{T}/ui/{name}.png')
    for name in (f'panoramahdr_{i}', f'panoramahdr_alternate_{i}'): write_hdr(im, f'{T}/ui/{name}.hdr')

# old-style options background (vanilla: darkened dirt) -> darkened ZperCraft deepstone
d = np.asarray(Image.open(f'{RAW}/tiles/deepstone.png').convert('RGBA')).astype(np.float32)
d[..., :3] *= 0.55
Image.fromarray(d.astype(np.uint8), 'RGBA').save(f'{T}/ui/background.png')
print('menu assets installed in', PACK)
