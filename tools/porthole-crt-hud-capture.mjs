// Porthole phosphor HUD captures: a lit harbor door with a focus lock and the darker level-2 deck.
// Usage: node tools/porthole-crt-hud-capture.mjs [dir]   (dev server at LIVING_URL, default 5192)
import {mkdir,writeFile} from 'node:fs/promises';
import {openLevelTwo,startNew,sit} from './living-browser-lib.mjs';
const dir=process.argv[2]||'qa/porthole-crt-hud/after';await mkdir(dir,{recursive:true});
const {browser,page,errors}=await openLevelTwo(dir);
try{
 await startNew(page);await sit(page);await page.waitForTimeout(2500);
 await page.screenshot({path:`${dir}/living-dark.png`});
 await page.evaluate(()=>{const r=window.__pod;r.power=1;r.lamp=true;});await page.waitForTimeout(1500);
 await page.screenshot({path:`${dir}/living-lamp.png`});
 await writeFile(`${dir}/living-result.json`,JSON.stringify({errors},null,2));
 console.log({dir,errors});
}finally{await browser.close();}
