import type { CreatureId } from './creatures';

export type FootageState = 'calm' | 'anomaly' | 'pursuit' | 'attack' | 'aftermath';
export interface FootageDirection {
  state: FootageState;
  act: number;
  repeat: number;
  intensity: number;
  evidence: boolean;
  trace: string;
  traceCN: string;
  fauna: CreatureId[];
  /** Evidence can exist without identifying a body. */
  identified: CreatureId | null;
  encounter: number | null;
  episode: string;
  capturedAt: number;
  noise: number;
  lamp: boolean;
  motion: number;
  hull: number;
  aim: number;
}

export const FOOTAGE_STATE_CN: Record<FootageState, string> = {
  calm: '平静探索', anomaly: '异常初现', pursuit: '持续追踪', attack: '攻击前兆', aftermath: '事后余波',
};

const TRACES = [
  ['Marine snow reverses direction around a sharply bounded empty patch for one full second.', '第三秒，悬浮物绕过一块空水，又逆流回来。'],
  ['Three parallel fresh dents appear in sequence on steel without anything visibly touching it.', '三道新凹痕依次出现在钢板上，没有东西碰过那里。'],
  ['A jointed shadow crosses the beam against the current; its source remains outside the frame.', '阴影逆着水流穿过灯束，投下它的东西仍在画外。'],
  ['The same three marks advance from the far wall to the camera housing during the five seconds.', '相同的三道痕迹从远处移到镜头护罩上。'],
  ['Reflections reproduce the camera mount from an impossible reverse angle; the marks stop beside the lens.', '反光里出现摄影机背面，痕迹停在镜头旁。'],
  ['The empty patch folds around the lens while fresh pressure marks form from the inside of its sealed port.', '空水朝镜头合拢，密封玻璃内侧出现新的压痕。'],
] as const;

/** The roll is supplied by a dedicated seeded stream; rendering never rolls again. */
export function directFootage(input: Omit<FootageDirection, 'intensity' | 'evidence' | 'trace' | 'traceCN' | 'fauna' | 'identified'> & {
  roll: number; target: CreatureId | null; visible: boolean;
}): FootageDirection {
  const base = { calm: 0, anomaly: 1, pursuit: 2, attack: 4, aftermath: 1 }[input.state];
  const active = input.state === 'anomaly' || input.state === 'pursuit' || input.state === 'attack';
  // No random creature in the tutorial. Later calm reels: 3–8% indirect evidence only.
  const rare = input.state === 'calm' && input.act > 0 && input.roll < Math.min(0.08, 0.02 + input.act * 0.01);
  const evidence = active || rare || input.state === 'aftermath';
  const intensity = active ? Math.min(6, base + Math.max(0, input.repeat - 1) + Math.floor(input.act / 3))
    : evidence ? 1 : 0;
  const trace = input.state === 'aftermath'
    ? ['Residual scrape marks and disturbed silt remain still; nothing approaches and no new attack occurs.', '擦痕还在，淤泥缓慢落下。片中没有新的靠近。']
    : TRACES[Math.max(0, intensity - 1)];
  const pool: CreatureId[] = ['cre.jelly', 'cre.school', 'cre.crab', 'cre.siphon'];
  const fauna = input.state === 'calm' && !rare && input.roll < 0.75
    ? [pool[Math.min(3, Math.floor(input.roll / 0.75 * 4))]] : [];
  const { roll, target, visible, ...snapshot } = input;
  return { ...snapshot, intensity, evidence, trace: evidence ? trace[0] : '', traceCN: evidence ? trace[1] : '', fauna,
    identified: active && (input.state === 'attack' || (visible && input.aim > 0.35)) ? target : null };
}

