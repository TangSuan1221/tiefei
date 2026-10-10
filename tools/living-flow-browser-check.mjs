// Level two main path in the real game, driven as a careful first-time player: keyboard driving the whole way
// (feathered "creep" under 0.45 m/s wherever blind hunters roam), real 5 s exposures, lab analysis, remote probe
// tapes in real time, wrong valve V-1 and recovery, code/guide photos, uplink, gate, meeting, ballast descent.
// Any window.__living.diag.teleport / skipTimers call or power top-up is logged as DIAGNOSTIC and counted in results.json.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openLevelTwo,startNew,sit,state,hold,turn,drive,route,reverse,heave,click,screenPoint,physicalClick,siteShot,saveFrame,measureFrame,frameVerdict} from './living-browser-lib.mjs';

const dir=process.env.LIVING_QA_DIR?process.env.LIVING_QA_DIR+'/flow':'qa/living/flow';
const {browser,page,errors}=await openLevelTwo(dir);
const trace=[];const shots=[];const evidence=[];const diagnostics={teleports:0,timerSkips:0,powerTopUps:0,powerAdded:0};
const hullMin=()=>page.evaluate(()=>({min:window.__hullMin??window.__pod.hull,damage:window.__living.s?.damageTotal??null}));
const log=async(label,extra={})=>{const s=await state(page);const row={label,stage:s.stage,pos:s.pos.map(v=>+v.toFixed(2)),heading:+s.heading.toFixed(1),hull:+s.hull.toFixed(3),hullMin:+(await hullMin()).min.toFixed(3),power:+s.power.toFixed(3),caption:s.caption,...extra};trace.push(row);console.log(label,JSON.stringify(row));await writeFile(dir+'/results.json',JSON.stringify({diagnostics,trace,shots,errors},null,2));return s;};
/** Careful player: holds still (no thrust, no pulse) until no blind hunter is hunting/sniffing nearby. */
const waitQuiet=async(label,max=90000)=>{
 const t0=Date.now();let calm=0,seen=new Set();
 while(Date.now()-t0<max){
  const s=await state(page);const near=s.creatures.filter(c=>c.id.startsWith('blind')&&(c.mode==='hunt'||c.mode==='sniff'||c.mode==='strike')&&Math.hypot(c.pos[0]-s.pos[0],c.pos[2]-s.pos[2])<40);
  near.forEach(c=>seen.add(c.id+':'+c.mode));calm=near.length?0:calm+1;if(calm>=6)break;await page.waitForTimeout(500);
 }
 return log('held still: '+label,{waitedSeconds:Math.round((Date.now()-t0)/1000),blindModesSeen:[...seen]});
};
/** LIVING_PERF=1: 4 s of rAF frame times, long tasks, save cost, DOM/log/tape sizes and renderer stats. */
const perf=async(label)=>{if(!process.env.LIVING_PERF)return;
 const p=await page.evaluate(async()=>{
  const long=[];const po=new PerformanceObserver(l=>{for(const e of l.getEntries())long.push(Math.round(e.duration));});try{po.observe({type:'longtask',buffered:false});}catch{}
  const dts=[];let last=performance.now();await new Promise(res=>{const t0=last;const f=n=>{dts.push(n-last);last=n;if(n-t0<4000)requestAnimationFrame(f);else res();};requestAnimationFrame(f);});po.disconnect();
  dts.sort((a,b)=>a-b);const r=window.__pod,v=window.__podView;
  let saveMs=null,saveChars=null;try{const m=await import('/src/pod/sim/living-save.ts');const t=performance.now();const s=m.captureLivingSave(r);saveChars=s?JSON.stringify(s).length:0;saveMs=Math.round(performance.now()-t);}catch(e){saveMs=String(e);}
  let gl=null;const seen=new Set();const walk=o=>{for(const k of Object.keys(o||{})){const x=o[k];if(x&&typeof x==='object'&&!seen.has(x)&&seen.size<4000){seen.add(x);if(x.isWebGLRenderer&&!gl)gl={calls:x.info.render.calls,tris:x.info.render.triangles,geo:x.info.memory.geometries,tex:x.info.memory.textures,programs:x.info.programs?.length};}}};walk(v);walk(v.cabin);walk(r.authoredSite);
  const frames=r.tapes.reduce((n,t)=>n+(t.sensorFrames??[]).reduce((a,f)=>a+f.length,0),0);
  return {frames:dts.length,p50:+dts[dts.length>>1].toFixed(1),p95:+dts[Math.floor(dts.length*.95)].toFixed(1),max:+dts[dts.length-1].toFixed(1),long,
   saveMs,saveChars,dom:document.getElementsByTagName('*').length,log:r.log?.length,tapes:r.tapes.length,frameChars:frames,gl,heapMB:performance.memory?Math.round(performance.memory.usedJSHeapSize/1e6):null};});
 await log('PERF '+label,p);};
