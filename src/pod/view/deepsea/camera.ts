import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import type { Vec3 } from '../../gen/volume';
import { basisOf, focalFor, type Eye } from '../roomview';

/** 游戏 +X右/+Y前/+Z下 → Three +X右/+Y上/-Z前。
 * 这是反射变换，网格三角形绕序必须另行按变换后的法线修正。 */
export function toThree(p: Vec3, target = new Vector3()): Vector3 {
  return target.set(p.x, -p.z, -p.y);
}

const rotation = new Matrix4();
const right = new Vector3();
const up = new Vector3();
const back = new Vector3();

/** 光心没有任何安装偏移，也没有后处理畸变；机械臂、声呐与镜头共用光轴。 */
export function configureCamera(camera: PerspectiveCamera, eye: Eye, w: number, h: number, zoom: number): void {
  const basis = basisOf(eye);
  toThree(eye.pos, camera.position);
  toThree(basis.right, right);
  toThree(basis.up, up);
  toThree(basis.fwd, back).negate();
  rotation.makeBasis(right, up, back);
  camera.quaternion.setFromRotationMatrix(rotation);
  const z = Number.isFinite(zoom) ? Math.max(0.5, Math.min(4, zoom)) : 1;
  const focal = focalFor(Math.min(w, h), 0.58 / z);
  // 旧投影用 min(w,h)，不能直接把 .58/zoom 当竖直半FOV（竖屏会错）。
  camera.fov = 2 * Math.atan(h / (2 * focal)) * 180 / Math.PI;
  camera.aspect = w / h;
  camera.near = 0.16;
  camera.far = 120;
  camera.zoom = 1;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
