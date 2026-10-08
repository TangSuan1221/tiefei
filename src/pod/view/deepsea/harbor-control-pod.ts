import {Group,Mesh,MeshStandardMaterial,PointLight,type BufferGeometry,type Material,type Texture} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {ReferenceMaterials} from './reference-materials';
import {setHarborPigment} from './harbor-scanned-surfaces';
/** Blender-authored lower control cabin; visual only, within the registered caisson envelope. */
export function loadHarborControlPod(parent:Group,materials:ReferenceMaterials){
 const root=new Group();root.name='rescue-blender-control-pod';root.position.set(60,-5.94,14.2);parent.add(root);
 const geometries=new Set<BufferGeometry>(),owned=new Set<Material>(),textures=new Set<Texture>();let disposed=false;
 const release=()=>{for(const g of geometries)g.dispose();for(const m of owned)m.dispose();for(const t of textures)t.dispose();geometries.clear();owned.clear();textures.clear();};
 const ready=new GLTFLoader().loadAsync('/assets/deepsea/rescue-control-pod.glb').then(gltf=>{
  gltf.scene.traverse(o=>{if(!(o instanceof Mesh))return;geometries.add(o.geometry);const original=o.material as MeshStandardMaterial;owned.add(original);for(const t of Object.values(original))if(t&&typeof t==='object'&&'isTexture'in t)textures.add(t as Texture);o.castShadow=o.receiveShadow=true;
   if(original.name==='rescue_control_glass'){original.depthWrite=false;o.castShadow=false;}
   if(original.name==='rescue_control_paint'){const finish=materials.hull.clone();setHarborPigment(finish,'#586b62');finish.roughness=.68;owned.add(finish);o.material=finish;}
  });
  if(disposed){release();return;}gltf.scene.scale.setScalar(1.2);root.add(gltf.scene);
  const interior=new PointLight('#edc58c',30,4.4,2);interior.position.set(0,1.74,.24);root.add(interior);
  root.userData.loaded=true;
 }).catch(error=>{root.userData.loadError=String(error);console.warn('Control pod Blender asset:',error);});
 return{root,ready,dispose(){disposed=true;root.removeFromParent();root.clear();release();}};
}

