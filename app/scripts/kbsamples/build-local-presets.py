# Local development only. See docs/research/keyboard-six-2026-11-11/local-playable/REPORT.md.
from pathlib import Path
import subprocess,wave,struct,math,json,hashlib,os,shutil
ff=os.environ.get('FFMPEG') or shutil.which('ffmpeg')
if not ff: raise SystemExit('Set FFMPEG to the FFmpeg executable path.')
root=Path(os.environ.get('MANZIZAK_LOCAL_AUDIO_DIR','/private/tmp/manzizak-local-presets'));root.mkdir(exist_ok=True)
refs=Path(os.environ.get('MANZIZAK_REFERENCE_AUDIO_DIR','/private/tmp/manzizak-six-research/reference-only'))
sr=48000

def decode(p):
 data=subprocess.check_output([ff,'-v','error','-i',str(p),'-ac','1','-ar',str(sr),'-f','s16le','-'])
 return [v[0]/32768 for v in struct.iter_unpack('<h',data)]

def write(id,clips,origin,gain=1):
 samples=[];entries={'down':[],'up':[],'spaceDown':[],'spaceUp':[]}
 for role,x,provenance in clips:
  start=len(samples);x=[v*gain for v in x];peak=max(map(abs,x))
  if peak>.85:x=[v*.85/peak for v in x]
  # Short boundary fades only; no pitch changes, substitution or synthetic release.
  for i in range(min(48,len(x)//2)):x[i]*=i/48;x[-1-i]*=i/48
  samples.extend(x);entries.setdefault(role,[]).append({'offset':start/sr,'duration':len(x)/sr,'gain':1,'src':provenance if isinstance(provenance,str) else ('youtube:'+provenance['video'] if 'video' in provenance else 'mechvibes:'+provenance['pack']),'sourceDetail':provenance});samples.extend([0]*480)
 with wave.open(str(root/(id+'.wav')),'wb') as w:
  w.setparams((1,2,sr,0,'NONE','not compressed'));w.writeframes(b''.join(struct.pack('<h',max(-32768,min(32767,round(v*32767)))) for v in samples))
 meta={'version':1,'preset':id,'file':id+'.wav','sampleRate':sr,'upMode':'none','entries':entries,'usage':'LOCAL_DEVELOPMENT_ONLY_NOT_FOR_PUBLIC_DISTRIBUTION','rights':'unverified','source':origin,'processing':{'monoHz':sr,'playbackCompensationGain':gain,'boundaryFadeMs':1,'note':'Complete transient clusters on down; no independent recorded keyup claimed. Source key identity unverified.'}}
 (root/(id+'.json')).write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
 return meta

for id,kid,count,boost in [('oil-king','K05',7,10),('boba-u4t','K07',17,1),('silent-peach-v3','K09',14,10)]:
 clips=[('down',decode(refs/f'thockhub/{kid}/{i}.ogg'),f'thockhub/{kid}/{i}.ogg') for i in range(count)]
 write(id,clips,{'referenceManifest':'docs/research/keyboard-six-2026-11-11/download-manifest.json','modelId':kid},boost);print(id,count,'clips')
p=refs/'mechvibes/K08-mv-37918613073f4a61b78bce2801940f0f';c=json.loads((p/'config.json').read_text());x=decode(p/'concatenated_audio.wav');clips=[]
for role,key in [('down','KeyQ'),('down','KeyA'),('down','KeyE'),('spaceDown','Space'),('enterDown','Enter'),('backspaceDown','Backspace')]:
 lo,hi=c['definitions'][key]['timing'][0];clips.append((role,x[round(lo/1000*sr):round(hi/1000*sr)],{'pack':'mv-37918613073f4a61b78bce2801940f0f','mappedKey':key,'timingMs':[lo,hi]}))
write('box-jade',clips,{'pack':'https://mechvibes.com/sound-packs/kailh-box-jade','license':'Personal use only'});print('box-jade',len(clips),'clips')
