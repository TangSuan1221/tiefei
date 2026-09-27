import { expeditionPlan } from './expedition-layouts';
import { passageEnvelope } from './expedition-envelopes';
import { createIncidentItems } from './expedition-incidents';
import { createHarborLevel, harborRequirementName } from './harbor-level';
/** Deterministic content and progression only; proximity/collision belong to the runtime. */
export type ExpeditionPosition = [number, number];
export interface ExpeditionRoom {
  id: string; name: string; role: string; sector: number;
  x: number; z: number; width: number; depth: number;
  ceiling?: number;
  /** Driving centre absolute Y. ceiling is clear height; roof = floorY + ceiling. */
  elevation?: number;
  floorY?: number;
}
export interface ExpeditionEdge {
  id: string; from: string; to: string; width: number;
  ceiling?: number;
  /** World [x,y,z], from-room boundary to to-room boundary; reversible. */
  path?: [number, number, number][];
  lock?: string; requires?: string[];
}
export interface ExpeditionItem {
  id: string; room: string; kind: 'pickup' | 'cache' | 'terminal' | 'record' | 'exit';
  name: string; description: string; grants?: string[]; requires?: string[];
  x: number; z: number;
}
export interface ExpeditionStage {
  id: string; name: string; objectives: string[]; terminal: string; grants: string;
}
export interface ExpeditionLevel {
  id: string; index: number; name: string; description: string;
  rooms: ExpeditionRoom[]; edges: ExpeditionEdge[]; items: ExpeditionItem[];
  stages: ExpeditionStage[]; spawn: ExpeditionPosition; startRoom: string; exitRoom: string;
}
export interface ExpeditionState {
  version: 1; levelId: string;
  inventory: string[]; collected: string[]; opened: string[];
  visited: string[]; recorded: string[]; completed: boolean;
}
export interface ExpeditionResult { ok: boolean; message: string }
/** Door plane is centred in the clear gap, not between unequal room centres. */
export function expeditionDoorPosition(a:ExpeditionRoom,b:ExpeditionRoom):ExpeditionPosition {
  if(Math.abs(a.x-b.x)>.001){const s=Math.sign(b.x-a.x);return[(a.x+s*a.width/2+b.x-s*b.width/2)/2,a.z];}
  const s=Math.sign(b.z-a.z);return[a.x,(a.z+s*a.depth/2+b.z-s*b.depth/2)/2];
}
export interface ExpeditionRouteEstimate {
  roomRoute: string[]; itemOrder: string[]; distanceMeters: number; actions: number;
  travelSeconds: number; actionSeconds: number; orientationSeconds: number;
  estimatedMinutes: number; speedMetersPerSecond: number;
}

const THEMES = [
  { name: '三号采矿区·破口处理大厅', description: '事故仍然可以被相信。核对破口、矿筛与无编号回波。',
    sectors: ['破口气闸', '矿筛处理区', '下沉转运区', '出口接口'], objectives: ['破口应力记录', '矿筛隔离钥匙', '作业服标记', '设备旁路钥匙', '无编号回波', '转运授权片', '出口压差记录', '接口校验片'] },
  { name: '警戒漆分流站', description: '维护时间不对。沿旧警戒漆核验分流阀与重涂的标号。',
    sectors: ['警戒漆入口', '分流阀阵列', '旧维护侧线', '汇流出口'], objectives: ['重涂漆层', '阀位钥匙', '逆向流痕', '分流授权片', '旧维护日期', '旁路钥匙', '汇流压力表', '出站校验片'] },
  { name: '热泉计时廊', description: '预告像记忆。记录喷口周期、旧编号与充电接头。',
    sectors: ['冷端停靠区', '热泉观察区', '计时检修区', '冷却出口'], objectives: ['喷口间歇记录', '隔热授权片', '熟悉的灰港编号', '充电接头钥匙', '计时盘刻痕', '检修旁路片', '冷端水流记录', '出廊校验片'] },
  { name: '四号伪补给站', description: '指令压过眼见。逐项核对空货架、假封条与错位的补给标牌。',
    sectors: ['补给接驳区', '空货架区', '封条复核区', '站后通道'], objectives: ['空货架清单', '接驳钥匙', '重复封条', '仓储授权片', '错位补给牌', '检验钥匙', '站后拖痕', '离站校验片'] },
  { name: '永不停机的散热井', description: '设施仍在值班。记录叶轮缺口、交班牌与持续供电的机器。',
    sectors: ['散热入口', '叶轮观察区', '切割检修区', '井后转运区'], objectives: ['叶轮缺叶记录', '停机旁路片', '相反的航向牌', '切割工具', '叠层交班牌', '检修授权片', '持续供电记录', '转运校验片'] },
  { name: '井壁伴行廊', description: '自己被护送。低功率观察即可；无法辨认也是有效记录。全关无货箱。',
    sectors: ['第一观察窗', '第二观察窗', '第三观察窗', '井口停靠区'], objectives: ['鱼群距离记录', '侧灯校验', '鱼群消失记录', '窗框标号复核', '伴行轮廓：允许无法辨认', '低功率观察确认', '井口距离记录', '离开观察确认'] },
  { name: 'D-9 无垢升降井', description: '出口也在等待交接。比对驳船符号与无泥承压环；此处完成仅表示抵达承台。',
    sectors: ['粗糙检修入口', '驳船观察口', '图案锁前室', '洁净承压井'], objectives: ['驳船符号：环', '舷侧符号：叉', '舷侧符号：三线', '符号顺序复核：环／叉／三线', '完整密封记录', '承压环校验', '无泥导轨记录', '承台接头校验'] },
] as const;

