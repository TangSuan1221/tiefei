import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const read=(p:string)=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const main=read('src/main.ts');
const stations=read('src/pod/view/stations.ts');
const present=read('src/pod/view/present.ts');
const camera=stations.slice(stations.indexOf('function drawCamera('),stations.indexOf('function drawFieldFx('));
const checks:[string,boolean][]=[
  ['API首帧保留1024输出',present.includes('frame.width = 1024; frame.height = 720;')],
  ['舱内扫描线与颗粒限制强度',present.includes('this.post.scanline = 0.035;')&&present.includes('Math.min(this.post.grain, 0.07)')],
  ['正式入口明确公司调查任务',main.includes('你受公司委派，下潜调查接驳港事故。')],
  ['独立探索明确为非正式入口',main.includes('非正式剧情入口')],
  ['继续入口不使用旧存档判断',!main.includes('save.hasRun()')],
  ['新港目标优先于旧战役目标',stations.includes("site?.objective?.trim() ||")],
  ['摄影窗不常驻长任务说明',!camera.includes('authoredSite.hint')],
  ['摄影窗不重复调用大冲洗面板',!camera.slice(0,camera.indexOf('// 臂画')).includes('drawShotStatus(')],
  ['提示词与失败明确非视频',stations.includes('提示词测试 · 未请求视频')&&stations.includes('视频生成失败 · 无可播放视频')],
  ['确定性底片有独立来源标签',stations.includes('确定性现场底片 · 非生成视频')],
  ['HUD无大块剧情底板',!present.includes('44+step*(lines.length+1)')],
  ['操作工位不叠全局日志',present.includes('const logs = run.at ? []')],
  ['完整字幕转入无线电',stations.includes('layoutCJK(ctx,run.storyCaption')],
  ['实物核验独立于录像分析',stations.includes("id: 'lab.evidence', key: '7'")&&stations.includes('analyzeEvidence?.(undefined)')],
  ['本地录像优先于远端失败并保留播放状态',stations.includes('return drawLabRecording(ctx,run,w,h,localPlaybackFor(run));')&&stations.indexOf('if ((tape?.sensorFrames?.length ?? 0) >= 3)')<stations.indexOf('const unavailable=')],
  ['本地录像分析不显示远端失败替代报告',stations.includes("(tape.sensorFrames?.length ?? 0) < 3 && (tape.videoResult==='failed' || tape.videoResult==='prompt')")],
];
for(const [name,ok] of checks){assert.ok(ok,name);console.log(`PASS ${name}`);}
console.log(`${checks.length} UI contract checks passed (source checks; not visual acceptance).`);
const playbackSource=stations.slice(stations.indexOf('const localPlaybackStates='),stations.indexOf('/** Transitional'));
const js=ts.transpile(playbackSource, {target:ts.ScriptTarget.ES2022});
const getPlayback=new Function(`${js};return localPlaybackFor;`)();
const run={clock:0,selectedTape:{id:'a'}};
const state=getPlayback(run);assert.equal(state.time,0);
run.clock=.2;getPlayback(run);assert.equal(state.time,.2);
state.paused=true;run.clock=8;getPlayback(run);assert.equal(state.time,.2);
state.paused=false;run.clock=8.1;getPlayback(run);assert.ok(Math.abs(state.time-.3)<.00001);
run.selectedTape.id='b';assert.equal(getPlayback(run).time,0);
console.log('PASS 本地播放计时、暂停、继续与换卷归零（执行实际函数）');
const post=read('src/render/post.ts');
assert.ok(post.includes(".f('uGlassWear', clamp01(extras.glassWear ?? 1))"));
assert.ok(post.includes('* 0.42 * uGlassWear'));
assert.ok(present.includes('this.extras.glassWear = harborCabin ? 0.025 : 1;'));
console.log('PASS 玻璃强度uniform接线与首关限定');
