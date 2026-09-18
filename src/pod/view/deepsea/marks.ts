import { CanvasTexture, Group, Mesh, MeshStandardMaterial, SRGBColorSpace } from 'three';
import type { RoomMark, RoomCameraInput } from '../camera-room';
import { basisOf, focalFor, projectPoint, type RoomGeometry, type RoomQuad } from '../roomview';
import { quadGeometry } from './geometry';

const SEALS: Record<string, string> = {
  ember: '#a38855', bone: '#b7b9a8', blood: '#88544c', none: '#777e78',
  '警戒漆': '#a38855', '骨白编号': '#b7b9a8', '锈血标记': '#88544c', '没有漆': '#777e78',
};

export function markSignature(marks: readonly RoomMark[] | undefined): string {
  // 翻找进度和瞄准每帧可变，只在HUD中画；不能触发每帧纹理重建。
  return JSON.stringify(marks?.map(m => [m.obstacleId, m.seal, m.label]) ?? []);
}

/** 铭牌只能取输入中真实存在的标记，不凭障碍类型杜撰可翻找内容。 */
export function createMarks(geo: RoomGeometry, marks: readonly RoomMark[] | undefined): Group {
  const root = new Group();
  root.name = 'deepsea.actual-container-labels';
  for (const mark of marks ?? []) {
    if (!mark.seal && !mark.label) continue;
    const faces = geo.quads.filter(q => q.obstacleId === mark.obstacleId);
    if (!faces.length) continue;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.fillStyle = '#303b3a';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#87908a';
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, 246, 118);
    if (mark.seal) {
      ctx.fillStyle = SEALS[mark.seal] ?? '#899086';
      ctx.fillRect(15, 16, 226, 22);
    }
    ctx.fillStyle = '#c3c7b7';
    ctx.font = '500 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((mark.label ?? '').slice(0, 16), 128, 79, 224);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const material = new MeshStandardMaterial({
      map: texture, roughness: 0.9, metalness: 0.12,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    for (const face of faces) {
      const patch: RoomQuad = {
        ...face,
        pts: face.pts.map(p => ({
          x: face.center.x + (p.x - face.center.x) * 0.52,
          y: face.center.y + (p.y - face.center.y) * 0.52,
          z: face.center.z + (p.z - face.center.z) * 0.52,
        })),
      };
      const geometry = quadGeometry(patch);
      const uv = geometry.getAttribute('uv');
      const v = [[0, 1], [1, 1], [1, 0], [0, 0]];
      for (let i = 0; i < 4; i++) uv.setXY(i, v[i][0], v[i][1]);
      const mesh = new Mesh(geometry, material);
      mesh.receiveShadow = true;
      mesh.name = `mark.${face.id}`;
      root.add(mesh);
    }
  }
  return root;
}

export function disposeMarks(root: Group): void {
  const materials = new Set<MeshStandardMaterial>();
  root.traverse(o => {
    if (o instanceof Mesh) {
      o.geometry.dispose();
      materials.add(o.material as MeshStandardMaterial);
    }
  });
  for (const material of materials) {
    material.map?.dispose();
    material.dispose();
  }
  root.clear();
}

/** 无扭曲的屏幕操作标记，位置与机械手实际命中点一致。 */
export function drawAim(ctx: CanvasRenderingContext2D, w: number, h: number, input: RoomCameraInput, geo: RoomGeometry): void {
  const basis = basisOf(input.eye);
  const zoom = Number.isFinite(input.zoom) ? Math.max(0.5, Math.min(4, input.zoom)) : 1;
  const vp = { cx: w / 2, cy: h / 2, focal: focalFor(Math.min(w, h), 0.58 / zoom) };
  for (const mark of input.marks ?? []) {
    if (!mark.aimed) continue;
    const obstacle = geo.obstacles.find(o => o.id === mark.obstacleId);
    if (!obstacle) continue;
    const target = mark.aimPoint ?? obstacle.pos;
    const p = projectPoint(target, basis, vp);
    if (!p.ok || p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue;
    const r = Math.max(9, Math.min(22, Math.min(w, h) * 0.045));
    ctx.save();
    ctx.strokeStyle = '#b1b5a7';
    ctx.lineWidth = 1.2;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(p.x + sx * r, p.y + sy * r * .55);
      ctx.lineTo(p.x + sx * r, p.y + sy * r);
      ctx.lineTo(p.x + sx * r * .55, p.y + sy * r);
      ctx.stroke();
    }
    const distance = Math.hypot(target.x - input.eye.pos.x, target.y - input.eye.pos.y, target.z - input.eye.pos.z);
    ctx.font = `${Math.max(10, Math.min(14, h * .025))}px sans-serif`;
    ctx.fillStyle = '#c2c6b8';
    ctx.textAlign = 'center';
    ctx.fillText(`${mark.aimPoint ? '箱面' : '中心'} ${distance.toFixed(1)}m${mark.passes !== undefined ? ` · 翻过 ${mark.passes}` : ''}`, p.x, Math.min(h - 12, p.y + r + 20));
    ctx.restore();
  }
}