export function createExpedition(index: number): ExpeditionLevel {
  if (!Number.isInteger(index) || index < 0 || index >= THEMES.length) throw new RangeError('Expedition index must be 0–6');
  const theme = THEMES[index];
  if (index === 0) return createHarborLevel();
  const prefix = `expedition.${index + 1}`;
  const rooms: ExpeditionRoom[] = [], edges: ExpeditionEdge[] = [], items: ExpeditionItem[] = [], stages: ExpeditionStage[] = [];
  const rid = (s: number, n: number) => `${prefix}.s${s}.r${n}`;
  const token = (s: number) => `${prefix}.stage${s}.ready`;
  const connect = (s: number, a: number, b: number) => edges.push({ id: `${prefix}.s${s}.door${a}-${b}`, from: rid(s, a), to: rid(s, b), ...passageEnvelope(index,s,a,b) });
  for (let s = 0; s < 4; s++) {
    const {plan,points,swap,ceiling}=expeditionPlan(index,s);
    const workCell=[[10,18],[10,10],[10,22],[10,12],[12,24],[10,18],[12,12]][index];
    points.forEach(([x, z], n) => {const size=n===1?plan.hall:n===0?plan.entry:[workCell[0]+(n===2?2:0),workCell[1]+(s%2)*2];rooms.push({ id: rid(s, n), name: `${theme.sectors[s]}·${plan.labels[n]}`,
      role: n === 6 ? 'branch' : n === 1 ? 'hall' : n === 2 ? 'control' : 'chamber', sector: s,
      x,z,width:swap?size[1]:size[0],depth:swap?size[0]:size[1],ceiling:ceiling(n) });});
    plan.links.forEach(([a,b])=>connect(s,a,b));
    if (s > 0) edges.push({ id: `${prefix}.gate${s}`, from: rid(s - 1, 2), to: rid(s, 0), ...passageEnvelope(index,s,2,0),
      lock: `${theme.sectors[s]}隔离门`, requires: [token(s - 1)] });
    const previous = s ? [token(s - 1)] : [];
    const objectives = [0, 1].map(n => `${prefix}.s${s}.objective${n}`);
    objectives.forEach((id, n) => items.push({ id, room: rid(s, n ? 5 : 6),
      kind: n && index < 5 ? 'pickup' : 'record', name: theme.objectives[s * 2 + n],
      description: n && index < 5 ? '固定放置的通行工具；取得后永久保留，不消耗。' : '停船核对实物并记录；无需等待计时器。',
      grants: [id], requires: previous, x: n ? 3 : -3, z: 2 }));
    const terminal = `${prefix}.s${s}.terminal`;
    items.push({ id: terminal, room: rid(s, 2), kind: 'terminal', name: `${theme.sectors[s]}核验终端`,
      description: '两项实物核验与上一阶段均完成后，签发永久通行许可。',
      requires: [...previous, ...objectives], grants: [token(s)], x: 3, z: -3 });
    stages.push({ id: `${prefix}.stage${s}`, name: theme.sectors[s], objectives, terminal, grants: token(s) });
    // No caches in the escort level or inside the clean shaft. Other caches are optional.
    if (index < 5 || (index === 6 && s === 1)) {
      items.push({ id: `${prefix}.s${s}.cache`, room: rid(s, 3), kind: 'cache', name: '封存检修箱',
        description: '先解开箱盖，再次操作取得检修收藏品；当前仅作库存留证，不提供维修或消耗效果。',
        grants: [`${prefix}.s${s}.optional-supply`], requires: previous, x: -3, z: -3 });
    }
    if (index === 5 && s === 0) {
      items.push({ id: `${prefix}.s${s}.optional-pickup`, room: rid(s, 3), kind: 'pickup', name: '脱落的传感器接头',
        description: '从侧室拾取的实物证据收藏品；无货箱、无隐藏威胁，不消耗资源，也不影响通行。',
        grants: [`${prefix}.sensor-connector`], x: -3, z: -3 });
    }
    items.push({ id: `${prefix}.s${s}.optional-record`, room: rid(s, 4), kind: 'record', name: `${theme.sectors[s]}环境记录`,
      description: theme.description, requires: previous, x: 2, z: Math.min(3,rooms.find(r=>r.id===rid(s,4))!.depth/2-2.65) });
  }
  items.push({ id: `${prefix}.exit`, room: rid(3, 2), kind: 'exit', name: '离开当前航段',
    description: index === 6 ? '抵达升降承台；无线电选择与结局由运行时另行衔接。' : '确认四区核验完成，驶向下一航段。',
    requires: [token(3)], x: -3, z: -3 });
  items.push(...createIncidentItems(index,rooms));
  return { id: prefix, index, name: theme.name, description: theme.description, rooms, edges, items, stages,
    spawn: [rooms[0].x, rooms[0].z], startRoom: rid(0, 0), exitRoom: rid(3, 2) };
}

