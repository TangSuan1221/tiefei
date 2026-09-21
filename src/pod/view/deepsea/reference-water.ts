import { Matrix4, PerspectiveCamera, SpotLight, Vector3, type Texture } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/** Single scattering integrated only in front of the opaque scene depth. */
export function createReferenceWater(camera: PerspectiveCamera, lamp: SpotLight, depth: Texture) {
  const pass = new ShaderPass({
    uniforms: { tDiffuse: {value:null}, tDepth: {value:depth}, inverseProjection:{value:new Matrix4()}, cameraWorld:{value:new Matrix4()}, eye:{value:new Vector3()}, lightPosition:{value:new Vector3()}, lightDirection:{value:new Vector3()}, power:{value:1} },
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`varying vec2 vUv;uniform sampler2D tDiffuse,tDepth;uniform mat4 inverseProjection,cameraWorld;uniform vec3 eye,lightPosition,lightDirection;uniform float power;
    void main(){float depth=texture2D(tDepth,vUv).r;vec4 view=inverseProjection*vec4(vUv*2.-1.,depth*2.-1.,1.);view/=view.w;float dist=min(length(view.xyz),18.);vec3 ray=normalize(mat3(cameraWorld)*view.xyz);float integral=0.;float delta=dist/16.;float jitter=fract(sin(dot(gl_FragCoord.xy,vec2(12.98,78.23)))*43758.5);
    for(int i=0;i<16;i++){float s=(float(i)+jitter)*delta;vec3 p=eye+ray*s;vec3 l=p-lightPosition;float d=length(l);float cone=smoothstep(.88,.985,dot(normalize(l),lightDirection));float density=(.25+.75*(1.-smoothstep(-1.3,-.2,p.y)))*smoothstep(1.5,3.5,s);integral+=density*cone*exp(-.13*(s+d))*delta/(1.+d*d*.14);}
    vec3 base=texture2D(tDiffuse,vUv).rgb;vec3 color=base*exp(-dist*vec3(.031,.012,.005));color+=vec3(.08,.25,.58)*integral*1.5*power;gl_FragColor=vec4(color,1.);}`,
  });
  return {pass, update(power:number){
    pass.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    pass.uniforms.cameraWorld.value.copy(camera.matrixWorld);
    pass.uniforms.eye.value.copy(camera.position);
    pass.uniforms.lightPosition.value.copy(lamp.position);
    pass.uniforms.lightDirection.value.subVectors(lamp.target.position,lamp.position).normalize();
    pass.uniforms.power.value=power;
  }};
}
