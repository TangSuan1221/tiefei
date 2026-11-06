import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { PodRun } from '../sim/run';

/** Key travel (m) along the panel normal (Blender Z -> glTF Y); the cap sits 3.5 mm above its stem. */
const TRAVEL=.0032;

/**
 * Dedicated physical coordinate keypad (Blender asset `navigation-keyboard.glb`,
 * source `tools/blender/build-navigation-keyboard.py`). Each cap routes to the existing
 * sonar action through `userData.control`. Caps travel down on press and spring back on
 * release; `press()` reports the stroke so the caller can voice it.
 */
export function buildNavigationKeyboard(scene:THREE.Scene,textures:THREE.Texture[]){
 // Directly under the nav CRT (terminal('nav',[-.53,1.38,-1.42],.42,…) in cabin-three.ts),
 // sharing its 0.42 rad yaw so the keypad faces the same way as the screen.
 const yaw=.42;
 const root=new THREE.Group();root.name='navigation-keyboard';root.userData.deviceSide='nav';
 root.position.set(-.53+Math.sin(yaw)*.06,.905,-1.42+Math.cos(yaw)*.06);root.rotation.set(0,yaw,0);root.scale.setScalar(.88);scene.add(root);
 type Cap={mesh:THREE.Mesh;rest:number;depth:number;target:number;material:THREE.MeshStandardMaterial;releaseAt:number};
 const caps:Cap[]=[];
 let down:Cap|null=null;
 new GLTFLoader().loadAsync('/assets/deepsea/navigation-keyboard.glb').then(gltf=>{
  const shared=new Map<THREE.Material,THREE.MeshStandardMaterial>();
  gltf.scene.traverse(o=>{
   if(!(o instanceof THREE.Mesh))return;
   o.castShadow=o.receiveShadow=true;
   const m=o.material as THREE.MeshStandardMaterial;
   for(const t of [m.map,m.roughnessMap,m.metalnessMap,m.aoMap,m.normalMap])if(t&&!textures.includes(t))textures.push(t);
   if(!o.userData.control){
    // Decor-only parts must not intercept picking on the caps behind them.
    if(!/frame|bezel|plate|stem/.test(o.name))o.raycast=()=>{};
    return;
   }
   // Per-cap material so hover/press can lift one key without touching its neighbours.
   const own=m.clone();own.emissive.setHex(0x3a2a1c);own.emissiveIntensity=0;shared.set(m,own);o.material=own;
   o.userData.station='nav';
   caps.push({mesh:o,rest:o.position.y,depth:0,target:0,material:own,releaseAt:0});
  });
  root.add(gltf.scene);root.userData.loaded=true;
 }).catch(error=>{root.userData.loadError=String(error);console.warn('Navigation keyboard asset:',error);});
 const capOf=(control:string)=>caps.find(c=>c.mesh.userData.control===control);
 let last=performance.now();
 return {
  root,
  /** Physical stroke for one control; returns false when no cap carries it. */
  press(control:string,hold=true):boolean{
   const cap=capOf(control);if(!cap)return false;
   if(down&&down!==cap)down.target=0;
   cap.target=1;cap.releaseAt=hold?Infinity:performance.now()+70;down=hold?cap:null;return true;
  },
  /** Releases the held cap; returns its control id so the release can be voiced. */
  release():string|null{
   const cap=down;down=null;if(!cap)return null;
   // Hold the bottom briefly so a fast click still shows the full stroke.
   cap.releaseAt=performance.now()+40;return cap.mesh.userData.control;
  },
  update(_run:PodRun,hovered?:string){
   const now=performance.now(),dt=Math.min(.05,(now-last)/1000);last=now;
   for(const cap of caps){
    if(cap.target&&now>=cap.releaseAt)cap.target=0;
    // Fast bottom-out, slightly slower spring return with a touch of overshoot.
    const k=cap.target?1-Math.exp(-dt*90):1-Math.exp(-dt*38);
    cap.depth+=(cap.target-cap.depth)*k;
    if(!cap.target&&cap.depth<.002)cap.depth=0;
    cap.mesh.position.y=cap.rest-cap.depth*TRAVEL;
    cap.material.emissiveIntensity=hovered===cap.mesh.userData.control?.35:0;
   }
  },
 };
}
