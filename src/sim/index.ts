/**
 * sim 模块的对外门面。
 * 其他模块请**只**从这里 import，不要深入到具体文件——
 * 这样 Agent A 内部重构时不会波及任何人。
 */

export { VitalsEngine } from './vitals.ts';
export { VeracityEngine } from './veracity.ts';
export { Director } from './director.ts';
export {
  STATUS_DEFS, STATUS_BY_ID, STATUS_COUNTS, HIDDEN_POOL, INFECTION_CHAIN,
  makeStatus, stackLimit, stigmaStatusFor, isTreatable,
} from './status.ts';
export { TUNING, BASELINE, THRESHOLDS, TRACKED_VITALS, DEPTH_RANGE } from './tuning.ts';
export type { TrackedVital } from './tuning.ts';
export type {
  BreathHoldState, DeathRecord, ExhaleResult, ObservedAction,
  PerceptionFilter, VeracityDriveInput,
} from './types.ts';
