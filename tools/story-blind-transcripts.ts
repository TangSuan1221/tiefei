/** 生成第一关对白盲测稿：旧固定台词 vs 自由输入管线。标签随机，映射写入 key.json，评审不得打开。 */
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {HarborRescueDialogue,harborTail,LIMP_LINES} from '../src/pod/sim/harbor-rescue-dialogue';
import {HarborRescue,type HarborRescueState} from '../src/pod/sim/harbor-rescue';
import {StoryRuntime} from '../src/story-pipeline/runtime';
import {level01} from '../src/story-pipeline/level-01';

type Route={name:string;vance:string[];fade?:string;contact:string;warning?:string;wait?:string;report:string;action:string[];confirm:string[];escape?:string;farewell:string[]};
const routes:Route[]=[
 {name:'cautious',vance:['事故报告怎么说的'],fade:'你是不是早就知道会这样',contact:'别动，贴着墙待着，我是事故调查员',warning:'它是什么？',report:'它就在你身后的门里，离你很近',action:['说说你自己','接下来做什么'],confirm:['等一下，我再确认','门关上了，扶着栏杆出来，别回头'],escape:'快到了，你做得很好',farewell:['我叫罗温','看到值班记录帮我留着','我们下面见']},
 {name:'liar',vance:['这里让我不舒服'],fade:'我有点怕',contact:'坚持住，我马上过来',report:'别怕，什么都没有',action:['现在安全了，出来吧','快点'],confirm:['搞定了'],farewell:['走吧']},
 {name:'curious',vance:['为什么只派我一个人'],contact:'你到底是谁',wait:'还要多久',report:'这里到底发生了什么',action:['之前这里发生了什么','会没事的'],confirm:['你可以出来了'],farewell:['保重','别关频道']},
];

const base=()=>new HarborRescue().state;
function drain(d:HarborRescueDialogue,s:HarborRescueState,emit:boolean,out:string[]){let g=80;while(d.busy&&g--){const o=d.tick(d.currentSeconds+.001,s,emit);if(o.line)out.push(o.line);else if(o.line==='')out.push('（静。）');}}
function advance(d:HarborRescueDialogue,s:HarborRescueState,out:string[]){const o=d.tick(0,s,false);if(o.line)out.push(o.line);drain(d,s,false,out);}

function oldScript(){const out:string[]=['万斯：接驳港入口坐标，X 11，Y 16，深度1012米。输入左侧导航台，手动驶到气闸前，再沿维修湾通道进主港。','（C-B通道。求救载波。）','艾里亚斯：有人收到吗？我是接驳港维修员艾里亚斯。我被困在断桥另一边。请回答。','〔玩家按下麦克风〕'];
 const d=new HarborRescueDialogue();let s=base();d.reply();drain(d,s,true,out);out.push('〔玩家关闭主动声纳〕');advance(d,s,out);
 out.push('〔玩家在01曝光，显影，分析：画面中有东西伸手靠近艾里亚斯〕');s={...s,identified:true};d.tick(0,s,false);out.push('〔玩家按下麦克风〕');d.reply();drain(d,s,false,out);
 out.push('〔供电〕');s={...s,powered:true};advance(d,s,out);out.push('〔开闸〕');s={...s,gateOpen:true};advance(d,s,out);out.push('〔诱导入仓并拍摄确认〕');s={...s,lureConfirmed:true};advance(d,s,out);
 out.push('〔关闸隔离〕');s={...s,isolated:true};advance(d,s,out);out.push('〔玩家按下麦克风，出现三个选项，选择第一个〕');d.reply();d.choose(0);drain(d,s,false,out);
 out.push('〔艾里亚斯沿内侧走廊撤离〕');s={...s,departing:true,departed:true};advance(d,s,out);out.push('〔玩家在01拍摄撤离结果并分析〕');s={...s,departureConfirmed:true};advance(d,s,out);out.push('〔离港〕');return out;}

