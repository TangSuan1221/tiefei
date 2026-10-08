import * as THREE from 'three';

// A shallow pressure flange: all optical pixels remain the live observation feed.
// The eight-sided silhouette avoids the former thick, pale circular bumper.
function outline(rx:number,ry:number):THREE.Vector2[]{
  return [[-.66,1],[.66,1],[1,.65],[1,-.53],[.64,-1],[-.64,-1],[-1,-.53],[-1,.65]]
    .map(([x,y])=>new THREE.Vector2(x!*rx,y!*ry));
}
function loop(points:THREE.Vector2[]){return new THREE.Shape(points.slice().reverse());}
function plate(rx:number,ry:number,innerX:number,innerY:number,depth:number){
  const shape=loop(outline(rx,ry));
  shape.holes.push(new THREE.Path(outline(innerX,innerY)));
  return new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.0015,bevelThickness:.001,bevelSegments:2,steps:1});
}
function patina(){
  const c=document.createElement('canvas');c.width=c.height=512;
  const ctx=c.getContext('2d')!;const data=ctx.createImageData(512,512);
  let seed=47291;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
    const i=(y*512+x)*4;
    const grain=random()*29;
    const hash=(a:number,b:number)=>{let n=Math.imul(a+913,374761393)^Math.imul(b+617,668265263);n=Math.imul(n^(n>>>13),1274126177);return (n>>>0)/4294967295;};
    const noise=(scale:number)=>{const px=x/scale,py=y/scale,ix=Math.floor(px),iy=Math.floor(py);let u=px-ix,v=py-iy;u=u*u*(3-2*u);v=v*v*(3-2*v);return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v;};
    const stain=noise(61)*.52+noise(19)*.30+noise(5)*.18;
    const rust=Math.max(0,stain-.39)*90;
    data.data[i]=49+grain+rust;data.data[i+1]=44+grain-rust*.31;data.data[i+2]=37+grain-rust*.51;data.data[i+3]=255;
  }
  ctx.putImageData(data,0,0);
  for(let i=0;i<330;i++){
    ctx.strokeStyle=i%4?'rgba(12,17,16,.28)':'rgba(176,162,128,.24)';ctx.lineWidth=.35+random();
    const x=random()*512,y=random()*512;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+random()*19,y+random()*3);ctx.stroke();
  }
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(2,2);map.anisotropy=4;
  return map;
}