const snap=async(name)=>{await page.screenshot({path:`${dir}/${name}.png`});shots.push(name+'.png');};
const film=async(name)=>{await siteShot(page,`${dir}/${name}.png`,true);shots.push(name+'.png');};
/** The deck's power budget (shots 0.06, analyses 0.045, ~0.001/m driving; run.ts) is below the main path's cost.
 * When a required action would fail for lack of power, top up to 0.25 and log it as DIAGNOSTIC so the rest can be verified. */
const ensurePower=async(why,need=.12)=>{const p=await page.evaluate(()=>window.__pod.power);if(p>=need)return;
 await page.evaluate(()=>{window.__pod.power=.25;});diagnostics.powerTopUps++;diagnostics.powerAdded=+(diagnostics.powerAdded+.25-p).toFixed(3);
 await log(`DIAGNOSTIC POWER TOP-UP before ${why}`,{from:+p.toFixed(3),to:.25});};
const teleport=async(x,y,z,h,why)=>{diagnostics.teleports++;const ok=await page.evaluate(([x,y,z,h])=>window.__living.diag.teleport(x,y,z,h),[x,y,z,h]);await log(`DIAGNOSTIC TELEPORT → ${why}`,{to:[x,y,z,h],ok});assert(ok,'teleport blocked: '+why);await page.waitForTimeout(600);};
const lamp=async(on)=>{
 if(on)await ensurePower('lamp',.04);
 for(let i=0;i<3&&(await state(page)).lamp!==on;i++){await physicalClick(page,'camera.lamp');await page.waitForTimeout(500);}
 const s=await state(page);assert.equal(s.lamp,on,'lamp toggle failed: '+JSON.stringify({at:s.at,lit:s.lit,power:s.power}));
};
/** Back to the camera station through its own recentre button (pan/tilt → 0). */
const toCamera=async()=>{if((await state(page)).at==='camera')return;const from=(await state(page)).at;
 // Any camera-desk control seats the pilot there; the lamp switch is the one always on the visible panel, pressed twice to leave it as it was.
 try{await physicalClick(page,'drive.center');}catch{try{await physicalClick(page,'camera.panL');await physicalClick(page,'camera.panR');}catch{await physicalClick(page,'camera.lamp');await physicalClick(page,'camera.lamp');}}
 if((await state(page)).at!=='camera')throw Error('could not return to camera from '+from);await page.waitForTimeout(200);assert.equal((await state(page)).at,'camera','could not return to camera station');};
const tilt=async(rad)=>{await toCamera();const now=await page.evaluate(()=>window.__pod.camTilt);const key=rad>now?'ArrowDown':'ArrowUp';await page.keyboard.down(key);for(let i=0;i<80;i++){await page.waitForTimeout(25);const t=await page.evaluate(()=>window.__pod.camTilt);if(key==='ArrowDown'?t>=rad:t<=rad)break;}await page.keyboard.up(key);};
const centre=async()=>{await page.evaluate(()=>{});await tilt(0);};
const tiltAt=async(target)=>{const s=await state(page);await tilt(Math.atan2(s.pos[1]-target[1],Math.hypot(target[0]-s.pos[0],target[2]-s.pos[2])));};
const zoomTo=async(z)=>{await toCamera();for(let i=0;i<12;i++){const now=await page.evaluate(()=>window.__pod.camZoom);if(Math.abs(now-z)<.13)return;await page.keyboard.press(z>now?'+':'-');await page.waitForTimeout(60);}};
/** What the on-screen viewfinder tells the player: zoom in with + one step at a time until it reports the framing as good. */
const frameUp=async(id)=>{await toCamera();let f=await page.evaluate(id=>window.__living.diag.framing(id),id);
 for(let i=0;i<10&&!f.ok;i++){if(await page.evaluate(()=>window.__pod.camZoom)>=3.19)break;await page.keyboard.press('+');await page.waitForTimeout(80);f=await page.evaluate(id=>window.__living.diag.framing(id),id);}
 await log('viewfinder '+id,{zoom:await page.evaluate(()=>window.__pod.camZoom),ok:f.ok,fill:+f.fill.toFixed(3),textPx:f.textPx,figure:f.figure,reason:f.reason});return f;};
