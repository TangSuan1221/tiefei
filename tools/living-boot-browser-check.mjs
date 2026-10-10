// Level two boot: /?level=2 → new game → cockpit; no console errors; live view dark, film exposure bright.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openLevelTwo,startNew,sit,state,siteShot,physicalClick,heave} from './living-browser-lib.mjs';

const dir=process.env.LIVING_QA_DIR?process.env.LIVING_QA_DIR+'/boot':'qa/living/boot';
const {browser,page,errors}=await openLevelTwo(dir);
const out={checks:{}};
try{
 await startNew(page);
 const s0=await state(page);
 assert.equal(s0.legIndex,1);assert.equal(s0.phase,'site');assert.deepEqual(s0.pos,[7,30,7]);
 out.checks.spawn=s0.pos;
 await sit(page);
 await page.waitForTimeout(2500);
 await page.screenshot({path:dir+'/cockpit-lamp-off.png'});
 // Lamp on via the real camera-station key.
 if(!(await state(page)).lamp){await page.keyboard.press('3');await page.waitForTimeout(600);}
 const s1=await state(page);assert(s1.lamp&&s1.lit,'lamp did not turn on with key 3');
 await page.screenshot({path:dir+'/cockpit-lamp-on.png'});
 // Mean luma (0–255) of the site's own render through living-render. Live = crushed real-time optics, film = exposure.
 // Measured at the shaft bottom facing C1 (real PageDown): the spawn point is open water with nothing in lamp range.
 await heave(page,0);out.checks.lumaAt=(await state(page)).pos;
 const luma=await page.evaluate(()=>({live:window.__living.diag.luma(false),film:window.__living.diag.luma(true)}));
 out.checks.luma=luma;
 assert(luma.live>=4,`live view with the lamp on is unreadably black: ${JSON.stringify(luma)}`);
 assert(luma.live<luma.film*.8,`live view not darker than film: ${JSON.stringify(luma)}`);
 assert(luma.film>18,`film exposure too dark: ${JSON.stringify(luma)}`);
 await page.keyboard.press('3');await page.waitForTimeout(600);
 const off=await page.evaluate(()=>({lamp:window.__pod.lamp,live:window.__living.diag.luma(false),film:window.__living.diag.luma(true)}));
 out.checks.lumaLampOff=off;
 assert(!off.lamp,'lamp did not turn off with key 3');
 assert(off.live<2.5&&off.live<off.film*.4,`live view without the lamp should be near black: ${JSON.stringify(off)}`);
 await page.keyboard.press('3');await page.waitForTimeout(600);
 await siteShot(page,dir+'/site-live.png',false);
 await siteShot(page,dir+'/site-film.png',true);
 // A real 5 s exposure from the physical shutter button; must produce ≥3 sensor frames.
 await physicalClick(page,'camera.shoot');
 await page.waitForFunction(()=>window.__pod.shot.phase!=='exposing',null,{timeout:20000});
 const tape=await page.evaluate(()=>{const t=window.__pod.tapes.at(-1);return t?{frames:t.sensorFrames?.length??0,ev:t.siteEvidence,first:t.sensorFrames?.[0]}:null;});
 assert(tape&&tape.frames>=3,'exposure produced fewer than 3 sensor frames');
 out.checks.exposure={frames:tape.frames,evidence:tape.ev};
 const {saveFrame}=await import('./living-browser-lib.mjs');await saveFrame(page,dir+'/exposure-frame0.jpg',tape.first);
 await page.waitForTimeout(800);
 out.checks.errors=errors;
 assert.deepEqual(errors.filter(e=>!/favicon|ERR_FAILED|net::/.test(e)),[],'console errors: '+errors.join('\n'));
 out.passed=true;console.log('PASS living boot',JSON.stringify(out.checks));
}catch(e){out.passed=false;out.failure=String(e?.stack??e);out.errors=errors;console.error('FAIL living boot',e);await page.screenshot({path:dir+'/failure.png'}).catch(()=>{});process.exitCode=1;}
finally{await writeFile(dir+'/results.json',JSON.stringify(out,null,2));await browser.close();}
