import { tile, TILE_NAMES } from './world/Blocks';
for (let s = 0; s < 8; s++) tile('grain' + s);
import { buildAtlas, painters, P, ore } from './gfx/Atlas';
import { ITEMS, itemCanvas, setTileCanvasSource } from './game/Items';
type C=[number,number,number,number?];
const deep: Record<string,[C,C,number]> = {
  coal_ore:[[38,36,42],[90,90,100],6], copper_ore:[[214,120,64],[96,210,180],5], iron_ore:[[210,172,150],[246,228,214],5],
  sunstone_ore:[[252,196,48],[255,246,170],5], azurite_ore:[[40,92,220],[150,210,255],4], glowshard_ore:[[80,240,220],[220,255,250],6],
  frostquartz_ore:[[170,230,250],[250,255,255],5], rubellite_ore:[[220,40,80],[255,160,180],4] };
for (const [k,[g,h,n]] of Object.entries(deep)) (painters as any)['deep_'+k] = (p:any)=>ore(p, ()=>painters.deepstone(p), g, h, n);
const extra = Object.keys(deep).map(k=>'deep_'+k);
for (const k of Object.keys(painters)) if (!k.startsWith('deep_')) tile(k);
const a = buildAtlas();
setTileCanvasSource(a.tileCanvas);
const tiles: Record<string,string> = {};
TILE_NAMES.forEach((n, i) => tiles[n] = a.tileCanvas(i).toDataURL());
for (const n of extra) { const p = new (P as any)(n); (painters as any)[n](p); const c=document.createElement('canvas'); c.width=c.height=16; c.getContext('2d')!.putImageData(new ImageData(p.d,16,16),0,0); tiles[n]=c.toDataURL(); }
const items: Record<string,string> = {};
for (const d of ITEMS) if (d && d.id >= 256) items[d.key] = itemCanvas(d.id).toDataURL();
(window as any).__OUT = { tiles, items };
