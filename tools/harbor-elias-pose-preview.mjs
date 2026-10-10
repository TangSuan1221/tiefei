// Renders the survivor in every story performance key from the 01 observation point.
//   node tools/harbor-elias-pose-preview.mjs [filter]     (needs the dev server; HARBOR_URL overrides)
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const URL=process.env.HARBOR_URL??'http://127.0.0.1:5173/',OUT='qa/elias-poses';
await mkdir(OUT,{recursive:true});
// stage: wall (PT-003/PT-004), walk (VP-012, t = seconds into the departure), arrived (VP-011)
const SHOTS=[
 ['pt003-frozen','frozen','wall'],['pt003-signals_pod','signals_pod','wall'],['pt003-guarded','guarded','wall'],['pt003-listening','listening','wall'],
 ['pt004-hidden','hidden','wall'],['pt004-peeking','peeking','wall'],['pt004-palm_stay','palm_stay','wall'],['pt004-watching','watching','wall'],['default-empty','','wall'],
 ['vp012-rail','rail','walk',3],['vp012-walking','walking','walk',3],['vp012-glance_back-a','glance_back','walk',1.2],['vp012-glance_back-b','glance_back','walk',2.6],['vp012-glance_back-c','glance_back','walk',4.2],
 ['vp011-trust_wave','trust_wave','arrived'],['vp011-wary','wary','arrived'],['vp011-still','still','arrived'],
];
const filter=process.argv[2];
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
try{
 const p=await browser.newPage({viewport:{width:1280,height:800}});p.on('pageerror',e=>console.log('ERROR',e.message));p.on('framenavigated',f=>{if(f===p.mainFrame())console.log('navigated',f.url());});p.on('console',m=>{if(/vite|reload|^pose/i.test(m.text()))console.log('[console]',m.text().slice(0,200));});
 await p.route('**/api/**',r=>r.abort());
 // Other sessions edit the tree; a Vite reload during boot is retried.
 const boot=async()=>{for(let attempt=1;;attempt++){try{await p.goto(URL);await p.locator('[data-id="new"]').click();await p.waitForLoadState('load');await p.waitForFunction(()=>!!window.__pod?.authoredSite,null,{timeout:60000});await p.waitForTimeout(1500);
  await p.evaluate(()=>{const r=window.__pod;r.receive();r.arrive();r.lamp=true;r.walkTo('camera');});await p.waitForTimeout(800);return;}catch(e){if(attempt>=6)throw e;console.log('boot retry',String(e.message).split('\n')[0]);}}};
 await boot();
 const sheet=[];
 for(const [name,beat,stage,t=0] of SHOTS){
  if(filter&&!name.includes(filter))continue;
  let images;for(let attempt=1;!images;attempt++)try{images=await p.evaluate(({beat,stage,t})=>{
   const r=window.__pod,s=r.authoredSite,st=s.rescue.value;
   Object.defineProperty(s,'eliasBeat',{configurable:true,get:()=>beat});
   st.departing=false;s.elapsed+=1/30;s.syncVisual();
   Object.assign(st,{signal:true,heard:true,replied:true,identified:true,warned:true,powered:true,gateOpen:false,gateClosed:true,monsterInside:true,isolated:true,verified:stage!=='wall',departing:stage!=='wall',departed:stage==='arrived',departureSeconds:stage==='arrived'?10:0});
   if(stage==='wall')Object.assign(st,{isolated:false,monsterInside:false,gateClosed:false});
   s.elapsed+=2;s.syncVisual();
   const frames=stage==='walk'?Math.round(t*30):45;
   for(let i=0;i<frames;i++){s.elapsed+=1/30;if(stage==='walk')st.departureSeconds+=1/30;s.syncVisual();}
   const shot=(pos,heading,pitch,zoom)=>{s.position.set(...pos);r.heading=heading;r.pitch=pitch;r.camPan=r.camTilt=0;r.camZoom=zoom;const c=document.createElement('canvas');c.width=1280;c.height=800;s.draw(c.getContext('2d'),1280,800,r.clock,false);return c.toDataURL();};
   const e=s.visual.elias.position,obs=[60,0,27],dx=e.x-obs[0],dz=e.z-obs[2],h=-Math.atan2(-dx,-dz)*180/Math.PI;
   const out={far:shot(obs,h,4,1),zoom:shot(obs,h,4,4.5)};r.camZoom=1;
   const el=s.visual.elias,up=el.getObjectByName('elias-upper'),hd=el.getObjectByName('elias-head'),f=v=>+v.toFixed(2);
   console.log('pose',JSON.stringify({pos:el.position.toArray().map(f),yaw:f(el.rotation.y),torso:[up.rotation.x,up.rotation.y].map(f),head:[hd.rotation.x,hd.rotation.y].map(f)}));return out;
  },{beat,stage,t});}catch(e){if(attempt>=3)throw e;console.log(name,'retry',String(e.message).split('\n')[0]);await boot();}
  for(const [k,v] of Object.entries(images))await writeFile(`${OUT}/${name}-${k}.png`,Buffer.from(v.split(',')[1],'base64'));
  sheet.push({name,...images});console.log(name);
 }
 // Contact sheet: zoomed crop above, the unzoomed (player distance) crop at 3x below.
 const data=await p.evaluate(async cells=>{const load=src=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src=src;});
  const W=300,H=300,F=150,cols=6,rows=Math.ceil(cells.length/cols),c=document.createElement('canvas');c.width=cols*W;c.height=rows*(H+F+18);const g=c.getContext('2d');g.fillStyle='#222';g.fillRect(0,0,c.width,c.height);g.imageSmoothingEnabled=false;
  for(let n=0;n<cells.length;n++){const x=(n%cols)*W,y=Math.floor(n/cols)*(H+F+18),z=await load(cells[n].zoom),f=await load(cells[n].far);
   g.drawImage(z,340,0,600,600,x,y,W,H);g.drawImage(f,590,312,100,100,x+75,y+H,F,F);g.fillStyle='#fff';g.font='13px sans-serif';g.fillText(cells[n].name,x+4,y+H+F+14);}
  return c.toDataURL();},sheet);
 if(sheet.length)await writeFile(`${OUT}/_sheet${filter?'-'+filter:''}.png`,Buffer.from(data.split(',')[1],'base64'));
}finally{await browser.close();}
