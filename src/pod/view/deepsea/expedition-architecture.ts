import { Box3, BoxGeometry, BufferGeometry, CatmullRomCurve3, CylinderGeometry, DataTexture, Euler, Group, LinearFilter, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, RGBAFormat, SRGBColorSpace, TubeGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ExpeditionLevel } from '../../content/expedition';
import type { ReferenceMaterials } from './reference-materials';
type V=[number,number,number];

/** Structural dressings stay above the player envelope or outside the doorway cross. */
export function createExpeditionArchitecture(level:ExpeditionLevel,m:ReferenceMaterials){
  const root=new Group();root.name='expedition-structural-layers';
  const geometries:BufferGeometry[]=[],owned:MeshStandardMaterial[]=[],colliders:Box3[]=[];
  const lamp=m.hull.clone();lamp.color.set('#bad8d4');lamp.emissive.set('#639eaa');lamp.emissiveIntensity=.35;owned.push(lamp);
  const oxidized=m.steel.clone();oxidized.color.set('#51463a');oxidized.metalness=.4;oxidized.roughness=.93;owned.push(oxidized);
  const dark=m.hull.clone();dark.color.set('#263a40');dark.roughness=.84;owned.push(dark);
  // Localised gravity-runoff decals originate at inspection fasteners, not random dirt everywhere.
  const stainPixels=new Uint8Array(64*128*4);
  for(let y=0;y<128;y++)for(let x=0;x<64;x++){
    const u=x/63,v=y/127;let a=0;
    for(let n=0;n<7;n++){const center=.12+n*.12+Math.sin(v*7+n)*.013,width=.009+(1-v)*.023;
      a+=Math.exp(-(((u-center)/width)**2))*Math.max(0,(v-(n%3)*.14))*.28;}
    const noise=(Math.sin(x*91.7+y*17.3)*43758.5)%1;
    const i=(y*64+x)*4;stainPixels[i]=64;stainPixels[i+1]=43;stainPixels[i+2]=26;stainPixels[i+3]=Math.round(Math.min(.58,Math.max(0,a*(.8+noise*.2)))*255);
  }
  const stainMap=new DataTexture(stainPixels,64,128,RGBAFormat);stainMap.colorSpace=SRGBColorSpace;stainMap.magFilter=stainMap.minFilter=LinearFilter;stainMap.needsUpdate=true;
  const stain=new MeshStandardMaterial({map:stainMap,transparent:true,depthWrite:false,roughness:.94,polygonOffset:true,polygonOffsetFactor:-1});owned.push(stain);
  const rows=new Map<MeshStandardMaterial,BufferGeometry[]>();
  function add(g:BufferGeometry,mat:MeshStandardMaterial,p:V,r:V=[0,0,0]){g.applyMatrix4(new Matrix4().compose(new Vector3(...p),new Quaternion().setFromEuler(new Euler(...r)),new Vector3(1,1,1)));const flat=g.index?g.toNonIndexed():g;if(flat!==g)g.dispose();flat.clearGroups();const bucket=rows.get(mat)??[];bucket.push(flat);rows.set(mat,bucket);}
  function box(p:V,s:V,mat=m.steel,r:V=[0,0,0]){add(new BoxGeometry(...s),mat,p,r);}
  function pipe(points:V[],radius=.06,mat=m.steel){add(new TubeGeometry(new CatmullRomCurve3(points.map(p=>new Vector3(...p))),Math.max(10,points.length*6),radius,8,false),mat,[0,0,0]);}
  // Authored facility modules own the full high-bay hall and entry volumes now.
  const selected=level.rooms.filter(r=>r.role==='branch');
  for(const room of selected){
    const halfX=room.width/2,halfZ=room.depth/2,large=room.role==='hall';
    const x0=room.x,z0=room.z;
    // Recessed panel joints provide human-scale structure behind the machinery.
    // Leave the full central doorway band clear on all four walls.
    for(const side of [-1,1]){
      for(let u=-halfX+.8;u<halfX-.5;u+=1.65){
        if(Math.abs(u)<3)continue;
        const z=z0+side*(halfZ-.10);
        box([x0+u,.85,z],[.028,5.5,.025],dark);
        const span=Math.max(.02,Math.min(1.65,(u<0?-3:halfX-.15)-u));
        for(const y of [-1.15,.15,1.45,2.75]){
          box([x0+u+span/2,y,z],[span,.028,.026],dark);
          box([x0+u+.08,y+.09,z-side*.014],[.05,.05,.025],oxidized);
        }
      }
      for(let u=-halfZ+.8;u<halfZ-.5;u+=1.65){
        if(Math.abs(u)<3)continue;
        const x=x0+side*(halfX-.10);
        box([x,.85,z0+u],[.025,5.5,.028],dark);
        const span=Math.max(.02,Math.min(1.65,(u<0?-3:halfZ-.15)-u));
        for(const y of [-1.15,.15,1.45,2.75])box([x,y,z0+u+span/2],[.026,.028,span],dark);
      }
      // High-level cable tray connects wall infrastructure to the hall's hero bay.
      if(large){
        const z=z0+side*(halfZ-.35);
        box([x0,3.15,z],[room.width-.8,.12,.3],dark);
        for(let n=0;n<3;n++)pipe([[x0-halfX+.5,3.28,z-.09+n*.09],[x0,3.28,z-.09+n*.09],[x0+halfX-.5,3.28,z-.09+n*.09]],.032,n===0?oxidized:m.rubber);
        for(let x=-halfX+1;x<halfX-.5;x+=2.2)box([x0+x,3.2,z],[.10,.3,.42],m.steel);
      }
    }
    // Narrow maintenance strips and recesses break the undifferentiated sheet-metal ceiling.
    const extent=Math.min(halfZ-1,large?7:4.3);
    for(let z=-extent;z<=extent;z+=2.6){
      if(level.index===5){
        pipe([[x0-halfX+.6,2.95,z0+z],[x0-halfX+1.8,3.55,z0+z],[x0+halfX-1.8,3.55,z0+z],[x0+halfX-.6,2.95,z0+z]],.12,dark);
      }else if(level.index===6){
        box([x0,3.70,z0+z],[room.width-.6,.10,.38],m.hull);
        box([x0,3.635,z0+z],[Math.min(room.width-1,7),.018,.055],lamp);
      }else{
        const width=Math.min(halfX*2-1.1,8.8);
        box([x0,3.80,z0+z],[width,.18,2.25],dark);
        for(let x=-width/2+.55;x<width/2;x+=1.1){
          const missing=(Math.round((x+width/2)/1.1)+Math.round(z+extent)+room.sector+level.index)%7===0;
          if(!missing)box([x0+x,3.67,z0+z],[1.01,.07,2.12],m.hull);
          else{
            for(let n=0;n<3;n++)pipe([[x0+x-.3+n*.22,3.70,z0+z-.95],[x0+x-.22+n*.22,3.32,z0+z],[x0+x-.18+n*.22,3.70,z0+z+.95]],.022,m.rubber);
            if(level.index<4)box([x0+x+.24,3.39,z0+z+.17],[.55,.055,1.45],m.hull,[.13,0,-.23]);
          }
        }
      }
    }
    // A service spine: seven different functional forms, not seven neon colours.
    const offset=-(halfX-.6);
    if(level.index===0||level.index===4){
      for(const side of [-.18,.18])pipe([[x0+offset+side,3.05,z0-halfZ+.5],[x0+offset+side,3.05,z0+halfZ-.5]],level.index===4?.18:.10,level.index===4?dark:oxidized);
      for(let z=-halfZ+1;z<halfZ;z+=2.3)box([x0+offset,3.03,z0+z],[.75,.065,.20],m.steel);
    }else if(level.index===1){
      for(const side of [-.24,.24])pipe([[x0+offset,3.05,z0-halfZ+.5],[x0+offset,3.05,z0+side],[x0+offset+1.3,3.15,z0+side],[x0+offset+1.3,3.4,z0+halfZ-.5]],.13,m.hull);
    }else if(level.index===2){
      for(let z=-halfZ+1;z<halfZ;z+=1.3){add(new CylinderGeometry(.28,.28,.18,12),oxidized,[x0+offset,3.2,z0+z],[Math.PI/2,0,0]);}
      pipe([[x0+offset,3.2,z0-halfZ+.5],[x0+offset,3.2,z0+halfZ-.5]],.21,dark);
    }else if(level.index===3){
      for(let z=-halfZ+1;z<halfZ;z+=2.7){box([x0+offset,2.85,z0+z],[.18,.85,.12],m.steel);box([x0+offset+.18,2.44,z0+z],[.40,.08,.12],m.yellow);}
    }else if(level.index===5){
      for(let z=-halfZ+1;z<halfZ;z+=2.7){box([x0+offset,2.2,z0+z],[.12,1.8,.20],m.hull);box([x0+offset+.08,2.6,z0+z],[.025,.8,.07],lamp);}
    }
    // Wall inspection covers only on solid wall segments; centre openings stay intact.
    for(const side of [-1,1])for(const z of [-halfZ+1.8,halfZ-1.8]){
      if(Math.abs(z)<3)continue;
      const x=x0+side*(halfX-.08);
      box([x,1.05,z0+z],[.05,1.2,1.9],dark);
      if(level.index!==6)add(new PlaneGeometry(1.8,2.4),stain,[x-side*.07,-.05,z0+z],[0,-side*Math.PI/2,0]);
      for(const dz of [-.81,.81])for(const y of [.55,1.55])add(new CylinderGeometry(.045,.045,.07,6),m.steel,[x-side*.065,y,z0+z+dz],[0,0,Math.PI/2]);
      for(let n=0;n<7;n++)box([x-side*.06,.73+n*.10,z0+z],[.03,.023,1.4],m.steel);
    }
    // Recessed drain strips provide a material-scale cue, kept flush with the floor.
    for(const side of [-1,1]){
      const x=x0+side*(halfX-.7);
      box([x,-1.987,z0],[.44,.016,room.depth-.6],dark);
      for(let z=-halfZ+.5;z<halfZ-.3;z+=.42)box([x,-1.974,z0+z],[.4,.018,.075],m.steel);
    }
  }
  for(const [material,parts] of rows){const g=mergeGeometries(parts,false)!;parts.forEach(p=>p.dispose());g.computeBoundingBox();g.computeBoundingSphere();geometries.push(g);const mesh=new Mesh(g,material);mesh.castShadow=material!==stain;mesh.receiveShadow=true;root.add(mesh);}
  let disposed=false;return{root,colliders,dispose(){if(disposed)return;disposed=true;root.removeFromParent();root.clear();geometries.forEach(g=>g.dispose());owned.forEach(m=>m.dispose());stainMap.dispose();}};
}
