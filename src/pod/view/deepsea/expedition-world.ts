import {
  Box3, BoxGeometry, BufferGeometry, CanvasTexture, CylinderGeometry, DoubleSide, Euler,
  Float32BufferAttribute, Group, Matrix4, Mesh, MeshStandardMaterial,
  Object3D, PlaneGeometry, Quaternion, SRGBColorSpace, TorusGeometry, Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ExpeditionLevel, ExpeditionState } from '../../content/expedition';
import { expeditionDoorPosition } from '../../content/expedition';
import { EXPEDITION_ENVELOPES } from '../../content/expedition-envelopes';
import type { ReferenceMaterials } from './reference-materials';
import { EXPEDITION_ART } from './expedition-art-direction';
import { createExpeditionWayfinding } from './expedition-wayfinding';
import { createExpeditionArchitecture } from './expedition-architecture';
import { createExpeditionStorytelling } from './expedition-storytelling';
import { createFacilitiesA } from './expedition-facilities-a';
import { createFacilitiesB } from './expedition-facilities-b';
import { createExpeditionShells } from './expedition-shells';
import { createIncidentSites } from './expedition-incident-sites';
import { createPassageDetails } from './expedition-passage-details';
import type { ExpeditionSurfaceMaps } from './expedition-surface-maps';
import { createHarborWorld } from './harbor-world';
import {passageEmergency} from './passage-emergency';
import { createHarborMaterials } from './harbor-materials';
import { addHarborRoomIdentity } from './harbor-room-identity';

type V3 = [number, number, number];
type Rect = { x0: number; x1: number; z0: number; z1: number; ceiling?:number };
type Pieces = Map<MeshStandardMaterial, BufferGeometry[]>;
export interface ExpeditionWorld {
  root: Group;
  /** Static solids only. Runtime adds doors whose edge IDs are not in state.opened. */
  colliders: Box3[];
  /** World-space union volumes; do not require a player sphere to fit one box alone. */
  walkable: Box3[];
  interactables: Map<string, Object3D>;
  /** Bounds always describe the CLOSED door, even while its mesh animates. */
  doors: Map<string, { mesh: Group; bounds: Box3 }>;
  anchors: Array<{room:string;name:string;position:V3;view:V3;yaw:number;pitch:number}>;
  storyViews: ReturnType<typeof createExpeditionStorytelling>['views'];
  practicalLights:Array<{room:string;position:V3;color:string;intensity:number;range:number}>;
  passageViews:ReturnType<typeof createPassageDetails>['views'];
  entryView?:{name:string;view:V3;yaw:number;pitch:number};
  /** time is absolute seconds. State is read-only and remains runtime-owned. */
  update(state: ExpeditionState, time: number): void;
  dispose(): void;
}

const FLOOR = -2, CEILING = 4, EPS = 1e-5;
const rectBox = (r: Rect) => new Box3(new Vector3(r.x0, FLOOR, r.z0), new Vector3(r.x1, r.ceiling??CEILING, r.z1));
const bounds = (p: V3, s: V3) => new Box3().setFromCenterAndSize(new Vector3(...p), new Vector3(...s));

