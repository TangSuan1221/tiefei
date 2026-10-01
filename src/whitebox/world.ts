import * as THREE from 'three';

/** Standalone whitebox, metres; +Y up, approach panels facing -Z.
 * Navigation must test the complete 2.8 × 5 × 3 m hull against solids.
 * The moving gate is deliberately excluded from static solids.
 */
export function createWhiteboxWorld(): {
  scene: THREE.Scene; walkable: THREE.Box3[]; solids: THREE.Box3[];
  gate: THREE.Mesh; monster: THREE.Group; elias: THREE.Group;
  anchors: Record<string, THREE.Vector3>;
} {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071015);
  scene.fog = new THREE.FogExp2(0x102129, 0.014);
  scene.userData.runtimeProfile = 'standalone-whitebox';
  scene.userData.metricsVersion = '1.0';
  const solids: THREE.Box3[] = [];
  const anchors: Record<string, THREE.Vector3> = {
    start: new THREE.Vector3(0, 2, 18), observe: new THREE.Vector3(0, 2, 4),
    power: new THREE.Vector3(-12, 2, 4), control: new THREE.Vector3(12, 2, 4),
    rescue: new THREE.Vector3(0, 2, -8), exit: new THREE.Vector3(12, 2, 18),
    powerPanel: new THREE.Vector3(-12, 2, 1), controlPanel: new THREE.Vector3(15, 2, 4),
    rescuePanel: new THREE.Vector3(.9, 2, -11), exitPanel: new THREE.Vector3(12, 2, 15),
    cage: new THREE.Vector3(0, 2, -13), monster: new THREE.Vector3(3, 2, -10),
    winch: new THREE.Vector3(12, 2, -15), gate: new THREE.Vector3(12, 3.25, -5),
  };
  const gray = new THREE.MeshStandardMaterial({ color: 0x475c63, roughness: 0.9, metalness: .18 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24363d, roughness: 0.86 });
  const pale = new THREE.MeshStandardMaterial({ color: 0x8b9b9d, roughness: 0.78 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x654b3c, roughness: 1 });
  const marking = (color: number) => new THREE.MeshBasicMaterial({ color });
  const colors = [0x69b7c5, 0xd3b879, 0x8fa8d0, 0x91b99b, 0xc19b75];
  const box = (name: string, x: number, y: number, z: number, w: number, h: number, d: number,
    material: THREE.Material = gray, solid = true, parent: THREE.Object3D = scene) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.name = name; mesh.position.set(x, y, z); parent.add(mesh);
    if (solid) solids.push(new THREE.Box3(new THREE.Vector3(x-w/2,y-h/2,z-d/2),new THREE.Vector3(x+w/2,y+h/2,z+d/2)));
    return mesh;
  };
  const label = (text: string, position: THREE.Vector3, width = 4, color = '#d6e2e3') => {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 160;
    const context = canvas.getContext('2d'); if (!context) return;
    context.fillStyle = '#142128'; context.fillRect(0, 0, 768, 160);
    context.strokeStyle = color; context.lineWidth = 5; context.strokeRect(8, 8, 752, 144);
    context.fillStyle = color; context.font = 'bold 48px monospace'; context.textAlign = 'center';
    context.textBaseline = 'middle'; context.fillText(text, 384, 80, 725);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 160 / 768),
      new THREE.MeshBasicMaterial({map:texture, side:THREE.FrontSide}));
    const reverse=new THREE.Mesh(mesh.geometry,mesh.material);
    reverse.rotation.y=Math.PI;reverse.position.z=-.015;mesh.add(reverse);
    mesh.position.copy(position); scene.add(mesh);return mesh;
  };
  box('floor', 0, -.3, 3, 41, .6, 43, dark);
  box('ceiling', 0, 8.3, 3, 41, .6, 43, dark);
  box('west-wall', -20.3, 4, 3, .6, 8, 43);
  box('east-wall', 20.3, 4, 3, .6, 8, 43);
  box('north-wall', 0, 4, -18.3, 40, 8, .6);
  box('south-wall', 0, 4, 24.3, 40, 8, .6);
  // Cargo containment occupies only the northeast corner. Central spine remains open.
  box('cargo-west-partition', 6.5, 4, -11.5, 1, 8, 13);
  box('cargo-right-jamb', 18.5, 4, -5, 3, 8, .7);
  box('cargo-header', 12, 7.25, -5, 10, 1.5, .7);
  // Full-span collision belongs to the caller; visible steel grille preserves
  // a real optical sightline to the contained creature in delayed footage.
  const gate = box('cargo-gate',12,3.25,-5,10,6.5,.55,
    new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}),false);
  gate.userData.closedY = 3.25; gate.userData.openY = 10;
  for (const x of [-4.85,4.85]) box('gate-side',x,0,0,.3,6.5,.55,dark,false,gate);
  for (const y of [-3.1,3.1]) box('gate-cross-member',0,y,0,10,.3,.55,dark,false,gate);
  for (let x=-4;x<=4;x+=1) box('gate-grille-bar',x,0,0,.085,6.1,.2,pale,false,gate);
  for (const y of [-1.6,0,1.6]) box('gate-grille-brace',0,y,0,9.6,.09,.2,pale,false,gate);
  const gateStripe = new THREE.Mesh(new THREE.BoxGeometry(9.5,.22,.59),new THREE.MeshBasicMaterial({color:0xcab77b}));
  gateStripe.position.y = -2.1; gate.add(gateStripe);
  for (let x=-18; x<=18; x+=4) {
    box('deck-seam-x',x,.013,3,.025,.025,40,gray,false);
  }
  for (let z=-16; z<=22; z+=4) box('deck-seam-z',0,.014,z,38,.025,.025,gray,false);
  // Mark the 10 m spine with flat guide lines; no invisible collision geometry.
  for (const x of [-5,5]) box('spine-guide',x,.035,5,.09,.03,32,new THREE.MeshBasicMaterial({color:0x728f96}),false);
  for (const z of [-14,-6,2,10,18]) {
    box('west-rack',-18.4,2,z,2.8,4,3,dark);
    for (const y of [.8,2,3.2]) box('rack-shelf',-18.4,y,z,2.85,.1,3.05,pale,false);
  }
  for (const z of [-14,-8,4,12,20]) {
    box('wall-rib',19.65,4,z,.25,8,.4,dark);
    box('ceiling-rib',0,7.85,z,39.5,.25,.4,dark,false);
  }
  const stationNames = ['power','control','rescue','exit'];
  const stationText = ['02 西配电 / POWER','03 东货仓 / CARGO','04 人员避险区','05 下潜 / DESCENT'];
  stationNames.forEach((name,index) => {
    const p = anchors[name+'Panel']; const color = colors[index+1];
    const panelMat = new THREE.MeshStandardMaterial({color:0x354249,roughness:1});
    const panelWidth=name==='control'?.8:1.4;
    const panel = box(name+'-panel',p.x,p.y,p.z,panelWidth,1.1,.1,panelMat);
    if (name === 'control') {
      panel.rotation.y = -Math.PI / 2;
      panel.updateMatrixWorld(true);
      solids[solids.length - 1].setFromObject(panel);
    }
    panel.userData.interaction = name;
    box(name+'-panel-foot',p.x,.72,p.z,.22,1.44,.22,dark);
    box(name+'-indicator',0,.2,.075,1.05,.15,.035,new THREE.MeshBasicMaterial({color}),false,panel);
    const sign=label(stationText[index],new THREE.Vector3(p.x,3.25,p.z+.2),3.2);
    if(name==='control'&&sign){sign.position.set(p.x-.2,3.25,p.z);sign.rotation.y=-Math.PI/2;}
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.7,2.8,48),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));
    ring.rotation.x=-Math.PI/2; ring.position.set(anchors[name].x,.05,anchors[name].z); scene.add(ring);
  });
  label('01 接驳港 / ARRIVAL',new THREE.Vector3(-3,4,-1),5);
  label('03 货仓隔离闸 / CARGO',new THREE.Vector3(12,7,-4.6),6,'#deb67d');
  label('人员避险区 / SHELTER',new THREE.Vector3(0,5.4,-11),4,'#bdd2bc');
  // Surface detailing never adds collision or occupies the 6 m navigation clearance.
  // Route colours are repeated on destination signs, deck paint and wall equipment.
  const amber = marking(0xb89656), cyan = marking(0x668f99), green = marking(0x779986);
  for (const x of [-4.8,4.8]) {
    for (let z=6; z<=20; z+=3) box('arrival-lane-dash',x,.04,z,.15,.015,1.2,cyan,false);
  }
  const deckArrow = (name:string,x:number,z:number,heading:number,material:THREE.Material) => {
    const group=new THREE.Group();group.name=name;group.position.set(x,.055,z);group.rotation.y=heading;scene.add(group);
    box('arrow-shaft',0,0,.45,.16,.02,1.3,material,false,group);
    for(const side of [-1,1]){
      const wing=box('arrow-head',side*.25,0,-.13,.15,.02,.8,material,false,group);
      wing.rotation.y=side*Math.PI/4;
    }
  };
  deckArrow('arrive-forward',0,14,0,cyan);
  deckArrow('power-west',-6,4,Math.PI/2,amber);
  deckArrow('cargo-east',6,4,-Math.PI/2,cyan);
  deckArrow('descent-south',12,11,Math.PI,green);
  label('← 02 配电      03 货仓 →',new THREE.Vector3(0,5.8,3),7,'#c1d2d2');
  label('05 下潜出口 →',new THREE.Vector3(8,5.7,12),4,'#b8d8c2');
  const arrivalSign=label('港口 0 / DOCK 0',new THREE.Vector3(-12,6,23.8),7,'#9dbac2');
  if(arrivalSign)arrivalSign.rotation.y=Math.PI;
  // Recessed wall machinery silhouettes retain the existing rack boundaries.
  for(const z of [-14,-6,2,10,18]){
    box('rack-power-spine',-19.5,4.7,z,.22,.32,2.8,amber,false);
    for(const y of [1.2,2.4,3.6]) box('rack-vent',-16.96,y,z,.025,.18,1.7,gray,false);
  }
  for(const x of [-15,-9,9,15]){
    box('overhead-service-pipe',x,7.5,3,.22,.22,40,rust,false);
    for(const z of [-12,0,12,22]) box('pipe-clamp',x,7.5,z,.32,.32,.09,pale,false);
  }
  for(const z of [-14,-8,4,12,20]){
    box('east-wall-lower-panel',19.9,1.25,z,.06,1.7,4,gray,false);
    box('east-wall-high-panel',19.9,6.1,z,.06,2.2,4,gray,false);
  }
  // A ruined pedestrian bridge reads as a break between the pilot and shelter.
  // It is a floor-level remnant: the flooded boat lane above it remains unchanged.
  box('bridge-collapse-shadow',0,.02,-8,4.4,.012,3.4,marking(0x101c22),false);
  for(const z of [-5.9,-10.1]){
    box('broken-walkway-lip',0,.13,z,4.2,.2,.65,rust,false);
    for(const x of [-1.8,1.8])box('severed-bridge-edge',x,.23,z,.13,.4,.8,amber,false);
  }
  for(let i=0;i<7;i++){
    const shard=box('fractured-deck-plate',-1.8+i*.6,.04,-6.32-(i%3)*.15,.42,.06,.6,dark,false);
    shard.rotation.y=(i%2===0?1:-1)*.22;
  }
  // The personnel route stays along the back wall; it is not a submarine door.
  box('personnel-door-inset',-4.2,2.2,-17.94,1.7,4.1,.025,dark,false);
  for(const x of [-5.13,-3.27])box('personnel-door-frame',x,2.25,-17.9,.12,4.3,.06,pale,false);
  label('内侧通道 ←',new THREE.Vector3(-3.9,4.8,-17.86),3,'#bdd2bc');
  // Portal markings distinguish the southeast descent station from the entrance.
  for(const x of [8,16])box('descent-wall-stripe',x,3.5,23.92,.2,6,.035,green,false);
  const descentSign=label('05 / 下层航道',new THREE.Vector3(12,6.7,23.8),6,'#b8d8c2');
  if(descentSign)descentSign.rotation.y=Math.PI;
  // Cage bars are actual individual solids; front bar spacing never implies a boat route.
  box('cage-base',0,.22,-13,4.5,.4,4.5,dark);
  box('cage-roof',0,4.6,-13,4.5,.2,4.5,dark);
  for (const x of [-2.1,-1.4,-.7,0,.7,1.4,2.1]) {
    for (const z of [-15.1,-10.9]) box('cage-bar',x,2.4,z,.065,4.3,.065,pale);
  }
  for (const x of [-2.1,2.1]) for (const z of [-14.4,-13.7,-13,-12.3,-11.6]) box('cage-side-bar',x,2.4,z,.065,4.3,.065,pale);
  box('winch-base',12,.7,-15,3,1.4,2,dark);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(.65,.65,2,16),pale);
  drum.rotation.z=Math.PI/2; drum.position.set(12,1.65,-15); drum.name='winch-drum'; scene.add(drum);
  const elias = new THREE.Group(); elias.name='elias'; elias.position.copy(anchors.cage);
  const suit = new THREE.MeshStandardMaterial({color:0x9a9b86,roughness:.9});
  box('suit-torso',0,0,0,.65,.9,.43,suit,false,elias);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.3,16,12),pale); helmet.position.y=.65; elias.add(helmet);
  box('visor',0,.67,.255,.36,.18,.07,dark,false,elias);
  for (const x of [-.2,.2]) box('suit-leg',x,-.75,0,.24,.7,.27,suit,false,elias);
  for (const x of [-.45,.45]) box('suit-arm',x,-.02,0,.2,.85,.24,suit,false,elias);
  scene.add(elias);
  // The escape threshold is inside the shelter, exactly on Elias's short route.
  for(const x of [-2.17,-1.03])box('inner-escape-door-post',x,2,-13.5,.08,2.5,.12,green,false);
  box('inner-escape-door-lintel',-1.6,3.25,-13.5,1.22,.1,.12,green,false);
  label('内侧门',new THREE.Vector3(-1.6,3.6,-13.45),1.2,'#bdd2bc');
  const monster = new THREE.Group(); monster.name='cargo-creature'; monster.position.copy(anchors.monster);
  const flesh = new THREE.MeshStandardMaterial({color:0x545a55,roughness:1});
  const body = new THREE.Mesh(new THREE.SphereGeometry(.8,12,8),flesh); body.scale.set(1.25,.7,1.6); monster.add(body);
  for (let i=0;i<6;i++) {
    const limb = new THREE.Mesh(new THREE.CylinderGeometry(.09,.17,1.7,7),flesh);
    const side=i%2===0?-1:1; limb.position.set(side*.9,-.35,(Math.floor(i/2)-1)*.7); limb.rotation.z=side*.85; monster.add(limb);
  }
  scene.add(monster);
  scene.add(new THREE.HemisphereLight(0xa2c2c9,0x293a40,.75));
  for (const [x,z] of [[-12,4],[12,4],[0,-8],[12,18]]) {
    const light = new THREE.PointLight(0x89b9c0,26,16,2); light.position.set(x,6.8,z); scene.add(light);
    box('emergency-strip',x,7.55,z,2.1,.1,.3,new THREE.MeshBasicMaterial({color:0xa4c4c8}),false);
  }
  const walkable = [new THREE.Box3(new THREE.Vector3(-20,0,-18),new THREE.Vector3(20,8,24))];
  scene.updateMatrixWorld(true);
  return {scene,walkable,solids,gate,monster,elias,anchors};
}
