import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-unsafe-swiftshader']});
const page=await browser.newPage();const blocked=[];const errors=[];page.on('pageerror',e=>errors.push(String(e)));
await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!=='http://127.0.0.1:5180'||u.pathname.startsWith('/api/')){blocked.push(u.href);return r.abort();}return r.continue();});
await page.addInitScript(()=>{const W=window.WebSocket;window.WebSocket=function(url,protocols){if(String(protocols??'').includes('vite'))return {addEventListener(){},removeEventListener(){},close(){},send(){},readyState:0};return new W(url,protocols);};window.WebSocket.prototype=W.prototype;});
const glbRequests=[];page.on("request",r=>{if(new URL(r.url()).pathname.endsWith(".glb"))glbRequests.push({url:r.url(),method:r.method()});});let result;
try{
 await page.goto('http://127.0.0.1:5180/?level=2');await page.evaluate(()=>{for(const k of Object.keys(localStorage))if(k.startsWith('ironlung.'))localStorage.removeItem(k);});
 await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__living,null,{timeout:60000});await page.evaluate(()=>window.__living.world.ready);
 result=await page.evaluate(async()=>{
 const l=window.__living,w=l.world;window.GM.noVideo(true);const T=await import('/node_modules/three/build/three.module.js'),{LIVING_SPACES}=await import('/src/pod/content/living-deck-layout.ts');
 const ids=new Set(['L','M','N']);const areas=LIVING_SPACES.filter(s=>ids.has(s.id)).map(s=>({id:s.id,box:new T.Box3(new T.Vector3(s.minX+1,s.floorY+.15,s.minZ+1),new T.Vector3(s.maxX-1,s.ceilY-.15,s.maxZ-1))}));
 const spaces=[],names=[],lights=[];w.root.traverse(o=>{if(/^living-space:/.test(o.name))spaces.push(o.name);if(/alex|elias|cocoon|slime/i.test(o.name))names.push({name:o.name,type:o.type,children:o.children.length});if(o.isLight)lights.push({name:o.name,type:o.type,pos:o.getWorldPosition(new T.Vector3()).toArray()});});
 const coreColliders=areas.map(a=>({id:a.id,structural:w.colliders.filter(b=>b.intersectsBox(a.box)).map(b=>({min:b.min.toArray(),max:b.max.toArray()})),decor:w.decorColliders.filter(b=>b.intersectsBox(a.box)).map(b=>({min:b.min.toArray(),max:b.max.toArray()})),walkable:w.walkable.filter(b=>b.intersectsBox(a.box)).length}));
 w.root.updateMatrixWorld(true);const coreMeshVertices=[];let checkedMeshes=0;
 w.root.traverse(o=>{if(!o.isMesh||!o.geometry?.attributes.position)return;checkedMeshes++;const g=o.geometry;g.computeBoundingBox();const transforms=[];if(o.isInstancedMesh){for(let i=0;i<o.count;i++){const m=new T.Matrix4();o.getMatrixAt(i,m);transforms.push(o.matrixWorld.clone().multiply(m));}}else transforms.push(o.matrixWorld);for(const m of transforms){const bb=g.boundingBox.clone().applyMatrix4(m);const relevant=areas.filter(a=>a.box.intersectsBox(bb));if(!relevant.length)continue;const p=g.attributes.position,v=new T.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(m);const area=relevant.find(a=>a.box.containsPoint(v));if(area){coreMeshVertices.push({name:o.name,parent:o.parent?.name,space:area.id,vertex:v.toArray(),visible:o.visible});break;}}}});
 const before={objects:0};w.root.traverse(()=>before.objects++);const state=l.worldState(false);w.update({...state,alex:{position:[170,-1,-14],heading:0,visible:true,pose:'film'},slime:1},.016);w.setFocus([170,-1,-14]);const after={objects:0};w.root.traverse(()=>after.objects++);
 const practical=w.practicalLights.filter(x=>ids.has(x.space)),mood=w.moodLights.filter(x=>ids.has(x.space));
 const residual={probeShots:w.probeShots,alexRoot:l.alexRoot??null,alexLamp:l.alexLamp??null,namedNodes:names};
 return {pass:!spaces.some(n=>/^living-space:[LMN]$/.test(n))&&!practical.length&&!mood.length&&coreColliders.every(x=>!x.structural.length&&!x.decor.length&&!x.walkable)&&!coreMeshVertices.length&&l.alexRoot===undefined&&l.alexLamp===undefined,spaces,practical,mood,lights,coreColliders,coreMeshVertices,checkedMeshes,objectCount:{before:before.objects,after:after.objects},photoTargets:[...w.photoTargets.keys()],residual};
 });
result.forbiddenGlbRequests=glbRequests.filter(r=>/living-diver-alex|cocoon-corpse|living-creature-/i.test(r.url));result.pass=result.pass&&result.forbiddenGlbRequests.length===0;
} catch(e){result={pass:false,error:String(e)};}finally{writeFileSync('qa/living-2026-10-27/personnel-runtime-audit.json',JSON.stringify({result,glbRequests,blocked,errors},null,2));await browser.close();}
console.log(JSON.stringify(result,null,2));if(!result.pass)process.exitCode=1;



