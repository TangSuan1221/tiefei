import * as T from 'three';

/** Vitreous enamel signs: wear follows the rolled rim and attachment points. */
export function createHarborSign(text:string,sub:string,width:number){
 const c=document.createElement('canvas');c.width=1024;c.height=256;
 const ctx=c.getContext('2d')!;
 ctx.fillStyle='#172522';ctx.fillRect(0,0,1024,256);
 ctx.strokeStyle='#6e7965';ctx.lineWidth=3;ctx.strokeRect(15,15,994,226);
 let seed=43829;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<1500;i++){
  const x=random()*1024,y=random()*256,edge=Math.min(x,1024-x,y,256-y);
  if(edge>18&&random()>.04)continue;
  ctx.fillStyle=random()>.5?'#754930':'#8b9080';ctx.globalAlpha=.15+random()*.35;ctx.fillRect(x,y,1+random()*5,1+random()*2);
 }
 ctx.globalAlpha=1;ctx.fillStyle='#c4c4a6';ctx.font='bold 61px "Microsoft YaHei",sans-serif';ctx.fillText(text,40,111,944);
 ctx.fillStyle='#96a394';ctx.font='29px sans-serif';ctx.fillText(sub,42,181,940);
 const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;
 const material=new T.MeshStandardMaterial({map:texture,roughness:.68,metalness:.28,emissive:'#354136',emissiveMap:texture,emissiveIntensity:.12});
 const geometry=new T.PlaneGeometry(width,width/4);const root=new T.Mesh(geometry,material);
 const rimMaterial=new T.MeshStandardMaterial({color:'#253532',metalness:.7,roughness:.53});
 const backGeometry=new T.BoxGeometry(width+.04,width/4+.04,.032);const back=new T.Mesh(backGeometry,rimMaterial);back.position.z=-.025;root.add(back);
 const boltGeometry=new T.CylinderGeometry(.015,.015,.009,8);boltGeometry.rotateX(Math.PI/2);
 for(const x of [-width/2+.045,width/2-.045])for(const y of [-width/8+.035,width/8-.035]){const bolt=new T.Mesh(boltGeometry,rimMaterial);bolt.position.set(x,y,.008);root.add(bolt);}
 return{root,dispose(){geometry.dispose();backGeometry.dispose();boltGeometry.dispose();material.dispose();rimMaterial.dispose();texture.dispose();}};
}
