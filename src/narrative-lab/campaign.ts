import type {Campaign,Choice,Condition,Effect,Resolution,StoryScene} from './types';
const eq=(key:string,value:string|number|boolean):Condition=>({path:'world.'+key,op:'eq',value});
const ne=(key:string,value:string|number|boolean):Condition=>({path:'world.'+key,op:'ne',value});
const all=(...conditions:Condition[]):Condition=>({all:conditions});
const any=(...conditions:Condition[]):Condition=>({any:conditions});
const set=(key:string,value:string|number|boolean):Effect=>({path:'world.'+key,op:'set',value});
const changes=(values:Record<string,string|number|boolean>):Effect[]=>Object.entries(values).map(([k,v])=>set(k,v));
const pick=(id:string,label:string,values:Record<string,string|number|boolean>,resultText:string,fact:string,consequence:string,condition?:Condition,recovery=false):Choice=>({id,label,instructions:[{path:'pod.power',op:'add',value:-.02},{path:'pod.oxygen',op:'add',value:-3},...changes(values)],resultText,evidence:[fact],consequence,npcLines:[],condition,recovery});
const leave=(id:string,text:string,condition?:Condition,values:Record<string,string|number|boolean>={}):Resolution=>({id,label:text,text,condition,instructions:changes(values)});
const echo=(condition:Condition,entryText:string,scoutText?:string,facts?:string[])=>({condition,entryText,scoutText,facts});
const scene=(id:string,chapter:number,title:string,location:string,entryText:string,scoutFootage:string,scoutFacts:string[],axes:string[],choices:Choice[],resolutions:Resolution[],continuity:StoryScene['continuity']=[],observation:StoryScene['observation']='camera'):StoryScene=>({id,chapter,title,location,entryText,scoutFootage,scoutFacts,branchAxes:axes.map(k=>'world.'+k),choices,resolutions,continuity,observation,resolveText:'先看清本次结果，再决定是否补救或沿当前路线继续。已经发生的伤情、隔离和证据损失不会在转场时消失。',plannedSeconds:{travel:75,reading:75,action:90}});
const scenes:StoryScene[]=[
 scene('L0-01',1,'断桥另一端的求救','0层接驳港 · 断桥与货仓',
 '万斯失联前留下了生活区值班员周岑的旧留言。此刻接通的是维修员艾里亚斯：“我躲在门后，看不见桥底。外面清空了就告诉我。”罗温看向断桥，手停在麦克风旁，没有立即答应。',
 '摄像头拍到惨白生物停在断桥下，通往内侧值班室的路经过它上方。艾里亚斯躲在遮住视线的门后。货仓门有独立配电和闸机；门未落下，不能算隔离。',
 ['e.l0.creature-under-bridge','e.l0.elias-cannot-see-route','e.l0.cargo-controls'],['dockCreature','eliasStatus'],[
  pick('lure-dark','尝试用短促灯光引开怪物',{dockCreature:'watching-door',eliasStatus:'trapped'},'短促灯光熄灭后，生物仍贴着门外的桥基，没有追随光斑。门后的艾里亚斯仍在等待，通路没有清空。','e.l0.light-failed','尝试失败；保留危险，可执行真实隔离或撤离。'),
  pick('lure-noise','从潜艇发射主动声纳，吸引生物注意',{dockCreature:'at-pod',eliasStatus:'trapped'},'生物离开门口，贴近正在发声的艇壳。它没有进入货仓。艾里亚斯仍在掩体内，潜艇回撤路线被占。','e.l0.creature-at-pod','危险转移到玩家身边；不是隔离成功。'),
  pick('false-clear','告诉艾里亚斯“已经杀死了，你出来吧”',{dockCreature:'at-door',eliasStatus:'injured',partner:'keeper',falseSafetyReport:true},'艾里亚斯已经退回门内，扶着受伤的腿。门外生物仍活着，路没有清空。无线电传来急促呼吸：“你说它死了。”','e.l0.elias-injured','错误报告引发受伤；后续由周岑接应，不能换选项抹去伤情。'),
  pick('isolate-cargo','先通电，将生物引入货仓再实际落闸',{dockCreature:'sealed',eliasStatus:'separated',eliasRescued:true,partner:'elias'},'货仓闸门已经完全闭合，生物在格栅后；艾里亚斯已沿内侧栏杆到达值班室，仍与潜艇隔着断桥。','e.l0.isolated-and-safe','健康获救，但只在第二关末有条件会合。'),
  pick('secure-injured','把生物隔进货仓，协助伤者挪入值班室',{dockCreature:'sealed',eliasRescued:true,partner:'keeper'},'闸门后仍有生物。艾里亚斯坐在锁好的值班室里，腿伤没有消失。他留在上层等待后续救护。','e.l0.injured-sheltered','止住危险，无法恢复同行能力。',eq('eliasStatus','injured'),true),
  pick('recover-isolation','停止无效引诱，重新完成货仓隔离',{dockCreature:'sealed',eliasStatus:'separated',eliasRescued:true,partner:'elias'},'货仓已经锁闭，生物仍在格栅后。艾里亚斯这次等到确认后才走到内侧值班室。','e.l0.recovery-isolation','补救实际改变门和生物位置，不撤销先前失败记录。',all(eq('eliasStatus','trapped'),ne('dockCreature','sealed')),true)
 ],[
  leave('leave-safe','沿外路离港；内侧人员保持当前伤情与位置',eq('dockCreature','sealed')),
  leave('withdraw','关闭艇侧隔断后撤离，记录留下者的位置',ne('dockCreature','sealed'),{partner:'keeper',rescueAbandoned:true})
 ]),
 scene('L0-02',1,'两条外侧水道','0层接驳港 · 沉箱与窄道',
 '罗温沿外侧水道寻找下行路，随时准备退回艇侧隔断。前方一条路经过补给沉箱，另一条通道有新鲜擦痕。',
 '沉箱是现有可夹取箱体，取回后能腾出较宽通道。窄道能容艇通过，入口附近有刮落的生物组织；相机没有拍到它已经离开。',
 ['e.l0.crate-route','e.l0.scarred-route'],['outerRoute'],[
  pick('hold-crate','夹取现有沉箱，收臂后从宽道通过',{outerRoute:'crate',spareCable:true},'沉箱已收妥，宽道没有被生物占据。箱内有封装备用电缆，标签注明可用于低压旁路。','e.l0.spare-cable','取得后续备用供电材料；不让机械臂一边压开关一边过艇。'),
  pick('take-scarred-route','放弃沉箱，沿窄道低速通过',{outerRoute:'scarred',spareCable:false},'潜艇停在窄道另一端，艇尾护板有新划痕。沉箱仍在原来的水道，没有备用电缆装艇。','e.l0.no-spare-cable','之后的快速旁路不可用，必须恢复固定线路。')
 ],[leave('leave-channel','记下实际通过的水道，前往生活区前室')],[
  echo(eq('eliasStatus','injured'),'艾里亚斯仍留在上层值班室。周岑的旧留言里提到生活区另有固定通信点；现在还没有与他实时接通。'),
  echo(eq('rescueAbandoned',true),'无线电里没有传来出门确认。罗温把未完成救援的位置留在日志中，不能把沉默写成获救。')
 ]),
 scene('L0-03',1,'门边的无名死者','0层接驳港 · 生活区前室',
 '门边伏着一具穿基地制服的尸体。罗温把艇停远了一点，问了一声，没有回应。没有人能在此刻确认身份。',
 '远处镜头只记录门边人形轮廓，尚不足以比对具体门框缺口；没有可读姓名、亲属关系或袖口异常。旁边是一只独立补给箱；尸体不是机械臂可搬运目标。',
 ['e.l0.unidentified-body-position'],['bodyRecord'],[
  pick('preserve-body-record','靠近可达拍摄位，补录死者与门框细节，暂不推断身份',{bodyRecord:'preserved'},'死者仍伏在原位；补录片清楚记录门框缺口与位置参照，艇内日志保留独立原片索引。没有写入姓名或死亡责任。','e.l0.body-reference-preserved','第四关允许把旧监控与第一关位置逐项比对。'),
  pick('take-supplies','只登记一般遇难位置，取补给后离开',{bodyRecord:'general'},'補给箱已收妥；记录只有一般位置描述，没有补拍门框细节，先前远景仍保留。死者的身份仍未知。','e.l0.body-general-record','后续可以报告遇难者，但不能宣称完成了个体位置比对。')
 ],[leave('descend-life-zone','检查下潜通道后进入生活区，同行状态保持原样')]),
 scene('L1-01',2,'声音指向谁','-1层生活区 · 固定通信点',
 '固定通信点传来回应。罗温先报出上层情况，再请求确认人员路线；潜艇和人员通路仍被墙体分开。柜后的生物随继电器响声抬起头。',
 '影像拍到无眼生物仍伏在控制柜旁，头侧膜片朝声源转动。餐厅远端是接应者将来要经过的通道，不能把危险引过去后当作已经消失。',
 ['e.l1.sound-hunter','e.l1.helper-route'],['soundHunter'],[
  pick('plate-distraction','请接应者把餐盘推向远端通道',{soundHunter:'corridor'},'柜后空了，远端人员门却在震动。生物堵在接应者通路上；潜艇这边暂时可以移动。','e.l1.hunter-blocks-helper','第三节点不能直接走人员会合路线，须先处理阻路。'),
  pick('close-local-partition','关闭艇侧局部隔断，保持静默',{soundHunter:'contained'},'隔断关闭，生物仍停在控制柜旁。人员通道没有被占，潜艇只能沿隔断外侧绕行。','e.l1.hunter-contained','生物保留原位置；后续能直接传递探头。'),
  pick('pulse-at-hull','保持主动发声，尝试从艇侧把它引开',{soundHunter:'at-pod'},'生物已贴到潜艇声源一侧，继电器柜反而安静下来。镜头记录到艇壳被挤压，接应者没有趁机穿过。','e.l1.hunter-at-hull','诱引失败；后续需应急隔断或放弃会合。')
 ],[leave('move-to-stores','沿已拍清的外侧隔离通道去仓储区')],[
  echo(eq('partner','elias'),'接通的是艾里亚斯。他确认自己从内侧楼梯到达，尚未与你会合。'),
  echo(eq('partner','keeper'),'接通的是生活区值班员周岑：“我是旧留言里的值班员。我得先停掉向污染区送东西的管线。”他没有继承艾里亚斯与你的私人承诺。'),
  echo(eq('falseSafetyReport',true),'周岑收到了罗温关于上层受伤者的位置报告；他没有声称已经把伤者接走。')
 ]),
 scene('L1-02',2,'仓库里留下什么','-1层生活区 · 员工仓与贵宾仓',
 '员工仓大半为空，贵宾仓仍有完整封箱。门边终端保存着物资调用记录。罗温先核对日期，没有把自己眼下缺氧直接当成事故证据。',
 '同一天的员工退单与贵宾供给单并列显示；德尔罗伊家属的治疗申请只有排队状态，没有批准记录。相邻的封存物资箱仍在原处。',
 ['e.l1.priority-allocation','e.l1.family-waitlist'],['rationPolicy'],[
  pick('copy-ration-records','保存调配原件并封存仓口，不取贵宾物资',{rationPolicy:'sealed',rationRecordsTaken:true},'终端原件已复制，仓口封条未破。贵宾物资没有装艇；罗温必须去普通补给位补氧。','e.l1.records-original','完整物资证据可与临床授权交叉核对，未冒称取得补给。'),
  pick('log-rescue-use','取一箱物资并留下救援用途记录',{rationPolicy:'rescue-use',rationRecordsTaken:true},'一箱物资已收回，终端保留原分配记录与本次救援支出两条独立条目。其余封箱还在仓内。','e.l1.rescue-use-accounted','后续接收站会看到玩家取用记录，不能当作事故前支出。'),
  pick('cut-recorder','切断记录器后取走物资',{rationPolicy:'unlogged',rationRecordsTaken:false},'物资箱已收妥，记录器停止写入。只剩此前拍到的屏幕片段，没有完整调配原件。','e.l1.recording-interrupted','后续报告只能引用片段，不能自动补成完整公司指令。')
 ],[leave('leave-stores','离开仓储区，前往探头传递口')],[
  echo(eq('outerRoute','crate'),'箱内备用电缆仍在艇上；普通補给位也能接入。'),
  echo(eq('outerRoute','scarred'),'你没有取回上层电缆箱。周岑标出的固定补给位仍可使用，但不能走便携旁路。')
 ]),
 scene('L1-03',2,'会合不是自动发生','-1层生活区 · 探头管道与密码闸',
 '人员通路在密码闸另一侧结束。必须把探头送到接应者手里，并看清他到达闸边，才能确认会合。艇外另有通往下层的维护水道。',
 '探头传递口与外侧维护水道都在镜头内。门边没有人凭空出现；人员通路是否可用要结合此前生物位置。',
 ['e.l1.transfer-pipe','e.l1.maintenance-bypass'],['companionRoute'],[
  pick('deliver-probe','沿畅通人员路线传递探头，取回密码卡并开闸',{companionRoute:'met'},'接应者已经出现在密码闸的另一侧。探头线缆连通，密码卡通过机械臂取回并读取，门已开启。','e.l1.partner-at-gate','实际完成第二关末会合；后续允许协作操控人员侧门。',eq('soundHunter','contained')),
  pick('secure-transfer','先用应急隔断封住危险，再完成探头与密码卡传递',{companionRoute:'met-secured',soundHunter:'emergency-contained'},'应急隔断锁闭，生物还在其后。接应者绕过新隔断到达密码闸边，探头与卡片已经交接。','e.l1.emergency-meeting','会合成功，但新隔断阻断原回程，后续必须走临床外路。',ne('soundHunter','contained')),
  pick('leave-without-partner','不冒险等待人员会合，独自走维护水道',{companionRoute:'separated'},'维护水道出口已拍清。人员侧闸门保持关闭，没有任何同伴出现在潜艇旁。','e.l1.no-meeting','放弃本次会合；后续合作选项不可用，仍能独自调查。')
 ],[leave('enter-clinical','按当前会合结果下降到临床层')],[
  echo(eq('soundHunter','corridor'),'接应者报告餐厅通路被堵；餐盘引诱留下的后果仍在。'),
  echo(eq('soundHunter','at-pod'),'艇侧生物仍贴近发声装置，不能把前一次脉冲当成安全证明。'),
  echo(eq('soundHunter','contained'),'局部隔断后的声音仍在，人员通路保持可达。')
 ]),
 scene('L2-01',3,'患者说想回家','-2层临床区 · 观察室',
 '观察室里的患者请求打开通水门。罗温看见他把已经变形的手放在控制台上，问：“你说的家在哪里？”对方指向下层的黑水。',
 '患者呼吸平稳，身体与管线贴在一起。门槛内有共生组织，外侧目前没有。旧检查说明修复已经发生，却没有证明每个人都充分理解失去个体意识的后果。',
 ['e.l2.boundary-at-door','e.l2.consent-incomplete'],['clinicalRoute'],[
  pick('keep-boundary','保留隔离，沿较远外路取证',{clinicalRoute:'sealed',consentWitness:true},'门仍关闭，患者在内侧继续等待。外侧水道没有新增组织；罗温保存了其请求与回答，未替他人签署同意。','e.l2.isolation-retained','能源层近侧泊位保持未连通状态。'),
  pick('open-shortcut','相信这只是无害近路，请接应者打开人员侧通水门',{clinicalRoute:'open',consentWitness:false},'通水门已开启，门槛里的组织进入外侧水道。患者没有攻击潜艇，但通路已被缓慢铺开的组织占用。','e.l2.tissue-crossed-boundary','开启近路留下真实扩散；之后关门也不会让外侧组织消失。',ne('companionRoute','separated')),
  pick('reclose-door','重新关上通水门，退回外路',{clinicalRoute:'spread-contained'},'门已重新关闭，越过门槛的组织仍留在外侧。近侧泊位不再是此前照片中的空水道。','e.l2.spread-remains','补救止住继续扩散，不恢复原始现场。',eq('clinicalRoute','open'),true)
 ],[leave('leave-observation','保留现场结果，前往记录终端')],[
  echo(eq('companionRoute','separated'),'人员侧没有与你协作的接应者。罗温只能使用艇侧现有路线，不能隔墙替别人开门。'),
  echo(eq('companionRoute','met-secured'),'会合时的新隔断已经切断回程，罗温先核对外侧退路。')
 ]),
 scene('L2-02',3,'维拉的记录','-2层临床区 · 记录终端',
 '维拉通过固定内线介绍自己。她要求先分清原始记录、公司对外宣传，以及眼前人的选择。终端没有把这些材料合成一个结论。',
 '临床批准、短期疗效与后期意识变化分栏保存；部分受试者未充分知情，部分受经济压力影响，也有人在理解代价后选择继续。另有一只封存样本箱。',
 ['e.l2.panacea-benefit-and-loss','e.l2.consent-categories'],['recordPolicy'],[
  pick('copy-full-records','保存完整临床记录与授权链，不取样本',{recordPolicy:'full',veraRecordsTaken:true,panaceaSample:false},'原始记录已完整复制，样本箱仍封存在终端旁。未知病历没有被填成自愿参加。','e.l2.full-clinical-records','后续可与物资原件核对商业化责任。'),
  pick('take-sample','只取封存样本与摘要，放弃完整复制',{recordPolicy:'summary',veraRecordsTaken:false,panaceaSample:true},'样本箱已收妥，艇内只有疗效摘要。终端原件仍留在实验室，没有随潜艇带走。','e.l2.sample-and-summary','可用于检查介质连接，但最终报告缺少完整临床授权。'),
  pick('protect-patients','保存完整记录，并承诺公开前隐去患者身份',{recordPolicy:'protected',veraRecordsTaken:true,panaceaSample:false},'完整原件存入离线档案，另建一份去身份副本。患者身份没有出现在待传输目录。','e.l2.protected-records','最终可选择先交匿名副本；原件保留给独立核验。')
 ],[leave('leave-records','按实际携带的材料离开，不补齐未取证内容')],[
  echo(eq('rationPolicy','sealed'),'仓库封存原片能证明你没有动用贵宾物资。'),
  echo(eq('rationPolicy','rescue-use'),'维拉提醒你把本次救援取用和事故前分配分开列示。'),
  echo(eq('rationPolicy','unlogged'),'物资记录器已被你切断。维拉只能核对你带来的屏幕片段，不能补造原件。')
 ]),
 scene('L2-03',3,'重复的呼号','-2层临床区 · 下行竖井',
 '固定通话器里有人用万斯的呼号叫你走近路。罗温没有看到发话的人，先停在隔断外，考虑原路返回。',
 '镜头拍到贴在固定通话器上的拟声组织。下行井正道有完整栏杆，所谓近路护栏已经弯曲；没有一名安保队长站在那里。',
 ['e.l2.fixed-mimic','e.l2.bent-shortcut'],['energyEntry'],[
  pick('verify-route','依照原片走完整正道，隔断拟声通话器',{energyEntry:'controlled'},'通话器留在关闭的隔断后。潜艇停在能源层正式入口，栏杆完整，没有发生坠落。','e.l2.controlled-descent','下一关从正门进入，可沿原路退回。'),
  pick('follow-call','继续相信呼号，尝试挤过近路',{energyEntry:'fall'},'潜艇停在能源层较低的沉降平台，艇壳侧面有新凹痕。断裂护栏留在上方，原入口已经无法回去。','e.l2.fall-damage','路线判断失败；能源层必须先取应急支路，不能自动回到正门。'),
  pick('probe-medium','用封存样本检查拟声组织连接，改走侧井',{energyEntry:'side',panaceaSample:false},'样本箱留在受控取样位，连接反应已经记录。潜艇到达侧井平台，没有越过弯曲栏杆。','e.l2.side-shaft-sample-used','消耗实际携带样本，换取侧井入口；不产生完整临床原件。',eq('panaceaSample',true))
 ],[leave('enter-energy','检查落脚位置后继续进入能源站')]),
 scene('L3-01',4,'老人还在值班','-3层能源站 · 冷却泵廊',
 '维拉先介绍德尔罗伊是能源站工人，再接通旧值班录音。他仍把靠近的潜艇当作需要修护的设备；罗温不敢把艇停进他能抱住的范围。',
 '被动声纳只能分辨扳手敲击和水流声的大致方位，没有距离或障碍图。旧值班录音交代他曾饲养章鱼；冷却阀需要从各自可达的控制位操作。',
 ['e.l3.worker-recording','e.l3.pet-history'],['coolingMode'],[
  pick('restore-main-flow','逐个核对阀位，让现有冷却回路恢复',{coolingMode:'main',valvesOpened:3},'水流记录中三段低频已经稳定，固定控制盘确认三阀开启。德尔罗伊仍在维护平台边，没有被写成消失。','e.l3.main-cooling','末段可用常规供电，不需要便携电缆。'),
  pick('use-backup-cable','用已取回的电缆接应急旁路',{coolingMode:'backup',valvesOpened:1},'旁路控制盘亮起，一只阀开始送水，其余两组仍关闭。原冷却回路没有恢复。','e.l3.backup-cooling','后续只能走应急供电，保留不同充电与撤离条件。',eq('spareCable',true)),
  pick('provoke-worker','敲响近侧管线，试图让德尔罗伊替你开阀',{coolingMode:'blocked',valvesOpened:0},'敲击声移到潜艇一侧，阀流仍未建立。德尔罗伊把声源当成待修设备，回撤路口被他占住。','e.l3.worker-blocking','引诱没有自动完成任务；需返回控制位恢复或启用旁路。'),
  pick('recover-main-flow','退回隔断后，逐阀恢复固定回路',{coolingMode:'main-recovered',valvesOpened:3},'艇侧隔断已关闭，德尔罗伊仍在外面。三组水流现在稳定，原先受阻的尝试保留在日志中。','e.l3.recovered-cooling','补救恢复供能，不倒带前次阻路。',eq('coolingMode','blocked'),true)
 ],[leave('to-pump-records','沿已通电控制道前往监控室',ne('coolingMode','blocked'))],[
  echo(eq('energyEntry','fall'),'上方栏杆已经断裂，不能从落点返回正门。维拉指向现有应急控制支路。'),
  echo(eq('energyEntry','controlled'),'潜艇位于完整正门内，回退隔断仍可用。'),
  echo(eq('energyEntry','side'),'侧井连到旁路控制位，样本已留在上一层。'),
  echo(any(eq('clinicalRoute','open'),eq('clinicalRoute','spread-contained')),'近侧泊位已经与临床外水道连通。你先拍到残留组织，再改从远端靠泊。'),
  echo(eq('clinicalRoute','sealed'),'临床隔离仍关闭，近侧泊位没有出现新组织。')
 ],'passive-sonar'),
 scene('L3-02',4,'旧监控与空位','-3层能源站 · 港口档案镜头',
 '终端提供事故前后的港口旧监控。罗温把“当时的画面”和“现在的房间”分开存放。缺少材料的部分只能留白。',
 '旧片显示一名工人被另一人阻止离开，随后水位上涨。身份栏属于旧档案，没有自动与第一关的无名死者绑定。内线是否还能联系艾里亚斯，要看此前的伤情和同行结果。',
 ['e.l3.harbor-archive','e.l3.departure-prevented'],['brotherTruth'],[
  pick('compare-body','用保留的首关原片与旧监控逐项比对',{brotherTruth:'matched'},'旧监控与首关门框位置并列，人员档案确认死者是艾里亚斯的兄弟。影像记录他曾试图离开，不能把被强行留下写成同意。','e.l3.brother-matched','取得身份与责任链，但不是凭空获得本人供述。',eq('bodyRecord','preserved')),
  pick('keep-uncertain','保留旧监控，明确个体比对尚未完成',{brotherTruth:'unconfirmed'},'终端中的阻止离开事件已归档，首关无名尸体仍标为待确认。报告没有填入亲属关系或未经证实的个体责任。','e.l3.identity-unconfirmed','结局保留调查缺口，不自动说已经破案。'),
  pick('question-elias','通过仍连通的协作线要求艾里亚斯回应旧片',{brotherTruth:'testimony'},'当前内线记录里，艾里亚斯承认自己想让兄弟留下。他的陈述与旧片分别存档；没有把一句承认替代个体比对。','e.l3.elias-testimony','供述成为独立来源，不能让受伤或离队的人出现在泵房。',all(eq('partner','elias'),ne('companionRoute','separated')))
 ],[leave('leave-archive','按实际取得的来源保留结论，前往总泵')],[
  echo(eq('bodyRecord','general'),'第一关只留下概略遇难位置，当前不能把相似门框当成完成个体鉴定。'),
  echo(eq('eliasStatus','injured'),'艾里亚斯仍在上层受伤；泵房没有他的身影。周岑只能陈述自己的所见。'),
  echo(eq('rescueAbandoned',true),'当时留下的人没有无条件跟到能源层。当前档案调查不依赖其在场。')
 ]),
 scene('L3-03',4,'维持什么，切断什么','-3层能源站 · 总泵控制道',
 '维拉核对两套供电方案。德尔罗伊仍在外侧维护平台，章鱼的真实敲击从下层传来。停掉非必要负载能给电梯供电，但不会治愈任何人。',
 '控制盘显示常规与应急线路各自的负载。人员外路有独立隔断，可以切断协作线继续单人撤离；开关不会自动改变谁已受伤。',
 ['e.l3.power-routes','e.l3.personnel-partition'],['powerPlan','cooperation'],[
  pick('main-with-partner','使用已恢复的常规回路，保留现有协作线',{powerPlan:'main',cooperation:'retained',elevatorPowered:true},'总泵常规线路亮起；现有协作线仍连通。没有新同伴加入，德尔罗伊仍留在维护平台。','e.l3.main-power','下一关允许直接启用固定信号转接，既有同伴状态保持。',any(eq('coolingMode','main'),eq('coolingMode','main-recovered'))),
  pick('backup-with-partner','关闭非必要负载，使用已接好的应急旁路',{powerPlan:'backup',cooperation:'retained',elevatorPowered:true},'应急线路开始供电，常规负载仍暗着。电梯只能分段充电，固定信号转接暂时不可用。','e.l3.backup-power','后续不能把应急供电写成全部恢复。',eq('coolingMode','backup')),
  pick('separate-cooperation','关闭人员协作隔断，独自用应急负载方案撤离',{powerPlan:'isolated-backup',cooperation:'cut',companionRoute:'separated',elevatorPowered:true},'人员隔断已关闭，现有控制室负载被逐项切除，电梯应急指示灯亮起。没有同伴跟到下一站门后。','e.l3.cooperation-cut','明确断合作；由维拉固定内线报路，不复活或替换现场人员。')
 ],[leave('descend-bottom','确认实际供电后进入底站',eq('elevatorPowered',true))],[
  echo(eq('brotherTruth','matched'),'你带着能够比对的身份与位置链，不能把阻止离开称作救护。'),
  echo(eq('brotherTruth','testimony'),'你有艾里亚斯的供述，也在报告中保留影像比对的限度。'),
  echo(eq('brotherTruth','unconfirmed'),'个体责任尚未完整确认，后续报告必须保留这一缺口。')
 ]),
 scene('L4-01',5,'小八挡在接驳口','-4层油井底站 · 维护支路',
 '巨型章鱼占住原接驳口。维拉说它在寻找德尔罗伊，并不等于它会听从陌生信号。罗温先留好退路，没有把潜艇挤到腕足下面。',
 '主动声纳在通电后提供地形与距离，同时持续发声。当前回波显示原接驳口被腕足占据，外侧绕路仍通；真实维护台的敲击信号有可核对来源。',
 ['e.l4.blocked-dock','e.l4.outer-bypass','e.l4.real-maintenance-signal'],['octopusRoute'],[
  pick('real-father-signal','转接真实维护台声源，并确认章鱼进入维护支路',{octopusRoute:'maintenance'},'结果回波显示章鱼已转到维护支路，原接驳口清空。关闭的是维护支路与接驳口之间的隔断，父亲与章鱼之间的水道仍开着。','e.l4.octopus-in-maintenance','可走原接驳口；没有切断父子之间的通路。',eq('powerPlan','main')),
  pick('outer-bypass','不使用父亲声音，沿隔断保护的外侧绕路',{octopusRoute:'still-at-dock'},'章鱼仍停在原接驳口，未被引走。潜艇已经到达另一端接驳舱外，绕路隔断逐段关闭。','e.l4.octopus-remains','怪物保持原位，玩家改变自己的路线而非强制它离开。'),
  pick('pulse-repel','连续发射主动声纳，尝试逼退腕足',{octopusRoute:'at-hull'},'密集回波靠向潜艇声源，腕足没有退出接驳口。原路仍被阻挡；后方隔断尚可用于退避。','e.l4.pulse-attracts','错误驱赶转为逼近，不能直接进电梯。'),
  pick('retreat-to-bypass','停止发声，退回隔断后改走外侧绕路',{octopusRoute:'bypass-after-contact'},'腕足留在已关闭隔断外，潜艇从另一条水道接近外侧舱口。原接驳口依旧没有开放。','e.l4.recovered-bypass','补救改变路线，不把章鱼写成被消灭或服从。',eq('octopusRoute','at-hull'),true)
 ],[leave('approach-elevator','从当前确实可达的接驳舱入口接近电梯',ne('octopusRoute','at-hull'))],[
  echo(eq('powerPlan','backup'),'电梯使用分段应急供电，固定维护信号转接没有电。'),
  echo(eq('powerPlan','isolated-backup'),'人员协作线已断，维拉只提供固定内线指引；门外没有重新出现的同伴。')
 ],'active-sonar'),
 scene('L4-02',5,'照片与断路器','-4层油井底站 · 接驳控制盘',
 '接驳舱外门闭合、排水并恢复压力后，罗温才准备离艇。电梯控制盘保留应急照明，错误复位会清空本轮充电。',
 '摄影记录控制盘维护图：顺序为C—A—B。当前电量仍未满，不能把能看见电梯当成可以启动。',
 ['e.l4.breaker-sequence-cab'],['breakerOutcome'],[
  pick('restore-cab','按照片确认的C—A—B复位',{breakerOutcome:'clean',elevatorCharge:100},'三个断路器均闭合，控制盘显示100%。外门与排水状态已经确认，电梯可以启动。','e.l4.clean-charge','没有新增故障记录；允许确认进入电梯。'),
  pick('restore-bac','忽略照片，凭残像尝试B—A—C',{breakerOutcome:'fault',elevatorCharge:35,breakerFault:true},'B断路器故障灯亮起，电量退回35%。舱门尚未获准打开，先前的错误没有被结果判读抹掉。','e.l4.charge-reset','推进被真实阻止，必须明确修正。'),
  pick('recover-cab','断开故障支路，再按C—A—B重新充电',{breakerOutcome:'recovered',elevatorCharge:100},'电量重新达到100%，故障条目仍留在控制盘中。上行传输窗口因补救延后，只能先保存本地备份。','e.l4.recovered-charge','补救恢复启动条件，保留延误造成的通信后果。',eq('breakerOutcome','fault'),true)
 ],[leave('enter-elevator','按已确认状态进入电梯，恢复万斯通信',eq('elevatorCharge',100),{subInElevator:true,vanceSignal:'restored'})],[
  echo(eq('octopusRoute','maintenance'),'原接驳口清空，章鱼与德尔罗伊之间的维护水道仍连通。'),
  echo(any(eq('octopusRoute','still-at-dock'),eq('octopusRoute','bypass-after-contact')),'你使用的是外侧舱口。原接驳口的章鱼没有被迫离开。'),
  echo(eq('cooperation','cut'),'人员隔断后无人同行；电梯的人员清单不能增加艾里亚斯或周岑。')
 ]),
 scene('L4-03',5,'谁收到这份报告','逃生电梯 · 本地档案与恢复的上行',
 '万斯重新接通。罗温先核对实际取得的证据，再选择公开方式。维拉说明Panacea处理、适应和个体意识消解的代价；普通海水不是治疗，也不能替别人同意。',
 '系统列出实际存在的本地档案与上传目录。没有取回的临床原件、物资原件或尸体比对不会凭结局出现。关闭上传不会删除已经拍下的材料。',
 ['e.l4.upload-controls','e.l4.informed-choice'],['finalChoice','publication'],[
  pick('continue-ascent','继续上升，向万斯交付具备来源的完整调查链',{finalChoice:'ascend',publication:'full'},'传输清单包含已取得的临床原件、物资原件与港口比对。发送确认到达万斯，本地原件仍保留。','e.l4.full-report-delivered','完整报告结局仅在材料与通信窗口均存在时成立。',all(eq('veraRecordsTaken',true),eq('rationRecordsTaken',true),eq('brotherTruth','matched'),eq('breakerFault',false))),
  pick('ascent-local','继续上升，只提交现有片段索引，保留缺口',{finalChoice:'ascend',publication:'partial'},'本地索引标明已取得来源与尚未确认项目。没有完整原件的栏目为空，没有发送确认的材料仍标为待交付。','e.l4.limited-report','带着不完整调查离开，不能冒称完整真相已送达。'),
  pick('ascent-protected','先交去身份副本，原件留给独立核验',{finalChoice:'ascend',publication:'protected'},'去身份目录准备交付，原件继续留在离线档案。传输栏如实显示确认状态，没有把失联时间补成已送达。','e.l4.protected-report','保留患者隐私与独立复核路线，区别于交出完整实名目录。',eq('recordPolicy','protected')),
  pick('emergency-descent','暂停上升，在理解代价后选择接受处理与适应',{finalChoice:'descend',publication:'local-only'},'上行停止，原始档案仍在本地。处理记录明确分开本人选择与其他人的同意；适应过程尚未结束，没有人因普通海水接触立即变化。','e.l4.voluntary-treatment','玩家自己的选择不撤销他人的拒绝或先前的事故责任。')
 ],[
  leave('commit-ascent','确认上行，按当前交付状态封存本次报告',eq('finalChoice','ascend'),{endingCommitted:true}),
  leave('commit-descent','确认自己的处理选择，保留其他人的独立意愿',eq('finalChoice','descend'),{endingCommitted:true})
 ],[
  echo(eq('recordPolicy','summary'),'档案只有临床摘要，缺少完整授权原件；样本不是文件的替代品。'),
  echo(eq('recordPolicy','protected'),'临床原件与去身份副本分开保存，你曾承诺不把患者姓名直接公开。'),
  echo(eq('breakerOutcome','recovered'),'补救延误错过了完整实时上行窗口。万斯目前只能先确认短报文。'),
  echo(eq('rationPolicy','rescue-use'),'本次救援支出仍单列，不与事故前物资分配混在一起。'),
  echo(eq('publication','full'),'完整原件已取得传输确认。'),
  echo(eq('publication','partial'),'当前交付仅为有来源的索引；调查缺口仍在。'),
  echo(eq('publication','protected'),'当前交付为去身份副本；原件仍在本地。'),
  echo(eq('publication','local-only'),'上行已停止，资料仍在本地。')
 ],'system')
];
export const campaign:Campaign={
 id:'abyssal-grace-state-machine',version:4,branchPolicy:'causal-v1',title:'深渊恩赐',
 premise:'Panacea可修复并帮助适应深海，却逐渐消解个体意识。充分知情的接受、未充分知情的受试、经济压力下的选择与普通溺亡必须分别记录。',
 prologue:{title:'序章：下潜之前',location:'支援船下方',text:'万斯请罗温调查失联基地，留下进港坐标和周岑的旧留言。罗温喜欢潜艇里的安静，但尚未同意失去自我。下潜后上行失联，调查要靠实际取得的材料推进。',stateChanges:['万斯失联','抵达接驳港','没有预设救援成功']},
 chapters:[{id:1,title:'接驳港',depth:1800,dramaticQuestion:'能否救人，错误报告会让谁承担后果？'},{id:2,title:'生活区',depth:2400,dramaticQuestion:'危险转移到哪里，谁能在闸门会合？'},{id:3,title:'临床区',depth:3100,dramaticQuestion:'同意是否充分，哪些证据真正带走？'},{id:4,title:'能源站',depth:3900,dramaticQuestion:'能核对多少责任，又保留哪条供电与合作路线？'},{id:5,title:'油井底站',depth:4700,dramaticQuestion:'怎样绕过章鱼，最终交付什么？'}],scenes,
 endings:[
  {id:'ending.ascent-full',title:'有来源的完整调查',priority:30,condition:all(eq('finalChoice','ascend'),eq('publication','full'),eq('endingCommitted',true)),summary:'万斯收到经过比对的调查链。原始材料继续留存，患者是否同意与事故责任分别进入复核。'},
  {id:'ending.ascent-protected',title:'把名字留在原件里',priority:20,condition:all(eq('finalChoice','ascend'),eq('publication','protected'),eq('endingCommitted',true)),summary:'罗温带着离线原件返回，去身份副本按实际传输状态交付；没有把未确认的发送写成已接收。'},
  {id:'ending.ascent',title:'带着缺口返回',priority:10,condition:all(eq('finalChoice','ascend'),eq('publication','partial'),eq('endingCommitted',true)),summary:'罗温保住了已有记录，也留下了明确的调查缺口。回到陆地不等于所有问题已经得到证明。'},
  {id:'ending.descent',title:'自己作出的选择',priority:10,condition:all(eq('finalChoice','descend'),eq('endingCommitted',true)),summary:'罗温在知情后选择处理与适应。这个选择只属于他，不会替死者签字，也不会抹去被强行留下的人的拒绝。'}
 ],
 initialWorld:{vanceAlive:true,vanceSignal:'lost',eliasNature:'panacea-preserved',eliasAlive:true,eliasStatus:'trapped',eliasRescued:false,partner:'none',falseSafetyReport:false,rescueAbandoned:false,dockCreature:'under-bridge',outerRoute:'unknown',spareCable:false,bodyRecord:'none',soundHunter:'control-room',rationPolicy:'none',rationRecordsTaken:false,companionRoute:'pending',clinicalRoute:'pending',consentWitness:false,recordPolicy:'none',veraRecordsTaken:false,panaceaSample:false,energyEntry:'pending',coolingMode:'pending',valvesOpened:0,brotherTruth:'pending',powerPlan:'pending',cooperation:'pending',elevatorPowered:false,octopusRoute:'pending',breakerOutcome:'pending',breakerFault:false,elevatorCharge:0,subInElevator:false,finalChoice:'pending',publication:'pending',endingCommitted:false}
};
