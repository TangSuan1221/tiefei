import {HARBOR} from '../content/harbor-level';
import type {HarborExposure} from './harbor-progress';
/** Only footage of the required subject can change the investigation instruction. */
export function harborGuideMedia(exposures:readonly HarborExposure[]):string{
 const valid=exposures.filter(e=>e.valid&&!e.analyzed);
 if(valid.some(e=>e.status==='ready'&&e.mediaId))return 'ready';
 if(valid.some(e=>e.status==='pending'))return 'developing';
 return 'idle';
}
export type HarborGuide={id:string;reason:string;action:string};
/** Read-only narrative guidance; never grants evidence or advances a gate. */
export function harborGuide(held:readonly string[],shot:string):HarborGuide{
 const has=(id:string)=>held.includes(id);
 const g=(id:string,reason:string,action:string)=>({id,reason,action});
 if(!has(HARBOR.permit))return g('report','万斯：你来核实接驳港事故。先确认通讯。','去无线电台（3），接听并报告抵达。');
 if(!has(HARBOR.tool))return g('tools','万斯：港门断电。先恢复岸电，才能查撤离现场。','沿气闸侧面的粗电缆进维修湾，找双绑带工具箱；靠近按 F。');
 if(!has(HARBOR.power))return g('power','万斯：工具收妥了。控制回路就在维修湾。','对准岸电控制箱，靠近按 F 修复；随后返回圆形港门。');
 if(!has(HARBOR.photo)){
  if(shot==='exposing'||shot==='developing')return g('develop','万斯：不要把实时画面当证据。等底片处理。','可以先观察周围；录像就绪后去分析台查看并核验。');
  if(shot==='ready')return g('review','万斯：录像回来了。报告说救生舱已离港，看看录像怎么说。','去分析台，播放并核验救生舱录像。');
  return g('photo','万斯：主港上方还有一艘救生舱。先取证，不要猜。','进入圆形港门，抬镜头对准悬吊救生舱；停稳后按曝光。');
 }
 const steps:[string,string,string,string][]=[
 [HARBOR.module,'module','万斯：录像证明它没离开。还需要独立的载荷记录。','沿主港下降导轨去计量坞，用机械臂取下载荷模块。'],
 [HARBOR.discrepancy,'compare','万斯：两份证据齐了。现在才能核对撤离报告。','回分析台执行实物／证据核验，比对录像与载荷曲线。'],
 [HARBOR.searchComplete,'search','万斯：报告与现场不符。查查最后一批登船人员。','通过计量坞侧门去行李检修廊，操作疏散记录检索台。'],
 [HARBOR.card,'card','万斯：检索留下人员线索。别漏掉现场身份凭证。','在行李检修廊找到疏散员工卡，用机械臂取回。'],
 [HARBOR.cardAnalyzed,'card-review','万斯：先核对身份，再相信这条撤离路线。','回分析台执行实物／证据核验，读取员工卡事故档案。'],
 [HARBOR.routeRecord,'diversion','万斯：人员去向仍不明。查分流机构的改道记录。','沿检修廊后方弯道进撤离分流井，读取机械改道记录。'],
 [HARBOR.route,'route','万斯：有人改变过方向。把记录与人员档案放在一起。','回分析台核验下行路线。'],
 [HARBOR.exitReady,'exit','万斯：线索指向下面的生活区。这里不是撤离终点。','从分流井继续下潜到准备坞，操作出口机构。'],
 [HARBOR.depthReady,'reserve','万斯：再往下，压力会更大。确认你还有回来的余量。','检查耐压、氧、电和推进储备；不足时去下沉货仓补给。'],
 ];
 const next=steps.find(([token])=>!has(token));
 return next?g(next[1],next[2],next[3]):g('depart','万斯：记录已归档。下面仍没有回应。','在下潜准备坞操作出口，确认下潜至生活区。');
}
