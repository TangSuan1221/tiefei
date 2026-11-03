import assert from 'node:assert/strict';
import {openLevelTwo} from '../../tools/living-browser-lib.mjs';
const dir='qa/prologue-caption';
const {browser,page,errors}=await openLevelTwo(dir,{query:''});
try{
 await page.locator('[data-id="new"]').click();
 await page.waitForFunction(()=>window.__pod?.prologue?.active,null,{timeout:60000});
 await page.waitForTimeout(1200);
 const a=await page.evaluate(()=>window.__pod.storyCaptionLeft);
 await page.screenshot({path:dir+'/01-caption-only.png'});
 assert(a>0,'caption should be showing first');
 await page.waitForFunction(()=>window.__pod.storyCaptionLeft<=0,null,{timeout:30000});
 await page.waitForTimeout(500);await page.screenshot({path:dir+'/02-typing.png'});
 await page.waitForTimeout(3500);await page.screenshot({path:dir+'/03-instruction.png'});
 console.log(JSON.stringify({captionLeftAtStart:a,errors}));
}finally{await browser.close();}
