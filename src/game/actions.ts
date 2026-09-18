/**
 * 玩家行动层 —— "这游戏到底怎么玩"的答案就在这个文件里。
 *
 * 探索是回合制的：每个回合玩家从一份行动清单里挑**一件**事做，付出呼吸，
 * 世界随之演化一个等长的回合。清单由当前房间的门、陈设、身上的道具动态生成，
 * 每一项都把代价（呼吸）与风险（噪音）明码标价 —— 这是 GDD 支柱 P2
 * 「每个决定都要用氧气付账」的落点，也是玩家唯一需要理解的界面语法。
 */

import type { Breaths, ID, Prop, SonarResult } from '@/core/contract';
import { BREATH } from '@/core/contract';
import { maybeItem, recipe } from '@/content/items';
import { SONAR_MODES, type SonarMode, type SonarSweep } from '@/world';
import type { RunContext } from './context';

export type ActionGroup = 'move' | 'sense' | 'interact' | 'body' | 'item';

export interface GameAction {
  id: string;
  group: ActionGroup;
  label: string;
  /** 副标题：代价之外玩家该知道的那一句 */
  detail: string;
  /** 预估呼吸消耗。真实值由子系统结算，可能因状态效果不同 */
  cost: Breaths;
  /** 预估噪音。0 不代表安全 —— 身体本身也在发声 */
  noise: number;
  /** 非 null 则不可执行，值为原因 */
  blocked: string | null;
  perform(): void;
}

/** 声呐一次脉冲的结果，供表现层做回波与光栅 */
export interface PingOutcome {
  sweep: SonarSweep;
  result: SonarResult;
  power: number;
}

const POWER_OF: Record<SonarMode, number> = { passive: 1, chirp: 3, boom: 7 };

/**
 * 生成当前回合的行动清单。
 *
 * 顺序是刻意的：移动在最上（玩家最常做的事），感知次之，交互再次，
 * 身体最后（屏息/休息是"不做事"的选项，不该抢占视线）。
 */
