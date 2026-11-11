// Actual source buffer checks; no claim about human-perceived audio quality.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const LOCAL_URL=process.argv[2]??'http://127.0.0.1:4353/';
const PUBLIC_URL=process.argv[3]??'http://127.0.0.1:4320/';
const b=await chromium.launch({executablePath:process.env.CHROME_PATH??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-angle=metal']});
const passed=[];const check=(name,yes)=>{assert.ok(yes,name);passed.push(name)};
try{
for(const mobile of [false,true]){
 const ctx=await b.newContext(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1200,height:800}});const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));
 await p.addInitScript(()=>{window.__starts=[];window.__registered=new WeakMap();const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer?.length>1)window.__starts.push({name:window.__registered.get(this.buffer),length:this.buffer.length});return start.apply(this,args)}});
 await p.goto(LOCAL_URL+'#/keyboard');
 await p.evaluate(async()=>{const {AudioEngine}=await import('/src/core/audio.ts');const register=AudioEngine.prototype.register;AudioEngine.prototype.register=function(name,buffers){buffers.forEach(buf=>window.__registered.set(buf,name));return register.call(this,name,buffers)}});
 await p.waitForTimeout(1600);check(`10 selectable presets mobile=${mobile}`,await p.getByRole('radio').count()===10);
 const key=async code=>{await p.evaluate(()=>document.activeElement?.blur());await p.keyboard.down(code);await p.keyboard.up(code)};
 const clear=()=>p.evaluate(()=>window.__starts=[]);const starts=()=>p.evaluate(()=>window.__starts);
 const locals=[['Turquoise Tealios','turquoise-tealios'],['IBM Buckling Spring','ibm-buckling-spring'],['Oil King','oil-king'],['Boba U4T','boba-u4t'],['BOX Jade','box-jade'],['Peach V3','silent-peach-v3']];
 for(const [label,id] of locals){
  await p.getByRole('radio',{name:label,exact:true}).click();await p.waitForFunction(()=>document.querySelector('[role=radio][aria-checked=true]')?.getAttribute('data-load-state')==='ready');await clear();
  for(const code of ['KeyQ','KeyA','KeyZ','Space','Enter','Backspace'])await key(code);
  const releases=['turquoise-tealios','ibm-buckling-spring'].includes(id);
  const a=await starts();check(`${id} actual own source buffers mobile=${mobile}`,a.length===(releases?12:6)&&a.every(v=>v.name?.startsWith(`kb:${id}:`)));
  check(`${id} recorded release policy mobile=${mobile}`,releases?a.filter(v=>v.name.endsWith('Up')||v.name.endsWith(':up')).length===6:a.every(v=>!v.name.endsWith('Up')&&!v.name.endsWith(':up')));
  for(let i=0;i<24;i++)await key('KeyQ');check(`${id} burst mobile=${mobile}`,(await starts()).length===(releases?60:30));
  if(mobile){await clear();await p.touchscreen.tap(105,300);const touch=await starts();check(`${id} actual touch playback`,touch.length===(releases?2:1)&&touch[0].name?.startsWith(`kb:${id}:`));
   await clear();const cdp=await ctx.newCDPSession(p);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:105,y:300,id:1},{x:195,y:300,id:2}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
   const chord=await starts();check(`${id} two-finger touch playback`,chord.length===(releases?4:2)&&chord.every(v=>v.name?.startsWith(`kb:${id}:`)));
  }
  if(releases){
   await clear();
   for(const code of ['F1','Digit1','KeyQ','KeyA','KeyZ','Space','Enter','Backspace'])await key(code);
   const actual=(await starts()).map(x=>x.name);
   const expected=['downR0','downR1','downR2','downR3','downR4','spaceDown','enterDown','backspaceDown'].flatMap((role,i)=>[`kb:${id}:${role}`,`kb:${id}:${i<5?'up':role.replace('Down','Up')}`]);
   check(`${id} five rows and dedicated press/release mapping mobile=${mobile}`,JSON.stringify(actual)===JSON.stringify(expected));
  }
 }
 // Existing four still have original down/up counts.
 for(const [label,count]of [['조약돌',6],['까랑까랑',6],['크리미',3],['Topre',6]]){await p.getByRole('radio',{name:label,exact:true}).click();await clear();for(const code of ['KeyQ','KeyA','Space'])await key(code);check(`regression ${label} mobile=${mobile}`,(await starts()).length===count)}
 await p.getByRole('radio',{name:'Turquoise Tealios',exact:true}).click();await p.waitForFunction(()=>document.querySelector('[role=radio][aria-checked=true]')?.getAttribute('data-load-state')==='ready');
 await clear();await p.evaluate(()=>document.activeElement?.blur());await p.keyboard.down('KeyQ');await p.getByRole('radio',{name:'IBM Buckling Spring',exact:true}).click();await p.keyboard.up('KeyQ');await key('KeyA');const a=await starts();check(`held key switch no substitute mobile=${mobile}`,a.length===4&&a.slice(0,2).every(x=>x.name?.includes('turquoise-tealios'))&&a.slice(2).every(x=>x.name?.includes('ibm-buckling-spring')));
 check(`no page errors mobile=${mobile}`,errors.length===0);await ctx.close();
}
// A failed local file must not substitute another switch or a synth.
const failed=await b.newPage();
await failed.addInitScript(()=>{window.__starts=0;const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer?.length>1)window.__starts++;return start.apply(this,args)}});
await failed.route('**/sfx/keyboard/turquoise-tealios*',r=>r.abort());
await failed.goto(LOCAL_URL+'#/keyboard');await failed.waitForTimeout(1200);
await failed.getByRole('radio',{name:'Turquoise Tealios',exact:true}).click();
await failed.waitForFunction(()=>document.querySelector('[role=radio][aria-checked=true]')?.getAttribute('data-load-state')==='error');
await failed.evaluate(()=>{window.__starts=0;document.activeElement?.blur()});await failed.keyboard.press('KeyQ');
check('failed local sample never substitutes another sound',await failed.evaluate(()=>window.__starts)===0);await failed.close();
const p=await b.newPage();
await p.addInitScript(()=>localStorage.setItem('mzk-settings-v1',JSON.stringify({keyPreset:'oil-king'})));
await p.goto(PUBLIC_URL+'#/keyboard');await p.waitForTimeout(1200);check('production preview exposes 6 recorded presets',await p.getByRole('radio').count()===6);check('description section removed',await p.locator('#local-audio-note').count()===0);check('saved local-only choice resets to pebble in public build',await p.getByRole('radio',{name:'조약돌',exact:true}).getAttribute('aria-checked')==='true');await p.close();
console.log(JSON.stringify({passed:passed.length,checks:passed,listening:'Human listening not performed; actual AudioBufferSourceNode.start and own buffer registration verified.'},null,2));
}finally{await b.close()}
