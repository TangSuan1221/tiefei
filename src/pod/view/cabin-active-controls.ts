import * as THREE from 'three';

import type { PodRun } from '../sim/run';

/** Physical power and pulse keys on the active CRT chin, routed to the existing nav.active / nav.ping1.
 * Chin geometry mirrors buildCrtHousing so the keys sit where its decorative buttons were. */
export function buildActiveControls(group:THREE.Group,w:number,h:number){
  const trim=Math.max(.016,Math.min(w,h)*.07),chin=trim*2.6,cy=-h/2-chin*.56;
  const textures:THREE.Texture[]=[],keys:{id:string;body:THREE.Group;cap:THREE.MeshStandardMaterial;led:THREE.MeshStandardMaterial}[]=[];
  const dark=new THREE.MeshStandardMaterial({color:0x080a08,roughness:.9});
  const radius=chin*.25;
  const key=(id:string,title:string,sub:string,x:number,ledColor:number)=>{
    const collar=new THREE.MeshStandardMaterial({color:0x77786b,metalness:.8,roughness:.48});
    const ring=add(new THREE.CylinderGeometry(radius+ .003,radius+.004,.006,32),collar,x,cy,.061);ring.rotation.x=Math.PI/2;
    const socket=add(new THREE.CylinderGeometry(radius+.001,radius+.001,.007,32),dark,x,cy,.064);socket.rotation.x=Math.PI/2;
    const body=new THREE.Group();body.position.set(x,cy,0);body.name='crt.'+id;body.userData.control=id;body.userData.station='nav';group.add(body);
    const cap=new THREE.MeshStandardMaterial({color:id==='nav.active'?0x242b24:0x65513a,metalness:.15,roughness:.64,emissive:0x34382b,emissiveIntensity:0});
    const m=new THREE.Mesh(new THREE.CylinderGeometry(radius*.86,radius*.94,.010,32),cap);m.rotation.x=Math.PI/2;m.position.z=.068;m.castShadow=m.receiveShadow=true;m.userData.control=id;m.userData.station='nav';body.add(m);
    const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d')!;
    ctx.fillStyle='#b4b29a';ctx.textAlign='left';ctx.textBaseline='middle';
    ctx.font='400 48px "Microsoft YaHei",sans-serif';ctx.fillText(title,8,40);
    ctx.font='400 28px monospace';ctx.fillStyle='#949580';ctx.fillText(sub,8,88);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;textures.push(t);
    const face=new THREE.Mesh(new THREE.PlaneGeometry(w*.25,w*.25/4),new THREE.MeshStandardMaterial({map:t,transparent:true,depthWrite:false,roughness:.95}));
    face.position.set(x+radius+w*.135,cy,.0605);face.raycast=()=>{};group.add(face);
    const led=new THREE.MeshStandardMaterial({color:new THREE.Color(ledColor).multiplyScalar(.25),emissive:ledColor,emissiveIntensity:.04,toneMapped:false});
    const lens=new THREE.Mesh(new THREE.SphereGeometry(.0018,12,8),led);lens.position.set(0,0,.073);lens.raycast=()=>{};body.add(lens);
    keys.push({id,body,cap,led});
  };
  function add(geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;group.add(m);return m;}
  key('nav.active','声纳电源','POWER',-w*.39,0x5cff6a);
  key('nav.ping1','脉冲扫描','PULSE',w*.08,0xffa624);

  return {
    textures,
    update(run:PodRun,hovered?:string){
      for(const k of keys){
        const on=k.id==='nav.active'?run.activeSonarEnabled:run.sonarPulseEnabled;
        const usable=run.powered&&(k.id==='nav.active'||run.activeSonarEnabled);
        k.body.position.z=on?-.003:0;
        k.led.emissiveIntensity=on&&run.powered?.85:.04;
        k.cap.emissiveIntensity=hovered===k.id&&usable?.12:0;
      }
    },
  };
}
