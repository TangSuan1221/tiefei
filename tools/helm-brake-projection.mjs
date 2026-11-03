import * as T from 'three';
import {readFileSync,writeFileSync} from 'node:fs';
const d=JSON.parse(readFileSync('qa/helm-reference-review/round15/diagnostics.json','utf8')),post=d.fit.post;
const source=readFileSync('tools/helm-reference-review.mjs','utf8');
const text=source.split('c.__reviewProject=q=>{')[1].split('};')[0];
const project=new Function('q','post',text);
const [y,z,ly,fov,lx]=d.fit.parameters,camera=new T.PerspectiveCamera(fov,1920/1080,.01,100);camera.position.set(.12,y,z);camera.lookAt(lx,ly,-1.42);camera.updateMatrixWorld();
const panel=new T.Group();panel.position.set(.12,.88,-1.42);panel.rotation.x=-Math.PI*.31;panel.scale.set(.65,.74,.65);
const brake=new T.Group();brake.position.set(-.257,-.141,.083);brake.scale.set(.92,.92*.65/.74,1);panel.add(brake);
const cap=new T.Mesh(new T.SphereGeometry(.061,64,32,0,Math.PI*2,0,Math.PI/2));cap.position.z=.034;cap.rotation.x=Math.PI/2;cap.scale.y=.48;brake.add(cap);
const result=[];for(const dz of [0,.02,.04]){cap.position.z=.034+dz;panel.updateMatrixWorld(true);let xs=[],ys=[];const p=cap.geometry.attributes.position;for(let i=0;i<p.count;i++){let q=new T.Vector3(p.getX(i),p.getY(i),p.getZ(i)).applyMatrix4(cap.matrixWorld).project(camera);const [x,y]=project(q,post);xs.push(x);ys.push(y);}const b=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];result.push({dz,bounds:b,center:[(b[0]+b[2])/2,(b[1]+b[3])/2]});}
writeFileSync('qa/helm-reference-review/round15/brake-cap-projection.json',JSON.stringify(result,null,2));console.log(result);

