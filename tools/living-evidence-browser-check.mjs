// Deck −1 evidence film legibility (MET-030): at each legal photo stop, frame the subject with the real camera keys
// (arrow tilt, + zoom), take a real 5 s exposure, then measure the saved sensor frame inside the subject's projected box:
// area ≥ 8%, key text ≥ 12 px at the lab's playback size, a person ≥ 20% of frame height, and luma contrast/exposure
// that show the subject was metered and not swallowed by fog. A too-distant shot must come back as a waste reel with advice.
// Stops are reached by DIAGNOSTIC teleport (the walk there is covered by living-flow-browser-check).
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openLevelTwo,startNew,sit,state,physicalClick,saveFrame,measureFrame,frameVerdict,FRAME_RULES} from './living-browser-lib.mjs';

const dir=(process.env.LIVING_QA_DIR??'qa/living')+'/evidence';
const {browser,page,errors}=await openLevelTwo(dir);
const rows=[];let teleports=0,topUps=0;
const save=()=>writeFile(dir+'/results.json',JSON.stringify({rules:FRAME_RULES,teleports,topUps,rows,errors},null,2));
const power=async()=>{if(await page.evaluate(()=>window.__pod.power)<.15){await page.evaluate(()=>{window.__pod.power=.4;});topUps++;}};
const tilt=async(rad)=>{const now=await page.evaluate(()=>window.__pod.camTilt);if(Math.abs(now-rad)<.01)return;const key=rad>now?'ArrowDown':'ArrowUp';await page.keyboard.down(key);for(let i=0;i<120;i++){await page.waitForTimeout(20);const t=await page.evaluate(()=>window.__pod.camTilt);if(key==='ArrowDown'?t>=rad:t<=rad)break;}await page.keyboard.up(key);};
const zoomTo=async(z)=>{for(let i=0;i<12;i++){const now=await page.evaluate(()=>window.__pod.camZoom);if(Math.abs(now-z)<.13)return;await page.keyboard.press(z>now?'+':'-');await page.waitForTimeout(60);}};
const framing=id=>page.evaluate(id=>window.__living.diag.framing(id),id);
const park=async(p,target)=>{
 const h=(Math.atan2(target[0]-p[0],-(target[2]-p[2]))*180/Math.PI+360)%360;
 teleports++;const ok=await page.evaluate(([x,y,z,h])=>window.__living.diag.teleport(x,y,z,h),[...p,h]);assert(ok,'teleport blocked '+p);
 await page.waitForTimeout(800);await zoomTo(1);
 await tilt(Math.atan2(p[1]-target[1],Math.hypot(target[0]-p[0],target[2]-p[2])));
};
/** Player behaviour: zoom in one + step at a time while the viewfinder says the framing is short. */
const frameUp=async id=>{let f=await framing(id);for(let i=0;i<10&&!f.ok;i++){if(await page.evaluate(()=>window.__pod.camZoom)>=3.19)break;await page.keyboard.press('+');await page.waitForTimeout(80);f=await framing(id);}return f;};
const expose=async name=>{
 await power();const before=(await state(page)).tapes.length;
 for(let i=0;i<3;i++){await physicalClick(page,'camera.shoot');if(await page.waitForFunction(n=>window.__pod.shot.phase==='exposing'||window.__pod.tapes.length>n,before,{timeout:3000}).then(()=>true,()=>false))break;}
 await page.waitForFunction(()=>window.__pod.shot.phase!=='exposing',null,{timeout:20000});
 await page.waitForFunction(n=>window.__pod.tapes.length>n,before,{timeout:5000});
 await page.waitForFunction(n=>window.__pod.tapes[n]?.ready,before,{timeout:40000});
 const t=await page.evaluate(n=>{const t=window.__pod.tapes[n];return {id:t.id,frames:t.sensorFrames.length,ev:t.siteEvidence,mid:t.sensorFrames[Math.floor((t.sensorFrames.length-1)/2)],framing:window.__living.diag.lastFraming()};},before);
 await saveFrame(page,`${dir}/${name}-frame.jpg`,t.mid);
 return t;
};
// Lamp as a careful player uses it (flow): off where light-seekers live (R3 amphipods, V practicals), on in R5.
const targets=[
 {name:'probe-corpse',id:'living.box.probe',kind:'probeCorpse',at:[74,0,-54.3],look:[76,-1.2,-61.5],lamp:false},
 // The VIP notice on the valve-manifold GLB is 1.0×0.5 m: from the old 130 m stop it is ~3 px, so the shot is taken mid-room.
 {name:'valve-label',id:'living.valve.feed',kind:'valveLabel',at:[134,0,-28.8],look:[141.66,.6,-28.4],lamp:false},
 // Design doc's north stop for the clipboard (3.1–3.4 m, nose clear of the desk).
 {name:'code-note',id:'living.photo.code',kind:'code',at:[167,-1.2,100.8],look:[167,-2.3,104.2],lamp:true},
 {name:'gate-guide',id:'living.photo.guide',kind:'guide',at:[168.5,0,96],look:[173.4,-.1,96],lamp:true},
 {name:'delroy-form',id:'living.photo.delroy',kind:'delroy',at:[154.5,0,92],look:[150.6,-.1,92],lamp:true},
];
const lamp=async on=>{for(let i=0;i<3&&(await state(page)).lamp!==on;i++){await physicalClick(page,'camera.lamp');await page.waitForTimeout(500);}assert.equal((await state(page)).lamp,on,'lamp');};
try{
 await startNew(page);await sit(page);await page.waitForTimeout(1200);
 await power();await lamp(true);
 // Waste reel: the old 9.7 m code stop at 1× cannot show the note.
 await park([162,0,96],[167,-2.04,104]);
 const far=await frameUp.call(null,'living.photo.code').then(async()=>{await zoomTo(1);return framing('living.photo.code');});
 await page.screenshot({path:`${dir}/00-waste-viewfinder.png`});
 const waste=await expose('00-waste-code-9m');
 rows.push({name:'waste-code-9m',framing:far,evidence:waste.ev});
 assert(!waste.ev.valid&&!waste.ev.kinds.includes('code'),'far code shot should be a waste reel: '+JSON.stringify(waste.ev));
 assert(/废片/.test(waste.ev.diagnostic??'')&&/靠近|开得更近|变焦/.test(waste.ev.diagnostic),'waste reel should tell the player to close in or zoom: '+waste.ev.diagnostic);
 await save();
 for(const t of targets){
  await lamp(t.lamp);await park(t.at,t.look);
  const f=await frameUp(t.id);
  await page.screenshot({path:`${dir}/${t.name}-viewfinder.png`});
  assert(f.ok,`${t.name}: no zoom from ${t.at} frames it: ${f.reason}`);
  const zoom=await page.evaluate(()=>window.__pod.camZoom);
  const shot=await expose(t.name);
  const fr=shot.framing.find(x=>x.id===t.id);
  assert(fr,`${t.name}: shutter-time framing missing`);
  const m=await measureFrame(page,shot.mid,fr.rect);
  const bad=frameVerdict(m,fr);
  const row={name:t.name,id:t.id,zoom,distance:+fr.distance.toFixed(2),frame:`${m.w}x${m.h}`,fill:+m.fill.toFixed(3),textPx:fr.textPx&&+fr.textPx.toFixed(1),figure:fr.figure,
   mean:+m.mean.toFixed(3),rms:+m.rms.toFixed(3),spread:+m.spread.toFixed(3),clip:+m.clip.toFixed(3),outMean:+m.outMean.toFixed(3),valid:shot.ev.valid,kinds:shot.ev.kinds,bad};
  rows.push(row);console.log(JSON.stringify(row));await save();
  assert.equal(m.w,1280,`${t.name}: deck −1 film should be 1280 wide`);
  assert(shot.ev.valid&&shot.ev.kinds.includes(t.kind),`${t.name}: evidence ${JSON.stringify(shot.ev)}`);
  assert.deepEqual(bad,[],`${t.name}: frame fails legibility`);
 }
 await zoomTo(1);
 const filtered=errors.filter(e=>!/net::ERR_FAILED|favicon/.test(e));
 assert.deepEqual(filtered,[],'console errors');
 console.log('PASS living evidence',JSON.stringify({teleports,topUps}));
}catch(e){rows.push({failure:String(e?.stack??e)});console.error('FAIL living evidence',e);await page.screenshot({path:dir+'/failure.png'}).catch(()=>{});process.exitCode=1;}
finally{await save();await browser.close();}
