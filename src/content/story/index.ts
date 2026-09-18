/**
 * 剧情内容装配。
 *
 * 这是 Agent C 交给其他系统的唯一入口：
 *   import { STORY } from '../content/story';
 *   const narrative = new NarrativeEngine(STORY, host);
 *
 * entries = 所有带 'entry' 标签的节点。世界/道具/导演只允许 start() 这些 id。
 */

import type { ID, NarrativeNode } from '../../core/contract';
import type { StoryPack } from '../../narrative/engine';
import { ENDING_NODES, ENDINGS } from './endings';
import { KNOWLEDGE } from './knowledge';
import { LEDGER_NODES } from './ledger';
import { LIE_NODES } from './lies';
import { LOG_NODES } from './logs';
import { CHOIR_NODES } from './npc-choir';
import { DORN_NODES } from './npc-dorn';
import { MOTHER_NODES } from './npc-mother';
import { PELLE_NODES } from './npc-pelle';
import { VANCE_NODES } from './npc-vance';
import { YOURSELF_NODES } from './npc-yourself';
import { PROLOGUE_NODES } from './prologue';
import { RITUAL_NODES } from './rituals';
import { ROOM_NODES } from './room-events';

export const ALL_NODES: readonly NarrativeNode[] = [
  ...PROLOGUE_NODES,
  ...VANCE_NODES,
  ...MOTHER_NODES,
  ...DORN_NODES,
  ...CHOIR_NODES,
  ...PELLE_NODES,
  ...YOURSELF_NODES,
  ...RITUAL_NODES,
  ...LOG_NODES,
  ...ROOM_NODES,
  ...LEDGER_NODES,
  ...LIE_NODES,
  ...ENDING_NODES,
];

export const ENTRY_NODES: readonly ID[] = ALL_NODES.filter((n) => n.tags?.includes('entry')).map(
  (n) => n.id,
);

export const STORY: StoryPack = {
  nodes: ALL_NODES,
  endings: ENDINGS,
  knowledge: KNOWLEDGE,
  entries: ENTRY_NODES,
};

export { ENDINGS, KNOWLEDGE };
export { EXTERNAL_FLAGS, ITEM_REFS, ENTITY_REFS, ENCOUNTER_REFS, STATUS_REFS, DOOR_REFS, SFX_REFS } from './refs';
