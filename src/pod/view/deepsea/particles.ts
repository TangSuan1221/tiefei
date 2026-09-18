import { BufferGeometry, Float32BufferAttribute, Matrix4, Points, ShaderMaterial, Vector2, Vector3, type SpotLight } from 'three';
import type { RoomGeometry } from '../roomview';

/** 分层海雪只表示沉降物，绝不替代由游戏状态驱动的真实生物。 */
export function createParticles(geo: RoomGeometry, lamp?: SpotLight): Points<BufferGeometry, ShaderMaterial> {
  const volume = 8 * geo.half.x * geo.half.y * geo.half.z;
  const count = Math.min(560, Math.max(180, Math.round(volume * .14)));
  let seed = 17;
  for (const c of geo.nodeId) seed = Math.imul(seed, 31) + c.charCodeAt(0) | 0;
  const random = () => { seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296; };
  const position = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const diameter = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let x = 0, y = 0, z = 0;
    for (let attempt = 0; attempt < 12; attempt++) {
      x = (random() * 2 - 1) * Math.max(.1, geo.half.x - .2);
      y = (random() * 2 - 1) * Math.max(.1, geo.half.z - .2);
      z = (random() * 2 - 1) * Math.max(.1, geo.half.y - .2);
      // 一小部分沉降物集中于底部，避免所有粒子都像贴在镜头上的噪点。
      if (i % 5 === 0) y = -geo.half.z + .2 + random() * Math.min(2, geo.half.z);
      if (!geo.obstacles.some(o => Math.abs(x - o.pos.x) < o.size.x / 2 + .16
        && Math.abs(y + o.pos.z) < o.size.z / 2 + .16 && Math.abs(z + o.pos.y) < o.size.y / 2 + .16)) break;
    }
    position.set([x, y, z], i * 3);
    phases[i] = random() * Math.PI * 2;
    // 微粒/絮状颗粒/少量近景碎屑，分层来自世界尺寸与距离而不是屏幕雨点。
    diameter[i] = i % 17 === 0 ? .045 : i % 4 === 0 ? .022 : .008;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('phase', new Float32BufferAttribute(phases, 1));
  geometry.setAttribute('diameter', new Float32BufferAttribute(diameter, 1));
  const material = new ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true,
    uniforms: {
      clock: { value: 0 }, power: { value: 0 }, pixelScale: { value: 400 },
      sceneDepth: { value: null }, sceneDepthReady: { value: 0 }, screenSize: { value: new Vector2(1, 1) },
      cameraNear: { value: .16 }, cameraFar: { value: 120 },
      lampPosition: { value: new Vector3() }, lampDirection: { value: new Vector3(0, 0, -1) },
      lampShadow: { value: null }, lampShadowMatrix: { value: new Matrix4() }, shadowReady: { value: 0 },
      outerCos: { value: Math.cos(.72) }, innerCos: { value: Math.cos(.28) },
    },
    vertexShader: `
      attribute float phase;
      attribute float diameter;
      uniform float clock;
      uniform float pixelScale;
      uniform float power;
      uniform vec3 lampPosition;
      uniform vec3 lampDirection;
      uniform mat4 lampShadowMatrix;
      uniform float outerCos;
      uniform float innerCos;
      varying float alpha;
      varying vec4 shadowCoord;
      varying float softness;
      void main() {
        vec3 p = position + vec3(sin(clock * .075 + phase) * .12,
          sin(clock * .05 + phase * 2.) * .08, cos(clock * .06 + phase) * .1);
        vec4 world = modelMatrix * vec4(p, 1.);
        vec3 ray = world.xyz - lampPosition;
        float d = length(ray);
        float cone = smoothstep(outerCos, innerCos, dot(ray / max(.001, d), lampDirection));
        vec4 mv = viewMatrix * world;
        float projected = pixelScale * diameter / max(.2, -mv.z);
        softness = 1. - smoothstep(.5, 2., -mv.z);
        alpha = power * cone * .48 * exp(-d * .047) * smoothstep(.16, .6, -mv.z);
        alpha *= clamp(projected, .12, 1.);
        shadowCoord = lampShadowMatrix * world;
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(projected + softness * 2., .75, 5.5);
      }`,
    fragmentShader: `
      precision highp sampler2DShadow;
      uniform sampler2DShadow lampShadow;
      uniform float shadowReady;
      uniform sampler2D sceneDepth;
      uniform float sceneDepthReady;
      uniform vec2 screenSize;
      uniform float cameraNear;
      uniform float cameraFar;
      varying float alpha;
      varying vec4 shadowCoord;
      varying float softness;
      void main() {
        float r = length(gl_PointCoord - .5) * 2.;
        if(r > 1.) discard;
        float edgeFade = 1.;
        if (sceneDepthReady > .5) {
          float opaque = texture2D(sceneDepth, gl_FragCoord.xy / screenSize).r;
          if (gl_FragCoord.z >= opaque) discard;
          float surfaceDistance = cameraNear * cameraFar / (cameraFar - opaque * (cameraFar - cameraNear));
          float particleDistance = cameraNear * cameraFar / (cameraFar - gl_FragCoord.z * (cameraFar - cameraNear));
          edgeFade = clamp((surfaceDistance - particleDistance) / .18, 0., 1.);
        }
        vec3 sc = shadowCoord.xyz / shadowCoord.w;
        float visible = 0.;
        if(shadowReady > .5 && shadowCoord.w > 0. && sc.x >= 0. && sc.x <= 1. && sc.y >= 0. && sc.y <= 1. && sc.z <= 1.)
          visible = texture(lampShadow, vec3(sc.xy, sc.z - .0002));
        float disc = exp(-r*r * mix(2.8, 4.8, softness)) * (1. - smoothstep(.7, 1., r));
        gl_FragColor = vec4(vec3(.39,.46,.44), alpha * visible * disc * edgeFade * (1. - softness * .55));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points = new Points(geometry, material);
  points.name = 'deepsea.noninteractive-marine-snow';
  points.frustumCulled = false;
  if (lamp) points.onBeforeRender = () => {
    // shadow pass在onBeforeRender之前完成，首帧也使用当帧遮挡而非空贴图。
    const u = material.uniforms;
    u.lampShadow.value = lamp.shadow.map?.depthTexture ?? null;
    u.shadowReady.value = lamp.shadow.map?.depthTexture ? 1 : 0;
    (u.lampShadowMatrix.value as Matrix4).copy(lamp.shadow.matrix);
    u.outerCos.value = Math.cos(lamp.angle);
    u.innerCos.value = Math.cos(lamp.angle * (1 - lamp.penumbra));
  };
  return points;
}
