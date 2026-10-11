import {readFileSync,writeFileSync} from 'node:fs';
import {Box3,Vector3,Matrix4,Quaternion} from 'three';
const paths=process.argv.slice(2);
const results=paths.map(file=>{
 const b=readFileSync(file),length=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+length)),bin=b.subarray(28+length),box=new Box3();let volume=0,triangles=0;
 const read=(a,index,component=0)=>{const v=j.bufferViews[a.bufferView],size=a.componentType===5123?2:a.componentType===5121?1:4,offset=(v.byteOffset||0)+(a.byteOffset||0)+index*(v.byteStride||size*(a.type==='VEC3'?3:1))+component*size;return a.componentType===5126?bin.readFloatLE(offset):size===4?bin.readUInt32LE(offset):size===2?bin.readUInt16LE(offset):bin.readUInt8(offset);};
 function walk(index,parent){
  const n=j.nodes[index],m=n.matrix?new Matrix4().fromArray(n.matrix):new Matrix4().compose(new Vector3(...(n.translation||[0,0,0])),new Quaternion(...(n.rotation||[0,0,0,1])),new Vector3(...(n.scale||[1,1,1])));m.premultiply(parent);
  if(n.mesh!==undefined)for(const p of j.meshes[n.mesh].primitives){
   if(p.mode!==undefined&&p.mode!==4)throw new Error('Expected triangles');
   const a=j.accessors[p.attributes.POSITION],indices=p.indices===undefined?null:j.accessors[p.indices],vertices=Array.from({length:a.count},(_,i)=>new Vector3(read(a,i,0),read(a,i,1),read(a,i,2)).applyMatrix4(m));
   for(const v of vertices)box.expandByPoint(v);
   const count=indices?indices.count:a.count;
   for(let i=0;i<count;i+=3){const ids=[0,1,2].map(k=>indices?read(indices,i+k):i+k),[v0,v1,v2]=ids.map(id=>vertices[id]);volume+=v0.dot(new Vector3().crossVectors(v1,v2))/6;triangles++;}
  }
  for(const c of n.children||[])walk(c,m);
 }
 for(const i of j.scenes[j.scene||0].nodes)walk(i,new Matrix4());
 return {file,min:box.min.toArray(),max:box.max.toArray(),signedMeshVolume:volume,absoluteSignedMeshVolume:Math.abs(volume),triangles,bytes:b.length};
});
const report={method:'All POSITION vertices transformed by GLTF node matrices. Volume is oriented triangle tetrahedral sum; not a watertightness certification.',results};
console.log(JSON.stringify(report,null,2));
if(process.env.BOUNDS_OUTPUT)writeFileSync(process.env.BOUNDS_OUTPUT,JSON.stringify(report,null,2));
