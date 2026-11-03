/** Read-only export of authored video dialogue; never calls a media provider. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
import {HARBOR_TASKS,harborTaskPrompt,harborTaskSubtitles} from '../src/pod/content/harbor-task-videos';
import {LIVING_TASKS,livingTaskPrompt,livingTaskSubtitles,livingTaskLine} from '../src/pod/content/living-task-videos';
import {dialogueSubtitles} from '../src/pod/content/video-subtitles';
import {level01} from '../src/story-pipeline/level-01';
import {level02} from '../src/story-pipeline/level-02';
import {level03} from '../src/story-pipeline/level-03';
import {level04} from '../src/story-pipeline/level-04';
import {level05} from '../src/story-pipeline/level-05';

const root=process.cwd();
const out=path.join(root,'docs/reviews/video-dialogue-2026-10-28');
if(fs.existsSync(out))throw Error('Review folder already exists; do not overwrite a review annotated by the user.');
fs.mkdirSync(out,{recursive:true});
const files=new Set([
 'src/pod/content/harbor-task-videos.ts','src/pod/content/living-task-videos.ts','src/pod/content/abyssal-media.ts',
 'src/pod/content/video-subtitles.ts','src/pod/content/fixed-camera.ts','src/pod/content/elias-video-atoms.ts',
 'src/pod/content/footage.ts','src/pod/content/footage-director.ts','src/pod/content/video-policy.ts',
 'src/pod/sim/harbor-simple-flow.ts','src/pod/sim/harbor-opening.ts','src/pod/sim/harbor-rescue-dialogue.ts',
 'src/pod/sim/living-survey.ts','src/pod/sim/narrative-memory.ts',
 'src/pod/view/deepsea/harbor-task-player.ts','src/pod/view/deepsea/living-task-player.ts','src/pod/view/deepsea/abyssal-media-player.ts',
 'src/pod/view/deepsea/harbor-rescue-site.ts','src/pod/view/deepsea/living-deck-site.ts','src/pod/view/deepsea/abyssal-lab-site.ts',
 'src/pod/view/footage.ts','src/pod/view/video-subtitles.ts','src/pod/view/present.ts',
 'src/story-pipeline/runtime.ts','src/story-pipeline/model.ts',
 'src/story-pipeline/level-01.ts','src/story-pipeline/level-02.ts','src/story-pipeline/level-03.ts','src/story-pipeline/level-04.ts','src/story-pipeline/level-05.ts',
 'docs/level-metrics.md','docs/level-01-production-2026-10-26.md','docs/level-01-simple-production-2026-10-24.md',
 'docs/level-02-survey-production-2026-10-27.md','docs/level-03-elias-tapes.md','docs/level-03-abyssal-lab-design.md','docs/level-03-production-2026-10-24.md',
 'docs/story-split-route-2026-09-30.md','docs/story-alternate-scenes.md','docs/story-branch-design-2026-09-30.md','docs/story-panacea-audit.md',
 'docs/drafts/chapter-02-survey-reference/README.md','docs/drafts/chapter-02-survey-reference/survey-video-source.txt',
 ...fs.readdirSync(path.join(root,'docs/video-prompts')).filter(f=>f.endsWith('.md')).map(f=>'docs/video-prompts/'+f),
]);
const snapshots=new Map<string,Buffer>();
for(const f of files){if(!fs.existsSync(path.join(root,f)))throw Error('Missing source: '+f);snapshots.set(f,fs.readFileSync(path.join(root,f)));}
const text=(f:string)=>snapshots.get(f)!.toString('utf8');
const absolute=(f:string)=>path.join(root,f).replaceAll('\\','/');
const link=(label:string,f:string)=>`[${label}](${absolute(f)})`;
const source=(f:string)=>link(f,f);
const local=(name:string)=>link(name,'docs/reviews/video-dialogue-2026-10-28/'+name);
const quote=(s:string)=>s.split('\n').map(l=>'> '+l).join('\n');
const fence=(s:unknown,lang='json')=>'```'+lang+'\n'+(typeof s==='string'?s:JSON.stringify(s,null,2))+'\n```';
const field=(label:string,value:unknown)=>value===undefined?'':`**${label}**\n\n${typeof value==='string'?quote(value):fence(value)}\n\n`;
const write=(name:string,body:string)=>fs.writeFileSync(path.join(out,name),body,'utf8');
const where=(f:string,id:string)=>{const line=text(f).split('\n').findIndex(l=>l.includes("'"+id+"'"))+1;return `${source(f)}，原文件第 ${line} 行`;};
const condition=(v:any[])=>v.length?v.map(x=>`${x.fact} ${x.op} ${JSON.stringify(x.value)}`).join(' 且 '):'默认分支：同一槽位前面的条件均未命中时采用（若是唯一条目则直接采用）';
const hOrder=['L1-E01','L1-E04','L1-E05','L1-E06','L1-E02','L1-E07','L1-E08','L1-E03'] as const;
const hTriggers:Record<string,string>={
 'L1-E01':'首条待处理视频。正式路径要求收到求救信号，并完成开场片播放后登记；在此之前没有玩家身份确认门槛。',
 'L1-E04':'E01已登记，并且玩家在E01之后发过任意非空通话（greeted=true）。没有验证玩家姓名、来意或双方已经相识。',
 'L1-E05':'E04登记后成为下一条待处理视频；不要求新增提问。',
 'L1-E06':'E05登记后成为下一条待处理视频；不要求玩家先问“是什么”。',
 'L1-E02':'E06登记，并且主港区域触发艇壳撞击（position.x>34、position.z>20，takeImpact成功）后。',
 'L1-E07':'前面INTRO序列结束，且reportRequested为真或外部生物已被隔离；首次发送。',
 'L1-E08':'受伤事实s.injured为真，且此前待处理条目已处理。只在受伤分支发送，不是每局必播。',
 'L1-E03':'出发事实s.departed为真，且此前待处理条目已处理。登记时还须confirmRemoteDeparture(true)成功。',
};
const lTriggers:Record<string,string>={
 'L2-S01B':'潜艇向入口竖井出口移动到x≥12.5、尚未交接摄像仪、两条开场视频均未登记，而且尚未取到黄色仪器匣。与S01互斥。',
 'L2-S01':'同样到达首呼叫条件，但已取到黄色仪器匣。与S01B互斥。',
 'L2-S02':'在传递口实际交接摄像仪（shared=true），尚未登记调查简报。',
 'L2-S03':'前两处生物照片已核验（photos包含0和1），尚未收到污染求助。',
 'L2-S04':'供水阀已关，关阀后经过至少60秒仍未向他报告，且尚未催问。不是开场八小时的后续时间。',
 'L2-S05':'关闭正确支路后，已报告完成，且尚未登记菌群消散。',
 'L2-S06':'菌群消散已登记，且已请求人员侧授权；尚未登记授权视频。编号由本局状态给出，玩家不需要输入编号。',
 'L2-S07':'三处照片齐全、门已解锁、抵达会合点，且尚未登记会合。',
};
const l3Triggers:Record<string,string>={
 'L3-E01':'靠近第0号观察窗自动请求。', 'L3-E02':'第0号观察窗，看过E01后在l3-quarantine通话窗发言。',
 'L3-E03':'第2号观察窗，看过E02后在l3-lab通话窗发言。',
 'L3-E04':'第3号观察窗，看过E03且钥匙箱已交接，在l3-pit-arrive发言。',
 'L3-E05':'第3号观察窗，看过E04且已取得photo.pit，在l3-pit-order发言。',
 'L3-E05B':'看过E05后，在第3号观察窗l3-pit-explore发言，所选标签不是cage07。',
 'L3-E05C':'看过E05后，在第3号观察窗l3-pit-explore发言，所选标签为cage07。',
 'L3-E06':'第4号观察窗，看过E05后在l3-plant-arrive发言。',
 'L3-E07':'第4号观察窗，看过E06后在l3-plant-order发言。',
 'L3-E08':'靠近第5号观察窗自动请求；前置E07已核验。',
 'L3-E09':'靠近第6号观察窗自动请求；前置E08已核验。',
 'L3-E10':'第6号观察窗，看过E09且已取得photo.domeTop，在l3-dome-look发言。',
 'L3-E11':'第7号观察窗，看过E10后在l3-shaft发言。',
};

let current='# 当前视频台词完整审查稿（原文，不是改写稿）\n\n日期：2026-10-28（Asia/Shanghai）。以导出时工作区文件为准，包含工作区尚未提交的修改。\n\n'+
'**阅读区别：** 第一、二关的 `speech` 是提交给配音模型的台词，也是叠加字幕来源；`line` 是另一份界面/回执长文，不能当成影片逐字稿。第三关视频字幕来自选中的 `dialogue`，目前不会把这些句子提交给视频模型配音。没有提取或核听已生成媒体，本稿不是实际音轨转录。\n\n'+
'当前条目：第一关8条、第二关8条（开场二选一）、第三关13条艾里亚斯录像／16个dialogue字段（含1条“没有台词”的舞台说明）及6条无对白玩家镜头。分支不是按顺序全部播出；同一槽位取首个命中条件。\n\n'+
'附录：'+local('02-通话回复与前后衔接.md')+' ｜ '+local('03-未接入与旧版管线.md')+' ｜ '+local('04-生成提示词与字幕规则.md')+'。\n\n';
current+='## 第一关：当前任务自拍视频\n\n播放顺序：E01 → 玩家任意非空回复 → E04 → E05 → E06 → 实际撞击 → E02 → E07 →（受伤时E08）→ E03。**“已登记”不总等于完整观看；开场E01有播完门槛，其他视频以收到并登记推进。**\n\n';
for(const id of hOrder){const t=HARBOR_TASKS[id];current+=`### ${id} · ${t.title}\n\n来源：${where('src/pod/content/harbor-task-videos.ts',id)}。\n\n`+field('触发与衔接',hTriggers[id])+field('视频配音原文 / speech',t.speech)+field('界面、回执长版 / line（不是同一份配音）',t.line)+field('实际生成的字幕条（顺序；不含时间码）',harborTaskSubtitles(id).map(x=>x.speaker+'：'+x.text).join('\n'))+field('人物地点（提示词原文）',t.place)+field('人物动作（提示词原文）',t.action)+field('程序导航目标 [x,y,z]（不是口播坐标格式）',t.target)+'**你的审查意见：**\n\n\n';}
current+='## 第二关：当前调查任务自拍视频\n\nS01B与S01只发送其一。之后S02 → 前两处取证 → S03 →（可选S04催问）→ S05 → S06 → S07。\n\n`{code}` 保留为占位符，不是玩家本局真实编号；生成时四位数字逐位读出，字幕直接替换成四位编号，长版还附加“本局授权编号：…。”。不要求玩家输入编号。\n\n';
for(const id of Object.keys(LIVING_TASKS) as (keyof typeof LIVING_TASKS)[]){const t=LIVING_TASKS[id];current+=`### ${id} · ${t.title}\n\n来源：${where('src/pod/content/living-task-videos.ts',id)}。\n\n`+field('触发与衔接',lTriggers[id])+field('视频配音原文 / speech',t.speech)+field('界面、回执长版 / line',livingTaskLine(id,'{code}'))+field('实际生成的字幕条（顺序；不含时间码）',livingTaskSubtitles(id,'{code}').map(x=>x.speaker+'：'+x.text).join('\n'))+field('人物动作（提示词原文）',t.action)+'**你的审查意见：**\n\n\n';}
current+='## 第三关：当前录像字幕与全部表演分支\n\n当前源码已从present.ts连接AbyssalLabSite，并由AbyssalMediaPlayer读取此管线。文档顶部仍有“未实现”的旧状态说明，不能据此否认代码接线，也不能据接线宣称真实影片全部完成。**本轮未运行、未观看、未生成影片。**\n\n'+
'**重要缺口：** 通话窗 `tags[].reply` 与镜头 `slots[].cases[].dialogue` 是两套文本。真实关卡radioSay调用story.say后只使用标签选择镜头，没有把result.reply加入影片；播放器也只把选中dialogue做成字幕。第二册把这些可能没有实际播出的回复全文列出，不能假定它们已被玩家听见。\n\n';
for(const shot of level03.shots){current+=`### ${shot.id} · ${shot.title}\n\n来源：${where('src/story-pipeline/level-03.ts',shot.id)}。\n\n`+field('视频类型',shot.videoType)+field('实际请求触发说明',l3Triggers[shot.id]??'玩家摄影或行动结果片；此条无对白。精确可达性、取景与核验条件见源文件快照。')+field('阶段ID',shot.stage)+field('原编排说明',shot.note);
for(const slot of shot.slots){current+=`#### 槽位 ${slot.slot}\n\n`;for(const c of slot.cases){current+=`**分支 ${c.key}**\n\n`+field('选择条件',condition(c.when))+field('字幕 dialogue 原文',c.dialogue??'此分支没有 dialogue 字段；不自动把通话 reply 当作视频台词。')+field('画面与动作 / zh',c.zh)+field('英文表演 / en',c.en)+field('原文叙事用途（制作说明，不是台词）',c.storyBeat);if(c.dialogue)current+=field('程序实际切出的字幕',dialogueSubtitles(c.dialogue).map(x=>(x.speaker?x.speaker+'：':'')+x.text).join('\n'));}}
current+='**你的审查意见：**\n\n\n';}
write('01-当前视频台词完整稿.md',current);

function windows(p:any){let s='';for(const w of p.windows??[]){s+=`### ${w.id} · ${w.title}\n\n`+field('说话人 / 阶段',`${w.speaker} / ${w.stage}`)+field('何时开放',w.opens)+field('何时关闭',w.closes)+field('推进方式（程序值）',{advanceOn:w.advanceOn,defaultTag:w.defaultTag,optional:w.optional});for(const t of w.tags??[]){s+=`#### ${t.id} · ${t.label}\n\n`+field('原有识别示例（不是要求玩家照抄）',t.examples)+field('回复原文 / reply',t.reply)+field('重复回复 / again',t.again)+field('前提失败回复 / fallback',t.fallback)+field('回复选择分支',t.branches)+field('状态变化',t.writes)+field('前提',t.requires);} }return s;}
function misc(p:any){let s='';for(const key of ['stages','echoes','optional'])s+=`### ${key} 原始编排数据\n\n`+fence(p[key]??[])+'\n\n';return s;}
function strings(f:string){const src=text(f),ast=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true),rows:any[]=[];const walk=(n:ts.Node)=>{if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n)||ts.isTemplateExpression(n)){const raw=n.getText(ast);if(/[\u3400-\u9fff]/u.test(raw)){const line=ast.getLineAndCharacterOfPosition(n.getStart(ast)).line+1;rows.push({line,raw});}if(ts.isTemplateExpression(n))return;}ts.forEachChild(n,walk);};walk(ast);return rows;}
let context='# 通话回复、动态消息与前后衔接\n\n这些不是全部都会进入视频的配音。原有固定说法、数字提示与不合规内容按原文保留供审查，不代表本轮认可。\n\n## 第一、二关：自由通话与任务衔接全部中文字符串\n\n下列按源码行号列出，保留字符串拼接/模板的原始形式；既包含人物回复，也包含系统提示、导航目标与制作注释中的数据。每条标明其并非自动等同视频口播。\n\n';
for(const f of ['src/pod/sim/harbor-simple-flow.ts','src/pod/sim/living-survey.ts']){context+=`### ${source(f)}\n\n`;for(const r of strings(f))context+=`原文件第 ${r.line} 行：\n\n${fence(r.raw,'typescript')}\n\n`;}
context+='## 第三关：全部通话窗回复（不等于当前实际视频字幕）\n\n'+windows(level03)+'## 第三关：前后场景、回声与可选支线\n\n'+misc(level03);
write('02-通话回复与前后衔接.md',context);

let old='# 未接入的新后两关与旧版一、二关管线\n\n**不是当前一、二关新开局的台词，不要拼回现稿。** 第四、五关设计管线与其旧状态描述不代表主游戏已接入。当前present.ts索引≥3仍转入PodExpedition。原稿中的正典冲突保留供用户审查，未在导出中悄悄改写。\n\n';
for(const p of [level04,level05,level01,level02]){old+=`## ${p.title}\n\n`+field('分类',(p.chapter??0)>=4?'后续关卡管线草案／未接入此套主游戏剧情':'旧版管线／新开局不以此作为视频台词源')+field('原文件状态描述（原样保留，不作为完成证明）',p.status)+field('原简介',p.synopsis)+'### 所有镜头与分支原文\n\n';for(const shot of p.shots){old+=`#### ${shot.id} · ${shot.title}\n\n`+fence(shot)+'\n\n';}old+='### 所有通话回复\n\n'+windows(p)+'### 衔接与回声\n\n'+misc(p);}
write('03-未接入与旧版管线.md',old);

let prompts='# 生成提示词、字幕规则与来源\n\n仅展开文字，不调用生成接口，不产生视频费用。第一、二关各导出正常／受伤两版。第二关动态编号使用说明占位，不代表任何本局编号。第三关完整提示词文档包含所有镜头及分支槽位，播放器按当局事实选择；不虚构唯一的最终提示词。\n\n';
for(const id of hOrder){for(const injured of [false,true])prompts+=`## ${id} · ${injured?'带既有肩伤':'正常状态'}\n\n${fence(harborTaskPrompt(id,injured),'text')}\n\n`;}
for(const id of Object.keys(LIVING_TASKS) as (keyof typeof LIVING_TASKS)[]){for(const injured of [false,true])prompts+=`## ${id} · ${injured?'带既有肩伤':'正常状态'}\n\n${fence(livingTaskPrompt(id,'0000',injured).replaceAll('0，0，0，0','{本局四位编号逐位朗读}').replaceAll('0000','{code}'),'text')}\n\n`;}
for(const f of ['docs/video-prompts/level-03-abyssal-lab.md','docs/video-prompts/structured-prompt-standard.md','docs/video-prompts/generation-standard.md','docs/video-prompts/level-01-harbor-rescue.md'])prompts+=`## 原始文档：${f}\n\n来源：${source(f)}。以下是源文全文；旧状态与旧首关说明不是当前正典认证。\n\n`+'````markdown\n'+text(f)+'\n````\n\n';
write('04-生成提示词与字幕规则.md',prompts);

const data={date:'2026-10-28',timezone:'Asia/Shanghai',harbor:HARBOR_TASKS,living:LIVING_TASKS,level03,otherPipelines:{level01,level02,level04,level05}};
write('05-结构化原文.json',JSON.stringify(data,null,2)+'\n');
const logs=[];for(const args of [['tools/level-rag.mjs','query','所有视频 台词 字幕 人物初识 坐标入口 八小时 Panacea 自由输入'],['tools/level-rag.mjs','check']]){const r=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8'});logs.push({command:'node '+args.join(' '),exitCode:r.status,stdout:r.stdout,stderr:r.stderr});}
write('06-本地检索检查.json',JSON.stringify(logs,null,2)+'\n');
const manifest=[];for(const [f,b] of snapshots){if(!fs.readFileSync(path.join(root,f)).equals(b))throw Error('Source changed during export: '+f);const dest=path.join(out,'source-snapshot',f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,b);manifest.push({source:f,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});}
write('source-manifest.json',JSON.stringify(manifest,null,2)+'\n');
const countDialogues=(p:any)=>p.shots.reduce((n:number,s:any)=>n+s.slots.reduce((n:number,x:any)=>n+x.cases.filter((c:any)=>c.dialogue!==undefined).length,0),0);
const verification={harborTasks:Object.keys(HARBOR_TASKS).length,livingTasks:Object.keys(LIVING_TASKS).length,thirdChapterEliasShots:level03.shots.filter(s=>s.videoType==='elias-story').length,thirdChapterOtherShots:level03.shots.filter(s=>s.videoType!=='elias-story').length,thirdChapterDialogueFields:countDialogues(level03),thirdChapterWindowReplies:level03.windows.reduce((n,w)=>n+w.tags.filter(t=>t.reply!==undefined).length,0),sourceFiles:manifest.length,generatedMedia:false,modifiedRuntime:false,sourceSnapshotsUnchanged:true};
for(const t of [...Object.values(HARBOR_TASKS),...Object.values(LIVING_TASKS)]){if(!current.includes(t.speech)||!current.includes(t.line))throw Error('Missing current dialogue.');}
for(const s of level03.shots)for(const sl of s.slots)for(const c of sl.cases)if(c.dialogue&&!current.includes(quote(c.dialogue)))throw Error('Missing third chapter dialogue: '+s.id);
write('07-导出完整性检查.json',JSON.stringify(verification,null,2)+'\n');
const readme=`# 全部视频台词审查包\n\n导出日期：2026-10-28（Asia/Shanghai）。**本轮只导出与指出问题，没有改台词、触发器、正典或生成缓存，没有重生成任何视频。**\n\n## 先看这份\n\n- ${local('01-当前视频台词完整稿.md')}：第一关8条、第二关8条、第三关13条艾里亚斯录像及6条无对白镜头；配音、长版文字、真实字幕切条、全部分支、动作和触发来源分列。\n- ${local('02-通话回复与前后衔接.md')}：第一、二关自由通话字符串；第三关全部通话窗回复、前后场景与回声。\n- ${local('03-未接入与旧版管线.md')}：第四、五关未接入设计；旧一、二关管线的全部镜头与回复。与现稿隔离，不能拼回现稿。\n- ${local('04-生成提示词与字幕规则.md')}：第一、二关正常／受伤版完整提示词，第三关完整提示词库与字幕规范。\n- ${local('05-结构化原文.json')}：结构化原文备查。\n- source-snapshot/：${manifest.length}份原始文件的逐字节快照；含第三关录像剧本、制作文档、现行正文与分支、旧版提示词。${local('source-manifest.json')}记录路径、大小和SHA-256。\n\n## 你指出的开场问题：已定位，不替原稿辩解\n\n1. **没有上下文的纠正。** L1-E01的speech开头就是“坐标是入口，不是我这儿”，片中此前未报坐标。长版line有坐标与自我介绍，但短版删掉了这些内容。它本来想区分入口接驳点和艾里亚斯被困位置，却只留下了纠正句。\n2. **“八个小时”缺少所指与问答过程。** 配音短版既不说谁在等谁，也不说什么已持续八小时；程序没有在此之前设置双方确认身份的步骤。自由通话里另有“我盯了这扇门八个小时”，但那不能替第一次视频补上未发生的对话。\n3. **把玩家任意回复当成已经相识。** E01后任何非空通话都把greeted设为true；E04、E05、E06随后依次登记，不要求玩家先问背景或“是什么”。“大王乌贼？”因此也可能没有问题前文。\n4. **短版与长版并非同一份台词。** 第一、二关字幕来自speech，导航记录/回执来自line。不能用屏幕长文已经写了人物介绍，来证明视频中介绍过。\n\n## 其他一并暴露的审查问题（均未改）\n\n- 第二关S01/S01B直接称“罗温”，首关当前简化流程没有建立确认玩家姓名的状态；需要审查他如何得知身份，而不是默认知道。\n- 第二关S06长版写“这一局的一次性授权”“编号在回传里”，是游戏/制作措辞混进人物语言。\n- 第三关通话窗reply没有被当前影片字幕链路合并；角色本应回应的问题可能只选中了一个动作，回复文字并未播出。完整备选回复保存在第二册，不标成已播出。\n- 第三关E10将“（没有台词。只有水声和金属声。）”存在dialogue字段，当前字幕函数会把这条舞台说明也做成字幕；它不是人物口播。\n- 第三关视频模型不接收中文dialogue，游戏配语音仍为GAP。叠加中文字幕不等于已有正确的人声。\n- 第一、二关是否有模型漏读、改读、额外添加台词，需要核对实际媒体音轨；本轮未核听，不把提示词当实录。已有缓存/旧存档也可能与当前稿不一致。\n\n## 范围与状态\n\n- IMPLEMENTED（仅代码事实）：一、二关任务视频表与第三关字幕/播放器接线存在。\n- REQUIRED：用户审查通过后再按确认内容重写；本包不是批准稿。\n- NOT_IMPLEMENTED / 未接入：第四、五关这套新设计未由当前主游戏接入；旧七关回退不等于这两关完成。\n- GAP：影片逐句核听、缓存版本核对、角色知识/问答因果修订、本轮整关实机验收均未做。\n- 已阅读规范并执行本地level-rag query/check。两者均报告Stale sources（包含其他工作区在改文件及已删除文件）；未通过。见${local('06-本地检索检查.json')}。本轮未改规范，不为掩盖过期而重建索引，不声称外部RAG同步。\n- 本轮是原文导出，不是剧情重写或MET全项验收，不声称AAA、恐怖程度、时长或关卡制作完成。\n\n## 标注方式\n\n每条当前视频下都留了“你的审查意见”。可以按视频ID指出保留/删除/改写及需要补的前文；所有原句保留不动，便于逐条对照。\n`;
write('00-审查入口.md',readme);
console.log(JSON.stringify({folder:out,...verification,ragChecks:logs.map(l=>({command:l.command,exitCode:l.exitCode}))},null,2));
