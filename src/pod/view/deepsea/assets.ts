import type { Group } from 'three';
import type { RoomGeometry } from '../roomview';
import { toThree } from './camera';

/** 后续 Blender / GLB 场景的显式注入点；此模块不会发起 URL 请求或生成付费资产。
 * 调用者先自行解码真实存在的 GLB，再从它创建独占资源。
 * 当前交付仅使用程序网格，不是 Blender 成品。 */
export interface DeepseaAssetLease {
  root: Group;
  /** 仅用于布局已经与模拟几何逐项核验的完整 Blender 房间。 */
  replaceRoom?: boolean;
  update?(time: number, marks: readonly import('../camera-room').RoomMark[]): void;
  /** 必须释放自有 geometry/material/texture；不可释放调用者共享的原始GLB。 */
  dispose(): void;
}

export interface DeepseaAssetContext {
  /** 唯一几何真相；不得新增门、箱、尸体或可交互物，也不得遮住任何 door 面。 */
  geometry: RoomGeometry;
  /** 游戏坐标转换。GLB 按米制、Three 的 Y-up 输出后可直接使用。 */
  toThree: typeof toThree;
}

/** 可选的非交互表面细节。碰撞外壳一直保留；资产须限制在已有实体表面内。
 * 接入作者负责验证顶点边界与门洞；不能用未校准的整间GLB替换buildRoom。
 * 同步回调，仅可取已解码资源，严禁在每帧内加载资源。
 */
export type DeepseaAssetFactory = (context: DeepseaAssetContext) => DeepseaAssetLease | null;

let factory: DeepseaAssetFactory | null = null;
let revision = 0;

export function setDeepseaAssetFactory(next: DeepseaAssetFactory | null): void {
  factory = next;
  revision++;
}

export function assetRevision(): number { return revision; }
export function createAssetDetails(geometry: RoomGeometry): DeepseaAssetLease | null {
  return factory?.({ geometry, toThree }) ?? null;
}
