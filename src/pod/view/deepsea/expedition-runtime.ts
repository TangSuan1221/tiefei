import { ACESFilmicToneMapping, Box3, Color, FogExp2, HemisphereLight, Mesh, Object3D, PerspectiveCamera, PointLight, Raycaster, Scene, SpotLight, Vector2, Vector3, WebGLRenderer, PCFShadowMap, PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createReferenceMaterials } from './reference-materials';
import { createReferenceWater } from './reference-water';
import { createExpeditionWorld } from './expedition-world';
import { EXPEDITION_ART } from './expedition-art-direction';
import { createExpeditionAtmosphere } from './expedition-atmosphere';
import { createExpeditionSurfaceMaps } from './expedition-surface-maps';
import { expeditionDoorPosition } from '../../content/expedition';
import { expeditionNavigation, roomAddress, LANDMARK_NAMES } from '../../content/expedition-navigation';
import { createExpedition, newExpeditionState, interactExpedition, openDoor, canOpenDoor, estimateExpeditionRoute, type ExpeditionLevel, type ExpeditionState, type ExpeditionResult } from '../../content/expedition';

const $ = <T extends HTMLElement = HTMLElement>(id:string) => document.getElementById(id) as T;
const query = new URLSearchParams(location.search);
if(query.has('clean')) document.body.classList.add('clean');
// New authored floor plans must not silently restore old-world positions or gate progress.
// Previous saves are retained under v1; no user data is deleted.
const savePrefix = query.has('qa') ? 'ironlung.expedition.qa.v2.' : 'ironlung.expedition.v2.';
const canvas = $<HTMLCanvasElement>('view');
const keys = new Set<string>(), ray = new Raycaster(), center = new Vector2();
const direction = new Vector3(), right = new Vector3(), velocity = new Vector3();
const doorOpenedAt = new Map<string,number>();
const itemBounds = new Map<string,Box3>();
let yaw=0, pitch=0, lightOn=true, dragging=false, stopped=false, last=0, time=0, elapsed=0, lastSave=0, lastUI=0, raf=0;
let toastUntil=0, target:{id:string;door:boolean}|null=null;
let focusDistance=12, adaptivePower=85;
let navigationOn=false;
let world:ReturnType<typeof createExpeditionWorld>;
let level:ExpeditionLevel, state:ExpeditionState;
const scene = new Scene();scene.background=new Color('#030b10');scene.fog=new FogExp2('#0b2431',.038);
const camera=new PerspectiveCamera(64,innerWidth/innerHeight,.08,120);camera.rotation.order='YXZ';
const renderer=new WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.4));renderer.setSize(innerWidth,innerHeight,false);
renderer.toneMapping=ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=PCFShadowMap;
// Dim prefiltered indirect reflections keep unlit steel readable without emissive metal.
const reflectionRoom=new RoomEnvironment(),pmrem=new PMREMGenerator(renderer);
const reflections=pmrem.fromScene(reflectionRoom,.14);scene.environment=reflections.texture;scene.environmentIntensity=.08;
reflectionRoom.dispose();pmrem.dispose();
const materials=createReferenceMaterials();
const surfaceMaps=createExpeditionSurfaceMaps();
const atmosphere=createExpeditionAtmosphere();scene.add(atmosphere.root);
const lamp=new SpotLight('#c4e8ed',85,42,.68,.85,1.25);lamp.castShadow=true;
lamp.shadow.mapSize.set(2048,2048);lamp.shadow.camera.near=.2;lamp.shadow.camera.far=42;lamp.shadow.bias=-.0002;lamp.shadow.normalBias=.025;lamp.shadow.radius=3;
scene.add(lamp,lamp.target);
const fill=new PointLight('#73b7c8',9,12,1.8);scene.add(fill);
const ambient=new HemisphereLight('#5d91a1','#05090b',.20);scene.add(ambient);
const practicalKey=new PointLight('#799fa4',13,17,2);
const practicalRim=new PointLight('#c28349',4,12,2);
scene.add(practicalKey,practicalRim);
const facilityLights=[practicalKey,practicalRim,new PointLight(),new PointLight()];
for(const light of facilityLights){light.decay=1.6;scene.add(light);}
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
const ao=new SSAOPass(scene,camera,innerWidth,innerHeight);ao.kernelRadius=.2;ao.minDistance=.002;ao.maxDistance=.12;composer.addPass(ao);
const water=createReferenceWater(camera,lamp,ao.normalRenderTarget.depthTexture!);composer.addPass(water.pass);
const bloom=new UnrealBloomPass(new Vector2(innerWidth,innerHeight),.13,.5,1.2);composer.addPass(bloom);
const output=new OutputPass();composer.addPass(output);
const optics=new ShaderPass({uniforms:{tDiffuse:{value:null}},vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D tDiffuse;varying vec2 v;void main(){vec2 q=v-.5;float r=dot(q,q);vec2 u=.5+q*(1.+r*.055);vec3 c=texture2D(tDiffuse,u).rgb;float edge=smoothstep(.2,.6,length(q));gl_FragColor=vec4(c*(1.-edge*.62),1.);}'});composer.addPass(optics);

function toast(message:string,seconds=5){$('toast').textContent=message;toastUntil=time+seconds;}
function paused(){return !!document.querySelector('dialog[open]') || document.hidden;}
function clearInput(){keys.clear();velocity.set(0,0,0);dragging=false;}
function storageKey(index:number){return savePrefix+index;}
function readSave(index:number):unknown {try{return JSON.parse(localStorage.getItem(storageKey(index))??'null');}catch{return null;}}
function validStrings(value:unknown,allowed:Set<string>):string[]{return Array.isArray(value)?[...new Set(value.filter((x):x is string=>typeof x==='string'&&allowed.has(x)))]:[];}
function save(){
  try{localStorage.setItem(storageKey(level.index),JSON.stringify({version:1,state,position:camera.position.toArray(),yaw,pitch,elapsed}));}
  catch{toast('浏览器未允许保存，本次进度只保留在当前页面。');}
  lastSave=time;
}
function loadLevel(index:number,reset=false){
  clearInput();target=null;doorOpenedAt.clear();itemBounds.clear();focusDistance=12;adaptivePower=85;
  if(world){scene.remove(world.root);world.dispose();}
  level=createExpedition(index);state=newExpeditionState(level);elapsed=0;
  const art=EXPEDITION_ART[index];(scene.fog as FogExp2).color.set(art.fog);(scene.fog as FogExp2).density=art.density;
  lamp.color.set(art.key);fill.color.set(art.fill);practicalKey.color.set(art.fixture);practicalRim.color.set(art.accent);
  const saved=reset?null:readSave(index) as {state?:Partial<ExpeditionState>;position?:number[];yaw?:number;pitch?:number;elapsed?:number}|null;
  if(saved?.state?.version===1 && saved.state.levelId===level.id){
    const ids=new Set(level.items.map(i=>i.id)),edges=new Set(level.edges.map(e=>e.id));
    state.collected=validStrings(saved.state.collected,ids);state.recorded=validStrings(saved.state.recorded,new Set(level.items.filter(i=>i.kind==='record').map(i=>i.id)));
    state.inventory=validStrings(saved.state.inventory,new Set(level.items.flatMap(i=>i.grants??[])));
    state.opened=validStrings(saved.state.opened,new Set([...ids,...edges]));state.visited=validStrings(saved.state.visited,new Set(level.rooms.map(r=>r.id)));
    if(!state.visited.includes(level.startRoom))state.visited.push(level.startRoom);
    state.completed=!!saved.state.completed && state.collected.includes(level.items.find(i=>i.kind==='exit')!.id);
    elapsed=Number.isFinite(saved.elapsed)?Math.max(0,saved.elapsed!):0;
  }
  world=createExpeditionWorld(level,materials,surfaceMaps.maps);scene.add(world.root);world.update(state,100);
  world.root.updateMatrixWorld(true);
  for(const [id,object] of world.interactables)itemBounds.set(id,new Box3().setFromObject(object));
  camera.position.set(level.spawn[0],0,level.spawn[1]);
  const first=level.edges.find(e=>e.from===level.startRoom||e.to===level.startRoom)!;
  const room=level.rooms.find(r=>r.id===(first.from===level.startRoom?first.to:first.from))!;
  yaw=Math.atan2(-(room.x-camera.position.x),-(room.z-camera.position.z));pitch=0;
  if(world.entryView){const entry=world.entryView,p=new Vector3(...entry.view);if(canMove(p)){camera.position.copy(p);yaw=entry.yaw;pitch=entry.pitch;}}
  if(saved?.position?.length===3 && saved.position.every(Number.isFinite)){
    const candidate=new Vector3(...saved.position as [number,number,number]);
    if(canMove(candidate))camera.position.copy(candidate);
    if(Number.isFinite(saved.yaw))yaw=saved.yaw!;
    if(Number.isFinite(saved.pitch))pitch=Math.max(-1.1,Math.min(1.1,saved.pitch!));
  }
  $('level-title').textContent=`${String(index+1).padStart(2,'0')} / ${level.name}`;
  $('loading').hidden=true;
  const url=new URL(location.href);url.searchParams.set('level',String(index+1));history.replaceState(null,'',url);
  toast(`${level.description}\nF 操作门与实物；M 查看已探明地图。`,9);
  pose();updateHUD();drawMap();save();
}
function pose(){
  // Text route boards are an optional accessibility aid. The default scene is
  // read through pressure doors, service cables, incident trails and light.
  const routeBoards=world?.root.getObjectByName(`expedition-wayfinding.${level.id}`);
  if(routeBoards)routeBoards.visible=navigationOn;
  camera.rotation.set(pitch,yaw,Math.sin(time*.35)*.003);camera.updateMatrixWorld();camera.getWorldDirection(direction);right.set(1,0,0).applyQuaternion(camera.quaternion);
  lamp.position.copy(camera.position).addScaledVector(right,.5);lamp.position.y-=.22;
  lamp.target.position.copy(camera.position).addScaledVector(direction,12);
  // Close-range lamp regulation avoids washing out the very objects being inspected.
  lamp.intensity=lightOn?adaptivePower:0;fill.position.copy(camera.position);fill.intensity=lightOn?Math.min(2.5,adaptivePower*.09):.04;ambient.intensity=lightOn?.16:.05;
  water.update(lightOn?.5:0);
  const occupied=level.rooms.find(r=>Math.abs(r.x-camera.position.x)<r.width/2&&Math.abs(r.z-camera.position.z)<r.depth/2);
  const available=world.practicalLights.filter(l=>occupied?l.room===occupied.id:Math.hypot(l.position[0]-camera.position.x,l.position[2]-camera.position.z)<14).sort((a,b)=>Math.hypot(a.position[0]-camera.position.x,a.position[2]-camera.position.z)-Math.hypot(b.position[0]-camera.position.x,b.position[2]-camera.position.z));
  facilityLights.forEach((light,i)=>{const source=available[i];if(source){light.position.set(...source.position);light.color.set(source.color);light.intensity=source.intensity;light.distance=source.range;}else light.intensity=0;});
}
function canMove(p:Vector3){
  if(!world || p.y< -1.25 || p.y>2.75)return false;
  const radius=.28;
  for(const [dx,dz] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]]){
    const test=new Vector3(p.x+dx,p.y,p.z+dz);
    if(!world.walkable.some(b=>b.containsPoint(test)))return false;
  }
  if(world.colliders.some(b=>b.clone().expandByScalar(radius).containsPoint(p)))return false;
  for(const [id,bounds] of itemBounds){
    const item=level.items.find(i=>i.id===id)!;
    if(state.collected.includes(id)&&(item.kind==='pickup'||item.kind==='cache'))continue;
    if(bounds.clone().expandByScalar(radius).containsPoint(p))return false;
  }
  for(const [id,door] of world.doors){if((!state.opened.includes(id)||time-(doorOpenedAt.get(id)??-999)<1.2)&&door.bounds.clone().expandByScalar(radius).containsPoint(p))return false;}
  return true;
}
function step(dt:number){
  if(paused()){clearInput();return;}
  yaw+=(+keys.has('arrowleft')-+keys.has('arrowright'))*dt*.85;
  pitch=Math.max(-1.1,Math.min(1.1,pitch+(+keys.has('arrowup')-+keys.has('arrowdown'))*dt*.65));
  camera.getWorldDirection(direction);right.set(1,0,0).applyQuaternion(camera.quaternion);
  const wish=new Vector3().addScaledVector(direction,+keys.has('w')-+keys.has('s')).addScaledVector(right,+keys.has('d')-+keys.has('a'));
  wish.y+=+keys.has('e')-+keys.has('q');if(wish.lengthSq()>1)wish.normalize();
  wish.multiplyScalar(1.6);velocity.lerp(wish,1-Math.exp(-dt*5));
  // Swept microsteps prevent crossing a thin closed door during a slow frame.
  const parts=Math.max(1,Math.ceil(velocity.length()*dt/.1));
  for(let i=0;i<parts;i++)for(const axis of ['x','y','z'] as const){const p=camera.position.clone();p[axis]+=velocity[axis]*dt/parts;if(canMove(p))camera.position.copy(p);else velocity[axis]=0;}
  for(const r of level.rooms){if(Math.abs(camera.position.x-r.x)<r.width/2&&Math.abs(camera.position.z-r.z)<r.depth/2&&!state.visited.includes(r.id)){state.visited.push(r.id);save();}}
}
function interactionData(object:Object3D):{id:string;door:boolean}|null{
  let at:Object3D|null=object;
  while(at){if(at.userData.interactionId)return{id:at.userData.interactionId,door:false};if(at.userData.doorId)return{id:at.userData.doorId,door:true};at=at.parent;}
  return null;
}
function visibleThroughParents(object:Object3D){let at:Object3D|null=object;while(at){if(!at.visible)return false;at=at.parent;}return true;}
function aim(){
  if(paused()){target=null;$('interaction').textContent='';return;}
  ray.setFromCamera(center,camera);ray.near=0;ray.far=18;
  // The first physical surface wins: an object behind a closed door or wall cannot be used.
  const hit=ray.intersectObject(world.root,true).find(h=>h.object instanceof Mesh && visibleThroughParents(h.object));
  focusDistance=hit?.distance??18;
  target=hit&&hit.distance<=3.4?interactionData(hit.object):null;
  if(!target){$('interaction').textContent='';return;}
  if(target.door){const edge=level.edges.find(e=>e.id===target!.id)!;
    $('interaction').textContent=state.opened.includes(edge.id)?'通道已打开':canOpenDoor(level,state,edge.id)?'F  开启转运门':`F  核对隔离门\n需要：${requirements(edge.requires)}`;
  }else{
    const item=level.items.find(i=>i.id===target!.id)!;
    $('interaction').textContent=state.collected.includes(item.id)?`${item.name}\n已完成`:`F  ${item.kind==='cache'?(state.opened.includes(item.id)?'取出物资':'打开箱盖'):item.kind==='pickup'?'回收':item.kind==='record'?'核验记录':'操作'} · ${item.name}`;
  }
}
function requirements(ids:string[]=[]){return ids.filter(id=>!state.inventory.includes(id)).map(id=>level.items.find(i=>i.id===id)?.name??level.stages.find(s=>s.grants===id)?.name??'通行许可').join('、')||'条件已满足';}
function interact(id?:string):ExpeditionResult{
  if(paused())return{ok:false,message:'面板打开时不能操作。'};
  pose();aim();
  if(!target || (id && target.id!==id))return{ok:false,message:'请靠近并瞄准可见对象（3.4 米内）。'};
  const actual=target.id;
  let result:ExpeditionResult;
  if(target.door){const wasOpen=state.opened.includes(actual);result=openDoor(level,state,actual);if(result.ok&&!wasOpen)doorOpenedAt.set(actual,time);}
  else result=interactExpedition(level,state,actual);
  const item=level.items.find(i=>i.id===actual);
  if(!result.ok){const req=item?.requires??level.edges.find(e=>e.id===actual)?.requires;result={ok:false,message:state.collected.includes(actual)?result.message:`尚缺：${requirements(req)}`};}
  toast(result.message+(result.ok&&item?`\n${item.description}`:''));
  if(result.ok){world.update(state,time);save();updateHUD();
    if(state.completed&&item?.kind==='exit'){
      $('completion').textContent=`${level.name}已完成。探索 ${Math.floor(elapsed/60)} 分 ${Math.floor(elapsed%60)} 秒，进入 ${state.visited.length}/${level.rooms.length} 个舱室，完成 ${state.collected.length}/${level.items.length} 项作业。`;
      $('next-level').textContent=level.index===6?'返回航线':'进入下一关';showDialog('complete-dialog');
    }
  }
  return result;
}
function updateHUD(){
  const current=level.rooms.find(r=>Math.abs(camera.position.x-r.x)<r.width/2&&Math.abs(camera.position.z-r.z)<r.depth/2);
  $('location').textContent=current?`${roomAddress(current)} / ${current.name}`:'设施连接管廊 / 沿舱室编号通行';
  const stage=level.stages.find(s=>!state.inventory.includes(s.grants));
  if(stage){const missing=stage.objectives.filter(id=>!state.collected.includes(id));
    $('objective').textContent=missing.length?`${stage.name}：${missing.map(id=>level.items.find(i=>i.id===id)!.name).join('；')}。完成后前往控制前室核验。`:`返回${stage.name}控制前室，操作核验终端。`;
  }else $('objective').textContent=state.completed?'航段完成。可以继续回收支路物资，或进入下一关。':'四区许可齐全，前往出口接口确认离开。';
  $('progress').textContent=`区域许可 ${level.stages.filter(s=>state.inventory.includes(s.grants)).length}/4 · 测绘 ${state.visited.length}/${level.rooms.length}\n回收 / 核验 ${state.collected.length}/${level.items.length}`;
  $('telemetry').textContent=`${Math.floor(elapsed/60).toString().padStart(2,'0')}:${Math.floor(elapsed%60).toString().padStart(2,'0')} · ${velocity.length().toFixed(1)} M/S · ${lightOn?'灯亮':'静默'}`;
  const nav=expeditionNavigation(level,state,camera.position.x,camera.position.z,yaw);
  $('navigation').classList.toggle('off',!navigationOn);
  if(nav&&navigationOn){
    const target=level.rooms.find(r=>r.id===nav.target)!,next=level.rooms.find(r=>r.id===nav.next)!;
    $('nav-address').textContent=`下一通道 ${roomAddress(next)} · ${Math.round(nav.distance)} m`;
    $('nav-target').textContent=`${roomAddress(target)} / ${level.items.find(i=>i.id===nav.item)!.name}`;
    $('nav-arrow').style.transform=`rotate(${-nav.relativeAngle}rad)`;
  }else{$('nav-address').textContent=state.completed?'航段已完成':'环境导航已关闭 · 按 N 开启';$('nav-target').textContent='沿门牌编号与设施图探索';}
}
function showDialog(id:string){clearInput();if(id==='map-dialog')drawMap();if(id==='inventory-dialog')drawInventory();if(id==='levels-dialog')drawLevels();$<HTMLDialogElement>(id).showModal();}
function toggleDialog(id:string){const d=$<HTMLDialogElement>(id);if(d.open)d.close();else if(!paused())showDialog(id);clearInput();}
let mapSelection='';
function drawMap(){
  const map=$<HTMLCanvasElement>('map'),ctx=map.getContext('2d')!;ctx.clearRect(0,0,map.width,map.height);
  const blueprint=$<HTMLInputElement>('map-blueprint').checked;
  const known=new Set(blueprint?level.rooms.map(r=>r.id):state.visited);for(const e of level.edges)if(state.visited.includes(e.from)||state.visited.includes(e.to)){known.add(e.from);known.add(e.to);}
  const rooms=level.rooms.filter(r=>known.has(r.id));
  if(!rooms.length)return;
  const minX=Math.min(camera.position.x,...rooms.map(r=>r.x-r.width/2)),maxX=Math.max(camera.position.x,...rooms.map(r=>r.x+r.width/2));
  const minZ=Math.min(camera.position.z,...rooms.map(r=>r.z-r.depth/2)),maxZ=Math.max(camera.position.z,...rooms.map(r=>r.z+r.depth/2));
  const scale=Math.min((map.width-180)/Math.max(1,maxX-minX),(map.height-100)/Math.max(1,maxZ-minZ));
  const point=(x:number,z:number):[number,number]=>[map.width/2+(x-(minX+maxX)/2)*scale,map.height/2+(z-(minZ+maxZ)/2)*scale];
  ctx.font='12px monospace';
  type Rect={x:number;y:number;w:number;h:number};
  const intersects=(a:Rect,b:Rect)=>a.x<b.x+b.w+3&&a.x+a.w+3>b.x&&a.y<b.y+b.h+3&&a.y+a.h+3>b.y;
  const obstacles:Rect[]=rooms.map(r=>{const [x,y]=point(r.x,r.z);return{x:x-r.width*scale/2,y:y-r.depth*scale/2,w:r.width*scale,h:r.depth*scale};});
  for(const e of level.edges){if(!known.has(e.from)||!known.has(e.to)||(!blueprint&&!state.visited.includes(e.from)&&!state.visited.includes(e.to)))continue;
    const a=level.rooms.find(r=>r.id===e.from)!,b=level.rooms.find(r=>r.id===e.to)!;
    const p=point(a.x,a.z),q=point(b.x,b.z);obstacles.push({x:Math.min(p[0],q[0])-3,y:Math.min(p[1],q[1])-3,w:Math.abs(p[0]-q[0])+6,h:Math.abs(p[1]-q[1])+6});const explored=state.visited.includes(a.id)||state.visited.includes(b.id);ctx.strokeStyle=!explored?'#526774':canOpenDoor(level,state,e.id)?'#75949e':'#bc945f';ctx.lineWidth=2;
    ctx.setLineDash(state.opened.includes(e.id)?[]:[5,5]);ctx.beginPath();ctx.moveTo(...p as [number,number]);ctx.lineTo(...q as [number,number]);ctx.stroke();ctx.setLineDash([]);
  }
  for(const r of rooms){const [x,z]=point(r.x,r.z),visited=state.visited.includes(r.id);ctx.fillStyle=visited?'#264450':'#101e27';ctx.strokeStyle=visited?'#86a7ab':'#374752';
    ctx.fillRect(x-r.width*scale/2,z-r.depth*scale/2,r.width*scale,r.depth*scale);ctx.strokeRect(x-r.width*scale/2,z-r.depth*scale/2,r.width*scale,r.depth*scale);
  }
  const nav=expeditionNavigation(level,state,camera.position.x,camera.position.z,yaw);
  if(nav&&navigationOn){ctx.strokeStyle='#cbbf80';ctx.lineWidth=2;ctx.setLineDash([3,4]);ctx.beginPath();let begun=false;for(const id of nav.path){if(!known.has(id))continue;const r=level.rooms.find(r=>r.id===id)!,p=point(r.x,r.z);if(!begun){ctx.moveTo(p[0],p[1]);begun=true;}else ctx.lineTo(p[0],p[1]);}ctx.stroke();ctx.setLineDash([]);
    if(known.has(nav.target)){const r=level.rooms.find(r=>r.id===nav.target)!,p=point(r.x,r.z);ctx.strokeStyle='#d9c38b';ctx.beginPath();ctx.arc(p[0],p[1],Math.max(r.width*scale*.7,14),0,Math.PI*2);ctx.stroke();}
  }
  const [x,z]=point(camera.position.x,camera.position.z);ctx.save();ctx.translate(x,z);ctx.rotate(-yaw);ctx.fillStyle='#dcecca';ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(-5,6);ctx.lineTo(5,6);ctx.closePath();ctx.fill();ctx.restore();
  // Fixed-size callouts avoid both physical room footprints and corridor lines.
  const labels:{id:string;rect:Rect}[]=[];
  for(const r of rooms){
    const [rx,ry]=point(r.x,r.z),w=42,h=18;
    let chosen:Rect|undefined;
    for(let radius=0;radius<500&&!chosen;radius+=10){
      const dx=r.width*scale/2+9+radius,dy=r.depth*scale/2+9+radius;
      const candidates=[{x:rx+dx,y:ry-h/2,w,h},{x:rx-dx-w,y:ry-h/2,w,h},{x:rx-w/2,y:ry+dy,w,h},{x:rx-w/2,y:ry-dy-h,w,h}];
      chosen=candidates.find(c=>c.x>8&&c.y>26&&c.x+w<map.width-8&&c.y+h<map.height-26&&!obstacles.some(o=>intersects(c,o))&&!labels.some(l=>intersects(c,l.rect)));
    }
    if(!chosen)continue;
    labels.push({id:r.id,rect:chosen});
    ctx.strokeStyle='#536d77';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(rx,ry);ctx.lineTo(Math.max(chosen.x,Math.min(rx,chosen.x+w)),Math.max(chosen.y,Math.min(ry,chosen.y+h)));ctx.stroke();
  }
  if(!rooms.some(r=>r.id===mapSelection))mapSelection=rooms.find(r=>state.visited.includes(r.id))?.id??rooms[0].id;
  for(const {id,rect:c} of labels){ctx.fillStyle=id===mapSelection?'#294650':'#091820';ctx.fillRect(c.x,c.y,c.w,c.h);ctx.fillStyle=state.visited.includes(id)?'#e0ecea':'#9eb1bb';ctx.textAlign='center';ctx.fillText(roomAddress(rooms.find(r=>r.id===id)!),c.x+c.w/2,c.y+13);}
  ctx.textAlign='left';ctx.fillStyle='#9eb1bb';ctx.fillText('设施平面 / 等比测绘 · +Z ↓',16,20);
  ctx.fillText('实线：已开门   虚线：未开门   黄褐：当前未获许可',16,map.height-12);
  map.setAttribute('aria-label','设施等比平面图；可点击短编号，或使用下方舱室选择器查看详情');
  let select=document.getElementById('map-room-select') as HTMLSelectElement|null;
  if(!select){
    const host=document.createElement('div'),label=document.createElement('label');label.textContent='舱室详情 ';select=document.createElement('select');select.id='map-room-select';select.setAttribute('aria-label','选择测绘舱室');select.style.cssText='background:#10232c;color:#dfebe9;padding:5px;border:1px solid #67818a';
    // The driving key handler must not consume native selector keyboard input.
    select.addEventListener('keydown',event=>event.stopPropagation());select.onchange=()=>{mapSelection=select!.value;drawMap();};label.append(select);host.append(label);
    const detail=document.createElement('p');detail.id='map-room-detail';detail.setAttribute('aria-live','polite');host.append(detail);map.after(host);
  }
  select.replaceChildren(...rooms.map(r=>{const option=document.createElement('option');option.value=r.id;option.textContent=roomAddress(r);option.selected=r.id===mapSelection;return option;}));
  const selected=rooms.find(r=>r.id===mapSelection)!,visited=state.visited.includes(selected.id);
  $('map-room-detail').textContent=visited?`${roomAddress(selected)} · ${selected.name} · ${level.items.filter(i=>i.room===selected.id&&!state.collected.includes(i.id)).length} 项待核验`:`${roomAddress(selected)} · 未探索舱室（蓝图不揭示物资）`;
  map.onclick=event=>{const bounds=map.getBoundingClientRect(),px=(event.clientX-bounds.left)*map.width/bounds.width,py=(event.clientY-bounds.top)*map.height/bounds.height;
    const hit=labels.find(l=>px>=l.rect.x&&px<=l.rect.x+l.rect.w&&py>=l.rect.y&&py<=l.rect.y+l.rect.h)?.id??rooms.find(r=>{const [a,b]=point(r.x,r.z);return Math.abs(px-a)<=Math.max(5,r.width*scale/2)&&Math.abs(py-b)<=Math.max(5,r.depth*scale/2);})?.id;
    if(hit){mapSelection=hit;drawMap();}
  };
  $('map-summary').textContent=`已进入 ${state.visited.length}/${level.rooms.length} 个舱室 · 已打开 ${level.edges.filter(e=>state.opened.includes(e.id)).length}/${level.edges.length} 扇门 · 当前航段独立自动存档`;
}
function drawInventory(){const host=$('inventory-list');host.replaceChildren();
  for(const item of level.items.filter(i=>state.collected.includes(i.id))){const el=document.createElement('div');el.className='item';el.textContent=item.name;const small=document.createElement('small');small.textContent=item.description;el.append(small);host.append(el);}
  if(!host.childElementCount)host.textContent='尚未回收物资。瞄准实体工具、箱子或记录点，靠近后按 F。';
}
function drawLevels(){const host=$('level-list');host.replaceChildren();for(let i=0;i<7;i++){const l=createExpedition(i),button=document.createElement('button');button.textContent=`${String(i+1).padStart(2,'0')} · ${l.name}`;const span=document.createElement('span');span.textContent=`${l.rooms.length} 舱室 / ${l.edges.length} 门 / ${l.items.length} 作业点`;button.append(span);button.onclick=()=>{save();$<HTMLDialogElement>('levels-dialog').close();loadLevel(i);};host.append(button);}}
function draw(){pose();world.update(state,time);atmosphere.update(time,camera,lamp);renderer.info.autoReset=false;renderer.info.reset();composer.render();return{ok:true,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};}
function qaFixtures(){
  const item=level.items.find(i=>i.id.endsWith('s0.objective0'))!;
  const room=level.rooms.find(r=>r.id===item.room)!;
  const x=room.x+item.x,z=room.z+item.z;
  const edge=level.edges[0],a=level.rooms.find(r=>r.id===edge.from)!,b=level.rooms.find(r=>r.id===edge.to)!;
  const [dx,dz]=expeditionDoorPosition(a,b);
  const length=Math.hypot(b.x-a.x,b.z-a.z),ux=(b.x-a.x)/length,uz=(b.z-a.z)/length,heading=Math.atan2(-ux,-uz);
  return{movementPose:[level.spawn[0],0,level.spawn[1],heading,0],
    pickup:{id:item.id,nearPose:[x,-.2,z+2,0,0],blockedPose:[room.x-room.width/2-.15,-.2,z,-Math.PI/2,0]},
    door:{id:edge.id,nearPose:[dx-ux*1.6,0,dz-uz*1.6,heading,0],axis:ux?'x':'z',plane:ux?dx:dz,sign:Math.sign(ux||uz)}};
}
function frame(now:number){if(stopped)return;const dt=last?Math.min(.05,(now-last)/1000):0;last=now;time+=dt;
  adaptivePower+=(Math.min(55,Math.max(4,focusDistance**1.65*.72))-adaptivePower)*(1-Math.exp(-dt*8));
  if(!paused()){elapsed+=dt;step(dt);}draw();
  if(time-lastUI>.12){aim();updateHUD();lastUI=time;}if(time>toastUntil)$('toast').textContent='';if(time-lastSave>5)save();raf=requestAnimationFrame(frame);
}
window.addEventListener('keydown',e=>{
  const key=e.key.toLowerCase();if(['w','a','s','d','q','e','arrowleft','arrowright','arrowup','arrowdown','f','m','i','l','n'].includes(key))e.preventDefault();
  if(key==='n'&&!e.repeat){navigationOn=!navigationOn;updateHUD();}
  if(!e.repeat){if(key==='m')toggleDialog('map-dialog');if(key==='i')toggleDialog('inventory-dialog');if(key==='l'&&!paused())lightOn=!lightOn;if(key==='f')interact();}
  if(!paused())keys.add(key);
});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',clearInput);
canvas.addEventListener('pointerdown',e=>{if(!paused()){dragging=true;canvas.setPointerCapture(e.pointerId);}});canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
canvas.addEventListener('pointermove',e=>{if(dragging){yaw-=e.movementX*.002;pitch=Math.max(-1.1,Math.min(1.1,pitch-e.movementY*.002));}});
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-close]'))button.onclick=()=>{button.closest('dialog')!.close();clearInput();};
$('map-button').onclick=()=>toggleDialog('map-dialog');$('inventory-button').onclick=()=>toggleDialog('inventory-dialog');$('levels-button').onclick=()=>toggleDialog('levels-dialog');$('lamp-button').onclick=()=>lightOn=!lightOn;
$('map-blueprint').onchange=drawMap;
$('nav-toggle').onclick=()=>{navigationOn=!navigationOn;updateHUD();};
$('restart').onclick=()=>{if(confirm('重置当前关卡的门、道具与探索记录？其他关卡与原叙事存档不受影响。')){$<HTMLDialogElement>('levels-dialog').close();loadLevel(level.index,true);}};
$('next-level').onclick=()=>{$<HTMLDialogElement>('complete-dialog').close();if(level.index<6){save();loadLevel(level.index+1);}else showDialog('levels-dialog');};
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight,false);composer.setSize(innerWidth,innerHeight);});
window.addEventListener('pagehide',()=>{save();stopped=true;cancelAnimationFrame(raf);world.dispose();atmosphere.dispose();materials.dispose();lamp.shadow.dispose();ao.dispose();water.pass.dispose();bloom.dispose();output.dispose();optics.dispose();composer.dispose();renderer.dispose();},{once:true});
// A bfcache-restored document has disposed GPU resources; restore from its saved state.
window.addEventListener('pagehide',()=>surfaceMaps.dispose(),{once:true});
window.addEventListener('pagehide',()=>reflections.dispose(),{once:true});
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
try{
  const index=Math.max(0,Math.min(6,Math.trunc(Number(query.get('level')??1)-1)||0));loadLevel(index);
  if(query.has('qa'))Object.assign(window,{expeditionProbe:{
    draw,loadLevel,resetLevel:()=>loadLevel(level.index,true),canMove:(x:number,y:number,z:number)=>canMove(new Vector3(x,y,z)),interact,
    setPose:(x:number,y:number,z:number,ya:number,pi:number)=>{camera.position.set(x,y,z);yaw=ya;pitch=pi;clearInput();pose();draw();aim();},
    snapshot:()=>({level,state:structuredClone(state),position:camera.position.toArray(),yaw,pitch,elapsed,target,anchors:world.anchors,storyViews:world.storyViews,passageViews:world.passageViews,navigation:expeditionNavigation(level,state,camera.position.x,camera.position.z,yaw),stats:{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,colliders:world.colliders.length,qa:qaFixtures()},estimate:estimateExpeditionRoute(level,{speedMetersPerSecond:1.6})}),
  }});
  raf=requestAnimationFrame(frame);
}catch(error){$('loading').hidden=true;$('error').hidden=false;$('error').textContent=`设施加载失败：${error instanceof Error?error.message:String(error)}`;console.error(error);}
