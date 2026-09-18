import {
  ACESFilmicToneMapping, Color, Group, PCFShadowMap,
  PerspectiveCamera, PointLight, Scene, SpotLight, Vector3, WebGLRenderer,
  type Points, type BufferGeometry, type ShaderMaterial,
} from 'three';
import type { RoomCameraInput } from '../camera-room';
import { basisOf, buildRoom, type RoomGeometry } from '../roomview';
import { configureCamera, toThree } from './camera';
import { createRoomMesh, disposeRoomMesh, roomSourceSignature } from './geometry';
import { createMaterials, type DeepseaMaterials } from './materials';
import { createParticles } from './particles';
import { createMarks, disposeMarks, drawAim, markSignature } from './marks';
import { assetRevision, createAssetDetails, type DeepseaAssetLease } from './assets';
import { DeepseaWater } from './water';

export { setDeepseaAssetFactory } from './assets';
export type { DeepseaAssetFactory, DeepseaAssetContext, DeepseaAssetLease } from './assets';

interface RendererState {
  renderer: WebGLRenderer;
  canvas: HTMLCanvasElement;
  scene: Scene;
  camera: PerspectiveCamera;
  lamp: SpotLight;
  spill: PointLight;
  materials: DeepseaMaterials;
  water: DeepseaWater;
  root: Group | null;
  particles: Points<BufferGeometry, ShaderMaterial> | null;
  marks: Group | null;
  asset: DeepseaAssetLease | null;
  geo: RoomGeometry | null;
  geometryKey: string;
  marksKey: string;
  assetVersion: number;
  width: number;
  height: number;
  lost: boolean;
  onLost: (event: Event) => void;
}

let state: RendererState | null = null;
let disabled = false;
const lampForward = new Vector3();
const lampUp = new Vector3();
const fogColor = new Color();
const clamp01 = (v: number) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;

function initialize(): RendererState | null {
  if (disabled || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  // 单实例、WebGL2失败后不逐帧重试。dispose 后调用者可显式重建。
  const context = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: 'high-performance' });
  if (!context) { disabled = true; return null; }
  let renderer: WebGLRenderer | null = null;
  let materials: DeepseaMaterials | null = null;
  let water: DeepseaWater | null = null;
  try {
    renderer = new WebGLRenderer({ canvas, context, alpha: false, antialias: true });
    renderer.setPixelRatio(1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    const scene = new Scene();
    scene.background = new Color('#020608');
    // 深度消光与受阴影约束的散射统一由water完成，避免重复雾化和全景提亮。
    scene.fog = null;
    const camera = new PerspectiveCamera();
    const lamp = new SpotLight('#dce9df', 0, 27, 0.72, 0.62, 1.65);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.camera.near = 0.12;
    lamp.shadow.camera.far = 30;
    lamp.shadow.bias = -0.0008;
    lamp.shadow.normalBias = 0.065;
    const spill = new PointLight('#849b96', 0, 6.2, 2);
    // 舱体附近的真实衰减光源，不是全景环境光；低分辨率阴影防止隔箱照亮。
    spill.castShadow = true;
    spill.shadow.mapSize.set(128, 128);
    spill.shadow.camera.near = .15;
    spill.shadow.camera.far = 6.2;
    spill.shadow.bias = -.001;
    spill.shadow.normalBias = .055;
    scene.add(lamp, lamp.target, spill);
    materials = createMaterials();
    water = new DeepseaWater();
    const s: RendererState = {
      renderer, canvas, scene, camera, lamp, spill, materials, water,
      root: null, particles: null, marks: null, asset: null, geo: null,
      geometryKey: '', marksKey: '', assetVersion: -1, width: 0, height: 0, lost: false,
      onLost: () => { s.lost = true; },
    };
    // 不阻止默认丢失行为，不自动抢占第二个context；下一帧切回软件绘制。
    // Three 对着色器编译错误通常只写控制台，不抛异常；也必须进入软件降级。
    renderer.debug.onShaderError = () => { s.lost = true; };
    canvas.addEventListener('webglcontextlost', s.onLost);
    return s;
  } catch {
    materials?.dispose();
    water?.dispose();
    renderer?.dispose();
    context.getExtension('WEBGL_lose_context')?.loseContext();
    disabled = true;
    return null;
  }
}

function releaseRoom(s: RendererState): void {
  if (s.root) { s.scene.remove(s.root); disposeRoomMesh(s.root); s.root = null; }
  if (s.marks) { s.scene.remove(s.marks); disposeMarks(s.marks); s.marks = null; }
  if (s.particles) {
    s.water.setParticles(null);
    s.scene.remove(s.particles);
    s.particles.geometry.dispose();
    s.particles.material.dispose();
    s.particles = null;
  }
  if (s.asset) {
    s.scene.remove(s.asset.root);
    const asset = s.asset;
    s.asset = null;
    try { asset.dispose(); } catch { /* 第三方资产释放失败不能阻止核心资源释放。 */ }
  }
  s.geo = null;
  s.geometryKey = '';
  s.marksKey = '';
}

