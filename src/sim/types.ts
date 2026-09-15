/**
 * sim 模块内部的补充类型。
 * ------------------------------------------------------------
 * 这些类型**不属于** `src/core/contract.ts`，因为它们只在 sim 内部（以及主循环调用 sim 时）
 * 使用，把它们塞进全局契约只会增加其他 Agent 的心智负担。
 * 若主 Agent 认为其中某个应当升格为跨模块协议，见 docs/sim-spec.md 的
 * "CONTRACT CHANGE REQUEST" 一节。
 */

import type { Breaths, DeathCause, ID, SimEvent, StigmaKind, Vitals } from '../core/contract.ts';

/** VitalsEngine 每一步驱动 Veracity 用的输入。 */
export interface VeracityDriveInput {
  vitals: Readonly<Vitals>;
  depth: number;
  /** 聆听印记层数 —— corruption 公式的第四项 (GDD §5)。 */
  stigmaListening: number;
  /** 由状态效果提供的临时清明度（区别于 debunk 累积的永久值）。 */
  effectLucidity: number;
  breathsElapsed: Breaths;
  /** 本步推进的呼吸数，用于污染度的平滑积分。 */
  dt: number;
}

/**
 * VitalsEngine 只需要感知过滤器的这一小块能力。
 * 用窄接口而不是直接依赖 VeracityEngine，是为了避免 sim 内部形成实现级循环依赖，
 * 也让单元测试可以塞一个"永远说真话"的假过滤器进去。
 */
export interface PerceptionFilter {
  readonly corruption: number;
  number(raw: number, stat: string): number;
  update(input: VeracityDriveInput): void;
}

/** 屏息状态的完整快照，HUD 与音频层都读它。 */
export interface BreathHoldState {
  holding: boolean;
  /** 本次已屏息的呼吸数。 */
  heldFor: Breaths;
  /** 距离强制大喘气还有几个呼吸（已计入恐惧加成）。Infinity = 未在屏息。 */
  untilForcedGasp: Breaths;
  /** 本次屏息累计省下的氧气。用于给玩家"这波值不值"的即时反馈。 */
  oxygenSaved: number;
}

/** 大喘气 / 主动吐气的结果。噪音由调用方注入到世界的噪音预算里。 */
export interface ExhaleResult {
  kind: 'gasp' | 'release' | 'none';
  events: SimEvent[];
  noise: number;
  oxygenSaved: number;
  heldFor: Breaths;
}

/** 导演 AI 通过这个口子被喂玩家行为，避免它去猜 flags 的命名。 */
export type ObservedAction =
  | { kind: 'sonar'; power: number }
  | { kind: 'search'; thorough: boolean }
  | { kind: 'move'; fast: boolean }
  | { kind: 'force'; noise: number }
  | { kind: 'melee' }
  | { kind: 'flee' }
  | { kind: 'freeze' }
  | { kind: 'hide' }
  | { kind: 'ritual'; stigma: StigmaKind }
  | { kind: 'hold-breath'; breaths: Breaths }
  | { kind: 'debunk'; lie: ID }
  | { kind: 'rest' };

/** 死亡记录，给元进度与平衡模拟器用。 */
export interface DeathRecord {
  cause: DeathCause;
  atBreath: Breaths;
  depth: number;
  finalVitals: Vitals;
}
