/**
 * 演示用假数据
 * ============================================================================
 * Agent B/C/D 的系统还在并行开发中，所以表现层自带一套**结构完全合规**的假世界，
 * 用来独立验证渲染 / 音频 / UI。等真系统接上来，只要把这里换成真实实例即可，
 * 渲染层一行都不用改 —— 这也是「先按 contract 写死类型」的意义。
 */

import type {
  AmbientConditions, Door, ID, Prop, Room, RoomArchetype, SonarResult, StatusEffect, Vitals,
} from '../../core/contract';
import { Xoshiro } from '../../core/rng';
import { clamp01 } from '../../core/util';
import type { InventoryItem, LogEntry, DialogueModel } from '../../ui/panels';

const rng = new Xoshiro(0x4b59_1e9, 'demo-world');

const DECK_ROOMS: [RoomArchetype, string][][] = [
  [
    ['bunks', '三号铺位'], ['galley', '食堂'], ['medbay', '医务室'],
    ['corridor', '生活层主廊'], ['bulkhead', '甲一隔舱'], ['airlock', '前部气闸'],
  ],
  [
    ['engine', '主机舱'], ['reactor', '反应堆前室'], ['ballast', '压载控制'],
    ['corridor', '机械层脊廊'], ['crawlspace', '管道爬行段'], ['flooded', '淹没的泵舱'],
  ],
  [
    ['bridge', '舰桥'], ['sonar-room', '声呐室'], ['archive', '档案库'],
    ['corridor', '指挥层连廊'], ['torpedo', '鱼雷舱'], ['observation', '观测台'],
  ],
  [
    ['chapel', '礼拜堂'], ['reliquary', '圣物室'], ['observation', '朝下的窗'],
    ['corridor', '圣所回廊'], ['bulkhead', '甲四隔舱'],
  ],
  [
    ['moonpool', '月池'], ['void', '零号舱'], ['flooded', '沉没的井口'],
    ['corridor', '末端通道'],
  ],
];

function ambientFor(deck: number, archetype: RoomArchetype): AmbientConditions {
  const flooded = archetype === 'flooded' || archetype === 'moonpool';
  return {
    flooding: flooded ? rng.float(0.55, 0.95) : rng.float(0, 0.22) + deck * 0.04,
    pressure: 1 + (340 + deck * 420) / 10.06,
    temperature: 9 - deck * 1.2 - (flooded ? 3 : 0),
    airQuality: clamp01(0.95 - deck * 0.08 - (flooded ? 0.35 : 0)),
    noiseFloor: archetype === 'engine' || archetype === 'reactor' ? 0.42 : 0.08,
    presence: archetype === 'void' ? 0.95 : archetype === 'chapel' ? 0.6 : rng.float(0, 0.3),
  };
}

function makeProp(id: ID, kind: Prop['kind'], name: string): Prop {
  return {
    id,
    kind,
    name,
    concealment: rng.float(0, 0.6),
    interactions: [
      { id: `${id}.look`, label: '细看', cost: 1, noise: 0 },
      { id: `${id}.use`, label: '动它', cost: 4, noise: 3 },
    ],
    describe: (san: number) =>
      san > 45
        ? `${name}。表面覆着一层盐霜。`
        : `${name}。它刚才的位置不在这里。`,
  };
}