export function exploreActions(ctx: RunContext, onPing: (p: PingOutcome) => void): GameAction[] {
  const out: GameAction[] = [];
  const here = ctx.wroom();
  const san = ctx.vitals.perceived().san;
  const noiseMul = ctx.vitals.derived('noiseEmission') / Math.max(0.35, ctx.vitals.derived('stealth'));

  // ---- 移动 ---------------------------------------------------------------
  for (const door of here.doors) {
    const target = ctx.world.topology.rooms.get(door.to);
    // 门后是什么，取决于玩家是否去过或扫到过。没扫到的门就是一句"不知道"，
    // 这正是声呐存在的理由 —— 盲目开门必须是有代价的赌博。
    const known = target ? target.visited || target.mapped : false;
    const where = known && target ? target.name : '不明';
    const wading = Math.max(here.ambient.flooding, target?.ambient.flooding ?? 0);

    let cost = door.crawl ? BREATH.STEP * 2.2 : BREATH.STEP;
    cost += wading * 2.4;
    if (door.state === 'closed') cost += BREATH.OPEN_DOOR;
    if (door.state === 'jammed') cost += BREATH.FORCE_DOOR;

    let noise = door.crawl ? 0.5 : 1;
    if (door.state === 'closed') noise += 3;
    if (door.state === 'jammed') noise += 12;
    noise += wading * 2;

    const locked = door.lock && !ctx.keys.has(door.lock.requires);
    const detailBits: string[] = [where];
    if (door.crawl) detailBits.push('检修管 · 极安静但磨损理智');
    if (door.state === 'jammed') detailBits.push('卡死 · 撬开会很响');
    if (door.state === 'closed') detailBits.push('关着');
    if (wading > 0.35) detailBits.push('涉水');
    if (door.mark) detailBits.push(`你标记过：${door.mark.glyph}`);

    out.push({
      id: `move:${door.id}`,
      group: 'move',
      label: doorLabel(door.role, door.deckDelta),
      detail: detailBits.join(' · '),
      cost: Math.round(cost),
      noise: Math.round(noise * noiseMul * 10) / 10,
      blocked: locked ? (door.lock?.hint ?? '锁着') : null,
      perform: () => doMove(ctx, door.id),
    });

    // 标记门：对抗非欧重织的唯一手段，成本低到可以养成习惯
    if (!door.mark) {
      out.push({
        id: `mark:${door.id}`,
        group: 'interact',
        label: `在${doorLabel(door.role, door.deckDelta)}上刻一道`,
        detail: '记住这扇门此刻通向哪儿。船会趁你不看的时候改主意。',
        cost: BREATH.LOOK,
        noise: 0.4,
        blocked: null,
        perform: () => {
          ctx.world.mark(door.id);
          ctx.spendBreaths(BREATH.LOOK, 'mark', 0.05);
          endTurn(ctx, BREATH.LOOK);
        },
      });
    } else {
      out.push({
        id: `check:${door.id}`,
        group: 'sense',
        label: `核对${doorLabel(door.role, door.deckDelta)}的标记`,
        detail: '看它是否还通向你记得的地方。',
        cost: BREATH.LOOK,
        noise: 0.2,
        blocked: null,
        perform: () => {
          const v = ctx.world.checkMark(door.id);
          ctx.pushLog(v.detail, v.verdict === 'intact' ? 'neutral' : 'bad');
          ctx.spendBreaths(BREATH.LOOK, 'check-mark', 0.05);
          endTurn(ctx, BREATH.LOOK);
        },
      });
    }
  }

  // ---- 感知：三档声呐 -----------------------------------------------------
  for (const mode of ['passive', 'chirp', 'boom'] as const) {
    const spec = SONAR_MODES[mode];
    out.push({
      id: `sonar:${mode}`,
      group: 'sense',
      label: spec.label,
      detail: sonarDetail(mode, spec.radius),
      cost: spec.cost,
      noise: Math.round(spec.noise * noiseMul * 10) / 10,
      blocked: null,
      perform: () => doPing(ctx, mode, onPing),
    });
  }

  // ---- 交互：房间里的陈设 -------------------------------------------------
  const searched = ctx.searched.has(here.id);
  for (const prop of here.props) {
    // 藏得好的东西得先被声呐照到、或者被亲手翻出来，才会出现在清单上
    if (prop.concealment > 0.5 && !here.mapped && !searched) continue;
    for (const spec of prop.interactions) {
      const ok = !spec.requires || ctx.narrative.test(spec.requires);
      out.push({
        id: `prop:${prop.id}:${spec.id}`,
        group: 'interact',
        label: spec.label,
        detail: propDetail(prop, san),
        cost: spec.cost,
        noise: Math.round(spec.noise * noiseMul * 10) / 10,
        blocked: ok ? null : '你还做不到这件事',
        perform: () => doProp(ctx, spec.cost, spec.node, spec.effects),
      });
    }
  }

  // ---- 身体 ---------------------------------------------------------------
  const hold = ctx.vitals.holdState();
  const holding = hold.holding;
  out.push({
    id: 'body:hold',
    group: 'body',
    label: holding ? '呼气' : '屏住呼吸',
    detail: holding
      ? `已经憋了 ${hold.heldFor} 口，省下 ${hold.oxygenSaved.toFixed(0)} 氧。还有 ${hold.untilForcedGasp} 口就压不住了。`
      : `噪音归零，但 CO₂ 会涨。还能憋约 ${ctx.vitals.breathsUntilForcedGasp()} 口。`,
    cost: 0,
    noise: 0,
    blocked: null,
    perform: () => {
      if (holding) {
        const r = ctx.vitals.release();
        if (r.noise > 0) ctx.makeNoise(r.noise, 'exhale');
        ctx.director.observe({ kind: 'hold-breath', breaths: r.heldFor });
      } else {
        ctx.vitals.holdBreath();
      }
    },
  });

  out.push({
    id: 'body:rest',
    group: 'body',
    label: '停下来，让心跳慢下去',
    detail: '把恐惧压回去。代价是氧气，和这段时间里船在做的事。',
    cost: BREATH.REST,
    noise: 0.2,
    blocked: holding ? '你正屏着气' : null,
    perform: () => {
      ctx.spendBreaths(BREATH.REST, 'rest', 0);
      ctx.vitals.restore({ fear: Math.max(0, ctx.vitals.vitals.fear - 18) });
      ctx.director.observe({ kind: 'rest' });
      endTurn(ctx, BREATH.REST);
    },
  });

  // ---- 随身物 -------------------------------------------------------------
  /*
   * 只列**此刻用得上**的东西。背包里那些没有 onUse 的材料、钥匙、文书不进清单：
   * 它们的用途在别处（配方的输入、门的锁、叙事的条件），列出来只会让玩家
   * 逐个点过去确认"这个也不能用"。想看全部还有 I 键的背包面板。
   */
  for (const slot of ctx.inventory.all()) {
    const def = maybeItem(slot.id);
    if (!def?.onUse?.length) continue;
    const itemNoise = def.noise ?? 0;
    out.push({
      id: `item:${slot.id}`,
      group: 'item',
      label: `用${ctx.inventory.displayName(slot.id)}`,
      detail: itemDetail(def.kind, slot.count, slot.durability),
      cost: BREATH.LOOK * 2,
      noise: Math.round(itemNoise * noiseMul * 10) / 10,
      blocked: null,
      perform: () => {
        const forwarded = ctx.inventory.use(slot.id);
        if (itemNoise > 0) ctx.makeNoise(itemNoise * noiseMul, `item:${slot.id}`);
        ctx.spendBreaths(BREATH.LOOK * 2, 'use-item', 0.1);
        if (forwarded.length) ctx.applyEffects(forwarded);
        endTurn(ctx, BREATH.LOOK * 2);
      },
    });
  }

  /*
   * 合成。`availableRecipes()` 已经把材料、条件、工位都核过了，
   * 所以出现在这里的每一条都是当场能做成的 —— 清单上不该有画饼。
   */
  for (const rid of ctx.inventory.availableRecipes()) {
    const r = recipe(rid);
    out.push({
      id: `craft:${rid}`,
      group: 'item',
      label: `拼一个${r.name}`,
      detail: r.inputs.map((i) => `${ctx.inventory.displayName(i.item)}×${i.count}`).join(' + '),
      cost: r.cost,
      noise: Math.round(r.noise * noiseMul * 10) / 10,
      blocked: null,
      perform: () => {
        const ok = ctx.inventory.craft(rid);
        ctx.spendBreaths(r.cost, 'craft', 0.25);
        if (r.noise > 0) ctx.makeNoise(r.noise * noiseMul, 'craft');
        ctx.pushLog(
          ok ? `你把它拼起来了。${r.name}。` : '拼不起来 —— 手上的东西对不上。',
          ok ? 'good' : 'bad',
        );
        endTurn(ctx, r.cost);
      },
    });
  }

  // 翻找是声呐之外的第二条发现路径：不发声，但要用时间和一次导演的注视去换
  const hidden = here.props.filter((p) => p.concealment > 0.5).length;
  out.push({
    id: 'body:search',
    group: 'interact',
    label: '搜这个舱',
    detail: searched
      ? '你已经翻过一遍了。再翻也只是把同样的东西再摸一次。'
      : '翻柜子、摸管线、看尸体的口袋。很慢，会弄出声音。',
    cost: BREATH.SEARCH,
    noise: 2.5,
    blocked: searched ? '这里已经翻干净了' : null,
    perform: () => {
      ctx.searched.add(here.id);
      ctx.spendBreaths(BREATH.SEARCH, 'search', 0.4);
      ctx.makeNoise(2.5 * noiseMul, 'search');
      ctx.director.observe({ kind: 'search', thorough: true });
      ctx.pushLog(ctx.world.describe(), 'neutral');
      const found = here.mapped ? 0 : hidden;
      ctx.pushLog(
        found > 0
          ? `柜子后面还有东西 —— 摸出来 ${found} 处声呐照不到的地方。`
          : '翻完了。没有别的了。',
        found > 0 ? 'good' : 'neutral',
      );
      endTurn(ctx, BREATH.SEARCH);
    },
  });

  return out;
}