/** Connected pressure hull; no cameras, lights, movement, progression or shared-material ownership. */
export function createExpeditionWorld(level: ExpeditionLevel, materials: ReferenceMaterials, surfaceMaps?:ExpeditionSurfaceMaps): ExpeditionWorld {
  if (level.index === 0) {
    const harborMaterials=createHarborMaterials(materials);
    const world=createHarborWorld(level,harborMaterials);
    const disposeIdentity=addHarborRoomIdentity(level,world,harborMaterials);
    const dispose=world.dispose.bind(world);let disposed=false;
    world.dispose=()=>{if(disposed)return;disposed=true;disposeIdentity();dispose();harborMaterials.dispose();};
    return world;
  }
  const root = new Group(); root.name = `expedition-world.${level.id}`;
  const colliders: Box3[] = [], walkable: Box3[] = [];
  const interactables = new Map<string, Object3D>();
  const doors = new Map<string, { mesh: Group; bounds: Box3 }>();
  const geometry = new Set<BufferGeometry>();
  const ownedMaterials: MeshStandardMaterial[] = [], textures: CanvasTexture[] = [];
  const batches: Pieces = new Map();
  const practicalLights:ExpeditionWorld['practicalLights']=[];
  const art=EXPEDITION_ART[level.index];
  const hull=materials.hull.clone(),floor=materials.floor.clone();
  hull.color.set(art.hull);floor.color.set(art.floor);
  if(surfaceMaps&&[0,2,4].includes(level.index)){Object.assign(floor,surfaceMaps);floor.color.set('#90958c');floor.normalScale.set(.45,.45);floor.metalness=.65;floor.roughness=.85;}
  ownedMaterials.push(hull,floor);
  const fixtureFace=new MeshStandardMaterial({color:'#a6cdcf',emissive:art.fixture,emissiveIntensity:2.1,roughness:.4});
  const warmFixture=fixtureFace.clone();warmFixture.emissive.set(art.accent);warmFixture.color.set('#dcc49a');ownedMaterials.push(fixtureFace,warmFixture);
  const m = {...materials,hull,floor};
  const wallSkin=(level.index===0||level.index===4?materials.steel:level.index===2?materials.floor:level.index===5?materials.rubber:hull).clone();
  wallSkin.name=`expedition-wall-skin-${level.index}`;
  wallSkin.color.set(['#62716b','#81958a','#626653','#bcbcac','#4c565b','#30464d','#dadacf'][level.index]);
  wallSkin.roughness=level.index===6?.92:1;
  // Corroded structural steel is not the polished instrument finish: suppress
  // broad wall glare that otherwise outshines the casualty and rescue traces.
  if(level.index===0||level.index===4){wallSkin.roughnessMap=null;wallSkin.roughness=.88;wallSkin.normalScale.set(.12,.12);}
  if(level.index===2)wallSkin.normalScale.set(.85,.85);
  ownedMaterials.push(wallSkin);
  const seaGlass=new MeshStandardMaterial({color:'#33535b',transparent:true,opacity:.20,roughness:.2,metalness:.12,side:DoubleSide,depthWrite:false});
  const drownedSteel=m.steel.clone();drownedSteel.color.set('#203338');drownedSteel.roughness=.93;
  ownedMaterials.push(seaGlass,drownedSteel);
  const roomById = new Map(level.rooms.map(r => [r.id, r]));
  const roomRects: Rect[] = level.rooms.map(r => ({ x0: r.x - r.width / 2, x1: r.x + r.width / 2, z0: r.z - r.depth / 2, z1: r.z + r.depth / 2,ceiling:r.ceiling }));
  const corridors: Rect[] = [];
  const links = level.edges.map(edge => {
    const a = roomById.get(edge.from), b = roomById.get(edge.to);
    if (!a || !b) throw new Error(`Unknown expedition edge endpoint: ${edge.id}`);
    if (!(edge.width > 0) || (Math.abs(a.x - b.x) > EPS && Math.abs(a.z - b.z) > EPS)) {
      throw new Error(`Expedition edge must be axis-aligned with positive width: ${edge.id}`);
    }
    const alongX = Math.abs(a.x - b.x) > EPS;
    if (!alongX && Math.abs(a.z - b.z) < EPS) throw new Error(`Zero-length expedition edge: ${edge.id}`);
    const r: Rect = alongX
      ? { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: a.z - edge.width / 2, z1: a.z + edge.width / 2 }
      : { x0: a.x - edge.width / 2, x1: a.x + edge.width / 2, z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) };
    r.ceiling=edge.ceiling??CEILING; corridors.push(r);
    const [x,z]=expeditionDoorPosition(a,b);return { edge, a, b, alongX, x,z };
  });
  for (const r of level.rooms) {
    if (!(r.width > 0 && r.depth > 0) || ![r.x, r.z, r.width, r.depth].every(Number.isFinite)) throw new Error(`Invalid expedition room: ${r.id}`);
  }
  const rects = [...roomRects, ...corridors];
  walkable.push(...rects.map(rectBox));

  function add(g: BufferGeometry, material: MeshStandardMaterial, p: V3 = [0, 0, 0], rotation: V3 = [0, 0, 0], target = batches) {
    g.applyMatrix4(new Matrix4().compose(new Vector3(...p), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(1, 1, 1)));
    // World-space deck texels: merged rooms must not stretch one normal-map tile
    // across a whole hall (which produced metre-wide glossy horizontal streaks).
    if(material===floor){const scale=surfaceMaps&&[0,2,4].includes(level.index)?3.2:2;const pos=g.getAttribute('position'),uv=g.getAttribute('uv');for(let i=0;i<pos.count;i++)uv.setXY(i,pos.getX(i)/scale,pos.getZ(i)/scale);}
    const flat = g.index ? g.toNonIndexed() : g;
    if (flat !== g) g.dispose();
    for (const key of Object.keys(flat.attributes)) if (!['position', 'normal', 'uv'].includes(key)) flat.deleteAttribute(key);
    flat.clearGroups();
    const bucket = target.get(material) ?? []; bucket.push(flat); target.set(material, bucket);
  }
  function box(p: V3, s: V3, material = m.hull, radius = 0, rotation: V3 = [0, 0, 0], target = batches) {
    if (s.some(v => v <= EPS)) return;
    add(radius ? new RoundedBoxGeometry(...s, 1, Math.min(radius, ...s.map(v => v * .45))) : new BoxGeometry(...s), material, p, rotation, target);
  }
  function cylinder(p: V3, radius: number, length: number, material: MeshStandardMaterial, rotation: V3 = [0, 0, 0], target = batches) {
    add(new CylinderGeometry(radius, radius, length, 10), material, p, rotation, target);
  }
  function ring(p: V3, radius: number, material: MeshStandardMaterial, rotation: V3 = [0, 0, 0], target = batches) {
    add(new TorusGeometry(radius, .038, 5, 16), material, p, rotation, target);
  }
  function merge(pieces: BufferGeometry[]) {
    const merged = mergeGeometries(pieces, false);
    for (const p of pieces) p.dispose();
    if (!merged) throw new Error('Expedition geometry merge failed');
    merged.computeBoundingBox(); merged.computeBoundingSphere(); geometry.add(merged);
    return merged;
  }
  // One draw per moving assembly. Vertex pigments retain the reference paint maps.
  // Static surfaces retain their individual PBR finishes, including real steel/rubber.
  const movingMaterial = m.hull.clone(); movingMaterial.color.set(0xffffff); movingMaterial.vertexColors = true;
  movingMaterial.name = 'expedition.moving-painted-assemblies'; ownedMaterials.push(movingMaterial);
  function moving(parts: Pieces, parent: Group, name: string) {
    const pieces: BufferGeometry[] = [];
    for (const [material, gs] of parts) for (const g of gs) {
      const count = g.getAttribute('position').count, colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) material.color.toArray(colors, i * 3);
      g.setAttribute('color', new Float32BufferAttribute(colors, 3)); pieces.push(g);
    }
    const mesh = new Mesh(merge(pieces), movingMaterial); mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }

  // Rectangular union on a compressed coordinate grid. Internal room/corridor and
  // corridor/corridor boundaries produce NO walls, collision slabs, or duplicate decks.
  const xs = [...new Set(rects.flatMap(r => [r.x0, r.x1]))].sort((a, b) => a - b);
  const zs = [...new Set(rects.flatMap(r => [r.z0, r.z1]))].sort((a, b) => a - b);
  const nx = Math.max(0, xs.length - 1), nz = Math.max(0, zs.length - 1);
  const cells = new Uint8Array(nx * nz);
  const heights = new Float32Array(nx*nz);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = (xs[i] + xs[i + 1]) / 2, z = (zs[j] + zs[j + 1]) / 2;
    for(const r of rects)if(x>r.x0&&x<r.x1&&z>r.z0&&z<r.z1){cells[i*nz+j]=1;heights[i*nz+j]=Math.max(heights[i*nz+j],r.ceiling??CEILING);}
  }
  const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < nz && cells[i * nz + j] === 1;
  const roof=(i:number,j:number)=>inside(i,j)?heights[i*nz+j]:FLOOR;
  function wall(axis: 'x' | 'z', at: number, lo: number, hi: number, sign: number,top=CEILING,bottom=FLOOR,aperture=true) {
    const length = hi - lo, mid = (lo + hi) / 2;
    // Observation halls now open onto a real exterior volume. A black decal on
    // an opaque wall cannot communicate ocean depth or pressure-glass thickness.
    const observation=aperture&&level.index===5&&bottom===FLOOR&&length>14&&level.rooms.some(r=>r.role==='hall'&&Math.abs((r.ceiling??4)-top)<.01&&
      (axis==='z'&&r.width>r.depth&&Math.abs(at-(r.z+sign*r.depth/2))<.01||axis==='x'&&r.depth>r.width&&Math.abs(at-(r.x+sign*r.width/2))<.01));
    if(observation){
      const half=Math.min(17,length*.44),low=-.95,high=2.05;
      wall(axis,at,lo,mid-half,sign,top,bottom,false);wall(axis,at,mid+half,hi,sign,top,bottom,false);
      wall(axis,at,mid-half,mid+half,sign,low,bottom,false);wall(axis,at,mid-half,mid+half,sign,top,high,false);
      const wp=(t:number,y:number,d:number):V3=>axis==='x'?[at+sign*d,y,t]:[t,y,at+sign*d];
      const ws=(w:number,h:number,d:number):V3=>axis==='x'?[d,h,w]:[w,h,d];
      box(wp(mid,(low+high)/2,.10),ws(half*2,high-low,.09),seaGlass);
      colliders.push(bounds(wp(mid,(low+high)/2,.10),ws(half*2,high-low,.09)));
      for(const y of [low,high])box(wp(mid,y,0),ws(half*2+.25,.20,.46),m.steel,.035);
      for(let t=mid-half;t<=mid+half+.01;t+=half/2){
        box(wp(t,(low+high)/2,0),ws(.19,high-low,.52),m.steel,.03);
        box(wp(t+.14,(low+high)/2,-.02),ws(.055,high-low,.08),m.rubber);
      }
      for(let layer=0;layer<3;layer++){
        const depth=2.4+layer*4.1,t=mid+(layer-1)*half*.55;
        cylinder(wp(t,.2,depth),.58+layer*.16,12,drownedSteel);
        for(const y of [-2.5,1.2,4.4])box(wp(t,y,depth),ws(3.8,.16,.23),drownedSteel,.02);
        cylinder(wp(t+1.4,-2.0,depth),.13,9,drownedSteel);
      }
      for(const side of [-1,1]){
        cylinder(wp(mid+side*half*.62,.1,3.1),.42,10,drownedSteel);
        box(wp(mid+side*half*.62,-1.4,3.1),ws(4.8,.12,.23),drownedSteel);
      }
      return;
    }
    // All thickness and surface detail sit OUTSIDE the traversable union.
    const center=(top+bottom)/2,height=top-bottom;
    const p: V3 = axis === 'x' ? [at + sign * .12, center, mid] : [mid, center, at + sign * .12];
    const s: V3 = axis === 'x' ? [.24, height, length] : [length, height, .24];
    box(p, s,wallSkin); colliders.push(bounds(p, s));
    const profile=EXPEDITION_ENVELOPES[level.index];
    const count = Math.max(1, Math.ceil(length / profile.panel[0])), step = length / count;
    for (let n = 0; n < count; n++) {
      const t = lo + (n + .5) * step;
      const rows=Math.ceil(height/profile.panel[1]);for(let row=0;row<rows;row++){const h=height/rows,y=bottom+(row+.5)*h;
        box(axis === 'x' ? [at + sign * .018, y, t] : [t, y, at + sign * .018],
          axis === 'x' ? [.03, h-.04, step - .045] : [step - .045, h-.04, .03], level.index===3&&row===0?m.rubber:wallSkin);
      }
      const seam = lo + n * step + .025;
      box(axis === 'x' ? [at + sign * .014, center, seam] : [seam, center, at + sign * .014],
        axis === 'x' ? [.028, height, .05] : [.05, height, .028], m.steel);
    }
    box(axis === 'x' ? [at + sign * .012, bottom+.35, mid] : [mid, bottom+.35, at + sign * .012],
      axis === 'x' ? [.02, .10, length] : [length, .10, .02], m.rubber);
  }
  // Coalesce adjacent boundary segments before panel subdivision.
  for (let i = 0; i <= nx; i++) for (const sign of [-1, 1]) {
    let start = -1,top=FLOOR,bottom=FLOOR;
    for (let j = 0; j <= nz; j++) {
      const h=j<nz?roof(sign<0?i:i-1,j):FLOOR,l=j<nz?roof(sign<0?i-1:i,j):FLOOR,edge=h>l;
      if(start>=0&&(!edge||h!==top||l!==bottom)){wall('x',xs[i],zs[start],zs[j],sign,top,bottom);start=-1;}
      if(edge&&start<0){start=j;top=h;bottom=l;}
    }
  }
  for (let j = 0; j <= nz; j++) for (const sign of [-1, 1]) {
    let start = -1,top=FLOOR,bottom=FLOOR;
    for (let i = 0; i <= nx; i++) {
      const h=i<nx?roof(i,sign<0?j:j-1):FLOOR,l=i<nx?roof(i,sign<0?j-1:j):FLOOR,edge=h>l;
      if(start>=0&&(!edge||h!==top||l!==bottom)){wall('z',zs[j],xs[start],xs[i],sign,top,bottom);start=-1;}
      if(edge&&start<0){start=i;top=h;bottom=l;}
    }
  }
  for (let i = 0; i < nx; i++) {
    let start = -1,top=FLOOR;
    for (let j = 0; j <= nz; j++) {
      if (start >= 0&&(!inside(i,j)||roof(i,j)!==top)) {
        const x = (xs[i] + xs[i + 1]) / 2, z = (zs[start] + zs[j]) / 2;
        const s: V3 = [xs[i + 1] - xs[i], .16, zs[j] - zs[start]];
        for (const y of [FLOOR - .08, top + .08]) {
          const p: V3 = [x, y, z]; box(p, s, y < 0 ? m.floor : m.hull); colliders.push(bounds(p, s));
        }
        start = -1;
      }
      if(inside(i,j)&&start<0){start=j;top=roof(i,j);}
    }
  }

  // A shared, readable decal atlas, optional in headless construction tests.
  let decalMaterial: MeshStandardMaterial | undefined;
  const signs = ['PRESSURE / KEEP CLEAR', 'MACHINE HALL', 'DRY STOWAGE', 'TRANSFER HUB', 'SAMPLE LAB', 'SHAFT ACCESS', 'ISOLATE / SERVICE', 'GH / SURVIVAL EQUIPMENT'];
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      signs.forEach((text, i) => {
        ctx.fillStyle = i === 0 || i === 6 ? '#ffb52b' : '#eeead9'; ctx.fillRect(0, i * 64, 1024, 64);
        ctx.strokeStyle = '#181b1c'; ctx.lineWidth = 3; ctx.strokeRect(6, i * 64 + 5, 1012, 54);
        ctx.fillStyle = '#181b1c'; ctx.font = 'bold 35px monospace'; ctx.textAlign = 'center'; ctx.fillText(text, 512, i * 64 + 45);
      });
      const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; textures.push(texture);
      decalMaterial = m.label.clone(); decalMaterial.map = texture; decalMaterial.color.set(0xffffff); ownedMaterials.push(decalMaterial);
    }
  }
  function sign(row: number, p: V3, width: number, rotation: V3 = [0, 0, 0]) {
    if (!decalMaterial) return;
    const g = new PlaneGeometry(width, width / 16), uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (row + 1) / 8 + uv.getY(i) / 8);
    add(g, decalMaterial, p, rotation);
  }
  const doorAnimation: { id: string; leaf: Mesh; amount: number; travel:number; lateral:boolean }[] = [];
  // Long service runs reinforce continuous travel rather than isolated room sets.
  // Overhead pieces remain above the runtime's highest sphere (2.75 + .28).
  for (const { edge, a, b, alongX } of links) {
    const top=edge.ceiling??CEILING;
    const lo = alongX ? Math.min(a.x, b.x) : Math.min(a.z, b.z);
    const hi = alongX ? Math.max(a.x, b.x) : Math.max(a.z, b.z);
    const point = (t: number, y: number, offset: number): V3 => alongX ? [t, y, a.z + offset] : [a.x + offset, y, t];
    for (const offset of [-edge.width / 2 + .35, -edge.width / 2 + .62]) {
      cylinder(point((lo + hi) / 2, top-.35, offset), .065, hi - lo, m.steel,
        alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
    }
    for (let t = lo + 4; t < hi - 2; t += 5) {
      const p = point(t, top-.18, 0);
      if (roomRects.some(r => p[0] > r.x0 && p[0] < r.x1 && p[2] > r.z0 && p[2] < r.z1)) continue;
      box(p, alongX ? [.14, .20, edge.width] : [edge.width, .20, .14], m.hull, .035);
      for (const offset of [-edge.width / 2 + .35, -edge.width / 2 + .62]) {
        cylinder(point(t, top-.35, offset), .09, .12, m.yellow,
          alongX ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]);
      }
      // Painted guidance strips lie on the deck, with no added collision volume.
      box(point(t, -1.994, edge.width / 2 - .4), alongX ? [1.4, .008, .10] : [.10, .008, 1.4], m.yellow);
    }
  }
  const emergencyDoors=new Map<string,ReturnType<typeof passageEmergency>>();
  for (const { edge, alongX, x, z } of links) {
    const top=edge.ceiling??CEILING,h=top-FLOOR-.18,cy=FLOOR+h/2,w=edge.width;
    const emergency=passageEmergency(w,h);emergency.root.position.set(x,cy,z);emergency.root.rotation.y=alongX?Math.PI/2:0;root.add(emergency.root);emergencyDoors.set(edge.id,emergency);
    const mesh = new Group(); mesh.name = `door.${edge.id}`; mesh.userData.doorId = edge.id;
    mesh.userData.profile=EXPEDITION_ENVELOPES[level.index].door;
    mesh.position.set(x, 0, z); mesh.rotation.y = alongX ? Math.PI / 2 : 0; root.add(mesh);
    const parts: Pieces = new Map();
    const trim=level.index===0?m.yellow:level.index===3?m.hull:level.index===6?m.label:m.steel;
    box([0,cy,0],[w,h,level.index===4?.35:.18],level.index===5?m.rubber:m.hull,.09,[0,0,0],parts);
    if(level.index===0){
      // Cargo shutter: broad horizontal steel slats, chain case and a low tow eye.
      for(const face of [-1,1]){
        for(let y=FLOOR+.22;y<top-.3;y+=.36)box([0,y,face*.15],[w-.12,.11,.12],m.steel,.01,[0,0,0],parts);
        for(const side of [-1,1])box([side*(w/2-.23),cy,face*.19],[.18,h-.12,.15],m.yellow,.02,[0,0,0],parts);
        ring([0,FLOOR+.65,face*.25],.24,m.steel,[0,0,0],parts);
      }
    }else if(level.index===1||level.index===5){
      // Pressure lock / long oval lock: a substantial raised gasket and dogging bolts.
      const rx=w*.43,ry=level.index===5?h*.43:Math.min(h*.43,rx);
      for(const side of [-1,1]){
        const gasket=new TorusGeometry(1,.065,6,36);gasket.scale(rx,ry,1);
        add(gasket,m.rubber,[0,cy,side*.15],[0,0,0],parts);
        for(let n=0;n<10;n++){const a=n*Math.PI/5;box([Math.cos(a)*rx,cy+Math.sin(a)*ry,side*.22],[.17,.10,.13],m.steel,.02,[0,0,a],parts);}
        ring([0,cy,side*.24],Math.min(.42,w*.15),m.yellow,[0,0,0],parts);
        for(let n=0;n<3;n++)box([0,cy,side*.26],[.72,.055,.045],m.steel,.01,[0,0,n*Math.PI/3],parts);
      }
    }else if(level.index===2){
      for(const face of [-1,1])for(let n=-1;n<=1;n++){box([n*w*.29,cy,face*.15],[w*.25,h-.18,.18],n===0?m.steel:m.rubber,.065,[0,0,0],parts);
        for(const y of [FLOOR+.35,top-.55])box([n*w*.29,y,face*.28],[w*.24,.13,.09],m.yellow,.015,[0,0,0],parts);}
    }else if(level.index===3){
      // Low domestic sliding door, offset inspection glass and panic bar.
      for(const face of [-1,1]){
        box([-w*.22,cy+h*.18,face*.12],[w*.28,h*.36,.05],m.rubber,.09,[0,0,0],parts);
        box([-w*.22,cy+h*.18,face*.15],[w*.23,h*.29,.022],m.glass,.07,[0,0,0],parts);
        box([0,cy-.24,face*.20],[w*.67,.10,.10],m.steel,.025,[0,0,0],parts);
        box([w*.32,cy+.05,face*.18],[.06,.52,.10],m.red,.02,[0,0,0],parts);
      }
    }else if(level.index===4){
      for(const side of [-1,1]){
        for(const y of [cy-h*.33,cy,cy+h*.33])box([0,y,side*.24],[w-.22,.27,.18],m.steel,.025,[0,0,0],parts);
        box([0,cy,side*.32],[Math.min(w,h)*1.12,.22,.16],m.yellow,.02,[0,0,.60],parts);
        for(const sx of [-1,1])box([sx*w*.34,cy,side*.22],[.28,h-.18,.22],m.steel,.025,[0,0,0],parts);
      }
    }else{
      const radius=Math.min(w,h)*.40;
      for(const side of [-1,1]){
        ring([0,cy,side*.20],radius,m.steel,[0,0,0],parts);
        for(let n=0;n<8;n++){const a=n*Math.PI/4;box([Math.cos(a)*radius*.45,cy+Math.sin(a)*radius*.45,side*.19],[radius*.9,.12,.12],m.label,.015,[0,0,a],parts);}
        ring([0,cy,side*.27],radius*.22,m.rubber,[0,0,0],parts);
      }
    }
    const leaf=moving(parts,mesh,'themed-pressure-leaf');
    const lateral=level.index===3||level.index===6;
    doors.set(edge.id,{mesh,bounds:bounds([x,cy,z],alongX?[.38,h,w]:[w,h,.38])});
    doorAnimation.push({id:edge.id,leaf,amount:0,travel:lateral?w+.2:h+.2,lateral});
    const local=(u:number,y:number,v:number):V3=>alongX?[x+v,y,z-u]:[x+u,y,z+v];
    const size=(u:number,y:number,v:number):V3=>alongX?[v,y,u]:[u,y,v];
    for(const side of [-1,1])box(local(side*(w/2+.08),cy,0),size(.16,h,.42),trim,.055);
    // Header is inside the actual passage roof, not the old global six-metre door.
    box(local(0,top-.09,0),size(w,.18,.38),trim,.025);
    colliders.push(bounds(local(0,top-.09,0),size(w,.18,.38)));
    for(const side of [-1,1])box(local(side*(w*.37),top-.28,.23),size(.11,.08,.035),level.index===6?m.label:m.red,.01);
  }
  // Reserve routes AND item approach space before considering any decorative solid.
  const itemPositions = level.items.map(item => {
    const room = roomById.get(item.room);
    if (!room) throw new Error(`Unknown expedition item room: ${item.id}`);
    return { item, x: room.x + item.x, z: room.z + item.z };
  });
  const storytelling=createExpeditionStorytelling(level,m);
  const incidents=createIncidentSites(level,m);
  const facilities=level.index<4?createFacilitiesA(level,m):createFacilitiesB(level,m);
  // First interaction belongs in the arrival view, not only in a distant side room.
  const arrival=facilities.root.userData.entryView as {view:V3;yaw:number}|undefined;
  if(level.index===0&&arrival){
    const room=level.rooms.find(r=>r.id===level.startRoom)!;
    const x=arrival.view[0]-Math.sin(arrival.yaw)*2.5;
    const z=arrival.view[2]-Math.cos(arrival.yaw)*2.5;
    const id=`${level.id}.arrival-cache`;
    if(!level.items.some(i=>i.id===id)){
      const item={id,room:room.id,kind:'cache' as const,name:'接驳口应急检修箱',description:'回收接驳班遗留的检修收藏品。',grants:[`${level.id}.arrival-recovered`],x:x-room.x,z:z-room.z};
      level.items.push(item);itemPositions.push({item,x,z});
    }
  }
  const reserved = [...storytelling.colliders,...incidents.colliders,...facilities.colliders, ...itemPositions.map(p => bounds([p.x, 0, p.z], [3.4, 6, 3.4]))];
  reserved.push(bounds([level.spawn[0], 0, level.spawn[1]], [4, 6, 4]));
  for (const r of level.rooms) {
    reserved.push(bounds([r.x, 0, r.z], [r.width, 6, 5]), bounds([r.x, 0, r.z], [5, 6, r.depth]));
  }
  reserved.push(...corridors.map(rectBox));
  function propAllowed(p: V3, s: V3, room: Rect) {
    const b = bounds(p, s).expandByScalar(.25);
    if (b.min.x < room.x0 || b.max.x > room.x1 || b.min.z < room.z0 || b.max.z > room.z1 || reserved.some(r => r.intersectsBox(b))) return false;
    colliders.push(bounds(p, s)); return true;
  }
  function crate(x: number, z: number) {
    // Use the real cache builder rather than a decorative, unpickable mesh.
    const room=level.rooms.find(r=>Math.abs(x-r.x)<r.width/2&&Math.abs(z-r.z)<r.depth/2)!;
    const id=`${level.id}.cargo.${x.toFixed(2)}.${z.toFixed(2)}`;
    if(!level.items.some(i=>i.id===id)){
      const item={id,room:room.id,kind:'cache' as const,name:'密封货箱',description:'检修物资已回收。',x:x-room.x,z:z-room.z,grants:[`cargo.${id}`]};
      level.items.push(item);itemPositions.push({item,x,z});
    }
  }
  for (let ri = 0; ri < level.rooms.length; ri++) {
    const r = level.rooms[ri], rect = roomRects[ri];
    const roofY=r.ceiling??CEILING;
    const fixtureY=Math.min(roofY-.3,r.role==='hall'?4.8:3.6);
    const positions:V3[]=r.role==='hall'?[-1,1].flatMap(sx=>[-1,1].map(sz=>[r.x+sx*r.width*.28,fixtureY,r.z+sz*r.depth*.28] as V3)):[[r.x-r.width*.26,fixtureY,r.z-r.depth*.24],[r.x+r.width*.26,fixtureY,r.z+r.depth*.24]];
    for(const [li,p] of positions.entries()){
      box(p,[1.2,.16,.5],m.steel,.035);
      box([p[0],p[1]-.09,p[2]],[1.02,.025,.32],li%3===1?warmFixture:fixtureFace,.012);
      for(const dx of [-.42,.42])cylinder([p[0]+dx,(roofY+p[1])/2,p[2]],.022,Math.max(.05,roofY-p[1]),m.steel);
      practicalLights.push({room:r.id,position:[p[0],p[1]-.25,p[2]],color:li%3===1?art.accent:art.fixture,intensity:r.role==='hall'?(level.index===3?32:75):30,range:r.role==='hall'?24:15});
    }
    const role = r.role.toLowerCase();
    const theme = level.index === 6 ? 4 : /hall|machine/.test(role) ? 0 : /control|lab/.test(role) ? 3 : /hub/.test(role) ? 2 : /shaft|branch/.test(role) ? 4 : 1 + ri % 3;
    // Ceiling services stay above the travel envelope; low-poly couplings give scale.
    for (let n = 0; n < 3; n++) {
      const x = r.x - r.width / 2 + 1 + n * .28;
      cylinder([x, roofY-.35, r.z], n === 0 ? .11 : .055, r.depth - .5, n === 0 ? m.hull : m.steel, [Math.PI / 2, 0, 0]);
      for (let z = rect.z0 + 1; z < rect.z1; z += 3) cylinder([x, roofY-.35, z], n === 0 ? .14 : .077, .10, m.steel, [Math.PI / 2, 0, 0]);
    }
    for (let z = rect.z0 + 1; z < rect.z1; z += 3.5) box([r.x, roofY-.14, z], [r.width - .25, .20, .14], m.steel, .015);
    for (const side of [-1, 1]) {
      const x = r.x + side * (r.width / 2 - 2.1), z = r.z + (ri % 2 ? -1 : 1) * (r.depth / 2 - 2);
      const p: V3 = [x, -.35, z], s: V3 = [2.6, 3.3, 2.3];
      // The bespoke landmark owns the hall/entry silhouette, not another generic prop pair.
      if (r.role==='hall'||r.id===level.startRoom) continue;
      if (!propAllowed(p, s, rect)) continue;
      if (theme === 1 && level.index !== 5) {
        // The old rack's broad collider encloses the approach to its cargo.
        // Cache mesh bounds provide collision; leave an accessible front face.
        colliders.pop();
        crate(x, r.z);
      } else if (theme === 0) {
        box([x, -1.85, z], [2.55, .22, 2.1], m.steel, .05);
        cylinder([x, -.4, z], .79, 2.7, m.hull);
        for (let y = -1.55; y < .9; y += .32) cylinder([x, y, z], .84, .065, m.steel);
        cylinder([x + .99, -.5, z], .10, 2.7, m.steel);
        ring([x + .99, -.5, z + .16], .25, m.red);
        box([x, .65, z + .80], [.55, .34, .05], m.rubber, .025);
        sign(6, [x, .65, z + .832], .5);
      } else if (theme === 3) {
        box([x, -1.04, z], [2.35, 1.8, 1.7], m.hull, .08);
        box([x, -.10, z], [2.5, .12, 1.9], m.steel, .03);
        for (const dx of [-.7, 0, .7]) {
          cylinder([x + dx, .27, z], .17, .6, m.steel);
          cylinder([x + dx, .59, z], .18, .07, m.yellow);
        }
        box([x, -.85, z + .865], [1.4, .55, .035], m.rubber, .03);
        sign(4, [x, -.85, z + .888], 1.25);
      } else if (theme === 4) {
        for (const dx of [-.8, .8]) cylinder([x + dx, -.3, z], .11, 3.2, m.steel);
        for (let y = -1.7; y < 1.1; y += .38) box([x, y, z], [1.6, .065, .14], m.yellow, .02);
        box([x, -.3, z - .35], [2.3, 3.1, .12], m.rubber);
        for (let y = -1.6; y < 1.1; y += .55) box([x, y, z - .24], [2.2, .07, .08], m.steel);
      } else {
        box([x, -.50, z], [2.2, 2.8, 1.25], m.hull, .10);
        box([x, .2, z + .65], [1.65, .7, .07], m.rubber, .03);
        for (const dx of [-.5, 0, .5]) ring([x + dx, -.55, z + .7], .17, m.yellow);
        for (let n = 0; n < 7; n++) box([x - .75 + n * .25, -1.35, z + .65], [.09, .45, .055], m.steel);
      }
      sign(theme + 1, [x, 1.24, z + 1.16], 1.9);
    }
  }

  // Detritus collects along the working edges and door approaches, not in
  // identical corner piles. Small pieces stay below the navigable dive envelope.
  // The final clean pressure sectors intentionally retain their absence of silt.
  let debrisCount=0;
  const debrisSolids=[...storytelling.colliders,...incidents.colliders,...facilities.colliders];
  for(const [ri,r] of level.rooms.entries()){
    if(level.index===6&&r.sector>0)continue;
    let seed=(ri+1)*3571+(level.index+1)*9187;
    const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const count=level.index===3?22:level.index===6?4:14;
    for(let n=0;n<count;n++){
      const x=r.x+(rand()-.5)*(r.width-1.6),z=r.z+(rand()-.5)*(r.depth-1.6);
      const size:V3=level.index===3?[.30+rand()*.65,.025,.25+rand()*.40]:[.10+rand()*.36,.06+rand()*.06,.14+rand()*.34];
      const p:V3=[x,-1.96+size[1]/2,z],diameter=Math.hypot(size[0],size[2]),b=bounds(p,[diameter,size[1],diameter]).expandByScalar(.035);
      if(debrisSolids.some(s=>s.intersectsBox(b))||
        itemPositions.some(i=>Math.hypot(i.x-x,i.z-z)<1.15))continue;
      if(level.index===1||level.index===6){
        const radius=size[0]*.5;add(new TorusGeometry(radius,.018,5,14),m.rubber,p,[Math.PI/2,0,rand()*3]);
      }else if(level.index===0||level.index===2){
        add(new CylinderGeometry(.025,size[0]*.48,size[1],5),level.index===2?wallSkin:m.floor,p,[0,rand()*6,0]);
      }else box(p,size,level.index===3?(n%3===0?m.cloth:m.label):m.steel,0,[0,rand()*6,0]);
      colliders.push(b);debrisCount++;
    }
  }
  root.userData.debrisCount=debrisCount;
  const itemAnimation: { id: string; kind: string; group: Group; lid?: Group; amount: number }[] = [];
  for (const { item, x, z } of itemPositions) {
    const incident=item.id.includes('.incident-');
    const group = new Group(); group.name = `interaction.${item.id}`; group.userData.interactionId = item.id;
    group.position.set(x, item.id.endsWith('.arrival-cache')?.05:incident?(item.kind==='record'?-1.20:-1.42):-.2, z); root.add(group); interactables.set(item.id, group);
    const parts: Pieces = new Map(); let lid: Group | undefined;
    const ibox = (p: V3, s: V3, mat = m.hull, radius = .035) => box(p, s, mat, radius, [0, 0, 0], parts);
    if(incident&&item.kind==='record'){
      // The actual recorder on the casualty's harness is the target, not a floating placard.
      ibox([.06,0,-.02],[.21,.14,.26],m.steel,.025);
      ibox([.06,.076,-.02],[.11,.013,.14],m.rubber,.005);
      ibox([.13,.077,.04],[.025,.015,.025],m.red,.004);
    }else if (item.kind === 'cache') {
      if(item.id.endsWith('.arrival-cache')){
        ibox([0,-.59,0],[1.5,.10,1],m.steel);
        for(const dx of [-.58,.58])for(const dz of [-.32,.32])ibox([dx,-1.28,dz],[.09,1.35,.09],m.steel);
      }
      ibox([0, -.15, 0], [1.35, .8, .85], m.hull, .085);
      for (const dx of [-.40, .40]) {
        ibox([dx, -.15, .432], [.12, .75, .015], m.red, .004);
        ibox([dx, .07, .46], [.18, .15, .04], m.steel);
      }
      lid = new Group(); lid.position.set(0, .26, -.43); group.add(lid);
      const lidParts: Pieces = new Map();
      box([0, 0, .43], [1.4, .12, .9], m.hull, .05, [0, 0, 0], lidParts);
      for (const dx of [-.40, .40]) box([dx, .068, .43], [.12, .012, .87], m.red, 0, [0, 0, 0], lidParts);
      moving(lidParts, lid, 'cache-lid');
    } else if (item.kind === 'pickup') {
      ibox([0, 0, 0], [.58, .32, .19], m.yellow, .055);
      ibox([.32, 0, 0], [.36, .075, .075], m.steel);
      for (const dx of [.27, .4]) ibox([dx, -.06, 0], [.06, .14, .08], m.steel, .012);
      ibox([-.09, 0, .103], [.18, .13, .025], m.rubber);
      ring([-.17, .24, 0], .11, m.steel, [0, 0, 0], parts);
    } else if (item.kind === 'record') {
      ibox([0, 0, 0], [.8, .57, .10], m.steel);
      ibox([0, 0, .06], [.68, .45, .024], m.label, .015);
      for (let n = 0; n < 4; n++) ibox([-.05, .13 - n * .08, .078], [.45 - n * .05, .022, .01], m.rubber, 0);
      ibox([0, .30, .06], [.27, .10, .035], m.yellow);
    } else {
      ibox([0, -.32, 0], [1.05, 1.45, .65], m.hull, .08);
      ibox([0, .11, .345], [.85, .58, .055], m.rubber);
      for (let n = 0; n < 3; n++) ibox([-.12, .25 - n * .13, .38], [.47 - n * .08, .028, .013], m.label, 0);
      for (const dx of [-.29, 0, .29]) cylinder([dx, -.35, .37], .056, .045, dx < 0 ? m.red : m.yellow, [Math.PI / 2, 0, 0], parts);
      if (item.kind === 'exit') {
        ring([0, .90, 0], .44, m.yellow, [0, 0, 0], parts);
        ibox([0, .9, 0], [.08, .57, .08], m.label);
        ibox([.12, 1.10, 0], [.30, .07, .08], m.label);
      } else {
        ring([0, -.72, .4], .20, m.red, [0, 0, 0], parts);
        ibox([0, -.72, .4], [.34, .035, .04], m.steel);
      }
    }
    moving(parts, group, item.kind);
    // Thin mounting stem anchors floating-height controls without blocking approach.
    if (item.kind !== 'pickup'&&!incident) {
      box([x, -1.60, z], [.08, .8, .08], m.steel);
      box([x, -1.94, z], [.44, .08, .40], m.steel, .025);
    }
    itemAnimation.push({ id: item.id, kind: item.kind, group, lid, amount: 0 });
  }
  for (const [material, pieces] of batches) {
    const mesh = new Mesh(merge(pieces), material); mesh.name = `static.${material.name || 'decals'}`;
    mesh.castShadow = mesh.receiveShadow = material!==seaGlass; root.add(mesh);
  }
  batches.clear();
  const anchors=facilities.views.map(v=>{
    const r=level.rooms.find(r=>Math.abs(r.x-v.view[0])<r.width/2&&Math.abs(r.z-v.view[2])<r.depth/2)??level.rooms.reduce((a,b)=>Math.hypot(a.x-v.view[0],a.z-v.view[2])<Math.hypot(b.x-v.view[0],b.z-v.view[2])?a:b);
    return {...v,room:r.id,position:[r.x,0,r.z] as V3};
  }).filter(v=>level.rooms.find(r=>r.id===v.room)?.role==='hall');
  const wayfinding=createExpeditionWayfinding(level,m);
  const architecture=createExpeditionArchitecture(level,m);
  const shells=createExpeditionShells(level,m);
  const passages=createPassageDetails(level,m);
  root.add(facilities.root,wayfinding.root,architecture.root,storytelling.root,shells.root,incidents.root,passages.root);colliders.push(...facilities.colliders,...architecture.colliders,...storytelling.colliders,...shells.colliders,...incidents.colliders,...passages.colliders);
  let disposed = false, previousTime: number | undefined;
  return {
    root, colliders, walkable, interactables, doors,anchors,storyViews:[...incidents.views,...storytelling.views],passageViews:passages.views,practicalLights,entryView:facilities.root.userData.entryView,
    update(state, time) {
      if (disposed || !Number.isFinite(time)) return;
      facilities.update(time);wayfinding.update(state);storytelling.update(time);incidents.update(time);passages.update(time);
      const first = previousTime === undefined;
      const dt = first ? 0 : Math.max(0, Math.min(.1, time - previousTime!)); previousTime = time;
      const opened = new Set(state.opened), collected = new Set(state.collected);
      for(const [id,lights] of emergencyDoors)lights.update(opened.has(id));
      for (const d of doorAnimation) {
        const target = opened.has(d.id) ? 1 : 0;
        d.amount = first ? target : d.amount + Math.sign(target - d.amount) * Math.min(Math.abs(target - d.amount), dt * 1.8);
        if(d.lateral)d.leaf.position.x=d.amount*d.travel;
        else d.leaf.position.y = d.amount * d.travel;
        d.leaf.visible = d.amount < 1;
      }
      for (const item of itemAnimation) {
        // Records/consoles remain identifiable after use. Collected cargo disappears
        // but its map entry remains stable for callers retaining an interaction target.
        item.group.visible = !(collected.has(item.id) && item.kind === 'pickup');
        item.group.userData.collected = collected.has(item.id);
        if (item.lid) {
          const target = opened.has(item.id) ? 1 : 0;
          item.amount = first ? target : item.amount + Math.sign(target - item.amount) * Math.min(Math.abs(target - item.amount), dt * 2);
          item.lid.rotation.x = -item.amount * 1.25;
        }
      }
    },
    dispose() {
      if (disposed) return; disposed = true;
      facilities.dispose();wayfinding.dispose();architecture.dispose();storytelling.dispose();shells.dispose();incidents.dispose();passages.dispose();
      root.removeFromParent(); root.clear();
      for (const g of geometry) g.dispose(); geometry.clear();
      for (const material of ownedMaterials) material.dispose();
      for (const texture of textures) texture.dispose();
      emergencyDoors.forEach(x=>x.dispose());colliders.length = 0; walkable.length = 0; doors.clear(); interactables.clear();
    },
  };
}
