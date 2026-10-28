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
 result=await page.evaluate(()=>{
 const l=window.__living,r=window.__pod,f=l.survey;window.GM.noVideo(true);r.gmLevelSession=true;r.at='lab';
 const rows=[];const check=(name,pass,detail)=>{rows.push({name,pass,detail});};
 const dest=()=>l.destination();
 check('camera pickup navigation survives pending S01',!!dest(),dest());
 f.operate('body');check('transfer destination before pending suppression',JSON.stringify(dest())==='[12,0,9]',dest());
 const old=l.diag.teleport(7,0,7,180);const oldNear=l.nearItem('living.pipe.intake');
 const legal=l.diag.teleport(12,0,9,180),near=l.nearItem('living.pipe.intake');l.radioSay('传递移动摄像仪');
 check('old pose outside transfer reach',old&&!oldNear,{old,oldNear});check('new transfer pose world hull and radio handoff',legal&&near&&f.shared,{legal,near,shared:f.shared,feedback:l.feedbackText});
 check('pending shared task has no premature photography destination',dest()===undefined,{pending:f.pending,destination:dest()??null});
 f.acceptVideo('L2-S01');f.acceptVideo('L2-S02');check('briefed navigation resumes photo01',JSON.stringify(dest())==='[53,0,24]',dest());
 // Explicit state fixture isolates navigation, not a claim that these films were earned.
 f.photos=[0,1];let r4=false,r4pose; for(const x of [108,106,104,112])for(const z of [24,22,20,29]){if(!r4&&l.diag.teleport(x,0,z,90)){r4=true;r4pose=[x,0,z];}};check('pending distress keeps navigation suppressed',r4&&dest()===undefined,{pending:f.pending,destination:dest()??null});
 f.acceptVideo('L2-S03');check('unanswered distress does not get replaced by ballast',!l.localBallastStop(),{objective:l.objective,destination:dest()??null});
 l.radioSay('我听得见，先别动');check('R4 local ballast destination matches actual box',l.localBallastStop()&&JSON.stringify(dest())==='[115.5,-0.6,32.5]',{objective:l.objective,destination:dest()});
 const leave=l.diag.teleport(128,0,17,90);check('leaving R4 is not progression locked',leave&&!l.localBallastStop()&&JSON.stringify(dest())==='[137.8,0,13.5]',{leave,destination:dest()});
 l.diag.teleport(...r4pose,90);f.operate('ballast');check('collected ballast restores supply destination',!l.localBallastStop()&&JSON.stringify(dest())==='[137.8,0,13.5]',dest());
 return {rows,pass:rows.every(x=>x.pass),method:'Local GM isolated diagnostic; collision-validated teleports with actual loaded world; radioSay physical proximity path; navigation state fixtures for photos only; not blind play or earned film evidence.'};
 });
} catch(e){result={pass:false,error:String(e)};}finally{writeFileSync('qa/living-2026-10-27/route-navigation-diagnostic.json',JSON.stringify({result,blocked,errors},null,2));await browser.close();}
console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;


