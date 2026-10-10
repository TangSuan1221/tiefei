import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PodRun } from '../sim/run';
import { canonicalStation, type StationId } from '../types';
import { HitMap } from './chrome';
import { drawStationView, drawStationScreen, drawObservationWindow, drawDrivingSonarInstrument, type StationView } from './stations';
import { createReferenceMaterials } from './deepsea/reference-materials';
import { addCabinDressing } from './cabin-dressing';
import { buildCrtHousing } from './cabin-crt-art';
import { buildPassiveControls } from './cabin-passive-controls';
import { buildActiveControls } from './cabin-active-controls';
import { drawCompactSonarDesk, sonarDeskState } from './sonar-desk';
import { COORD_AXES } from '../sim/site-coords';
import { buildNavigationKeyboard } from './cabin-navigation-keyboard';
import { buildIndustrialHelm } from './cabin-helm';
import { damageAlarm } from './damage-alarm';
import { buildPortholeArt, drawPortholeGlass } from './cabin-porthole-art';

/** Metres: a sealed 2.3 × 4.0 × 2.1 pressure cell, not a screen gallery. */
export class CabinThree {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(67, 1, 0.025, 15);
  private renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  private materials = createReferenceMaterials();
  private screens: { id: StationId; mesh: THREE.Mesh; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; hits: HitMap; group: THREE.Group; repeater?:boolean }[] = [];
  private ray = new THREE.Raycaster();
  private pickingCamera = new THREE.PerspectiveCamera();
  private focused: StationId | null = null;
  private preferredFace: StationId | null = null;
  private focusedFace: StationId | null = null;
  private look = new THREE.Vector3(0, 1.15, -1.5);
  private frame = 0;
  private eye = new THREE.Vector3(0,1.36,1.25);
  private yaw = 0;
  private pitch = -.06;
  private walking = 0;
  private helmLook=0;
  private manualLook=false;
  private deviceZoom: 'nav'|'lab'|null=null;
  get zoomedDevice(){return this.deviceZoom;}
  deviceClick():boolean {
    if(!this.isConsole(this.focused))return false;
    let obj:THREE.Object3D|null=this.ray.intersectObjects(this.scene.children,true)[0]?.object??null;
    let side: 'nav'|'lab'|null=null;
    while(obj){if(obj.userData.deviceSide){side=obj.userData.deviceSide;break;}obj=obj.parent;}
    if(this.deviceZoom){if(side===this.deviceZoom)return false;this.deviceZoom=null;this.manualLook=false;return true;}
    if(side){this.deviceZoom=side;this.manualLook=false;return true;}return false;
  }
  private isConsole(id:StationId|null){return !!id&&['camera','nav','lab'].includes(id);}
  consoleInReach(){return this.eye.z<.65&&Math.cos(this.yaw)>.25;}
  private storyLamps:THREE.MeshStandardMaterial[]=[];
  private helmStick = new THREE.Group();
  readonly helmInput={thrust:0,yaw:0};
  private impactAge=10;
  private impactStrength=0;
  impact(amount:number){this.impactAge=0;this.impactStrength=Math.min(1,Math.max(amount,this.impactStrength*.4));}
  private updateNavigationKeyboard:((run:PodRun)=>void)|undefined;
  private updatePassiveControls:((run:PodRun)=>void)|undefined;
  private updateActiveControls:((run:PodRun,hovered?:string)=>void)|undefined;
  private helmKeys:THREE.Mesh[]=[];
  private helmLabels:THREE.Texture[]=[];
  private portholeTextures:THREE.Texture[]=[];

  turn(dx:number,dy:number) {
    if(this.focused&&!this.manualLook){
      const direction=this.camera.getWorldDirection(new THREE.Vector3());
      this.yaw=Math.atan2(-direction.x,-direction.z);
      this.pitch=Math.asin(THREE.MathUtils.clamp(direction.y,-1,1));
      this.manualLook=true;
    }
    this.yaw-=dx*.0022;
    this.pitch=THREE.MathUtils.clamp(this.pitch-dy*.0022,-1.50,1.35);
  }

  releaseToAisle():void {
    if(!this.focused)return;
    const direction=this.camera.getWorldDirection(new THREE.Vector3());
    this.eye.set(THREE.MathUtils.clamp(this.camera.position.x,-.40,.40),1.36,THREE.MathUtils.clamp(this.camera.position.z,-.88,1.28));
    this.yaw=Math.atan2(-direction.x,-direction.z);
    this.pitch=THREE.MathUtils.clamp(Math.asin(direction.y),-1.50,1.35);
    this.approached=this.focused;
    this.focused=null;this.focusedFace=null;this.preferredFace=null;
  }

