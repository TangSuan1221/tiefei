import {Group,Mesh,MeshStandardMaterial,type BufferGeometry,type Material,type Texture} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {ReferenceMaterials} from './reference-materials';
import {setHarborPigment} from './harbor-scanned-surfaces';
/** Visual replacement of the original shore cabinet; its original location and sign remain. */
export function loadHarborPowerCabinet(parent:Group,materials:ReferenceMaterials){
 const root=new Group();root.name='rescue-blender-power-cabinet';root.position.set(41,-.6,20.7);parent.add(root);
 root.userData.interactionId='harbor.rescue.power';
 const geometries=new Set<BufferGeometry>(),owned=new Set<Material>(),textures=new Set<Texture>();let disposed=false;
 const release=()=>{for(const g of geometries)g.dispose();for(const m of owned)m.dispose();for(const t of textures)t.dispose();geometries.clear();owned.clear();textures.clear();};
 const ready=new GLTFLoader().loadAsync('/assets/deepsea/rescue-power-cabinet.glb').then(gltf=>{
  gltf.scene.traverse(o=>{if(!(o instanceof Mesh))return;geometries.add(o.geometry);const original=o.material as MeshStandardMaterial;owned.add(original);for(const t of Object.values(original))if(t&&typeof t==='object'&&'isTexture'in t)textures.add(t as Texture);o.castShadow=o.receiveShadow=true;
   if(/rescue_power_(ochre|teal)/.test(original.name)){const finish=materials.hull.clone();setHarborPigment(finish,original.color);finish.roughness=.74;owned.add(finish);o.material=finish;}
  });if(disposed){release();return;}root.add(gltf.scene);root.userData.loaded=true;
 }).catch(error=>{root.userData.loadError=String(error);console.warn('Shore cabinet Blender asset:',error);});
 return{root,ready,dispose(){disposed=true;root.removeFromParent();root.clear();release();}};
}
