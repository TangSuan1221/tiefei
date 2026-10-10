import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const url=process.env.POD_URL??'http://127.0.0.1:5173/';
mkdirSync('qa/radio',{recursive:true});
const b=await chromium.launch({channel:'msedge',headless:true});
// The shared dev server may full-reload mid-run when other files change; such runs are retried, real failures are not.
async function attempt(){
 const p=await b.newPage({viewport:{width:1600,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/**',r=>r.abort());
 let reloaded=false;p.on('framenavigated',f=>{if(f===p.mainFrame()&&p.__started)reloaded=true;});
 try{await flow(p,errors);}catch(e){if(reloaded||/Execution context was destroyed|reading 'at'/.test(String(e)))return 'reload';throw e;}finally{await p.close();}
 return 'ok';
}
async function flow(p,errors){
 await p.goto(url);p.__started=true;await p.locator('[data-id="new"]').click();await p.waitForFunction(()=>!!window.__podView);
 await p.waitForTimeout(1500);await p.keyboard.down('w');for(let i=0;i<40&&!await p.locator('#cabin-interact').isVisible();i++)await p.waitForTimeout(200);await p.keyboard.up('w');
 await p.keyboard.press('e');await p.waitForFunction(()=>!!window.__pod.at,null,{timeout:8000});await p.waitForTimeout(3000);
 const site=()=>p.evaluate(()=>{const s=window.__pod.authoredSite;return {at:window.__pod.at,target:s.micTarget,ready:s.micReady,choices:[...(s.dialogueChoices??[])]};});
 await p.waitForFunction(()=>window.__pod.authoredSite?.micReady===true,null,{timeout:90000});
 const before=await site();console.log('before',JSON.stringify(before),JSON.stringify(await p.evaluate(()=>({active:document.activeElement?.tagName,log:window.__pod.log.slice(-4).map(l=>l.text)}))));assert.equal(before.target,'万斯');
 // M from the shared cockpit opens the transmit panel and keeps game keys out of the text field.
 await p.keyboard.press('m');await p.waitForTimeout(300);if(!await p.locator('#radio-tx').count())throw Error('M did not open: '+JSON.stringify(await site())+' '+JSON.stringify(await p.evaluate(()=>window.__pod.log.slice(-4).map(l=>l.text))));
 assert.equal(await p.evaluate(()=>document.activeElement?.closest('#radio-tx')!==null),true);
 assert.equal(await p.inputValue('#radio-tx input'),'');
 await p.keyboard.type('wasd');assert.equal(await p.inputValue('#radio-tx input'),'wasd');assert.equal((await site()).at,'nav');
 await p.keyboard.press('Escape');assert.equal(await p.locator('#radio-tx').count(),0);assert.equal((await site()).at,'nav');
 // Physical push-to-talk grille: hold past MIC_HOLD_MS, release, type, Enter.
 await p.waitForTimeout(3000);
 const findGrille=()=>p.evaluate(()=>{const v=window.__podView;for(let y=40;y<innerHeight-20;y+=6)for(let x=40;x<innerWidth-40;x+=6){const id=v.pick(x,y);if(id==='desk:nav:sonar.mic'||id==='sonar.mic'){let n=0;for(let k=0;k<12;k++){const q=v.pick(x,y);if(q===id)n++;}if(n===12)return{x,y};}}return null;});
 // First click on a side device only zooms the cockpit camera onto it (existing behaviour).
 let grille=await findGrille();if(grille){await p.mouse.click(grille.x,grille.y);await p.waitForTimeout(2500);grille=await findGrille();}
 console.log('grille',JSON.stringify(grille));
 if(grille){await p.mouse.move(grille.x,grille.y);await p.mouse.down();await p.waitForTimeout(700);
  console.log('held',JSON.stringify(await p.evaluate(async({x,y})=>{const m=await import('/src/pod/view/sonar-desk.ts');return {pick:window.__podView.pick(x,y),at:window.__pod.at,since:m.passiveUi(window.__pod).micSince,msg:m.sonarDeskState(window.__pod).message,ready:window.__pod.authoredSite.micReady};},grille)));
  await p.mouse.up();await p.waitForTimeout(300);
  console.log('released',JSON.stringify(await p.evaluate(async()=>{const m=await import('/src/pod/view/sonar-desk.ts');return {tx:!!document.getElementById('radio-tx'),msg:m.sonarDeskState(window.__pod).message,log:window.__pod.log.slice(-2).map(l=>l.text)};})));}
 else await p.keyboard.press('m');
 await p.waitForSelector('#radio-tx input');
 const header=await p.locator('#radio-tx header').innerText(),chips=await p.locator('#radio-tx .chips button').allInnerTexts();
 await p.keyboard.type('事故报告怎么说的');
 await p.screenshot({path:'qa/radio/transmit-overlay.png'});
 const logStart=await p.evaluate(()=>window.__pod.log.length);
 await p.keyboard.press('Enter');assert.equal(await p.locator('#radio-tx').count(),0);
 const heard=new Set();
 for(let i=0;i<40;i++){await p.waitForTimeout(500);for(const t of await p.evaluate(n=>[...window.__pod.log.slice(n).map(l=>l.text),window.__pod.storyCaption],logStart))if(t)heard.add(t);if([...heard].some(t=>t.startsWith('万斯：')))break;}
 await p.screenshot({path:'qa/radio/after-send.png'});
 const lines=[...heard];
 assert(lines.some(t=>t.includes('事故报告怎么说的')),'Rowan line missing: '+JSON.stringify(lines));
 assert(lines.some(t=>t.startsWith('万斯：')),'Vance reply missing: '+JSON.stringify(lines));
 // Busy channel refuses to open.
 const busy=await p.evaluate(()=>window.__pod.authoredSite.micReady);
 if(!busy){await p.keyboard.press('m');await p.waitForTimeout(200);assert.equal(await p.locator('#radio-tx').count(),0);}
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({grille:!!grille,header,chips,lines,busyRefused:!busy},null,1));
 console.log('PASS radio transmit: M + physical mic open TX panel, keys isolated, Esc cancels, Enter sends free text, Vance answers, busy channel refused');
}
try{
 let r='reload';for(let i=0;i<4&&r==='reload';i++){r=await attempt();if(r==='reload')console.log('dev server reloaded the page, retrying');}
 if(r!=='ok')throw Error('page kept reloading');
}finally{await b.close();}
