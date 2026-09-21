import { ACESFilmicToneMapping, AdditiveBlending, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, FogExp2, Group, HemisphereLight, Mesh, MeshBasicMaterial, PerspectiveCamera, PointLight, Points, Scene, ShaderMaterial, SphereGeometry, SpotLight, TorusGeometry, Vector2, Vector3, WebGLRenderer, PCFShadowMap } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createReferenceMaterials } from './reference-materials';
import { createReferenceRoom } from './reference-room';
import { createReferenceWater } from './reference-water';

const query = new URLSearchParams(location.search);
if (query.has('clean')) document.body.classList.add('clean');
const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const status = document.querySelector<HTMLElement>('#status')!;
const keys = new Set<string>();
let frozen = query.has('still'), lightOn = true, dragging = false, clock = 3.8, previous = 0, raf = 0;
let yaw = -0.075, pitch = 0.018;
const velocity = new Vector3();
const forward = new Vector3(), right = new Vector3(), next = new Vector3();
const scene = new Scene();
scene.background = new Color('#010709'); scene.fog = new FogExp2('#0c303b', 0.083);
const camera = new PerspectiveCamera(45, innerWidth / innerHeight, 0.055, 35);
const renderer = new WebGLRenderer({canvas, antialias:true, alpha:false, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 0.88;
const materials = createReferenceMaterials();
const room = createReferenceRoom(materials);
// The reference compartment is broad and compressed; keep colliders in the same world transform.
room.root.scale.x = 1.16;
for (const collider of room.colliders) { collider.min.x *= 1.16; collider.max.x *= 1.16; }
scene.add(room.root);
// A real camera-side floodlight housing provides a close, curved silhouette at the port edge.
const housing=new Group();
const barrel=new Mesh(new CylinderGeometry(.13,.155,.42,40),materials.rubber);barrel.rotation.x=Math.PI/2;
const ring=new Mesh(new TorusGeometry(.134,.012,10,48),materials.steel);ring.position.z=-.20;
housing.add(barrel,ring);housing.scale.setScalar(.82);housing.position.set(.48,-.44,-.70);housing.rotation.set(-.20,-.20,-.32);
camera.add(housing);scene.add(camera);
const lamp = new SpotLight('#b6deed', 42, 17, .56, .9, 1.65);
lamp.castShadow = true; lamp.shadow.mapSize.set(2048,2048); lamp.shadow.bias = -.00015;
lamp.shadow.radius = 10;
lamp.shadow.normalBias = .018; lamp.shadow.camera.near = .1; lamp.shadow.camera.far = 18;
scene.add(lamp, lamp.target);
const bounce = new PointLight('#439fc0', 13, 6, 2); bounce.position.set(-.7,.8,-1.0); scene.add(bounce);
const ambient = new HemisphereLight('#638c99', '#060908', .18); scene.add(ambient);
const nearBounce = new PointLight('#dce9e8', 2.8, 3.4, 2);
nearBounce.position.set(-.5,-.3,1.0);scene.add(nearBounce);
// Local blue indirect fill approximates light returned by the water below the hatch.
const waterBounce = new PointLight('#346dff', 7, 3.6, 2);
waterBounce.position.set(1.2,-1.35,-2.0);scene.add(waterBounce);
const amber = new PointLight('#ff4e0c', 2.2, 5, 2); amber.position.set(-3.1,1.6,2.2); scene.add(amber);
const practical = new PointLight('#ff4208', .008, .55, 2); practical.position.set(3.19,-.09,-3.89); scene.add(practical);
const indicator = new Mesh(new SphereGeometry(.018,8,6),new MeshBasicMaterial({color:'#ff3d09'})); indicator.position.copy(practical.position); scene.add(indicator);

// Sparse drifting particles fade outside the actual spotlight cone.
const n=650, coords=new Float32Array(n*3);
let seed=829; const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<n;i++){coords[i*3]=(random()-.5)*6.7;coords[i*3+1]=(random()-.5)*4;coords[i*3+2]=random()*8-4.5;}
const particleGeo=new BufferGeometry();particleGeo.setAttribute('position',new Float32BufferAttribute(coords,3));
const particleMat=new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,uniforms:{time:{value:clock},power:{value:1},lampPos:{value:new Vector3()},lampDir:{value:new Vector3()}},vertexShader:`uniform float time;varying vec3 p;void main(){p=position;p.x+=sin(time*.13+position.z*2.)*.025;p.y=mod(p.y+2.+time*.014,4.)-2.;vec4 v=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp(5./-v.z,.65,3.2);}`,fragmentShader:`uniform float power;uniform vec3 lampPos;uniform vec3 lampDir;varying vec3 p;void main(){float r=length(gl_PointCoord-.5);float cone=smoothstep(.78,.98,dot(normalize(p-lampPos),lampDir));float a=smoothstep(.5,.05,r)*cone*power*.24;gl_FragColor=vec4(.62,.77,.82,a);}`});
const particles=new Points(particleGeo,particleMat);scene.add(particles);

