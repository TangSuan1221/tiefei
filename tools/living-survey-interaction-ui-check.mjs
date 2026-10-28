import {openLevelTwo,startNew,sit} from './living-browser-lib.mjs';
const {browser,page,errors}=await openLevelTwo('qa/living-2026-10-27');
try{await startNew(page);await sit(page);await page.evaluate(()=>{const l=window.__living,r=window.__pod;r.lamp=true;r.power=1;l.diag.teleport(12.121320343559642,0,9.378679656440358,225);r.camPan=0;r.camTilt=Math.atan2(1.2,3);l.interact();});await page.waitForTimeout(600);await page.screenshot({path:'qa/living-2026-10-27/interaction-ui.png'});console.log(JSON.stringify(errors));}finally{await browser.close();}
