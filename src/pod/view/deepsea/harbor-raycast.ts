import {BufferGeometry,DynamicDrawUsage,InstancedMesh,Mesh,SkinnedMesh} from 'three';
import {acceleratedRaycast,CENTER,MeshBVH} from 'three-mesh-bvh';

const failed=new WeakSet<BufferGeometry>();
/** Per-mesh opt-in; never replace Three's global raycast or accelerate deforming skins. */
export function accelerateHarborMesh(mesh:Mesh):void {
 if(mesh instanceof SkinnedMesh||mesh instanceof InstancedMesh||mesh.raycast!==Mesh.prototype.raycast)return;
 const geometry=mesh.geometry,position=geometry.getAttribute('position');
 if(!position||position.count<1500||('usage' in position&&position.usage===DynamicDrawUsage)||geometry.morphAttributes.position?.length||failed.has(geometry))return;
 try{
  if(!geometry.boundsTree){
   // Preserve original triangle/index ordering used by rendering and diagnostics.
   geometry.boundsTree=new MeshBVH(geometry,{strategy:CENTER,indirect:true});
   const release=()=>{geometry.boundsTree=undefined;geometry.removeEventListener('dispose',release);};
   geometry.addEventListener('dispose',release);
  }
  mesh.raycast=acceleratedRaycast;
  mesh.userData.harborRaycastBVH=true;
 }catch(error){failed.add(geometry);console.warn('[harbor] BVH unavailable; using original triangle raycast',error);}
}