function releaseState(s: RendererState): void {
  s.canvas.removeEventListener('webglcontextlost', s.onLost);
  releaseRoom(s);
  s.materials.dispose();
  s.water.dispose();
  s.lamp.shadow.dispose();
  s.spill.shadow.dispose();
  s.scene.clear();
  s.renderer.renderLists.dispose();
  s.renderer.dispose();
  if (!s.renderer.getContext().isContextLost()) s.renderer.forceContextLoss();
  s.canvas.width = s.canvas.height = 1;
}

/** 离开会话时释放GPU/CPU资源；也允许用户显式重试失效的WebGL。 */
export function disposeDeepseaRenderer(): void {
  if (state) { releaseState(state); state = null; }
  disabled = false;
}

/**
 * 同步绘制到调用者已平移/裁剪的2D矩形；true 才表示完成 WebGL render + drawImage。
 * false 时调用原 drawRoomCamera。没有资源URL、后台循环、碰撞或游戏状态写入。
 */
export function drawDeepseaRoom(ctx: CanvasRenderingContext2D, w: number, h: number, input: RoomCameraInput): boolean {
  if (disabled || !Number.isFinite(w) || !Number.isFinite(h) || w < 8 || h < 8) return false;
  const eye = input.eye;
  if (![eye.pos.x, eye.pos.y, eye.pos.z, eye.yaw, eye.pitch].every(Number.isFinite)) return false;
  const node = input.vol.nodes.find(n => n.id === input.nodeId);
  if (!node) return false;
  try {
    const s = state ?? (state = initialize());
    if (!s) return false;
    if (s.lost || s.renderer.getContext().isContextLost()) {
      releaseState(s); state = null; disabled = true; return false;
    }
    const key = roomSourceSignature(input.vol, node);
    const revision = assetRevision();
    if (s.geometryKey !== key || s.assetVersion !== revision) {
      releaseRoom(s);
      s.geo = buildRoom(input.vol, node);
      s.root = createRoomMesh(s.geo, s.materials);
      s.scene.add(s.root);
      s.particles = createParticles(s.geo, s.lamp);
      s.water.setParticles(s.particles);
      // 默认工厂为空；仅显式注册已解码资产后执行。
      s.asset = createAssetDetails(s.geo);
      if (s.asset) {
        s.scene.add(s.asset.root);
        if (s.asset.replaceRoom) s.root.visible = false;
      }
      s.geometryKey = key;
      s.assetVersion = revision;
    }
    const marksKey = markSignature(input.marks);
    if (s.marksKey !== marksKey) {
      if (s.marks) { s.scene.remove(s.marks); disposeMarks(s.marks); }
      s.marks = createMarks(s.geo!, input.marks);
      s.scene.add(s.marks);
      s.marksKey = marksKey;
    }
    // 把DPR落实为物理像素上限，避免高分屏每帧渲染数百万像素。
    const dpr = Math.min(1.5, Math.max(1, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
    const scale = Math.min(dpr, 1536 / Math.max(w, h), Math.sqrt(1_300_000 / (w * h)));
    const rw = Math.max(8, Math.round(w * scale));
    const rh = Math.max(8, Math.round(h * scale));
    if (s.width !== rw || s.height !== rh) {
      s.renderer.setSize(rw, rh, false);
      s.water.setSize(rw, rh);
      s.width = rw; s.height = rh;
    }
    configureCamera(s.camera, eye, w, h, input.zoom);
    const light = clamp01(input.light);
    const basis = basisOf(eye);
    toThree(basis.fwd, lampForward);
    toThree(basis.up, lampUp);
    s.lamp.position.copy(s.camera.position).addScaledVector(lampForward, 0.5).addScaledVector(lampUp, -0.34);
    s.lamp.target.position.copy(s.lamp.position).add(lampForward);
    s.lamp.intensity = 155 * light;
    s.lamp.distance = 23 + 4 * light;
    s.spill.position.copy(s.camera.position);
    s.spill.intensity = 0.3 + 3.4 * light;
    // 背景只是未照明水体，不能把距离雾当环境灯把整间房照亮。
    fogColor.setRGB(0.00025, 0.00065, 0.0007);
    (s.scene.background as Color).copy(fogColor);
    if (s.particles) {
      const u = s.particles.material.uniforms;
      u.clock.value = Number.isFinite(input.time) ? input.time : 0;
      u.power.value = light;
      u.pixelScale.value = rh;
      (u.lampPosition.value as Vector3).copy(s.lamp.position);
      (u.lampDirection.value as Vector3).copy(lampForward);
    }
    s.asset?.update?.(input.time, input.marks ?? []);
    s.water.render(s.renderer, s.scene, s.camera, s.lamp, light, clamp01(input.corruption));
    if (s.lost || s.renderer.getContext().isContextLost()) {
      releaseState(s); state = null; disabled = true; return false;
    }
    // 当帧立即拷贝，无需 preserveDrawingBuffer。
    ctx.drawImage(s.canvas, 0, 0, w, h);
    drawAim(ctx, w, h, input, s.geo!);
    return true;
  } catch {
    if (state) { releaseState(state); state = null; }
    disabled = true;
    return false;
  }
}
