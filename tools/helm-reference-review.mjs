import {openLevelTwo,sit} from './living-browser-lib.mjs';
import {writeFile,readFile} from 'node:fs/promises';
const dir=process.env.HELM_REVIEW_DIR??'qa/helm-reference-review';
const {browser,page,errors}=await openLevelTwo(dir,{query:''});
const failedRequests=[];page.on('requestfailed',request=>{const url=new URL(request.url());failedRequests.push({url:url.origin+url.pathname,failure:request.failure()?.errorText});});
try {
 await page.setViewportSize({width:1920,height:1080});
 await page.locator('[data-id="new"]').click();
 await page.waitForFunction(()=>!!window.__podView&&!!window.__pod?.authoredSite,null,{timeout:60000});
 // Diagnostic-only bypass of the separately developed onboarding sequence.
 // Its new start already seats the operator at navigation, so walking-to-seat is invalid.
 const prologueBypassed=await page.evaluate(()=>{const p=window.__pod.prologue;if(p?.active){p.step=999;return true;}return false;});
 if(await page.evaluate(()=>!!window.__pod.at))await page.evaluate(()=>window.__pod.walkTo('camera'));else await sit(page);
 await page.evaluate(async()=>{await document.fonts.ready;window.__pod.power=1;});await page.waitForTimeout(2000);
 await page.waitForFunction(()=>{const maps=[];window.__podView.cabin.scene.traverse(o=>{for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m?.map?.userData.helmAuthoredAlbedo)maps.push(m.map);});return maps.every(m=>m.userData.loadState==='loaded'||m.userData.loadState==='error');},null,{timeout:30000});
 await page.screenshot({path:dir+'/helm.png'});
 await page.evaluate(()=>{const c=window.__podView.cabin;c.deviceZoom=null;c.manualLook=true;c.yaw=0;c.pitch=-.60;});await page.waitForTimeout(1400);
 await page.screenshot({path:dir+'/panel.png'});
 const probe=()=>page.evaluate(()=>{
  const c=window.__podView.cabin,found={};
  c.scene.traverse(o=>{let ancestor=o;while(ancestor&&!ancestor.userData.control)ancestor=ancestor.parent;if(!ancestor)return;const id=ancestor.userData.control;if(!/^(helm\.|camera\.|arm\.|drive\.|nav\.pitch)/.test(id)||found[id]?.hit)return;const p=o.getWorldPosition(c.camera.position.clone()).project(c.camera),x=(p.x+1)*innerWidth/2,y=(1-p.y)*innerHeight/2;let picked=null;
   search:for(const dy of [0,-4,4,-12,12])for(const dx of [0,-4,4,-12,12]){const hit=window.__podView.pick(x+dx,y+dy);if(hit?.endsWith(':'+id)){picked={x:x+dx,y:y+dy,hit};break search;}}if(!found[id]||picked)found[id]=picked??{x,y,hit:null};
  });const authoredTextures=[];c.scene.traverse(o=>{for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m?.map?.userData.helmAuthoredAlbedo)authoredTextures.push({name:o.name,state:m.map.userData.loadState});});return {controls:found,render:c.renderer.info.render,memory:c.renderer.info.memory,authoredTextures};
 });
 const diagnostics=await probe();
 const shadow=await page.evaluate(async()=>{const c=window.__podView.cabin,run=window.__pod,snap=()=>({at:c.helmShadowAt,pose:{...c.helmShadowPose},gear:run.throttle}),delay=()=>new Promise(r=>setTimeout(r,200));const before=snap();await delay();const still=snap();c.helmInput.yaw=.5;await delay();const turned=snap();c.helmInput.yaw=0;await delay();const restored=snap(),originalGear=run.throttle;run.throttle=originalGear===1?2:1;await delay();const gearChanged=snap();run.throttle=originalGear;await delay();return {before,still,turned,restored,gearChanged,gearRestored:snap()};});
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(600);
 const compact=await probe();await page.screenshot({path:dir+'/panel-1440.png'});
 await page.setViewportSize({width:1920,height:1080});await page.waitForTimeout(600);
 // Review-only model closeup; the real operator views are captured above.
 const fit=await page.evaluate(()=>{
  const c=window.__podView.cabin,panel=c.scene.getObjectByName('helm-reference-panel');panel.updateWorldMatrix(true,false);
  const view=window.__podView,frozenPost=structuredClone(view.post),frozenExtras=structuredClone(view.extras),frozenTime=view.clock,pipelineRender=view.pipeline.render.bind(view.pipeline);
  view.pipeline.render=(frame,extras)=>pipelineRender({...frame,time:frozenTime,post:frozenPost},frozenExtras);c.__reviewMainIntensity=c.lamp.intensity;
  const post={barrel:frozenPost.barrel,breathe:frozenPost.breathe,breathPhase:frozenExtras.breathPhase,heartPulse:frozenExtras.heartPulse,offset:{x:view.sceneOffset.x/view.scene.width,y:view.sceneOffset.y/view.scene.height}};
  c.__reviewProject=q=>{let u=(q.x+1)/2+post.offset.x,v=(q.y+1)/2-post.offset.y;const dx=u-.5,dy=v-.5,sourceRadius=Math.hypot(dx,dy);let radius=sourceRadius;for(let i=0;i<10;i++){const r2=radius*radius,k=post.barrel;radius-=(radius*(1+k*r2+k*k*.72*r2*r2)-sourceRadius)/(1+3*k*r2+5*k*k*.72*r2*r2);}if(sourceRadius>1e-8){u=.5+dx*radius/sourceRadius;v=.5+dy*radius/sourceRadius;}const heart=1-post.heartPulse*.0022;u=.5+(u-.5)/heart;v=.5+(v-.5)/heart;const bp=post.breathPhase,asym=bp<0?bp*1.35:bp*.85,scale=1-post.breathe*.006*asym;u=.5+(u-.5)/scale;v=.5+(v-.5-post.breathe*.0016*asym)/scale;return[u*1024,(1-v)*572];};
  const corners=[[-.775,.268,.08],[.780,.268,.08],[.780,-.232,.08],[-.775,-.232,.08]].map(p=>panel.localToWorld(c.camera.position.clone().set(...p)));
  const target=[[99,157],[956,160],[1012,481],[25,481]],camera=c.camera.clone();camera.aspect=1920/1080;
  const project=v=>{camera.position.set(.12,v[0],v[1]);camera.lookAt(v[4],v[2],-1.42);camera.fov=v[3];camera.updateProjectionMatrix();camera.updateMatrixWorld();return corners.map(p=>c.__reviewProject(p.clone().project(camera)));};
  const loss=v=>v[0]<1.1||v[0]>2.2||v[1]<-1.3||v[1]>.1||v[3]<20||v[3]>80?1e9:project(v).reduce((s,p,i)=>s+(p[0]-target[i][0])**2+(p[1]-target[i][1])**2,0);
  let v=[1.37,-.65,.96,40,.12],steps=[.08,.08,.04,4,.02],best=loss(v);for(let epoch=0;epoch<240;epoch++){let changed=false;for(let j=0;j<5;j++)for(const sign of [-1,1]){const next=[...v];next[j]+=steps[j]*sign;const l=loss(next);if(l<best){v=next;best=l;changed=true;}}if(!changed)steps=steps.map(s=>s*.75);}
  c.__reviewFit=v;return{measurementSize:[1024,572],parameters:v,target,projected:project(v),rmsPixels:Math.sqrt(best/8),panelScale:panel.scale.toArray(),post,reviewFreeze:{time:frozenTime,post:frozenPost,extras:frozenExtras,mainIntensity:c.__reviewMainIntensity}};
 });
 await page.evaluate(()=>{const c=window.__podView.cabin,render=c.renderer.render.bind(c.renderer);c.renderer.render=(scene,camera)=>{if(c.__reviewAngle){const [y,z,lookY,fov,lookX]=c.__reviewFit;camera.position.set(.12,y,z);camera.lookAt(lookX,lookY,-1.42);camera.fov=fov;}else{camera.position.set(.12,1.53,-.93);camera.lookAt(.12,.91,-1.42);camera.fov=43;}c.lamp.intensity=c.__reviewMainIntensity;camera.updateProjectionMatrix();render(scene,camera);};});await page.waitForTimeout(700);
 await page.screenshot({path:dir+'/closeup.png'});
 await page.evaluate(()=>window.__podView.cabin.__reviewAngle=true);await page.waitForTimeout(500);
 await page.screenshot({path:dir+'/reference-angle.png'});
 const rawThree=await page.evaluate(()=>{const c=window.__podView.cabin;c.renderer.render(c.scene,c.camera);return c.renderer.domElement.toDataURL('image/png').split(',')[1];});await writeFile(dir+'/raw-three.png',Buffer.from(rawThree,'base64'));
 if(process.env.HELM_RED_VARIANT==='1'){await page.evaluate(()=>{for(const name of ['helm-port-warning-lens','helm-starboard-warning-lens'])window.__podView.cabin.scene.getObjectByName(name).material.opacity=.55;});await page.waitForTimeout(300);await page.screenshot({path:dir+'/red-opacity055.png'});await page.evaluate(()=>{for(const name of ['helm-port-warning-lens','helm-starboard-warning-lens'])window.__podView.cabin.scene.getObjectByName(name).material.opacity=.76;});await page.waitForTimeout(300);}
 const projectedControls=await page.evaluate(()=>{const c=window.__podView.cabin,camera=c.camera.clone(),[y,z,lookY,fov,lookX]=c.__reviewFit;camera.position.set(.12,y,z);camera.lookAt(lookX,lookY,-1.42);camera.fov=fov;camera.updateProjectionMatrix();camera.updateMatrixWorld();const boxes={};
  const bounds=(mesh,id)=>{const attr=mesh.geometry.attributes.position;let l=Infinity,r=-Infinity,t=Infinity,b=-Infinity;for(let i=0;i<attr.count;i++){const q=camera.position.clone().set(attr.getX(i),attr.getY(i),attr.getZ(i)).applyMatrix4(mesh.matrixWorld).project(camera);const [x,y]=c.__reviewProject(q);l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}boxes[id]={center:[(l+r)/2,(t+b)/2],size:[r-l,b-t],bounds:[l,t,r,b]};};
  for(const mesh of c.helmKeys)bounds(mesh,mesh.userData.control);const grip=c.scene.getObjectByName('helm-throttle-grip');if(grip)bounds(grip,'helm.throttle.grip');const mount=c.scene.getObjectByName('helm-stick-mount');mount?.traverse(o=>{if(o.geometry?.type==='SphereGeometry'&&o.geometry.parameters.radius>.03)bounds(o,'helm.stick.grip');});const boot=[];mount?.children.forEach((o,i)=>{if(o.geometry){const id='__boot'+i;bounds(o,id);boot.push(boxes[id].bounds);delete boxes[id];}});if(boot.length){const l=Math.min(...boot.map(b=>b[0])),t=Math.min(...boot.map(b=>b[1])),r=Math.max(...boot.map(b=>b[2])),b=Math.max(...boot.map(b=>b[3]));boxes['helm.stick.bootAndFlange']={center:[(l+r)/2,(t+b)/2],size:[r-l,b-t],bounds:[l,t,r,b]};}for(const name of ['helm-port-warning-lens','helm-starboard-warning-lens','helm-stick-grip','helm-stick-boot','helm-lamp-cap','helm-lamp-base','helm-lamp-indicator','helm-brake-guard','helm-brake-cap','helm-brake-plunger','helm-brake-stem','helm-front-skirt','helm-front-lip','label-制动']){const mesh=c.scene.getObjectByName(name);if(mesh?.geometry)bounds(mesh,name);}c.scene.traverse(o=>{if(o.geometry?.type==='SphereGeometry'&&o.material?.emissive?.getHex()===0xd07a13)bounds(o,'helm-amber-lens');});return boxes;});
 if(process.env.HELM_LIGHT_VARIANTS==='1')for(const intensity of (process.env.HELM_LIGHT_VALUES??'.13,.26,.39').split(',').map(Number)){await page.evaluate(intensity=>{const c=window.__podView.cabin;for(const entry of c.normalLights){if(entry.light.name==='helm-task-light')entry.intensity=intensity;else if(entry.light.parent?.name==='helm-reference-panel'&&entry.light.isPointLight)entry.intensity=.08;}},intensity);await page.waitForTimeout(500);await page.screenshot({path:dir+'/light-'+String(intensity).replace('.','')+'.png'});}
 if(process.env.HELM_FRONT_VARIANTS==='1')for(const intensity of [.055,.09]){await page.evaluate(intensity=>{for(const e of window.__podView.cabin.normalLights)if(e.light.name==='helm-front-bounce')e.intensity=intensity;},intensity);await page.waitForTimeout(500);await page.screenshot({path:dir+'/front-'+String(intensity).replace('.','')+'.png'});}
 const materialState=await page.evaluate(()=>{const scene=window.__podView.cabin.scene;return Object.fromEntries(['helm-lamp-indicator','helm-front-skirt','helm-front-lip','helm-port-warning-lens'].map(name=>{const m=scene.getObjectByName(name)?.material;return[name,m?{name:m.name,type:m.type,color:m.color?.toArray(),colorHex:m.color?.getHexString(),emissive:m.emissive?.toArray(),emissiveHex:m.emissive?.getHexString(),emissiveIntensity:m.emissiveIntensity,roughness:m.roughness,metalness:m.metalness,toneMapped:m.toneMapped,opacity:m.opacity,transparent:m.transparent}:null];}));});
 await writeFile(dir+'/diagnostics.json',JSON.stringify({errors,failedRequests,...diagnostics,shadow,compact,fit,projectedControls,materialState,prologueBypassed},null,2));
 const ref=await readFile('qa/helm-reference-review/reference.png');
 const shot=await readFile(dir+'/reference-angle.png');
 await page.setContent(`<body style="margin:0;background:#171717;color:#ddd;font:20px sans-serif"><div style="display:flex;gap:16px;padding:16px"><div style="width:1024px">A<img style="width:1024px;height:576px;object-fit:contain" src="data:image/png;base64,${shot.toString('base64')}"></div><div style="width:1024px">B<img style="width:1024px;height:576px;object-fit:contain" src="data:image/png;base64,${ref.toString('base64')}"></div></div></body>`);
 await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));
 await page.setViewportSize({width:2096,height:632});await page.waitForTimeout(500);await page.screenshot({path:dir+'/comparison-ab.png'});
 console.log(JSON.stringify({dir,errors,...diagnostics,shadow,compact}));
}finally{await browser.close();}

