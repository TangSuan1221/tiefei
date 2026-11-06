import * as THREE from 'three';
import { createHelmMaterials } from './cabin-helm-materials';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Local XY is the horizontal deck; +Z points up into the seated operator's reach. */
export function buildIndustrialHelm(scene: THREE.Scene, stick: THREE.Group, keys: THREE.Mesh[], textures: THREE.Texture[]) {
  let seed = 731;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const {steel, face, metal, dark, recess, noise, hazard, painted, wornSteel, frontLip, frontFold, edgeMetal, authoredPainted, rubber, gripRubber, legendPlate} = createHelmMaterials(textures);
  const capMaterial=(color:number)=>{const mat=painted(color);mat.roughness=.92;mat.envMapIntensity=.18;mat.emissive.setHex(0x2a2112);mat.emissiveIntensity=.12;return mat;};
  const circularCompensation = .65 / .90;
  const panel = new THREE.Group(); panel.name = 'helm-reference-panel'; panel.position.set(.12, .88, -1.42); panel.rotation.x = -Math.PI * .31; panel.scale.set(.65, .90, .65);
  // Compact the entire assembly about its rear mounting edge, preserving the
  // physical control proportions and all local interaction coordinates.
  const compact = .85;
  panel.position.add(new THREE.Vector3(0, .33 * .90 * (1 - compact), 0).applyEuler(panel.rotation));
  panel.scale.multiplyScalar(compact); scene.add(panel);
  // Shielded task light makes engraving and paint readable below the window.
  const taskLight = new THREE.SpotLight(0xc7dbd4, .26 * compact * compact, 1.65 * compact, Math.PI * .40, .65, 2);
  taskLight.target.position.set(0,0,.08);panel.add(taskLight.target);
  taskLight.position.set(.10, .36, .46);
  taskLight.name='helm-task-light';taskLight.shadow.autoUpdate=false;taskLight.shadow.needsUpdate=true;
  taskLight.castShadow=true;taskLight.shadow.mapSize.set(1024,1024);
  taskLight.shadow.camera.near=.015;taskLight.shadow.camera.far=1.65;
  taskLight.shadow.bias=-.00008;taskLight.shadow.normalBias=.0002;
  panel.add(taskLight);
  const auxiliaryLight = new THREE.PointLight(0xf0bb78, .055 * compact * compact, .95 * compact, 2);
  auxiliaryLight.position.set(.57, .07, .39); panel.add(auxiliaryLight);
  const mesh = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o;
  };
  const box = (p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, radius = .003) =>
    mesh(p, new RoundedBoxGeometry(w, h, d, 2, radius), mat, x, y, z);
  const cylinder = (p: THREE.Object3D, r: number, bottom: number, depth: number, x: number, y: number, z: number, mat: THREE.Material, sides = 32) => {
    const o = mesh(p, new THREE.CylinderGeometry(r, bottom, depth, sides), mat, x, y, z); o.rotation.x = Math.PI / 2; return o;
  };
  const ring = (p: THREE.Object3D, r: number, tube: number, x: number, y: number, z: number, mat: THREE.Material) =>
    mesh(p, new THREE.TorusGeometry(r, tube, 8, 32), mat, x, y, z);
  // Rear service deck joins the optical bulkhead to the existing live helm.
  // It sits behind/below every control surface; no new gameplay hit targets.
  const rear=new THREE.Group();rear.position.set(.12,.90,-1.69);rear.rotation.x=-.12;rear.scale.set(compact,1,1);scene.add(rear);
  box(rear,1.25,.035,.22,0,0,0,steel,.008);
  for(let i=0;i<5;i++){
    const x=-.48+i*.24;box(rear,.215,.012,.16,x,.023,0,face,.003);
    for(let j=0;j<6;j++)box(rear,.095,.002,.004,x,.031,-.065+j*.017,recess,.0005);
    for(const dx of [-.089,.089])for(const dz of [-.075,.075]){
      const bolt=mesh(rear,new THREE.CylinderGeometry(.003,.003,.002,10),metal,x+dx,.032,dz);
    }
  }
  const screw = (p: THREE.Object3D, x: number, y: number, z: number) => {
    const head=cylinder(p, .0075, .0075, .003, x, y, z, metal, 16);head.scale.z=circularCompensation;
    const slot = box(p, .009, .0016, .0008, x, y, z + .0018, recess, .0002); slot.rotation.z = random() * Math.PI;
  };
  const plate = (p: THREE.Object3D, text: string, x: number, y: number, z: number, width: number, height = .025, primary = false) => {
    // The real beveled enamel plate supplies its surface and edge response.
    // This transparent decal contains ink only, with no graphic outline.
    const backing=box(p, width + .003, height + .003, .002, x, y, z, legendPlate(width,height,width === .094), .001);backing.name=`label-${text}`;
    const c = document.createElement('canvas'); c.height = 128; c.width = Math.round(128 * width / height);
    const g = c.getContext('2d')!;
    g.clearRect(0,0,c.width,c.height);
    const fontSize=width === .094 ? 90 : 100;
    g.font = primary ? `900 ${fontSize}px "SimHei", sans-serif` : '500 43px monospace';
    g.textAlign='center';g.textBaseline='middle';
    const glyphs=[...text],glyphWidth=fontSize*1.10;
    const span=glyphs.length>=5?Math.min(c.width*.80,glyphWidth*glyphs.length+32*(glyphs.length-1)):Math.min(c.width*.88,glyphWidth*glyphs.length+8*(glyphs.length-1));
    const step=glyphs.length>1?(span-glyphWidth)/(glyphs.length-1):0;
    for(let i=0;i<glyphs.length;i++){
      const px=c.width/2+(i-(glyphs.length-1)/2)*step;
      g.save();g.translate(px,c.height/2);g.scale(1.10,.85);
      g.fillStyle='rgba(7,11,8,.48)';g.fillText(glyphs[i],.35,.45);
      g.fillStyle=primary?'#bdbba3':'#b5b5a0';g.fillText(glyphs[i],0,0);
      g.restore();
    }
    g.globalCompositeOperation='destination-out';
    for(let i=0;i<110;i++){g.fillStyle=`rgba(0,0,0,${.2+random()*.5})`;g.fillRect(random()*c.width,random()*c.height,1+random()*4,.5+random());}
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; textures.push(t);
    const ink=mesh(p, new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({map: t, transparent:true, depthWrite:false, roughness:.95, metalness:.05}), x, y, z + .0012);
    ink.castShadow=false;
  };
  box(panel, 1.72, .605, .12, 0, .0275, 0, steel, .022);
  box(panel, 1.68, .565, .009, 0, .0275, .063, recess, .012);
  box(panel, 1.655, .545, .008, 0, .0275, .068, face, .008);
  for (const x of [-.75, .75]) box(scene, .085, .70, .24, .12 + x * .54, .35, -1.48, steel, .02);
  // Folded front lip and worn hand rest, with a narrow exposed metal edge.
  box(panel, 1.66, .003, .025, 0, -.2665, .060, steel, .001);
  box(panel, 1.64, .066, .010, 0, -.210, .074, frontLip, .003).name='helm-front-skirt';
  box(panel, 1.60, .022, .022, 0, -.254, .074, frontFold, .004).name='helm-front-lip';
  const upperBand=frontLip.clone();upperBand.onBeforeCompile=frontLip.onBeforeCompile;upperBand.customProgramCacheKey=frontLip.customProgramCacheKey;upperBand.color.setHex(0x596459);upperBand.envMapIntensity=.65;
  box(panel, 1.62, .028, .009, 0, .285, .075, upperBand, .002).name='helm-upper-steel-band';
  for (const x of [-.812, .812]) for (const y of [-.215, .27]) screw(panel, x, y, .075);
  const subpanel = (x: number, y: number, w: number, h: number) => {
    box(panel, w + .012, h + .012, .004, x, y, .074, recess);
    box(panel, w, h, .006, x, y, .076, authoredPainted(x < 0 ? 0x35443a : x > .4 ? 0x3d4534 : 0x3b4b3e, x < 0 ? [.551,.568,1.073] : x > .4 ? [.36,.32,.29] : [.154,.161,.116]));
    // Worn rolled steel edges remain in short exposed stretches, never a
    // pristine UI-like outline around the plates.
    const edgeStrips=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),edgeMetal,16);
    const transform=new THREE.Matrix4(),rotation=new THREE.Quaternion();let stripIndex=0;
    const edgeStrip=(width:number,height:number,px:number,py:number)=>{
      transform.compose(new THREE.Vector3(px,py,.080),rotation,new THREE.Vector3(width,height,.001));
      edgeStrips.setMatrixAt(stripIndex++,transform);
    };
    let edgeSeed=Math.round((x+1)*100000)>>>0;
    const edgeRandom=()=>{edgeSeed=(Math.imul(edgeSeed,1664525)+1013904223)>>>0;return edgeSeed/4294967296;};
    for(const sign of [-1,1]){
      for(let segment=0;segment<4;segment++){
        const hSpan=w/4*(.30+edgeRandom()*.60),hThickness=.0007+edgeRandom()*.0011;
        const hShift=(edgeRandom()-.5)*w/4*.08,hInset=.0008+edgeRandom()*.002;
        edgeStrip(hSpan,hThickness,x-w/2+w/4*(segment+.5)+hShift,y+sign*(h/2-hInset));
        const vSpan=h/4*(.30+edgeRandom()*.60),vThickness=.0007+edgeRandom()*.0011;
        const vShift=(edgeRandom()-.5)*h/4*.08,vInset=.0008+edgeRandom()*.002;
        edgeStrip(vThickness,vSpan,x+sign*(w/2-vInset),y-h/2+h/4*(segment+.5)+vShift);
      }
    }
    edgeStrips.receiveShadow=true;edgeStrips.raycast=()=>{};panel.add(edgeStrips);
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) screw(panel, x + dx * (w / 2 - .014), y + dy * (h / 2 - .013), .081);
  };
  subpanel(-.4305, .0455, .689, .445);
  subpanel(.1405, .0455, .429, .445);
  subpanel(.5735, .0455, .413, .445);
  // Use the spare top margin: move complete mechanisms, legends and contact
  // patches together; keep the animated slider coordinates local to its track.
  const controlsDeck=new THREE.Group();controlsDeck.name="helm-controls-deck";
  controlsDeck.position.y=.055;panel.add(controlsDeck);
  plate(controlsDeck, '档位', -.53, -.205, .083, .10, .028, true);
  const throttle=new THREE.Group();throttle.name='helm-throttle';throttle.userData.control='helm.throttle';controlsDeck.add(throttle);
  box(throttle,.052,.355,.008,-.53,-.015,.086,metal);
  box(throttle,.024,.32,.009,-.53,-.015,.092,recess);
  for(const y of [-.18,.15])screw(throttle,-.53,y,.094);
  for(let i=0;i<13;i++)box(throttle,i%3===0?.019:.010,.002,.002,-.555,.135-i*.025,.089,metal);
  ['0','I','II','III'].forEach((label,i)=>plate(throttle,label,-.47,-.145+i*.095,.091,.045,.024,true));
  const slider=box(throttle,.042,.035,.025,-.53,-.015,.104,metal);
  slider.name='helm-throttle-grip';
  // Move the complete mechanism up/right; thrust animation remains local to its mount.
  const stickMount=new THREE.Group();stickMount.name='helm-stick-mount';stickMount.position.set(-.1525,.054,-.005);stickMount.scale.set(.89,.89*circularCompensation,.89);controlsDeck.add(stickMount);
  // Stationary mounting flange and boot. Only the shaft/grip pivot with input.
  cylinder(stickMount, .091, .091, .009, -.57, 0, .087, metal);
  cylinder(stickMount, .079, .079, .012, -.57, 0, .096, rubber);
  for (const x of [-1, 1]) for (const y of [-1, 1]) screw(stickMount, -.57 + x * .063, y * .063, .094);
  // Six broad pleats with deep valleys make a rising tapered bellows,
  // rather than a stack of closely spaced black discs.
  const bootProfile:THREE.Vector2[]=[];
  for(let i=0;i<6;i++){
    const radius=.079-i*.0095,height=i*.019;
    bootProfile.push(new THREE.Vector2(radius-.002,height),new THREE.Vector2(radius,height+.003),new THREE.Vector2(radius-.002,height+.007),new THREE.Vector2(radius-.013,height+.013));
  }
  bootProfile.push(new THREE.Vector2(.022,.114));
  const boot=mesh(stickMount,new THREE.LatheGeometry(bootProfile,64),rubber,-.57,0,.102);
  boot.name='helm-stick-boot';boot.rotation.x=Math.PI/2;
  // Pivot at the boot's narrow opening, rather than sliding the shaft through
  // the stationary bellows. The ball joint stays seated at every input angle.
  stick.position.set(-.57, 0, .208); stick.userData.control = 'helm.stick'; stickMount.add(stick);
  mesh(stick, new THREE.SphereGeometry(.024, 20, 12), metal, 0, 0, 0);
  const shaftStart=new THREE.Vector3(0,0,0),shaftEnd=new THREE.Vector3(-.0115,-.0086,.115);
  const shaftDirection=shaftEnd.clone().sub(shaftStart),shaftMid=shaftStart.clone().add(shaftEnd).multiplyScalar(.5);
  const shaft=mesh(stick,new THREE.CylinderGeometry(.014,.018,shaftDirection.length(),32),rubber,shaftMid.x,shaftMid.y,shaftMid.z);
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),shaftDirection.normalize());
  ring(stick,.020,.004,-.009,-.0068,.104,rubber);
  mesh(stick,new THREE.SphereGeometry(.058,40,24),gripRubber,-.0115,-.0086,.149).name='helm-stick-grip';
  ring(stick,.025,.002,-.009,-.0068,.104,rubber);
  // Flange is also a usable joystick target, without an invisible blocking hitbox.
  for (const o of stickMount.children) if (o.position.x === -.57) o.userData.control = 'helm.stick';

  // Paired momentary controls within reach of the stick, below the optical row.
  // Reuse the pilot actions so release, exposure and playback interlocks still apply.
  plate(controlsDeck, '俯仰角', -.339, .183, .083, .15, .025, true);
  plate(controlsDeck, '垂直升降', -.179, .183, .083, .16, .025, true);
  const trimButtons = [
    ['drive.up', '抬头', -.339, .105], ['drive.down', '低头', -.337, .001],
    ['nav.pitchUp', '上升', -.179, .106], ['nav.pitchDown', '下降', -.180, .001],
  ] as const;
  for (const [id, title, x, y] of trimButtons) {
    const control = new THREE.Group();
    control.name = id; control.userData.control = id;
    control.position.set(x, y, .083); controlsDeck.add(control);
    box(control, .126, .096, .009, 0, 0, 0, recess);
    box(control, .117, .087, .010, 0, 0, .006, metal);
    const cap = box(control, .106, .076, .016, 0, 0, .017,
      capMaterial(id.startsWith('drive.') ? 0x4c574b : 0x434e3d), .006);
    cap.userData.control = id; keys.push(cap);
    plate(control, title, 0, 0, .027, .094, .043, true);
  }

  // A soft baked contact stain anchors small mechanisms where shadow-map
  // texels would otherwise lose the narrow occlusion at their mounting feet.
  const contactCanvas=document.createElement('canvas');contactCanvas.width=contactCanvas.height=128;
  const contactCtx=contactCanvas.getContext('2d')!;
  const contactGradient=contactCtx.createRadialGradient(64,64,22,64,64,63);
  contactGradient.addColorStop(0,'rgba(7,9,6,.58)');contactGradient.addColorStop(.55,'rgba(7,9,6,.35)');contactGradient.addColorStop(1,'rgba(7,9,6,0)');
  contactCtx.fillStyle=contactGradient;contactCtx.fillRect(0,0,128,128);
  const contactMap=new THREE.CanvasTexture(contactCanvas);textures.push(contactMap);
  const contactMat=new THREE.MeshBasicMaterial({map:contactMap,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,toneMapped:false});
  const contact=(x:number,y:number,w:number,h:number)=>{
    const stain=mesh(controlsDeck,new THREE.PlaneGeometry(w,h),contactMat,x,y,.0805);
    stain.raycast=()=>{};stain.castShadow=false;return stain;
  };
  contact(-.660,.054,.23,.17);contact(-.53,-.015,.08,.38);
  for(const [, ,x,y] of trimButtons)contact(x,y,.15,.12);
  contact(-.257,-.141,.23,.22);contact(.131,.100,.15,.14);
  contact(.138,-.1075,.14,.13);contact(.553,.058,.15,.14);

  // Four distinct industrial mechanisms reproduce the reference silhouettes.
  const controlGroup = (id:string,x:number,y:number) => {
    const group=new THREE.Group();group.position.set(x,y,.083);group.userData.control=id;controlsDeck.add(group);return group;
  };

  const register=(key:THREE.Mesh,id:string)=>{key.userData.control=id;keys.push(key);return key;};
  const brake=controlGroup('helm.brake',-.257,-.141);brake.scale.set(.92,.92*circularCompensation,1);
  cylinder(brake,.105,.112,.009,0,0,.005,dark,64);
  cylinder(brake,.101,.108,.012,0,0,.013,hazard,64);
  cylinder(brake,.082,.087,.011,0,0,.021,recess,64);
  ring(brake,.086,.0085,-.00463,0,.05956,metal).name='helm-brake-guard';
  const guardSupport=metal.clone();guardSupport.color.multiplyScalar(.35);guardSupport.roughness=.8;
  for(const sign of [-1,1])cylinder(brake,.003,.003,.036,-.00463+sign*.062,.058,.037,guardSupport,12);
  ring(brake,.075,.003,0,0,.026,dark);
  // The reference places the mushroom cap slightly toward the upper side of
  // its guard. This art offset is not a mechanical coaxial calibration.
  const brakePlunger=new THREE.Group();brakePlunger.name='helm-brake-plunger';brakePlunger.position.set(-.00862,.00494,.025);brake.add(brakePlunger);
  cylinder(brake,.038,.041,.050,-.00862,.00494,.0255,metal,48).name='helm-brake-stem';
  const capSocket=cylinder(brakePlunger,.066,.071,.017,0,0,.028,dark,48);capSocket.scale.x=.90;capSocket.scale.z=.94;
  const brakeCap=mesh(brakePlunger,new THREE.SphereGeometry(.061,64,32,0,Math.PI*2,0,Math.PI/2),capMaterial(0x742c1e),0,0,.034);
  brakeCap.name='helm-brake-cap';brakeCap.rotation.x=Math.PI/2;brakeCap.scale.set(.90,.42,.94);register(brakeCap,'helm.brake');
  const capStamp=ring(brakePlunger,.043,.0008,0,0,.0524,paintedRed());capStamp.scale.set(.90,.94,1);
  function paintedRed(){return new THREE.MeshStandardMaterial({color:0x5c2119,roughness:.77,metalness:.2});}
  plate(controlsDeck,'制动',-.267,-.247,.081,.12,.035,true);

  const lamp=controlGroup('camera.lamp',.131,.100);lamp.scale.set(.93,.93*circularCompensation,1);
  const knobMount=new THREE.Group();knobMount.name='helm-lamp-assembly';knobMount.position.set(-.00222,-.02286,0);lamp.add(knobMount);
  cylinder(knobMount,.061,.064,.007,0,0,.003,metal,64).name='helm-lamp-base';
  cylinder(knobMount,.054,.058,.016,0,0,.013,recess,64);
  const knobProfile=[new THREE.Vector2(.050,-.018),new THREE.Vector2(.052,-.013),new THREE.Vector2(.052,.007),new THREE.Vector2(.051,.019),new THREE.Vector2(.050,.021),new THREE.Vector2(.048,.023),new THREE.Vector2(0,.023)];
  const knob=mesh(knobMount,new THREE.LatheGeometry(knobProfile,64),capMaterial(0x303328),0,0,.037);
  knob.name='helm-lamp-cap';knob.rotation.x=Math.PI/2;register(knob,'camera.lamp');
  const knurlMaterial=painted(0x4c4638);
  for(let tooth=0;tooth<36;tooth++){
    const angle=tooth*Math.PI/18;
    const rib=box(knobMount,.0045,.0048,.027,Math.cos(angle)*.052,Math.sin(angle)*.052,.032,knurlMaterial,.0015);
    rib.rotation.z=angle;
  }
  ring(knobMount,.043,.0012,0,0,.059,metal);
  box(knobMount,.003,.015,.001,0,.026,.0607,metal,.0003);
  cylinder(lamp,.013,.014,.006,0,.090,.005,metal,32);
  const amber=new THREE.MeshStandardMaterial({color:0x925015,emissive:0xffb51a,emissiveIntensity:.65,metalness:0,roughness:.48,toneMapped:false});
  amber.name='helm-amber-dielectric';
  const indicator=mesh(lamp,new THREE.SphereGeometry(.010,24,16),amber,0,.090,.012);indicator.name='helm-lamp-indicator';indicator.scale.z=.65;
  plate(controlsDeck,'照明',.137,.028,.085,.26,.046,true);
  plate(controlsDeck,'曝光',.145,-.027,.085,.20,.043,true);
  const shutter=controlGroup('camera.shoot',.138,-.1075);shutter.scale.set(.92,.92,1);
  box(shutter,.115,.110,.009,0,0,.003,recess,.005);
  box(shutter,.102,.097,.010,0,0,.010,metal,.005);
  box(shutter,.092,.087,.010,0,0,.018,dark,.005);
  const shutterCapMaterial=capMaterial(0x797b64);shutterCapMaterial.color.multiplyScalar(.70);shutterCapMaterial.color.g*=.90;
  register(box(shutter,.084,.079,.015,0,0,.028,shutterCapMaterial,.004),'camera.shoot');

  const arm=controlGroup('arm.extend',.553,.058);arm.scale.set(.88,.88*circularCompensation,1);
  cylinder(arm,.065,.068,.008,0,0,.003,recess,64);
  cylinder(arm,.058,.060,.007,0,0,.011,metal,64);
  cylinder(arm,.052,.055,.008,0,0,.019,dark,64);
  register(cylinder(arm,.050,.052,.005,0,0,.020,capMaterial(0x756b47),64),'arm.extend');
  ring(arm,.057,.002,0,0,.019,metal);
  plate(controlsDeck,'机械臂操作',.576,-.010,.085,.31,.045,true);
  // The existing retract action stays physically reachable as a small auxiliary
  // key, beneath the reference's primary circular manipulator control.
  const retract=controlGroup('arm.retract',.810,-.175);retract.position.z=.091;retract.rotation.y=-Math.PI*.28;
  box(retract,.050,.045,.007,0,0,0,recess);
  box(retract,.044,.039,.005,0,0,.005,metal);
  register(box(retract,.034,.029,.010,0,0,.012,capMaterial(0x3c463b)),'arm.retract');
  plate(retract,'收回',0,-.038,.003,.065,.022,true);

}
