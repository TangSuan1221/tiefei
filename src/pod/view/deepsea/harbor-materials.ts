import {
  DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshPhysicalMaterial,
  NoColorSpace, RepeatWrapping, RGBAFormat, SRGBColorSpace,
} from 'three';
import type { ReferenceMaterials } from './reference-materials';
import {acquireHarborScans,setHarborPigment} from './harbor-scanned-surfaces';

const SIZE=512;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const wrap=(v:number,n:number)=>(v%n+n)%n;
function hash(x:number,y:number,seed:number):number {
  let n=Math.imul(x+seed,374761393)^Math.imul(y+31,668265263);
  n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967296;
}
/** Periodic value noise; both albedo and normal derivatives tile continuously. */
function noise(u:number,v:number,n:number,seed:number):number {
  const x=u*n,y=v*n,ix=Math.floor(x),iy=Math.floor(y);
  const tx=x-ix,ty=y-iy,sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty);
  const at=(a:number,b:number)=>hash(wrap(a,n),wrap(b,n),seed);
  return mix(mix(at(ix,iy),at(ix+1,iy),sx),mix(at(ix,iy+1),at(ix+1,iy+1),sx),sy);
}
type Finish='paint'|'steel'|'deck';

/**
 * Harbor-owned clones and deterministic CPU DataTextures, no DOM/Canvas/WebGL.
 * Usage: const harbor=createHarborMaterials(reference); createHarborWorld(level,harbor).
 * Call harbor.dispose() after world disposal; reference remains independently owned.
 * Keep geometry UVs at a consistent physical scale (~1m per tile). This factory
 * never changes UVs, lighting, source texture repeat, or the six other levels.
 */
