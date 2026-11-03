import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-unsafe-swiftshader']});
const page=await browser.newPage();const blocked=[];const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='http://127.0.0.1:5180'||u.pathname.startsWith('/api/')){blocked.push(u.href);return r.abort();}return r.continue();});
await page.addInitScript(()=>{const W=window.WebSocket;window.WebSocket=function(url,protocols){if(String(protocols??'').includes('vite'))return {addEventListener(){},removeEventListener(){},close(){},send(){},readyState:0};return new W(url,protocols);};window.WebSocket.prototype=W.prototype;});
let result;
try{
 await page.goto('http://127.0.0.1:5180/?level=2');await page.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.startsWith('ironlung.'))localStorage.removeItem(k);});
 await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__living,null,{timeout:60000});await page.evaluate(()=>window.__living.world.ready);
 result=await page.evaluate(async()=>{
 const l=window.__living,r=window.__pod,f=l.survey;window.GM.noVideo(true);r.gmLevelSession=true;l.debugNoVideo=true;r.at='lab';
 const rows=[],check=(name,pass,detail)=>rows.push({name,pass,detail});
 const {LivingSurvey}=await import('/src/pod/sim/living-survey.ts');
 const capture=t=>{const e={survey:true,id:'fixture.'+t,target:t,valid:true,lit:true};f.issue(e);f.commit(e);f.analyze(e);};
 const task=()=>l.tick(.1);
 task();f.operate('body');l.cargo.add('living.box.probe');f.operate('transfer');task();capture(0);capture(1);task();f.say('我听见了');capture('manual');f.operate('valve-s');f.say('含硫支路已关闭');task();f.operate('door');f.say('密码');task();f.operate('door');capture(2);f.operate('reunion');task();
 const beforeBallast=new LivingSurvey().restore(f.snapshot());check('internally consistent GM fact fixture',beforeBallast,f.snapshot().accepted);
 // Actual loaded world, collision-validated straight paths and turn sweeps.
 const trace=[];const go=(p,h)=>l.diag.teleport(...p,h);
 check('legacy ballast waypoint is obstructed',!go([112,0,29],90));
 const approach=go([112.5,0,32.5],90);r.camPan=0;r.camTilt=Math.atan2(.6,3);l.pose();check('ballast proposed approach legal and reachable',approach&&l.nearItem('living.box.ballast'),{approach,near:l.nearItem('living.box.ballast'),aim:l.diag.aimed()});
 const segment=(a,b)=>{const dx=b[0]-a[0],dz=b[2]-a[2],h=(Math.atan2(dx,-dz)*180/Math.PI+360)%360;if(!go(a,h))return {a,b,ok:false,why:'start hull'};let remaining=Math.hypot(dx,dz),ok=true;while(remaining>1e-7){const n=Math.min(.04,remaining);if(!l.move(n)){ok=false;break;}remaining-=n;}return {a,b,ok:ok&&l.position.distanceTo({x:b[0],y:b[1],z:b[2]})<.01,end:l.diag.state().pos};};
 for(const pair of [[[100,0,26],[100,0,32.5]],[[100,0,32.5],[112.5,0,32.5]],[[112.5,0,32.5],[100,0,32.5]],[[100,0,32.5],[100,0,17]],[[100,0,17],[128.5,0,17]]])trace.push(segment(...pair));
 check('candidate ballast connecting segments',trace.every(x=>x.ok),trace);
 f.operate('ballast');l.cargo.add('living.box.ballast');l.refresh();
 const base=f.snapshot(),reset=()=>{f.restore(base);l.ended=false;l.refresh();};
 const descent=()=>{let n=0;while(n<255&&l.moveVertical(-.04))n++;return {steps:n,pos:l.diag.state().pos};};
 for(const missing of ['ballast','reunion']){reset();f[missing]=false;go([208,0,68],0);const d=descent();l.tick(.01);const physicalBlocked=!f.complete&&d.pos[1]>=-8.001;l.position.set(208,-10.2,68);l.tick(.01);check('missing '+missing+' blocks physical descent and exit',physicalBlocked&&!f.complete,{physical:d,forcedBelowComplete:f.complete});}
 reset();l.position.set(198,-10.2,68);l.tick(.01);check('outside E cannot complete',!f.complete);
 reset();check('exact threshold legal pose',go([208,-10,68],0));l.tick(.01);check('exact threshold cannot complete',!f.complete);
 reset();check('E start legal',go([208,0,68],0));const d=descent();l.tick(.01);check('continuous real moveVertical passes threshold',d.steps===255&&f.complete&&l.complete,{...d,complete:f.complete,objective:l.objective});
 check('completed fixture remains survey-valid',new LivingSurvey().restore(f.snapshot()));r.at='camera';r.power=1;
 return {rows,pass:rows.every(x=>x.pass),beforeB:{canDepart:r.canDepart,leg:r.legIndex,phase:r.phase,film:r.campaign.has(1,'film')},method:'Explicit GM fact fixture via survey transitions and synthetic capture objects; real world collision and move/moveVertical; missing-condition below-threshold tests explicitly bypass position only to test gate; no real media, no claim of blind/full play.'};
 });
 await page.keyboard.press('b');await page.waitForTimeout(1500);result.afterB=await page.evaluate(()=>({leg:window.__pod.legIndex,phase:window.__pod.phase,site:window.__pod.authoredSite?.constructor.name,caption:window.__pod.storyCaption}));
} catch(e){result={pass:false,error:String(e)};}finally{writeFileSync('qa/living-2026-10-27/exit-route-diagnostic.json',JSON.stringify({result,blocked,errors},null,2));await browser.close();}
console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;

