import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {HARBOR_R28_TASKS} from '../../../src/pod/content/harbor-r28-videos.ts';
import {harborTaskPrompt,harborSpeechParts,HARBOR_TASK_REFERENCE} from '../../../src/pod/content/harbor-task-videos.ts';
import {level01} from '../../../src/story-pipeline/level-01.ts';
import {buildFootagePrompt} from '../../../src/pod/content/footage.ts';
const root=process.cwd();
const out=path.join(root,'output/level-01-video-prompts-2026-10-30');
const wrapper='Use the attached Elias task image as the character, equipment and location reference. Reframe it as his arm-length selfie as instructed; preserve task evidence and the dry or flooded state. Do not copy its external observer viewpoint. Do not reproduce the reference sheet as an opening or ending frame. ';
const photoWrapper='Use the attached image as an environment and camera reference, not an exact opening frame. Add only the described generated creatures; preserve the architecture, camera and lighting. Do not reproduce the reference sheet as an opening or ending frame. ';
const supplement=new Set(['L1-R28-V02A','L1-R28-V03A','L1-R28-V04R','L1-R28-V07R']);
const tasks=Object.entries(HARBOR_R28_TASKS).map(([id,t])=>{
 const injured=['L1-R28-V07R','L1-R28-V08-INJURED'].includes(id);
 const speeches=harborSpeechParts(id);
 const blocks=speeches.map((speech,i)=>({number:i+1,file:`${id}-P${String(i+1).padStart(2,'0')}.mp4`,duration:10,speech,prompt:wrapper+harborTaskPrompt(id,injured,i)}));
 const s=level01.shots.find(s=>s.id===id);
 return {id,...t,injured,kind:id.endsWith('-QUIET')||id.endsWith('-STORED')||id.endsWith('-INJURED')?'条件变体':supplement.has(id)?'补充节点':'主线',trigger:s.note.replace(/^触发：/,'').split(' 实际生成SPEECH')[0],parts:blocks,fullPrompt:wrapper+harborTaskPrompt(id,injured)};
});
const creature='Harbor creature, one individual: pale grey-beige continuous fleshy skin, low elongated body, articulated crawling limbs, closed mouth. Generate this creature in the recorded scene; it is intentionally absent from the environment reference image. It is not a shark or fish.';
const outcomes=[
 ['P01','当前水域观察','Record only the present positions; no predicted escape or attack.','没有更高优先级结果时，仅记录当前位置，不预测攻击或救援。'],
 ['P02','已入货舱未隔离','The creature is already inside the cargo enclosure. Show only slow movement within it; do not exit, cross the gate, attack or invent a new event.','怪物已经在货舱内但尚未完成隔离；不是拍摄它从门外跨门进入。'],
 ['P03','闸门已关闭','Cargo gate already closed; creature remains confined.','已经关闸并真实隔离；不能让闸门在片中再次升降，也不能擅自画成密封实墙。'],
 ['P04','人员已受伤并退回','Elias is already injured and has retreated; do not replay the attack.','伤害已经发生且人员已退回；仅在未命中更高优先级结果时使用，不拍袭击重演。'],
 ['P05','人员已抵达安全处','Elias has reached the inner safe room.','人员已到达安全处是后台已发生的结果；玩家镜头仍在水下，不切进人员房间，不画艾里亚斯。'],
];
const photos=[];
for(const [id,title,outcome,condition] of outcomes){
 for(const visible of [true,false]){
  const context={generatedMonsters:true,story:visible,settled:false,stateKey:'offline-export-example',nearestMonster:20,scene:'Flooded industrial harbor, broken partition bridge and cargo isolation grille. Preserve the current camera image.',actors:[],monsters:visible?[creature]:[],outcome};
  photos.push({id:id+(visible?'-VISIBLE':'-HIDDEN'),title,visible,condition,duration:visible?10:5,prompt:photoWrapper+buildFootagePrompt({videoContext:context})});
 }
}
const sources=['docs/level-metrics.md','docs/level-01-pipeline-revision-2026-10-28.md','docs/level-01-production-2026-10-28.md','src/pod/content/harbor-r28-videos.ts','src/pod/content/harbor-task-videos.ts','src/pod/content/elias-video-atoms.ts','src/pod/content/fixed-camera.ts','src/pod/content/video-policy.ts','src/pod/content/footage.ts','src/pod/net/video.ts','src/pod/sim/harbor-simple-flow.ts','src/pod/view/deepsea/harbor-task-player.ts','src/pod/view/deepsea/harbor-rescue-site.ts','src/story-pipeline/level-01.ts'];
const manifest={date:'2026-10-30',scope:'main-authored / new game / HarborSimpleFlow v3',reference:path.join(root,'public',HARBOR_TASK_REFERENCE),tasks,photos,sources:sources.map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')}))};
fs.writeFileSync(path.join(out,'.work/catalogue.json'),JSON.stringify(manifest,null,2),'utf8');
fs.copyFileSync(path.join(root,'public',HARBOR_TASK_REFERENCE),path.join(out,'艾里亚斯角色参考图.png'));
const text=[
 '第一关全部视频生成提示词',
 '导出日期 2026年10月30日  当前工作区 R28 新开局版本',
 '固定通讯：15个条目，41段，每段10秒。含互斥版本，不是一次通关全播41段。',
 '以下 BEGIN PROMPT 与 END PROMPT 之间是可直接复制的完整文本。编号、时长与文件名不是画面文字，不要一并粘贴。',
 '通讯片上传同目录的 艾里亚斯角色参考图.png，选择角色参考或参考图模式，不设成首帧或尾帧。人物必须戴封闭潜水头盔。',
 '画幅16比9为外部制作建议，并非代码强制参数。10秒是当前通讯请求值。分段遵循代码，不改台词。',
 '视频没有原生语音时，可将每段 SPEECH 后的原文交给单独配音工具；勿让模型把对白画成字幕。',
 '同条通讯的各段保持角色、房间、机位、音色和伤情一致，按P01、P02顺序拼接。尽量沿用一致的角色与场景参考，不用前片结尾强设下一片首帧。',
 '第一部分 固定通讯完整分段提示词',
];
for(const t of tasks){
 text.push('\n'+'='.repeat(72),`${t.id}  ${t.title}  ${t.kind}`,`触发 ${t.trigger}`,`共${t.parts.length}段  合计${t.parts.length*10}秒  伤情 ${t.injured?'保留轻微肩伤':'无已记录伤情'}`);
 for(const p of t.parts)text.push('\n'+ '-'.repeat(60),`文件 ${p.file}  时长 ${p.duration}秒`,`台词核对 ${p.speech}`,'BEGIN PROMPT',p.prompt,'END PROMPT');
}
text.push('\n第二部分 玩家摄影视角动态模板',
 '这不是新增任务片清单。摄影提示词由真实机位、可见性和结果状态动态生成，无法预先穷举所有实际照片。以下覆盖当前代码5类结果文案，各给出目标可见与不可见两种例子，共10份。',
 '每份必须上传对应真实机位的环境截图，不能上传人物设定图。环境图不含3D怪物是现行流程的有意设计。画面里不出现艾里亚斯。',
 'VISIBLE仅用于目标在真实光学视野中且取景有效，例子对应剧情摄影10秒；HIDDEN用于不可见，例子对应普通摄影5秒；普通摄影若最近怪物超过30米，代码不提交生成。模板不会证明实际拍摄门禁已经通过。',
 '结果优先级：已入仓且未隔离 > 人员已安全抵达 > 已隔离 > 已受伤退回 > 当前位置。以实际状态选择，不能按期望结果选择。',
 'P03用于核验隔离时，当前截图必须让关闭的闸门与仓内目标同时可见；HIDDEN不构成有效隔离证据。',
 'P04/P05中的人员状态只是已发生的后台事实，不授予玩家隔墙看人或切入干燥房间的权限。',
 '照片素材在外部生成成功，不等于游戏接入或正式证据；当前交付未改变缓存、存档、门禁和视频接口。');
for(const p of photos)text.push('\n'+'='.repeat(72),`${p.id} ${p.title} ${p.visible?'目标真实可见':'目标不可见'}`,`条件 ${p.condition}`,`示例时长 ${p.duration}秒`,'BEGIN PROMPT',p.prompt,'END PROMPT');
text.push('\n第三部分 使用边界和排错',
 '保持原对白。V05“这样它就找不到你了”是确认稿原文，不扩写为绝对无敌；V06“上传给总部”不是已收到总部回执；V02密码已发给门控，不显示密码字符串，不要求玩家输入规定文字。',
 'R28代码把多数节点共用同一表演句，V07R未额外写出按肩动作。本导出保留这条事实，只按运行时injured=true携带肩伤，不冒称已有更细分表演。',
 'SELFIE中“helmet camera”表述应服从最高优先级的手持臂长自拍合同：镜头看得到艾里亚斯头盔与上身，不是眼睛朝外的头戴主观视角。',
 '同一人物造型参考图不提供实际调度室布景，本包也不伪造一张已经存在的房间参考图。跨段房间一致性仍需外部生成与审看确认。',
 '如实际剧情后续仍带伤而再次使用某条同ID通讯，injured参数仍须保持true。本包固定伤情版本为V07R与V08-INJURED，不能把伤情凭空抹去。',
 '不要加入旧八小时版本、旧面对面救援摄影、第二章尸体摄像仪与三种生物、供水或动态密码任务。不要提前露出头盔内面孔、尸体身份、袖口异常或Panacea真相。',
 '没有在本次任务调用任何付费视频生成服务。所有分段时长是请求值与制作安排，不是已经生成或验收的媒体时长。',
 '来源和哈希保存在 .work/catalogue.json，供本地复查。');
fs.writeFileSync(path.join(out,'第一关视频完整分段提示词.txt'),'\uFEFF'+text.join('\n\n')+'\n','utf8');
console.log(JSON.stringify({tasks:tasks.length,parts:tasks.reduce((n,t)=>n+t.parts.length,0),photos:photos.length,output:out}));
