import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PodRun } from '../sim/run';
import { canonicalStation, type StationId } from '../types';
import { HitMap } from './chrome';
import { drawStationView, drawStationScreen, drawObservationWindow, type StationView } from './stations';
import { createReferenceMaterials } from './deepsea/reference-materials';
import { addCabinDressing } from './cabin-dressing';
import { buildIndustrialHelm } from './cabin-helm';
import { damageAlarm } from './damage-alarm';

/** Metres: a sealed 2.3 × 4.0 × 2.1 pressure cell, not a screen gallery. */
export class CabinThree {
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(67, 1, 0.025, 15);
  private renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  private materials = createReferenceMaterials();
  private screens: { id: StationId; mesh: THREE.Mesh; canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; hits: HitMap; group: THREE.Group }[] = [];
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
  private storyLamps:THREE.MeshStandardMaterial[]=[];
  private helmStick = new THREE.Group();
  readonly helmInput={thrust:0,yaw:0};
  private impactAge=10;
  private impactStrength=0;
  impact(amount:number){this.impactAge=0;this.impactStrength=Math.min(1,Math.max(amount,this.impactStrength*.4));}
  private helmKeys:THREE.Mesh[]=[];
  private helmLabels:THREE.Texture[]=[];

  turn(dx:number,dy:number) {
    if(this.focused==='camera'){this.helmLook=THREE.MathUtils.clamp(this.helmLook+dy*.0022,-.12,.70);return;}
    if(this.focused) return;
    this.yaw-=dx*.0022;
    this.pitch=THREE.MathUtils.clamp(this.pitch-dy*.0022,-1.15,1.15);
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

  pose() {return {x:this.eye.x,z:this.eye.z,yaw:this.yaw,pitch:this.pitch,seatEye:this.camera.position.toArray(),helmLook:this.helmLook};}
  private lamp = new THREE.PointLight(0x99d5ce, 3, 5, 2);
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
    this.scene.add(new THREE.HemisphereLight(0x8bb7be, 0x29201a, 0.65));
    const consoleSpill=new THREE.PointLight(0xffbd72,1.3,3.3,2);
    consoleSpill.position.set(0,.65,-.8);this.scene.add(consoleSpill);
    this.lamp.position.set(-0.25, 1.87, 0.3);
    this.lamp.castShadow = true;
    this.lamp.shadow.mapSize.set(1024, 1024);
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
      for(let j=0;j<3;j++) this.pipe(s, [[side*(.25+j*.14),2.01,-1.6],[side*(.3+j*.14),1.93,-.4],[side*(.32+j*.14),1.94,2]], .024, j===0?m.red:m.rubber);
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
    this.terminal('radio',[-.94,1.29,-.20],Math.PI/2,.74,.56);
    this.terminal('camera',[0,1.23,-1.53],0,1.72,.94);
    this.terminal('nav',[.97,1.25,-1.03],-Math.PI/2,.65,.55);
    this.terminal('lab',[.94,1.14,-.20],-Math.PI/2,.74,.60);
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

  private terminal(id: StationId, p: number[], yaw: number, w: number, h: number) {
    const group=new THREE.Group();group.position.set(p[0]!,p[1]!,p[2]!);group.rotation.y=yaw;
    this.scene.add(group);
    const m=this.materials;
    this.box(group,[w+.09,h+.11,.24],[0,0,-.10],m.hull,.045);
    this.box(group,[w+.025,h+.025,.03],[0,0,.035],m.rubber,.014);
    this.box(group,[w+.12,.07,.40],[0,-h/2-.11,-.01],m.steel,.02);
    for(const side of [-1,1]) {
      this.pipe(group,[[side*(w/2+.055),-.18,.03],[side*(w/2+.06),-.13,.10],[side*(w/2+.06),.15,.10],[side*(w/2+.055),.19,.03]],.015,m.steel);
      for(const y of [-h/2,h/2]) this.box(group,[.025,.025,.016],[side*w/2,y,.05],m.steel);
      this.pipe(group,[[side*.2,-h/2,-.16],[side*.2,-h/2-.2,-.2],[side*.28,-h/2-.34,-.17]],.017,m.rubber);
    }
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=720;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));
    mesh.position.z=.055;group.add(mesh);
    if(id==='camera') {
      // Recessed, chamfered pressure-window surround, not two monitor bezels.
      const outline=(width:number,height:number)=>[
        [-width/2+.13,-height/2],[width/2-.13,-height/2],[width/2,-height/2+.13],[width/2,height/2-.13],
        [width/2-.13,height/2],[-width/2+.13,height/2],[-width/2,height/2-.13],[-width/2,-height/2+.13],
      ].map(p=>new THREE.Vector2(p[0],p[1]));
      const shape=new THREE.Shape(outline(w+.19,h+.19));
      shape.holes.push(new THREE.Path(outline(w-.035,h-.035).reverse()));
      const rim=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.105,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.015,bevelThickness:.015}),m.steel);
      rim.position.z=.065;rim.castShadow= rim.receiveShadow=true;group.add(rim);
      for(const x of [-.86,-.43,0,.43,.86]) for(const y of [-.52,.52]) {
        const bolt=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.018,6),m.yellow);
        bolt.rotation.x=Math.PI/2;bolt.position.set(x,y,.19);group.add(bolt);
      }
    }
    this.screens.push({id,mesh,canvas,texture,hits:new HitMap(),group});
  }

  ensure(w: number,h: number) {
    if(this.renderer.domElement.width!==w || this.renderer.domElement.height!==h) this.renderer.setSize(w,h,false);
    this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  }

  draw(ctx: CanvasRenderingContext2D,w:number,h:number,run:PodRun,_hits:HitMap,view:StationView & {dt:number}) {
    this.ensure(w,h);
    this.focused=run.at;
    if(!run.at || (this.preferredFace && canonicalStation(this.preferredFace)!==run.at)) this.preferredFace=null;
    const target=this.screens.find(s=>s.id===(this.preferredFace??run.at));
    this.focusedFace=target?.id??null;
    const pos=this.eye.clone();
    pos.y+=Math.sin(this.walking)*.009;
    const look=pos.clone().add(new THREE.Vector3(-Math.sin(this.yaw)*Math.cos(this.pitch),Math.sin(this.pitch),-Math.cos(this.yaw)*Math.cos(this.pitch)));
    if(target) {
      target.mesh.getWorldPosition(look);
      const distance=target.id==='camera'?1.10:this.camera.aspect<1.3?1.05:.77;
      pos.copy(target.group.localToWorld(new THREE.Vector3(0,target.id==='camera'?.09:.025,distance)));
      if(target.id==='camera') look.y-=.08+Math.tan(this.helmLook)*distance;
    }
    const k=1-Math.exp(-view.dt*5);
    this.camera.position.lerp(pos,k);this.look.lerp(look,k);
    this.camera.lookAt(this.look);
    this.helmStick.rotation.y=this.helmInput.yaw*.26;
    this.helmStick.rotation.x=-this.helmInput.thrust*.28;
    for(const key of this.helmKeys) {
      const material=key.material as THREE.MeshStandardMaterial;
      material.emissiveIntensity=view.hovered===key.userData.control ? .65 : .12;
    }
    this.camera.rotateZ(-run.pilot.yawRate*.002);
    this.camera.position.y+=Math.sin(view.time*1.4)*Math.min(1,Math.abs(run.pilot.speed))*.004;
    this.lamp.intensity=run.blackout?.18:1.8+Math.sin(view.time*2)*.06;
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
    this.frame++;
    for(const [index,screen] of this.screens.entries()) {
      // Focused terminal stays live; peripheral terminals update at reduced rate.
      if(screen!==target && this.frame!==1 && this.frame%6!==index) continue;
      screen.hits.clear();
      const c=screen.canvas.getContext('2d')!;
      c.clearRect(0,0,1024,720);
      if(screen.id==='camera') drawObservationWindow(c,run,screen.hits,view,screen===target);
      else if(screen===target) drawStationView(c,run,screen.id,0,0,1024,720,screen.hits,view);
      else {
        c.fillStyle='#050d0d';c.fillRect(0,0,1024,720);
        c.save();
        drawStationScreen(c,run,screen.id,1024,720,view);
        c.restore();
        if(screen.id==='radio' || screen.id==='lab') {
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
    if(hit && this.focused==='camera') {
      let object:THREE.Object3D|null=hit.object;
      while(object){if(object.userData.control)return object.userData.control;object=object.parent;}
    }
    if(!hit?.uv) return null;
    const screen=this.screens.find(s=>s.mesh===hit.object);
    if(!screen || (!this.focused && hit.distance>1.65)) return null;
    if(this.focused && this.focusedFace===screen.id) return screen.hits.pick(hit.uv.x*1024,(1-hit.uv.y)*720);
    return `station:${screen.id}`;
  }

  selectFace(id: string) {
    if(id.startsWith('station:')) this.preferredFace=id.slice(8) as StationId;
  }

  dispose() {
    this.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();if(!Array.isArray(o.material))o.material.dispose();}});
    this.helmLabels.forEach(t=>t.dispose());
    this.screens.forEach(s=>s.texture.dispose());this.materials.dispose();this.renderer.dispose();
  }
}
