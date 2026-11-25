const { chromium } = require('playwright'); const fs = require('fs'); const path=require('path');
(async () => {
  const sp = process.argv[2]; const b = await chromium.launch(); const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.setContent('<html><body></body></html>');
  await p.addScriptTag({ path: path.join(sp,'export.js') });
  const out = await p.evaluate(() => window.__OUT);
  for (const k of ['tiles','items']) { const d = path.join(sp,'raw',k); fs.mkdirSync(d,{recursive:true});
    for (const [n,u] of Object.entries(out[k])) fs.writeFileSync(path.join(d,n+'.png'), Buffer.from(u.split(',')[1],'base64')); }
  console.log(Object.keys(out.tiles).length, Object.keys(out.items).length); await b.close();
})();
