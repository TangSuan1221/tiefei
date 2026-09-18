/**
 * world/index.ts — 世界模块的公开面
 *
 * 其他 Agent 只应该从这里 import。内部文件（graph.ts、content/**）不保证稳定。
 */

export { World, createWorld } from './world';
export type { WorldRuntime, WorldTurnOutput, WorldLogLine } from './world';

export { DEFAULT_WORLD_CONFIG, generateWorld, spawnPhantomRoom } from './generator';
export type { GenerateResult } from './generator';

export {
  descentIndependence,
  doorAllowedForSolver,
  gradeLevel,
  repairForSolvability,
  roomsReachableWithoutKey,
  solve,
} from './solver';
export type { QualityGrade, RepairResult } from './solver';

export {
  SONAR_MODES,
  modeFromPower,
  propagate,
  sonarModeTable,
  sweep,
  toSonarResult,
  buildEchoTaps,
} from './sonar';
export type { EntityHint, SweepOptions, PropagationNode } from './sonar';

export {
  PULL_TOWARD_DECK,
  REWEAVE_RULES,
  checkDoorMark,
  insight as reweaveInsight,
  markDoor,
  markedDoors,
  reweave,
  stillSolvable,
} from './reweave';
export type { ReweaveInsight, ReweaveOptions } from './reweave';

export {
  GUARANTEED_SETPIECES,
  OPTIONAL_SETPIECES,
  SETPIECES,
  SETPIECE_COUNT,
  mirrorTrace,
  setpiece,
  setpieceOf,
} from './setpieces';

export {
  ALL_ROOM_VARIANTS,
  PICKABLE_VARIANT_COUNT,
  ROOM_VARIANT_COUNT,
  VARIANTS_PER_ARCHETYPE,
  assertRoomCoverage,
  describeRoom,
  pickVariant,
  roomVariant,
  variantsOfArchetype,
} from './rooms';

export {
  ALL_PROP_DEFS,
  PROP_COUNT,
  PROP_KIND_COVERAGE,
  assertPropCoverage,
  describeProp,
  instantiateProp,
  propDef,
  propDefsOfKind,
  propDisplayName,
  rehydrateProp,
  unconditionalSourcesOf,
} from './props';

export { ARCHETYPE_GLYPH, ARCHETYPE_LABEL, DECKS, DECK_DEPTH, deckDepth, deckSpec } from './decks';

export type {
  DoorMark,
  DoorMarkVerdict,
  DoorRole,
  EchoTap,
  ListenerState,
  PropDef,
  ReweaveRecord,
  ReweaveReport,
  RoomVariant,
  SetpieceDef,
  SolveReport,
  SolverOptions,
  SonarAnomaly,
  SonarMode,
  SonarModeSpec,
  SonarSweep,
  WorldDoor,
  WorldGraph,
  WorldRoom,
} from './types';

export { sanTier, propDefIdOf } from './types';

import { assertPropCoverage } from './props';
import { assertRoomCoverage } from './rooms';

/**
 * 内容自检。game 层启动时调一次，把内容错误暴露在启动，
 * 而不是暴露在玩家第 700 次生成时的一个空房间里。
 */
export function assertWorldContent(): void {
  assertPropCoverage();
  assertRoomCoverage();
}
