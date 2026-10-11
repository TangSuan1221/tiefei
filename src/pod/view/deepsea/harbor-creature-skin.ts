import {Group,Mesh,MeshPhysicalMaterial,MeshStandardMaterial,type BufferGeometry,type Material,type Texture} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

/** Appearance only. Parent retains pursuit, contact bounds and film visibility. */
export function createHarborCreatureSkin(monster:Group){
 const fallback=[...monster.children],root=new Group();root.name='harbor-creature-continuous-skin';monster.add(root);
 const geometry=new Set<BufferGeometry>(),materials=new Set<Material>(),textures=new Set<Texture>();let disposed=false,body:Group|undefined;
 const release=()=>{geometry.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());geometry.clear();materials.clear();textures.clear();};
 const ready=typeof window==='undefined'?Promise.resolve():new GLTFLoader().loadAsync('/assets/deepsea/harbor-creature-skin.glb').then(gltf=>{
  gltf.scene.traverse(o=>{if(!(o instanceof Mesh))return;geometry.add(o.geometry);const original=o.material as MeshStandardMaterial;materials.add(original);
   for(const v of Object.values(original))if(v&&typeof v==='object'&&'isTexture'in v)textures.add(v as Texture);
   const skin=new MeshPhysicalMaterial({color:'#a49a8b',vertexColors:true,roughness:.72,metalness:0,clearcoat:.04,clearcoatRoughness:.58});materials.add(skin);
   // Sub-millimetre skin grain changes highlights; there is no silhouette
   // displacement or random spots. Local coordinates keep it fixed to the body.
   skin.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vCreatureSkinPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvCreatureSkinPosition=position;');
    shader.fragmentShader=`varying vec3 vCreatureSkinPosition;
     float skinHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
     float skinJointMask(vec3 p,vec3 centre,float radius){return 1.0-smoothstep(radius*.25,radius,length(p-centre));}
     float skinNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
      return mix(mix(mix(skinHash(i),skinHash(i+vec3(1,0,0)),f.x),mix(skinHash(i+vec3(0,1,0)),skinHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(skinHash(i+vec3(0,0,1)),skinHash(i+vec3(1,0,1)),f.x),mix(skinHash(i+vec3(0,1,1)),skinHash(i+vec3(1,1,1)),f.x),f.y),f.z);
     }\n`+shader.fragmentShader;
    // Colour follows the authored anatomy. No noise controls albedo: dorsal
    // protection, ventral thin skin, compressed joints and the closed lip have
    // stable, smoothly bounded regions under moving lamps.
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
     vec3 skinP=vCreatureSkinPosition;
     float skinDorsal=smoothstep(.83,1.39,skinP.y)*(1.0-smoothstep(.50,1.20,abs(skinP.x)))*(1.0-smoothstep(1.33,1.80,skinP.z));
     float skinVentral=(1.0-smoothstep(.66,1.01,skinP.y))*(1.0-smoothstep(.43,.85,abs(skinP.x)));
     float skinJoints=max(skinJointMask(skinP,vec3(-.91,.58,.65),.235),skinJointMask(skinP,vec3(1.15,.58,.90),.235));
     skinJoints=max(skinJoints,max(skinJointMask(skinP,vec3(-.67,.46,-1.18),.21),skinJointMask(skinP,vec3(.67,.46,-1.18),.21)));
     skinJoints=max(skinJoints,max(skinJointMask(skinP,vec3(-1.04,.08,1.42),.15),skinJointMask(skinP,vec3(1.19,.08,1.65),.15))*.7);
     float skinCompression=skinJoints*(.40+.60*smoothstep(.10,.90,.5+.5*sin(skinP.y*102.0-skinP.z*17.0)));
     float skinLipX=skinP.x-.06;
     float skinLipU=skinLipX/.30;
     float skinLipHeight=.943-.047*skinLipU*skinLipU+.012*skinLipU;
     float skinLipDy=(skinP.y-skinLipHeight)/.021;
     float skinLip=exp(-skinLipDy*skinLipDy)*(1.0-smoothstep(.21,.31,abs(skinLipX)))*smoothstep(1.15,1.39,skinP.z);
     diffuseColor.rgb*=mix(vec3(1.0),vec3(.58,.75,.83),skinDorsal);
     float skinLuma=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
     diffuseColor.rgb=mix(diffuseColor.rgb,mix(diffuseColor.rgb,vec3(skinLuma)*vec3(1.05,1.09,1.10),.70)*1.10,skinVentral);
     diffuseColor.rgb*=mix(vec3(1.0),vec3(.62,.57,.55),skinCompression*.78);
     diffuseColor.rgb*=mix(vec3(1.0),vec3(.59,.57,.55),skinLip*.75);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
     float skinFine=skinNoise(vCreatureSkinPosition*73.0)*2.0-1.0;
     float skinBroad=skinNoise(vCreatureSkinPosition*3.2)*2.0-1.0;
     roughnessFactor=clamp(roughnessFactor+skinDorsal*.065-skinVentral*.075+skinCompression*.13+skinLip*.055+skinFine*.015+skinBroad*.018,.58,.88);`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
     float skinHeight=.00016*skinNoise(vCreatureSkinPosition*137.0);
     vec3 skinDx=dFdx(-vViewPosition),skinDy=dFdy(-vViewPosition);
     vec3 skinR1=cross(skinDy,normal),skinR2=cross(normal,skinDx);
     float skinDet=dot(skinDx,skinR1);
     vec3 skinGrad=sign(skinDet)*(dFdx(skinHeight)*skinR1+dFdy(skinHeight)*skinR2);
     normal=normalize(abs(skinDet)*normal-skinGrad);`);
   };
   skin.customProgramCacheKey=()=> 'harbor-creature-skin-v3-anatomy';o.material=skin;o.castShadow=o.receiveShadow=true;
  });
  if(disposed){release();return;}
  body=gltf.scene;root.add(body);for(const o of fallback)o.visible=false;root.userData.loaded=true;
 }).catch(error=>{root.userData.loadError=String(error);console.warn('Harbor creature skin: keeping fallback',error);});
 return{root,ready,update(time:number){if(body){const breath=Math.sin(time*1.8);body.scale.y=.997+breath*.003;}},dispose(){disposed=true;for(const o of fallback)o.visible=true;root.removeFromParent();root.clear();release();}};
}
