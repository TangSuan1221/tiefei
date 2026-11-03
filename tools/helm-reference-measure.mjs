import * as THREE from 'three';
import {writeFile} from 'node:fs/promises';
const matrix=new THREE.Matrix4().compose(new THREE.Vector3(.12,.88,-1.42),new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI*.31,0,0)),new THREE.Vector3(.65,.65,.65));
const corners=[[-.86,.33,.07],[.86,.33,.07],[.86,-.33,.07],[-.86,-.33,.07]].map(p=>new THREE.Vector3(...p).applyMatrix4(matrix));
const targets=[[45,145],[979,145],[1040,540],[-16,540]];
const project=v=>{const [y,z,lookY,fov]=v,c=new THREE.PerspectiveCamera(fov,1024/572,.01,20);c.position.set(.12,y,z);c.lookAt(.12,lookY,-1.42);c.updateMatrixWorld();return corners.map(p=>{const q=p.clone().project(c);return [(q.x+1)*512,(1-q.y)*286];});};
const loss=v=>{if(v[0]<1.1||v[0]>2||v[1]<-1.2||v[1]>0||v[3]<20||v[3]>80)return 1e9;return project(v).reduce((s,p,i)=>s+(p[0]-targets[i][0])**2+(p[1]-targets[i][1])**2,0);};
let v=[1.37,-.65,.96,40],steps=[.08,.08,.04,4],best=loss(v);
for(let epoch=0;epoch<90;epoch++){let changed=false;for(let j=0;j<4;j++)for(const sign of [-1,1]){const next=[...v];next[j]+=steps[j]*sign;const l=loss(next);if(l<best){v=next;best=l;changed=true;}}if(!changed)steps=steps.map(s=>s*.7);}
const result={reference:{width:1024,height:572,manualCornerTargets:targets},oldCamera:{parameters:[1.37,-.65,.96,40],projectedCorners:project([1.37,-.65,.96,40])},fittedCamera:{parameters:v,projectedCorners:project(v),rmsPixels:Math.sqrt(best/8)},note:'Manual reference landmark fit to model outer panel bounds; review camera only, does not alter gameplay camera.'};
await writeFile('qa/helm-reference-review/camera-fit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
