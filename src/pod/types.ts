/**
 * 逃生舱层的共享类型。
 * ============================================================================
 * 这一层取代了原先「一块屏幕 + 一份行动清单」的外壳。玩家不再是一个在船里
 * 走动的人，而是一个被封在 KYRIE-9 三号逃生舱里的人：舱内有五个工位，
 * 舱外只有一台摄像头和一部回声雷达。
 *
 * 时间是**混合**的（见 sim/run.ts）：
 *   平静时 —— 回合制，时间只在你动手时流逝，你可以盯着雷达想多久都行；
 *   警报时 —— 实时，那东西真的在靠近，而你不能同时待在两个工位上。
 */

/**
 * 舱内五个工位。x 坐标见 sim/run.ts 的 STATION_X。
 *
 * 声呐和操舵原本是分开的两个台子，分在舱的两头。那是个错误：
 * 开船需要的方位在声呐上，几何在全息屏上，舵在同一块面板右侧。
 * 分析台夹在摄像头和领航台之间：片子冲出来之后，走几步就能上卷。
 */
export type StationId = 'life' | 'salvage' | 'radio' | 'camera' | 'lab' | 'nav';

export const STATION_ORDER: readonly StationId[] = [
  'life',
  'radio',
  'camera',
  'lab',
  'nav',
];

/** 旧打捞标识保留为兼容入口，实际只存在一个摄像打捞台。 */
export function canonicalStation(id: StationId): StationId {
  return id === 'salvage' ? 'camera' : id;
}

/** 保留原有直达键：2 和 4 都进入合并台，其他工位不改键。 */
export const STATION_KEYS: Readonly<Record<StationId, string>> = {
  life: '1', salvage: '4', radio: '3', camera: '4', lab: '5', nav: '6',
};
export function stationForKey(key: string): StationId | null {
  if (key === '2') return 'camera';
  return STATION_ORDER.find(id => STATION_KEYS[id] === key) ?? null;
}

export interface StationMeta {
  id: StationId;
  /** 工位铭牌上的中文名 */
  name: string;
  /** 铭牌上的编号，全大写 */
  code: string;
  /** 一句话说明这个工位是干什么的 */
  blurb: string;
}

export const STATIONS: Readonly<Record<StationId, StationMeta>> = {
  life: { id: 'life', name: '生命维持', code: 'LS-1', blurb: '氧气、洗涤器、电池、舱壁' },
  salvage: { id: 'salvage', name: '摄像打捞台', code: 'CAM/ARM', blurb: '实时镜头、机械臂、物资工作台' },
  radio: { id: 'radio', name: '无线电台', code: 'VHF', blurb: '和指挥员通话' },
  camera: { id: 'camera', name: '摄像打捞台', code: 'CAM/ARM', blurb: '实时镜头、机械臂、物资工作台' },
  lab: { id: 'lab', name: '分析台', code: 'LAB', blurb: '把冲好的片子送进去，拆出习性' },
  nav: { id: 'nav', name: '领航台', code: 'NAV', blurb: '回声雷达、全息几何屏、推力杆' },
};

/**
 * 玩家可见的工位指路。
 *
 * 所有「去某某台」的文案都必须走这里。手写工位名出过一次事故：
 * 铭牌上写的是「推进控制」，提示文案里却叫它「推进台」——
 * 一个游戏里根本不存在的名字，玩家在舱里来回找了半天也没找到。
 * 顺带把直达键号也报出来，因为舱比屏幕宽，工位可能就在视野外面。
 */
export function stationRef(id: StationId): string {
  const station = canonicalStation(id);
  return `${STATIONS[station].name}（按 ${STATION_KEYS[station]}）`;
}

/**
 * 一段航程的两个阶段。
 *
 * 航渡（transit）：舱在两个站点之间爬行。这一段里唯一要做的事是把舱开对方向 ——
 *   声呐上是一圈墙、一道缝，和一个越来越近的目标点。全息屏是空的。
 * 到站（site）：舱停在目标点上，这才是「关卡」。声呐仍只报回波和红点；
 *   洞穴几何在全息屏上。打捞、遭遇、决定要不要伸机械臂，都发生在这里。
 */
export type RunPhase = 'transit' | 'site';

/** 混合时钟的两种模式 */
export type ClockMode = 'calm' | 'alert';

export type LogTone = 'neutral' | 'system' | 'good' | 'bad' | 'eerie' | 'radio';

export interface PodLogLine {
  text: string;
  tone: LogTone;
  /** 写入时的呼吸计数 */
  at: number;
  /** 写入时的真实时刻，用于淡出 */
  stamp: number;
}