const TEMPLATES: Record<FootageState, string> = {
  calm: 'Quiet exploration. Emphasize remarkable but ordinary deep-sea life, suspended minerals and flooded industrial habitat. No pursuit, attack, lurking body or jump scare.',
  anomaly: 'An anomaly has been detected. A concrete, legible physical trace MUST appear in this recording even if the source is outside the beam. This is not an empty establishing shot.',
  pursuit: 'An unresolved presence is following the pod. Repeat the established anomaly motif closer to the camera. Preserve evidence rather than replacing it with random hallucinations.',
  attack: 'A creature is striking the submarine. The selected creature is the principal visible subject, not the consequences of its attack. Its recognizable anatomy approaches and makes physical contact beside the lens; keep the body readable throughout seconds 1–4, including the moment of impact. One short camera jolt is secondary. Do not substitute falling rubble, stones, dust, structural collapse, empty-room shaking or symbols for the creature. Do not invent a completed breach, death, or a resolved encounter.',
  aftermath: 'The immediate encounter has ended. Record its residue and settling particles. Do not restart the attack or place an active pursuer in this tape.',
};

const ACT_CONTEXT = [
  'A recent industrial accident remains a plausible explanation. No cult reveal.',
  'Maintenance is unnaturally recent; matching pipe forks and industrial lacquer.',
  'A familiar industrial marking recurs; the route seems to remember earlier passage.',
  'Nearly identical chambers contradict the expected route; distrust without revealing the ending.',
  'Abandoned equipment still runs on a repeated work cycle.',
  'A vertical service gallery creates the sense of an unseen escort.',
  'An implausibly clean rescue shaft; preserve uncertainty about escape.',
];

export function directionClause(d: FootageDirection, tracesOnly = false): string {
  return [
    `Five-second recovered recording. Template: ${d.state}. ${TEMPLATES[d.state]}`,
    `Narrative act ${d.act + 1}: ${ACT_CONTEXT[d.act] ?? ACT_CONTEXT[6]}`,
    `Recording ${d.repeat} of this episode; dread intensity ${d.intensity}/6.`,
    d.state==='calm'?'Motion contract: gentle water drift and selected ordinary fauna only. Architecture stays still; no falling stones, rubble, impact or collapse.':
    d.state==='anomaly'?'Motion contract: only the selected anomalous evidence changes. No falling stones, rubble, impact or collapse.':
    d.state==='pursuit'?'Motion contract: the selected presence or trace approaches continuously. No impact yet, no falling stones, rubble or collapse.':
    d.state==='aftermath'?'Motion contract: an already quiet scene with stationary damage and gently drifting fine particles, not falling rubble, a new strike or structural collapse.':
    'Motion contract: creature movement and visible contact are mandatory; environmental debris is not the subject. No falling stones or staged rubble sequence.',
    d.state==='attack'&&d.identified&&!tracesOnly ? 'Keep the selected subject readable for at least two seconds; no replacement by symbols, lettering, empty water or abstract marks.' : d.evidence ? `Mandatory observable evidence: ${d.trace} Preserve it for at least one second, clearly distinguishable from static.`
      : 'No supernatural trace, silhouette, face or hidden monster in this recording.',
    'Seconds 0–1 establish the actual surroundings; seconds 1–4 show the selected subject or evidence changing; second 4–5 leaves a readable final state.',
    `At exposure: lamp ${d.lamp ? 'on' : 'off'}, mechanical noise ${d.noise.toFixed(2)}, propulsion ${d.motion}/3, hull integrity ${Math.round(d.hull * 100)}%.`,
    !d.lamp && d.evidence ? 'The searchlight remains off; sensor gain and existing dim practical or biological light reveal the subject without introducing a new floodlight.' : '',
    tracesOnly || !d.identified ? 'No visible monster anatomy. Use only the selected environmental evidence, never an identifiable body.' : '',
    'This is a record of the exposure, not a live view. Do not invent later actions, new locations or future plot revelations.',
  ].filter(Boolean).join(' ');
}

/** Exact content identity, not a room key: different states can never share a reel. */
export function footageCacheKey(prompt: string, fallbackPrompt: string): string {
  return `footage-v3:${JSON.stringify([prompt, fallbackPrompt])}`;
}
