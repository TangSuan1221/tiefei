/**
 * 无线电内容：指挥员、他的走样，以及那些没人在说的话。
 * ============================================================================
 * 指挥员万斯是这一轮里唯一的另一个人。他从头到尾只是一个声音 ——
 * 这正是问题所在：一个声音无法被验证。
 *
 * 失真分三层，按 corruption 0..1 递进：
 *   0.0–0.3  他是对的。你照做，你活着。（建立信任，这是后面所有恐惧的本金）
 *   0.3–0.6  他开始说一些不该由他知道的事，语气开始不像在读稿。
 *   0.6–1.0  他报的航向会把你撞死；他会用你的声音说话。
 *
 * 文本层面的失真由 `corrupt()` 做：字符替换、卡带、重复。它不会破坏语义，
 * 只会让你不确定自己听见的是不是原话 —— 这比听不清可怕。
 */

import type { Rng } from '@/core/contract';

export type RadioSpeaker = 'beacon' | 'self' | 'nobody';

export interface RadioTopic {
  id: string;
  /** 玩家按下的那一行 */
  label: string;
  /** 回答。按 corruption 取档：[清醒, 走样, 崩坏] */
  reply: readonly [string, string, string];
  /** 需要的最低污染度才出现 */
  minCorruption?: number;
  /** 只能问一次 */
  once?: boolean;
}

export const RADIO_TOPICS: readonly RadioTopic[] = [
  {
    id: 'ask.status',
    label: '报告舱内状况',
    reply: [
      '收到。氧气够你走完全程，前提是你别慌。慌一次要多花二十口气。',
      '收到……收到。你的读数我这边也能看见。我一直能看见。',
      '我知道你的氧气。我知道你每一口气。我是跟着它们数的。',
    ],
  },
  {
    id: 'ask.heading',
    label: '请求重复航向',
    reply: [
      '重复：{HEADING}。慢速。雷达打一发确认，别嫌它吵。',
      '{HEADING}。……你为什么要我重复。你不信我了吗。',
      '{HEADING}。别扫雷达了。雷达在骗你。我不会。',
    ],
  },
  {
    id: 'ask.contact',
    label: '雷达上有东西',
    reply: [
      '多远？……好。用摄像头看清楚是什么再决定怎么做。不要瞎用物资。',
      '我看不见你那边的雷达。我从来就看不见。你为什么会以为我看得见。',
      '那不是东西。那是回声。你自己的回声。你已经喊了很久了。',
    ],
  },
  {
    id: 'ask.who',
    label: '你是哪个单位的',
    reply: [
      '万斯，灰港海事夜班调度。编号你不用记，你只要记住这个频率。',
      '灰港调度。……我的编号是。我的编号是。我的编号是。',
      '我在你后面那个格子里。我一直在。你回头就能看见我。',
      // 这一条只有 corruption 很高时才会被抽到
    ],
    once: false,
  },
  {
    id: 'ask.survivors',
    label: '还有别人活着吗',
    reply: [
      '目前登记到的只有你。别为这个分心。',
      '有。有很多。他们都在同一个频率上，只是你听不见他们。',
      '有七个。他们手挽着手。你见过他们了。',
    ],
    minCorruption: 0.25,
  },
  {
    id: 'ask.self',
    label: '我是谁',
    reply: [
      '……三号舱，重复你最后一句。',
      '你是三号舱的幸存者。这就够了。别再问了。',
      '你知道的。你从第一分钟就知道了。你只是想听别人说出来。',
    ],
    minCorruption: 0.55,
  },
];

/** 舱里的幻听。没有人在说这些，但你确实听见了 */
export const HALLUCINATIONS: readonly string[] = [
  '（有人在舱壁外面敲了三下。节奏是你小时候敲门的节奏。）',
  '（洗涤器的风扇声里混着一句「别回头」。你把风扇关掉，那句话还在。）',
  '（无线电没有开。它还是响了一声。）',
  '（你听见自己在说话，但你的嘴没有动。）',
  '（有人在很远的地方数数。数到七就重新开始。）',
  '（水滴的声音停了三秒，然后从舱内的另一侧继续。）',
  '（一个女人在笑。她笑得很小声，像是怕吵到你。）',
  '（指挥员的声音说了一句「收到」。你还没有说话。）',
];

/** 玩家不在无线电台时，喇叭自己响起来的那些。是真的还是假的，分不出来 */
export const GHOST_CALLS: readonly string[] = [
  '三号舱，回答。三号舱。',
  '……别去 D-9。',
  '（一段只有呼吸声的传输，持续了十一秒。）',
  '三号舱，你舱里有第二个人。',
  '（是你自己的声音在叫你的名字。）',
];

// ============================================================================
// 文本失真
// ============================================================================

const GLITCH_CHARS = '▒░▓█▌▐■◼─═╳';

/**
 * 把一句话按污染度弄坏。
 *
 * 三种手法，都刻意保留可读性：
 *   卡带  —— 一个词被原地重复，模拟带子跳针；
 *   噪块  —— 单字被方块吃掉，你能猜出来，但不确定；
 *   拖音  —— 末尾的字被拉长，像是信号在衰减。
 */
export function corrupt(text: string, level: number, rng: Rng): string {
  if (level <= 0.08) return text;
  const chars = [...text];
  const out: string[] = [];
  const blockRate = Math.max(0, (level - 0.12) * 0.22);

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === '\n' || c === '{' || c === '}') {
      out.push(c);
      continue;
    }
    if (rng.next() < blockRate) {
      out.push(GLITCH_CHARS[Math.floor(rng.next() * GLITCH_CHARS.length)]);
      continue;
    }
    out.push(c);
    // 卡带：整个词卡住
    if (level > 0.35 && rng.next() < level * 0.035) {
      const n = 1 + Math.floor(rng.next() * 2);
      for (let k = 0; k < n; k++) out.push(c);
    }
  }

  let s = out.join('');
  if (level > 0.5 && rng.next() < 0.4) {
    s = s.replace(/。$/, '……');
  }
  return s;
}

/** 按污染度从三档回答里挑一档 */
export function replyTier(level: number): 0 | 1 | 2 {
  if (level < 0.3) return 0;
  if (level < 0.62) return 1;
  return 2;
}
