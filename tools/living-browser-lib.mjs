// Shared helpers for level-two (deck −1) browser checks. Read-only state probes plus real input.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

export const BASE=process.env.LIVING_URL??'http://127.0.0.1:5192';

export async function openLevelTwo(dir,{query='?level=2',clearStorage=true}={}){
 await mkdir(dir,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:1600,height:900}});
 // Other agents keep editing sources; a Vite HMR full reload would silently restart the run mid-check.
 await context.addInitScript(()=>{const Native=window.WebSocket;window.WebSocket=function(url,protocols){if(String(protocols??'').includes('vite'))return {addEventListener(){},removeEventListener(){},close(){},send(){},readyState:0};return new Native(url,protocols);};window.WebSocket.prototype=Native.prototype;Object.assign(window.WebSocket,{OPEN:1,CLOSED:3,CONNECTING:0,CLOSING:2});});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push('pageerror: '+e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
 await page.route('**/api/**',r=>r.abort());
 await page.goto(BASE+'/'+query);
 if(clearStorage)await page.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.startsWith('ironlung.'))localStorage.removeItem(k);});
 return {browser,context,page,errors};
}

export async function startNew(page){
 await page.locator('[data-id="new"]').click();
 await page.waitForFunction(()=>!!window.__podView&&!!window.__pod?.authoredSite&&!!window.__living,null,{timeout:60000});
}

/** Walk to the console with W and sit with E (same as a player). */
export async function sit(page){
 await page.keyboard.down('w');
 await page.waitForFunction(()=>window.__podView.cabin.consoleInReach(),null,{timeout:15000}).finally(()=>page.keyboard.up('w'));
 for(let i=0;i<3;i++){await page.keyboard.press('e');await page.waitForTimeout(1200);if(await page.evaluate(()=>window.__pod.at==='camera'))return;}
 await page.waitForFunction(()=>window.__pod.at==='camera',null,{timeout:10000});
}

export const state=page=>page.evaluate(()=>{const r=window.__pod,l=window.__living;return {...l.diag.state(),at:r.at,lamp:r.lamp,lit:r.lit,power:r.power,hull:r.hull,speed:r.pilot.speed,
 caption:r.storyCaption,arm:r.arm.phase,shot:r.shot.phase,tapes:r.tapes.map(t=>({id:t.id,ready:t.ready,analyzed:t.analyzed,frames:t.sensorFrames?.length??0,ev:t.siteEvidence})),
 legIndex:r.legIndex,phase:r.phase,canDepart:r.canDepart,emitting:r.sonarEmitting};});

export const hold=async(page,key,ms)=>{await page.keyboard.down(key);await page.waitForTimeout(ms);await page.keyboard.up(key);};
export const angle=(h,t)=>(t-h+540)%360-180;

/** Real J/L yaw until the hull heading is within tolerance. */
export async function turn(page,target,tol=1.5){
 await hold(page,'Shift',600);
 for(let k=0;k<10;k++){
  let s=await state(page),d=angle(s.heading,target);if(Math.abs(d)<tol)return s;
  const key=d>0?'l':'j';await page.keyboard.down(key);
  let stuck=0,prev=s.heading;
  for(let i=0;i<400;i++){
   await page.waitForTimeout(60);s=await state(page);
   if(Math.abs(angle(prev,s.heading))<.01)stuck++;else stuck=0;prev=s.heading;
   if(stuck>40){await page.keyboard.up(key);throw Error(`turn blocked toward ${target} at ${s.heading} pos ${s.pos}`);}
   const rate=await page.evaluate(()=>window.__pod.pilot.yawRate);
   if(Math.abs(angle(s.heading,target))<Math.abs(rate)/2.4+.35||Math.sign(angle(s.heading,target))!==Math.sign(d))break;
  }
  await page.keyboard.up(key);await page.waitForTimeout(900);
 }
 return state(page);
}

