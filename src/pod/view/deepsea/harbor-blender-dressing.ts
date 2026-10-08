import {Group,Mesh,MeshStandardMaterial,BoxGeometry,PointLight,type BufferGeometry,type Material,type Texture} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import type {ReferenceMaterials} from './reference-materials';

/** Authored in Blender through MCP; visual only, outside all playable approach lanes. */
export function loadHarborBlenderDressing(parent:Group,materials:ReferenceMaterials){
 const root=new Group();root.name='rescue-blender-service-modules';parent.add(root);
 const geometry=new Set<BufferGeometry>(),owned=new Set<Material>(),textures=new Set<Texture>();
 let disposed=false;
 const ready=new GLTFLoader().loadAsync('/assets/deepsea/rescue-pressure-service.glb').then(gltf=>{
  gltf.scene.traverse(object=>{
   if(!(object instanceof Mesh))return;
   geometry.add(object.geometry);object.castShadow=object.receiveShadow=true;
   const original=object.material as MeshStandardMaterial;owned.add(original);
   for(const value of Object.values(original))if(value&&typeof value==='object'&&'isTexture' in value)textures.add(value as Texture);
   const tag=original.name.replace('rescue_','');
   if(['paint','steel','copper','rubber'].includes(tag)){
    const finish=(tag==='paint'?materials.hull:tag==='rubber'?materials.rubber:materials.steel).clone();
    finish.color.copy(original.color);finish.roughness=tag==='rubber'?.85:.72;owned.add(finish);object.material=finish;
   }
  });
  if(disposed){release();return;}
  for(const [x,y,z,scale] of [[45,3,12.4,1],[57,1.6,7,.75],[85,8,8.4,.8]]){
   const instance=gltf.scene.clone(true);instance.position.set(x,y,z);instance.scale.setScalar(scale);root.add(instance);
  }
  const lensMaterial=new MeshStandardMaterial({color:'#c2d5ca',emissive:'#a4cbbd',emissiveIntensity:1.2,roughness:.34});owned.add(lensMaterial);
  const lensGeometry=new BoxGeometry(.6,.07,.12);geometry.add(lensGeometry);
  const lens=new Mesh(lensGeometry,lensMaterial);lens.position.set(57,1.7,8);root.add(lens);
  const housingGeometry=new BoxGeometry(.72,.16,.65);geometry.add(housingGeometry);
  const housingMaterial=materials.steel.clone();owned.add(housingMaterial);
  const housing=new Mesh(housingGeometry,housingMaterial);housing.position.set(57,1.77,7.67);housing.castShadow=housing.receiveShadow=true;root.add(housing);
  const lamp=new PointLight('#a5c6b9',18,6,2);lamp.position.set(57,1.62,8.08);root.add(lamp);
  root.userData.loaded=true;
 }).catch(error=>{root.userData.loadError=String(error);console.warn('Rescue Blender dressing:',error);});
 function release(){for(const g of geometry)g.dispose();for(const m of owned)m.dispose();for(const t of textures)t.dispose();geometry.clear();owned.clear();textures.clear();}
 return{root,ready,dispose(){disposed=true;root.removeFromParent();root.clear();release();}};
}
