// Renders ZperCraft's own title logo (same CSS as voxel/src/ui/style.css .logo) to a transparent PNG.
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 700, height: 200 }, deviceScaleFactor: 4 });
  await p.setContent(`<html><body style="margin:0;background:transparent">
  <div id="l" style="display:inline-block;padding:6px 14px 22px 10px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-weight:900;font-size:78px;letter-spacing:0.04em;white-space:nowrap;line-height:0.9;color:#f6efe1;
  text-shadow:0 2px 0 #d27f1d,0 4px 0 #a45f12,0 6px 0 #7a440b,0 10px 18px rgba(0,0,0,0.55)">Zper<span style="color:#f2a93b;text-shadow:0 2px 0 #a45f12,0 4px 0 #7a440b,0 6px 0 #4f2c07,0 10px 18px rgba(0,0,0,0.55)">Craft</span></div></body></html>`);
  await p.locator('#l').screenshot({ path: out, omitBackground: true });
  await b.close();
})();
