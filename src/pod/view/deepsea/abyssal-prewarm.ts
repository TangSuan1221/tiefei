import * as T from 'three';
/** r186 compile traverses all renderables (including hidden/off-frustum meshes).
 * Only lights use traverseVisible. No visibility/camera mutation is necessary.
 * compileAsync starts compile synchronously, then only polls program readiness.
 */
export function prewarmAbyssalMaterials(renderer:T.WebGLRenderer,scene:T.Scene,camera:T.Camera,active:()=>boolean=()=>true):Promise<void>{
 const target=renderer.getRenderTarget(),shadow=renderer.shadowMap.enabled,tone=renderer.toneMapping;
 const scratch=new T.WebGLRenderTarget(1,1,{type:T.HalfFloatType});
 let ready:Promise<unknown>;
 try{renderer.setRenderTarget(scratch);renderer.shadowMap.enabled=true;renderer.toneMapping=T.ACESFilmicToneMapping;ready=renderer.compileAsync(scene,camera);}
 finally{renderer.setRenderTarget(target);renderer.shadowMap.enabled=shadow;renderer.toneMapping=tone;scratch.dispose();}
 return ready.then(()=>active()?prewarmAbyssalUploads(renderer,scene,active):undefined).then(()=>undefined);
}

/** Upload shared GPU resources in short slices; the warm mesh never joins the game scene. */
export async function prewarmAbyssalUploads(renderer:T.WebGLRenderer,scene:T.Scene,active:()=>boolean=()=>true){
 const geometries=new Set<T.BufferGeometry>(),textures=new Set<T.Texture>();
 scene.traverse(o=>{const mesh=o as T.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);for(const material of mesh.material?(Array.isArray(mesh.material)?mesh.material:[mesh.material]):[]){for(const value of Object.values(material))if(value instanceof T.Texture&&!value.isRenderTargetTexture&&!(value instanceof T.VideoTexture))textures.add(value);if(material instanceof T.ShaderMaterial)for(const u of Object.values(material.uniforms)){if(u.value instanceof T.Texture&&!u.value.isRenderTargetTexture&&!(u.value instanceof T.VideoTexture))textures.add(u.value);}}});
 const deferredBitmaps=0;
 const scratch=new T.WebGLRenderTarget(1,1),warmScene=new T.Scene(),camera=new T.PerspectiveCamera(),material=new T.RawShaderMaterial({vertexShader:'precision highp float; attribute vec3 position; void main(){gl_Position=vec4(position*0.0000001,1.0);}',fragmentShader:'precision mediump float; void main(){gl_FragColor=vec4(0.0);}',colorWrite:false,depthWrite:false,depthTest:false,toneMapped:false,fog:false});
 const mesh=new T.Mesh(undefined,material);mesh.frustumCulled=false;warmScene.add(mesh);
 const initialGeometry=mesh.geometry;const tasks:(()=>void)[]=[...textures].map(t=>()=>renderer.initTexture(t));
 for(const geometry of geometries)tasks.push(()=>{const {start,count}=geometry.drawRange;mesh.geometry=geometry;try{geometry.setDrawRange(0,Math.min(3,geometry.index?.count??geometry.attributes.position?.count??0));renderer.render(warmScene,camera);}finally{geometry.setDrawRange(start,count);}});
 let cursor=0,slices=0,maxSliceMs=0;const worst:{task:number;ms:number;kind:string;detail:string}[]=[];const textureList=[...textures],geometryList=[...geometries];const begun=performance.now();
 try{
  for(const texture of textures){if(!active())break;const source=texture.image as HTMLImageElement|undefined;if(source&&typeof source.decode==='function')await source.decode().catch(()=>undefined);}
  const oldTarget=renderer.getRenderTarget(),oldShadow=renderer.shadowMap.enabled;let compiled:Promise<unknown>;
  try{renderer.setRenderTarget(scratch);renderer.shadowMap.enabled=false;compiled=renderer.compileAsync(warmScene,camera);}
  finally{renderer.setRenderTarget(oldTarget);renderer.shadowMap.enabled=oldShadow;}
  await compiled;
  while(cursor<tasks.length&&active()){
   await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));if(!active())break;
   const target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel(),viewport=renderer.getViewport(new T.Vector4()),scissor=renderer.getScissor(new T.Vector4()),test=renderer.getScissorTest(),auto=renderer.autoClear,shadow=renderer.shadowMap.enabled;
   const began=performance.now();
   try{renderer.setRenderTarget(scratch);renderer.autoClear=false;renderer.shadowMap.enabled=false;do{const id=cursor++,jobStart=performance.now();tasks[id]();const ms=performance.now()-jobStart;if(ms>8){const texture=textureList[id],geometry=geometryList[id-textureList.length];worst.push({task:id,ms,kind:texture?'texture':'geometry',detail:texture?`${texture.name}:${(texture.image as {width?:number})?.width}x${(texture.image as {height?:number})?.height}`:`${geometry?.name}:${geometry?.attributes.position?.count}`});}}while(cursor<tasks.length&&performance.now()-began<4);}
   finally{renderer.setRenderTarget(target,face,mip);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(test);renderer.autoClear=auto;renderer.shadowMap.enabled=shadow;}
   maxSliceMs=Math.max(maxSliceMs,performance.now()-began);slices++;
   // Poll a GPU fence with zero timeout. Never synchronously drain the upload queue.
   const gl=renderer.getContext() as WebGL2RenderingContext,fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();
   if(fence){try{while(active()){const status=gl.clientWaitSync(fence,0,0);if(status!==gl.TIMEOUT_EXPIRED)break;await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));}}finally{gl.deleteSync(fence);}}
  }
 }finally{warmScene.remove(mesh);initialGeometry.dispose();material.dispose();scratch.dispose();}
 return {geometries:geometries.size,textures:textures.size,deferredBitmaps,completed:cursor,total:tasks.length,slices,maxSliceMs,elapsedMs:performance.now()-begun,worst,cancelled:cursor<tasks.length};
}

