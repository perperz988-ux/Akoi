import sys, os, random
from PIL import Image
root, kind, out, n, seed = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
fs=[]
for dp,_,f in os.walk(f'{root}/textures/{kind}'):
    fs += [os.path.join(dp,x) for x in f if x.endswith(('.png','.tga'))]
random.Random(seed).shuffle(fs); fs=sorted(fs[:n])
S=36; cols=20; rows=(len(fs)+cols-1)//cols
sh=Image.new('RGBA',(cols*S,rows*S),(48,48,58,255))
for i,f in enumerate(fs):
    im=Image.open(f).convert('RGBA'); w=im.size[0]; im=im.crop((0,0,w,w)).resize((32,32),Image.NEAREST)
    sh.alpha_composite(im,((i%cols)*S+2,(i//cols)*S+2))
sh.save(out)
