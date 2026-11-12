"""Conservative local-only cleanup of Oil King/Boba sprites; preserves original recordings.
Usage: python3 clean-local-keyboard-noise.py --input DIR --output NEW_DIR
No pitch shift, equalization, synthetic sound or loudness boost is applied.
"""
from pathlib import Path
import argparse, array, hashlib, json, math, statistics, sys, wave

def read_wav(path):
    with wave.open(str(path)) as w:
        if w.getnchannels()!=1 or w.getsampwidth()!=2: raise ValueError('Expected mono PCM16')
        sr=w.getframerate(); data=array.array('h',w.readframes(w.getnframes()))
        if sys.byteorder!='little': data.byteswap()
        return [v/32768 for v in data],sr

def clean_clip(x,sr):
    if len(x)<round(sr*.008):return x,{'skipped':'Too short for reliable noise estimation'}
    hop=max(1,round(sr*.001))
    rms=[math.sqrt(sum(v*v for v in x[i:i+hop])/len(x[i:i+hop])) for i in range(0,len(x),hop)]
    peak=max(rms);peak_frame=rms.index(peak)
    # Use a robust pre-impact bed, excluding boundary fade and the attack itself.
    pre=rms[2:max(3,peak_frame-5)]
    floor=statistics.median(pre) if pre else statistics.median(sorted(rms)[:max(1,len(rms)//4)])
    floor=max(1/32768,min(floor,peak*.08))
    threshold=max(floor*3.5,peak*.035)
    active=[i for i,v in enumerate(rms) if v>=threshold]
    if not active:return x,{'skipped':'No reliable impact above noise floor'}
    first=active[0];last=active[-1]
    lo=max(0,(first-3)*hop)
    # Keep at least 55 ms after attack and 24 ms beyond the last meaningful transient.
    hi=min(len(x),max((last+25)*hop,lo+round(sr*.058)))
    # A soft downward expansion only outside 20 ms protection around each strong event.
    protected=[False]*len(rms)
    for f in active:
        for j in range(max(0,f-2),min(len(rms),f+21)):protected[j]=True
    targets=[]
    for i,v in enumerate(rms):
        if protected[i]:targets.append(1.0)
        else:
            t=max(0,min(1,(v/floor-1.3)/2.2))
            targets.append(10**((-18*(1-t*t*(3-2*t)))/20))
    gains=[];g=targets[max(0,lo//hop)]
    attack=1-math.exp(-1/(sr*.0005));release=1-math.exp(-1/(sr*.006))
    for i in range(lo,hi):
        target=targets[min(len(targets)-1,i//hop)]
        g+=(target-g)*(attack if target>g else release);gains.append(g)
    out=[];fade_in=round(sr*.0015);fade_out=round(sr*.012)
    for j,i in enumerate(range(lo,hi)):
        fade=min(1,j/max(1,fade_in),(hi-lo-1-j)/max(1,fade_out))
        out.append(x[i]*gains[j]*max(0,fade))
    p0=max(map(abs,x));p1=max(map(abs,out))
    return out,{'inputMs':round(len(x)/sr*1000,2),'outputMs':round(len(out)/sr*1000,2),'trimStartMs':round(lo/sr*1000,2),'trimEndMs':round((len(x)-hi)/sr*1000,2),'estimatedNoiseRmsDbfs':round(20*math.log10(floor),2),'maxNoiseAttenuationDb':18,'peakChangeDb':round(20*math.log10(max(p1,1e-12)/max(p0,1e-12)),3)}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--input',required=True);ap.add_argument('--output',required=True);args=ap.parse_args()
    root=Path(args.input).resolve();out=Path(args.output).resolve()
    if root==out:raise SystemExit('Use a separate output directory; preserve inputs.')
    out.mkdir(parents=True,exist_ok=True);report={}
    for preset in ['oil-king','boba-u4t']:
        wav=root/(preset+'.wav');meta=json.loads((root/(preset+'.json')).read_text());x,sr=read_wav(wav);samples=[];details=[]
        for role,entries in meta['entries'].items():
            updated=[]
            for entry in entries:
                lo=round(entry['offset']*sr);hi=lo+round(entry['duration']*sr)
                cleaned,stats=clean_clip(x[lo:hi],sr);details.append({'role':role,'source':entry.get('src'),**stats})
                updated.append({**entry,'offset':len(samples)/sr,'duration':len(cleaned)/sr});samples.extend(cleaned);samples.extend([0]*round(sr*.01))
            meta['entries'][role]=updated
        pcm=array.array('h',(max(-32768,min(32767,round(v*32768))) for v in samples))
        if sys.byteorder!='little':pcm.byteswap()
        with wave.open(str(out/(preset+'.wav')),'wb') as w:w.setparams((1,2,sr,0,'NONE','not compressed'));w.writeframes(pcm.tobytes())
        info={'method':'Robust pre-impact noise estimate; conservative impact-preserving trim; up-to-18dB soft expansion outside protected transients; 1.5ms/12ms boundary fades. No pitch/EQ/level boost.','inputSha256':hashlib.sha256(wav.read_bytes()).hexdigest(),'originalFile':str(wav),'clips':details}
        meta['processing']['noiseCleanup']=info;(out/(preset+'.json')).write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n');report[preset]=info
    (out/'cleanup-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:{'clips':len(v['clips']),'maxPeakChangeDb':max(abs(c.get('peakChangeDb',0)) for c in v['clips']),'durationBeforeMs':sum(c.get('inputMs',0) for c in v['clips']),'durationAfterMs':sum(c.get('outputMs',0) for c in v['clips'])} for k,v in report.items()},indent=2))
if __name__=='__main__':main()