  move(forward:number,right:number,dt:number):number {
    if(this.focused) return 0;
    const length=Math.max(1,Math.hypot(forward,right));
    const step=.72*Math.min(dt,.05)/length;
    const old=this.eye.clone();
    // Capsule clearance against consoles, rear seat/tanks and forward equipment.
    this.eye.x=THREE.MathUtils.clamp(this.eye.x+(Math.cos(this.yaw)*right-Math.sin(this.yaw)*forward)*step,-.40,.40);
    this.eye.z=THREE.MathUtils.clamp(this.eye.z+(-Math.sin(this.yaw)*right-Math.cos(this.yaw)*forward)*step,-.88,1.28);
    const distance=old.distanceTo(this.eye);
    this.walking+=distance*11;
    return distance;
  }

  private approached:StationId|null=null;
  approach():StationId|null {
    const direction=new THREE.Vector3(-Math.sin(this.yaw),0,-Math.cos(this.yaw));
    for(const screen of this.screens){
      const delta=screen.group.position.clone().sub(this.eye);delta.y=0;
      if(screen.id===this.approached){if(delta.length()>1.04)this.approached=null;else continue;}
      if(delta.length()<.91 && delta.normalize().dot(direction)>.72){this.approached=screen.id;return screen.id;}
    }
    return null;
  }
  pose() {return {x:this.eye.x,z:this.eye.z,yaw:this.yaw,pitch:this.pitch,seatEye:this.camera.position.toArray(),helmLook:this.helmLook};}
  private lamp = new THREE.PointLight(0xd6d2b7, 3, 5, 2);
  private damageLights=[new THREE.PointLight(0xff1308,0,3.8,2),new THREE.PointLight(0xff1308,0,3.8,2)];
  private damageLens=new THREE.MeshStandardMaterial({color:0x400803,emissive:0xff1608,emissiveIntensity:0,roughness:.3});
  private normalLights:{light:THREE.Light;intensity:number}[]=[];
  private flood = new THREE.Mesh(new THREE.PlaneGeometry(2.22,3.94),new THREE.MeshStandardMaterial({color:0x1a3335,metalness:.35,roughness:.19,transparent:true,opacity:.72}));

  constructor() {
    const r = this.renderer;
    r.setPixelRatio(1);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.25;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    // Hull fixtures and lights do not move: cache their expensive point shadows.
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;
    this.scene.background = new THREE.Color('#030809');
    this.scene.fog = new THREE.FogExp2('#081314', 0.055);
    this.camera.position.set(0, 1.36, 1.3);
    this.materials.hull.color.set('#63716c');
    this.materials.hull.roughnessMap = null;
    this.materials.hull.roughness = 0.88;
    this.materials.steel.roughnessMap = null;
    this.materials.steel.roughness = .73;
    this.materials.steel.metalness = .55;
    this.materials.steel.color.set('#697773');
    this.scene.add(new THREE.HemisphereLight(0xc2c7b2, 0x29201a, 0.85));
    const consoleSpill=new THREE.PointLight(0xe2cda8,.72,3.3,2);
    consoleSpill.position.set(0,.65,-.8);this.scene.add(consoleSpill);
    this.lamp.position.set(-0.12, 1.94, -.88);
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(2048, 2048);
    this.lamp.shadow.bias = -0.001;
    this.scene.add(this.lamp);
    const emergency = new THREE.PointLight(0xff6431, 1.7, 4, 2);
    emergency.position.set(0.7, 1.72, 1.65);
    this.scene.add(emergency);
    this.build();
    this.damageLights.forEach((light,i)=>{
      light.position.set(i===0?-.72:.72,1.78,i===0?-1.1:.8);
      this.scene.add(light);
      const housing=light.position.clone();housing.y+=.09;
      this.box(this.scene,[.23,.07,.14],housing.toArray(),this.materials.steel,.015);
      this.box(this.scene,[.16,.055,.10],light.position.toArray(),this.damageLens,.018);
    });
    this.buildHelm();
    addCabinDressing(this.scene,this.materials);
    for(let i=0;i<7;i++) {
      const material=new THREE.MeshStandardMaterial({color:0x263f37,emissive:0xd59a49,emissiveIntensity:0});
      this.storyLamps.push(material);
      this.box(this.scene,[.075,.024,.025],[-.30+i*.10,1.74,-1.67],material,.006);
    }
    this.flood.rotation.x=-Math.PI/2;
    this.flood.position.set(0,.01,.2);
    this.flood.visible=false;
    this.scene.add(this.flood);
    this.scene.traverse(object=>{
      if(object instanceof THREE.Light && object!==this.lamp && !this.damageLights.includes(object as THREE.PointLight))
        this.normalLights.push({light:object,intensity:object.intensity});
    });
  }