const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
const ao=new SSAOPass(scene,camera,innerWidth,innerHeight);ao.kernelRadius=.11;ao.minDistance=.001;ao.maxDistance=.075;composer.addPass(ao);
const water=createReferenceWater(camera,lamp,ao.normalRenderTarget.depthTexture!);composer.addPass(water.pass);
const bloom=new UnrealBloomPass(new Vector2(innerWidth,innerHeight),.12,.5,1.05);composer.addPass(bloom);
composer.addPass(new OutputPass());
const optics=new ShaderPass({uniforms:{tDiffuse:{value:null},time:{value:0},aspect:{value:innerWidth/innerHeight}},vertexShader:`varying vec2 uv0;void main(){uv0=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`uniform sampler2D tDiffuse;uniform float time;uniform float aspect;varying vec2 uv0;void main(){vec2 q=uv0-.5;float r=dot(q,q);vec2 uv=.5+q*(1.+r*.035);vec2 aberr=q*r*.003;vec3 c=vec3(texture2D(tDiffuse,uv+aberr).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv-aberr).b);float port=1.-smoothstep(.24,.57,length(q*vec2(1.,.93)));c*=mix(.34,1.,port);float grain=fract(sin(dot(gl_FragCoord.xy+floor(time*12.),vec2(12.9898,78.233)))*43758.5453)-.5;c+=grain*.011;gl_FragColor=vec4(c,1.);}`});composer.addPass(optics);

function reset(){camera.position.set(-.26,-.25,2.16);yaw=.025;pitch=.10;velocity.set(0,0,0);keys.clear();}
reset();
function pose(){
  camera.rotation.order='YXZ';camera.rotation.set(pitch,yaw,.038);camera.updateMatrixWorld();
  camera.getWorldDirection(forward);right.set(1,0,0).applyQuaternion(camera.quaternion);
  lamp.position.copy(camera.position).addScaledVector(right,1.0);lamp.position.y-=.3;
  lamp.target.position.copy(camera.position).addScaledVector(forward,6).addScaledVector(right,-.4);
  lamp.intensity=lightOn?32:0;bounce.intensity=lightOn?12:.08;ambient.intensity=lightOn?.12:.025;
  waterBounce.intensity=lightOn?2:0;
  particleMat.uniforms.power.value=+lightOn;particleMat.uniforms.lampPos.value.copy(lamp.position);
  particleMat.uniforms.lampDir.value.subVectors(lamp.target.position,lamp.position).normalize();
}
function canMove(p:Vector3){if(p.x < -3.15||p.x>3.15||p.y< -1.45||p.y>2.1||p.z< -3.2||p.z>3.0)return false;return !room.colliders.some(box=>box.clone().expandByScalar(.18).containsPoint(p));}
function advance(dt:number){
  const desire=new Vector3();camera.getWorldDirection(forward);right.set(1,0,0).applyQuaternion(camera.quaternion);
  desire.addScaledVector(forward,+keys.has('w')-+keys.has('s')).addScaledVector(right,+keys.has('d')-+keys.has('a'));desire.y+=+keys.has('e')-+keys.has('q');
  if(desire.lengthSq()>1)desire.normalize();desire.multiplyScalar(.85);velocity.lerp(desire,1-Math.exp(-dt*4));
  for(const axis of ['x','y','z'] as const){next.copy(camera.position);next[axis]+=velocity[axis]*dt;if(canMove(next))camera.position.copy(next);else velocity[axis]=0;}
}
function draw(){pose();nearBounce.intensity=lightOn?2.8:0;room.update(clock);particleMat.uniforms.time.value=clock;optics.uniforms.time.value=clock;water.update(lightOn?1.6:0);const start=performance.now();renderer.info.autoReset=false;renderer.info.reset();composer.render();return {ok:true,elapsed:performance.now()-start,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};}
function frame(now:number){const dt=previous?Math.min(.04,(now-previous)/1000):0;previous=now;if(!frozen)clock+=dt;advance(dt);const result=draw();if(Math.floor(now/500)!==Math.floor((now-dt*1000)/500))status.textContent=`${innerWidth} × ${innerHeight} · ${result.elapsed.toFixed(1)} MS`;raf=requestAnimationFrame(frame);}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight,false);composer.setSize(innerWidth,innerHeight);optics.uniforms.aspect.value=camera.aspect;});
window.addEventListener('keydown',e=>{if(/^(w|a|s|d|q|e|l|p)$/i.test(e.key)){e.preventDefault();keys.add(e.key.toLowerCase());}if(!e.repeat&&e.key.toLowerCase()==='l')lightOn=!lightOn;if(!e.repeat&&e.key.toLowerCase()==='p')frozen=!frozen;});
window.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{keys.clear();velocity.set(0,0,0);dragging=false;});
canvas.addEventListener('pointerdown',e=>{dragging=true;canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
canvas.addEventListener('pointermove',e=>{if(dragging){yaw-=e.movementX*.002;pitch=Math.max(-1.1,Math.min(1.1,pitch-e.movementY*.002));}});
document.querySelector('#reset')!.addEventListener('click',reset);document.querySelector('#lamp')!.addEventListener('click',()=>lightOn=!lightOn);document.querySelector('#freeze')!.addEventListener('click',()=>frozen=!frozen);
Object.assign(window,{referenceProbe:{draw,reset,setPose:(x:number,y:number,z:number,ya:number,pi:number)=>{camera.position.set(x,y,z);yaw=ya;pitch=pi;draw();},setLamp:(v:boolean)=>{lightOn=v;draw();},getStats:()=>({geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,colliders:room.colliders.length,position:camera.position.toArray()})}});
window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);room.dispose();materials.dispose();particleGeo.dispose();particleMat.dispose();indicator.geometry.dispose();barrel.geometry.dispose();ring.geometry.dispose();(indicator.material as MeshBasicMaterial).dispose();lamp.shadow.dispose();water.pass.dispose();optics.dispose();ao.dispose();bloom.dispose();composer.dispose();renderer.dispose();},{once:true});
raf=requestAnimationFrame(frame);
