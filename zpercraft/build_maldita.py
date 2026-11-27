import sys
s=open('zpercraft-original.html',encoding='utf-8').read()
js=open('maldito.js',encoding='utf-8').read()
def rep(a,b,count=1):
    global s
    n=s.count(a)
    assert n>=1, a
    s=s.replace(a,b) if count==0 else s.replace(a,b,count)
rep('window.akoiIds={I:k,B:x}','window.akoiIds={I:k,B:x,M:Al,T:te,D:di,N:oe}')
rep('<title>ZperCraft</title>','<title>ZperCraft Maldita</title>')
rep('<meta name="theme-color" content="#0b1320" />','<meta name="theme-color" content="#0a0000" />')
rep('<div class="logo">Zper<span class="c2">Craft</span></div><div class="tagline">Shape the wild lands</div>',
    '<div class="logo">Zper<span class="c2">Craft</span></div><div class="maldita">EDICIÓN MALDITA</div><div class="tagline">No estás solo</div>')
rep('<div class="logo" style="font-size:48px">Zper<span class="c2">Craft</span></div>',
    '<div class="logo" style="font-size:48px">Zper<span class="c2">Craft</span></div><div class="maldita">EDICIÓN MALDITA</div>')
rep('<h1>FALLEN</h1>','<h1>TE ATRAPÓ</h1>')
s=s.replace('ZperCraft v0.1 · original voxel sandbox','ZperCraft v0.1 · EDICIÓN MALDITA · caos activado')
s=s.replace('ZperCraft v0.1 · sandbox de bloques original','ZperCraft v0.1 · EDICIÓN MALDITA · caos activado')
s=s.replace('Turn your device sideways to play','Gira el dispositivo… si te atreves')
theme='''<style id="maldita-theme">
:root{--bg:#0a0303;--panel:rgba(22,6,6,.94);--panel2:rgba(36,10,10,.96);--line:rgba(220,60,50,.25);--ink:#f3e4e2;--dim:#b08d89;--teal:#c9302a;--teal2:#8a1a16;--amber:#ff3b2f;--amber2:#a3140d;--red:#ff2a1f}
.menu{background:linear-gradient(90deg,#120000ee,#1a00008c 42%,#0000 70%)!important}
.logo{color:#f1e6e4!important;text-shadow:0 2px 0 #7a0c07,0 4px 0 #520703,0 6px 0 #2a0302,0 10px 24px #ff000055!important;animation:mldFlick 4s infinite}
.logo .c2{color:#ff2a1f!important;text-shadow:2px 0 #00e5ff,-2px 0 #ff00c8,0 6px 0 #2a0302!important}
.logo .dot{color:#ff2a1f!important}
.maldita{font-weight:900;letter-spacing:.42em;font-size:13px;color:#ff2a1f;margin:8px 0 0 4px;text-shadow:0 0 12px #ff000099;animation:mldGl .3s steps(2) infinite}
.tagline{color:#d9a19b!important}
.mbtn.primary{background:linear-gradient(135deg,#ff3b2f,#7a0c07)!important;color:#fff1ef!important}
.mbtn .gem{background:#ff2a1f!important;box-shadow:0 0 12px #ff2a1f!important}
.death{background:#200000d9!important}
.death h1{color:#ff2a1f;text-shadow:3px 0 #00e5ff,-3px 0 #ff00c8,0 4px 0 #2a0302!important;animation:mldGl .2s steps(2) infinite}
.loading{background:radial-gradient(ellipse at center,#3a0505,#070000 75%)!important}
.loading .pb b{background:linear-gradient(90deg,#7a0c07,#ff2a1f)!important}
.world .thumb{background:linear-gradient(160deg,#5a0a08 0 40%,#2a2a2a 40% 62%,#3a1410 62%)!important}
</style>
'''
rep('</head>', theme+'<script type="module">\n'+js+'\n</script>\n</head>')
open('zpercraft-maldita.html','w',encoding='utf-8').write(s)
print(len(s))