  private box(parent: THREE.Object3D, size: number[], at: number[], mat: THREE.Material, radius = 0) {
    const geo = radius ? new RoundedBoxGeometry(size[0]!, size[1]!, size[2]!, 2, radius)
      : new THREE.BoxGeometry(size[0]!, size[1]!, size[2]!);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(at[0]!, at[1]!, at[2]!);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private pipe(parent: THREE.Object3D, points: number[][], radius: number, mat: THREE.Material) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, radius, 8, false), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
  }

  private buildHelm() {
    buildIndustrialHelm(this.scene, this.helmStick, this.helmKeys, this.helmLabels);
    this.updateNavigationKeyboard=buildNavigationKeyboard(this.scene,this.helmLabels);
  }

  private build() {
    const s = this.scene, m = this.materials;
    this.box(s, [2.3, 0.12, 4], [0, -0.06, 0.2], m.floor);
    this.box(s, [2.3, 0.12, 4], [0, 2.1, 0.2], m.hull);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        this.box(s, [0.09, 1.85, 0.78], [side * 1.15, 0.95, -1.4 + i * 0.8], m.hull);
        this.box(s, [0.10, 1.85, 0.065], [side * 1.095, 0.95, -1.8 + i * 0.8], m.steel);
        for (let y = 0.16; y < 1.85; y += 0.23) {
          this.box(s, [0.025, 0.025, 0.025], [side * 1.03, y, -1.8 + i * 0.8], m.steel);
        }
        this.pipe(s, [[side*1.08,1.55,-1.65+i*.8],[side*.94,1.89,-1.65+i*.8],[0,2,-1.65+i*.8],[-side*.94,1.89,-1.65+i*.8]], .038, m.steel);
      }
      this.box(s, [.25,.25,3.9], [side*.99,1.97,.2], m.rubber, .07);
      for(let j=0;j<3;j++) this.pipe(s, [[side*(.25+j*.14),2.01,-1.6],[side*(.3+j*.14),1.93,-.4],[side*(.32+j*.14),1.94,2]], .024, j===0?m.steel:m.rubber);
      this.pipe(s, [[side*1.02,.25,-1.6],[side*1.01,.28,1.7],[side*.98,1.3,1.9]], .045, m.steel);
    }
    this.box(s,[2.3,2.1,.12],[0,1.05,-1.8],m.hull);
    this.box(s,[2.3,2.1,.12],[0,1.05,2.2],m.hull);
    // Welded rear hatch, locking wheel, grab handles, overhead warning light.
    this.box(s,[.88,1.55,.16],[0,.91,2.08],m.rubber,.16);
    this.box(s,[.76,1.43,.1],[0,.91,1.98],m.hull,.13);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(.20,.019,8,32),m.red);
    wheel.position.set(0,1.03,1.89);s.add(wheel);
    for(let i=0;i<3;i++) {
      const spoke=this.box(s,[.38,.019,.023],[0,1.03,1.89],m.steel);
      spoke.rotation.z=i*Math.PI/3;
    }
    // Grated narrow footwell with exposed ribs rather than a large empty floor.
    for(let i=0;i<32;i++) this.box(s,[.69,.022,.024],[0,.012,-1.6+i*.115],m.steel);
    for(const x of [-.38,.38]) this.box(s,[.027,.015,3.8],[x,.025,.15],m.yellow);
    this.box(s,[.43,.12,.44],[.17,.43,1.67],m.rubber,.05);
    this.box(s,[.40,.52,.09],[.17,.74,1.89],m.rubber,.045);
    this.box(s,[.06,.45,.06],[.17,.20,1.67],m.steel);
    // Six equipment faces. The manipulator repeater retains the merged camera controls.
    this.terminal('life',[-.94,1.12,.72],Math.PI/2,.74,.65);
    this.terminal('radio',[-.94,1.29,1.48],Math.PI/2,.55,.48);
    // Separate port instruments from the optical aperture: neither glass nor
    // its text safe area sits behind the repeater housing.
    this.terminal('camera',[0,1.48,-1.57],0,.88,.78);
    // 两套声纳共用这块左舷仪表：被动阵列常开，主动换能器需单独通电。
    // 它紧挨摄像台左侧，玩家无需转身去舱尾找声纳。
    // Flat passive CRT: glass and its 1024×672 canvas share the same ~1.52:1 ratio, top edge level with the old 0.25 m screen.
    this.terminal('nav',[-.60,1.27,-1.43],.55,.32,.32*672/1024,false,672);
    this.terminal('nav',[-.60,1.60,-1.43],.55,.32,.26,true);
    this.terminal('lab',[.72,1.45,-1.35],-.12,.54,.43);

    this.terminal('salvage',[.94,1.12,.72],-Math.PI/2,.63,.47);
    // Tank rack, taped supply crate, film magazines and electrical service boxes.
    for(let i=0;i<3;i++) {
      const tank=new THREE.Mesh(new THREE.CapsuleGeometry(.09,.42,6,12),m.yellow);
      tank.position.set(-.91+i*.20,.39,1.72);s.add(tank);
      this.box(s,[.055,.08,.055],[-.91+i*.20,.74,1.72],m.steel);
    }
    this.box(s,[.40,.34,.49],[.78,.21,1.73],m.hull,.035);
    this.box(s,[.055,.35,.51],[.78,.22,1.73],m.red);
    for(let i=0;i<6;i++) this.box(s,[.10,.15,.22],[.5+i*.07,.55,-1.52],m.rubber,.009);
    for(const side of [-1,1]) {
      for(let i=0;i<3;i++) {
        this.box(s,[.15,.23,.24],[side*1.03,.36,-.7+i*.46],m.hull,.02);
        this.pipe(s,[[side*.99,.5,-.7+i*.46],[side*.86,.65,-.7+i*.46],[side*.97,.78,-.5+i*.46]],.016,m.rubber);
      }
      const glow=new THREE.MeshStandardMaterial({color:0x66847b,emissive:0x659488,emissiveIntensity:.45});
      this.box(s,[.035,.025,.63],[side*.72,1.92,-.10],glow);
      this.box(s,[.09,.04,.72],[side*.72,1.96,-.10],m.rubber);
    }
  }

  private terminal(id: StationId, p: number[], yaw: number, w: number, h: number, repeater=false, canvasHeight=720) {
    const group=new THREE.Group();group.position.set(p[0]!,p[1]!,p[2]!);group.rotation.y=yaw;
    if(id==='nav'||id==='lab')group.userData.deviceSide=id;
    this.scene.add(group);
    const m=this.materials;
    const passive=id==='nav'&&!repeater,active=id==='nav'&&repeater;
    if(id!=='camera')this.portholeTextures.push(...buildCrtHousing(group,w,h,!passive&&!active));
    if(passive){const controls=buildPassiveControls(group,w,h);this.portholeTextures.push(...controls.textures);this.updatePassiveControls=controls.update;}
    if(active){const controls=buildActiveControls(group,w,h);this.portholeTextures.push(...controls.textures);this.updateActiveControls=controls.update;}
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=canvasHeight;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
    const mesh:THREE.Mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));
    mesh.position.z=.055;group.add(mesh);
    if(id==='camera') {
      this.portholeTextures.push(...buildPortholeArt(group,mesh,w,h));
    }

    this.screens.push({id,mesh,canvas,texture,hits:new HitMap(),group,repeater});
  }

  ensure(w: number,h: number) {
    if(this.renderer.domElement.width!==w || this.renderer.domElement.height!==h) this.renderer.setSize(w,h,false);
    this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  }

  draw(ctx: CanvasRenderingContext2D,w:number,h:number,run:PodRun,_hits:HitMap,view:StationView & {dt:number}) {
    this.ensure(w,h);
    if(this.focused!==run.at && !(this.isConsole(this.focused)&&this.isConsole(run.at)))this.manualLook=false;
    this.focused=run.at;
    if(!this.isConsole(run.at))this.deviceZoom=null;
    if(!run.at || (this.preferredFace && canonicalStation(this.preferredFace)!==run.at)) this.preferredFace=null;
    const target=this.screens.find(s=>s.id===(this.isConsole(run.at)?'camera':this.preferredFace??run.at));
    this.focusedFace=target?.id??null;
    const pos=this.eye.clone();
    pos.y+=Math.sin(this.walking)*.009;
    const look=pos.clone().add(new THREE.Vector3(-Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),-Math.cos(this.yaw)*Math.cos(this.pitch)));
    if(target) {
      target.mesh.getWorldPosition(look);
      const distance=target.id==='camera'?1.38:this.camera.aspect<1.3?1.05:.77;
      pos.copy(target.group.localToWorld(new THREE.Vector3(0,target.id==='camera'?0:.025,distance)));
      // Keep the established helm seat; resizing the optical aperture must not
      // pull the operator backwards or sideways away from physical controls.
      if(target.id==='camera'){pos.x=0;look.x=0;}
      if(['camera','nav','lab'].includes(target.id)) {
        // One operator position: the side instruments only change gaze/optical focus.
        pos.set(0,1.36,-.62);
        if(target.id==='camera')look.set(0,1.35,-1.57);
      }
    }
    if(target&&this.manualLook)look.copy(pos).add(new THREE.Vector3(-Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),-Math.cos(this.yaw)*Math.cos(this.pitch)));
    if(this.deviceZoom==='nav'){
      // Frame both stacked sonar screens head-on along their own normal, with
      // the XYZ keypad below them still inside the shot.
      const navs=this.screens.filter(s=>s.id==='nav');
      look.set(0,0,0);for(const s of navs)look.add(s.mesh.getWorldPosition(new THREE.Vector3()));look.divideScalar(navs.length);
      look.y-=.09;
      pos.copy(look).addScaledVector(new THREE.Vector3(0,0,1).applyQuaternion(navs[0]!.group.quaternion),.82);
    }
    if(this.deviceZoom==='lab'){pos.set(.64,1.45,-.57);look.set(.72,1.45,-1.35);}
    const k=1-Math.exp(-view.dt*7);
    const focusFov=this.deviceZoom==='lab'?46:this.deviceZoom?60:this.isConsole(run.at)?65:67;
    this.camera.fov+=(focusFov-this.camera.fov)*k;
    this.camera.updateProjectionMatrix();
    this.camera.position.lerp(pos,k);this.look.lerp(look,k);
    this.camera.lookAt(this.look);
    this.helmStick.rotation.y=this.helmInput.yaw*.26;
    this.helmStick.position.y=this.helmInput.thrust*.13;
    const hoveredControl=view.hovered?.replace(/^desk:[^:]+:/,'');
    for(const key of this.helmKeys) {
      const material=key.material as THREE.MeshStandardMaterial;
      const latched=key.userData.control==='camera.lamp'&&run.lamp;
      material.emissiveIntensity=hoveredControl===key.userData.control ? .65 : latched ? .5 : .12;
    }
    this.camera.rotateZ(-run.pilot.yawRate*.002);
    this.camera.position.y+=Math.sin(view.time*1.4)*Math.min(1,Math.abs(run.pilot.speed))*.004;
    this.lamp.intensity=run.blackout?.18:2.7+Math.sin(view.time*2)*.06;
    const alarm=damageAlarm(run.hull,view.time);
    this.damageLights.forEach(light=>{light.intensity=alarm.intensity;});
    this.damageLens.emissiveIntensity=alarm.level?alarm.intensity*.6:0;
    this.normalLights.forEach(({light,intensity})=>{light.intensity=intensity*(alarm.level===2?.025:alarm.level===1?.055:1);});
    if(alarm.level)this.lamp.intensity*=alarm.level===2?.025:.06;
    this.flood.visible=run.flood>.01;
    this.storyLamps.forEach((lamp,i)=>{
      const collected=run.campaign.has(i,'evidence');
      lamp.emissiveIntensity=collected?.55:i===run.campaign.chapter?.15+.10*Math.sin(view.time*2):0;
    });
    this.flood.position.y=.015+run.flood*.65+Math.sin(view.time*1.7)*run.flood*.006;
    this.updateNavigationKeyboard?.(run);
    this.updatePassiveControls?.(run);
    this.updateActiveControls?.(run,hoveredControl);
    this.frame++;
    for(const [index,screen] of this.screens.entries()) {
      // Focused terminal stays live; peripheral terminals update at reduced rate.
      if(screen!==target && this.frame!==1 && this.frame%6!==index%6) continue;
      screen.hits.clear();
      const c=screen.canvas.getContext('2d')!;
      const ch=screen.canvas.height;
      c.clearRect(0,0,1024,ch);
      if(screen.repeater){
        c.fillStyle='#04100b';c.fillRect(0,0,1024,720);
        if(screen.id==='nav'){
          // 1024×720 canvas on a 0.32×0.26 m glass: canvas Y pixels display 1/ASPECT taller than X pixels.
          // The site sonar is drawn at 775×720 with its radar disc (r≈232) around (387,372); its own small
          // corner text is cropped away and the cabin redraws the readings in large type on the right.
          const ASPECT=(1024/720)*(.26/.32),SONAR_H=470,SONAR_W=Math.round(SONAR_H*ASPECT),CROP=[149,134,476] as const;
          const sx=SONAR_W/CROP[2],sy=SONAR_H/CROP[2];
          const site=run.authoredSite,nav=site?.navigationConsole,live=run.activeSonarEnabled&&run.powered;
          c.save();c.beginPath();c.rect(0,0,SONAR_W,SONAR_H);c.clip();c.scale(sx,sy);c.translate(-CROP[0],-CROP[1]);
          if(live){if(nav?.drawActive)nav.drawActive(c,775,720,false);else drawDrivingSonarInstrument(c,run,775,720,view.time);}
          else{c.strokeStyle='#456d3e';c.lineWidth=3;for(const radius of [77,155,232]){c.beginPath();c.arc(387,372,radius,0,Math.PI*2);c.stroke();}}
          c.restore();
          if(nav?.drawActive&&live)for(const m of nav.markerHits??[])screen.hits.add({id:'sonar.waypoint.'+m.index,x:(m.x-m.r-CROP[0])*sx,y:(m.y-m.r-CROP[1])*sy,w:m.r*2*sx,h:m.r*2*sy});
          // Readout column in glass-true units (y drawn ×1/ASPECT so glyphs keep their shape).
          const px=SONAR_W+14,pw=1024-px-10;
          c.fillStyle='#06140f';c.fillRect(px-8,4,pw+14,SONAR_H-8);c.strokeStyle='#2f5a3a';c.lineWidth=2;c.strokeRect(px-8,4,pw+14,SONAR_H-8);
          c.save();c.translate(px,0);c.scale(1,1/ASPECT);c.textAlign='left';c.textBaseline='alphabetic';
          const text=(value:string,x:number,y:number,size:number,color:string,bold=true)=>{c.font=`${bold?'bold ':''}${size}px "Microsoft YaHei",monospace`;c.fillStyle=color;c.fillText(value,x,y,pw-x);};
          text(`航向 ${String(Math.round(((run.heading%360)+360)%360)).padStart(3,'0')}°`,0,58,48,'#e6f3d0');
          if(!live){
            text(run.powered?'主动声纳断电':'艇内供电中断',0,140,42,'#c4c095');
            text('无地形与距离',0,200,36,'#7f9f78',false);
          }else{
            const r=site?.sonarReadout,f=(v?:number)=>v===undefined?' —':v.toFixed(1);
            text(run.sonarEmitting?'回波间距 · 米':'上次回波 · 米',0,108,28,'#7f9f78',false);
            for(const [row,[a,av,b,bv]] of ([['前',r?.front,'后',r?.back],['左',r?.left,'右',r?.right],['顶',r?.above,'底',r?.below]] as const).entries()){
              const y=160+row*54;text(a+f(av),0,y,42,'#b9e0a0');text(b+f(bv),pw/2,y,42,'#b9e0a0');
            }
          }
          c.fillStyle='#2f5a3a';c.fillRect(0,300,pw,3);
          const brief=nav?.waypointBrief?.();
          if(brief){text(brief.title,0,352,40,'#63fff1');brief.lines.forEach((line,i)=>text(line,0,404+i*48,36,'#d8f5ea'));}
          c.restore();
          const input=sonarDeskState(run);c.fillStyle='#10180e';c.fillRect(0,SONAR_H,1024,720-SONAR_H);c.textAlign='left';c.textBaseline='middle';
          input.fields.forEach((value,i)=>{const x=14+i*336,y=SONAR_H+10;c.strokeStyle=input.axis===i?'#d9d59c':'#526447';c.lineWidth=3;c.strokeRect(x,y,324,96);c.fillStyle=input.axis===i?'#fff0b0':'#b9d296';c.font='bold 58px monospace';c.fillText(COORD_AXES[i]+' '+(value||'_'),x+14,y+50,300);screen.hits.add({id:'sonar.axis.'+i,x,y,w:324,h:96});});
          c.font='bold 46px Microsoft YaHei';c.fillStyle=live&&run.sonarPulseEnabled?'#f0c060':'#c4c095';c.fillText(!run.powered?'艇内供电中断':!run.activeSonarEnabled?'电源关 · 按下方「声纳电源」':run.sonarPulseEnabled?'周期扫描中 · 持续发声':'静默 · 按下方「脉冲扫描」',16,SONAR_H+160,990);
          c.font='32px Microsoft YaHei';c.fillStyle='#7f9f78';c.fillText('点 X / Y / DEPTH → 键盘输入 → 「写入」',16,SONAR_H+216,990);
        }else{
          c.fillStyle='#d4a253';c.font='30px monospace';c.fillText('OPTICAL / RECORDER',55,70);
          c.fillStyle='#647749';c.font='26px monospace';c.fillText('DEPTH '+Math.round(run.depth)+' m',55,615);c.fillText('HULL '+Math.round(run.hull*100)+' %',55,657);
          if(run.selectedTape)drawStationScreen(c,run,'lab',1024,720,view);
          else{c.strokeStyle='#315134';c.lineWidth=1;for(let y=135;y<540;y+=8){c.beginPath();c.moveTo(55,y);c.lineTo(970,y);c.stroke();}}
        }
      }
      else if(screen.id==='nav')drawCompactSonarDesk(c,run,screen.hits,view.time,ch);
      else if(screen.id==='camera') drawObservationWindow(c,run,screen.hits,view,screen===target);
      else if(screen===target || screen.id==='lab') drawStationView(c,run,screen.id,0,0,1024,720,screen.hits,view);
      else {
        c.fillStyle='#050d0d';c.fillRect(0,0,1024,720);
        c.save();
        drawStationScreen(c,run,screen.id,1024,720,view);
        c.restore();
        if(['radio','lab'].includes(screen.id)) {
          c.fillStyle='#071312';c.fillRect(42,104,940,550);
          c.fillStyle='#9daf8a';c.font='bold 66px monospace';c.textAlign='center';
          c.fillText(screen.id==='radio'?(run.radioWaiting?'INCOMING':'121.5 MHz'):`${run.unanalyzedCount} REELS`,512,305);
          c.font='30px monospace';c.fillStyle='#718578';
          c.fillText(screen.id==='radio'?'无线电 / 接收回路':'胶片冲洗 / 待分析',512,390);
          c.strokeStyle='#536e61';c.lineWidth=2;
          c.beginPath();
          for(let x=80;x<944;x+=4){const y=510+(screen.id==='radio'&&run.radioWaiting?Math.sin(x*.10+view.time*3)*Math.sin(x*.037)*24:0);if(x===80)c.moveTo(x,y);else c.lineTo(x,y);}c.stroke();
          c.textAlign='left';
        }
        c.strokeStyle='#455a4c';c.lineWidth=12;c.strokeRect(6,6,1012,708);
        c.fillStyle='rgba(0,0,0,.13)';for(let y=0;y<720;y+=4)c.fillRect(0,y,1024,1);
      }
      if(screen.id==='salvage' && screen===target) {
        c.fillStyle='#202a2b';c.fillRect(22,22,405,29);
        c.fillStyle='#dca666';c.font='bold 20px monospace';
        c.fillText('ARM · 机械臂副控 / 共用摄像回路',30,44);
      }
      if(screen.id==='camera'){
        // Cosmetic glass scatter only: recorded sensor frames remain untouched.
        drawPortholeGlass(c);
        c.save();c.globalCompositeOperation='screen';
        const haze=c.createRadialGradient(430,170,30,510,330,610);haze.addColorStop(0,'rgba(67,105,99,.20)');haze.addColorStop(.6,'rgba(35,67,65,.16)');haze.addColorStop(1,'rgba(5,19,25,0)');c.fillStyle=haze;c.fillRect(0,0,1024,720);
        for(let i=0;i<36;i++){const px=(i*137.37+Math.sin(view.time*.05+i)*7)%1024,py=(i*83.91+view.time*(.5+i%3))%720;c.fillStyle='rgba(133,179,177,'+(.035+(i%5)*.012)+')';c.beginPath();c.arc(px,py,.5+i%3*.45,0,Math.PI*2);c.fill();}
        c.restore();
      }
      if(screen.id==='nav'||screen.id==='lab'){

        // A full-colour lab frame keeps the recording legible (pipe colour bands); the default stays amber.
        const trueColour=screen.id==='lab'&&run.labVideoExpanded&&!!run.authoredSite?.presentation?.labLargeFrame;
        c.save();c.globalCompositeOperation='multiply';c.fillStyle=screen.repeater&&screen.id==='nav'?'#a4ffa0':trueColour?'#fff2de':'#ffbc63';c.fillRect(0,0,1024,ch);c.restore();
        c.fillStyle='rgba(0,0,0,.12)';for(let y=0;y<ch;y+=4)c.fillRect(0,y,1024,1);
        const vignette=c.createRadialGradient(512,ch*.47,260,512,ch/2,620);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.42)');c.fillStyle=vignette;c.fillRect(0,0,1024,ch);
      }
      screen.texture.needsUpdate=true;
    }
    // A damped physical kick of the seated eye, not an effect painted on footage.
    this.impactAge+=view.dt;
    const t=this.impactAge,a=this.impactStrength*Math.exp(-t*2.5);
    const restPosition=this.camera.position.clone(),restRotation=this.camera.quaternion.clone();
    this.camera.translateX(a*.045*Math.sin(t*24));
    this.camera.translateY(a*.032*Math.sin(t*31));
    this.camera.translateZ(a*.065*Math.cos(t*18));
    this.camera.rotateZ(a*.045*Math.sin(t*19));
    this.camera.rotateX(a*.028*Math.cos(t*23));
    const normalLight=this.lamp.intensity;
    if(t<.65)this.lamp.intensity*=.35+.65*Math.abs(Math.sin(t*29));
    this.renderer.render(this.scene,this.camera);
    // Picking must use the exact shaken pose that produced the visible frame.
    this.pickingCamera.copy(this.camera);this.pickingCamera.updateMatrixWorld(true);
    this.lamp.intensity=normalLight;
    this.camera.position.copy(restPosition);this.camera.quaternion.copy(restRotation);
    this.camera.updateMatrixWorld(true);
    ctx.drawImage(this.renderer.domElement,0,0,w,h);
  }

  pick(x:number,y:number,w:number,h:number):string|null {
    this.ray.setFromCamera(new THREE.Vector2(x/w*2-1,1-y/h*2),this.pickingCamera);
    // First solid surface wins, so screens cannot be clicked through a cabinet.
    const hit=this.ray.intersectObjects(this.scene.children,true)[0];
    if(hit && this.isConsole(this.focused)) {
      let object:THREE.Object3D|null=hit.object;
      while(object){
        if(object.userData.control==='sonar.slider'){
          // Range is in the CRT group's local X; the hit position along it is the frequency.
          let root:THREE.Object3D|null=object;while(root&&!root.userData.deviceSide)root=root.parent;
          const [x0,length]=object.userData.sliderRange as [number,number];
          const x=(root??object).worldToLocal(hit.point.clone()).x;
          return 'desk:nav:sonar.tune.'+Math.round(THREE.MathUtils.clamp((x-x0)/length,0,1)*100);
        }
        if(object.userData.control)return 'desk:'+(object.userData.station||'camera')+':'+object.userData.control;object=object.parent;
      }
    }
    if(!hit?.uv) return null;
    const screen=this.screens.find(s=>s.mesh===hit.object);
    if(!screen || (!this.focused && hit.distance>1.65)) return null;
    const ch=screen.canvas.height;
    if(this.isConsole(this.focused)&&this.isConsole(screen.id)){const action=screen.hits.pick(hit.uv.x*1024,(1-hit.uv.y)*ch);return action?'desk:'+screen.id+':'+action:null;}
    if(this.focused && this.focusedFace===screen.id) return screen.hits.pick(hit.uv.x*1024,(1-hit.uv.y)*ch);
    return `station:${screen.id}`;
  }

  selectFace(id: string) {
    if(id.startsWith('station:')) this.preferredFace=id.slice(8) as StationId;
  }

  dispose() {
    this.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();if(!Array.isArray(o.material))o.material.dispose();}});
    this.helmLabels.forEach(t=>t.dispose());
    this.portholeTextures.forEach(t=>t.dispose());
    this.screens.forEach(s=>s.texture.dispose());this.materials.dispose();this.renderer.dispose();
  }
}





