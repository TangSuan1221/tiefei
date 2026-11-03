// VR-116 剧情视频字幕与原声：台词切条、时间轴与静音回归检查（本地，不调用视频接口）。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { VIDEO_SUBTITLE_STYLE as S, dialogueSubtitles, subtitleLines, timeSubtitles } from '../src/pod/content/video-subtitles';
import { HARBOR_TASKS, harborTaskSubtitles, type HarborTaskId } from '../src/pod/content/harbor-task-videos';
import { LIVING_TASKS, livingTaskSubtitles, type LivingTaskId } from '../src/pod/content/living-task-videos';
import { level03 } from '../src/story-pipeline/level-03';

const count = (t: string) => [...t.replace(/\s/g, '')].length;
const strip = (t: string) => t.replace(/[\s。，、；：！？!?,.;:…]/gu, '');
let cues = 0;

function checkTrack(name: string, speech: string, lines: ReturnType<typeof subtitleLines>, duration: number) {
  assert.ok(lines.length > 0, `${name}: 没有字幕`);
  // 字幕与台词逐字同源：去掉标点后拼回去必须等于原台词
  assert.equal(strip(lines.map(l => l.text).join('')), strip(speech), `${name}: 字幕与台词不一致`);
  for (const l of lines) {
    assert.ok(count(l.text) <= S.maxCharsPerLine * S.maxLines, `${name}: 单条超过两行 “${l.text}”`);
    assert.ok(!/[。，、；：]$/u.test(l.text), `${name}: 句末残留标点 “${l.text}”`);
  }
  for (const voice of [undefined, { start: 1.6, end: duration - 0.5 }]) {
    const timed = timeSubtitles(lines, duration, voice);
    assert.equal(timed.length, lines.length);
    timed.forEach((c, i) => {
      assert.ok(c.end > c.start && c.start >= 0 && c.end <= duration, `${name}: 时间越界 ${c.start}-${c.end}`);
      if (i) assert.ok(Math.abs(c.start - timed[i - 1]!.end) < 1e-9, `${name}: 字幕间断或重叠`);
    });
    if (voice) assert.ok(timed[0]!.start >= voice.start - 0.11, `${name}: 字幕早于人声`);
  }
  cues += lines.length;
}

for (const id of Object.keys(HARBOR_TASKS) as HarborTaskId[]) {
  const lines = harborTaskSubtitles(id);
  assert.ok(lines.every(l => l.speaker === '艾里亚斯'));
  checkTrack(id, HARBOR_TASKS[id].speech, lines, 10);
}
for (const id of Object.keys(LIVING_TASKS) as LivingTaskId[]) {
  const speech = LIVING_TASKS[id].speech.replace('{code}', '4821');
  const lines = livingTaskSubtitles(id, '4821');
  assert.ok(!lines.some(l => l.text.includes('{code}')), `${id}: 授权编号未替换`);
  checkTrack(id, speech, lines, 10);
}
let dialogues = 0;
for (const shot of level03.shots) for (const slot of shot.slots) for (const c of slot.cases) if (c.dialogue) {
  const lines = dialogueSubtitles(c.dialogue);
  const spoken = c.dialogue.split('\n').map(l => l.replace(/^[^：:]{1,8}[：:]/u, '')).join('');
  checkTrack(`${shot.id}/${c.key}`, spoken, lines, 10);
  assert.ok(lines.every(l => !/[：:]/u.test(l.speaker)), `${shot.id}: 说话人解析失败`);
  dialogues++;
}

// 原声：剧情片不得再被硬静音；静音只跟随全局开关。
const footage = readFileSync('src/pod/view/footage.ts', 'utf8');
const creation = footage.slice(footage.indexOf("document.createElement('video')"), footage.indexOf('video.src = url'));
assert.ok(creation.includes('video.muted = isAudioMuted()') && !creation.includes('muted = true'), 'footage.ts 仍把录像硬静音');
assert.ok(/onAudioMute\(/.test(footage) && /NotAllowedError/.test(footage), '录像静音未跟随全局开关或缺少自动播放回落');
assert.ok(/drawVideoSubtitle\(/.test(footage), '分析台回放未叠加字幕');
// 提示词仍禁止模型烧录字幕（改动提示词会改变缓存键并重新计费，这里只做存在性检查）
for (const file of ['src/pod/content/harbor-task-videos.ts', 'src/pod/content/living-task-videos.ts'])
  assert.ok(/No (generated )?subtitles/.test(readFileSync(file, 'utf8')), `${file}: 缺少禁止烧录字幕条款`);

console.log(`PASS video subtitles: ${Object.keys(HARBOR_TASKS).length + Object.keys(LIVING_TASKS).length} 任务录像 + ${dialogues} 条第三关对白，共 ${cues} 条字幕；原声未硬静音`);
