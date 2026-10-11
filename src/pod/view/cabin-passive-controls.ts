import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { PodRun } from '../sim/run';
import { passiveUi, sonarDeskState } from './sonar-desk';

/** Physical tuning slider and push-to-talk microphone on the passive CRT chin.
 * Chin geometry mirrors buildCrtHousing so the parts sit where its decorative buttons were. */
export function buildPassiveControls(group:THREE.Group,w:number,h:number){
  const trim=Math.max(.016,Math.min(w,h)*.07),chin=trim*2.6,cy=-h/2-chin*.56;
  const textures:THREE.Texture[]=[];
  const dark=new THREE.MeshStandardMaterial({color:0x080a08,roughness:.9});
  const steel=new THREE.MeshStandardMaterial({color:0x8a826d,metalness:.7,roughness:.45});
  const cap=new THREE.MeshStandardMaterial({color:0xc9a35a,metalness:.3,roughness:.5,emissive:0x3a2608,emissiveIntensity:.4});
  const add=(geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number,control?:string)=>{
    const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;
    if(control){m.userData.control=control;m.userData.station='nav';}
    group.add(m);return m;
  };
  const label=(text:string,width:number,height:number,x:number,y:number)=>{
    const c=document.createElement('canvas');c.width=512;c.height=64;const ctx=c.getContext('2d')!;
    ctx.fillStyle='#a5a28c';ctx.font='400 25px "Microsoft YaHei",monospace';ctx.textBaseline='middle';
    ctx.textAlign='left';ctx.fillText('35',4,32);ctx.textAlign='right';ctx.fillText('45 kHz',508,32);ctx.textAlign='center';ctx.fillText(text,256,32);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;textures.push(t);
    const m=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshStandardMaterial({map:t,transparent:true,depthWrite:false,roughness:.95}));
    m.position.set(x,y,.0605);m.raycast=()=>{};group.add(m);
  };

  // Slider occupies the left part of the chin.
  const x0=-w*.44,length=w*.60,mid=x0+length/2;
  add(new RoundedBoxGeometry(length+.012,.007,.004,2,.0015),dark,mid,cy-.003,.059);
  for(let i=0;i<=10;i++)add(new THREE.BoxGeometry(.0008,i%5?.003:.005,.001),steel,x0+length*i/10,cy+.004,.0605);
  label('调频',length+.01,(length+.01)/10,mid,cy+.011);
  const knob=new THREE.Group();group.add(knob);
  const knobBody=new THREE.Mesh(new RoundedBoxGeometry(.011,.019,.010,2,.002),cap);knobBody.position.z=.067;knob.add(knobBody);
  const knobLine=new THREE.Mesh(new THREE.BoxGeometry(.0012,.015,.001),dark);knobLine.position.z=.0725;knob.add(knobLine);
  knob.position.y=cy-.003;
  // Generous transparent hit strip so dragging tolerates small vertical drift.
  const hit=add(new THREE.BoxGeometry(length+.02,chin*.9,.014),new THREE.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}),mid,cy,.066,'sonar.slider');
  hit.userData.sliderRange=[x0,length];hit.castShadow=hit.receiveShadow=false;
  knobBody.userData.control='sonar.slider';knobBody.userData.station='nav';knobBody.userData.sliderRange=[x0,length];

  // Push-to-talk microphone on the right, where the contrast knob used to be.
  const micX=w*.355,radius=Math.min(chin*.38,.017);
  const ring=add(new THREE.CylinderGeometry(radius,radius,.006,32),dark,micX,cy,.060);ring.rotation.x=Math.PI/2;
  const g=document.createElement('canvas');g.width=g.height=128;const gx=g.getContext('2d')!;
  gx.fillStyle='#6f6858';gx.fillRect(0,0,128,128);gx.fillStyle='#0b0c0a';
  for(let y=10;y<128;y+=13)for(let x=10+(y/13%2)*6;x<128;x+=13){if(Math.hypot(x-64,y-64)<56){gx.beginPath();gx.arc(x,y,3.6,0,Math.PI*2);gx.fill();}}
  const grilleTexture=new THREE.CanvasTexture(g);grilleTexture.colorSpace=THREE.SRGBColorSpace;textures.push(grilleTexture);
  const grilleFace=new THREE.MeshStandardMaterial({map:grilleTexture,metalness:.55,roughness:.55});
  const button=new THREE.Group();button.position.set(micX,cy,0);group.add(button);
  const grille=new THREE.Mesh(new THREE.CylinderGeometry(radius*.8,radius*.84,.010,32),[steel,grilleFace,steel]);
  grille.rotation.x=Math.PI/2;grille.position.z=.066;grille.userData.control='sonar.mic';grille.userData.station='nav';button.add(grille);
  const led=new THREE.MeshStandardMaterial({color:0x3a0806,emissive:0xff2a12,emissiveIntensity:.05});
  const ledMesh=add(new THREE.SphereGeometry(.0025,12,8),led,micX-radius-.006,cy+radius*.55,.063);ledMesh.raycast=()=>{};

  return {
    textures,
    update(run:PodRun){
      const f=sonarDeskState(run).frequency;
      knob.position.x=x0+Math.max(0,Math.min(1,(f-35)/10))*length;
      const pressed=passiveUi(run).micSince!==null;
      button.position.z=pressed?-.003:0;
      led.emissiveIntensity=pressed?2.4:.05;
    },
  };
}
