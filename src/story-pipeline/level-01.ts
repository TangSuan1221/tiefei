import type {Pipeline} from './model';
import {HARBOR_R28_TASKS} from '../pod/content/harbor-r28-videos';
const stages=[
 ['entry','第一门与求救','打开第一道门，接听V01并回应；第二道门须接收授权。'],
 ['contact','建立联系','V02介绍；玩家先到第二道门按F查看门控，面板提示需要密码并转发请求，随后V02-AUTH授权；询问被困原因或开第二门后收到V02A。'],
 ['impact','双撞与静默','两次撞击到50%，V03后关闭主动声纳；继续发声会受击。'],
 ['repair','维修铁鲸','V04后前往X42 Y28 深度1012米岸电恢复台，机械臂取出并收妥工具，在通讯页修复。'],
 ['lure','货舱诱导','V05后先登记封闭任务，再开01闸门，进入X77 Y7 深度1011米诱导。'],
 ['photo','摄影调查','目标完整入仓并关闭主动声纳后V06；摄影，分析，封存等待上行。'],
 ['report','退出与隔离','退出至X60 Y27 深度1012米，V07询问；关闸、核验结果、自由报告。'],
 ['retry','受伤补救','误报后开闸未通知，真实接触导致肩伤、信任下降；V07R后重新隔离。'],
 ['departure','分路下潜','真正隔离且人员到安全通道后V08；01确认，再下潜生活区1040米。'],
] as const;
const stageOf=(id:string)=>id.includes('V01')?'entry':id.includes('V02')?'contact':id.includes('V03')?'impact':id.includes('V04')?'repair':id.includes('V05')?'lure':id.includes('V06')?'photo':id.includes('V07R')?'retry':id.includes('V07')?'report':'departure';
const triggers:Record<keyof typeof HARBOR_R28_TASKS,string>={
 'L1-R28-V01':'首次打开第一道压力门；第二道门尚未授权。',
 'L1-R28-V02':'V01完整播放后，玩家自由回应或发送身份资料；本片仅介绍身份；后续V02-AUTH播完才授予第二道门权限。',
 'L1-R28-V02-AUTH':'V02完整播放且玩家先在第二道门交互、门控面板提示需要密码后发送；本片报出2903419；完整播放后回到门边，在滚轮密码面板拨号提交并一次开门。',
 'L1-R28-V02A':'V02播完后询问被困经过，或打开第二道门；本片播完开始两次撞击。',
 'L1-R28-V03':'背景片播完且双撞完成，或首次撞击后玩家主动讲话；选择时主动声纳开着。',
 'L1-R28-V03-QUIET':'同V03触发条件，但选择时主动声纳已经关闭；生成中不再切换版本。',
 'L1-R28-V03A':'警告播完后，玩家询问声纳、声音或未知生物；可选，不强制指定措辞。',
 'L1-R28-V04':'两次撞击完成、警告播完、主动声纳关闭。',
 'L1-R28-V04R':'V04播完后累计90秒仍未修好且工具尚未收妥；媒体等待和播放不计时，仅催促一次。',
 'L1-R28-V04R-STORED':'同维修催促，但工具已收妥；提醒完成维修，不再要求取箱。',
 'L1-R28-V05':'工具已吸附收回，玩家完成修复铁鲸。',
 'L1-R28-V06':'V05播完，怪物实际被引入货舱，玩家关闭主动声纳；收到影片不能代替现场摄影。',
 'L1-R28-V07':'本轮入仓摄影已完成曝光，玩家实际退出货舱并回到X60/Y27/1012米附近。',
 'L1-R28-V07R':'艾里亚斯因实际近距接触而受伤；停止出发、保留伤情和信任损失，需重新隔离。',
 'L1-R28-V08':'当前隔离与结果核验成立、入仓片已分析、玩家报告完成、艾里亚斯实际抵达安全通道，且未受伤。',
 'L1-R28-V08-INJURED':'满足V08全部安全前提且曾受伤；本片保留肩伤，不抹去后果。',
};
export const level01:Pipeline={
 id:'level-01',chapter:1,title:'第一关（0层）· 接驳港：求救与货舱隔离',
 synopsis:'调查员艾里亚斯在总调度室被困十四小时。罗温回应求救、取得门禁授权，在两次撞击后关闭主动声纳并修复铁鲸。两人利用货舱隔离实验生物，留下事故调查影像。错误报告与再次开闸可能使艾里亚斯受伤，须重新隔离后才能分路下潜，第二关末会合。',
 status:'2026-10-28 新开局执行已接线；真实影片与无工程背景游玩验收待完成。旧存档使用独立历史模型。',
 sourceDoc:'docs/level-01-pipeline-revision-2026-10-28.md',
 facts:[
  ...['firstDoor','credential','impactDone','sonarOff','kitStored','repaired','inside','isolated','verified','safe'].map(key=>({key:'world.'+key,layer:'W' as const,type:'bool' as const,initial:false,life:'level' as const,source:'HarborSimpleFlow / HarborRescue真实状态；查看器不修改游戏'})),
  {key:'elias.injured',layer:'W',type:'bool',initial:false,life:'persist',source:'实际人员接触；不可由文字制造'},
  {key:'elias.believesSafe',layer:'K',holder:'elias',type:'bool',initial:false,life:'level',source:'玩家报告或推送证据，不等于物理安全'},
 ],
 stages:stages.map(([id,title,objective])=>({id,title,objective,narrative:objective,advance:'实际状态与视频完整播放决定推进，参阅运行状态机',dialogueStages:[id],gate:[],sets:[]})),
 windows:[{id:'free-report',title:'报告、等待或修正',speaker:'rowan',stage:'report',opens:'V07播放后',closes:'真实到达安全通道',multi:true,optional:true,tags:[
  {id:'hold',label:'请他等待',examples:['还没有关好，你先待着','等我核对'],keywords:['等待','先别'],writes:[{fact:'elias.believesSafe',op:'set',value:false}],reply:'好，我先留在门后。你确认好了再叫我。'},
  {id:'report',label:'报告安全',examples:['已经关妥了','里面隔离好了'],keywords:['关妥','隔离好了'],writes:[{fact:'elias.believesSafe',op:'set',value:true}],reply:'收到。有变化马上叫我停下。',note:'查看器仅演示认知；游戏物理隔离不由口头报告写入。'},
 ]}],
 shots:Object.entries(HARBOR_R28_TASKS).map(([id,t])=>({id,title:t.title,stage:stageOf(id),videoType:'elias-story',reads:[],slots:[],note:'触发：'+triggers[id as keyof typeof HARBOR_R28_TASKS]+' 实际生成SPEECH和字幕使用同一全文；长段连续分片，全部播放后推进。',script:{visual:t.place+'; '+t.action,dialogue:t.speech,reveal:'条件版本互斥；不揭露身份或身体异常。'}})),
 optional:[],echoes:[],presets:[{id:'review',title:'八段流程与条件视频审阅',picks:{},toggles:[]}],
};
