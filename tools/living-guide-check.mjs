import assert from 'node:assert/strict';
import {openLevelTwo,startNew} from './living-browser-lib.mjs';
const {browser,page}=await openLevelTwo('qa/living/guide');
try {
 await startNew(page);
 const result=await page.evaluate(()=>{
  const s=window.__living,r=window.__pod;
  r.lamp=true;r.power=true;r.camZoom=3.2;r.pitch=0;r.camPan=0;r.camTilt=0;
  s.s.stage='code';s.s.codeVerified=true;s.s.guideVerified=false;
  const moved=s.diag.teleport(164,0,96,90);
  const objective=s.objective,framing=s.diag.framing('living.photo.guide'),seen=s.diag.seen();
  const evidence=s.captureEvidence();s.commitEvidence(evidence);s.deck.analyze(evidence);
  return {moved,objective,framing,seen,verified:s.deck.state.guideVerified};
 });
 console.log(JSON.stringify(result));
 assert(result.moved);assert(result.framing.ok);assert(result.seen.targets.includes('living.photo.guide'));
 assert(result.objective.includes('X164'));assert(result.objective.includes('090°'));assert(result.verified);
}finally{await browser.close();}