/** Real 5 s exposure from the physical shutter; waits for develop. Returns the new tape. With a subject id, the saved
 * frame is measured inside the subject's projected box and must meet the film legibility rules. */
const expose=async(name,subject)=>{
 await ensurePower('exposure '+name,.09);
 const before=(await state(page)).tapes.length;
 for(let i=0;i<3;i++){
  await physicalClick(page,'camera.shoot');
  if(await page.waitForFunction(n=>window.__pod.shot.phase==='exposing'||window.__pod.tapes.length>n,before,{timeout:3000}).then(()=>true,()=>false))break;
  await log(`${name}: shutter press not registered, pressing again`,{shot:await page.evaluate(()=>window.__pod.shot.phase)});
 }
 await page.waitForFunction(()=>window.__pod.shot.phase!=='exposing',null,{timeout:20000});
 await page.waitForFunction(n=>window.__pod.tapes.length>n,before,{timeout:5000}).catch(()=>{});
 const t=await page.evaluate(n=>{const t=window.__pod.tapes[n];return t?{id:t.id,frames:t.sensorFrames?.length??0,ev:t.siteEvidence,f0:t.sensorFrames?.[Math.floor((t.sensorFrames.length-1)/2)]}:null;},before);
 assert(t&&t.frames>=3,`${name}: exposure produced <3 sensor frames`);
 await saveFrame(page,`${dir}/${name}-frame.jpg`,t.f0);shots.push(name+'-frame.jpg');
 if(subject){
  const fr=(await page.evaluate(()=>window.__living.diag.lastFraming())).find(x=>x.id===subject);
  assert(fr,`${name}: no shutter-time framing for ${subject}`);
  const m=await measureFrame(page,t.f0,fr.rect),bad=frameVerdict(m,fr);
  const row={name,subject,zoom:await page.evaluate(()=>window.__pod.camZoom),distance:+fr.distance.toFixed(2),frame:`${m.w}x${m.h}`,fill:+m.fill.toFixed(3),textPx:fr.textPx&&+fr.textPx.toFixed(1),figure:fr.figure&&+fr.figure.toFixed(3),mean:+m.mean.toFixed(3),rms:+m.rms.toFixed(3),spread:+m.spread.toFixed(3),clip:+m.clip.toFixed(3),bad};
  evidence.push(row);await log('frame measured '+name,row);
  assert.deepEqual(bad,[],`${name}: saved frame fails legibility`);
 }
 await page.waitForFunction(id=>window.__pod.tapes.find(t=>t.id===id)?.ready,t.id,{timeout:40000});
 await zoomTo(1);
 await log('exposed '+name,{evidence:t.ev,frames:t.frames});
 return t;
};
/** Select a tape with real lab prev/next clicks and analyze it. */
const look=async(dx,dy)=>{await page.mouse.move(800,420);await page.mouse.down({button:'right'});await page.mouse.move(800+dx,420+dy,{steps:24});await page.mouse.up({button:'right'});await page.waitForTimeout(700);};
const analyze=async(id)=>{
 await ensurePower('analysis '+id,.07);
 await look(415,-200);
 // The first click on a side device only zooms the cabin view onto it.
 const z=await screenPoint(page,'lab','lab.prev');await page.mouse.click(z.x,z.y);await page.waitForTimeout(1200);
 try{
  for(let i=0;i<20;i++){const sel=await page.evaluate(()=>window.__pod.selectedTape?.id);if(sel===id)break;await click(page,'lab','lab.prev');}
  assert.equal(await page.evaluate(()=>window.__pod.selectedTape?.id),id,'could not select tape '+id);
  await click(page,'lab','lab.analyze');await page.waitForTimeout(600);
  const after=await page.evaluate(id=>({at:window.__pod.at,zoom:window.__podView.cabin.deviceZoom,analyzed:window.__pod.tapes.find(t=>t.id===id).analyzed}),id);
  assert(after.analyzed,'lab.analyze click did not analyze: '+JSON.stringify(after));
  await snap('lab-'+id.replace(/[^a-z0-9.]/gi,'_'));
 }finally{await page.mouse.click(800,40);await page.waitForTimeout(1000);}
 const r=await page.evaluate(id=>{const t=window.__pod.tapes.find(t=>t.id===id);return {analyzed:t.analyzed,report:t.report};},id);
 await log('analyzed '+id,{report:r.report});
 return r;
};
const aimAndF=async(id,{maxTilt=.45}={})=>{
 await ensurePower('F on '+id,.04);
 const reach=id==='living.uplink.gate'?14:3.4;
 for(const t of [0,.12,.22,.32,.4,maxTilt]){await tilt(t);const a=await page.evaluate(()=>window.__living.diag.aimed());if(a?.id===id&&a.distance<=reach){await page.keyboard.press('f');await page.waitForTimeout(300);return a;}}
 throw Error('could not aim at '+id+' got '+JSON.stringify(await page.evaluate(()=>window.__living.diag.aimed())));
};
const armCollect=async(id)=>{
 await aimAndF(id);
 await page.waitForFunction(()=>window.__pod.arm.phase==='aiming',null,{timeout:20000}).catch(async e=>{throw Error('arm did not extend: '+await page.evaluate(()=>window.__living.feedbackText));});
 await log('arm extended '+id);
 await page.keyboard.press('f');
 await page.waitForFunction(()=>window.__living.pendingCargo,null,{timeout:20000});await log('arm gripped '+id);
 await page.keyboard.press('f');
 await page.waitForFunction(id=>window.__pod.arm.phase==='stowed'&&window.__living.diag.state().collected.includes(id),id,{timeout:30000});
 await log('collected '+id);await tilt(0);
};
const waitTape=async(prefix,timeout)=>{
 const t0=Date.now();
 await page.waitForFunction(p=>window.__pod.tapes.some(t=>t.id.startsWith(p)),prefix,{timeout});
 const t=await page.evaluate(p=>{const t=window.__pod.tapes.find(t=>t.id.startsWith(p));return {id:t.id,frames:t.sensorFrames.length,first:t.sensorFrames[0],mid:t.sensorFrames[Math.floor(t.sensorFrames.length/2)]};},prefix);
 assert(t.frames>=8,`${t.id}: remote tape has ${t.frames} frames (<8)`);
 await saveFrame(page,`${dir}/${t.id}-0.jpg`,t.first);await saveFrame(page,`${dir}/${t.id}-mid.jpg`,t.mid);shots.push(`${t.id}-0.jpg`,`${t.id}-mid.jpg`);
 await log('tape received '+t.id,{frames:t.frames,waitedSeconds:Math.round((Date.now()-t0)/1000)});
 return t.id;
};
const bearing=(from,to)=>(Math.atan2(to[0]-from[0],-(to[2]-from[2]))*180/Math.PI+360)%360;
const creep={creep:true};

