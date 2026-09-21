import {
  Box3, BoxGeometry, BufferGeometry, CatmullRomCurve3, CylinderGeometry,
  Euler, Group, Matrix4, Mesh, MeshStandardMaterial, Quaternion,
  TubeGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { expeditionDoorPosition, type ExpeditionLevel, type ExpeditionEdge } from '../../content/expedition';
import type { ReferenceMaterials } from './reference-materials';

type V3 = [number, number, number];
type Interval = [number, number];
type Passage = { edge: ExpeditionEdge; alongX: boolean; transverse: number; lo: number; hi: number; ceiling: number; forward: number };
export interface PassageDetails {
  root: Group; colliders: Box3[];
  views: Array<{ name: string; view: V3; yaw: number; pitch: number }>;
  update(time: number): void;
  dispose(): void;
}
const FLOOR = -2, EPS = .002;
const THEMES = ['矿运重梁与侧输送带', '八角承压法兰廊', '矿壳与破损隔热廊', '断顶格栅办公廊',
  '偏置动力风道廊', '厚垫圈黑水承压廊', '洁净斜撑气闸廊'];

function subtract(ranges: Interval[], lo: number, hi: number): Interval[] {
  return ranges.flatMap(([a,b]) => hi <= a || lo >= b ? [[a,b] as Interval]
    : [[a, Math.min(b,lo)], [Math.max(a,hi), b]].filter(([x,y]) => y-x > .55) as Interval[]);
}

/** Corridor-only detail. All coordinates/colliders/views are world-space; attach root at identity.
 * Sides/roof intrude <= .25m; silt/hose stay within .18m of the deck. Every rendered primitive
 * has its own conservative AABB, never a full-frame collider that would seal the passage.
 * No DOM, lights, dynamic allocations in update, gameplay mutation or shared-resource disposal.
 */
export function createPassageDetails(level: ExpeditionLevel, m: ReferenceMaterials): PassageDetails {
  const root = new Group(); root.name = `passage-details.${level.id}`;
  const colliders: Box3[] = [], views: PassageDetails['views'] = [];
  let bestViewScore = -Infinity;
  const geometries = new Set<BufferGeometry>(), owned: MeshStandardMaterial[] = [];
  const meta: Array<{ edge: string; width: number; ceiling: number; runs: Interval[] }> = [];
  const finish = (color: string, roughness: number, metalness: number) => {
    const mat = new MeshStandardMaterial({ color, roughness, metalness }); owned.push(mat); return mat;
  };
  const sediment = finish('#424c43', 1, 0), mineral = finish('#647768', .98, .02);
  const insulation = finish('#929483', .96, 0), clean = finish('#b7c4ba', .75, .18);
  const service = finish('#546a6b', .84, .21);
  const passages: Passage[] = level.edges.map(edge => {
    const a = level.rooms.find(r => r.id === edge.from), b = level.rooms.find(r => r.id === edge.to);
    if (!a || !b) throw new Error(`Passage references missing room: ${edge.id}`);
    const alongX = Math.abs(a.x-b.x) > .001;
    if ((alongX && Math.abs(a.z-b.z) > .001) || (!alongX && Math.abs(a.z-b.z) < .001))
      throw new Error(`Passage must be nonzero and axis aligned: ${edge.id}`);
    const first = (alongX ? a.x < b.x : a.z < b.z) ? a : b, last = first === a ? b : a;
    const lo = alongX ? first.x + first.width/2 : first.z + first.depth/2;
    const hi = alongX ? last.x - last.width/2 : last.z - last.depth/2;
    const ceiling = (edge as ExpeditionEdge & { ceiling?: number }).ceiling ?? 4;
    if (!Number.isFinite(ceiling) || ceiling <= FLOOR + .8 || !Number.isFinite(edge.width) || edge.width < 1)
      throw new Error(`Invalid passage dimensions: ${edge.id}`);
    return { edge, alongX, transverse: alongX ? a.z : a.x, lo, hi, ceiling,
      forward: Math.sign(alongX ? b.x-a.x : b.z-a.z) };
  });
  const doorBounds = level.edges.map(edge => {
    const a = level.rooms.find(r => r.id === edge.from)!, b = level.rooms.find(r => r.id === edge.to)!;
    const [x,z] = expeditionDoorPosition(a,b), alongX = Math.abs(a.x-b.x) > .001;
    return new Box3(new Vector3(x-(alongX?1.42:edge.width/2+.1), FLOOR, z-(alongX?edge.width/2+.1:1.42)),
      new Vector3(x+(alongX?1.42:edge.width/2+.1), 20, z+(alongX?edge.width/2+.1:1.42)));
  });
  const roomBounds = level.rooms.map(r => new Box3(new Vector3(r.x-r.width/2, FLOOR, r.z-r.depth/2),
    new Vector3(r.x+r.width/2, Math.max(20,r.ceiling??4), r.z+r.depth/2)));
  let current: Passage, run: Interval, parent: Group;
  let batches = new Map<MeshStandardMaterial, BufferGeometry[]>();
  const world = (p: V3): V3 => current.alongX ? [p[2],p[1],current.transverse+p[0]] : [current.transverse+p[0],p[1],p[2]];
  function add(g: BufferGeometry, mat: MeshStandardMaterial, p: V3, r: V3 = [0,0,0]) {
    g.applyMatrix4(new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...r)),new Vector3(1,1,1)));
    g.computeBoundingBox(); const local = g.boundingBox!;
    const half = current.edge.width/2;
    const shell = local.max.x <= -half+.25+EPS || local.min.x >= half-.25-EPS
      || local.min.y >= current.ceiling-.25-EPS || local.max.y <= FLOOR+.18+EPS;
    if (!shell || local.min.x < -half-EPS || local.max.x > half+EPS || local.min.y < FLOOR-EPS
      || local.max.y > current.ceiling+EPS || local.min.z < run[0]-EPS || local.max.z > run[1]+EPS) {
      g.dispose(); throw new Error(`Passage shell/interval exceeded: ${current.edge.id} ${local.min.toArray()} / ${local.max.toArray()}`);
    }
    // Rotation maps local +X to the left side for X-axis corridors, keeping a proper handed basis.
    if (current.alongX) { g.rotateY(Math.PI/2); g.translate(0,0,current.transverse); }
    else g.translate(current.transverse,0,0);
    g.computeBoundingBox(); const b = g.boundingBox!;
    if (roomBounds.some(r => r.intersectsBox(b)) || doorBounds.some(d => d.intersectsBox(b))) {
      g.dispose(); throw new Error(`Passage touches room/door reserve: ${current.edge.id}`);
    }
    colliders.push(b.clone());
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose(); flat.clearGroups();
    const parts = batches.get(mat) ?? []; parts.push(flat); batches.set(mat,parts);
  }
  const box = (p: V3, size: V3, mat = m.steel, r: V3 = [0,0,0]) => add(new BoxGeometry(...size),mat,p,r);
  const cylinder = (p: V3, radius: number, height: number, mat = m.steel, r: V3 = [0,0,0], top = radius) =>
    add(new CylinderGeometry(top,radius,height,8),mat,p,r);
  function line(a: V3,b: V3,width: number,depth: number,mat = m.steel) {
    const va = new Vector3(...a), vb = new Vector3(...b), delta = vb.clone().sub(va);
    const g = new BoxGeometry(width,delta.length(),depth);
    g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),delta.normalize()));
    add(g,mat,va.add(vb).multiplyScalar(.5).toArray() as V3);
  }
  function pipe(points: V3[], radius: number,mat = m.rubber) {
    add(new TubeGeometry(new CatmullRomCurve3(points.map(p=>new Vector3(...p))),
      Math.min(48,Math.max(12,points.length*5)),radius,5,false),mat,[0,0,0]);
  }
  function squaredFrame(t: number, beam: number, mat = service) {
    const x = current.edge.width/2-beam/2-.015, y = current.ceiling;
    for (const side of [-1,1]) box([side*x,(y+FLOOR)/2,t],[beam,y-FLOOR-.03,.15],mat);
    box([0,y-beam/2-.015,t],[current.edge.width-.03,beam,.17],mat);
  }
  function bevelFrame(t: number, gasket = false) {
    const x = current.edge.width/2-.045, y = current.ceiling-.045, bottom = FLOOR+.045, c = .15;
    // Shallow curved/octagonal corners respect the .25m shell budget even at minimum width.
    const points: V3[] = [[-x,bottom+c,t],[-x,y-c,t],[-x+c,y,t],[x-c,y,t],[x,y-c,t],[x,bottom+c,t]];
    for (let i=1;i<points.length;i++) line(points[i-1],points[i],gasket?.072:.06,gasket?.22:.12,gasket?m.rubber:m.steel);
    if (!gasket) for (const s of [-1,1]) for (const yy of [bottom+.48,(y+bottom)/2,y-.48]) {
      box([s*(x-.03),yy,t],[.13,.21,.22],service);
      cylinder([s*(x-.10),yy,t],.034,.045,clean,[0,0,Math.PI/2]);
    }
  }
  function roundedPressureFrame(t: number) {
    const x=current.edge.width/2-.035, top=current.ceiling-.035, bottom=FLOOR+.035, radius=.17;
    const points:V3[]=[];
    for(const [cx,cy,start] of [[x-radius,top-radius,0],[-x+radius,top-radius,Math.PI/2],
      [-x+radius,bottom+radius,Math.PI],[x-radius,bottom+radius,Math.PI*1.5]]) {
      for(let i=0;i<=4;i++) {
        const angle=start+i*Math.PI/8;
        points.push([cx+Math.cos(angle)*radius,cy+Math.sin(angle)*radius,t]);
      }
    }
    for(let i=0;i<points.length;i++)line(points[i],points[(i+1)%points.length],.055,.18,m.rubber);
  }
  function rib(t: number, index: number) {
    const half = current.edge.width/2, roof=current.ceiling, h=roof-FLOOR;
    switch(level.index) {
      case 0:
        squaredFrame(t,.13,service);
        for (const side of [-1,1]) {
          box([side*(half-.18),(roof+FLOOR)/2,t],[.045,h-.06,.25],m.steel);
          for (const y of [FLOOR+.18,roof-.18]) box([side*(half-.13),y,t],[.22,.12,.28],m.steel);
        }
        break;
      case 1: bevelFrame(t); bevelFrame(t+.18,true); break;
      case 2:
        for (const side of [-1,1]) {
          box([side*(half-.05),(roof+FLOOR)/2,t],[.07,h-.05,.075],m.steel);
          for (let j=0;j<4;j++) {
            const yy=FLOOR+.35+j*(h-.75)/4, protrusion=.09+(index+j)%3*.035;
            cylinder([side*(half-protrusion/2-.025),yy,t],protrusion/2,.34,mineral,[0,0,.12*side],.023);
            box([side*(half-.14),yy+.20,t+.03],[.08,.22,.17],insulation,[.13,0,.12*side]);
          }
        }
        break;
      case 3:
        box([0,roof-.10,t],[current.edge.width-.03,.035,.055],service);
        for (const s of [-1,1]) {
          box([s*(half-.065),roof-.12,t],[.10,.20,.28],service);
          line([s*(half-.10),roof-.20,t-.15],[s*(half-.10),roof-.065,t+.15],.018,.018,m.steel);
        }
        break;
      case 4:
        squaredFrame(t,.14,service);
        box([-half+.17,(roof+FLOOR)/2,t],[.10,h-.04,.24],painted());
        for (let j=0;j<3;j++) box([-half+.16,roof-.55-j*.28,t],[.17,.10,.38],m.steel);
        break;
      case 5:
        roundedPressureFrame(t); bevelFrame(t+.24);
        for(const side of [-1,1]) box([side*(half-.15),(roof+FLOOR)/2,t],[.17,h*.46,.24],service);
        break;
      case 6:
        for(const side of [-1,1]) {
          line([side*(half-.07),FLOOR+.09,t],[side*(half-.16),roof-.20,t+.20],.09,.12,clean);
          box([side*(half-.12),FLOOR+.085,t],[.21,.14,.28],m.steel);
        }
        box([0,roof-.10,t+.20],[current.edge.width-.03,.16,.25],clean);
        if(index%2===0) for(const side of [-1,1]) box([side*(half-.12),roof-.30,t+.20],[.20,.22,.32],m.rubber);
        break;
    }
  }
  function painted() { return level.index===6?clean:service; }
  function services(a: number,b: number) {
    const half=current.edge.width/2,roof=current.ceiling,length=b-a,mid=(a+b)/2;
    // Continuous, bracketed services are attached to the actual side envelope, never to rooms.
    const count=level.index===4?4:level.index===1?3:2;
    for(let j=0;j<count;j++) {
      const y=roof-.45-j*.22;
      cylinder([-half+.075,y,mid],.045,length,level.index===6?clean:m.steel,[Math.PI/2,0,0]);
      for(let t=a+.2;t<b-.15;t+=2.6) box([-half+.06,y,t],[.10,.14,.075],service);
    }
    if(level.index===0) {
      box([-half+.14,FLOOR+.30,mid],[.20,.12,length],m.rubber);
      for(let t=a+.16;t<b-.15;t+=.46) cylinder([-half+.14,FLOOR+.34,t],.055,.18,m.steel,[0,0,Math.PI/2]);
      for(let t=a+.3;t<b-.15;t+=1.8) box([-half+.12,FLOOR+.13,t],[.20,.25,.10],service);
    }
    if(level.index===3) {
      for(const x of [-half*.48,half*.48]) box([x,roof-.07,mid],[.038,.045,length],service);
      for(let t=a+.45;t<b-.45;t+=2.1) {
        box([half*.24,roof-.07,t],[current.edge.width*.34,.035,.62],insulation,[0,0,.025]);
        pipe([[half-.08,roof-.3,t-.3],[half-.14,roof-.64,t],[half-.09,roof-.35,t+.3]],.018);
      }
    }
    if(level.index===4) {
      box([-half+.11,(roof+FLOOR)/2,mid],[.18,Math.min(1.2,(roof-FLOOR)*.24),length],service);
      for(let t=a+.3;t<b-.2;t+=1.1) box([-half+.21,(roof+FLOOR)/2,t],[.045,.65,.07],m.steel);
    }
    if(level.index===5) for(let t=a+.35;t<b-.35;t+=2.7)
      pipe([[half-.06,roof-.42,t-.25],[half-.14,roof-1.04,t],[half-.07,roof-.40,t+.25]],.022);
    // Single connected floor hose points toward the next room. Silt accumulates against its bends.
    const points: V3[]=[];
    const n=Math.max(3,Math.ceil(length/1.4));
    for(let i=0;i<=n;i++) points.push([half-.13+Math.sin(i*.8)*.025,FLOOR+.055,a+length*i/n]);
    pipe(points,.026,level.index===6?service:m.rubber);
    for(let t=a+.24, i=0;t<b-.20;t+=1.25,i++) {
      cylinder([half-.10,FLOOR+.022,t],.075,.04,sediment,[0,0,0],.052);
      if(level.index!==6 || i%4===0) {
        cylinder([half-.09,FLOOR+.065,t+.09],.043,.095,mineral,[0,0,.12],.013);
        // Barnacle scars attach directly to the wall foot, not floating in the passage.
        cylinder([half-.028,FLOOR+.19,t],.055,.045,mineral,[0,0,Math.PI/2],.029);
      }
    }
  }
  function flush() {
    for(const [material,parts] of batches) {
      const g=mergeGeometries(parts,false); parts.forEach(p=>p.dispose());
      if(!g) throw new Error('Passage material merge failed');
      g.computeBoundingBox();g.computeBoundingSphere();geometries.add(g);
      const mesh=new Mesh(g,material);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);
    }
    batches.clear();
  }
  try {
    for(const [edgeIndex,p] of passages.entries()) {
      if(p.hi-p.lo<.7) continue;
      current=p; const half=p.edge.width/2;
      let ranges:Interval[]=[[p.lo+.035,p.hi-.035]];
      // Subtract ALL room interiors, not merely the two endpoints, and every door clearance.
      for(const b of [...roomBounds,...doorBounds]) {
        const crossMin=p.alongX?b.min.z:b.min.x,crossMax=p.alongX?b.max.z:b.max.x;
        if(crossMin<p.transverse+half && crossMax>p.transverse-half)
          ranges=subtract(ranges,(p.alongX?b.min.x:b.min.z)-.035,(p.alongX?b.max.x:b.max.z)+.035);
      }
      // Leave intersections open; collinear coincident runs belong to the first edge only.
      for(const [j,other] of passages.entries()) {
        if(j===edgeIndex||other.hi<=other.lo)continue;
        if(other.alongX===p.alongX) {
          if(j<edgeIndex&&Math.abs(other.transverse-p.transverse)<(p.edge.width+other.edge.width)/2)
            ranges=subtract(ranges,other.lo-.04,other.hi+.04);
        } else if(other.lo<p.transverse+half&&other.hi>p.transverse-half)
          ranges=subtract(ranges,other.transverse-other.edge.width/2-.04,other.transverse+other.edge.width/2+.04);
      }
      parent=new Group();parent.name=`passage.${p.edge.id}`;root.add(parent);
      for(const interval of ranges) {
        if(interval[1]-interval[0]<.85)continue;
        run=interval; const a=run[0]+.08,b=run[1]-.08;
        services(a,b);
        const spacing=[2.6,2.0,2.25,1.6,3.2,2.4,2.8][level.index]??2.4;
        for(let t=run[0]+.36,i=0;t<run[1]-.55;t+=spacing,i++)rib(t,i);
        if(b-a>=3.4) {
          const length=b-a, score=(length>=8?1000000:0)+length;
          if(score>bestViewScore) {
            bestViewScore=score;
            // The door lies midway between the actual facing walls. Look toward it from
            // either side, rather than assuming the edge's from/to ordering is the view direction.
            const door=(p.lo+p.hi)/2,forward=(a+b)/2<door?1:-1;
            const endpoint=forward>0?b-.5:a+.5;
            const distance=Math.min(20,length-1);
            const t=endpoint-forward*distance;
            const view=world([0,Math.min(.35,p.ceiling-.55),t]);
            const direction=p.alongX?new Vector3(forward,0,0):new Vector3(0,0,forward);
            views.splice(0,views.length,{name:`${THEMES[level.index]} · ${p.edge.id}`,view,
              yaw:Math.atan2(-direction.x,-direction.z),pitch:0});
            root.userData.passageView={edge:p.edge.id,range:[a,b],score,visibleRun:distance,direction:forward};
          }
        }
      }
      flush();meta.push({edge:p.edge.id,width:p.edge.width,ceiling:p.ceiling,runs:ranges});
    }
  } catch(error) {
    for(const parts of batches.values())parts.forEach(g=>g.dispose());
    geometries.forEach(g=>g.dispose());owned.forEach(mat=>mat.dispose());root.clear();throw error;
  }
  root.userData.passageRuns=meta;
  let disposed=false;
  return {root,colliders,views,update(_time){/* Static low-vertex hose curvature: no shimmer or overdraw. */},
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.clear();geometries.forEach(g=>g.dispose());geometries.clear();owned.forEach(mat=>mat.dispose());},
  };
}