export function buildDemoWorld(): { rooms: Room[]; currentRoomId: ID } {
  const rooms: Room[] = [];
  const idOf = (d: number, i: number) => `r${d}_${i}`;

  for (let d = 0; d < DECK_ROOMS.length; d++) {
    const row = DECK_ROOMS[d];
    for (let i = 0; i < row.length; i++) {
      const [archetype, name] = row[i];
      const doors: Door[] = [];
      // 同层左右相邻
      if (i > 0) {
        doors.push({
          id: `${idOf(d, i)}_w`,
          to: idOf(d, i - 1),
          state: rng.weighted<Door['state']>([['open', 6], ['closed', 3], ['jammed', 1]]),
          pressureDelta: rng.float(0, 0.4),
          unstable: rng.bool(0.22),
          audioHint: rng.bool(0.3) ? '门后有水声' : undefined,
        });
      }
      if (i < row.length - 1) {
        doors.push({
          id: `${idOf(d, i)}_e`,
          to: idOf(d, i + 1),
          state: rng.weighted<Door['state']>([['open', 6], ['closed', 3], ['sealed', 1]]),
          pressureDelta: rng.float(0, 0.4),
          unstable: rng.bool(0.22),
        });
      }
      // 层间梯
      if (d < DECK_ROOMS.length - 1 && i % 3 === 1) {
        doors.push({
          id: `${idOf(d, i)}_d`,
          to: idOf(d + 1, Math.min(i, DECK_ROOMS[d + 1].length - 1)),
          state: 'closed',
          pressureDelta: rng.float(0.3, 1.2),
          unstable: rng.bool(0.4),
          lock: rng.bool(0.4) ? { kind: 'valve', requires: 'item.wrench', hint: '需要扳手' } : undefined,
        });
      }

      const props: Prop[] = [];
      const propCount = rng.int(1, 3);
      const kinds: Prop['kind'][] = ['corpse', 'terminal', 'valve', 'locker', 'logbook', 'pipe', 'porthole', 'icon'];
      for (let p = 0; p < propCount; p++) {
        const k = rng.pick(kinds);
        props.push(makeProp(`${idOf(d, i)}_p${p}`, k, PROP_NAMES[k] ?? '不明物'));
      }

      const veracity: Room['veracity'] =
        archetype === 'void' ? 'phantom' : rng.bool(0.18) ? 'unstable' : 'real';

      rooms.push({
        id: idOf(d, i),
        archetype,
        name,
        pos: { x: i * 1.0 + (d % 2) * 0.35, y: d * 1.0 },
        deck: d + 1,
        ambient: ambientFor(d, archetype),
        doors,
        props,
        visited: d <= 1 && i < 4,
        mapped: d <= 2 || (d === 3 && i < 3),
        veracity,
        noise: rng.float(0, 14),
        noiseThreshold: 24,
        tags: [archetype, `deck${d + 1}`],
      });
    }
  }

  return { rooms, currentRoomId: 'r1_3' };
}

const PROP_NAMES: Partial<Record<Prop['kind'], string>> = {
  corpse: '一具穿着教团外袍的尸体',
  terminal: '仍在供电的终端',
  valve: '主压载阀',
  locker: '被撬开的储物柜',
  logbook: '被水泡过的日志',
  pipe: '渗水的蒸汽管',
  porthole: '舷窗',
  icon: '铁制的聆听者像',
};

/** 造一次假的声呐结果 */
export function fakeSonar(rooms: readonly Room[], currentRoomId: ID, power: number): SonarResult {
  const me = rooms.find((r) => r.id === currentRoomId);
  if (!me) return { revealed: [], noise: 0, anomalies: [], artifacts: [] };
  const radius = power > 0.6 ? 7 : 3;
  const revealed: ID[] = [];
  for (const r of rooms) {
    if (r.id === currentRoomId) continue;
    const d = Math.hypot(r.pos.x - me.pos.x, (r.deck - me.deck) * 1.8);
    if (d <= radius) revealed.push(r.id);
  }
  const anomalies: { at: ID; confidence: number; signature: string }[] = [];
  const artifacts: ID[] = [];
  for (const id of revealed) {
    if (rng.bool(0.12)) {
      anomalies.push({
        at: id,
        confidence: rng.float(0.35, 0.95),
        signature: rng.pick(['大质量 · 静止', '与你同频的回响', '移动中 · 方位在变', '无法解析']),
      });
    }
    if (rng.bool(0.10 * (1 - power * 0.5))) artifacts.push(id);
  }
  return { revealed, noise: power > 0.6 ? 28 : 9, anomalies, artifacts };
}

// ----------------------------------------------------------------------------
// 生理 / UI 假数据
// ----------------------------------------------------------------------------

export function baseVitals(): Vitals {
  return {
    oxygen: 742, oxygenMax: 900,
    san: 100, sanMax: 100,
    coreTemp: 36.2,
    co2: 12,
    trauma: 8,
    infection: 0,
    fatigue: 18,
    fear: 22,
  };
}

export const DEMO_STATUSES: StatusEffect[] = [
  {
    id: 'st.cold', name: '低温', duration: 48, stacks: 1,
    tags: ['physical', 'debuff'], description: '手指开始不听话。呼吸消耗 +12%。',
  },
  {
    id: 'st.tinnitus', name: '耳鸣', duration: 22, stacks: 2,
    tags: ['mental', 'debuff'], description: '右耳有一个不属于船的频率。',
  },
  {
    id: 'st.anchored', name: '现实锚', duration: 90, stacks: 1,
    tags: ['mental', 'buff'], description: '你确认过这面镜子里的是你。',
  },
  {
    id: 'st.marked', name: '被标记', duration: -1, stacks: 1,
    tags: ['ritual', 'debuff', 'terminal'], description: '它知道你的名字了。',
  },
  {
    id: 'st.hidden-lie', name: '（不显示）', duration: 30, stacks: 1,
    tags: ['hidden'], hidden: true, description: '欺骗层用：玩家不该看到这一条。',
  },
];

