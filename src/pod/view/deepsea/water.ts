import {
  BufferGeometry, Camera, DepthTexture, Float32BufferAttribute, HalfFloatType,
  LinearFilter, Matrix4, Mesh, Scene, ShaderMaterial, UnsignedIntType, Vector3,
  WebGLRenderTarget, type PerspectiveCamera, type SpotLight, type WebGLRenderer,
  type Points, type Vector2,
} from 'three';

/**
 * 单次散射的低采样近似：从相机沿真实深度积分，并查询探照灯阴影。
 * 不是透明锥体；实体前只累积实体前的水，灯后的遮挡区不会自发产生光。
 * 不处理多次散射、体积密度模拟或折射，保留相机光轴和机械臂屏幕投影。
 */
export class DeepseaWater {
  private readonly target = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType, minFilter: LinearFilter, magFilter: LinearFilter,
    depthBuffer: true, stencilBuffer: false, samples: 0,
  });
  private readonly scene = new Scene();
  private readonly particleScene = new Scene();
  private particles: Points<BufferGeometry, ShaderMaterial> | null = null;
  private readonly camera = new Camera();
  private readonly geometry = new BufferGeometry();
  private readonly material: ShaderMaterial;

  constructor() {
    this.target.texture.name = 'deepsea.water.linear-scene';
    this.target.depthTexture = new DepthTexture(1, 1, UnsignedIntType);
    this.target.depthTexture.name = 'deepsea.water.visible-surface-depth';
    this.geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.material = new ShaderMaterial({
      depthTest: false, depthWrite: false,
      uniforms: {
        sceneColor: { value: this.target.texture }, sceneDepth: { value: this.target.depthTexture },
        inverseProjection: { value: new Matrix4() }, cameraWorld: { value: new Matrix4() },
        eyePosition: { value: new Vector3() }, lampPosition: { value: new Vector3() },
        lampDirection: { value: new Vector3() }, lampShadowMatrix: { value: new Matrix4() },
        lampShadow: { value: null }, shadowReady: { value: 0 }, power: { value: 0 },
        outerCos: { value: Math.cos(.72) }, innerCos: { value: Math.cos(.28) },
        density: { value: 1 },
      },
      vertexShader: `
        varying vec2 screenUV;
        void main() {
          screenUV = position.xy * .5 + .5;
          gl_Position = vec4(position, 1.);
        }`,
      fragmentShader: `
        precision highp sampler2DShadow;
        uniform sampler2D sceneColor;
        uniform sampler2D sceneDepth;
        uniform sampler2DShadow lampShadow;
        uniform mat4 inverseProjection;
        uniform mat4 cameraWorld;
        uniform mat4 lampShadowMatrix;
        uniform vec3 eyePosition;
        uniform vec3 lampPosition;
        uniform vec3 lampDirection;
        uniform float power;
        uniform float shadowReady;
        uniform float outerCos;
        uniform float innerCos;
        uniform float density;
        varying vec2 screenUV;

        float visibility(vec3 world) {
          if (shadowReady < .5) return 0.;
          vec4 projected = lampShadowMatrix * vec4(world, 1.);
          vec3 coord = projected.xyz / projected.w;
          if (projected.w <= 0. || coord.x < 0. || coord.x > 1. || coord.y < 0. || coord.y > 1. || coord.z > 1.) return 0.;
          return texture(lampShadow, vec3(coord.xy, coord.z - .00025));
        }
        void main() {
          float depth = texture2D(sceneDepth, screenUV).r;
          vec4 view = inverseProjection * vec4(screenUV * 2. - 1., depth * 2. - 1., 1.);
          view.xyz /= view.w;
          vec3 viewRay = normalize(view.xyz);
          vec3 ray = normalize(mat3(cameraWorld) * viewRay);
          float distanceToSurface = min(length(view.xyz), 28.);
          // 固定空间抖动使12步积分不出现等距亮圈，也不制造每帧闪动。
          float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
          float stepLength = distanceToSurface / 12.;
          float integral = 0.;
          for (int i = 0; i < 12; i++) {
            float t = (float(i) + .2 + jitter * .6) * stepLength;
            vec3 point = eyePosition + ray * t;
            vec3 fromLamp = point - lampPosition;
            float lightDistance = length(fromLamp);
            float cone = smoothstep(outerCos, innerCos, dot(fromLamp / max(.001, lightDistance), lampDirection));
            float lit = cone * visibility(point) / (1. + .09 * lightDistance * lightDistance);
            float transmission = exp(-density * .055 * (t + lightDistance));
            integral += lit * transmission * stepLength;
          }
          vec3 color = texture2D(sceneColor, screenUV).rgb;
          // Beer-Lambert消光，红波段比蓝绿衰减快；全场景统一处理，包括已导入GLB。
          vec3 transmission = exp(-distanceToSurface * density * vec3(.047, .030, .025));
          color *= transmission;
          color += vec3(.22, .32, .31) * integral * .024 * power * density;
          gl_FragColor = vec4(color, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const triangle = new Mesh(this.geometry, this.material);
    triangle.frustumCulled = false;
    this.scene.add(triangle);
  }

  setParticles(points: Points<BufferGeometry, ShaderMaterial> | null): void {
    this.particleScene.clear();
    this.particles = points;
    if (points) {
      this.particleScene.add(points);
      points.material.uniforms.sceneDepth.value = this.target.depthTexture;
      points.material.uniforms.sceneDepthReady.value = 1;
    }
  }

  setSize(width: number, height: number): void {
    if (this.target.width !== width || this.target.height !== height) this.target.setSize(width, height);
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera, lamp: SpotLight, power: number, corruption: number): void {
    const previous = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    try {
      // Three在普通render target上输出线性色彩，只在最终水体合成时做一次tone mapping。
      renderer.setRenderTarget(this.target);
      renderer.render(scene, camera);
      const u = this.material.uniforms;
      (u.inverseProjection.value as Matrix4).copy(camera.projectionMatrixInverse);
      (u.cameraWorld.value as Matrix4).copy(camera.matrixWorld);
      (u.eyePosition.value as Vector3).copy(camera.position);
      (u.lampPosition.value as Vector3).copy(lamp.position);
      (u.lampDirection.value as Vector3).subVectors(lamp.target.position, lamp.position).normalize();
      (u.lampShadowMatrix.value as Matrix4).copy(lamp.shadow.matrix);
      u.lampShadow.value = lamp.shadow.map?.depthTexture ?? null;
      u.shadowReady.value = lamp.shadow.map?.depthTexture ? 1 : 0;
      u.power.value = power;
      u.density.value = 1 + corruption * .4;
      u.outerCos.value = Math.cos(lamp.angle);
      u.innerCos.value = Math.cos(lamp.angle * (1 - lamp.penumbra));
      renderer.setRenderTarget(previous);
      renderer.render(this.scene, this.camera);
      // 海雪在水体之后按自身距离消光，读取同一实体深度做遮挡/软交界；
      // 避免透明粒子错误使用背后墙壁的距离被再次消光。
      if (this.particles) {
        const particleUniforms = this.particles.material.uniforms;
        (particleUniforms.screenSize.value as Vector2).set(this.target.width, this.target.height);
        particleUniforms.cameraNear.value = camera.near;
        particleUniforms.cameraFar.value = camera.far;
        renderer.autoClear = false;
        renderer.render(this.particleScene, camera);
      }
    } finally {
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(previous);
    }
  }

  dispose(): void {
    this.setParticles(null);
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.scene.clear();
  }
}
