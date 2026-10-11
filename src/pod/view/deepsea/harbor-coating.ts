import type {MeshStandardMaterial} from 'three';

/** Broad surviving coating, seam runoff and small chips. The scan remains the
 * exposed substrate instead of covering every square metre in identical rust. */
export function harborCoating(material:MeshStandardMaterial, equipment=false){
 material.name=`harbor.${equipment?'equipment-enamel':'pressure-shell-coating'}`;
 material.roughness=equipment?.82:.9;
 material.metalness=equipment?.16:.12;
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 harborSurface;')
   .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nharborSurface=(modelMatrix*vec4(transformed,1.)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 harborSurface;
float hHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float hNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hHash(i),hHash(i+vec2(1,0)),f.x),mix(hHash(i+vec2(0,1)),hHash(i+vec2(1,1)),f.x),f.y);}
`).replace('#include <map_fragment>',`#include <map_fragment>
 // Project on the dominant wall plane, keeping runoff vertical and metre-sized.
 vec3 hN=abs(normalize(cross(dFdx(harborSurface),dFdy(harborSurface))));
 vec2 hUV=hN.y>.65?harborSurface.xz:vec2(hN.x>hN.z?harborSurface.z:harborSurface.x,harborSurface.y);
 float hMacro=hNoise(hUV*.43+17.);
 float hMeso=hNoise(hUV*3.7);
 // Oxidation originates at the welded sheet joints, with short gravity tails.
 // No broad thresholded noise islands across otherwise intact pressure plate.
 vec2 hSheet=abs(fract((hUV+vec2(.37,.65))/vec2(3.,2.))- .5)*vec2(3.,2.);
 float hVertical=1.-smoothstep(.009,.035,hSheet.x);
 float hHorizontal=1.-smoothstep(.006,.022,hSheet.y);
 float hSeam=max(hVertical,hHorizontal*.3);
 float hCorrosionRun=smoothstep(.4,.8,hNoise(hUV*vec2(.8,1.7)+11.));
 float hEdge=(1.-smoothstep(.025,.13,hSheet.x))*hCorrosionRun;
 float hChip=hEdge*smoothstep(.35,.72,hMeso*.5+hNoise(hUV*39.)*.5);
 float hDrip=smoothstep(.61,.8,hNoise(hUV*vec2(9.4,.45)))*(.3+.7*hMacro);
 float hGrain=hNoise(hUV*91.);
 vec3 hEnamel=diffuse*(.36+.10*hMacro+.025*hGrain);
 hEnamel*=1.-hDrip*(hN.y>.65?.08:.22);
 diffuseColor.rgb=mix(hEnamel,diffuseColor.rgb,clamp(.34+hChip*.66,0.,1.));
 diffuseColor.rgb*=1.-hSeam*.14;
`);
 };
 material.customProgramCacheKey=()=>`harbor-coating-1-${equipment}`;
 material.needsUpdate=true;
}
