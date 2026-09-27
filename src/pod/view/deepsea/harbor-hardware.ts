import { BufferGeometry, CylinderGeometry, ExtrudeGeometry, Group, MeshStandardMaterial, Path, Quaternion, Shape, TorusGeometry, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

type V = [number, number, number];
/** Geometry is registered by the world, so disposal and material ownership stay there. */
export type HardwareShape = (g:BufferGeometry,m:MeshStandardMaterial,p:V,rot:V,parent:Group)=>void;
type Finishes = { steel:MeshStandardMaterial; paint:MeshStandardMaterial; rubber:MeshStandardMaterial; accent:MeshStandardMaterial };

/** Apply before rotating a Y-axis cylinder. Caps use metres in its local XZ plane;
 * side UVs retain their seam and use circumference/height in metres. */
export function pressureDisk(radius:number,depth:number):CylinderGeometry {
  const geometry=new CylinderGeometry(radius,radius,depth,96);
  const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal'),uv=geometry.getAttribute('uv');
  for(let i=0;i<positions.count;i++){
    if(Math.abs(normals.getY(i))>.99)
      uv.setXY(i,positions.getX(i),-Math.sign(normals.getY(i))*positions.getZ(i));
    else uv.setXY(i,uv.getX(i)*Math.PI*2*radius,uv.getY(i)*depth);
  }
  uv.needsUpdate=true;return geometry;
}

/** Broad machined annulus, local face normal +Z; not a torus pretending to be a flange. */
export function pressureFlange(inner:number,outer:number,depth:number):BufferGeometry {
  const outline=new Shape();outline.absarc(0,0,outer,0,Math.PI*2,false);
  const bore=new Path();bore.absarc(0,0,inner,0,Math.PI*2,true);outline.holes.push(bore);
  const geometry=new ExtrudeGeometry(outline,{depth,steps:1,curveSegments:64,bevelEnabled:true,bevelSegments:2,bevelThickness:.025,bevelSize:.025});
  geometry.translate(0,0,-depth/2);return geometry;
}

export function pressureGateHardware(face:Group,emit:HardwareShape,m:Finishes):void {
  const block=(p:V,s:V,mat=m.steel)=>emit(new RoundedBoxGeometry(...s,2,.035),mat,p,[0,0,0],face);
  const pin=(p:V,r:number,h:number,mat=m.steel)=>emit(new CylinderGeometry(r,r,h,12),mat,p,[Math.PI/2,0,0],face);
  const link=(a:V,b:V,r:number,mat=m.steel)=>{
    const start=new Vector3(...a),end=new Vector3(...b),d=end.clone().sub(start);
    const g=new CylinderGeometry(r,r,d.length(),12);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.normalize()));
    emit(g,mat,start.add(end).multiplyScalar(.5).toArray() as V,[0,0,0],face);
  };
  // Eight individual inspection plates, separated by real dark reveals. Their
  // backing disk is still continuous/pressure-tight; these are bolted face skins.
  for(let k=0;k<8;k++){
    const a=k*Math.PI/4+.025,b=(k+1)*Math.PI/4-.025;
    const panel=new Shape();panel.moveTo(Math.cos(a)*.74,Math.sin(a)*.74);
    panel.lineTo(Math.cos(a)*2.68,Math.sin(a)*2.68);
    panel.absarc(0,0,2.68,a,b,false);panel.lineTo(Math.cos(b)*.74,Math.sin(b)*.74);
    panel.absarc(0,0,.74,b,a,true);panel.closePath();
    const plate=new ExtrudeGeometry(panel,{depth:.055,steps:1,curveSegments:24,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:1});
    emit(plate,m.paint,[0,0,.405],[0,0,0],face);
    // Rectangular radial webs read as fabricated reinforcement, not more hoses.
    const angle=k*Math.PI/4;
    emit(new RoundedBoxGeometry(1.76,.13,.13,2,.018),m.steel,[Math.cos(angle)*1.68,Math.sin(angle)*1.68,.48],[0,0,angle],face);
    for(const theta of [a+.065,b-.065])for(const radius of [1.02,2.43]){
      const x=Math.cos(theta)*radius,y=Math.sin(theta)*radius;
      pin([x,y,.483],.075,.025,m.steel);
      emit(new CylinderGeometry(.046,.046,.048,6),m.accent,[x,y,.515],[Math.PI/2,0,0],face);
    }
  }
  // Concentric gasket and retaining land belong to the moving pressure leaf.
  for(const [radius,tube,mat] of [[3.23,.045,m.rubber],[2.78,.025,m.steel]] as const)
    emit(new TorusGeometry(radius,tube,8,80),mat,[0,0,.45],[0,0,0],face);
  for(let k=0;k<8;k++){
    const angle=(k+.5)*Math.PI/4,x=Math.cos(angle)*2.73,y=Math.sin(angle)*2.73;
    block([x,y,.53],[.36,.42,.20]);pin([x,y,.67],.09,.08,m.accent);
    link([x*.91,y*.91,.58],[x*1.055,y*1.055,.58],.065);
  }
  // Captive clamp actuators: barrel, exposed ram, gland, clevis and pivot bolts.
  // All ride with the leaf; no pretend hose is stretched across a moving frame.
  for(const y of [-1.55,1.55]){
    link([-.70,y,.87],[.92,y,.87],.17,m.paint);
    link([.92,y,.87],[2.26,y,.87],.075);
    link([.87,y,.87],[1.04,y,.87],.205);
    for(const x of [-.70,2.26]){
      block([x,y,.68],[.36,.52,.28]);pin([x,y,.99],.105,.13);
      for(const dy of [-.20,.20])pin([x,y+dy,.84],.038,.065,m.accent);
    }
    for(const x of [-.48,.62]){
      link([x,y,.87],[x,y+.34,.87],.04);
      link([x,y+.34,.87],[x,y+.34,.54],.04,m.rubber);
    }
    link([-.48,y+.34,.54],[.62,y+.34,.54],.035,m.rubber);
  }
  // Centre inspection cover and a proper handwheel with hub and spokes.
  pin([0,0,.69],.39,.13,m.paint);
  emit(new TorusGeometry(.33,.04,8,32),m.steel,[0,0,.83],[0,0,0],face);
  for(let k=0;k<3;k++){const a=k*Math.PI*2/3;link([0,0,.83],[Math.cos(a)*.3,Math.sin(a)*.3,.83],.035);}
  pin([0,0,.85],.085,.10,m.accent);
}

