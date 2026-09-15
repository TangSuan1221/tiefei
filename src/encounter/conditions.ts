/**
 * Condition / Effect 的本地求值器。
 *
 * 为什么遭遇模块要自己有一份：契约把求值职责放在 `NarrativeSystem.test()` 上，
 * 但遭遇必须在**没有叙事系统在场**的情况下也能跑（战斗模拟器、单元测试、
 * 以及叙事系统尚未初始化的开场遭遇）。这份实现与叙事系统的语义保持一致，
 * 只是环境来源不同。
 */

import type {
  Condition,
  Effect,
  FlagStore,
  ID,
  InventorySystem,
  RoomArchetype,
  StigmaKind,
  Vitals,
  VitalsSystem,
} from '../core/contract';
import type { VitalsPatchFn } from './types';

export interface ConditionEnv {
  flags: FlagStore;
  vitals?: Readonly<Vitals>;
  inventory?: InventorySystem;
  stigma?: Record<StigmaKind, number>;
  roomArchetype?: RoomArchetype;
  depth?: number;
}

function cmp(a: number | string | boolean, op: string, b: number | string | boolean): boolean {
  switch (op) {
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    case '>':
      return Number(a) > Number(b);
    case '<':
      return Number(a) < Number(b);
    case '>=':
      return Number(a) >= Number(b);
    case '<=':
      return Number(a) <= Number(b);
    default:
      return false;
  }
}

export function testCondition(cond: Condition | undefined, env: ConditionEnv): boolean {
  if (!cond) return true;
  switch (cond.op) {
    case 'always':
      return true;
    case 'flag': {
      const v = env.flags.get(cond.key);
      if (v === undefined) {
        // 未设置的 flag 按类型给出中性默认值，避免内容作者必须显式初始化一切
        if (typeof cond.value === 'number') return cmp(0, cond.cmp, cond.value);
        if (typeof cond.value === 'boolean') return cmp(false, cond.cmp, cond.value);
        return cmp('', cond.cmp, cond.value);
      }
      return cmp(v, cond.cmp, cond.value);
    }
    case 'vital': {
      if (!env.vitals) return false;
      return cmp(env.vitals[cond.stat], cond.cmp, cond.value);
    }
    case 'has-item': {
      if (!env.inventory) return false;
      return env.inventory.count(cond.item) >= (cond.count ?? 1);
    }
    case 'has-knowledge':
      return env.flags.getBool(cond.node) || env.flags.getBool(`know.${cond.node}`);
    case 'stigma': {
      const v = env.stigma?.[cond.stigma] ?? env.flags.getNum(`stigma.${cond.stigma}`);
      return cmp(v, cond.cmp, cond.value);
    }
    case 'in-room':
      return env.roomArchetype === cond.archetype;
    case 'depth':
      return cmp(env.depth ?? 0, cond.cmp, cond.value);
    case 'all':
      return cond.of.every((c) => testCondition(c, env));
    case 'any':
      return cond.of.some((c) => testCondition(c, env));
    case 'not':
      return !testCondition(cond.of, env);
    default:
      return false;
  }
}

/** 遭遇模块自己消化的效果 op —— 其余的转交宿主系统 */
const LOCAL_OPS = new Set<Effect['op']>([
  'vital',
  'status',
  'remove-status',
  'item',
  'flag',
  'flag-add',
  'knowledge',
]);

export interface EffectSinks {
  flags: FlagStore;
  vitals?: VitalsSystem;
  patchVitals?: VitalsPatchFn;
  inventory?: InventorySystem;
  /** 状态效果注册表查询（由宿主注入；缺失时只记 flag，不吞掉信息） */
  statusLookup?: (id: ID) => Parameters<VitalsSystem['apply']>[0] | undefined;
}

/**
 * 应用一组效果，返回**未被本模块消化**的那些，由调用方转交宿主。
 * 这样设计是为了保证效果既不丢失也不被执行两次。
 */
export function applyEffects(effects: readonly Effect[] | undefined, sinks: EffectSinks): Effect[] {
  const forwarded: Effect[] = [];
  if (!effects) return forwarded;
  for (const e of effects) {
    if (!LOCAL_OPS.has(e.op)) {
      forwarded.push(e);
      continue;
    }
    switch (e.op) {
      case 'vital':
        sinks.patchVitals?.(e.stat, e.delta);
        break;
      case 'status': {
        const def = sinks.statusLookup?.(e.effect);
        if (def && sinks.vitals) {
          sinks.vitals.apply(e.duration !== undefined ? { ...def, duration: e.duration } : def);
        } else {
          // 没有状态表也要留痕，供 UI 与存档显示，绝不静默丢弃
          sinks.flags.set(`sys.pending-status.${e.effect}`, e.duration ?? -1);
          forwarded.push(e);
        }
        break;
      }
      case 'remove-status':
        sinks.vitals?.remove(e.effect);
        sinks.flags.set(`sys.pending-status.${e.effect}`, 0);
        break;
      case 'item':
        if (e.count >= 0) sinks.inventory?.add(e.item, e.count);
        else sinks.inventory?.remove(e.item, -e.count);
        break;
      case 'flag':
        sinks.flags.set(e.key, e.value);
        break;
      case 'flag-add':
        sinks.flags.add(e.key, e.delta);
        break;
      case 'knowledge':
        sinks.flags.set(e.node, true);
        sinks.flags.add('count.knowledge', 1);
        break;
      default:
        forwarded.push(e);
    }
  }
  return forwarded;
}