// ============================================================================
// 执行
// ============================================================================

function doMove(ctx: RunContext, doorId: ID): void {
  // 「是否第一次到」必须在 move 之前问 —— move 会把 visited 置真
  const door = ctx.wroom().doors.find((d) => d.id === doorId);
  const firstVisit = door ? !(ctx.world.topology.rooms.get(door.to)?.visited ?? true) : false;

  const res = ctx.world.move(doorId);
  ctx.director.observe({ kind: 'move', fast: false });

  if (!res.ok) {
    // 撞上一扇打不开的门也要付账 —— 否则试门就是免费情报
    if (res.cost > 0) ctx.spendBreaths(res.cost, 'blocked', 0.2);
    for (const line of ctx.world.drainLog()) ctx.pushLog(line.text, line.tone);
    endTurn(ctx, res.cost);
    return;
  }

  // 注意：world.move 内部已经把移动噪音记进了目标房间，这里不能重复记账
  ctx.spendBreaths(res.cost, 'move', 0.35);
  for (const ev of res.events) ctx.bus.emit('world:event', ev);
  for (const line of ctx.world.drainLog()) ctx.pushLog(line.text, line.tone);
  ctx.applyEffects(ctx.world.drainEffects());

  const arrived = res.arrivedAt!;
  ctx.pushLog(ctx.world.describe(arrived), 'neutral');
  endTurn(ctx, res.cost);
  // 进房的叙事放在世界演化之后，避免叙事开着的时候世界又动了一次
  ctx.enterRoom(arrived, firstVisit);
}

