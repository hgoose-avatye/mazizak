// node events.mjs file.f32 -> noise floor, peak, and event list (20ms RMS > floor+12dB)
import fs from 'node:fs'; const SR=44100;
for (const f of process.argv.slice(2)) {
const x=new Float32Array(fs.readFileSync(f).buffer.slice(0)); const hop=882; const db=[];
for(let s=0;s+hop<=x.length;s+=hop){let e=0;for(let i=0;i<hop;i++)e+=x[s+i]**2;db.push(10*Math.log10(e/hop+1e-12));}
const so=[...db].sort((a,b)=>a-b); const floor=so[Math.floor(so.length*0.1)], p50=so[Math.floor(so.length*0.5)], mx=so[so.length-1];
let pk=0; for(const v of x) pk=Math.max(pk,Math.abs(v));
const ev=[]; let st=-1; for(let i=0;i<=db.length;i++){const on=i<db.length&&db[i]>floor+12; if(on&&st<0)st=i; if(!on&&st>=0){ if(i-st>=2){let m=-200;for(let k=st;k<i;k++)m=Math.max(m,db[k]); ev.push(`${(st*0.02).toFixed(2)}-${(i*0.02).toFixed(2)}(${m.toFixed(0)})`);} st=-1;}}
console.log(f.split('/').pop(), `floor ${floor.toFixed(1)} med ${p50.toFixed(1)} max ${mx.toFixed(1)} pk ${(20*Math.log10(pk)).toFixed(1)}dBFS events ${ev.length}:`, ev.slice(0,40).join(' '));
}