/** Real Space/N thrust along the current heading toward (x,z). creep: feather the thrust to stay under the 0.45 m/s wash threshold. */
export async function drive(page,x,z,{tol=.4,creep=false}={}){
 let s=await state(page);
 const dx=x-s.pos[0],dz=z-s.pos[2],dist=Math.hypot(dx,dz);if(dist<tol)return s;
 const desired=(Math.atan2(dx,-dz)*180/Math.PI+360)%360;
 await turn(page,desired);
 await page.keyboard.down(' ');let down=true;
 let stall=0,last=s.pos;
 for(let i=0;i<(creep?6000:1600);i++){
  await page.waitForTimeout(100);s=await state(page);
  const remaining=((x-s.pos[0])*dx+(z-s.pos[2])*dz)/dist;
  if(remaining<Math.abs(s.speed)/3.2+.12)break;
  if(creep){if(down&&s.speed>.34){await page.keyboard.up(' ');down=false;}else if(!down&&s.speed<.28){await page.keyboard.down(' ');down=true;}}
  if(Math.hypot(s.pos[0]-last[0],s.pos[2]-last[2])<.001)stall++;else stall=0;last=s.pos;
  if(stall>40){await page.keyboard.up(' ');throw Error(`drive blocked to ${x},${z}: ${JSON.stringify(s.pos)}`);}
 }
 if(down)await page.keyboard.up(' ');await hold(page,'Shift',1400);
 return state(page);
}

/** Real N reverse thrust, keeping the heading, until the hull backs past (x,z). For rooms too tight to yaw a 5 m hull. */
export async function reverse(page,x,z){
 let s=await state(page);
 const dx=x-s.pos[0],dz=z-s.pos[2],dist=Math.hypot(dx,dz);if(dist<.4)return s;
 await page.keyboard.down('n');let stall=0,last=s.pos;
 for(let i=0;i<1200;i++){
  await page.waitForTimeout(100);s=await state(page);
  if(((x-s.pos[0])*dx+(z-s.pos[2])*dz)/dist<Math.abs(s.speed)/3.2+.12)break;
  if(Math.hypot(s.pos[0]-last[0],s.pos[2]-last[2])<.001)stall++;else stall=0;last=s.pos;
  if(stall>40){await page.keyboard.up('n');throw Error(`reverse blocked to ${x},${z}: ${JSON.stringify(s.pos)}`);}
 }
 await page.keyboard.up('n');await hold(page,'Shift',1400);
 return state(page);
}

/** Drives a waypoint list; returns the final state. */
export async function route(page,points,opts={}){let s;for(const [x,z] of points)s=await drive(page,x,z,opts);return s;}

/** Real PageUp/PageDown heave to a target y. */
export async function heave(page,y,tol=.3){
 let s=await state(page);
 const key=y>s.pos[1]?'PageUp':'PageDown';
 await page.keyboard.down(key);
 let stall=0,last=s.pos[1];
 for(let i=0;i<2400;i++){
  await page.waitForTimeout(80);s=await state(page);
  if(Math.abs(s.pos[1]-y)<tol+Math.abs(await page.evaluate(()=>window.__pod.pilot.verticalSpeed??0))*.8)break;
  if(Math.abs(s.pos[1]-last)<.0005)stall++;else stall=0;last=s.pos[1];
  if(stall>40)break;
 }
 await page.keyboard.up(key);await page.waitForTimeout(1500);
 return state(page);
}

export async function screenPoint(page,station,action){
 return page.evaluate(({station,action})=>{const v=window.__podView,c=v.cabin,s=c.screens.find(s=>s.id===station),r=s.hits.rectOf(action);if(!r)throw Error('No hit '+action);
  const g=s.mesh.geometry.parameters,q=c.camera.position.clone().set(((r.x+r.w/2)/1024-.5)*g.width,(.5-(r.y+r.h/2)/720)*g.height,0).applyMatrix4(s.mesh.matrixWorld).project(c.camera),x=(q.x+1)*innerWidth/2,y=(1-q.y)*innerHeight/2;
  for(const dy of [0,-2,2,-4,4,-8,8,-12,12,-16,16])for(const dx of [0,-2,2,-4,4,-8,8,-12,12,-16,16])if(v.pick(x+dx,y+dy)==='desk:'+station+':'+action)return{x:x+dx,y:y+dy};
  throw Error('Unreachable '+station+':'+action);},{station,action});
}
export async function click(page,station,action){const q=await screenPoint(page,station,action);await page.mouse.click(q.x,q.y);await page.waitForTimeout(200);}
export async function physicalClick(page,id){
 const q=await page.evaluate(id=>{const v=window.__podView;for(let y=60;y<innerHeight-20;y+=5)for(let x=40;x<innerWidth-40;x+=5)if(v.pick(x,y)==='desk:camera:'+id)return{x,y};return null;},id);
 if(!q)throw Error('Unreachable physical '+id);
 await page.mouse.click(q.x,q.y);await page.waitForTimeout(200);
}

