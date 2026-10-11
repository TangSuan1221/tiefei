import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const dir=process.argv[2]||'qa/harbor/visual-2026-10-11/creature-fixed-poses';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
try{
 const page=await browser.newPage({viewport:{width:1600,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGL|THREE/i.test(m.text()))errors.push(m.text());});
 await page.route('**/api/**',r=>r.abort());await page.goto('http://127.0.0.1:5174/');await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>!!window.__pod);
 await page.evaluate(()=>{const r=window.__pod;r.receive();r.arrive();r.power=1;r.lamp=true;r.walkTo('camera');});
 await page.waitForFunction(()=>{const s=window.__pod.authoredSite,d=s.world.root.getObjectByName('harbor-accident-dressing')?.userData;return s.visual.root.getObjectByName('rescue-blender-power-cabinet')?.userData.loaded&&d?.loaded&&d?.damageLoaded&&s.visual.elias.userData.skinStatus==='ready';},null,{timeout:60000});
 await page.waitForFunction(()=>window.__pod.authoredSite.visual.monster.getObjectByName('harbor-creature-continuous-skin')?.userData.loaded,null,{timeout:60000});
 await page.waitForTimeout(1200);
 const results=[];
 if(process.env.HARBOR_SHADOW_SYNC==='1'){
  const capture=await page.evaluate(()=>{
   const r=window.__pod,s=r.authoredSite,b=s.base,water=b.water,time=r.clock,rows=[],images=[];
   const c=document.createElement('canvas');c.width=1280;c.height=720;const ctx=c.getContext('2d',{willReadFrequently:true});
   r.pitch=r.camPan=r.camTilt=0;s.position.set(60,0,27);s.pursuit.position.set(64,-1.2,20);
   function draw(recording){s.liveFrameKey='';s.draw(ctx,1280,720,time,recording);return ctx.getImageData(0,0,1280,720).data;}
   function pair(name,recording){const first=draw(recording);images.push({name:name+'-first',image:c.toDataURL()});const ready={lamp:water.pass.uniforms.lampShadowReady.value,keys:water.pass.uniforms.shadowReady.value.toArray(),lampMatrix:water.pass.uniforms.lampShadowMatrix.value.equals(b.lamp.shadow.matrix),keyMatrices:b.harborKeys.map((k,i)=>water.pass.uniforms.shadowMatrix.value[i].equals(k.shadow.matrix))};const second=draw(recording);images.push({name:name+'-second',image:c.toDataURL()});let changed=0,max=0,total=0;for(let i=0;i<first.length;i++){const d=Math.abs(first[i]-second[i]);if(d)changed++;max=Math.max(max,d);total+=d;}rows.push({name,recording,heading:r.heading,changed,max,total,ready});}
   r.heading=0;
   for(const light of [b.lamp,...b.harborKeys]){light.shadow.map?.dispose();light.shadow.map=null;light.shadow.needsUpdate=true;}
   pair('new-shadow-map',false);
   draw(true);pair('film-to-live',false);draw(false);pair('live-to-film',true);
   for(const heading of [1,2,3]){r.heading=heading;pair('turn-'+heading,true);}
   return{time,rows,images};
  });
  for(const row of capture.images){await writeFile(`${dir}/${row.name}.png`,Buffer.from(row.image.split(',')[1],'base64'));delete row.image;}
  results.push(capture);
 }else if(process.env.HARBOR_DYNAMIC_FINAL==='1'){
  const capture=await page.evaluate(()=>{
   const r=window.__pod,s=r.authoredSite,time=r.clock,images=[],sheets=[];
   const c=document.createElement('canvas');c.width=1280;c.height=720;const ctx=c.getContext('2d');
   for(const [pose,pod,creature]of [['observe',[60,0,27],[64,-1.2,20]],['cargo',[77,1,22],[77,-1.2,17.8]]])for(const recording of [false,true]){
    const sheet=document.createElement('canvas');sheet.width=1280;sheet.height=756;const sc=sheet.getContext('2d');
    r.heading=0;r.pitch=r.camPan=r.camTilt=0;s.position.set(...pod);s.pursuit.position.set(...creature);
    s.draw(ctx,1280,720,time-.02,recording);s.draw(ctx,1280,720,time-.01,recording);
    for(let i=0;i<4;i++){
     r.heading=i;r.pitch=r.camPan=r.camTilt=0;s.position.set(...pod);s.pursuit.position.set(...creature);
     s.draw(ctx,1280,720,time+i*.1,recording);
     const name=`${pose}-${recording?'film':'live'}-${i}deg`;images.push({name,image:c.toDataURL()});
     const x=(i%2)*640,y=Math.floor(i/2)*378;sc.drawImage(c,x,y,640,360);sc.fillStyle='#111';sc.fillRect(x,y+360,640,18);sc.fillStyle='#ddd';sc.font='13px monospace';sc.fillText(name+' / time +'+(i*.1).toFixed(1),x+8,y+374);
    }
    sheets.push({name:`${pose}-${recording?'film':'live'}-sequence`,image:sheet.toDataURL()});
   }
   r.heading=90;r.pitch=r.camPan=r.camTilt=0;s.position.set(11,0,40);s.draw(ctx,1280,720,time,false);images.push({name:'maintenance-live',image:c.toDataURL()});
   return{time,method:'Diagnostic adjacent headings 0/1/2/3 degrees at +0/.1/.2/.3 seconds. Not a gameplay pass.',images,sheets};
  });
  for(const row of [...capture.images,...capture.sheets]){await writeFile(`${dir}/${row.name}.png`,Buffer.from(row.image.split(',')[1],'base64'));delete row.image;}
  results.push(capture);
 }else if(process.env.HARBOR_NOISE_AB==='1'){
  const comparison=await page.evaluate(()=>{
   const r=window.__pod,s=r.authoredSite,water=s.base.water,ao=s.base.ao,shader=water.pass.material;
   const originalShader=shader.fragmentShader,aoEnabled=ao.enabled,waterEnabled=water.pass.enabled,time=r.clock,images=[];
   const jitter='float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.98,78.23)))*43758.5);';
   if(!originalShader.includes(jitter))throw Error('Current jitter expression changed; diagnostic replacement aborted');
   r.heading=0;r.pitch=r.camPan=r.camTilt=0;s.position.set(60,0,27);s.pursuit.position.set(64,-1.2,20);
   const c=document.createElement('canvas');c.width=1280;c.height=720;const ctx=c.getContext('2d');
   try{
    for(const name of ['baseline','no-ao','no-water','fixed-jitter']){
     ao.enabled=name!=='no-ao';water.pass.enabled=name!=='no-water';
     shader.fragmentShader=name==='fixed-jitter'?originalShader.replace(jitter,'float jitter=.5;'):originalShader;shader.needsUpdate=true;
     s.draw(ctx,1280,720,time,true);s.draw(ctx,1280,720,time,true);
     images.push({name,image:c.toDataURL(),filmPower:water.pass.uniforms.power.value});
    }
   }finally{ao.enabled=aoEnabled;water.pass.enabled=waterEnabled;shader.fragmentShader=originalShader;shader.needsUpdate=true;}
   return{time,pose:{pod:[60,0,27],creature:[64,-1.2,20],heading:0},images};
  });
  for(const row of comparison.images){await writeFile(`${dir}/observe-film-${row.name}.png`,Buffer.from(row.image.split(',')[1],'base64'));delete row.image;}
  results.push(comparison);
 }else if(process.env.HARBOR_WATER_AB==='1'){
  const comparison=await page.evaluate(()=>{
   const r=window.__pod,s=r.authoredSite,water=s.base.water,original=water.update;
   const time=r.clock,images=[];const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d');
   try{
    for(const [pose,pod,creature]of [['cargo',[77,1,22],[77,-1.2,17.8]],['observe',[60,0,27],[64,-1.2,20]]]){
     r.heading=0;r.pitch=r.camPan=r.camTilt=0;s.position.set(...pod);s.pursuit.position.set(...creature);
     for(const power of [.34,.12,.055]){
      water.update=function(value){return original.call(this,value===.34?power:value);};
      s.draw(ctx,1280,720,time,true);s.draw(ctx,1280,720,time,true);
      images.push({pose,power,image:canvas.toDataURL()});
     }
    }
   }finally{water.update=original;}
   return{time,method:'Diagnostic film-only power replacement. Current live optics, material, cone definitions and other lights unchanged. All poses synchronous at same clock.',images};
  });
  for(const row of comparison.images){await writeFile(`${dir}/${row.pose}-film-power-${row.power}.png`,Buffer.from(row.image.split(',')[1],'base64'));delete row.image;}
  results.push(comparison);
 }else if(process.env.HARBOR_MATERIAL_AB==='1'){
  const comparison=await page.evaluate(()=>{
   const r=window.__pod,s=r.authoredSite,root=s.visual.monster.getObjectByName('harbor-creature-continuous-skin');
   r.heading=0;r.pitch=r.camPan=r.camTilt=0;s.position.set(77,1,22);s.pursuit.position.set(77,-1.2,17.8);
   const materials=new Set();root.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.isMeshPhysicalMaterial)materials.add(m);});
   if(!materials.size)throw Error('No creature physical skin materials found');
   const saved=[...materials].map(m=>({m,clearcoat:m.clearcoat,specularIntensity:m.specularIntensity}));
   const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d');
   const time=r.clock,images=[];
   try{
    for(const variant of [{name:'current',clearcoat:.04,specularIntensity:1},{name:'low-reflection',clearcoat:0,specularIntensity:.6}]){
     for(const m of materials){m.clearcoat=variant.clearcoat;m.specularIntensity=variant.specularIntensity;m.needsUpdate=true;}
     // Both renders stay in this one JS turn, at the identical scene clock,
     // pose and photographic exposure. Shader compilation is warmed first.
     s.draw(ctx,1280,720,time,true);s.draw(ctx,1280,720,time,true);
     images.push({...variant,image:canvas.toDataURL()});
    }
   }finally{for(const old of saved){old.m.clearcoat=old.clearcoat;old.m.specularIntensity=old.specularIntensity;old.m.needsUpdate=true;}}
   return{time,materialCount:materials.size,pose:{pod:[77,1,22],creature:[77,-1.2,17.8],heading:0},original:saved.map(({clearcoat,specularIntensity})=>({clearcoat,specularIntensity})),images};
  });
  for(const image of comparison.images){await writeFile(`${dir}/cargo-film-${image.name}.png`,Buffer.from(image.image.split(',')[1],'base64'));delete image.image;}
  results.push(comparison);
  const maintenance=await page.evaluate(()=>{const r=window.__pod,s=r.authoredSite;r.heading=90;r.pitch=r.camPan=r.camTilt=0;s.position.set(11,0,40);const c=document.createElement('canvas');c.width=1280;c.height=720;s.draw(c.getContext('2d'),1280,720,r.clock,false);return c.toDataURL();});
  await writeFile(`${dir}/maintenance-live.png`,Buffer.from(maintenance.split(',')[1],'base64'));
 }else{
 const poses=[['observe',[60,0,27],[64,-1.2,20]],['cargo',[77,1,22],[77,-1.2,17.8]],['maintenance',[11,0,40],[77,-1.2,17.8]]];
 for(const [name,pod,creature]of poses.filter(v=>!process.env.HARBOR_VIEW||v[0]===process.env.HARBOR_VIEW))for(const recording of (name==='maintenance'?[false]:[false,true])){
  const result=await page.evaluate(({name,pod,creature,recording})=>{
   const r=window.__pod,s=r.authoredSite;r.heading=name==='maintenance'?90:0;r.pitch=r.camPan=r.camTilt=0;s.position.set(...pod);s.pursuit.position.set(...creature);
   const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const context=canvas.getContext('2d');s.draw(context,1280,720,r.clock,recording);
   let vertices=0,meshes=0;s.visual.monster.getObjectByName('harbor-creature-continuous-skin').traverse(o=>{if(o.isMesh){meshes++;vertices+=o.geometry.attributes.position.count;}});
   return{image:canvas.toDataURL(),visibilityAfterDraw:s.visual.monster.visible,meshes,vertices};
  },{name,pod,creature,recording});
  await writeFile(`${dir}/${name}-${recording?'film':'live'}.png`,Buffer.from(result.image.split(',')[1],'base64'));results.push({name,recording,...result,image:undefined});
 }
 }
 await writeFile(`${dir}/results.json`,JSON.stringify({method:'Diagnostic fixed pod and creature positions using the real main renderer; validates appearance and live/film visibility only, not pursuit or playthrough. Renderer restores visibility after exposure, so visibilityAfterDraw is false even for film; compare the actual images.',errors,results},null,2));console.log(JSON.stringify({errors,results}));
}finally{await browser.close();}







