import { Matrix4, PerspectiveCamera, SpotLight, Vector2, Vector3, type Texture } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** Single scattering integrated only in front of the opaque scene depth. */
export function createReferenceWater(camera: PerspectiveCamera, lamp: SpotLight, depth: Texture, harborKeys:SpotLight[] = []) {
  // Harbor shadow shafts use midpoint integration: per-pixel random starts
  // produce coarse stippled patches when the film exposes the dark shaft.
  const pass = new ShaderPass({
    uniforms: { tDiffuse: {value:null}, tDepth: {value:depth}, inverseProjection:{value:new Matrix4()}, cameraWorld:{value:new Matrix4()}, eye:{value:new Vector3()}, lightPosition:{value:new Vector3()}, lightDirection:{value:new Vector3()}, lightCone:{value:new Vector2()}, lightRange:{value:32}, lightColor:{value:lamp.color.clone()}, power:{value:1}, harbor:{value:harborKeys.length?1:0}, keyPosition:{value:[new Vector3(),new Vector3()]}, keyDirection:{value:[new Vector3(),new Vector3()]}, keyPower:{value:[0,0]}, keyCone:{value:[new Vector2(.83,.97),new Vector2(.83,.97)]}, shadow0:{value:null},shadow1:{value:null},shadowReady:{value:new Vector2()},shadowMatrix:{value:[new Matrix4(),new Matrix4()]} },
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`
    #include <packing>
    varying vec2 vUv;uniform sampler2D tDiffuse,tDepth;uniform highp sampler2DShadow shadow0,shadow1;uniform mat4 inverseProjection,cameraWorld,shadowMatrix[2];uniform vec3 eye,lightPosition,lightDirection;uniform float power,harbor,lightRange;uniform vec2 lightCone;uniform vec3 lightColor;uniform vec3 keyPosition[2],keyDirection[2];uniform vec2 keyCone[2],shadowReady;uniform float keyPower[2];
    float visibility(vec3 p,int k){
      if((k==0?shadowReady.x:shadowReady.y)<.5)return 1.;
      vec4 projected=shadowMatrix[k]*vec4(p,1.);vec3 uv=projected.xyz/projected.w;
      if(projected.w<=0.||uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.||uv.z>1.)return 0.;
      uv.z-=.001;
      return k==0?texture(shadow0,uv):texture(shadow1,uv);
    }
    void main(){float depth=texture2D(tDepth,vUv).r;vec4 view=inverseProjection*vec4(vUv*2.-1.,depth*2.-1.,1.);view/=view.w;float dist=min(length(view.xyz),lightRange+2.);vec3 ray=normalize(mat3(cameraWorld)*view.xyz);float integral=0.;float delta=dist/32.;float jitter=harbor>.5?.5:fract(sin(dot(gl_FragCoord.xy,vec2(12.98,78.23)))*43758.5);
    for(int i=0;i<32;i++){float s=(float(i)+jitter)*delta;vec3 p=eye+ray*s;vec3 l=p-lightPosition;float d=length(l);float cone=smoothstep(lightCone.x,lightCone.y,dot(l/max(d,.001),lightDirection));float density=(.75+.25*sin(p.x*2.1+p.y*1.7)*sin(p.z*1.3))*(harbor>.5?smoothstep(1.8,5.5,s):smoothstep(.25,1.2,s));float rangeFade=pow(clamp(1.-pow(d/lightRange,4.),0.,1.),2.);integral+=density*cone*rangeFade*exp(-.13*(s+d))*delta/(1.+d*d*.14);}
    vec3 base=texture2D(tDiffuse,vUv).rgb;vec3 color=base*exp(-dist*vec3(.031,.012,.005));color+=lightColor*vec3(.68,.83,.88)*integral*1.5*power;
    if(harbor>.5){float path=min(length(view.xyz),48.);float stepSize=path/64.;float shafts=0.;for(int j=0;j<64;j++){float s=(float(j)+jitter)*stepSize;vec3 p=eye+ray*s;for(int k=0;k<2;k++){vec3 l=p-keyPosition[k];float d=length(l);float cone=smoothstep(keyCone[k].x,keyCone[k].y,dot(normalize(l),keyDirection[k]));if(cone>.001){float amount=cone*exp(-.045*s-.10*d)*stepSize*keyPower[k]/(1.+d*d*.08);shafts+=visibility(p,k)*amount;}}}color+=vec3(.16,.24,.23)*shafts*.11;}
    gl_FragColor=vec4(color,1.);}`,
  });
  // ShaderPass clones uniforms; a render-target depth attachment must remain the original texture.
  pass.uniforms.tDepth.value=depth;
  // Match the living deck's shadow-aware medium: a closed bulkhead must stop
  // the searchlight shaft as well as its surface illumination.
  pass.uniforms.lampShadow = {value: null};
  pass.uniforms.lampShadowReady = {value: 0};
  pass.uniforms.lampShadowMatrix = {value: new Matrix4()};
  pass.material.fragmentShader = pass.material.fragmentShader
    .replace('#include <packing>', `#include <packing>
      uniform highp sampler2DShadow lampShadow;
      uniform float lampShadowReady;
      uniform mat4 lampShadowMatrix;
      float lampVisibility(vec3 p) {
        if(lampShadowReady < .5) return 1.;
        vec4 q = lampShadowMatrix * vec4(p, 1.);
        vec3 uv = q.xyz / q.w;
        if(q.w <= 0. || uv.x < 0. || uv.x > 1. || uv.y < 0. || uv.y > 1. || uv.z > 1.) return 0.;
        return texture(lampShadow, vec3(uv.xy, uv.z - .0005));
      }`)
    .replace('integral+=density*cone*', 'integral+=density*cone*lampVisibility(p)*');
  // The scene pass creates/updates these maps earlier in this same composer
  // frame. Sampling them with a matrix copied before that pass causes a stale
  // projection on turns, mode changes and the first shadow-map allocation.
  const render=pass.render;
  pass.render=function(...args:Parameters<ShaderPass['render']>){
    const lampDepth=lamp.shadow.map?.depthTexture;
    pass.uniforms.lampShadowReady.value=lampDepth?1:0;
    pass.uniforms.lampShadow.value=lampDepth??null;
    pass.uniforms.lampShadowMatrix.value.copy(lamp.shadow.matrix);
    for(let i=0;i<2;i++){
      const key=harborKeys[i],depth=key?.shadow.map?.depthTexture;
      pass.uniforms.shadowReady.value.setComponent(i,depth?1:0);
      pass.uniforms[i===0?'shadow0':'shadow1'].value=depth??null;
      if(key)pass.uniforms.shadowMatrix.value[i].copy(key.shadow.matrix);
    }
    return render.apply(this,args);
  };
  return {pass, update(power:number){
    pass.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    pass.uniforms.cameraWorld.value.copy(camera.matrixWorld);
    pass.uniforms.eye.value.copy(camera.position);
    pass.uniforms.lightPosition.value.copy(lamp.position);
    pass.uniforms.lightDirection.value.subVectors(lamp.target.position,lamp.position).normalize();
    pass.uniforms.power.value=lamp.intensity>0?power:0;
    pass.uniforms.lightCone.value.set(Math.cos(lamp.angle),Math.cos(lamp.angle*(1-lamp.penumbra)));
    pass.uniforms.lightRange.value=lamp.distance>0?lamp.distance:48;
    pass.uniforms.lightColor.value.copy(lamp.color);
    for(let i=0;i<2;i++){const key=harborKeys[i];if(!key)continue;pass.uniforms.keyPosition.value[i].copy(key.position);pass.uniforms.keyDirection.value[i].subVectors(key.target.position,key.position).normalize();pass.uniforms.keyPower.value[i]=Math.min(key.intensity/230,3);pass.uniforms.keyCone.value[i].set(Math.cos(key.angle),Math.cos(key.angle*(1-key.penumbra)));}
  }};
}
