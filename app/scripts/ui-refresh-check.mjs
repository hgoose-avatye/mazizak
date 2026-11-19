import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const BASE=process.env.BASE??'http://127.0.0.1:4354';
const OUT=new URL('../bench-out/ui-refresh/',import.meta.url).pathname;
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--autoplay-policy=no-user-gesture-required']});
const checks=[],errors=[],screens={};const ok=(name,value)=>{assert.ok(value,name);checks.push(name);};
const baseline=existsSync('/private/tmp/manzizak-ui-baseline.json')?JSON.parse(await readFile('/private/tmp/manzizak-ui-baseline.json','utf8')):null;
try{
 for(const [label,width,height] of [['mobile',390,844],['desktop',1440,1000],['small',320,740],['landscape',844,390],['short-portrait',390,480]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:label!=='desktop',hasTouch:true});const p=await context.newPage();p.on('pageerror',e=>errors.push(String(e)));
  await p.goto(BASE+'/#/S01');await p.waitForFunction(()=>window.__MANZIZAK__?.report()?.id==='S01');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(400);
  const stage=await p.locator('#stage').boundingBox();screens[label]={stage};
  if(baseline?.[label])ok(label+' original canvas bounds preserved',JSON.stringify([stage.x,stage.y,stage.width,stage.height])===JSON.stringify(['x','y','width','height'].map(k=>baseline[label].stage[k])));
  ok(label+' font loaded',await p.evaluate(()=>document.fonts.check('650 15px "SUITE Variable"')));
  ok(label+' no page overflow',await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  ok(label+' page zoom not blocked',!/user-scalable=no|maximum-scale=1\b/.test(await p.getAttribute('meta[name=viewport]','content')));
  if(await p.locator('#now-name').isVisible()){const {n,a,lh}=await p.evaluate(()=>{const h=document.querySelector('#now-name');return {n:h.getBoundingClientRect().toJSON(),a:document.querySelector('.head-actions').getBoundingClientRect().toJSON(),lh:parseFloat(getComputedStyle(h).lineHeight)};});
   ok(label+' name and icons do not overlap',n.right<=a.left);ok(label+' icons centred on the name\'s first line',Math.abs((a.top+a.bottom)/2-(n.top+lh/2))<=2);}
  ok(label+' active toy labelled',(await p.locator('#now-name').textContent())===await p.locator('.toy-item[aria-checked=true] .name').textContent());
  await p.screenshot({path:OUT+label+'.png'});
  await p.mouse.move(stage.x+stage.width/2,stage.y+stage.height/2);await p.mouse.down();await p.waitForTimeout(250);ok(label+' toy still accepts input',(await p.evaluate(()=>window.__MANZIZAK__.report())).contacts>0);await p.mouse.up();
  ok(label+' reset hidden on a toy that settles by itself',!await p.locator('[data-action=reset]').isVisible());
  await p.getByRole('button',{name:'소리 끄기',exact:true}).click();ok(label+' mute state visible',await p.locator('#sound-btn').getAttribute('aria-pressed')==='false');await p.getByRole('button',{name:'소리 켜기',exact:true}).click();
  await p.getByRole('button',{name:'장난감 목록 접기',exact:true}).click();ok(label+' drawer folds',await p.locator('#dock-toggle').getAttribute('aria-expanded')==='false'&&!await p.locator('#dock-body').isVisible());
  const grows=(s,o)=>s.width>=o.width&&s.height>=o.height&&(s.width>o.width||s.height>o.height);await p.waitForFunction(o=>{const r=document.querySelector('#stage').getBoundingClientRect();return r.width>=o.width&&r.height>=o.height&&(r.width>o.width||r.height>o.height);},stage);ok(label+' folding preserves free stage',grows(await p.locator('#stage').boundingBox(),stage));/* grows in one direction (taller under a bottom drawer, wider beside the side rail of wide short screens), shrinks in none */await p.getByRole('button',{name:'장난감 목록 펼치기',exact:true}).click();
  await p.locator('.toy-item[data-key=S02]').click();await p.waitForFunction(()=>window.__MANZIZAK__?.report()?.id==='S02');ok(label+' selection updates title',(await p.locator('#now-name').textContent())==='모닝빵');
  await p.locator('.toy-item[data-key=W01]').click();await p.waitForFunction(()=>window.__MANZIZAK__?.report()?.id==='W01');
  await p.mouse.move(stage.x+stage.width/2,stage.y+stage.height/2);await p.mouse.down();await p.waitForTimeout(250);await p.mouse.up();
  await p.getByRole('button',{name:'처음 상태로',exact:true}).click();await p.waitForTimeout(150);ok(label+' reset works on 왁뿌볼',(await p.evaluate(()=>window.__MANZIZAK__.report())).contacts===0);
  await p.getByRole('button',{name:'설정',exact:true}).click();await p.waitForTimeout(350);ok(label+' modal inert background',await p.evaluate(()=>document.querySelector('#stage').inert&&document.querySelector('#now-playing').inert));
  await p.locator('[data-setting=volume]').evaluate(el=>{el.value='.42';el.dispatchEvent(new Event('input',{bubbles:true}));});ok(label+' volume value reflects setting',(await p.locator('#volume-value').textContent())==='42%');
  ok(label+' credits initially collapsed',await p.locator('.credits').getAttribute('open')===null);await p.locator('.credits summary').click();ok(label+' all source notices retained',(await p.locator('.sheet-note a').count())>20);await p.locator('.credits summary').click();
  await p.screenshot({path:OUT+label+'-settings.png'});await p.keyboard.press('Escape');ok(label+' escape closes modal',!await p.locator('#sheet').isVisible());
  await p.getByRole('radio',{name:'키보드',exact:true}).click();await p.waitForFunction(()=>window.__MANZIZAK__?.report()?.keyRectsPx?.length>0);
  await p.evaluate(()=>document.activeElement?.blur());const before=(await p.evaluate(()=>window.__MANZIZAK__.report())).keyRecords.length;await p.keyboard.press('KeyQ');ok(label+' physical keyboard works',await p.waitForFunction(n=>window.__MANZIZAK__.report().keyRecords.length>n,before,{timeout:2000}).then(()=>true,()=>false));
  const selected=p.locator('.toy-item[aria-checked=true]');const initial=await selected.getAttribute('data-key');await selected.focus();await p.keyboard.press('ArrowRight');ok(label+' arrow navigation changes selection',await p.locator('.toy-item[aria-checked=true]').getAttribute('data-key')!==initial);
  await p.screenshot({path:OUT+label+'-keyboard.png'});await context.close();
 }
 if(process.env.CHECK_PROTECTED==='1'&&existsSync('/private/tmp/manzizak-ui-protected-hashes.json')){
  const hashes=JSON.parse(await readFile('/private/tmp/manzizak-ui-protected-hashes.json','utf8'));const root=new URL('../',import.meta.url);
  for(const [path,hash] of Object.entries(hashes))assert.equal(createHash('sha256').update(await readFile(new URL(path,root))).digest('hex'),hash,'Protected asset modified: '+path);
  ok('all '+Object.keys(hashes).length+' model / physics / sound / thumbnail / font files byte-identical',true);
 }
 ok('no page errors',errors.length===0);await writeFile(OUT+'results.json',JSON.stringify({passed:checks.length,checks,screens,errors},null,2));console.log(JSON.stringify({passed:checks.length,errors,screens},null,2));
}finally{await browser.close();}