/** Fits the original 1.52 × 1.10 footprint. The rear lid pivot stays (0,.25,-.52). */
export function salvageCaseHardware(group:Group,lid:Group,emit:HardwareShape,m:Finishes,strip:MeshStandardMaterial):void {
  const block=(parent:Group,p:V,s:V,mat=m.steel,r=.025)=>emit(new RoundedBoxGeometry(...s,2,r),mat,p,[0,0,0],parent);
  block(group,[0,-.2,0],[1.5,.8,1.05],m.steel,.065);
  block(group,[0,.17,0],[1.49,.09,1.045],m.rubber,.025);
  // Recessed lid seat and black compression gasket; neither protrudes into the arm berth.
  for(const x of [-.70,.70])block(group,[x,.22,0],[.04,.055,.97],m.rubber,.012);
  for(const z of [-.48,.48])block(group,[0,.22,z],[1.40,.055,.04],m.rubber,.012);
  block(lid,[0,0,.52],[1.52,.12,1.06],m.paint,.045);
  block(lid,[0,.066,.52],[1.23,.055,.77],m.steel,.022);
  // Rolled edge bands and broad corner shoes, contained inside the old envelope.
  for(const x of [-.715,.715])block(lid,[x,.035,.52],[.085,.14,.98],m.steel,.022);
  for(const z of [.045,.995])block(lid,[0,.035,z],[1.43,.14,.085],m.steel,.022);
  for(const x of [-.65,.65])for(const z of [.105,.935]){
    block(lid,[x,.065,z],[.21,.14,.20],m.steel,.03);
    emit(new CylinderGeometry(.031,.031,.025,6),m.accent,[x,.145,z],[0,0,0],lid);
  }
  for(const x of [-.58,.58]){
    block(group,[x,-.23,0],[.09,.72,1.07],m.accent,.018);
    block(lid,[x,.09,.52],[.10,.08,.96],m.paint,.022);
    // Rear hinge leaves follow their respective halves, with shared knuckle axis X.
    block(group,[x,.12,-.495],[.21,.16,.07]);
    block(lid,[x,.025,.015],[.21,.09,.10]);
    emit(new CylinderGeometry(.048,.048,.25,12),m.steel,[x,.25,-.52],[0,0,Math.PI/2],group);
    for(const dx of [-.068,.068]){
      emit(new CylinderGeometry(.027,.027,.018,6),m.accent,[x+dx,.105,-.536],[Math.PI/2,0,0],group);
      emit(new CylinderGeometry(.027,.027,.022,6),m.accent,[x+dx,.082,.03],[0,0,0],lid);
      emit(new CylinderGeometry(.025,.025,.018,6),m.steel,[x+dx,-.025,.556],[Math.PI/2,0,0],group);
    }
    // Two-part toggle latch: body on chest, keeper on animated cover.
    block(group,[x,.065,.52],[.16,.25,.055]);
    block(group,[x,.08,.55],[.07,.17,.03],m.accent,.01);
    block(lid,[x,-.025,1.015],[.18,.075,.065]);
  }
  // Small recessed warm strip on real interactable loot only; no scene-wide beacon.
  block(group,[0,-.08,.53],[.62,.095,.035],m.rubber,.012);
  block(group,[0,-.08,.552],[.48,.025,.013],strip,.005);
  // Battery-backed identification bars on every approach, not a single tiny
  // front-facing slit. Only actual searchable cases use this material.
  for(const z of [-.552,.552])for(const x of [-.57,.57]){
    block(group,[x,-.12,z],[.13,.65,.034],m.rubber,.012);
    block(group,[x,-.12,z+Math.sign(z)*.022],[.075,.55,.015],strip,.006);
  }
  for(const x of [-.752,.752]){
    block(group,[x,-.12,0],[.025,.60,.14],m.rubber,.008);
    block(group,[x+Math.sign(x)*.018,-.12,0],[.015,.50,.08],strip,.004);
  }
  for(const x of [-.57,.57])block(lid,[x,.081,.52],[.075,.015,.70],strip,.004);
  for(const x of [-.31,.31])block(group,[x,-.08,.552],[.035,.07,.013]);
  // Flush carrying grip and guarded corners keep maximum bounds unchanged.
  block(lid,[0,.11,.72],[.34,.055,.15],m.rubber,.022);
  for(const x of [-.68,.68])for(const z of [-.44,.44])block(group,[x,-.48,z],[.13,.20,.14],m.rubber,.03);
}
