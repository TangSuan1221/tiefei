/** Chapter-two survey facts. Dialogue cannot manufacture physical evidence. */
export const SURVEY_POINTS = [[53,0,24],[108,0,26],[166,0,60]] as const;
export const SURVEY_TARGETS = [[56,-2,27],[110,-1,26],[166,-2,60]] as const;
export type SurveyVideo = 'L2-S01B'|'L2-S01'|'L2-S02'|'L2-S03'|'L2-S04'|'L2-S05'|'L2-S06'|'L2-S07';
const SURVEY_VIDEOS:readonly SurveyVideo[]=['L2-S01B','L2-S01','L2-S02','L2-S03','L2-S04','L2-S05','L2-S06','L2-S07'];
/** Elias's first call fires when the pod heads out of the entrance shaft (every other pod space lies at x≥14). */
export const SURVEY_CALL_X=12.5;
export type SurveyCapture={survey:true;id:string;target:number|'manual';valid:boolean;lit:boolean};
export class LivingSurvey {
 camera=false;shared=false;briefed=false;helpSeen=false;helpReplied=false;manual=false;
 valve=false;reported=false;clearSeen=false;doorSeen=false;askedCode=false;codeSeen=false;unlocked=false;reunion=false;reunionReached=false;ballast=false;complete=false;
 photos:number[]=[];accepted:SurveyVideo[]=[];captures:SurveyCapture[]=[];analyzed:string[]=[];
 elapsed=0;closedAt:number|null=null;nudged=false;called=false;trust=0;private rewarded:string[]=[];
 private pendingCapture:SurveyCapture|null=null;
 code=String(1000+Math.floor(Math.random()*9000));
 get pending():SurveyVideo|null {
  // The first call waits for the shaft exit. S01 asks for the handoff, S01B sends Rowan back for the case;
  // only one of them is ever delivered, and once the camera is shared both are moot.
  if(!this.shared)return !this.called||this.accepted.includes('L2-S01')||this.accepted.includes('L2-S01B')?null:this.camera?'L2-S01':'L2-S01B';
  if(!this.briefed)return 'L2-S02';
  if(this.photos.includes(0)&&this.photos.includes(1)&&!this.helpSeen)return 'L2-S03';
  if(this.reported&&!this.clearSeen)return 'L2-S05';
  if(this.closedAt!==null&&!this.reported&&this.elapsed-this.closedAt>=60&&!this.nudged)return 'L2-S04';
  if(this.clearSeen&&this.askedCode&&!this.codeSeen)return 'L2-S06';
  if(this.photos.length===3&&this.unlocked&&this.reunionReached&&!this.reunion)return 'L2-S07';
  return null;
 }
 acceptVideo(id:SurveyVideo){if(id!==this.pending)return false;this.accepted.push(id);if(id==='L2-S02')this.briefed=true;if(id==='L2-S03')this.helpSeen=true;if(id==='L2-S04')this.nudged=true;if(id==='L2-S05')this.clearSeen=true;if(id==='L2-S06')this.codeSeen=true;if(id==='L2-S07')this.reunion=true;return true;}
 /** First-call variants worth preparing before the pod reaches the shaft exit, likeliest first. */
 get upcoming():SurveyVideo[]{return this.called||this.shared?[]:this.camera?['L2-S01']:['L2-S01','L2-S01B'];}
 tick(dt:number,podX=0){this.elapsed+=Number.isFinite(dt)?Math.max(0,dt):0;if(!this.called&&!this.shared&&podX>=SURVEY_CALL_X)this.called=true;return '';}
 operate(id:string,near=true){
  if(!near)return '需要在对应设备旁实际操作。';
  if(id==='ballast'){this.ballast=true;return '下潜配重已固定。';}
  if(id==='transfer'){if(!this.camera)return '先取回黄色仪器匣。';if(this.shared)return '移动摄像仪已经交接。';this.shared=true;return '传递口已接收移动摄像仪，人员侧回执确认交接。艇载摄影系统保持可用。';}
  if(id==='reunion'){this.reunionReached=true;return this.photos.length===3?'已到F闸门，等待艾里亚斯会合回传。':'已到F闸门，调查回执尚未齐全。';}
  if(id==='body'){if(this.camera)return '仪器匣已经搜过。身份牌压在身体下面，暂时无法辨认。';this.camera=true;return '罗温：一台移动水下摄像仪……这个东西应该给艾里亚斯，没准能方便我们联络。';}
  if(id==='valve-s'){if(!this.helpReplied)return '先听艾里亚斯说明堵塞情况，再核对供水说明。';if(!this.manual)return '罗温：标签糊成一团。开探照灯，把说明牌拍下来，去分析台放大看。不能凭颜色拧。';this.valve=true;this.closedAt??=this.elapsed;return '含硫温水支路S（V-2）已关闭。罗温：阀门到底了……得告诉艾里亚斯，让他确认那边。';}
  if(id==='valve-c'){return '冷却支路C自复位：回流报警，阀门恢复原位。罗温：不是这根。先核对说明，别把冷却也停了。';}
  // MET-044: the lock opens from personnel-side authorization plus a physical confirm here; players never type a code.
  if(id==='door'){
   if(this.unlocked){this.doorSeen=true;return '03闸门已解锁。';}
   if(!this.clearSeen){this.doorSeen=true;return '03闸门锁住了。先完成前两处调查，并确认艾里亚斯通路恢复。';}
   if(this.codeSeen){this.doorSeen=true;this.unlocked=true;return '门锁显示人员侧一次性授权 '+this.code+' 已到达。罗温拉下门旁确认柄，隔离门正在开启。';}
   if(this.askedCode)return '03门锁正在等待人员侧授权。艾里亚斯的回片到达并登记后，回到门旁再确认一次。';
   if(!this.doorSeen){this.doorSeen=true;return '03闸门只认人员侧值班终端下发的一次性授权，外侧不能自行开启。门旁有授权请求键（再按 F），也可以通话请艾里亚斯帮忙。';}
   this.askedCode=true;return '授权请求已发往人员侧值班终端。等艾里亚斯的回片。';
  }
  if(id==='exit'){if(this.reunion&&this.ballast){this.complete=true;return '配重与下潜权限核验通过，进入下一层。';}return this.reunion?'先取压载库配重，不能无配重下潜。':'调查与会合尚未完成，下潜许可未开放。';}
  return '';
 }
 issue(e:SurveyCapture){if(!validCapture(e)||e.target!=='manual'&&(!this.briefed||e.target===2&&!this.unlocked))return null;this.pendingCapture={...e};return {...e};}
 commit(e:SurveyCapture){if(!this.pendingCapture||JSON.stringify(this.pendingCapture)!==JSON.stringify(e))return;this.pendingCapture=null;if(!this.captures.some(x=>x.id===e.id))this.captures.push({...e});}
 analyze(e:SurveyCapture){const stored=this.captures.find(x=>x.id===e.id);if(!stored||JSON.stringify(stored)!==JSON.stringify(e)||!e.valid||!e.lit)return false;if(this.analyzed.includes(e.id))return true;this.analyzed.push(e.id);if(e.target==='manual')this.manual=true;else if(!this.photos.includes(e.target))this.photos.push(e.target);return true;}
 say(raw:string,context:{nearTransfer?:boolean}={}){const t=raw.replace(/[\u0000-\u001f]/g,' ').trim().slice(0,240);if(!t)return [];
  const out=['罗温：'+t],reply=(s:string)=>[...out,'艾里亚斯：'+s];
  const negative=/没|未|不|别|如果|假如|要是|是否|怎么|为什么|吗|？|\?/.test(t);
  // Read completed valve reports per clause; unrelated devices and emotional asides are not valve facts.
  const clauses=t.split(/[，,。！!；;]/).map(c=>c.trim()).filter(Boolean);
  const retractsReport=/才怪|(?:没|未).{0,3}关|不确定|没确认|尚未确认/.test(t);
  const reportsClosed=clauses.some(c=>/(已.*关|关.*(好|闭|掉|上)|完成|搞定|好了)/.test(c)
   &&!/(没|未|不|别|如果|假如|要是|是否|怎么|为什么|吗|？|\?|以后|之后|之前|再通知|再告诉|等到|准备|打算|我要|我想)/.test(c)
   &&!/(声纳|电池|探照灯|照明|密码|门锁|摄像|摄影|拍|机械臂|舱门|闸门|电源|冷却)/.test(c)
   &&(/含硫|支路|阀门|热水|供水/.test(c)||/^(?:我)?(?:已经|已|把它)?(?:关好了?|关闭了?|关掉了?|关上了?|关完了?|完成了?|搞定了?|好了)[啊呀啦吧！!。]*$/.test(c)))&&!retractsReport;
  const asksTry=clauses.some(c=>/^(?:你|现在|可以|请)?(?:试试|试一下|看看通路|看看面罩)(?:吧|了)?$/.test(c));
  const fear=clauses.some(c=>/怕|慌|救命|撤退|回去|不干/.test(c)&&!/(?:(?:不|没|别|不要)(?:害)?怕|别慌|(?:别|不要|不想)撤退|(?:别|不要|不想)回去|(?:你|他|她)(?:也|很|有点|是不是)?(?:害怕|怕|慌))/.test(c));
  const distrust=/(不(?:再)?相信|(?:别|不要)骗(?:我|我们)|你(?:在|又|还在)?骗(?:我|我们))/.test(t);
  const apology=clauses.some(c=>/抱歉|对不起|我.*(?:骗了你|说谎|撒谎)/.test(c)&&!/(不用.*(?:抱歉|对不起)|(?:没|没有|未|不).*(?:骗|说谎|撒谎))/.test(c));
  const support=!distrust&&clauses.some(c=>/谢谢|相信|坚持|别怕|别慌|一起|我(?:会)?帮你/.test(c)&&!/(不(?:再)?相信|不.*一起|不.*帮你|(?:别|不要).*坚持|不用谢|别谢)/.test(c));
  const asksPassword=/密码|门锁|打不开|开不了|求助|开.{0,2}门|授权|通行|帮.{0,6}门/.test(t)&&!/(不要|不用|不想|别给|无需).*(密码|求助|授权|开门)|不求助/.test(t);
  const reward=(id:string,n:number)=>{if(!this.rewarded.includes(id)){this.rewarded.push(id);this.trust=Math.max(-3,Math.min(3,this.trust+n));}};
  if(this.helpSeen&&!this.helpReplied){this.helpReplied=true;if(!distrust){if(fear)reward('honest',1);else if(/不管你|活该|废物/.test(t))reward('hostile',-1);else if(apology)reward('apology',1);else if(support)reward('support',1);}return reply((fear?'先顾好你那边。停稳，必要时沿来路撤退；我靠着墙，不往前走。等你安全了再处理供水。':distrust?'你可以先核对，不必只信我的判断。':support?'听到了，谢谢。我先靠着墙，不乱走。':'收到，你还在就好。')+'这东西聚在温热、含硫的水里。我怀疑实验供水串进了通道。供水检修点在X138、Y13.5、深度1040米，那里有操作说明。别猜哪根管；关掉含硫热水，再叫我试。');}
  // A factual report can share a message with a question or an emotional aside.
  // Only the already-operated valve permits this transition.
  if(this.valve&&!retractsReport&&(reportsClosed||asksTry)&&(!this.reported||!this.clearSeen||!asksPassword)){
   if(this.reported)return reply(this.clearSeen?'关阀报告已经收到，通路恢复也核对过了。'+this.objective:'关阀报告已经收到，等回片后再确认结果。');
   this.reported=true;reward('report',1);
   const aside=/公司|灭口|陪葬|杀了我们/.test(t)?'公司的事，我也没底。先让我看清这条路，我们再想怎么出去。':/密码|门锁/.test(t)?'门锁的事我记着，等面罩清了，我去看值班终端。':'';
   return reply('收到，我先不迈步，等它散开。回传给你，你自己也看一眼。'+aside);
  }
  const transfersCamera=/确认交接|传递|交给你|递给你|送给你|传给你|给你|交给艾里亚斯/.test(t)&&(/摄像|探头|仪器匣/.test(t)||/^(?:确认交接|交给你|递给你|送给你|传给你|给你|传递)[。！!]*$/.test(t));
  if(transfersCamera&&!this.shared&&!negative&&!/以后|之后|之前|等会|稍后|准备|打算|我想/.test(t)){return reply(context.nearTransfer?this.operate('transfer'):this.camera?'传递口在竖井出口旁那面墙上，靠过去把匣子放进去，我这边就能接。':'先回井底，那个人旁边托盘上的黄色仪器匣。艇载相机你留着用。');}
  if(asksPassword){if(!this.doorSeen)return reply('先到03闸机核对门锁，我不能隔空判断是哪扇门。');if(!this.clearSeen)return reply('我还没看清路，先把供水的事处理完。');this.askedCode=true;return reply(this.codeSeen?'授权已经下发到03门锁了。你到门旁确认，门就开。':'我看见人员侧值班终端了。我给03门锁下发一次性授权，录像回传给你；收到以后，你到门旁确认。');}
  if(/公司|灭口|陪葬|杀了我们|泄露|秘密/.test(t))return reply('公司到底怎么打算的，我也说不准。我担心他们只想拿到材料，把我们留在里面，但这还只是猜测。能拍到的原片先留在艇里，别只留公司那份。');
  if(/\d{4}/.test(t))return reply('门锁不认通话里的数字。授权从值班终端直接发到03门锁，你在门旁确认就行。');
  if(reportsClosed&&this.helpSeen&&!this.valve)return reply('我这边还是一片糊。你说的是哪根？核对含硫支路S（V-2），再报给我。');
  if(distrust)return reply('你可以怀疑我。能核对的就核对，我不知道的不会替你下结论；先把眼前的情况说清楚。');
  if(fear){reward('honest',1);return reply('我也想回去。先停稳，别拿艇壳试路。可以沿来路退到入口缓一缓；有修补板就先修艇。电池和工具在机修间的补给箱里，入口没有。任务坐标都留着，等你准备好再走。');}
  if(/不管你|活该|废物/.test(t)){reward('hostile',-1);return reply('你可以骂，别断线。那扇门的值班终端在我这侧，我们还得互相搭把手。');}
  if(apology){reward('apology',1);return reply('听到了。往后没确认就说没确认，我宁愿多等一会儿。');}
  if(support){reward('support',1);return reply(this.trust<0?'先把眼前这件事做准，我们再说。':'好。你看仪表，我摸着墙。谁有动静都出个声。');}
  if(/尸体|是谁|死因|兄弟/.test(t))return reply('我没核对过他的身份，也不知道死因。先记位置，别替他下结论。');
  if(/声纳|雷达/.test(t))return reply('被动声纳只能听大概方位。主动声纳要通电，能测地形和距离，也一直发声。听到东西靠近，先找安全机位，再停稳拍；别为了拍照硬挨撞。');
  if(/哪里|坐标|任务|怎么|下一步/.test(t))return reply(this.objective);
  return reply(this.helpReplied&&!this.reported?'我听着。处理完含硫支路，记得叫我，别让我对着面罩干等。':this.trust<0?'收到。任务照做，结果请说清楚。':'听见了。你那边有新情况就说，手上的事慢慢做准。');
 }
 get objective(){if(this.complete)return '第二章完成 · 下潜至下一层';if(!this.shared&&!this.called)return this.camera?'带着移动摄像仪 · 向东驶出入口竖井':'入口竖井 · 向东驶出';if(!this.shared&&this.pending)return '艾里亚斯的视频通话正在接入';if(!this.camera)return '回入口井底遗体旁 X10 Y11.5 · 机械臂取回黄色仪器匣';if(!this.shared)return '竖井出口旁设备传递口 X12 Y12.5 · 把移动摄像仪交给艾里亚斯';if(this.pending)return '等待艾里亚斯任务录像 · 收到即自动登记，可在分析台播放；失败可重试';if(!this.photos.includes(0)||!this.photos.includes(1)){const remaining=['机修间01 X53 Y24','压载库02 X108 Y26'].filter((_,i)=>!this.photos.includes(i));return '前两处调查已登记 '+(2-remaining.length)+'/2 · 尚待：'+remaining.join('、')+'，深度1040m · 开灯摄影并确认收件';}if(!this.helpReplied)return '自由回复艾里亚斯的求助';if(!this.manual)return '观察廊 X138 Y13.5 深度1040m · 开灯拍说明牌，分析辨认管线';if(!this.valve)return '说明牌旁 · 操作含硫温水支路S（V-2）';if(!this.reported)return '主动通知艾里亚斯：含硫支路已关闭';if(!this.clearSeen)return '等待菌群消散回传';if(!this.unlocked)return this.codeSeen?'南廊03门 X128.5 Y36 · 授权已下发，到门锁旁按 F 确认开门':'南廊03门 X128.5 Y36 · 到门锁旁查看，请艾里亚斯从人员侧授权';if(!this.photos.includes(2))return '中庭03 X166 Y60 深度1040m · 摄影并确认第三份收件';if(!this.reunionReached)return 'F闸门 X188 Y52 · 确认会合回传';if(!this.reunion)return '等待会合回传';return this.ballast?'东侧下潜井 X208 Y68 · 下潜':'压载库配重尚未固定，取回后下潜';}
 snapshot(){return JSON.parse(JSON.stringify({...this,pendingCapture:null,version:1})) as Record<string,any>;}
 restore(v:any){if(v&&typeof v==='object'&&v.called===undefined)v={...v,called:Array.isArray(v.accepted)&&v.accepted.includes('L2-S01')}; // Pre-call saves: an accepted S01 means the call already happened.
  if(!v||v.version!==1||!/^\d{4}$/.test(v.code)||!Number.isFinite(v.elapsed)||v.elapsed<0||!Array.isArray(v.photos)||new Set(v.photos).size!==v.photos.length||v.photos.some((x:any)=>![0,1,2].includes(x)))return false;
  const fresh=new LivingSurvey();for(const k of Object.keys(fresh)){if(typeof (fresh as any)[k]==='boolean'&&typeof v[k]!=='boolean')return false;}for(const k of ['accepted','captures','analyzed','rewarded'])if(!Array.isArray(v[k]))return false;
  if(v.captures.some((e:any)=>!validCapture(e))||new Set(v.captures.map((e:any)=>e.id)).size!==v.captures.length||v.analyzed.some((id:any)=>!v.captures.some((e:any)=>e.id===id&&e.valid&&e.lit)))return false;
  const firstCall=['L2-S01','L2-S01B'].filter(id=>v.accepted.includes(id)).length;
  if(firstCall>1||firstCall&&!v.called||v.accepted.length>0&&!firstCall&&!v.shared||v.pendingCapture!==null||v.analyzed.length!==new Set(v.analyzed).size||v.photos.length>0&&!v.briefed||v.manual&&!v.captures.some((e:any)=>e.target==='manual'&&e.valid&&e.lit&&v.analyzed.includes(e.id))||v.shared&&!v.camera||v.briefed&&!v.shared||v.helpSeen&&(!v.photos.includes(0)||!v.photos.includes(1))||v.helpReplied&&!v.helpSeen||v.valve&&!v.manual||v.reported&&!v.valve||v.clearSeen&&!v.reported||v.codeSeen&&(!v.clearSeen||!v.askedCode)||v.unlocked&&!v.codeSeen||v.photos.includes(2)&&!v.unlocked||v.reunion&&(v.photos.length!==3||!v.unlocked||!v.reunionReached)||v.complete&&(!v.reunion||!v.ballast))return false;
  if(v.photos.some((t:any)=>!v.captures.some((e:any)=>e.target===t&&v.analyzed.includes(e.id)))||v.manual&&!v.captures.some((e:any)=>e.target==='manual'&&v.analyzed.includes(e.id)))return false;
  if(new Set(v.accepted).size!==v.accepted.length||[['L2-S02','briefed'],['L2-S03','helpSeen'],['L2-S04','nudged'],['L2-S05','clearSeen'],['L2-S06','codeSeen'],['L2-S07','reunion']].some(([id,k])=>v.accepted.includes(id)!==v[k]))return false;
  if(v.accepted.some((x:any)=>!SURVEY_VIDEOS.includes(x))||!Number.isFinite(v.trust)||Math.abs(v.trust)>3||!(v.closedAt===null||Number.isFinite(v.closedAt)&&v.closedAt>=0&&v.closedAt<=v.elapsed))return false;
  if(v.captures.some((e:any)=>e.target!=='manual'&&v.analyzed.includes(e.id)&&!v.photos.includes(e.target))||v.askedCode&&(!v.doorSeen||!v.clearSeen)||v.manual&&!v.helpSeen&&v.valve||v.nudged&&(!v.helpSeen||v.closedAt===null))return false;
  const order=SURVEY_VIDEOS as readonly string[];if(v.accepted.some((id:any,i:number)=>i>0&&order.indexOf(id)<=order.indexOf(v.accepted[i-1])))return false;
  if(v.rewarded.some((x:any)=>!['report','honest','hostile','apology','support'].includes(x))||new Set(v.rewarded).size!==v.rewarded.length||v.valve!==(v.closedAt!==null)||v.manual!==v.captures.some((e:any)=>e.target==='manual'&&v.analyzed.includes(e.id)))return false;
  for(const k of Object.keys(fresh))(this as any)[k]=structuredClone(v[k]);return true;
 }
}


function validCapture(e:any):e is SurveyCapture{return !!e&&e.survey===true&&typeof e.id==='string'&&e.id.length>0&&e.id.length<160&&[0,1,2,'manual'].includes(e.target)&&typeof e.valid==='boolean'&&typeof e.lit==='boolean';}