/** Saves the site's own render (live or film optics) as PNG. */
export async function siteShot(page,path,recording){
 const data=await page.evaluate(rec=>{const c=document.createElement('canvas');c.width=1024;c.height=720;window.__living.draw(c.getContext('2d'),1024,720,performance.now()/1000,rec);window.__living.width=0;return c.toDataURL('image/png');},recording);
 await writeFile(path,Buffer.from(data.split(',')[1],'base64'));
}
/** Thresholds a saved evidence frame must meet inside the subject's projected box (MET-030 film legibility). */
export const FRAME_RULES={fill:.08,textPx:12,figure:.2,rms:.035,spread:.12,meanLo:.06,meanHi:.85,clip:.04};

/**
 * Decodes a saved sensor frame in the page and measures it inside a projected subject rectangle (NDC [x0,y0,x1,y1]):
 * area share, luma mean, RMS contrast (std of luma), p5–p95 spread, and the mean just outside the box.
 */
export async function measureFrame(page,dataUrl,rect){
 return page.evaluate(async({dataUrl,rect})=>{
  const img=new Image();img.src=dataUrl;await img.decode();
  const w=img.naturalWidth,h=img.naturalHeight,c=document.createElement('canvas');c.width=w;c.height=h;
  const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const d=ctx.getImageData(0,0,w,h).data;
  const px=[Math.max(0,Math.floor((rect[0]+1)/2*w)),Math.max(0,Math.floor((1-rect[3])/2*h)),Math.min(w,Math.ceil((rect[2]+1)/2*w)),Math.min(h,Math.ceil((1-rect[1])/2*h))];
  const L=(i)=>(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255;
  const inside=[];let out=0,on=0;
  for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){const l=L((y*w+x)*4);if(x>=px[0]&&x<px[2]&&y>=px[1]&&y<px[3])inside.push(l);else{out+=l;on++;}}
  if(!inside.length)return {w,h,px,fill:0,mean:0,rms:0,spread:0,outMean:on?out/on:0};
  const mean=inside.reduce((a,b)=>a+b,0)/inside.length,rms=Math.sqrt(inside.reduce((a,b)=>a+(b-mean)**2,0)/inside.length);
  inside.sort((a,b)=>a-b);const q=f=>inside[Math.min(inside.length-1,Math.floor(f*inside.length))];
  const clip=inside.filter(l=>l>=.97).length/inside.length;
  return {w,h,px,fill:(px[2]-px[0])*(px[3]-px[1])/(w*h),mean,rms,spread:q(.95)-q(.05),clip,outMean:on?out/on:0};
 },{dataUrl,rect});
}
export function frameVerdict(m,f){
 const R=FRAME_RULES,bad=[];
 if(m.fill<R.fill)bad.push(`fill ${(m.fill*100).toFixed(1)}%<8%`);
 if(f.textPx!==null&&f.textPx<R.textPx)bad.push(`text ${f.textPx.toFixed(1)}px<12`);
 if(f.figure!==null&&f.figure<R.figure)bad.push(`figure ${(f.figure*100).toFixed(0)}%<20%`);
 if(m.rms<R.rms)bad.push(`rms ${m.rms.toFixed(3)}<${R.rms}`);
 if(m.spread<R.spread)bad.push(`spread ${m.spread.toFixed(3)}<${R.spread}`);
 if(m.mean<R.meanLo||m.mean>R.meanHi)bad.push(`mean ${m.mean.toFixed(3)} outside ${R.meanLo}–${R.meanHi}`);
 if(m.clip>R.clip)bad.push(`clipped ${(m.clip*100).toFixed(1)}%>${R.clip*100}%`);
 return bad;
}
export async function saveFrame(page,path,dataUrl){await writeFile(path,Buffer.from(dataUrl.split(',')[1],'base64'));}
