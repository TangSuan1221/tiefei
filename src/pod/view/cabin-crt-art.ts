import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/** Decorative CRT chassis. Local +Z faces the player; live glass stays at Z .055.
 * Every forward-facing part lies outside the existing rectangular display. */
export function buildCrtHousing(group:THREE.Group,w:number,h:number,decorativeChin=true):THREE.Texture[]{
  const c=document.createElement('canvas');c.width=c.height=512;
  const ctx=c.getContext('2d')!;ctx.fillStyle='#a29b89';ctx.fillRect(0,0,512,512);
  let seed=90371;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<24000;i++){const v=80+Math.floor(rand()*80);ctx.fillStyle=`rgba(${v},${v},${v},.11)`;ctx.fillRect(rand()*512,rand()*512,1,1);}
  for(let i=0;i<390;i++){const x=rand()*512,y=i<300?(rand()<.5?rand()*24:512-rand()*24):rand()*512;ctx.fillStyle=i%3?'#665c4b':'#b8b2a3';ctx.fillRect(x,y,1+rand()*9,.5+rand()*2);}
  for(let i=0;i<40;i++){const x=rand()*512,y=rand()*512,r=9+rand()*44,g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(33,28,22,.13)');g.addColorStop(1,'rgba(33,28,22,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=8;
  const enamel=new THREE.MeshStandardMaterial({color:0x747b79,map,metalness:.14,roughness:.83,bumpMap:map,bumpScale:.00035});
  const side=new THREE.MeshStandardMaterial({color:0x4a463d,map,metalness:.22,roughness:.86});
  const gasket=new THREE.MeshStandardMaterial({color:0x080b09,roughness:.84});
  const steel=new THREE.MeshStandardMaterial({color:0x716a58,metalness:.62,roughness:.6});
  const add=(geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;group.add(m);return m;};
  const box=(bw:number,bh:number,bd:number,x:number,y:number,z:number,mat:THREE.Material,r=.003)=>add(new RoundedBoxGeometry(bw,bh,bd,3,Math.min(r,bw/3,bh/3,bd/3)),mat,x,y,z);
  const trim=Math.max(.016,Math.min(w,h)*.07),chin=trim*2.6;
  // Deep rear shell is behind the live screen, never over its pixels.
  box(w+trim*2,h+trim+chin,.085,0,(trim-chin)/2,-.013,side,.011);
  // Continuous molded fascia, with physical-scale UVs to avoid stretched wood grain.
  const ox=w/2+trim+.005,top=h/2+trim+.004,bottom=-h/2-chin-.004,r=.010;
  const shape=new THREE.Shape();shape.moveTo(-ox+r,bottom);shape.lineTo(ox-r,bottom);shape.quadraticCurveTo(ox,bottom,ox,bottom+r);shape.lineTo(ox,top-r);shape.quadraticCurveTo(ox,top,ox-r,top);shape.lineTo(-ox+r,top);shape.quadraticCurveTo(-ox,top,-ox,top-r);shape.lineTo(-ox,bottom+r);shape.quadraticCurveTo(-ox,bottom,-ox+r,bottom);
  const hx=w/2+.008,hy=h/2+.008;
  const hole=new THREE.Path();hole.moveTo(-hx,-hy);hole.lineTo(-hx,hy);hole.lineTo(hx,hy);hole.lineTo(hx,-hy);hole.closePath();shape.holes.push(hole);
  const fascia=new THREE.ExtrudeGeometry(shape,{depth:.018,bevelEnabled:true,bevelSize:.006,bevelThickness:.008,bevelSegments:4,steps:1});
  const uv=fascia.attributes.uv,pos=fascia.attributes.position;
  for(let i=0;i<uv.count;i++)uv.setXY(i,pos.getX(i)*1.3+.5,pos.getY(i)*1.3+.5);
  add(fascia,enamel,0,0,.032);
  const seal=.003;
  box(w+.006,seal,.009,0,h/2+seal/2,.051,gasket,.001);
  box(w+.006,seal,.009,0,-h/2-seal/2,.051,gasket,.001);
  box(seal,h,.009,-w/2-seal/2,0,.051,gasket,.001);
  box(seal,h,.009,w/2+seal/2,0,.051,gasket,.001);
  // Recessed front service buttons and knurled contrast dial, no hit targets.
  const cy=-h/2-chin*.56;
  const disk=(radius:number,depth:number,x:number,y:number,z:number,mat:THREE.Material)=>{const m=add(new THREE.CylinderGeometry(radius,radius,depth,24),mat,x,y,z);m.rotation.x=Math.PI/2;return m;};
  if(decorativeChin){
    for(let i=0;i<3;i++){const x=-w*.27+i*trim*.60;disk(trim*.20,.003,x,cy,.060,gasket);disk(trim*.14,.004,x,cy,.062,steel);}
    const knobX=w*.33;disk(trim*.37,.005,knobX,cy,.060,gasket);disk(trim*.29,.013,knobX,cy,.066,steel);
    box(.0015,trim*.25,.001,knobX,cy+trim*.13,.073,gasket,.0003);
    for(let i=0;i<12;i++){const a=i*Math.PI/6;box(.001,.003,.008,knobX+Math.cos(a)*trim*.28,cy+Math.sin(a)*trim*.28,.066,gasket,.0002);}
    // Fine vent cuts on the lower lip.
    for(let i=0;i<9;i++)box(.0015,chin*.20,.001,-w*.04+i*.005,cy,.059,gasket,.0002);
  }
  // Visible screws stay outside aperture.
  for(const x of [-w/2-trim*.5,w/2+trim*.5])for(const y of [-h/2-chin*.7,h/2+trim*.5]){
    disk(.003,.0015,x,y,.059,steel);const slot=box(.0035,.0006,.0004,x,y,.060,gasket,.0001);slot.rotation.z=.6;
  }
  return [map];
}
