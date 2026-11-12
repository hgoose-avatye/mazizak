"""Local-only cue extraction from the user-supplied reference. No public asset output."""
import argparse,hashlib,json,subprocess
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('--ffmpeg',required=True);ap.add_argument('--audio',required=True);ap.add_argument('--output',default='/private/tmp/manzizak-fidget-reference-assets');args=ap.parse_args()
out=Path(args.output);(out/'audio').mkdir(parents=True,exist_ok=True)
# Half-second contact sheets establish these visual action windows; the audio is
# the original soundtrack, NOT certified speech/BGM-free or an isolated recording.
windows={'compress':[(20,21),(23,24)],'stretch':[(24.3,25),(25.8,26.5),(28.3,29)],'fold':[(21,22),(27.8,28.4)]}
entry={'model':None,'referenceVideo':'https://www.youtube.com/shorts/7WDcH26JU5Q','referenceRange':'20–29s, visually aligned soundtrack cues; acoustic purity and rights unverified'};files=[]
for role,spans in windows.items():
 entry[role]=[]
 for i,(start,end) in enumerate(spans):
  name=f'cheese_reference_{role}_{i}.wav';p=out/'audio'/name
  subprocess.run([args.ffmpeg,'-v','error','-ss',str(start),'-i',args.audio,'-t',str(end-start),'-ac','1','-ar','48000','-c:a','pcm_s16le','-y',str(p)],check=True)
  entry[role].append('audio/'+name);files.append({'file':name,'source':entry['referenceVideo'],'sourceRangeSeconds':[start,end],'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size,'rights':'unverified; local reference only'})
manifest=json.loads((out/'manifest.json').read_text());manifest['toys']['L01']=entry;names={f['file'] for f in files};manifest['files']=[f for f in manifest['files'] if f['file'] not in names]+files
(out/'manifest.json').write_text(json.dumps(manifest,indent=2));(out/'cheese-cues.json').write_text(json.dumps({'entry':entry,'files':files},indent=2))
print('Prepared',len(files),'local-only action windows')
