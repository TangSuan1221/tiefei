import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openLevelTwo,startNew,sit} from './living-browser-lib.mjs';
const dir='qa/living/ui-parity';
const {browser,page,errors}=await openLevelTwo(dir);
try{
 await startNew(page);await sit(page);
 const result=await page.evaluate(async()=>{
  const r=window.__pod,s=window.__living,v=window.__podView;
  const {drawObservationWindow}=await import('/src/pod/view/stations.ts');
  r.storyCaption='罗温：字幕位置核对。';r.storyCaptionLeft=20;
  s.feedbackText=r.storyCaption;s.feedbackUntil=s.elapsed+20;
  const cv=document.createElement('canvas');cv.width=1024;cv.height=720;
  const ctx=cv.getContext('2d'),texts=[];const fill=ctx.fillText.bind(ctx);
  ctx.fillText=(text,x,y,...args)=>{texts.push(String(text));fill(text,x,y,...args);};
  drawObservationWindow(ctx,r,v.hits,{time:0,hovered:null,sonar:v.sonar},true);
  const hud=[],hc=v.hctx,original=hc.fillText.bind(hc);
  hc.fillText=(text,x,y,...args)=>{hud.push({text:String(text),y});original(text,x,y,...args);};
  v.drawHud(r);hc.fillText=original;
  return {texts,hud,height:v.hud.height,captionBand:!!s.presentation.captionBand,zoom:r.camZoom};
 });
 assert.equal(result.captionBand,false);
 assert(!result.texts.some(t=>/变焦|取景合格|摄像台：滚轮|DEPTH|俯仰|字幕位置核对/.test(t)),JSON.stringify(result.texts));
 const caption=result.hud.find(t=>t.text.includes('字幕位置核对'));
 assert(caption&&caption.y>result.height*.94,'subtitle must use the first chapter bottom position');
 await page.screenshot({path:dir+'/second-chapter.png'});
 assert.deepEqual(errors.filter(e=>!/favicon|ERR_FAILED|net::/.test(e)),[]);
 await writeFile(dir+'/results.json',JSON.stringify(result,null,2));
 console.log('PASS second chapter UI parity',JSON.stringify(result));
}finally{await browser.close();}
