// Shared real-input helpers for the continuous run. Reads state only to decide when to release keys.
export const tiltTo=async(page,target,tol=.02)=>{
 for(let k=0;k<6;k++){
  const t=await page.evaluate(()=>window.__pod.camTilt);const d=target-t;if(Math.abs(d)<tol)return t;
  const key=d>0?'ArrowDown':'ArrowUp';await page.keyboard.down(key);
  for(let i=0;i<200;i++){await page.waitForTimeout(25);const n=await page.evaluate(()=>window.__pod.camTilt);if(Math.sign(target-n)!==Math.sign(d)||Math.abs(target-n)<tol)break;}
  await page.keyboard.up(key);
 }
 return page.evaluate(()=>window.__pod.camTilt);
};
export const panCenter=async page=>{await page.keyboard.press('h');await page.waitForTimeout(200);};
/** Real M → text → Enter. M moves the seat to nav, where key 2 is the active-sonar switch, so return via Esc → aisle → 2. */
export const say=async(page,text)=>{
 await page.keyboard.press('m');const box=page.getByRole('textbox',{name:'无线电发言'});await box.fill(text);await box.press('Enter');await page.waitForTimeout(500);
 const reply=await page.evaluate(()=>window.__living.feedbackText);
 await toCamera(page);return reply;
};
export const toCamera=async page=>{
 for(let i=0;i<3&&await page.evaluate(()=>window.__pod.at!=='camera');i++){
  if(await page.evaluate(()=>!!window.__pod.at)){await page.keyboard.press('Escape');await page.waitForTimeout(400);}
  await page.keyboard.press('2');await page.waitForTimeout(900);
 }
 if(await page.evaluate(()=>window.__pod.activeSonarEnabled))throw Error('active sonar switched on by input');
};
/** Real F presses through the timed arm cycle (extend → grip → stow). */
export const armCycle=async(page,log)=>{
 for(let i=0;i<3;i++){await page.keyboard.press('f');await page.waitForTimeout(400);await log?.('arm press '+i);
  await page.waitForFunction(()=>!['extending','gripping','hauling'].includes(window.__pod.arm.phase),null,{timeout:20000});await page.waitForTimeout(300);}
};
/** Real key 1 at the camera station; waits until the 5 s exposure and development finish. */
export const expose=async page=>{
 const n=await page.evaluate(()=>window.__pod.tapes.length);
 await page.keyboard.press('1');await page.waitForTimeout(300);
 await page.waitForFunction(n=>window.__pod.tapes.length>n&&!['exposing','developing'].includes(window.__pod.shot.phase),n,{timeout:60000});
 return page.evaluate(()=>{const t=window.__pod.tapes.at(-1);return {id:t.id,ev:t.siteEvidence};});
};
/** GM no-video diagnosis of the newest reel, typed through the real radio. */
// A finished reel is auto-selected, so no cursor stepping is needed.
export const diagnoseNewest=page=>say(page,'诊断分析底片');
