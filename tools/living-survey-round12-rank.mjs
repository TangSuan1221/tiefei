import {openLevelTwo,startNew,sit,siteShot} from './living-browser-lib.mjs';
import {writeFileSync} from 'node:fs';
const out='qa/living-survey/round12';const {browser,page}=await openLevelTwo(out);
try{await startNew(page);await sit(page);await page.evaluate(()=>window.__living.world.ready);const report=[];
for(const x of [144,151]){
 await page.evaluate(x=>{window.__living.diag.teleport(x,0,60,90);window.__pod.pitch=0;window.__pod.lamp=true;},x);await page.waitForTimeout(700);
 await siteShot(page,`${out}/rank-${x}-live.png`,false);
 report.push(await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),w=window.__living,eye=w.camera.getWorldPosition(new T.Vector3()),dir=w.camera.getWorldDirection(new T.Vector3());
 const lights=[...w.world.practicalLights,...w.world.moodLights];const target=lights.find(l=>l.position[0]===154&&l.position[1]===8.2);
 const cases=[];for(const moved of [false,true]){const all=lights.filter(l=>!l.staticOnly).map(l=>{const p=moved&&l===target?[191,3,57]:l.position,to=new T.Vector3(...p).sub(eye),d=to.length(),ahead=d<3?1:.25+.75*Math.max(0,to.dot(dir)/d);return {position:p,space:l.space,key:!!l.key,intensity:l.intensity,range:l.range,d,ahead,w:l.intensity*Math.sqrt(l.range)/(4+d*d)*ahead,passesRange:d<l.range+18,target:l===target};});
 const ranked=all.filter(l=>l.passesRange).sort((a,b)=>b.w-a.w);const mood=ranked.filter(l=>l.key&&(l.space==='A'||l.ahead>.55)).sort((a,b)=>Number(b.space==='A')-Number(a.space==='A')||b.w-a.w)[0];if(mood){ranked.splice(ranked.indexOf(mood),1);ranked.unshift(mood);}cases.push({moved,target:all.find(l=>l.target),targetRank:ranked.findIndex(l=>l.target),selected:ranked.slice(0,2),next:ranked.slice(2,5)});}
 return {eye:eye.toArray(),dir:dir.toArray(),cases};}));
}writeFileSync(`${out}/ranking.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}finally{await browser.close();}