function doPing(ctx: RunContext, mode: SonarMode, onPing: (p: PingOutcome) => void): void {
  const spec = SONAR_MODES[mode];
  const sweep = ctx.world.sonar(mode, { absoluteFidelity: ctx.vitals.derived('sonarFidelity') });
  const result: SonarResult = {
    revealed: sweep.revealed,
    noise: sweep.noise,
    anomalies: sweep.anomalies,
    artifacts: sweep.artifacts,
  };

  ctx.spendBreaths(spec.cost, `sonar:${mode}`, 0.15);
  ctx.makeNoise(sweep.noise, `sonar:${mode}`);
  ctx.director.observe({ kind: 'sonar', power: POWER_OF[mode] / 7 });
  ctx.bus.emit('sonar:ping', result);

  ctx.pushLog(
    mode === 'passive'
      ? `你贴着舱壁听。${sweep.revealed.length} 个回声。`
      : `${spec.label}。${sweep.revealed.length} 个回波返回${
          sweep.artifacts.length ? `，其中 ${sweep.artifacts.length} 个对不上` : ''
        }。`,
    sweep.anomalies.length ? 'eerie' : 'neutral',
  );
  for (const a of sweep.anomalies) {
    ctx.pushLog(`异常回波：${a.signature}`, 'bad');
  }

  onPing({ sweep, result, power: POWER_OF[mode] });
  endTurn(ctx, spec.cost);
}

function doProp(
  ctx: RunContext,
  cost: Breaths,
  node: ID | undefined,
  effects: readonly import('@/core/contract').Effect[] | undefined,
): void {
  ctx.spendBreaths(cost, 'interact', 0.3);
  if (effects?.length) ctx.applyEffects(effects);
  endTurn(ctx, cost);
  if (node) {
    ctx.narrative.start(node);
    ctx.setPhase('narrative');
  }
}

/**
 * 回合收尾：世界演化、导演出牌、把状态推回世界。
 * 每个消耗呼吸的动作都必须走这里 —— 否则玩家可以靠某个动作"免费"跳过世界的回合。
 */
export function endTurn(ctx: RunContext, breaths: Breaths): void {
  if (breaths > 0) ctx.advanceWorld(breaths);
  ctx.runDirector();
  ctx.syncRuntime();
}

// ============================================================================
// 文案
// ============================================================================

function doorLabel(role: string, deckDelta: number): string {
  if (deckDelta > 0) return '向下的舱口';
  if (deckDelta < 0) return '向上的舱口';
  switch (role) {
    case 'descent':
      return '竖井';
    case 'shortcut':
      return '侧门';
    case 'secret':
      return '缝隙';
    default:
      return '舱门';
  }
}

function sonarDetail(mode: SonarMode, radius: number): string {
  switch (mode) {
    case 'passive':
      return `只听，不发声。${radius} 跳内，而且听不真切。`;
    case 'chirp':
      return `一声短促的敲击。${radius} 跳。外面的东西可能会听见。`;
    default:
      return `全功率。${radius} 跳，看得很清楚。整条船都会知道你在哪。`;
  }
}

function propDetail(prop: Prop, san: number): string {
  return prop.describe(san);
}

function itemDetail(kind: string, count: number, durability?: number): string {
  const bits: string[] = [];
  if (count > 1) bits.push(`还有 ${count} 个`);
  if (durability !== undefined) bits.push(`磨损后还剩 ${durability} 次`);
  bits.push(kind === 'consumable' ? '用掉就没了' : '用完还在手上');
  return bits.join(' · ');
}