export function newExpeditionState(level: ExpeditionLevel): ExpeditionState {
  return { version: 1, levelId: level.id, inventory: [], collected: [], opened: [], visited: [level.startRoom], recorded: [], completed: false };
}
const hasRequirements = (state: ExpeditionState, requires: string[] = []) => requires.every(t => state.inventory.includes(t));
const add = (array: string[], id: string) => { if (!array.includes(id)) array.push(id); };
export function canOpenDoor(level: ExpeditionLevel, state: ExpeditionState, id: string): boolean {
  const edge = level.edges.find(e => e.id === id);
  return state.version === 1 && state.levelId === level.id && !!edge && hasRequirements(state, edge.requires);
}
export function openDoor(level: ExpeditionLevel, state: ExpeditionState, id: string): ExpeditionResult {
  if (level.id === 'harbor.1' && state.levelId === level.id) {
    const missing = level.edges.find(e => e.id === id)?.requires?.filter(t => !state.inventory.includes(t)) ?? [];
    if (missing.length) return { ok: false, message: `尚缺：${missing.map(harborRequirementName).join('、')}` };
  }
  if (!canOpenDoor(level, state, id)) return { ok: false, message: '门不存在或尚缺阶段通行许可。' };
  add(state.opened, id);
  return { ok: true, message: '门已开启，通行许可仍然保留。' };
}
export function interactExpedition(level: ExpeditionLevel, state: ExpeditionState, id: string): ExpeditionResult {
  if (state.version !== 1 || state.levelId !== level.id) return { ok: false, message: '存档版本或关卡不匹配。' };
  const item = level.items.find(i => i.id === id);
  if (!item) return { ok: false, message: '未找到交互对象。' };
  if (!hasRequirements(state, item.requires)) return { ok: false, message: level.id === 'harbor.1' ? `尚缺：${(item.requires ?? []).filter(t => !state.inventory.includes(t)).map(harborRequirementName).join('、')}` : '尚缺核验条件：请完成本区两项任务及上一阶段终端。' };
  if (state.collected.includes(id)) return { ok: false, message: '此对象已完成，不会重复发放。' };
  if (item.kind === 'cache' && !state.opened.includes(id)) {
    add(state.opened, id);
    return { ok: true, message: '箱盖已打开；再次操作取出收藏品。' };
  }
  for (const grant of item.grants ?? []) add(state.inventory, grant);
  add(state.collected, id);
  if (item.kind === 'record') add(state.recorded, id);
  if (item.kind === 'exit') state.completed = true;
  return { ok: true, message: item.kind === 'exit' ? '当前航段完成。' : `${item.name}：完成。` };
}

