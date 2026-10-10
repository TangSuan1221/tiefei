import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { PodRun } from '../sim/run';

/** Physical power and pulse keys on the active CRT chin, routed to the existing nav.active / nav.ping1.
 * Chin geometry mirrors buildCrtHousing so the keys sit where its decorative buttons were. */
export function buildActiveControls(group:THREE.Group,w:number,h:number){
  const trim=Math.max(.016,Math.min(w,h)*.07),chin=trim*2.6,cy=-h/2-chin*.56;
  const textures:THREE.Texture[]=[],keys:{id:string;body:THREE.Group;cap:THREE.MeshStandardMaterial;led:THREE.MeshStandardMaterial}[]=[];
  const dark=new THREE.MeshStandardMaterial({color:0x080a08,roughness:.9});
  const bw=w*.34,bh=chin*.52;
  const key=(id:string,title:string,sub:string,x:number,ledColor:number)=>{
    add(new RoundedBoxGeometry(bw+.006,bh+.006,.004,2,.0015),dark,x,cy,.059);
    const body=new THREE.Group();body.position.set(x,cy,0);body.name='crt.'+id;body.userData.control=id;body.userData.station='nav';group.add(body);
    const cap=new THREE.MeshStandardMaterial({color:0x26301f,metalness:.25,roughness:.65,emissive:0x3c5a26,emissiveIntensity:.12});
    const m=new THREE.Mesh(new RoundedBoxGeometry(bw,bh,.008,2,.002),cap);m.position.z=.064;m.castShadow=m.receiveShadow=true;m.userData.control=id;m.userData.station='nav';body.add(m);
    const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d')!;
    ctx.fillStyle='#f4ead0';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font='bold 62px "Microsoft YaHei",sans-serif';ctx.fillText(title,290,50);
    ctx.font='bold 26px monospace';ctx.fillStyle='#b8c48e';ctx.fillText(sub,290,106);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;textures.push(t);
    const face=new THREE.Mesh(new THREE.PlaneGeometry(bw*.94,bw*.94/4),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,toneMapped:false}));
    face.position.z=.0685;face.raycast=()=>{};body.add(face);
    const led=new THREE.MeshStandardMaterial({color:new THREE.Color(ledColor).multiplyScalar(.25),emissive:ledColor,emissiveIntensity:.04,toneMapped:false});
    const lens=new THREE.Mesh(new THREE.SphereGeometry(.0034,12,8),led);lens.position.set(-bw*.38,0,.0685);lens.raycast=()=>{};body.add(lens);
    keys.push({id,body,cap,led});
  };
  function add(geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;group.add(m);return m;}
  key('nav.active','声纳电源','POWER',-w*.215,0x5cff6a);
  key('nav.ping1','脉冲扫描','PULSE',w*.215,0xffa624);

  return {
    textures,
    update(run:PodRun,hovered?:string){
      for(const k of keys){
        const on=k.id==='nav.active'?run.activeSonarEnabled:run.sonarPulseEnabled;
        const usable=run.powered&&(k.id==='nav.active'||run.activeSonarEnabled);
        k.body.position.z=on?-.003:0;
        k.led.emissiveIntensity=on&&run.powered?.85:.04;
        k.cap.emissiveIntensity=hovered===k.id?.6:on?.3:usable?.12:.02;
      }
    },
  };
}
