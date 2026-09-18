/** Blender 首关的真实 WebGL 视觉试制入口。独立于正式七关进度，不发放物资。 */
import { Mesh, Raycaster, Vector3 } from 'three';
import { createPreviewCollision } from './preview-collision';
import { loadBlenderRoom, type LoadedBlenderRoom } from './blender-room';
import { drawDeepseaRoom, disposeDeepseaRenderer } from './index';
import type { RoomCameraInput } from '../camera-room';
import type { Volume, VolumeNode } from '../../gen/volume';

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const ctx = canvas.getContext('2d', { alpha: false })!;
const status = document.querySelector<HTMLElement>('#status')!;
const error = document.querySelector<HTMLElement>('#error')!;
const keys = new Set<string>();
const ray = new Raycaster();
const position = new Vector3(0, 0, 8);
const node: VolumeNode = {
  id: 'l01.processing', label: '三号采矿区·破口处理大厅', role: 'entry', stripe: 'none',
  pos: { x: 0, y: 0, z: 0 }, size: { x: 18, y: 22, z: 8 }, obstacles: [],
};
const vol = { id: 'blender-l01-preview', act: 0, nodes: [node], edges: [] } as unknown as Volume;
const input: RoomCameraInput = {
  vol, nodeId: node.id, eye: { pos: { x: 0, y: -8, z: 0 }, yaw: 0, pitch: 0 },
  zoom: 1, light: 1, corruption: 0, time: 0,
};
let asset: LoadedBlenderRoom | null = null;
let surfaces: Mesh[] = [];
let canMove: ReturnType<typeof createPreviewCollision> = () => false;
let stopped = false, frameId = 0, previous = 0, drag = false;
let frozen = new URLSearchParams(location.search).has('still');
function resize() {
  const scale = Math.min(devicePixelRatio || 1, 1.25);
  canvas.width = Math.round(canvas.clientWidth * scale);
  canvas.height = Math.round(canvas.clientHeight * scale);
}
function reset() {
  position.set(0, 0, 8);
  input.eye.yaw = input.eye.pitch = 0;
  input.light = 1;
  keys.clear();
}
function syncEye() {
  input.eye.pos = { x: position.x, y: -position.z, z: -position.y };
}
function step(dt: number) {
  if (keys.has('arrowleft')) input.eye.yaw -= 38 * dt;
  if (keys.has('arrowright')) input.eye.yaw += 38 * dt;
  if (keys.has('arrowup')) input.eye.pitch -= 30 * dt;
  if (keys.has('arrowdown')) input.eye.pitch += 30 * dt;
  input.eye.pitch = Math.max(-75, Math.min(75, input.eye.pitch));
  const yaw = input.eye.yaw * Math.PI / 180, pitch = input.eye.pitch * Math.PI / 180;
  const forward = new Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const right = new Vector3(Math.cos(yaw), 0, Math.sin(yaw));
  const direction = forward.multiplyScalar(Number(keys.has('w')) - Number(keys.has('s')))
    .addScaledVector(right, Number(keys.has('d')) - Number(keys.has('a')));
  direction.y += Number(keys.has('e')) - Number(keys.has('q'));
  if (direction.lengthSq() > 0) {
    direction.normalize();
    const distance = Math.min(dt, 0.05) * 2.1;
    // 导出的墙体/设备包围盒做连续段检测，射线补充装饰网格的近距阻挡。
    // 门后短廊由同一布局定义；不再在大厅Z=-10.1处用隐形墙挡住真门洞。
    const next = position.clone().addScaledVector(direction, distance);
    ray.set(position, direction); ray.near = 0; ray.far = distance + 0.85;
    const hit = ray.intersectObjects(surfaces, false)[0];
    if (!hit && canMove(position, next)) position.copy(next);
  }
  syncEye();
}
function draw() {
  syncEye();
  const before = performance.now();
  const ok = drawDeepseaRoom(ctx, canvas.width, canvas.height, input);
  status.textContent = ok
    ? 'Blender 实景 · W/S 前后，A/D 横移，Q/E 升降，方向键或拖动转头，L 灯 · 视觉预览不结算物资'
    : 'WebGL 不可用，当前无法显示 Blender 场景。';
  return { ok, elapsed: performance.now() - before };
}
function frame(now: number) {
  if (stopped) return;
  const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
  previous = now;
  if (!frozen) { input.time += dt; step(dt); }
  draw();
  frameId = requestAnimationFrame(frame);
}
function cleanup() {
  if (stopped) return;
  stopped = true;
  cancelAnimationFrame(frameId);
  keys.clear();
  disposeDeepseaRenderer();
  asset?.dispose();
}
window.addEventListener('resize', resize);
window.addEventListener('blur', () => { keys.clear(); drag = false; });
document.addEventListener('visibilitychange', () => { keys.clear(); });
window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (['w', 's', 'a', 'd', 'q', 'e', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'l'].includes(key)) {
    event.preventDefault(); keys.add(key);
    if (key === 'l' && !event.repeat) input.light = input.light ? 0 : 1;
  }
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
canvas.addEventListener('pointerdown', event => { drag = true; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener('pointerup', () => { drag = false; });
canvas.addEventListener('pointercancel', () => { drag = false; });
canvas.addEventListener('pointermove', event => {
  if (!drag) return;
  input.eye.yaw += event.movementX * 0.12;
  input.eye.pitch = Math.max(-75, Math.min(75, input.eye.pitch + event.movementY * 0.12));
});
document.querySelector('#reset')!.addEventListener('click', reset);
window.addEventListener('pagehide', cleanup, { once: true });
resize();
try {
  const layoutResponse = await fetch('/assets/deepsea/l01-layout.json');
  if (!layoutResponse.ok) throw new Error(`首关布局加载失败：HTTP ${layoutResponse.status}`);
  canMove = createPreviewCollision(await layoutResponse.json());
  asset = await loadBlenderRoom('/assets/deepsea/l01-processing.glb');
  asset.root.updateMatrixWorld(true);
  asset.root.traverse(object => {
    if (object instanceof Mesh && object.visible) surfaces.push(object);
  });
  // 仅安装在独立试制房间；不能把整关模型覆盖到任意随机房间。
  asset.install(node.id, geometry => geometry.half.x === 9 && geometry.half.y === 11 && geometry.half.z === 4);
  Object.assign(window, {
    deepseaProbe: {
      input, position, draw, canvas,
      setPose: (x: number, y: number, z: number, yaw: number, pitch: number) => {
        frozen = true; position.set(x, y, z); input.eye.yaw = yaw; input.eye.pitch = pitch; return draw();
      },
      stats: { objects: asset.objects, bounds: asset.bounds },
    },
  });
  frameId = requestAnimationFrame(frame);
} catch (cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  status.textContent = '首关模型尚未就绪';
  error.style.display = 'block';
  error.textContent = `无法载入 Blender 首关资产。\n${message}\n此页面不会用程序方块冒充已经制作完成的模型。`;
  cleanup();
}