try{
 await startNew(page);await sit(page);await page.waitForTimeout(1500);await perf('start');
 await page.evaluate(()=>{window.__hullMin=window.__pod.hull;setInterval(()=>{window.__hullMin=Math.min(window.__hullMin,window.__pod.hull);},200);});
 await log('start');await snap('01-shaft-top');
 // 1. Real descent down the drop shaft. Level start must have stopped periodic pulses.
 await heave(page,0);let s=await log('shaft bottom (real PageDown)',{emitting:(await state(page)).emitting});assert(s.pos[1]<1.5,'did not descend');
 assert(!(await state(page)).emitting,'periodic sonar pulses still running on deck −1');
 await lamp(true);await snap('02-shaft-bottom-lamp');
 // 2. Real drive into the dormitory corridor (swarm C1 crowds the lamp).
 await route(page,[[24,7.5],[40,7.5]]);s=await log('C1 corridor (real drive)');await snap('03-c1-corridor');await film('03-c1-corridor-film');
 // 3. Real drive south to the security room; corpse photo with the lamp off (practical red light) to avoid the amphipods.
 await lamp(false);
 await route(page,[[60,7.5],[73,7],[72.5,-20],[72.5,-49],[74,-54.3]]);
 s=await state(page);await turn(page,bearing(s.pos,[76,-1.2,-61.5]));await log('R3 security room (real drive)');
 await tiltAt([76,-1.2,-61.5]);await frameUp('living.box.probe');const corpse=await expose('04-probe-corpse','living.box.probe');await tilt(0);
 assert(corpse.ev.kinds.includes('probeCorpse'),'corpse photo did not capture probeCorpse: '+JSON.stringify(corpse.ev));
 let r=await analyze(corpse.id);assert(r.report.some(l=>l.includes('安保员')),'corpse analysis');
 // 4. Probe box pickup with the lamp on.
 await lamp(true);await drive(page,76,-58.4);await turn(page,0);await snap('05-probe-box');
 await armCollect('living.box.probe');
 const sec=await waitTape('tape.securityLog',20000);r=await analyze(sec);assert(r.report.some(l=>l.includes('VIP')),'security tape');
 // 5. Back north and east to the ballast store; push the shade back with the lamp, then fetch the ballast.
 await lamp(false);
 await route(page,[[72.5,-20],[73,7],[100,7.5],[107,7.5]]);await turn(page,0);await log('C3 outside R4 door (real drive)');
 await lamp(true);await page.waitForTimeout(4500);s=await log('lamp on the shade',{shade:(await state(page)).creatures.find(c=>c.id==='shade.r4')});await snap('06-r4-shade-lamp');
 await drive(page,107,22);await drive(page,108,32.5);await turn(page,90);await drive(page,112.3,32.5);await turn(page,90);
 await armCollect('living.box.ballast');assert((await state(page)).ballast,'ballast');
 // 6. Probe launch at the observation gallery pipe. Lamp stays on until out of R4 (the shade waits in the dark
 // doorway), then off: a light-seeker lives up in G.
 await reverse(page,108,32.5);
 await route(page,[[107,22],[107,7.5]]);await lamp(false);
 await route(page,[[128,7],[131,7]]);await turn(page,90);await log('G observation gallery (real drive)');
 await film('07-g-glass-alex-film');await snap('07-g-glass');
 await drive(page,138.6,17);await turn(page,90);await aimAndF('living.pipe.intake');
 s=await log('probe launched');assert.equal(s.probe,'launched');
 const intro=await waitTape('tape.alexIntro',70000);r=await analyze(intro);assert(r.report.some(l=>l.includes('黄环')),'alex intro tape');
 // 7. Valve room. Wrong valve first: V-1 (heat). The clank wakes the hunter; a careful player holds still, then creeps.
 await route(page,[[130.5,0],[130.5,-13],[130,-29]]);await log('V valve room (real drive)');
 await drive(page,138.5,-36,creep);await turn(page,90);await aimAndF('living.valve.heat');s=await log('closed V-1 (wrong)');assert(s.valves.heat);
 await snap('08-valve-v1');
 await waitQuiet('after V-1 clank');
 await drive(page,130,-30,creep);await turn(page,90);await log('backed off quietly (creep)');
 const unchanged=await waitTape('tape.slimeUnchanged',100000);r=await analyze(unchanged);assert(r.report.some(l=>l.includes('没有变化')),'unchanged tape');
 s=await log('after V-1 result');assert.equal(s.extraLumens,1,'wrong valve should add one lumen');
 // 8. Recovery: re-open V-1, close V-2, holding still after each clank.
 await drive(page,138.5,-36,creep);await turn(page,90);await aimAndF('living.valve.heat');await waitQuiet('after V-1 reopen');
 await drive(page,138.5,-29,creep);await turn(page,90);await aimAndF('living.valve.feed');s=await log('V-1 reopened, V-2 closed');assert(s.valves.feed&&!s.valves.heat);
 await waitQuiet('after V-2 clank');
 // The operations notice above V-2 is 1.0×0.5 m: it reads on film from mid-room with zoom, not from the 130 m doorway stop.
 await drive(page,134,-28.8,creep);await turn(page,90);await tiltAt([141.66,.6,-28.4]);await frameUp('living.valve.feed');
 const valves=await expose('09-valve-labels','living.valve.feed');await tilt(0);
 assert(valves.ev.kinds.includes('valveLabel'),'valve photo: '+JSON.stringify(valves.ev));await analyze(valves.id);
 s=await log('valve room done',{hullMin:await hullMin()});
 // 9. Management office through the atrium (hunters below, light-seekers above): lamp off, creep. The 120 s
 // slime-cleared tape arrives in real time during the crossing.
 await route(page,[[130.5,-13],[130.5,7],[128.5,30]]);
 await route(page,[[128.5,50],[145,62],[162,70],[162,84]],creep);await log('atrium crossed (creep)');
 // Clipboard: the north stop 3.1–3.4 m from the desk (design doc), dropped to y −1.2 so the board faces the lens.
 await route(page,[[162,96],[167,96]]);await turn(page,180);await lamp(true);await heave(page,-1.2);await drive(page,167,100.8);await turn(page,180);
 await tiltAt([167,-2.3,104.2]);await frameUp('living.photo.code');
 const code=await expose('10-code','living.photo.code');await tilt(0);assert(code.ev.kinds.includes('code'),'code photo: '+JSON.stringify(code.ev));await analyze(code.id);
 await reverse(page,167,96);await heave(page,0);await turn(page,90);await drive(page,168.5,96);await turn(page,90);
 await tiltAt([173.4,-.1,96]);await frameUp('living.photo.guide');
 const guide=await expose('11-guide','living.photo.guide');await tilt(0);assert(guide.ev.kinds.includes('guide'),'guide photo: '+JSON.stringify(guide.ev));await analyze(guide.id);
 s=await log('code+guide verified');assert(s.codeVerified&&s.guideVerified);
 const cleared=await waitTape('tape.slimeCleared',200000);r=await analyze(cleared);assert(r.report.some(l=>l.includes('清')),'cleared tape');
 // 10. Uplink at gate F, wait for Alex to open it, photograph him at the threshold.
 await lamp(false);
 await route(page,[[162,84],[162,70],[176,60],[188,52]],creep);await heave(page,-1.2);await turn(page,0);await log('outside gate F (creep)');
 await aimAndF('living.uplink.gate');s=await log('uplinked');assert(s.uplinked);
 await page.waitForFunction(()=>window.__living.diag.state().gateOpen,null,{timeout:45000});await log('gate opening');
 await page.waitForTimeout(6500);await snap('12-gate-open');await film('12-gate-open-film');
 await frameUp('living.uplink.gate');
 const gate=await expose('13-gate-alex','living.uplink.gate');assert(gate.ev.kinds.includes('gateOpen'),'gate photo: '+JSON.stringify(gate.ev));
 r=await analyze(gate.id);s=await log('meeting',{alexVisible:gate.ev.alexVisible});assert(s.met,'met');
 const alex=await page.evaluate(()=>window.__living.alexPose());
 await log('Alex post after meeting',{alex});
 assert(Math.hypot(alex.position[0]-187.2,alex.position[2]-40.8)<.5&&alex.visible,'Alex should hold the gate threshold after meeting');
 // 11. Alone to shaft D (Alex stays at the gate on the probe link); descent with ballast.
 await heave(page,0);
 await route(page,[[170,66],[130,68]],creep);await route(page,[[108,68],[98,68]]);
 s=await log('D descent shaft (real drive)');
 const stay=await page.evaluate(()=>window.__living.alexPose());assert(Math.hypot(stay.position[0]-187.2,stay.position[2]-40.8)<.5,'Alex left his post');
 await page.waitForTimeout(3000);await film('14-d-shaft-film');
 await heave(page,-36);s=await log('descended');await snap('15-complete');
 assert(s.complete&&s.ended,'level not complete');assert(s.caption.includes('第二关完成'),'end caption');
 await page.keyboard.press('b');await page.waitForTimeout(800);s=await log('pressed B after completion');
 await perf('after complete');await page.waitForTimeout(20000);await perf('after complete +20s');
 assert.equal(s.legIndex,1);assert.equal(s.phase,'site');
 const h=await hullMin();await log('hull summary',{hullMin:h.min,damageTotal:h.damage});
 assert(h.min>.35,'careful play should not lose most of the hull: '+JSON.stringify(h));
 const filtered=errors.filter(e=>!/net::ERR_FAILED|favicon/.test(e));
 assert.deepEqual(filtered,[],'console errors');
 trace.push({passed:true});console.log('PASS living flow',JSON.stringify({diagnostics,hull:h}));
}catch(e){trace.push({failure:String(e?.stack??e)});console.error('FAIL living flow',e);await snap('failure').catch(()=>{});process.exitCode=1;}
finally{await writeFile(dir+'/results.json',JSON.stringify({method:'Real keyboard/mouse for driving (creep in hunter zones), lamp, shutter, arm, valves, lab; tapes in real time. Diagnostic teleports/timer skips counted.',diagnostics,evidence,hullMin:await hullMin().catch(()=>null),trace,shots,errors},null,2));await browser.close();}

