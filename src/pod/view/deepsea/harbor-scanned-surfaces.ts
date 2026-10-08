import {RepeatWrapping,SRGBColorSpace,NoColorSpace,TextureLoader,DataTexture,RGBAFormat,LinearFilter,LinearMipmapLinearFilter,type Texture,type MeshStandardMaterial,type ColorRepresentation} from 'three';

/** Scans already contain measured pigment darkness. Preserve the tint's RGB
 * ratios while reducing its second albedo attenuation, in linear material color.
 * Texture color space, roughness and metallic response remain untouched. */
export function setHarborPigment(material:MeshStandardMaterial,color:ColorRepresentation){
 material.color.set(color);
 if(!material.map?.userData.scan)return;
 const peak=Math.max(material.color.r,material.color.g,material.color.b);
 if(peak<.015)return; // Intentional near-black coatings retain their identity.
 const lifted=Math.min(1,.42+.50*Math.sqrt(peak));
 material.color.multiplyScalar(Math.max(1,lifted/peak));
}

/** Local CC0 scans. See public/assets/deepsea/pbr/sources.json for provenance. */
type Surface={map:Texture;normalMap:Texture;roughnessMap:Texture};
let shared:{paint:Surface;deck:Surface;paintWetness:DataTexture;textures:Texture[];references:number}|null=null;
export function acquireHarborScans(){
 if(typeof document==='undefined')return null;
 if(!shared){
  const textures:Texture[]=[],loader=new TextureLoader();
  function load(id:string,channel:string,repeat:number,onReady?:(t:Texture)=>void){
   const t=loader.load(`/assets/deepsea/pbr/${id}_${channel}_2k.jpg`,texture=>{texture.userData.ready=true;onReady?.(texture);},undefined,error=>{t.userData.failed=true;console.warn('Harbor scan failed',id,channel,error);});
   t.name=`harbor.scan.${id}.${channel}`;t.userData.scan=true;t.colorSpace=channel==='diff'?SRGBColorSpace:NoColorSpace;
   t.wrapS=t.wrapT=RepeatWrapping;t.repeat.set(repeat,repeat);t.anisotropy=8;textures.push(t);return t;
  }
  // Smooth regions of the measured scan carry a thin water film; oxidised,
  // rough regions remain dry. No independent cloud texture or albedo changes.
  const size=512,wetData=new Uint8Array(size*size*4),paintWetness=new DataTexture(wetData,size,size,RGBAFormat);
  paintWetness.name='harbor.scan.paint.wetness';paintWetness.colorSpace=NoColorSpace;paintWetness.wrapS=paintWetness.wrapT=RepeatWrapping;
  paintWetness.repeat.set(.5,.5);paintWetness.magFilter=LinearFilter;paintWetness.minFilter=LinearMipmapLinearFilter;paintWetness.generateMipmaps=true;paintWetness.anisotropy=8;paintWetness.flipY=true;paintWetness.needsUpdate=true;textures.push(paintWetness);
  function deriveWetness(scan:Texture){
   const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d')!;
   ctx.drawImage(scan.image as HTMLImageElement,0,0,size,size);const pixels=ctx.getImageData(0,0,size,size).data;
   for(let i=0;i<pixels.length;i+=4){const smooth=Math.max(0,Math.min(1,(.92-pixels[i+1]/255)/.62));const film=Math.round(smooth*smooth*(3-2*smooth)*255);wetData[i]=wetData[i+1]=wetData[i+2]=film;wetData[i+3]=255;}
   paintWetness.needsUpdate=true;
  }
  const surface=(id:string,repeat:number,wet=false):Surface=>({map:load(id,'diff',repeat),normalMap:load(id,'nor_gl',repeat),roughnessMap:load(id,'rough',repeat,wet?deriveWetness:undefined)});
  shared={paint:surface('rusty_metal_sheet',.5,true),deck:surface('metal_plate',2),paintWetness,textures,references:0};
 }
 const value=shared;value.references++;let released=false;
 return{paint:value.paint,deck:value.deck,paintWetness:value.paintWetness,release(){if(released)return;released=true;value.references--;if(value.references===0){value.textures.forEach(t=>t.dispose());if(shared===value)shared=null;}}};
}
