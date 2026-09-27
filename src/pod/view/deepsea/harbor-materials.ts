import {
  DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshPhysicalMaterial,
  NoColorSpace, RepeatWrapping, RGBAFormat, SRGBColorSpace,
} from 'three';
import type { ReferenceMaterials } from './reference-materials';

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
      const corrosion=clamp((noise(u,v,67,seed+9)*.9+meso*.1-.66)*5);
      const chip=clamp((noise(u,v,97,seed+3)-.74)*6);
      // Short, independently placed strokes, not full-tile brushed-metal bands.
      // Integer cells and wrapped seeds retain physical tiling at every boundary.
      const cx=Math.floor(u*9),cy=Math.floor(v*31),cell=hash(cx,cy,seed+15);
      const localU=wrap(u*9,1),localV=wrap(v*31,1);
      const scratch=cell>.70?Math.exp(-Math.pow((localV-.3-cell*.35)/.042,2))
        *clamp(Math.min(localU-.12,.86-localU)*12):0;
      const wear=clamp(chip+corrosion*.5);
      // Periodic vertical grime: no seam from a fractional noise domain.
      const vertical=noise(u,0,37,seed+7)*noise(u,v,4,seed+8);
      const dirt=clamp(vertical*.055+macro*.045);
      // Steel is isotropic oxidised stock, not brushed chrome. Low-amplitude
      // albedo/relief avoids turning stretched beam UVs into bright scan lines.
      let base=finish==='steel'?.58+meso*.07+grain*.006-dirt*.4:.76+meso*.06+grain*.008-dirt;
      base+=scratch*.035;
      let relief=(meso-.5)*(finish==='steel'?.012:.018)-chip*.025-scratch*.012;
      if(finish==='deck'){
        // Alternating short raised tread bars; industrial grip, not wall graffiti.
        const row=Math.floor(v*8),du=wrap(u*8+(row%2)*.5,1)-.5,dv=wrap(v*8,1)-.5;
        const ridge=Math.exp(-Math.pow((du+(row%2?dv:-dv)*.6)/.075,4)-Math.pow(dv/.29,6));
        relief+=ridge*.10;base=.49+meso*.055+grain*.008-dirt*.4+ridge*.055+scratch*.025;
      }
      const rustAmount=corrosion*(finish==='paint'?.48:finish==='deck'?.34:.48);
      const pigment=[base,base*.99,base*.95];
      const rust=[.44+meso*.08,.33+meso*.06,.25+meso*.05];
      for(let c=0;c<3;c++)albedo[i+c]=Math.round(clamp(mix(pigment[c]*(1-chip*.12),rust[c],rustAmount))*255);
      albedo[i+3]=255;
      // Reflectance varies independently of pigment: damp patches stay neutral,
      // with isotropic boundaries rather than shiny full-length brush stripes.
      const damp=clamp((noise(u,v,11,seed+23)-.28)*2.1);
      const oxide=clamp(corrosion*1.7);
      const steelRough=mix(.76,.38,damp);
      const paintRough=mix(.79,.55,damp);
      const roughness=finish==='paint'
        ? Math.max(.55,Math.min(.88,mix(paintRough,.88,oxide)+meso*.025-scratch*.07))
        : Math.max(.38,Math.min(.90,mix(steelRough,.90,oxide)+meso*.025-scratch*.06));
      const metallic=finish==='paint'
        ? Math.max(chip,scratch*.65)*(1-oxide)*.82
        : mix(.65+damp*.20,.08,oxide);
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
    const m=cloned[key];Object.assign(m,paint);m.roughness=1;m.metalness=1;m.normalScale.set(.45,.45);
    if(m instanceof MeshPhysicalMaterial){m.clearcoat=0;m.clearcoatMap=null;m.clearcoatNormalMap=null;m.clearcoatRoughnessMap=null;}
  }
  cloned.hull.color.set('#b9bdb8');
  Object.assign(cloned.steel,steel);cloned.steel.roughness=1;cloned.steel.metalness=1;cloned.steel.normalScale.set(.16,.16);cloned.steel.envMapIntensity=.4;
  Object.assign(cloned.floor,deck);cloned.floor.color.set('#a5aaa5');cloned.floor.roughness=1;cloned.floor.metalness=1;cloned.floor.normalScale.set(.65,.65);
  let disposed=false;
  return {...cloned,dispose(){if(disposed)return;disposed=true;textures.forEach(t=>t.dispose());keys.forEach(key=>cloned[key].dispose());}};
}