export function createHarborMaterials(source:ReferenceMaterials):ReferenceMaterials {
  const keys=['hull','steel','rubber','yellow','red','cloth','floor','label','glass'] as const;
  const cloned=Object.fromEntries(keys.map(key=>[key,source[key].clone()])) as Omit<ReferenceMaterials,'dispose'>;
  const textures:DataTexture[]=[];
  function texture(data:Uint8Array,name:string,color=false):DataTexture {
    const t=new DataTexture(data,SIZE,SIZE,RGBAFormat);
    t.name=`harbor.${name}`;t.colorSpace=color?SRGBColorSpace:NoColorSpace;
    t.wrapS=t.wrapT=RepeatWrapping;t.magFilter=LinearFilter;t.minFilter=LinearMipmapLinearFilter;
    t.generateMipmaps=true;t.anisotropy=4;t.needsUpdate=true;textures.push(t);return t;
  }
  function bake(finish:Finish,seed:number){
    const albedo=new Uint8Array(SIZE*SIZE*4),rough=new Uint8Array(albedo.length),metal=new Uint8Array(albedo.length),normal=new Uint8Array(albedo.length),height=new Float32Array(SIZE*SIZE);
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
      const u=x/SIZE,v=y/SIZE,i=(y*SIZE+x)*4;
      const macro=noise(u,v,5,seed),meso=noise(u,v,23,seed+1),grain=hash(x,y,seed+2);
      // Sparse fine defects, not broad camouflage islands. Macro variation only
      // modulates a weak patina; it must not determine the rust silhouette.
      const corrosionField=noise(u,v,7,seed+29);
      const corrosion=clamp((noise(u,v,101,seed+9)*.78+corrosionField*.22-.74)*4);
      // Flakes collect in local damaged regions instead of covering every panel
      // with an even sprinkle of dots. Fine structure breaks their boundaries.
      const chip=clamp((noise(u,v,127,seed+3)*.82+corrosionField*.18-.82)*5);
      // Short, independently placed strokes, not full-tile brushed-metal bands.
      // Integer cells and wrapped seeds retain physical tiling at every boundary.
      const cx=Math.floor(u*9),cy=Math.floor(v*31),cell=hash(cx,cy,seed+15);
      const localU=wrap(u*9,1),localV=wrap(v*31,1);
      const scratch=cell>.70?Math.exp(-Math.pow((localV-.3-cell*.35)/.042,2))
        *clamp(Math.min(localU-.12,.86-localU)*12):0;
      const wear=clamp(chip+corrosion*.5);
      // Periodic vertical grime: no seam from a fractional noise domain.
      const vertical=noise(u,0,37,seed+7)*noise(u,v,4,seed+8);
      const runoff=clamp((vertical-.56)*2.8)*(.4+meso*.6);
      const dirt=clamp(vertical*.055+macro*.045+runoff*.09);
      // Steel is isotropic oxidised stock, not brushed chrome. Low-amplitude
      // albedo/relief avoids turning stretched beam UVs into bright scan lines.
      let base=finish==='steel'?.66+meso*.023+grain*.003-dirt*.12:.79+meso*.02+grain*.003-dirt*.32;
      base+=scratch*.035;
      let relief=(meso-.5)*(finish==='steel'?.018:.025)-chip*.11-scratch*.018;
      if(finish==='deck'){
        // Grating/tread is modeled by the world. A second regular texture
        // pattern reads as a checkerboard at grazing angles and fights it.
        relief=(meso-.5)*.014-chip*.035-scratch*.01;
        base=.60+meso*.01+grain*.002-dirt*.10+scratch*.008;
      }
      // Keep corrosion mainly in reflectance; avoid a camouflage pattern at room scale.
      const rustAmount=clamp(corrosion*.12+chip*.15+runoff*.09);
      const pigment=[base,base*.99,base*.95];
      const rust=[.38+meso*.08,.25+meso*.06,.16+meso*.05];
      for(let c=0;c<3;c++)albedo[i+c]=Math.round(clamp(mix(pigment[c]*(1-chip*.04),rust[c],rustAmount))*255);
      albedo[i+3]=255;
      // Reflectance varies independently of pigment: damp patches stay neutral,
      // with isotropic boundaries rather than shiny full-length brush stripes.
      // Broad wetness must not switch entire islands between nearly black
      // specular metal and bright diffuse oxide under the same practical lamp.
      const damp=clamp((noise(u,v,5,seed+23)-.18)*1.35);
      const oxide=clamp(corrosion*.5);
      const steelRough=mix(.53,.37,damp);
      const paintRough=mix(.61,.43,damp);
      const roughness=finish==='paint'
        ? Math.max(.29,Math.min(.88,mix(paintRough,.88,oxide)+meso*.025-scratch*.07))
        : Math.max(.27,Math.min(.90,mix(steelRough,.90,oxide)+meso*.025-scratch*.06));
      const metallic=finish==='paint'
        ? Math.max(chip,scratch*.4)*(1-oxide)*.22
        : mix(.46,.36,oxide);
      for(let c=0;c<3;c++){rough[i+c]=Math.round(roughness*255);metal[i+c]=Math.round(metallic*255);}
      rough[i+3]=metal[i+3]=255;
      height[y*SIZE+x]=relief+wear*.015;
    }
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
      const at=(a:number,b:number)=>height[wrap(b,SIZE)*SIZE+wrap(a,SIZE)];
      const dx=(at(x-1,y)-at(x+1,y))*3,dy=(at(x,y-1)-at(x,y+1))*3,length=Math.hypot(dx,dy,1),i=(y*SIZE+x)*4;
      normal[i]=Math.round((dx/length*.5+.5)*255);normal[i+1]=Math.round((dy/length*.5+.5)*255);normal[i+2]=Math.round((1/length*.5+.5)*255);normal[i+3]=255;
    }
    return {map:texture(albedo,`${finish}.albedo`,true),roughnessMap:texture(rough,`${finish}.roughness`),metalnessMap:texture(metal,`${finish}.metalness`),normalMap:texture(normal,`${finish}.normal`)};
  }
  const paint=bake('paint',931),steel=bake('steel',613),deck=bake('deck',277);
  for(const key of keys){const m=cloned[key];m.name=`harbor.${key}`;}
  for(const key of ['hull','yellow','label'] as const){
    const m=cloned[key];Object.assign(m,paint);m.roughness=1;m.metalness=1;m.normalScale.set(.42,.42);
    if(m instanceof MeshPhysicalMaterial){m.clearcoat=0;m.clearcoatMap=null;m.clearcoatNormalMap=null;m.clearcoatRoughnessMap=null;}
  }
  // Desaturated old marine paint; cyan illumination belongs to scene lights.
  cloned.hull.color.set('#8b9991');
  cloned.yellow.color.set('#b99b55');
  Object.assign(cloned.steel,steel);cloned.steel.roughness=1;cloned.steel.metalness=1;cloned.steel.normalScale.set(.16,.16);cloned.steel.envMapIntensity=.4;
  Object.assign(cloned.floor,deck);cloned.floor.color.set('#a5aaa5');cloned.floor.roughness=1;cloned.floor.metalness=1;cloned.floor.normalScale.set(.32,.32);
  const scans=acquireHarborScans();
  if(scans){
    Object.assign(cloned.hull,scans.paint);cloned.hull.metalnessMap=null;cloned.hull.metalness=.32;cloned.hull.roughness=.78;cloned.hull.normalScale.set(.55,.55);
    Object.assign(cloned.floor,scans.deck);cloned.floor.metalnessMap=null;cloned.floor.metalness=.48;cloned.floor.roughness=.72;cloned.floor.normalScale.set(.7,.7);
    setHarborPigment(cloned.hull,'#8b9991');setHarborPigment(cloned.floor,'#a5aaa5');
    if(cloned.hull instanceof MeshPhysicalMaterial){
      cloned.hull.clearcoat=.30;cloned.hull.clearcoatMap=scans.paintWetness;
      cloned.hull.clearcoatRoughness=.55;cloned.hull.clearcoatRoughnessMap=scans.paint.roughnessMap;
      cloned.hull.clearcoatNormalMap=scans.paint.normalMap;cloned.hull.clearcoatNormalScale.set(.22,.22);
    }
  }
  let disposed=false;
  return {...cloned,dispose(){if(disposed)return;disposed=true;scans?.release();textures.forEach(t=>t.dispose());keys.forEach(key=>cloned[key].dispose());}};
}
