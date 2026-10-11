import type {Material,WebGLRenderer,WebGLRenderTarget,ColorRepresentation} from 'three';
import type {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';

type NormalRenderer=(renderer:WebGLRenderer,material:Material,target:WebGLRenderTarget,color?:ColorRepresentation,alpha?:number)=>void;

/** The preceding RenderPass has already generated current-frame light shadows.
 * MeshNormalMaterial uses none of them; suppress only its redundant update.
 * Leave the pass unmodified if Three changes this internal entry point.
 */
export function reuseShadowsForNormalPass(pass:SSAOPass):void{
 const normalPass=pass as SSAOPass&{_renderOverride?:NormalRenderer};
 const render=normalPass._renderOverride;if(!render)return;
 normalPass._renderOverride=function(renderer,...args){
  const shadows=renderer.shadowMap,auto=shadows.autoUpdate,dirty=shadows.needsUpdate;
  shadows.autoUpdate=false;shadows.needsUpdate=false;
  try{render.call(this,renderer,...args);}
  finally{shadows.autoUpdate=auto;shadows.needsUpdate=dirty;}
 };
}
