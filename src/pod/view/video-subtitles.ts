/** 剧情视频字幕叠加层。版式见 content/video-subtitles.ts 的 VIDEO_SUBTITLE_STYLE（VR-116）。 */
import { cjk, layoutCJK } from '@/ui/typography';
import { VIDEO_SUBTITLE_STYLE as S, type SubtitleCue } from '../content/video-subtitles';

/**
 * 在录像画面矩形 (x,y,w,h) 底部居中画当前这条字幕。
 * time 是整卷（多段播放列表合计）的播放秒数。
 */
export function drawVideoSubtitle(
  ctx: CanvasRenderingContext2D,
  cues: readonly SubtitleCue[],
  time: number,
  x: number, y: number, w: number, h: number,
): void {
  const cue = cues.find(c => time >= c.start && time < c.end);
  if (!cue) return;
  const fs = Math.min(S.maxPx, Math.max(S.minPx, h * S.sizeRatio));
  const label = cue.speaker ? `${cue.speaker}：` : '';
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = cjk(fs, S.speakerWeight);
  const labelW = label ? ctx.measureText(label).width : 0;
  ctx.font = cjk(fs, S.weight);
  const maxW = w * S.safeWidth;
  // 说话人名占第一行行首，用全角空格占位参与断行，画的时候再换成琥珀色名字。
  const pad = label ? '　'.repeat(Math.ceil(labelW / Math.max(1, ctx.measureText('　').width))) : '';
  let lines = layoutCJK(ctx, pad + cue.text, maxW);
  if (lines.length > S.maxLines) lines = [...lines.slice(0, S.maxLines - 1), lines.slice(S.maxLines - 1).join('')];
  const lh = fs * S.lineHeight, bandH = lines.length * lh + fs * 0.5;
  const widest = Math.min(w - fs, Math.max(...lines.map(l => ctx.measureText(l).width)) + fs * 1.2);
  const bottom = y + h - h * S.bottomMargin;
  ctx.fillStyle = S.band;
  ctx.fillRect(x + (w - widest) / 2, bottom - bandH, widest, bandH);
  ctx.shadowColor = '#000';
  ctx.shadowBlur = Math.max(2, fs * 0.12);
  lines.forEach((line, i) => {
    const lw = ctx.measureText(line).width, lx = x + (w - lw) / 2, ly = bottom - bandH + fs * 0.25 + fs + i * lh;
    ctx.fillStyle = S.text;
    if (i === 0 && pad && line.startsWith(pad)) {
      ctx.fillText(line.slice(pad.length), lx + ctx.measureText(pad).width, ly, maxW);
      ctx.font = cjk(fs, S.speakerWeight);
      ctx.fillStyle = S.speaker;
      ctx.fillText(label, lx, ly);
      ctx.font = cjk(fs, S.weight);
    } else {
      ctx.fillText(line, lx, ly, maxW);
    }
  });
  ctx.restore();
}
