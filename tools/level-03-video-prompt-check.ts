import assert from 'node:assert/strict';
import fs from 'node:fs';
import {level03} from '../src/story-pipeline/level-03';
import {validate, simulate} from '../src/story-pipeline/model';
import {lockVideoCamera} from '../src/pod/content/fixed-camera';
import {eliasTaskReference} from '../src/pod/content/elias-video-atoms';

// 第三关视频提示词：与剧情状态机对齐、按每种表演组合拼装后检查长度与禁区。
const doc = fs.readFileSync('docs/video-prompts/level-03-abyssal-lab.md', 'utf8').replace(/\r\n/g, '\n');
const sections = new Map<string, string>();
for (const part of doc.split(/^## /m).slice(1)) sections.set(part.slice(0, part.indexOf(' ')), part);
const block = (id: string, name: string) => part(id).match(new RegExp('```' + name + '\\n([\\s\\S]*?)\\n```'))?.[1]?.trim();
const part = (id: string) => { const s = sections.get(id); assert.ok(s, `missing section ${id}`); return s; };

const prefix = { probe: block('VR-301', 'probe-prefix')!, pod: block('VR-301', 'pod-prefix')! };
const suffix = block('VR-301', 'suffix')!;
const profiles: Record<string, string> = {
  elias: block('VR-303', 'elias-profile')!, caretaker: block('VR-303', 'caretaker-profile')!,
  eels: block('VR-303', 'eel-profile')!, jellies: block('VR-303', 'jelly-profile')!,
};
for (const [k, v] of Object.entries({...prefix, suffix, ...profiles})) assert.ok(v, `VR block ${k} missing`);

// 1. 状态机本身：0 错误，三条预设都能走完（配额阻断那条除外），录像表演互不相同。
assert.deepEqual(validate(level03).filter(i => i.level === 'error'), []);
const runs = level03.presets.map(p => simulate(level03, p.picks, new Set(p.toggles)));
assert.deepEqual(runs.map(r => r.canClearChapter), [true, true, false]);
const perf = runs.map(r => r.events.flatMap(e => e.shots.flatMap(s => s.slots.map(x => x.hit?.key))).join('|'));
assert.equal(new Set(perf).size, perf.length, 'presets must produce different footage');

// 2. 每卷镜头都有提示词；多表演槽位必须在提示词里有同名占位与相同的表演键。
const vps = [...sections.keys()].filter(id => id.startsWith('VP-'));
const shotOf = (id: string) => part(id).match(/镜头：(L3-[EP]\d{2}[A-Z]?)/)?.[1];
const typeOf = (id: string) => part(id).match(/镜头：L3-[EP]\d{2}[A-Z]?(?: · 段\d\/\d)? · ([a-z-]+)/)?.[1];
for (const shot of level03.shots) {
  const ids = vps.filter(id => shotOf(id) === shot.id);
  assert.ok(ids.length, `${shot.id} has no video prompt`);
  for (const id of ids) assert.equal(typeOf(id), shot.videoType, `${id} video type differs from ${shot.id}`);
  for (const slot of shot.slots.filter(s => s.cases.length > 1)) {
    const using = ids.filter(id => block(id, 'prompt')!.includes(`{${slot.slot}}`));
    assert.ok(using.length, `${shot.id} slot ${slot.slot} never reaches a prompt`);
    for (const id of using) {
      const table = JSON.parse(block(id, 'slots') ?? '{}')[slot.slot] ?? {};
      assert.deepEqual(Object.keys(table).sort(), slot.cases.map(c => c.key).sort(), `${id} slot ${slot.slot} keys`);
    }
  }
}
assert.equal(new Set(vps.map(shotOf)).size, level03.shots.length, 'every VP maps to a pipeline shot');

// 3. 展开每段的全部表演组合，检查最终提交全文。
let composed = 0, longest = 0;
for (const id of vps) {
  const shot = level03.shots.find(s => s.id === shotOf(id))!;
  const body = block(id, 'prompt')!, slots: Record<string, Record<string, string>> = JSON.parse(block(id, 'slots') ?? '{}');
  const probe = shot.videoType === 'elias-story', limit = probe ? 3600 : 2200;
  const names = Object.keys(slots);
  const combos = names.reduce<Record<string, string>[]>((acc, n) => acc.flatMap(c => Object.keys(slots[n]).map(k => ({...c, [n]: k}))), [{}]);
  if (probe) assert.ok(body.includes('{elias}'), `${id} must inject Elias's appearance`);
  const fullCaretaker = body.includes('{caretaker}') && !slots.caretaker;
  if (fullCaretaker) assert.match(shot.id, /L3-E(08|10)/, `${id}: caretaker body only from tape 8 on`);
  for (const pick of combos) {
    let text = body;
    for (const n of names) text = text.replaceAll(`{${n}}`, slots[n][pick[n]]);
    for (const [k, v] of Object.entries(profiles)) text = text.replaceAll(`{${k}}`, v);
    assert.doesNotMatch(text, /\{[a-z]+\}/, `${id} unresolved slot`);
    const selfie=probe&&!['VP-313','VP-314','VP-315'].includes(id);
    const full = lockVideoCamera([probe?(selfie?prefix.probe:block('VR-301','fallen-probe-prefix')!):prefix.pod,text,suffix].join('\n'),selfie?'elias-selfie':'fixed');
    if(probe)assert.ok(fs.existsSync('public'+eliasTaskReference(shot.id,['VP-313','VP-314','VP-315'].includes(id)?1:0)));
    if(selfie){assert.match(full,/ELIAS SELFIE CAMERA/);assert.doesNotMatch(full,/CAMERA LOCK:|probe sits|probe is propped|probe is clipped/);}
    assert.ok(full.length <= limit, `${id} ${JSON.stringify(pick)} is ${full.length} chars (limit ${limit})`);
    assert.doesNotMatch(full, /\p{Script=Han}/u, `${id} contains Chinese`);
    assert.doesNotMatch(full, /Panacea|virus|infect|mutat/i, `${id} names the cause`);
    const beforeReveal = !/L3-E1[01]/.test(shot.id) && !/L3-P0[34]/.test(shot.id);
    if (beforeReveal) assert.doesNotMatch(full, /bubble|not breathing|no breath|bare face|helmet comes free|eyes open/i, `${id} spoils the reveal`);
    longest = Math.max(longest, full.length); composed++;
  }
}
assert.match(block('VP-314', 'prompt')!, /no bubbles/, 'reveal must state no bubbles');

console.log(`PASS level 3 video prompts: ${vps.length} segments, ${composed} compositions, longest ${longest} chars; pipeline presets ${perf.length} distinct`);
