"""Local-only reference preparation. No proprietary files enter public/ or git.
Run with python3; Blender conversion is a separate --python call.
"""
from pathlib import Path
import json, shutil, hashlib, wave, array, math
OUT=Path('/private/tmp/manzizak-fidget-reference-assets')
NATIVE=Path('/Applications/Wakppu.app/Wrapper/Wakppu.app')
WAX=Path('/Applications/app.app/Wrapper/app.app/assets/assets/sounds/wax')
OUT.mkdir(exist_ok=True); (OUT/'audio').mkdir(exist_ok=True)
manifest={'usage':'local development only; source app redistribution rights unverified','toys':{},'files':[]}
def group(root,pattern):
 return sorted(root.glob(pattern))[:4]
def add_audio(paths):
 names=[]
 for p in paths:
  name=p.name
  dest=OUT/'audio'/name
  # preserve original bytes; normalization/short fades happen on decoded browser buffers
  shutil.copy2(p,dest)
  if name not in {x['file'] for x in manifest['files']}:
   manifest['files'].append({'file':name,'source':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size})
  names.append('audio/'+name)
 return names
configs={
 'S01':('','mallang_squish_*.wav','mallang_squish_*.wav'),
 'S02':('bread','squish_butter_mallang_*.wav','squish_bread_mallang_*.wav'),
 'S03':('peachmochi','squish_peach_mallang_*.wav','squish_tangerine_mallang_*.wav'),
 'L01':('cheese','squish_cheese_mallang_*.wav','slime_squish_*.wav'),
 'L02':('mango','squish_mango_mallang_*.wav','honey_slime_squish_*.wav'),
 'L03':('','squish_sherbet_slangi_mallang_*.wav','slime_squish_*.wav'),
}
for id,(model,press,stretch) in configs.items():
 manifest['toys'][id]={'model':f'models/{model}.glb' if model else None,'press':add_audio(group(NATIVE,press)),'compress':add_audio(group(NATIVE,press)),'stretch':add_audio(group(NATIVE,stretch)),'fold':add_audio(group(NATIVE,stretch))}
for id,stem in [('W01','greenapple'),('W02','mintchoco'),('C01','soapcrunchslangi'),('C02','puddingcrunchslangi')]:
 first=add_audio(group(WAX,f'wax_{stem}_first_*.wav')); br=add_audio(group(WAX,f'wax_{stem}_break_*.wav')); knead=add_audio(group(WAX,'slime_*.wav'))
 manifest['toys'][id]={'model':None,'press':first,'crack':br,'compress':knead,'knead':knead,'crunch':br if id=='C01' else first,'fold':knead}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps({'files':len(manifest['files']),'bytes':sum(x['bytes'] for x in manifest['files']),'folder':str(OUT)}))
