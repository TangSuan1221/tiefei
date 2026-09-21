import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, PerspectiveCamera, Points, ShaderMaterial, SpotLight, Vector3 } from 'three';

/** Sparse suspended sediment in the actual light cone, depth-tested against the facility. */
export function createExpeditionAtmosphere(){
  let seed=90317;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const positions=new Float32Array(3600*3),sizes=new Float32Array(3600);for(let i=0;i<positions.length;i++)positions[i]=(random()-.5)*32;
  for(let i=0;i<sizes.length;i++)sizes[i]=i%29===0?-1:.65+random()*1.6;
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setAttribute('flakeSize',new Float32BufferAttribute(sizes,1));
  const material=new ShaderMaterial({transparent:true,depthWrite:false,blending:AdditiveBlending,uniforms:{clock:{value:0},eye:{value:new Vector3()},lampPosition:{value:new Vector3()},lampDirection:{value:new Vector3()},power:{value:1}},
    vertexShader:`uniform float clock;uniform vec3 eye;attribute float flakeSize;varying vec3 world;varying float bubble;void main(){bubble=step(flakeSize,0.);vec3 p=position;p.y+=clock*mix(-.028,.23,bubble);p.x+=sin(clock*.25+position.z)*.24;p.z+=cos(clock*.19+position.x)*.12;world=eye+mod(p-eye+16.,32.)-16.;vec4 v=viewMatrix*vec4(world,1.);gl_Position=projectionMatrix*v;gl_PointSize=clamp(mix(10.*flakeSize,24.,bubble)/max(.5,-v.z),.65,6.);}`,
    fragmentShader:`uniform vec3 lampPosition,lampDirection;uniform float power;varying vec3 world;varying float bubble;void main(){float d=length(world-lampPosition);float c=smoothstep(.76,.98,dot(normalize(world-lampPosition),lampDirection));float r=length(gl_PointCoord-.5);float disc=1.-smoothstep(.06,.5,r);float ring=smoothstep(.23,.34,r)*(1.-smoothstep(.35,.49,r));float a=mix(disc,ring,bubble)*c*.34*power*exp(-d*.07);gl_FragColor=vec4(.57,.75,.77,a);}`});
  const root=new Points(geometry,material);root.name='underwater-suspended-sediment';root.frustumCulled=false;
  return{root,update(time:number,camera:PerspectiveCamera,lamp:SpotLight){material.uniforms.clock.value=time;material.uniforms.eye.value.copy(camera.position);material.uniforms.lampPosition.value.copy(lamp.position);material.uniforms.lampDirection.value.subVectors(lamp.target.position,lamp.position).normalize();material.uniforms.power.value=lamp.intensity>0?1:0;},dispose(){geometry.dispose();material.dispose();root.removeFromParent();}};
}
