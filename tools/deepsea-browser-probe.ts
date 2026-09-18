import { drawDeepseaRoom, disposeDeepseaRenderer } from '../src/pod/view/deepsea';
import type { RoomCameraInput } from '../src/pod/view/camera-room';
import type { Volume, VolumeNode } from '../src/pod/gen/volume';

// 独立测试页面：无定时循环、无游戏状态、无远程资产。
const node: VolumeNode = {
  id: 'probe', pos: { x: 0, y: 0, z: 0 }, role: 'entry', stripe: 'none', label: '测试舱室',
  size: { x: 17, y: 21, z: 9 }, obstacles: [
    { id: 'supply', kind: 'crate', pos: { x: 4, y: 0, z: 2.8 }, size: { x: 2.1, y: 1.9, z: 1.8 } },
    { id: 'tank', kind: 'tank', pos: { x: -5, y: 3.5, z: 2.2 }, size: { x: 1.8, y: 1.8, z: 3.4 } },
    { id: 'beam', kind: 'beam', pos: { x: 0, y: 2, z: -3.6 }, size: { x: 8, y: .6, z: .65 } },
    { id: 'column', kind: 'column', pos: { x: 5.8, y: 5.3, z: 0 }, size: { x: 1.2, y: 1.2, z: 8 } },
    { id: 'pipe', kind: 'pipe', pos: { x: -7.8, y: 0, z: -2.5 }, size: { x: .7, y: 6, z: .6 } },
  ],
};
const vol = {
  id: 'probe-volume', act: 1, nodes: [node, { ...node, id: 'exit', pos: { x: 0, y: 30, z: 0 }, obstacles: [] }],
  edges: [{ id: 'exit-door', from: 'probe', to: 'exit', kind: 'lateral', length: 30 }],
} as unknown as Volume;
const input: RoomCameraInput = {
  vol, nodeId: node.id, eye: { pos: { x: 0, y: -6, z: .5 }, yaw: 12, pitch: 12 },
  zoom: 1, light: 1, corruption: 0, time: 23,
  marks: [{ obstacleId: 'supply', seal: 'bone', label: '补给容器' }],
};
const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const ctx = canvas.getContext('2d')!;
const status = document.querySelector<HTMLElement>('#status')!;
function draw() {
  const start = performance.now();
  const ok = drawDeepseaRoom(ctx, canvas.width, canvas.height, input);
  const elapsed = performance.now() - start;
  status.textContent = `${ok ? 'WebGL已绘制' : 'WebGL降级'} · ${elapsed.toFixed(2)}ms · 程序网格验证，非Blender成品`;
  return { ok, elapsed };
}
document.querySelector('#draw')!.addEventListener('click', () => { input.light = 1; draw(); });
document.querySelector('#dark')!.addEventListener('click', () => { input.light = 0; draw(); });
document.querySelector('#dispose')!.addEventListener('click', () => { disposeDeepseaRenderer(); status.textContent = '已释放'; });
Object.assign(window, { deepseaProbe: { input, draw, dispose: disposeDeepseaRenderer, canvas } });
draw();
