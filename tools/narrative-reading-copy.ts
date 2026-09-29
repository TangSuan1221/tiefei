import {writeFileSync} from 'node:fs';
import {campaign} from '../src/narrative-lab/campaign';

// A reading copy for editorial review: engine conditions remain in the workbench.
const names={player:'你',vance:'万斯',elias:'埃利亚斯',niko:'尼科',lena:'莱娜'};
const out=['# 迟到的目击者：剧情阅读稿','',
 '这份稿件按场景排列。每个“选择”下面是该行动对应的录像和对白，并非所有选择都会在同一次游玩中发生。对白还受人物是否在场、是否收到消息等条件限制；条件详情在叙事工作台中查看。','',
 '你驾驶单人潜艇进入事故基地，岸上的接线员万斯通过无线电与你联络。舷窗外太暗，你需要拍摄、等待显影，再通过录像判断外面的情况。拍摄时必须先收回机械臂。',''];
for(const chapter of campaign.chapters){
 out.push(`## 第${chapter.id}章：${chapter.title}`,'');
 for(const scene of campaign.scenes.filter(s=>s.chapter===chapter.id)){
  out.push(`### ${scene.title}`, '',`地点：${scene.location}`,'',scene.entryText,'','**第一段录像**','',scene.scoutFootage,'');
  for(const c of scene.choices){
   out.push(`**选择：${c.label}**`,'','操作后再次拍摄。录像中：','',c.resultText,'');
   for(const line of c.npcLines)out.push(`${names[line.speaker]}：“${line.text}”`,'');
  }
  out.push('**看完录像后**','',scene.resolveText,'');
  for(const r of scene.resolutions)out.push(`- ${r.label}：${r.text}`,'');
 }
}
out.push('## 结局','');
for(const ending of campaign.endings)out.push(`### ${ending.title}`,'',ending.summary,'');
writeFileSync('docs/narrative-reading-copy.md',out.join('\n'),'utf8');
console.log('Written docs/narrative-reading-copy.md');