export function buildPortholeArt(group:THREE.Group,screen:THREE.Mesh,w:number,h:number):THREE.Texture[]{
  const rx=w*.5,ry=h*.5;
  const aperture=new THREE.ShapeGeometry(loop(outline(rx,ry)),1);
  const pos=aperture.attributes.position,uv=aperture.attributes.uv;
  // Preserve the old window's 720px square crop within its 1024px source canvas.
  for(let i=0;i<uv.count;i++)uv.setXY(i,.5+pos.getX(i)/w*720/1024,.5+pos.getY(i)/h);
  screen.geometry.dispose();screen.geometry=aperture;
  const map=patina();
  const steel=new THREE.MeshStandardMaterial({color:0x817d70,map,roughness:.93,metalness:.24,bumpMap:map,bumpScale:.0016});
  const gasket=new THREE.MeshStandardMaterial({color:0x080e0e,roughness:.92,metalness:.04});
  const lip=new THREE.MeshStandardMaterial({color:0x55554b,map,roughness:.82,metalness:.42});
  const bulkheadMaterial=new THREE.MeshStandardMaterial({color:0x657064,map,roughness:.88,metalness:.25,bumpMap:map,bumpScale:.002});
  const bulkhead=new THREE.Mesh(new THREE.BoxGeometry(2.18,1.66,.012),bulkheadMaterial);
  bulkhead.position.set(0,-.15,-.081);bulkhead.receiveShadow=true;group.add(bulkhead);
  // Corrugations belong to the pressure wall behind the window, never the
  // clickable glass or screen faces. Their shadows give the flat panel depth.
  const ribMaterial=new THREE.MeshStandardMaterial({color:0x252d27,map,roughness:.82,metalness:.38});
  for(let x=-1.06;x<=1.06;x+=.028){
    const rib=new THREE.Mesh(new THREE.BoxGeometry(.009,1.61,.011),ribMaterial);
    rib.position.set(x,-.15,-.069);rib.receiveShadow=true;group.add(rib);
  }
  const apronY=-ry-.096;
  const apron=new THREE.Mesh(new THREE.BoxGeometry(w+.16,.12,.013),steel);
  apron.position.set(0,apronY,-.047);apron.receiveShadow=true;group.add(apron);
  const redLens=new THREE.MeshPhysicalMaterial({color:0x4e0c05,emissive:0xcf2108,emissiveIntensity:.31,roughness:.19,metalness:.08,clearcoat:1,clearcoatRoughness:.12});
  for(const side of [-1,1]){
    const lampX=side*(rx+.025),lampY=apronY+.038;
    const base=new THREE.Mesh(new THREE.CylinderGeometry(.018,.022,.010,20),lip);
    base.position.set(lampX,lampY-.023,.004);group.add(base);
    const lens=new THREE.Mesh(new THREE.CapsuleGeometry(.012,.025,5,16),redLens);
    lens.position.set(lampX,lampY,.004);group.add(lens);
    for(const dx of [-.012,.012]){
      const guard=new THREE.Mesh(new THREE.CylinderGeometry(.0016,.0016,.045,6),lip);
      guard.position.set(lampX+dx,lampY,.011);group.add(guard);
    }
    const cap=new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,.003,16),lip);
    cap.position.set(lampX,lampY+.023,.004);group.add(cap);
    const glow=new THREE.PointLight(0xff3518,.055,.31,2);
    glow.position.set(lampX,lampY,.035);group.add(glow);
  }
  const nameplate=new THREE.Mesh(new THREE.BoxGeometry(.102,.020,.001),lip);
  nameplate.position.set(0,apronY+.020,-.039);group.add(nameplate);
  for(let row=0;row<3;row++){
    const etch=new THREE.Mesh(new THREE.PlaneGeometry(row===0?.057:.074,.0008),gasket);
    etch.position.set(-.007,apronY+.026-row*.004,-.0382);group.add(etch);
  }
  for(const x of [-.26,-.047,.047,.26]){
    const screw=new THREE.Mesh(new THREE.CircleGeometry(.0023,10),lip);
    screw.position.set(x,apronY+.003,-.039);group.add(screw);
  }
  const outer=new THREE.Mesh(plate(rx+.052,ry+.052,rx+.008,ry+.008,.020),steel);outer.position.z=.043;outer.receiveShadow=true;group.add(outer);
  const backing=new THREE.Mesh(plate(rx+.050,ry+.050,rx+.042,ry+.042,.007),gasket);backing.position.z=.039;group.add(backing);
  const seal=new THREE.Mesh(plate(rx+.008,ry+.008,rx,ry,.003),gasket);seal.position.z=.054;group.add(seal);
  const edge=new THREE.Mesh(plate(rx+.006,ry+.006,rx+.001,ry+.001,.003),lip);edge.position.z=.058;group.add(edge);
  // A real, faint reflective glass edge, with the central optical surface open.
  // Disable raycasting explicitly: visual-only glass must never steal a click.
  const glassMaterial=new THREE.MeshPhysicalMaterial({color:0x59655c,roughness:.22,metalness:.02,transparent:true,opacity:.035,clearcoat:1,depthWrite:false});
  const glassEdge=new THREE.Mesh(plate(rx,ry,rx-.006,ry-.006,.0001),glassMaterial);
  glassEdge.position.z=.059;glassEdge.raycast=()=>{};group.add(glassEdge);
  // Recessed screw heads only; no projecting geometry over the working surfaces.
  for(const p of outline(rx+.029,ry+.029)){
    const screw=new THREE.Mesh(new THREE.CircleGeometry(.0027,12),lip);screw.position.set(p.x,p.y,.057);group.add(screw);
    const slot=new THREE.Mesh(new THREE.PlaneGeometry(.0038,.0007),gasket);slot.position.set(p.x,p.y,.0572);slot.rotation.z=p.x*4;group.add(slot);
  }
  return [map];
}

let glassWear: HTMLCanvasElement | undefined;
/** Display-only mineral film; never changes sensor frames or evidence. */
export function drawPortholeGlass(ctx:CanvasRenderingContext2D):void {
  if(!glassWear){
    const c=document.createElement('canvas');c.width=1024;c.height=720;const g=c.getContext('2d')!;
    let seed=5831;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<1900;i++){
      const x=random()*1024,y=random()*720;
      const edge=Math.max(Math.abs(x-512)/512,Math.abs(y-360)/360);
      if(edge<.70)continue;
      g.fillStyle='rgba(143,153,130,'+((edge-.70)*.26*random())+')';
      g.beginPath();g.ellipse(x,y,1+random()*10,.4+random()*3,random()*3,0,Math.PI*2);g.fill();
    }
    for(let i=0;i<48;i++){
      const x=random()*1024,y=random()*720;
      g.strokeStyle='rgba(182,193,173,'+(.018+random()*.026)+')';g.lineWidth=.3+random()*.5;
      g.beginPath();g.moveTo(x,y);g.lineTo(x+random()*28,y+random()*7);g.stroke();
    }
    // Broad weak reflection of the overhead light, deliberately no bright contour.
    g.save();g.translate(360,120);g.rotate(.45);
    const shine=g.createLinearGradient(-90,0,90,0);shine.addColorStop(0,'rgba(123,154,148,0)');shine.addColorStop(.5,'rgba(123,154,148,.035)');shine.addColorStop(1,'rgba(123,154,148,0)');g.fillStyle=shine;g.fillRect(-90,-260,180,580);g.restore();
    glassWear=c;
  }
  ctx.drawImage(glassWear,0,0);
}