/** A reproducible feasible route, NOT a shortest-route proof or guaranteed play duration. */
export function estimateExpeditionRoute(level: ExpeditionLevel, options: {
  includeOptional?: boolean; speedMetersPerSecond?: number; secondsPerAction?: number; secondsPerRoom?: number;
} = {}): ExpeditionRouteEstimate {
  if (level.id === 'harbor.1') throw new Error('接驳港包含曝光、分析与资源检查外部事件；旧纯交互路线估算器不适用，必须测量实际游玩路线。');
  const speed = options.speedMetersPerSecond ?? 1.6;
  const actionCost = options.secondsPerAction ?? 8;
  const roomCost = options.secondsPerRoom ?? 12;
  if (!Number.isFinite(speed) || speed <= 0 || !Number.isFinite(actionCost) || actionCost < 0 || !Number.isFinite(roomCost) || roomCost < 0) throw new RangeError('Invalid route model');
  const state = newExpeditionState(level);
  const roomRoute = [level.startRoom], itemOrder: string[] = [];
  let current = level.startRoom, distance = 0, actions = 0;
  const room = (id: string) => level.rooms.find(r => r.id === id)!;
  for (const stage of level.stages) {
    const sector = room(level.items.find(i => i.id === stage.terminal)!.room).sector;
    const targets = [...stage.objectives];
    if (options.includeOptional === true) targets.push(...level.items.filter(i => room(i.room).sector === sector &&
      (i.kind === 'cache' || i.kind === 'record' || i.kind === 'pickup') && !stage.objectives.includes(i.id)).map(i => i.id));
    targets.push(stage.terminal);
    if (stage === level.stages[level.stages.length - 1]) targets.push(level.items.find(i => i.kind === 'exit')!.id);
    for (const id of targets) {
      const item = level.items.find(i => i.id === id)!;
      const queue = [current], paths = new Map<string, ExpeditionEdge[]>([[current, []]]);
      for (let q = 0; q < queue.length && !paths.has(item.room); q++) {
        const at = queue[q];
        for (const edge of level.edges) {
          const next = edge.from === at ? edge.to : edge.to === at ? edge.from : undefined;
          if (next && !paths.has(next) && canOpenDoor(level, state, edge.id)) {
            paths.set(next, [...paths.get(at)!, edge]); queue.push(next);
          }
        }
      }
      const path = paths.get(item.room);
      if (!path) throw new Error(`Unreachable expedition item: ${id}`);
      for (const edge of path) {
        const next = edge.from === current ? edge.to : edge.from;
        distance += Math.abs(room(current).x - room(next).x) + Math.abs(room(current).z - room(next).z);
        if (!state.opened.includes(edge.id)) { openDoor(level, state, edge.id); actions++; }
        current = next; roomRoute.push(next); add(state.visited, next);
      }
      // Conservative reproducible centre -> object -> centre detour, even at the exit.
      distance += 2 * Math.hypot(item.x, item.z);
      const repeats = item.kind === 'cache' ? 2 : 1;
      for (let n = 0; n < repeats; n++) {
        const result = interactExpedition(level, state, id);
        if (!result.ok) throw new Error(result.message);
        actions++; itemOrder.push(id);
      }
    }
  }
  const travelSeconds = distance / speed, actionSeconds = actions * actionCost;
  const orientationSeconds = new Set(roomRoute).size * roomCost;
  return { roomRoute, itemOrder, distanceMeters: distance, actions, travelSeconds, actionSeconds, orientationSeconds,
    estimatedMinutes: (travelSeconds + actionSeconds + orientationSeconds) / 60, speedMetersPerSecond: speed };
}