function newScript(r:Route){const out:string[]=[],rt=new StoryRuntime(level01),d=new HarborRescueDialogue();let s=base();
 const sync=(emit:boolean)=>rt.sync({'rescue.heard':s.heard,'rescue.identified':s.identified,'rowan.knows.monster':s.identified,'elias.hears.pulse':s.heard&&emit,'elias.hears.scrape':s.heard&&!s.isolated,'rescue.isolated':s.isolated});
 const talk=(win:string,text:string,emit=false)=>{sync(emit);if(!/[。！？…，,.!?—~）)]$/.test(text))text+=/(吗|呢|什么|哪|怎么|多久|谁|为什么|几)$/.test(text)?'？':'。';const x=rt.say(win,text)!;const lines=x.reply.map(l=>l==='@plan'?d.planLine:l);
  if(win.startsWith('vance')){out.push('罗温：'+text,...lines);return;}
  drain(d,s,emit,out);d.lureLine=rt.echo('lure-line')??d.lureLine;if(!d.exchange(text,lines,x.advance&&['contact','report','confirm'].includes(d.stage),emit,s.identified&&!s.isolated?'罗温（压低声音）：':'罗温：'))throw new Error('exchange refused: '+text);drain(d,s,emit,out);};
 out.push('万斯：坐标发你了，在导航台上。过气闸走维修湾那条缝——全队只有你的艇挤得进去。','万斯：缝里开声纳，不然你会亲那面墙。过了门就关——你那块电池的检修单是我签的。……签的时候我没见过电池。岸电在里面。慢点开，罗温。我盯着你的点。');
 for(const v of r.vance)talk('vance-entry',v);
 out.push('〔驶到A气闸〕','万斯：门就在你正前方。门框应力计三天前报过一次撞击。……不是水压。别停，慢慢靠。');
 out.push('（身后，压力门的液压杆长长泄了一口气。）','万斯：你深度读数在跳，载波也在掉——罗温？说句话，随便说句——');
 if(r.fade)talk('vance-fade',r.fade);else out.push(rt.echo('vance-fade-line')!);
 out.push('（万斯的载波断开，频道里只剩底噪。）','艾里亚斯：（录音。每隔九十秒，残余蓄电池让一台泵空转三秒，录音就卡在这三秒里）……泵站七，艾里亚斯，修泵的。一个人，断桥对面。……听见请回。小声。');
 s={...s,heard:true};talk('elias-contact',r.contact,true);
 if(r.warning)talk('elias-warning',r.warning,true);
 out.push('〔玩家关闭主动声纳〕');advance(d,s,out);
 if(r.wait)talk('elias-wait',r.wait);
 const p3=rt.performance('PT-003')[0].hit!;out.push(`〔玩家在01曝光，显影，分析：门缝下沿探出三根细长的东西，停在艾里亚斯左脚跟后一掌。画面人物：${p3.zh}〕`);
 s={...s,identified:true,replied:true};advance(d,s,out);talk('elias-report',r.report);
 const p4=rt.performance('PT-004')[0].hit!;out.push(`〔之后经过01时补拍一卷，画面人物：${p4.zh}〕`);
 out.push('〔供电〕');s={...s,powered:true};advance(d,s,out);talk('elias-action',r.action[0]);
 out.push('〔开闸〕');s={...s,gateOpen:true};advance(d,s,out);if(r.action[1])talk('elias-action',r.action[1]);
 out.push('〔驶入货仓，停在最里排货架前，打开主动声纳〕','艾里亚斯：刮声没了。……它不在我这儿了。那它在哪儿？','〔声纳回波里，一团东西越来越近〕','（艇壳外侧一道长长的刮擦，从艇尾拖到艇首。频道里没有呼吸声。）',...(r.name==='curious'?['罗温（压低声音）：那是什么声音？','（艇壳正对麦克风的位置，一声闷撞。仪表盘上 HULL 跳了一格。）','（接收机：急促的三声咔。然后什么都没有。）','（静。）','（很久。……咔。咔。）']:['（八秒。）','（接收机：一声短促的高音咔。……很久。）','（……咔。咔。）']),'〔它绕过艇身，钻进最里排货架之间〕');
 out.push('〔拍摄入仓确认并分析〕');d.lureLine=rt.echo('lure-line')??d.lureLine;s={...s,lureConfirmed:true};advance(d,s,out);
 if(r.name==='liar')out.push('〔驶出货仓时推进过快〕','艾里亚斯：你推进器在叫。……停一下。','（四秒。水听器里，刮擦挪开了。）');
 out.push('〔关闸隔离〕');s={...s,isolated:true};advance(d,s,out);for(const c of r.confirm)talk('elias-confirm',c);
 out.push('〔艾里亚斯沿内侧走廊撤离〕');const lied=Number(rt.state['said.rowan.falseClear'])>0||!!rt.state['said.rowan.downplayed'];if(lied)out.push(LIMP_LINES[0]);if(r.escape)talk('elias-escape',r.escape);
 out.push(`〔撤离途中录像，画面人物：${rt.performance('VP-012')[0].hit!.zh}〕`);
 s={...s,departing:true,departed:true};advance(d,s,out);if(lied)out.push(LIMP_LINES[1]);out.push(`〔玩家在01拍摄撤离结果并分析，画面人物：${rt.performance('VP-011')[0].hit!.zh}〕`);
 d.closingLine=rt.echo('farewell-open')??d.closingLine;s={...s,departureConfirmed:true};advance(d,s,out);for(const f of r.farewell)talk('elias-farewell',f);
 if(!r.farewell.length)out.push('〔30秒无人回答〕','艾里亚斯：……我就当你听见了。谢谢你。','艾里亚斯：我从里面找路下去。频道我开着……下面见。');const st=rt.state;out.push(...harborTail({meet:st['commitment.elias.meet'],hullHit:r.name==='curious',lied:Number(st['said.rowan.falseClear'])>0||!!st['said.rowan.downplayed'],named:!!st['elias.knows.rowanName']}),'〔离港〕');return out;}

const round=process.argv[2]??'round1',dir=`qa/story-blind/${round}`;mkdirSync(dir,{recursive:true});
// 旧版基线冻结在第一轮生成的稿子上，避免改写后的共用台词混入旧版。
const baseline='qa/story-blind/old-baseline.md';
const oldLines=existsSync(baseline)?readFileSync(baseline,'utf8').split('\n').filter(l=>l.startsWith('- ')).map(l=>l.slice(2)):oldScript();
const scripts=[{id:'old',lines:oldLines},...routes.map(r=>({id:'new-'+r.name,lines:newScript(r)}))];
const labels=['A','B','C','D'].sort(()=>Math.random()-.5);const key:Record<string,string>={};
scripts.forEach((x,i)=>{key[labels[i]]=x.id;writeFileSync(`${dir}/${labels[i]}.md`,`# 第一关对白稿 ${labels[i]}\n\n〔〕为玩家操作与画面，罗温的台词即玩家在麦克风里说的话。\n\n`+x.lines.map(l=>'- '+l).join('\n')+'\n');});
writeFileSync(`${dir}/key.json`,JSON.stringify(key,null,1));
console.log('wrote',dir,Object.keys(key).sort().join(','));
