/**
 * world/setpieces.ts — 惊喜地图（GDD §6.4）
 *
 * 九处名场面：五处是 GDD 点名要求的，四处是原创。
 * 设计纪律有两条，两条都是硬的：
 *
 * 1. **setpiece 永远不在关键路径上。** 它们一律用 optional / secret 门挂接。
 *    这样"惊喜"就永远不会变成"卡关"，求解器的悲观证明也不受它们影响。
 * 2. **每一处都必须有一个可被玩家学会的机制**，而不只是一段吓人的文本。
 *    镜像舱可以用来验证自己的记忆；莫比乌斯走廊数得清圈数；
 *    零号舱教玩家"低 SAN 是钥匙"；回声室教玩家"扫三次"。
 */

import type { ID } from '../core/contract';
import { instantiateProp } from './props';
import { link } from './graph';
import type {
  SetpieceBuildContext,
  SetpieceContext,
  SetpieceDef,
  SetpieceHookResult,
  SonarAnomaly,
  WorldRoom,
} from './types';

// ---------------------------------------------------------------- 工具

function num(ctx: SetpieceContext, key: string, fallback = 0): number {
  const v = ctx.state[key];
  return typeof v === 'number' ? v : fallback;
}

function str(ctx: SetpieceContext, key: string, fallback = ''): string {
  const v = ctx.state[key];
  return typeof v === 'string' ? v : fallback;
}

/** 把一段痕迹文本左右镜像。镜像舱的核心笑点全在这个函数里 */
export function mirrorTrace(text: string): string {
  const swaps: [string, string][] = [
    ['左', '\u0000'],
    ['右', '左'],
    ['\u0000', '右'],
    ['顺时针', '\u0001'],
    ['逆时针', '顺时针'],
    ['\u0001', '逆时针'],
  ];
  let out = text;
  for (const [a, b] of swaps) out = out.split(a).join(b);
  return out;
}

function anomaly(at: ID, confidence: number, signature: string, truth: SonarAnomaly['truth'], hops = 0): SonarAnomaly {
  return { at, confidence, signature, truth, hops };
}

// ---------------------------------------------------------------- 定义