export const DEMO_INVENTORY: InventoryItem[] = [
  { id: 'i.wrench', name: '管钳', kind: 'tool', count: 1, weight: 2.4, noise: 14, description: '从压载舱顺来的。够重，能撬门，也能砸开一个人的太阳穴。它在你背上会响。' },
  { id: 'i.lime', name: '碱石灰罐', kind: 'material', count: 3, weight: 0.8, noise: 2, description: '吸收二氧化碳。配合呼吸器可以把一口气拉长。教团的人管它叫「多活一刻钟」。' },
  { id: 'i.magnesium', name: '镁条', kind: 'consumable', count: 2, weight: 0.2, noise: 40, description: '点燃后能把一整个舱段照亮十秒，并且永久留在你的地图上。代价是，所有东西都会听见。' },
  { id: 'i.mirror', name: '碎镜片', kind: 'relic', count: 1, weight: 0.3, noise: 1, description: '锚定仪式的材料之一。你已经在上面看过三次自己，其中一次它眨眼比你慢。' },
  { id: 'i.tag', name: '身份牌 · V.DORN', kind: 'document', count: 1, weight: 0.05, noise: 0, description: '大副多恩的牌子。背面被人用指甲刻了四个字：别 回 答 他。' },
  { id: 'i.key-chapel', name: '礼拜堂黄铜钥匙', kind: 'key', count: 1, weight: 0.4, noise: 6, description: '齿形被改过。原来的齿被锉平，新的齿是手工开的。' },
  { id: 'i.grease', name: '油脂包', kind: 'material', count: 4, weight: 0.5, noise: 0, description: '抹在关节和鞋底上，移动噪音降低。也能盖住你身上的味道。' },
  { id: 'i.shiv', name: '磨尖的骨', kind: 'weapon', count: 1, weight: 0.6, noise: 9, description: '你不记得是在哪里捡到的。它的握持处已经被磨出了和你手掌一样的弧度。' },
];

export const DEMO_LOG: LogEntry[] = [
  {
    id: 'l1', title: '第 1 次下潜 · 值更记录', stamp: '呼吸 0044', tone: 'neutral',
    body: '压载正常。外部照明关闭以节省电力。声呐值更员报告在方位 047 有一个持续的回波，距离不变。\n舰长命令不予记录。我还是记了。',
  },
  {
    id: 'l2', title: '关于那个声音', stamp: '呼吸 0219', tone: 'eerie', unread: true,
    body: '它不是从外面来的。我把所有的换能器都关了，它还在。\n我把耳机摘了，它还在。\n我让佩勒（船员名单上没有这个孩子）把手放在我耳朵上，他说他也听得见，而且他说：「那是你在唱。」',
  },
  {
    id: 'l3', title: '给下一个我', stamp: '呼吸 0631', tone: 'whisper',
    body: '如果你在读这个，说明你又醒了一次。\n三件事：\n一，不要相信地图上那个多出来的舱。它在第四层，图纸上没有，但声呐能扫到。\n二，万斯给你的坐标会越来越准。那不是因为他在帮你。\n三，礼拜堂的门在第七次才会开。前六次你都会死。这是第四次。',
  },
  {
    id: 'l4', title: '维生系统异常', stamp: '呼吸 0812', tone: 'bad',
    body: '二号制氧机停转。备用回路读数正常，但出气口是凉的——正常运行时应该是温的。\n有人把传感器的线接到了另一台机器上。接得很仔细，用了热缩管。',
  },
  {
    id: 'l5', title: '唱诗班', stamp: '呼吸 1104', tone: 'whisper',
    body: '六具。全部面朝月池。喉部被切开了，但不是致命伤——是开口。\n我数了三遍，每次都是六具。第四遍是七具，其中一具穿着我的外套。\n我没有再数第五遍。',
  },
];

export const DEMO_DIALOGUE: DialogueModel = {
  speaker: '万斯（无线电）',
  portraitSeed: 7,
  text:
    '「……你还在听吗。好。听着，我拿到了你那一层的图。往左，第二个隔舱，把阀门转到底——不是一半，是转到底。」\n' +
    '（背景里有水声。你所在的舱段是干的。）\n' +
    '「转完之后不要回头看。我是说真的。」',
  choices: [
    { id: 'c1', label: '问他为什么知道得这么清楚', cost: 2, tooltip: '他每一次给的坐标都比上一次更准。' },
    { id: 'c2', label: '照他说的做', cost: 4 },
    { id: 'c3', label: '关掉无线电', cost: 1, irreversible: true, tooltip: '一旦关掉，这一轮回不会再响。' },
    { id: 'c4', label: '（屏息）听他背景里的水声', cost: 6, disabled: true, tooltip: '需要「聆听」知识节点。' },
  ],
  selected: 0,
};
