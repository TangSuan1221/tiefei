import { RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three';
export interface ExpeditionSurfaceMaps {map:Texture;normalMap:Texture;roughnessMap:Texture;metalnessMap:Texture}
/** Optional external CC0 material. Runtime owns these shared textures, worlds only borrow. */
export function createExpeditionSurfaceMaps(){
  const loader=new TextureLoader(),base='/assets/ambientcg/MetalPlates012/MetalPlates012_1K-JPG_';
  const load=(suffix:string,color=false)=>{const t=loader.load(`${base}${suffix}.jpg`);t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=4;if(color)t.colorSpace=SRGBColorSpace;return t;};
  const maps:ExpeditionSurfaceMaps={map:load('Color',true),normalMap:load('NormalGL'),roughnessMap:load('Roughness'),metalnessMap:load('Metalness')};
  return{maps,dispose(){Object.values(maps).forEach(t=>t.dispose());}};
}