export const SETPIECES: readonly SetpieceDef[] = [
  // ============================================================== 1. 镜像舱
  {
    id: 'mirror-cell',
    name: '镜像舱',
    premise:
      '与玩家刚走过的房间完全对称，包括他留下的痕迹 —— 但痕迹是反的。玩家可以拿它检验自己的记忆，也可以被它说服自己记错了。',
    decks: [2, 3, 4, 5],
    weight: 10,
    guaranteed: true,
    variantId: 'rv.void.mirrored-cell',
    attachAs: 'optional',
    build({ room }: SetpieceBuildContext) {
      room.tags = [...room.tags, 'mirror-live'];
    },
    onEnter(ctx: SetpieceContext): SetpieceHookResult {
      const prev = ctx.previousRoom;
      const out: SetpieceHookResult = { log: [] };
      if (!prev) {
        out.log?.push({
          text: '这个房间在等一个模板。你是第一个进来的，所以它暂时只是一个空的对称。',
          tone: 'eerie',
        });
        return out;
      }
      // 真的去镜像：名字、物件构成、坐标、痕迹
      out.renameTo = `${prev.name}（对称）`;
      ctx.room.pos = { x: -prev.pos.x, y: prev.pos.y };
      ctx.room.echoFingerprint = prev.echoFingerprint;
      ctx.room.props = prev.props.map((p, i) => instantiateProp(p.id.split('@')[0], 90000 + i));
      ctx.room.traces = prev.traces.map(mirrorTrace).reverse();
      ctx.state.mirroredFrom = prev.id;

      out.log?.push({
        text: `这里和「${prev.name}」是同一个房间的两半。螺栓数一样，剥漆的形状一样，连你刚才碰翻的东西都在对应的位置上。`,
        tone: 'eerie',
      });
      if (ctx.room.traces.length) {
        out.log?.push({
          text: `你留下的痕迹也在这里，但左右是反的：${ctx.room.traces[0]}`,
          tone: 'whisper',
        });
        out.effects = [
          { op: 'vital', stat: 'san', delta: -9 },
          { op: 'knowledge', node: 'know.world.mirror.traces-reversed' },
        ];
      } else {
        out.effects = [{ op: 'vital', stat: 'san', delta: -5 }];
      }
      return out;
    },
    onPing(ctx: SetpieceContext): SetpieceHookResult {
      const from = str(ctx, 'mirroredFrom');
      return {
        extraAnomalies: [
          anomaly(ctx.room.id, 0.42, '金属·与另一处完全一致的回波包络', 'phantom', 0),
          ...(from ? [anomaly(from, 0.3, '同一个房间·两个方位', 'structure', 1)] : []),
        ],
      };
    },
  },

  // ======================================================== 2. 莫比乌斯走廊
  {
    id: 'mobius-passage',
    name: '莫比乌斯走廊',
    premise:
      '往前走四次回到起点，每次回来房间里少一件东西。第四次它是空的，只剩玩家 —— 这时真正的出口才"被听出来"。圈数是可数的，所以它是谜题不是恶作剧。',
    decks: [3, 4, 5],
    weight: 9,
    guaranteed: true,
    variantId: 'rv.void.mobius-segment',
    attachAs: 'optional',
    build({ graph, room, counters }: SetpieceBuildContext) {
      // 自环门：往前走 = 从另一头走进来
      const loop = link(graph, counters, room, room, {
        role: 'shortcut',
        state: 'open',
        oneWay: true,
        audioHint: '门后是你刚才站的地方的声音，早了一点。',
      });
      loop.forward.deckDelta = 0;
      // 真出口：需要走满四圈才"存在"
      const exitTarget = [...graph.rooms.values()].find(
        (r) => r.deck === room.deck && r.id !== room.id && r.veracity === 'real' && !r.setpiece,
      );
      if (exitTarget) {
        link(graph, counters, room, exitTarget, {
          role: 'secret',
          state: 'closed',
          lock: {
            kind: 'knowledge',
            requires: 'know.world.mobius.completed',
            hint: '走空它。第四次回来的时候，墙上会少掉最后一样东西，那时候你就听得见门了。',
          },
          audioHint: '一面实心墙。贴上去能听到风，但风不该穿过实心的东西。',
        });
      }
      room.tags = [...room.tags, 'mobius-live'];
    },
    onEnter(ctx: SetpieceContext): SetpieceHookResult {
      const loops = num(ctx, 'loops') + 1;
      ctx.state.loops = loops;
      const out: SetpieceHookResult = { log: [], removeProps: 1 };

      const lines = [
        '你从走廊的另一头走了进来。你刚才是朝前走的。',
        '第二次。墙上那个灭火器不在了，挂钩还在，漆的轮廓还在。',
        '第三次。储物柜没了。地面上留着它四条腿的压痕，压痕是新的。',
        '第四次。走廊是空的，四壁裸钢。这里现在只剩一样东西，就是你。',
      ];
      out.log?.push({ text: lines[Math.min(loops, 4) - 1], tone: loops >= 4 ? 'whisper' : 'eerie' });

      if (loops >= 4) {
        out.removeProps = 99;
        out.effects = [
          { op: 'knowledge', node: 'know.world.mobius.completed' },
          { op: 'vital', stat: 'san', delta: -12 },
          { op: 'flag', key: 'did.walked-mobius', value: true },
        ];
        out.log?.push({
          text: '它把走廊里的东西一件件收走了，按从不重要到重要的顺序。现在轮到最后一件，而门在这时候出现了。',
          tone: 'whisper',
        });
      } else {
        out.effects = [
          { op: 'vital', stat: 'san', delta: -4 },
          { op: 'flag-add', key: 'count.mobius-loops', delta: 1 },
        ];
      }
      return out;
    },
    onPing(ctx: SetpieceContext): SetpieceHookResult {
      const loops = num(ctx, 'loops');
      return {
        extraAnomalies: [
          anomaly(ctx.room.id, 0.55, `结构·同一条走廊的第 ${Math.max(1, loops)} 次回波`, 'structure', 0),
        ],
      };
    },
  },

  // ============================================================== 3. 零号舱
  {
    id: 'room-zero',
    name: '零号舱',
    premise:
      '不在任何图纸上，只有 SAN < 20 时声呐才能扫到它。低理智在本作里不是纯惩罚，而是通往某些内容的唯一钥匙 —— 这处房间是那条设计原则的实体证明。',
    decks: [3, 4, 5],
    weight: 8,
    guaranteed: true,
    variantId: 'rv.void.room-zero',
    attachAs: 'secret',
    build({ room }: SetpieceBuildContext) {
      room.onBlueprint = false;
      room.mapped = false;
      room.tags = [...room.tags, 'zero-live'];
      // 门不上锁，但它只在被扫到之后才能被"找到"（见 World.move 的 concealment 检查）
    },
    sonarVisible({ san }) {
      return san < 20;
    },
    onEnter(ctx: SetpieceContext): SetpieceHookResult {
      const visits = num(ctx, 'visits') + 1;
      ctx.state.visits = visits;
      return {
        log: [
          {
            text: '这个房间没有编号，因为编号从 1 开始。四壁刻满名字，从下往上，刻到齐胸高就停了 —— 再往上，刻的人不够高。',
            tone: 'whisper',
          },
          {
            text:
              visits === 1
                ? '地面正中有一个磨出来的圆。你站上去，脚底和它完全吻合。'
                : `你来过这里 ${visits} 次了。墙上的行数每次都多一行。`,
            tone: 'whisper',
          },
        ],
        effects: [
          { op: 'knowledge', node: 'know.world.truth.room-zero' },
          { op: 'flag', key: 'did.entered-room-zero', value: true },
          { op: 'vital', stat: 'san', delta: -6 },
          { op: 'stigma', stigma: 'listening', delta: 1 },
        ],
      };
    },
    onPing(ctx: SetpieceContext): SetpieceHookResult {
      if (ctx.san >= 20) {
        return { blockSonar: false, extraAnomalies: [] };
      }
      return {
        reveal: [ctx.room.id],
        extraAnomalies: [anomaly(ctx.room.id, 0.88, '空腔·图纸上此处为实心', 'structure', 0)],
      };
    },
  },

  // ========================================================== 4. 淹没的圣堂
  {
    id: 'drowned-chapel',
    name: '淹没的圣堂',
    premise:
      '全淹，必须屏息通过，全程禁用声呐 —— 水里的脉冲会把你送给每一个在听的东西。这是全作唯一一处剥夺玩家唯一感知手段的房间。',
    decks: [4, 5],
    weight: 9,
    guaranteed: true,
    variantId: 'rv.chapel.drowned-sanctuary',
    attachAs: 'optional',
    build({ room }: SetpieceBuildContext) {
      room.ambient.flooding = 0.97;
      room.ambient.airQuality = 0.08;
      room.floodRate = 0;
      room.tags = [...room.tags, 'no-sonar', 'breath-hold'];
      for (const d of room.doors) {
        d.state = 'open';
        d.audioHint = '门后是水。不是有水，是全是水。';
      }
    },
    onEnter(ctx: SetpieceContext): SetpieceHookResult {
      ctx.state.entered = num(ctx, 'entered') + 1;
      return {
        log: [
          {
            text: '整个舱在水下。你进去之前得先把气存住。这里不能用声呐 —— 水传声太好了，一次脉冲等于把自己的坐标喊出去。',
            tone: 'bad',
          },
          {
            text: '水里悬着四个人，跪姿，被固定在应有的位置上，朝着同一面墙。他们的嘴在动。水传声比空气好得多。',
            tone: 'whisper',
          },
        ],
        effects: [
          { op: 'vital', stat: 'co2', delta: 10 },
          { op: 'vital', stat: 'coreTemp', delta: -1.8 },
          { op: 'vital', stat: 'san', delta: -10 },
          { op: 'knowledge', node: 'know.world.choir.still-singing' },
          { op: 'sfx', cue: 'submerge' },
        ],
      };
    },
    onPing(ctx: SetpieceContext): SetpieceHookResult {
      ctx.state.pingsAttempted = num(ctx, 'pingsAttempted') + 1;
      return {
        blockSonar: true,
        log: [
          {
            text: '你按下了脉冲。什么都没有回来 —— 换能器在水里被压住了。但是**别的东西**听见了。',
            tone: 'bad',
          },
        ],
        effects: [
          { op: 'noise', amount: 34 },
          { op: 'vital', stat: 'fear', delta: 18 },
          { op: 'flag-add', key: 'count.chapel-pings', delta: 1 },
        ],
      };
    },
  },

  // ======================================================== 5. 你自己的舱室
  {
    id: 'own-quarters',
    name: '你自己的舱室',
    premise:
      '一具穿着你衣服的尸体，日志是你还没写的。它不是 jump scare，是一份可查证的档案：桌上东西的摆法是玩家自己的习惯，而玩家从没告诉过任何人。',
    decks: [1, 2],
    weight: 10,
    guaranteed: true,
    variantId: 'rv.bunks.your-quarters',
    attachAs: 'optional',
    build({ room }: SetpieceBuildContext) {
      room.tags = [...room.tags, 'self-live'];
      room.ambient.presence = Math.max(room.ambient.presence, 0.52);
    },
    onEnter(ctx: SetpieceContext): SetpieceHookResult {
      const first = num(ctx, 'visits') === 0;
      ctx.state.visits = num(ctx, 'visits') + 1;
      const out: SetpieceHookResult = {
        log: [
          {
            text: '桌上的东西按你的习惯摆着：杯子在右手边，笔尖朝外。你没跟任何人说过这件事，因为这不是一件值得说的事。',
            tone: 'eerie',
          },
        ],
        effects: [
          { op: 'knowledge', node: 'know.world.self.previous-cycle' },
          { op: 'flag', key: 'did.found-own-quarters', value: true },
          { op: 'vital', stat: 'san', delta: first ? -13 : -4 },
          { op: 'vital', stat: 'fear', delta: first ? 14 : 4 },
        ],
      };
      if (ctx.cycle > 1) {
        out.log?.push({
          text: `铺位上那个人做完了他那一份。你是第 ${ctx.cycle} 个。日志写到第十一页，笔迹是你的。`,
          tone: 'whisper',
        });
      } else {
        out.log?.push({
          text: '铺位上躺着一个人，穿着你身上这一套。同一处磨损，同一颗你自己缝上去的绿线纽扣。',
          tone: 'whisper',
        });
      }
      return out;
    },
  },

  // ======================================================= 6. 倒悬压载舱（原创）
  {
    id: 'inverted-ballast',
    name: '倒悬压载舱',
    premise:
      '水贴在天花板上，地板是干的。要过去必须把它抽干，而抽干这里意味着灌满下面那一层 —— 一个不可撤销、会永久改写世界的选择。',
    decks: [4, 5],
    weight: 8,
    guaranteed: false,
    variantId: 'rv.flooded.inverted-ballast',
    attachAs: 'optional',
    build({ room }: SetpieceBuildContext) {
      room.tags = [...room.tags, 'inverted', 'irreversible'];
      room.ambient.presence = Math.max(room.ambient.presence, 0.82);
      room.floodRate = 0;
    },
    onEnter(ctx: SetpieceContext): SetpieceHookResult {
      const drained = num(ctx, 'drained') > 0;
      if (drained) {
        return {
          log: [
            {
              text: '水回到了地板上，齐腰。天花板在滴，滴得很慢。下面那一层现在多了这一整舱的水。',
              tone: 'bad',
            },
          ],
        };
      }
      ctx.state.drained = 1;
      const belowDeck = Math.min(5, ctx.room.deck + 1);
      return {
        log: [
          {
            text: '水在天花板上，铺成一层，厚约一米二，边缘平整，不滴。你身上的水在往下滴，你的血在往下走。只有那一片水的上下是反的。',
            tone: 'eerie',
          },
          {
            text: '你开了舱底阀。水花了很长时间才想起该往哪边走，然后它整片落下来，从你身上过去，进到下一层。',
            tone: 'bad',
          },
        ],
        floodDelta: { deck: belowDeck, amount: 0.16 },
        effects: [
          { op: 'knowledge', node: 'know.world.inverted.gravity-local' },
          { op: 'vital', stat: 'san', delta: -11 },
          { op: 'vital', stat: 'coreTemp', delta: -2.2 },
          { op: 'stigma', stigma: 'drowned', delta: 1 },
          { op: 'flag', key: 'did.drained-inverted', value: true },
          { op: 'camera', shake: 0.5 },
          { op: 'sfx', cue: 'water-collapse' },
        ],
        worldEvents: [{ kind: 'flood', roomId: ctx.room.id, rate: -0.4 }],
      };
    },
    onPing(ctx: SetpieceContext): SetpieceHookResult {
      return {
        extraAnomalies: [
          anomaly(ctx.room.id, 0.6, '水—气界面·方位在上方', 'structure', 0),
          anomaly(ctx.room.id, 0.34, '软组织·倒置游动', 'entity', 0),
        ],
      };
    },
  },

  // ======================================================= 7. 压力告解室（原创）
  {
    id: 'pressure-confessional',
    name: '压力告解室',
    premise:
      '唯一的出口在"腔内压 = 肺内压"时开启。玩家必须屏息**恰好**指定的呼吸数：短了门不动，长了会强制大喘气，而大喘气是全作最响的声音之一。它把屏息这个微观决策变成了一道门。',
    decks: [3, 4, 5],
    weight: 8,
    guaranteed: false,
    variantId: 'rv.void.pressure-confessional',
    attachAs: 'optional',
    build({ graph, room, rng, counters }: SetpieceBuildContext) {
      room.tags = [...room.tags, 'confessional', 'breath-hold'];
      // 出口需要"读出正确的屏息拍数"这条知识
      const target = [...graph.rooms.values()].find(
        (r) => r.deck === room.deck && r.id !== room.id && r.veracity === 'real' && !r.setpiece,
      );
      if (target) {
        link(graph, counters, room, target, {
          role: 'secret',
          state: 'sealed',
          lock: {
            kind: 'knowledge',
            requires: 'know.world.confessional.matched',
            hint: '门在两根指针重合时开。细的那根指着你能屏住的极限，你得停在它之前。',
          },
          audioHint: '门是密封的。门缝里有气流，方向是往里的。',
        });
      }
      // 目标拍数由种子决定，玩家可以从表盘读出来 —— 可学习，不是猜
      room.traces = [`腔内压表盘刻度：${rng.int(6, 14)}`];
    },
    onEnter(ctx: SetpieceContext): SetpieceHookResult {
      if (num(ctx, 'target') === 0) {
        const dial = ctx.room.traces[0] ?? '';
        const parsed = Number.parseInt(dial.replace(/\D+/g, ''), 10);
        ctx.state.target = Number.isFinite(parsed) && parsed > 0 ? parsed : 9;
      }
      return {
        log: [
          {
            text: `圆形小舱，唯一的出口没有把手。门边表盘上两根指针：「腔内压」固定在 ${num(ctx, 'target')}，「肺内压」跟着你的呼吸摆。`,
            tone: 'system',
          },
          {
            text: '门在两根指针重合时开。也就是说，你得屏住呼吸，恰好屏那么多口气，不多不少。',
            tone: 'eerie',
          },
        ],
        effects: [{ op: 'knowledge', node: 'know.world.confessional.rule' }],
      };
    },
    onPing(ctx: SetpieceContext): SetpieceHookResult {
      return {
        extraAnomalies: [
          anomaly(ctx.room.id, 0.5, `空腔·内压与肺压之差 ${num(ctx, 'target')}`, 'structure', 0),
        ],
      };
    },
  },

  // ========================================================= 8. 计数走廊（原创）
  {
    id: 'tally-corridor',
    name: '计数走廊',
    premise:
      '墙上的正字比玩家的轮回数多一道。玩家很快会发现：每发一次声呐就多一道 —— 它记的不是"你来过几次"，是"你被听见过几次"。这条走廊是把噪音预算可视化成叙事的装置。',
    decks: [2, 3, 4, 5],
    weight: 9,
    guaranteed: false,
    variantId: 'rv.corridor.tally-passage',
    attachAs: 'optional',
    build({ room, rng }: SetpieceBuildContext) {
      room.tags = [...room.tags, 'tally-live'];
      room.traces = [`右侧舱壁上的竖道：${rng.int(3, 9)} 组`];
    },
    onEnter(ctx: SetpieceContext): SetpieceHookResult {
      const tally = num(ctx, 'tally');
      const expected = ctx.cycle;
      const shown = expected + 1 + tally;
      ctx.state.seen = num(ctx, 'seen') + 1;
      return {
        log: [
          {
            text: `右侧舱壁上刻着计数用的竖道，五道一组。你数了一遍：${shown} 道。你这是第 ${expected} 次下来。`,
            tone: 'eerie',
          },
          {
            text:
              tally > 0
                ? `其中 ${tally} 道是你进这条船之后才出现的。它们出现的时刻，你都在按声呐。`
                : '多的那一道刻痕深度和别的一样，是同一种力气刻的。',
            tone: 'whisper',
          },
        ],
        effects: [
          { op: 'knowledge', node: 'know.world.tally.counts-pings' },
          { op: 'vital', stat: 'san', delta: -5 },
        ],
      };
    },
    onPing(ctx: SetpieceContext): SetpieceHookResult {
      ctx.state.tally = num(ctx, 'tally') + 1;
      ctx.room.traces = [...ctx.room.traces, '一道新的竖道，边缘还是亮的。'];
      return {
        log: [{ text: '走廊的墙上多了一道。你没看见是谁刻的，但刻痕还是亮的。', tone: 'whisper' }],
        extraAnomalies: [
          anomaly(ctx.room.id, 0.46, `金属·规则敲击（第 ${num(ctx, 'tally')} 次）`, 'structure', 0),
        ],
        effects: [{ op: 'vital', stat: 'fear', delta: 5 }],
      };
    },
  },

  // ========================================================== 9. 回声室（原创）
  {
    id: 'echo-chamber',
    name: '回声室',
    premise:
      '在这里发脉冲，回波图上是这个房间本身，一层套一层。扫到第三次时最里面那一层会出现一扇门 —— 而那扇门在现实里也有，在背后的实心墙上。"扫三次"是一条可学会、可复用的规则。',
    decks: [3, 4, 5],
    weight: 9,
    guaranteed: false,
    variantId: 'rv.sonar.recursive-shack',
    attachAs: 'optional',
    build({ graph, room, counters }: SetpieceBuildContext) {
      room.tags = [...room.tags, 'echo-live'];
      const target = [...graph.rooms.values()].find(
        (r) => r.deck >= room.deck && r.id !== room.id && r.veracity === 'real' && !r.setpiece && r.onBlueprint === false,
      ) ?? [...graph.rooms.values()].find(
        (r) => r.deck === room.deck && r.id !== room.id && r.veracity === 'real' && !r.setpiece,
      );
      if (target) {
        const { forward } = link(graph, counters, room, target, {
          role: 'secret',
          state: 'sealed',
          lock: {
            kind: 'knowledge',
            requires: 'know.world.echo.third-ping',
            hint: '扫三次。第三次的回波里，最里面那一层会多一扇门。',
          },
          audioHint: '一面实心舱壁。你对它发过的每一次脉冲都比应该的时间早回来一点。',
        });
        room.traces = [`听出来的门：${forward.id}`];
      }
    },
    onEnter(ctx: SetpieceContext): SetpieceHookResult {
      return {
        log: [
          {
            text: '四壁做过声学处理，处理方式是把声音**留住**，不是吸掉。在这里发脉冲，回来的是这个房间自己。',
            tone: 'eerie',
          },
        ],
        effects: [{ op: 'knowledge', node: 'know.world.echo.recursive' }],
      };
    },
    onPing(ctx: SetpieceContext): SetpieceHookResult {
      const pings = num(ctx, 'pings') + 1;
      ctx.state.pings = pings;
      const out: SetpieceHookResult = {
        reveal: [ctx.room.id],
        extraAnomalies: [
          anomaly(ctx.room.id, 0.72, '与你同步的回波', 'self-echo', 0),
          anomaly(ctx.room.id, 0.5, `结构·自嵌套第 ${Math.min(pings, 4)} 层`, 'structure', 0),
        ],
        log: [],
      };
      if (pings === 1) {
        out.log?.push({ text: '回波图上是这个房间，套着这个房间，套着这个房间，往里缩。', tone: 'eerie' });
      } else if (pings === 2) {
        out.log?.push({
          text: '最里面那一层里有一个你，站的位置和你现在站的位置不一样。它站在靠墙那一侧。',
          tone: 'whisper',
        });
      } else if (pings >= 3) {
        const doorId = (ctx.room.traces[0] ?? '').split('：')[1];
        out.log?.push({
          text: '第三次。最里面那一层多了一扇门，开在你背后那面实心墙上。你回头，墙上有一道门框的接缝，一直都有。',
          tone: 'whisper',
        });
        out.effects = [
          { op: 'knowledge', node: 'know.world.echo.third-ping' },
          { op: 'vital', stat: 'san', delta: -8 },
          { op: 'flag', key: 'did.heard-the-door', value: true },
        ];
        if (doorId) out.unlockDoors = [doorId];
      }
      return out;
    },
  },
];

// ---------------------------------------------------------------- 索引

const BY_ID = new Map<string, SetpieceDef>();
for (const sp of SETPIECES) {
  if (BY_ID.has(sp.id)) throw new Error(`[world/setpieces] 重复的 setpiece id: ${sp.id}`);
  BY_ID.set(sp.id, sp);
}

export function setpiece(id: string): SetpieceDef | undefined {
  return BY_ID.get(id);
}

export const GUARANTEED_SETPIECES: readonly SetpieceDef[] = SETPIECES.filter((s) => s.guaranteed);
export const OPTIONAL_SETPIECES: readonly SetpieceDef[] = SETPIECES.filter((s) => !s.guaranteed);
export const SETPIECE_COUNT = SETPIECES.length;

/** 房间是否是某处 setpiece */
export function setpieceOf(room: WorldRoom): SetpieceDef | undefined {
  return room.setpiece ? BY_ID.get(room.setpiece) : undefined;
}
