import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { PodRun } from '../sim/run';


/** Dedicated physical coordinate console; each cap routes to the existing nav action. */
export function buildNavigationKeyboard(scene:THREE.Scene,textures:THREE.Texture[]){
 // Match the navigation CRT's yaw so the key rows sit level in its close-up.
 const root=new THREE.Group();root.name='navigation-keyboard';root.userData.deviceSide='nav';root.position.set(-.60+Math.sin(.55)*.08,1.02,-1.43+Math.cos(.55)*.08);root.rotation.order='YXZ';root.rotation.set(-.78,.12,0);root.scale.setScalar(.88);scene.add(root);
 const metal=new THREE.MeshStandardMaterial({color:0xb4b2a0,roughness:.92,metalness:.35});
 const cap=new THREE.MeshStandardMaterial({color:0x3f443a,roughness:.87,metalness:.05});
 const box=(w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material)=>{const o=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,.003),mat);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;root.add(o);return o;};
 box(.37,.253,.025,0,-.026,0,metal);
 const recess=new THREE.MeshStandardMaterial({color:0x121713,roughness:1});
 box(.345,.226,.005,0,-.026,.028,recess);
 box(.370,.008,.008,0,-.145,.029,metal);
 for(const x of [-.174,.174])for(const y of [-.14,.088]){const screw=new THREE.Mesh(new THREE.CylinderGeometry(.004,.004,.002,12),new THREE.MeshStandardMaterial({color:0x777669,metalness:.6,roughness:.6}));screw.rotation.x=Math.PI/2;screw.position.set(x,y,.027);root.add(screw);}

 // Mount entirely behind the tilted face; a horizontal shelf intersected the bottom row.
 const bracket=box(.30,.19,.018,0,-.026,-.024,metal);bracket.name='navigation-keyboard-rear-mount';
 const paint=document.createElement('canvas');paint.width=512;paint.height=512;const g=paint.getContext('2d')!;g.fillStyle='#858777';g.fillRect(0,0,512,512);let seed=981;const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};for(let i=0;i<900;i++){g.fillStyle=i%3?'rgba(22,19,13,.24)':'rgba(175,165,134,.18)';g.fillRect(rnd()*512,rnd()*512,1+rnd()*5,1+rnd()*2);}const wear=new THREE.CanvasTexture(paint);wear.colorSpace=THREE.SRGBColorSpace;textures.push(wear);metal.map=wear;metal.bumpMap=wear;metal.bumpScale=.0005;
 const label=(text:string,w:number,h:number,x:number,y:number,z:number)=>{const c=document.createElement('canvas');c.width=256;c.height=96;const ctx=c.getContext('2d')!;ctx.fillStyle='#c3baa0';ctx.font='400 52px Microsoft YaHei';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,128,48,246);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;textures.push(t);const o=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:t,transparent:true,roughness:1,emissive:0xffffff,emissiveMap:t,emissiveIntensity:.06,depthWrite:false}));o.position.set(x,y,z);o.raycast=()=>{};root.add(o);};
 const key=(id:string,text:string,x:number,y:number,w=.058)=>{const o=box(w,.045,.010,x,y+.025,.036,cap.clone());o.name=id;o.userData.control=id;o.userData.station='nav';label(text,w*.82,.030,x,y+.025,.042);return o;};
 ['1','2','3','4','5','6','7','8','9','-','0','.'].forEach((k,i)=>key('sonar.key.'+k,k,-.139+i%3*.066,.028-Math.floor(i/3)*.052));
 key('sonar.key.del','退格',.086,.028,.102);key('sonar.key.clear','清空',.086,-.024,.102);key('sonar.save','写入',.086,-.076,.102);
 key('nav.active','电源',.053,-.128,.058);key('nav.ping1','脉冲',.119,-.128,.058);
 return (_run:PodRun)=>{};
}

