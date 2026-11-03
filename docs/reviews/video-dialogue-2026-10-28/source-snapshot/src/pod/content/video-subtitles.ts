/**
 * 剧情视频字幕（VR-116，docs/video-prompts/structured-prompt-standard.md）。
 * 字幕由游戏叠加，不让视频模型烧录：模型画中文不可靠，且字幕必须与台词逐字一致。
 * 字幕原文与提示词 SPEECH 行（第一、二关）或剧情状态机 dialogue（第三关）同源，不另写一份。
 */

/** 版式常量。尺寸均为相对录像画面的比例，最终字号再夹到终端逻辑像素区间。 */
export const VIDEO_SUBTITLE_STYLE = {
  language: 'zh-CN',
  /** 字号 = 画面高 × sizeRatio，夹在 [minPx, maxPx]（分析台 1024×720 逻辑像素） */
  sizeRatio: 0.058,
  minPx: 20,
  maxPx: 34,
  weight: 500,
  speakerWeight: 600,
  lineHeight: 1.4,
  maxLines: 2,
  /** 单行建议上限；切条时按此估算，渲染时另按 safeWidth 实测断行 */
  maxCharsPerLine: 18,
  safeWidth: 0.86,
  /** 底带下沿离画面底边的距离 */
  bottomMargin: 0.06,
  text: '#ecebdd',
  speaker: '#f0bf78',
  band: 'rgba(4,10,12,.72)',
  /** 无逐字时间轴：开头留白、结尾留白与单条最短时长（秒） */
  leadIn: 0.4,
  tail: 0.3,
  minCue: 1.2,
} as const;

export interface SubtitleLine { speaker: string; text: string }
export interface SubtitleCue extends SubtitleLine { start: number; end: number }

const S = VIDEO_SUBTITLE_STYLE;
const CUE_CHARS = S.maxCharsPerLine * S.maxLines;
const visible = (text: string) => [...text.replace(/\s/g, '')].length;

/** 句末留问号、叹号、省略号；句号和逗号按中文字幕惯例去掉。 */
function tidy(text: string): string {
  return text.trim().replace(/[。，、；：,.;:]+$/u, '').trim();
}

/** 一段台词切成若干条：先按句末标点，单条超过两行再按逗号类标点切。 */
export function subtitleLines(speaker: string, speech: string): SubtitleLine[] {
  const out: SubtitleLine[] = [];
  for (const sentence of speech.match(/[^。！？!?…]+(?:[。！？!?]|…+)*/gu) ?? []) {
    let cue = '';
    for (const clause of sentence.match(/[^，、；,;]+[，、；,;]?/gu) ?? [sentence]) {
      if (cue && visible(cue + clause) > CUE_CHARS) { out.push({ speaker, text: tidy(cue) }); cue = ''; }
      cue += clause;
    }
    if (tidy(cue)) out.push({ speaker, text: tidy(cue) });
  }
  return out.filter(line => line.text);
}

/** 剧情状态机 dialogue：每行“说话人：内容”，没有说话人的行按旁白处理。 */
export function dialogueSubtitles(dialogue: string): SubtitleLine[] {
  return dialogue.split('\n').flatMap(raw => {
    const m = raw.trim().match(/^([^：:]{1,8})[：:](.+)$/u);
    return m ? subtitleLines(m[1]!.trim(), m[2]!) : subtitleLines('', raw);
  });
}

/**
 * 按字数比例分配每条字幕的起止。voice 是检测到的人声区间（整卷时间轴）：
 * 有就只铺在人声里，没有（无音轨、未分析完）就铺满片长扣除首尾留白。
 * 不是逐字对齐（GAP）：同一条内语速变化、长停顿仍可能让字幕略早或略晚。
 */
export function timeSubtitles(lines: readonly SubtitleLine[], duration: number, voice?: { start: number; end: number }): SubtitleCue[] {
  if (!lines.length || !(duration > 0)) return [];
  const usable = voice && voice.end - voice.start >= 0.5 && voice.end <= duration + 0.5;
  const start = usable ? Math.max(0, voice.start - 0.1) : Math.min(S.leadIn, duration * 0.1);
  const stop = usable ? Math.min(duration, voice.end + 0.4) : duration - Math.min(S.tail, duration * 0.05);
  const span = Math.max(0.1, stop - start);
  const weights = lines.map(line => Math.max(4, visible(line.text)));
  const total = weights.reduce((a, b) => a + b, 0);
  // 太短的条抬到 minCue，其余条按原比例分剩下的时长；总长始终等于 span。
  const floor = Math.min(S.minCue, span / lines.length);
  const short = weights.map(w => span * w / total < floor);
  const rest = span - floor * short.filter(Boolean).length;
  const restWeight = weights.reduce((sum, w, i) => short[i] ? sum : sum + w, 0);
  let at = start;
  return lines.map((line, i) => {
    const length = short[i] ? floor : rest * weights[i]! / restWeight;
    const cue = { ...line, start: at, end: i === lines.length - 1 ? start + span : Math.min(start + span, at + length) };
    at = cue.end;
    return cue;
  });
}
