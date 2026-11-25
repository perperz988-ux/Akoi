// Captures a 6-face cube panorama of a ZperCraft world (menu fly-over world) at fov 90.
const { chromium } = require('playwright'); const path = require('path');
(async () => {
  const [html, outDir, frac, size] = [process.argv[2], process.argv[3], parseFloat(process.argv[4] || '0.3'), parseInt(process.argv[5] || '1024')];
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('file://' + path.resolve(html));
  await p.waitForFunction(() => window.akoi && window.akoi.menuWorld, null, { timeout: 120000 });
  await p.addStyleTag({ content: '#ui, #rotate { display:none !important }' });
  await p.waitForTimeout(5000);
  await p.evaluate((frac) => {
    const g = window.akoi, cam = g.camera, w = g.menuWorld;
    const sp = w._spawn || { x: 0, y: 70, z: 0 };
    window.__face = 0; window.__frac = frac;
    const P0 = { x: sp.x, y: Math.max(sp.y + 24, 84), z: sp.z };
    const orig = g.renderer.render.bind(g.renderer);
    const rots = [[0, 0], [0, -Math.PI / 2], [0, Math.PI], [0, Math.PI / 2], [Math.PI / 2, 0], [-Math.PI / 2, 0]];
    g.renderer.render = (scene, c) => {
      if (c === cam) {
        cam.position.set(P0.x, P0.y, P0.z);
        cam.rotation.order = 'YXZ';
        const [rx, ry] = rots[window.__face]; cam.rotation.set(rx, ry, 0);
        cam.fov = 90; cam.aspect = 1; cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
        g.sky.update(0, window.__frac, 0, cam, Math.max(64, w.renderRadius * 16), false, 0);
        w.update(0, P0.x, P0.z); w.updateVisibility(cam);
      }
      return orig(scene, c);
    };
  }, frac);
  await p.waitForTimeout(45000); // let chunks generate around the capture point
  for (let f = 0; f < 6; f++) {
    await p.evaluate((f) => { window.__face = f; }, f);
    await p.waitForTimeout(6000);
    await p.locator('#game').screenshot({ path: path.join(outDir, `panorama_${f}.png`) });
    console.log('face', f);
  }
  await b.close();
})();
