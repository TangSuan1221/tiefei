import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.route('**/api/**',r=>r.abort());
 await page.goto('http://127.0.0.1:5173/');await page.locator('[data-id="new"]').click();
 await page.waitForFunction(()=>!!window.__pod);
 const result=await page.evaluate(()=>{
  const r=window.__pod;r.receive();r.arrive();r.at='camera';const s=r.authoredSite;
  s.tick(.05);s.feedbackUntil=0;
  r.storyCaption='优先剧情对白';r.storyCaptionLeft=12;s.tick(.05);
  const priority=r.storyCaption==='优先剧情对白';
  r.storyCaptionLeft=0;s.tick(.05);
  const first=s.guide?.id,objective=s.objective,caption=r.storyCaption;
  s.tick(66);const reminded=s.guideReminded;
  const left=s.guideLeft;s.tick(66);const bounded=s.guideLeft===0&&s.guideReminded;
  s.guideLeft=10;r.at='radio';s.tick(1);const preserved=s.guideLeft===10;
  return {priority,first,objective,caption,reminded,bounded,preserved,left};
 });
 assert(result.priority);assert.equal(result.first,'tools');assert(result.objective.includes('维修湾'));
 assert(result.reminded&&result.bounded&&result.preserved);
 console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
