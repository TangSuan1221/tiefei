import type { Creature, CreatureId } from './creatures';

/** Immutable ecology; hidden from the live camera and revealed by recorded evidence. */
export interface HunterProfile {
  rank: number;
  skill: 'echo' | 'eclipse' | 'corrosion' | 'intrusion';
  sound: number;
  light: number;
  motion: number;
  warning: number;
  tell: string;
  cue: string;
}

const SKILLS = {
  echo: { tell: '舱外有人用你的声音数呼吸。随后，三下重撞沿着舱壁移动。', cue: 'listener.call' },
  eclipse: { tell: '探照灯还亮着，电流表却倒转了。舱顶传来密集抓挠和一次重撞。', cue: 'listener.near' },
  corrosion: { tell: '钢板里传来咀嚼声。铆钉一颗颗弹响，接着是沉重的撞击。', cue: 'hull.rivet-pop' },
  intrusion: { tell: '舱外敲了两下，舱内回答了一下。门封正在从里面被拧开。', cue: 'san.reverse-voice' },
} as const;

export function hunterProfile(c: Creature, act: number): HunterProfile {
  const skill = c.id === 'cre.veil' || c.id === 'cre.runner' || c.id === 'cre.hollow'
    ? 'intrusion' : c.attractor === 'light' ? 'eclipse' : c.attractor === 'metal' ? 'corrosion' : 'echo';
  return {
    rank: c.danger === 0 ? 0 : Math.min(5, c.danger + Math.floor(act / 2)),
    skill,
    sound: c.attractor === 'noise' ? 1.8 : 0.65,
    light: c.attractor === 'light' ? 1.5 : 0.18,
    motion: c.attractor === 'metal' ? 1.8 : 0.65,
    warning: act === 0 ? 14 : Math.max(7, 12 - act * 0.7),
    ...SKILLS[skill],
  };
}

/** Seven narrative beats: accident, preparedness, memory, betrayal, machinery, escort, exit. */
export const HUNT_ACTS: readonly { creature: CreatureId; threshold: number; recovery: number }[] = [
  { creature: 'cre.hollow', threshold: 22, recovery: 65 },
  { creature: 'cre.chorus', threshold: 17, recovery: 55 },
  { creature: 'cre.weave', threshold: 15, recovery: 48 },
  { creature: 'cre.angler', threshold: 14, recovery: 45 },
  { creature: 'cre.acid', threshold: 13, recovery: 40 },
  { creature: 'cre.veil', threshold: 12, recovery: 36 },
  { creature: 'cre.runner', threshold: 16, recovery: 50 },
];

export function huntAct(act: number) { return HUNT_ACTS[Math.max(0, Math.min(6, act))]; }
