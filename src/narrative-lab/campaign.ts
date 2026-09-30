import type { Campaign, Condition, Effect, NpcLine, Resolution, StoryScene } from './types';

const set=(path:string,value:string|number|boolean):Effect=>({path,op:'set',value});
const add=(path:string,value:number):Effect=>({path,op:'add',value});
const eq=(path:string,value:string|number|boolean):Condition=>({path,op:'eq',value});
const all=(...conditions:Condition[]):Condition=>({all:conditions});
const line=(speaker:NpcLine['speaker'],text:string,requires?:Condition):NpcLine=>({speaker,text,...(requires?{requires}:{})});
const cost=(power=.015,oxygen=3):Effect[]=>[add('pod.power',-power),add('pod.oxygen',-oxygen)];
const continueWith=(id:string,label:string,text:string,instructions:Effect[]=[]):Resolution=>({id,label,text,instructions});

const scenes:StoryScene[]=[
  {
    id:'L0-01',chapter:1,title:'断桥另一端的求救',location:'0层接驳港 · 断桥外侧',observation:'camera',
    entryText:'万斯的声音已经被深度压成断续的杂音。被动声纳里，一个男人反复呼叫：“这里是维修员艾里亚斯，我被困在接驳港。别开探照灯，水里有东西。”潜艇停在断桥外，基础摄像头只能拍到舷窗正前方。',
    scoutFootage:'五秒影像起初只有漂浮的铁锈。第十一秒显影后，断桥尽头出现一座半淹的值班台。艾里亚斯缩在卷帘门下方，一只惨白生物正循着灯光撞击玻璃。门内侧的手动闸杆在他伸手可及的位置；门外的怪物会追逐移动光源。',
    scoutFacts:['e.l0.elias-alive','e.l0.creature-follows-light','e.l0.manual-shutter'],plannedSeconds:{travel:95,reading:70,action:95},
    choices:[
      {id:'lure-dark',label:'熄灭舱灯，用短促探照把怪物引离卷帘门',instructions:[...cost(),set('world.dockCreature','lured'),add('relations.elias.trust',2)],evidence:['e.l0.creature-left-door','e.l0.elias-at-lever'],resultText:'结果影像里，怪物追着最后一次光斑游向断桥下方。艾里亚斯扑到闸杆前，双手压下去，卷帘门开始落下。门缝还够他侧身通过。',npcLines:[line('elias','就是现在。我关门，你守住桥下。')],consequence:'怪物离开门口，艾里亚斯取得关门机会。'},
      {id:'lure-noise',label:'保持黑暗，用主动声纳把怪物引到断桥残骸',instructions:[...cost(.025,4),set('world.dockCreature','lured'),add('player.stress',4),add('relations.elias.trust',1)],evidence:['e.l0.creature-at-bridge','e.l0.elias-at-lever'],resultText:'声纳脉冲过后，结果影像拍到怪物缠在断桥钢筋间。艾里亚斯已经握住闸杆。更远处的黑水里，有什么东西回应了刚才的脉冲。',npcLines:[line('elias','它被卡住了。快，我把门放下来。')],consequence:'怪物被残骸拖住，但主动声纳惊动了更远的水域。'}
    ],
    resolveText:'艾里亚斯仍在断桥另一侧。卷帘门落到底以后，他会从基地内部前往下一处接驳点；你驾驶潜艇走外侧水道。两条路暂时无法相通。',
    resolutions:[continueWith('seal-door','让艾里亚斯关门，约定在生活区会合','卷帘门在他身后落下。无线电里的呼吸声慢慢平稳：“我走里面，你走外面。频道别关。”',[...cost(.005,1),set('world.eliasStatus','separated'),set('world.dockCreature','sealed')])]
  },
  {
    id:'L0-02',chapter:1,title:'被水淹没的接驳走廊',location:'0层接驳港 · 外侧水道',observation:'camera',
    entryText:'外侧水道没有照明。艾里亚斯隔着墙替你读维修标识；他的声音每隔十几秒就被金属撞击盖住。前方两条通道都通往生活区，一条狭窄，一条被沉箱挡住。',
    scoutFootage:'影像显示左侧窄道的墙面布满新鲜抓痕，抓痕延伸进黑暗；右侧沉箱下方留有能让潜艇通过的空隙，但箱体正在缓慢下沉。艾里亚斯在无线电里认出右墙的检修灯，告诉你旁边有一只配重开关。',
    scoutFacts:['e.l0.left-route-scratched','e.l0.crate-sinking','e.l0.counterweight-switch'],plannedSeconds:{travel:80,reading:65,action:90},
    choices:[
      {id:'hold-crate',label:'用机械臂按住配重开关，从沉箱下方通过',instructions:[...cost(.02,5),set('world.outerRoute','crate')],evidence:['e.l0.crate-held','e.l0.route-clear'],resultText:'结果影像里，沉箱停在潜艇上方半米处。机械臂仍压着开关，通往生活区的蓝色检修灯出现在水道尽头。',npcLines:[line('elias','我听见你那边的液压声了。再往前二十米就是会合玻璃。')],consequence:'潜艇从沉箱下方通过，避开抓痕通道。'},
      {id:'take-scarred-route',label:'收起机械臂，沿抓痕通道低速通过',instructions:[...cost(.01,4),set('world.outerRoute','scarred'),add('player.stress',6)],evidence:['e.l0.route-clear','e.l0.creature-skin-on-wall'],resultText:'结果影像中，潜艇已经穿过窄道。镜头边缘挂着一片半透明皮肤，像某种东西刚贴着艇壳让开。生活区的蓝色检修灯在前方亮着。',npcLines:[line('elias','刚才是什么声音？罗温，你还在吗？')],consequence:'潜艇通过窄道，但有生物曾贴近艇壳。'}
    ],
    resolveText:'这不是一次单纯的设备事故。墙上的抓痕和门外的生物都来自事故之后，但艾里亚斯也不知道它们是什么。',
    resolutions:[continueWith('ask-what-happened','追问基地发生了什么','艾里亚斯沉默几秒：“警报响之前，医疗层在庆祝一例治疗成功。之后所有人都说自己听见了海。”',[set('world.investigationQuestion','panacea')])]
  },
  {
    id:'L0-03',chapter:1,title:'兄弟留在门边',location:'0层接驳港 · 生活区前室',observation:'camera',
    entryText:'生活区前室的补给箱能补充电池和氧气。艾里亚斯在内侧赶路，叫你先检查门边的尸体：“那是我弟弟。他没赶上关门。”他的声音发紧，却没有回避。',
    scoutFootage:'影像里，一个穿基地制服的男人伏在门边，指甲断在内侧门框上。肺部排出的气泡早已停止。尸体腕带写着“马库斯·韦尔”；旁边的家庭照片上，他和艾里亚斯站在同一艘小艇前。补给箱的封条完整。',
    scoutFacts:['e.l0.marcus-body','e.l0.elias-brother','e.l0.supply-intact'],plannedSeconds:{travel:65,reading:85,action:90},
    choices:[
      {id:'recover-tag',label:'取下身份牌和补给，答应把马库斯的名字带回去',instructions:[...cost(.01,2),set('world.brotherBodySeen',true),set('world.marcusTagTaken',true),add('relations.elias.trust',2),add('pod.power',.18)],evidence:['e.l0.marcus-tag-recovered','e.l0.supplies-loaded'],resultText:'结果影像里，尸体仍伏在原处，身份牌已从腕带取下。补给箱打开，电池接入潜艇。艾里亚斯没有说谢谢，只低声念了一遍弟弟的名字。',npcLines:[line('elias','马库斯。别让报告里只剩一个编号。')],consequence:'马库斯的身份牌成为贯穿后文的实物证据。'},
      {id:'take-supplies',label:'只取补给，记录尸体位置',instructions:[...cost(.005,2),set('world.brotherBodySeen',true),add('pod.power',.18)],evidence:['e.l0.marcus-body-logged','e.l0.supplies-loaded'],resultText:'结果影像里，补给已经装艇，尸体的位置被写入日志。身份牌仍留在马库斯手腕上。艾里亚斯听完后，只说：“好。”',npcLines:[line('elias','至少你看见他了。走吧。')],consequence:'你记录了马库斯，但没有取走身份牌。'}
    ],
    resolveText:'生活区的会合玻璃就在前方。第一层调查得到三个问题：怪物从哪里来、医疗层成功治疗了什么、马库斯为何死在一扇从内部抓过的门边。',
    resolutions:[continueWith('descend-life-zone','完成补给，进入生活区','潜艇下潜。艾里亚斯的脚步声在墙内与你同行，直到一块厚玻璃把你们重新放进彼此视线。',[set('world.eliasStatus','cooperate'),set('world.eliasRescued',true)])]
  },
  {
    id:'L1-01',chapter:2,title:'声音猎手',location:'-1层生活区 · 控制室与餐厅',observation:'camera',
    entryText:'厚玻璃把你们隔在两个空间：潜艇贴着控制室外墙，艾里亚斯在餐厅。控制室天花板突然坠下一只没有眼睛的生物，它循着继电器的咔嗒声爬向潜艇。艾里亚斯举起餐盘，指向远离你的走廊。',
    scoutFootage:'镜头朝向一只翻倒的金属柜。显影后，声音猎手蜷在柜后，头部的膜片随每次电流声张开。隔墙另一侧，艾里亚斯正把餐盘堆在门口；他能制造一次足够大的声响，但必须知道你何时准备好。',
    scoutFacts:['e.l1.hunter-behind-cabinet','e.l1.hunter-tracks-sound','e.l1.elias-ready-to-distract'],plannedSeconds:{travel:75,reading:70,action:100},
    choices:[
      {id:'plate-distraction',label:'关闭艇内噪声，示意艾里亚斯把餐盘踢向远端',instructions:[...cost(),set('world.soundHunter','corridor'),set('world.soundHunterMethod','plates'),add('relations.elias.trust',1)],evidence:['e.l1.hunter-followed-plates','e.l1.control-room-clear'],resultText:'结果影像中，金属柜后只剩一道湿痕。餐厅远端的门在震动，声音猎手正撞击门后的盘碟。控制室通往气动传送管的路线已经空出。',npcLines:[line('elias','它过去了。你那边有一根文件传送管，找得到吗？')],consequence:'艾里亚斯用餐盘引走猎手。'},
      {id:'sonar-distraction',label:'向远端走廊发射一次主动声纳脉冲',instructions:[...cost(.025,4),set('world.soundHunter','corridor'),set('world.soundHunterMethod','sonar'),add('player.stress',4)],evidence:['e.l1.hunter-followed-sonar','e.l1.control-room-clear'],resultText:'结果影像里，声音猎手已经离开柜后。它循着脉冲撞进远端走廊，餐厅里的艾里亚斯立刻放下餐盘，给你指向传送管。',npcLines:[line('elias','有效。但别再来第二次，这一层所有东西都听见了。')],consequence:'主动声纳引走猎手，也把声音传遍生活区。'}
    ],
    resolveText:'你第一次明确观察到怪物的感官规律。调查由“设备事故”转向“基地人员为何变成这些生物”。',
    resolutions:[continueWith('reach-tube','趁猎手离开，抵达气动传送管','潜艇贴到传送管外侧。艾里亚斯隔着玻璃等你把摄像头送过去。',[set('world.controlRoomClear',true)])]
  },
  {
    id:'L1-02',chapter:2,title:'把眼睛送到门后',location:'-1层生活区 · 气动传送管',observation:'mobile-camera',
    entryText:'控制室终端需要餐厅内部的密码，但艾里亚斯看不到终端屏幕，你也看不到他那边的密码牌。传送管恰好连通两个房间。你卸下移动摄像头，把它装进传送筒。',
    scoutFootage:'移动摄像头在餐厅端被艾里亚斯接住。他先对镜头比出三根手指，再将镜头对准门后的值班表。显影后，值班表背面写着密码“0719”，旁边夹着一份Panacea疗养区配餐表：员工餐减半，VIP营养液照常。',
    scoutFacts:['e.l1.password-0719','e.l1.vip-rations-prioritized','e.l1.elias-handled-camera'],plannedSeconds:{travel:55,reading:85,action:95},
    choices:[
      {id:'enter-password',label:'输入0719，打开艾里亚斯一侧的安全门',instructions:[...cost(.01,2),set('world.cameraWithElias',true),set('world.lifeDoorOpen',true)],evidence:['e.l1.door-open','e.l1.camera-still-with-elias'],resultText:'结果影像来自艾里亚斯手里的摄像头。安全门已经开启，他转身拍到餐厅外的走廊；声音猎手正伏在走廊尽头，却没有向他扑来。',npcLines:[line('elias','门开了。我把镜头留在手里，你告诉我往哪走。')],consequence:'安全门打开，摄像头暂时由艾里亚斯携带。'},
      {id:'copy-records',label:'先下载配餐表和门禁记录，再输入0719',instructions:[...cost(.02,3),set('world.cameraWithElias',true),set('world.lifeDoorOpen',true),set('world.rationRecordsTaken',true)],evidence:['e.l1.door-open','e.l1.ration-records','e.l1.camera-still-with-elias'],resultText:'结果影像显示安全门开启。下载记录证明公司在事故前连续六周削减员工供给。更奇怪的是，声音猎手伏在走廊尽头看着艾里亚斯，没有发动攻击。',npcLines:[line('elias','VIP先吃，这里一直如此。别停，门只开九十秒。')],consequence:'你取得公司压榨员工的证据，也拍到猎手对艾里亚斯的异常反应。'}
    ],
    resolveText:'这段异常影像暂时没有答案。艾里亚斯本人也看不到延迟显影的结果；是否把这个细节告诉他，由玩家决定。',
    resolutions:[
      {id:'note-clue',label:'把“怪物没有攻击艾里亚斯”记入私人日志',instructions:[set('world.eliasPhotoClue',true)],text:'你没有当场质问，只在日志里标记了时间和画面。艾里亚斯催你继续开门。'},
      {id:'dismiss-clue',label:'把它视为距离或角度造成的误判',instructions:[set('world.eliasPhotoClue',false)],text:'你暂时放下疑问。走廊的门正开始回落，眼前还有更紧迫的事。'}
    ]
  },
  {
    id:'L1-03',chapter:2,title:'共同穿过猎场',location:'-1层生活区 · 走廊门禁',observation:'mobile-camera',
    entryText:'艾里亚斯拿着移动摄像头穿过走廊，你在外墙水道与他并行。声音猎手堵在两条路线的交汇处。每次录像传回都已经是十几秒前；你们只能用旧影像推算它下一步的位置。',
    scoutFootage:'传回的影像显示猎手停在中央岔口，膜片朝向一根松动水管。右侧维护门通往下层。只要远端出现更响的噪声，它会离开岔口大约二十秒。',
    scoutFacts:['e.l1.hunter-at-junction','e.l1.loose-pipe-lure','e.l1.twenty-second-window'],plannedSeconds:{travel:75,reading:70,action:105},
    choices:[
      {id:'pipe-lure',label:'让艾里亚斯敲击远端水管，潜艇同步打开维护门',instructions:[...cost(.015,3),set('world.soundHunter','sealed-behind'),set('world.level1Unlocked',true),add('relations.elias.trust',2)],evidence:['e.l1.hunter-past-junction','e.l1.elias-through-door'],resultText:'结果影像里，猎手追向震响的水管。艾里亚斯冲过岔口，反手关闭维护门；潜艇外侧的下潜闸同时解锁。镜头最后一帧，猎手又停在他身后，没有立刻追击。',npcLines:[line('elias','关上了。把摄像头收回去，下面是疗养区。')],consequence:'双方同步完成诱导和开门，进入疗养区。'},
      {id:'sonar-cover',label:'由潜艇在外墙制造声纳噪声，艾里亚斯趁机过门',instructions:[...cost(.03,4),set('world.soundHunter','outer-wall'),set('world.level1Unlocked',true),add('player.stress',5)],evidence:['e.l1.hunter-at-outer-wall','e.l1.elias-through-door'],resultText:'结果影像里，猎手撞向与你一墙之隔的位置。艾里亚斯穿过维护门，手里的镜头剧烈晃动。门关闭前，猎手的头转向他，却再次迟疑。',npcLines:[line('elias','它在撞你那面墙。下潜，快。')],consequence:'潜艇成为声源，艾里亚斯借机通过。'}
    ],
    resolveText:'生活区留下两条调查证据：VIP优先消耗基地资源；怪物能够区分声音，却数次没有攻击艾里亚斯。',
    resolutions:[continueWith('recover-camera','在下潜闸前收回移动摄像头','艾里亚斯把摄像头放回传送匣。你收回它时，镜头外壳带着一层温热黏液。',[set('world.cameraWithElias',false),set('world.eliasStatus','cooperate')])]
  },
  {
    id:'L2-01',chapter:3,title:'照片里的疗养区',location:'-2层生物实验区 · VIP走廊',observation:'camera',
    entryText:'下潜闸一开，空气过滤器把甜味送进驾驶舱。舷窗外的走廊洁白、干燥，穿礼服的疗养客向你微笑。艾里亚斯却说这里只剩黑水和尸体。你第一次怀疑自己的眼睛。',
    scoutFootage:'显影后的影像没有白墙。VIP们被粉红组织包裹在玻璃舱里，脸上仍保持微笑；一名穿白大褂的“医生”背后伸出数条肢体，正在替舱内的人调整输液。墙上写着：PANACEA自愿共生观察，第43日。',
    scoutFacts:['e.l2.vip-bodies-transformed','e.l2.doctor-tentacles','e.l2.panacea-day43'],plannedSeconds:{travel:80,reading:95,action:90},
    choices:[
      {id:'trust-film',label:'遮住舷窗，只按显影影像规划路线',instructions:[...cost(.01,2),set('world.spores','recognized'),set('world.panaceaTruth','clinical-transformation')],evidence:['e.l2.safe-route-marked','e.l2.vision-contradicted'],resultText:'结果影像中，你标记的安全路线绕开了每一个“向你招手的人”。舷窗里仍是洁白走廊，照片里却有肢体贴着潜艇经过。',npcLines:[line('player','我看见的不是这里。照片才是。'),line('elias','别抬头。你报坐标，我替你看距离。')],consequence:'玩家确认孢子造成视觉幻觉，并以延迟影像导航。'},
      {id:'test-vision',label:'朝最近的“疗养客”靠近一米，再拍摄验证',instructions:[...cost(.02,3),set('world.spores','recognized'),set('world.panaceaTruth','clinical-transformation'),add('player.stress',8)],evidence:['e.l2.smiling-vip-is-maw','e.l2.vision-contradicted'],resultText:'肉眼里，那名老人仍向你伸手。结果影像里，他的胸腔已经打开成一张口，牙齿贴在离舷窗半米的位置。你立刻倒车。',npcLines:[line('elias','罗温，后退。你在往它怀里开。')],consequence:'一次近距离验证证明幻觉会把危险伪装成人。'}
    ],
    resolveText:'调查得出阶段性结论：Panacea临床试验与人员变异发生在同一地点，事故并非外来生物入侵。',
    resolutions:[continueWith('seal-intake','关闭外部进气，继续使用照片导航','甜味逐渐散去，幻觉没有立刻消失。你把舷窗遮到只剩一条缝。',[set('world.sporesFiltered',true)])]
  },
  {
    id:'L2-02',chapter:3,title:'维拉留下的第43日',location:'-2层生物实验区 · 主实验室',observation:'mobile-camera',
    entryText:'主实验室的门只剩一道缝。移动摄像头能穿过去。艾里亚斯认出门牌：“维拉的实验室。她发明了Panacea。”里面有人用温柔的女声说，治疗已经成功。',
    scoutFootage:'移动镜头穿过门缝。维拉的工作台上有一段未发送日志：Panacea不攻击宿主，它修复损伤、消除饥饿和痛苦，同时让个体意识接入深海网络。日志最后写着：“受试者不是失控，他们在请求我们加入。”声音来自一台循环播放的终端；维拉本人不在。',
    scoutFacts:['e.l2.vera-log','e.l2.panacea-removes-pain','e.l2.collective-consciousness','e.l2.vera-missing'],plannedSeconds:{travel:70,reading:115,action:85},
    choices:[
      {id:'download-vera',label:'下载维拉日志和公司临床授权记录',instructions:[...cost(.02,3),set('world.veraRecordsTaken',true),set('world.panaceaTruth','collective-consciousness')],evidence:['e.l2.company-rushed-trials','e.l2.vera-records-secured'],resultText:'结果影像里，终端下载灯已经熄灭。授权记录显示公司跳过正常临床周期，把治疗优先提供给付费疗养客户；维拉在最后三天要求暂停，公司拒绝。',npcLines:[line('elias','所以他们不是生病。他们是真的……觉得这样更好。')],consequence:'取得事故真相的核心证据与公司责任链。'},
      {id:'take-sample',label:'先封存一份Panacea样本，再下载日志',instructions:[...cost(.025,4),set('world.veraRecordsTaken',true),set('world.panaceaSample',true),set('world.panaceaTruth','collective-consciousness'),add('player.stress',3)],evidence:['e.l2.panacea-sample-sealed','e.l2.company-rushed-trials'],resultText:'透明样本盒里，黑色介质没有撞击盒壁，只在你触碰盒盖时向指尖聚拢。下载记录证明公司跳过临床周期，维拉的停试申请被驳回。',npcLines:[line('player','它不是在逃。它像是知道我碰了盒子。')],consequence:'玩家带走样本，也承担更高的携带风险。'}
    ],
    resolveText:'事故因果链成立：资源枯竭推动深海开发；Panacea疗效带来VIP业务；公司加速临床应用；介质让人自愿放弃个体意识。',
    resolutions:[continueWith('leave-lab','保存证据，前往疗养区出口','终端在你离开后又播放了一遍维拉的最后一句话：“如果平静本身具有意志，我们还能把同意叫作同意吗？”',[set('world.investigationComplete',true)])]
  },
  {
    id:'L2-03',chapter:3,title:'会说人话的灯笼',location:'-2层生物实验区 · 下行竖井',observation:'camera',
    entryText:'一名安保队长站在下行竖井前，制服干净，挥手叫你过去。他准确说出万斯的呼号。艾里亚斯催你跟上：“那是哈里斯，他知道能源层怎么走。”照片却还在显影。',
    scoutFootage:'影像完成时，安保队长的脸仍在微笑，颈后却拖着一根通向天花板的肉索。他每说一句话，头顶黑暗里就亮起一圈牙齿。所谓“哈里斯”只是垂在巨口前的人形诱饵。',
    scoutFacts:['e.l2.angler-lure','e.l2.harris-is-mimic','e.l2.shaft-behind-angler'],plannedSeconds:{travel:70,reading:85,action:105},
    choices:[
      {id:'flash-escape',label:'倒车拍摄，让闪光致盲灯笼怪后冲向竖井',instructions:[...cost(.025,4),set('world.angler','blinded'),set('world.fallenToEnergy',true),add('pod.hull',-.08)],evidence:['e.l2.angler-blinded','e.l2.shaft-collapse'],resultText:'结果影像只留下一个惨白圆环。灯笼怪缩回天花板，潜艇撞穿竖井护栏。画面倾斜、翻转，最后定格在越来越近的能源层灯带上。',npcLines:[line('elias','抓住东西！下面是能源层！')],consequence:'闪光制造逃生窗口，潜艇跌入-3层。'},
      {id:'decoy-sample',label:'抛出封存样本吸引它，再以闪光掩护撤退',condition:eq('world.panaceaSample',true),instructions:[...cost(.015,3),set('world.angler','feeding'),set('world.panaceaSample',false),set('world.fallenToEnergy',true),add('pod.hull',-.04)],evidence:['e.l2.angler-took-sample','e.l2.shaft-collapse'],resultText:'样本盒一离开机械臂，灯笼怪立刻放弃人形诱饵。闪光照出它吞下样本的瞬间，随后竖井护栏在潜艇重量下断裂。',npcLines:[line('player','它认识Panacea。它们本来就是同一种东西。')],consequence:'样本换来更安全的撤离，但潜艇仍跌入能源层。'}
    ],
    resolveText:'“哈里斯”证明怪物能够读取并模仿人的语言。艾里亚斯的判断失误让疑问加深，但他和玩家一起被坠落卷入下一层，没有时间对质。',
    resolutions:[continueWith('brace-impact','关闭外灯，固定驾驶座等待撞击','冲击把舷窗外的一切变黑。无线电里只剩艾里亚斯急促的呼吸，随后能源站的警报亮起。',[set('world.eliasStatus','separated-energy')])]
  },
  {
    id:'L3-01',chapter:4,title:'黑暗里拧阀门的人',location:'-3层能源站 · 冷却泵廊',observation:'passive-sonar',
    entryText:'能源站完全断电。艾里亚斯落在另一条检修道，只能通过无线电联系。一个老人拖着扳手在水中巡逻，每当相机预充电发出细响，他就猛冲过来。胸牌上的字在最后一次微光里闪过：德尔罗伊·坎贝尔。',
    scoutFootage:'你关闭摄像设备，记录五秒被动声纳。解析后的波形显示德尔罗伊沿固定路线往返三组冷却阀；扳手每次敲地后有八秒空窗。更深处还有巨大的软体回声，它会在德尔罗伊停下时轻触墙壁，像在回应他。',
    scoutFacts:['e.l3.delroy-patrol','e.l3.eight-second-window','e.l3.large-tentacle-response'],plannedSeconds:{travel:90,reading:85,action:110},
    choices:[
      {id:'open-valves-silent',label:'沿声纳标记潜行，在三次空窗内打开冷却阀',instructions:[...cost(.015,6),set('world.valvesOpened',3),set('world.delroyState','searching')],evidence:['e.l3.three-valves-open','e.l3.delroy-missed-player'],resultText:'第二次被动记录中，三组阀门的水流声已经连成一条稳定低频。德尔罗伊在错误的岔路上敲击墙面，嘴里反复说：“名额应该轮到我孙子。”',npcLines:[line('player','他还记得孙子。')],consequence:'不使用闪光打开三组阀门，德尔罗伊没有锁定潜艇。'},
      {id:'use-pipe-noise',label:'远程敲击管壁改变巡逻路线，再依次打开三组阀门',instructions:[...cost(.025,7),set('world.valvesOpened',3),set('world.delroyState','misdirected')],evidence:['e.l3.three-valves-open','e.l3.delroy-followed-pipe'],resultText:'解析波形显示德尔罗伊追着管壁回声走远。三组阀门全部开始送水。他经过一间旧休息室时停下，低声问：“小八，你饿不饿？”墙后的巨大回声随即收缩。',npcLines:[line('elias','小八是他养的章鱼。整个能源站的人都知道。')],consequence:'管壁噪声引开德尔罗伊，并建立他与章鱼的关系。'}
    ],
    resolveText:'德尔罗伊并非随机出现的怪物。他仍在执行能源工人的巡检路线，也仍惦记孙子和宠物章鱼。Panacea保留了记忆，却改变了记忆服务的对象。',
    resolutions:[continueWith('restore-cooling-flow','确认三组水流稳定，前往总泵房','冷却水重新流动，通往总泵房的液压门缓慢开启。艾里亚斯说他已经到门的另一侧。',[set('world.coolingFlow',true)])]
  },
  {
    id:'L3-02',chapter:4,title:'门开了，头没有回来',location:'-3层能源站 · 总泵房',observation:'camera',
    entryText:'总泵房恢复了微弱电力。艾里亚斯隔着门向你挥手。门刚升到肩高，一条比潜艇更粗的章鱼触手从黑暗中扫过，切掉他的头。身体倒了一瞬，又扶着门站起来。',
    scoutFootage:'显影影像里，艾里亚斯的头盔和头一起沉在几米外；无头身体仍面向镜头。颈部伸出细密触须，缠住门框和控制线。更后方的墙上嵌着德尔罗伊的旧合影：年轻章鱼趴在他肩上，照片背面写着“小八，一岁”。',
    scoutFacts:['e.l3.elias-head-separated','e.l3.elias-body-standing','e.l3.octopus-is-pet'],plannedSeconds:{travel:70,reading:110,action:100},
    choices:[
      {id:'confront-elias',label:'用马库斯和生活区照片质问艾里亚斯',condition:all(eq('world.brotherBodySeen',true),eq('world.eliasPhotoClue',true)),instructions:[...cost(.01,2),set('world.eliasRevealed',true),set('world.eliasStatus','revealed'),add('player.stress',12)],evidence:['e.l3.elias-admits-marcus','e.l3.elias-offers-peace'],resultText:'结果影像中，无头身体没有靠近。艾里亚斯的声音从颈部组织里传出：“马库斯本来要走。我让他留下。我按住他，直到他不再害怕。”他承认声音猎手早已把他当作同类。',npcLines:[line('elias','我没有骗你我叫艾里亚斯。我只是没告诉你，艾里亚斯已经不需要那颗头了。')],consequence:'前两章的尸体与异常影像在此闭合，艾里亚斯承认杀死兄弟。'},
      {id:'ask-what-are-you',label:'后退并问：“你到底是什么？”',instructions:[...cost(.01,2),set('world.eliasRevealed',true),set('world.eliasStatus','revealed'),add('player.stress',10)],evidence:['e.l3.elias-admits-marcus','e.l3.elias-offers-peace'],resultText:'无头身体把手放在胸口。艾里亚斯说自己仍记得童年、马库斯和你们一路走过的门；也记得事故后把弟弟按进水里，因为他相信那样就能永远在一起。',npcLines:[line('elias','你问发生了什么。答案是：我们终于不用一个人了。')],consequence:'没有依赖早期疑点也能得到真相，但对照证据较少。'}
    ],
    resolveText:'艾里亚斯从未伪造第一章的求救，也确实一路帮助玩家。他隐瞒的是事故发生前后自己已经接受Panacea，并把“救人”理解为让所有人永远留下。',
    resolutions:[
      {id:'refuse-grace',label:'拒绝“平静”，启动总泵',instructions:[set('world.graceRefused',true),set('world.pumpsOnline',true)],text:'“我想要安静，”你说，“但不是消失。”你压下总泵开关。艾里亚斯的触须立刻勒紧控制线。'},
      {id:'feign-consent',label:'假装愿意加入，等总泵完成启动',instructions:[set('world.graceRefused',true),set('world.pumpsOnline',true),add('relations.elias.trust',1)],text:'你让声音保持平静：“先让电梯通电。”艾里亚斯松开一部分控制线。总泵在你们之间轰鸣起来。'}
    ]
  },
  {
    id:'L3-03',chapter:4,title:'闪光把父亲叫回来',location:'-3层能源站 · 总泵出口',observation:'passive-sonar',
    entryText:'艾里亚斯锁死来路，颈部触须沿门缝爬向潜艇。德尔罗伊仍在泵廊巡逻。总泵必须持续运转四十秒，逃生电梯才会获得电力。相机的闪光会暴露你，也会把德尔罗伊引向这里。',
    scoutFootage:'被动声纳解析出三组接近中的回声：门边的艾里亚斯，泵廊里的德尔罗伊，以及墙后那只巨大章鱼。德尔罗伊每听见章鱼触腕撞墙就会停步，像父亲在辨认孩子的敲门声。',
    scoutFacts:['e.l3.three-threats','e.l3.delroy-follows-octopus','e.l3.pump-forty-seconds'],plannedSeconds:{travel:55,reading:85,action:120},
    choices:[
      {id:'flash-delroy',label:'朝艾里亚斯身后闪光，把德尔罗伊引来',instructions:[...cost(.025,5),set('world.delroyState','enraged-at-elias'),set('world.eliasStatus','restrained'),set('world.pumpsOnline',true)],evidence:['e.l3.delroy-attacks-elias','e.l3.pump-cycle-complete'],resultText:'结果记录先是一片白，随后只有声纳波形。德尔罗伊冲进泵房，用扳手砸向抓住控制线的触须。艾里亚斯的身体转过去拥抱他，像在欢迎一位迟到的同伴。四十秒计时归零。',npcLines:[line('elias','德尔罗伊，别怕。小八也在这里。')],consequence:'利用德尔罗伊争取总泵启动时间。'},
      {id:'pipe-call-octopus',label:'模仿章鱼撞墙的节奏，把德尔罗伊引到泵房另一侧',instructions:[...cost(.02,5),set('world.delroyState','seeking-octopus'),set('world.eliasStatus','restrained'),set('world.pumpsOnline',true)],evidence:['e.l3.delroy-at-wall','e.l3.pump-cycle-complete'],resultText:'波形中，德尔罗伊停在墙边，一遍遍回应你敲出的节奏。章鱼真正的触腕从另一侧贴上墙面。两组回声重合时，总泵完成启动，出口锁打开。',npcLines:[line('player','他不是在追我。他一直在找那只章鱼。')],consequence:'用父子般的信号关系完成泵站逃生。'}
    ],
    resolveText:'能源站所有人物线索汇合：公司拒绝德尔罗伊孙子的治疗名额；他把孤独寄托在章鱼“小八”身上；Panacea让人与章鱼共享意识，章鱼因此成为集体网络的中心。',
    resolutions:[continueWith('drop-to-well','脱离泵房，下潜至油井底站','潜艇穿过出口。身后的声音逐渐变成同一个节奏：扳手、触腕、艾里亚斯的声音，都在敲同一扇门。',[set('world.energyEscaped',true),set('world.elevatorPowered',true)])]
  },
  {
    id:'L4-01',chapter:5,title:'小八',location:'-4层油井底站 · 电梯外环',observation:'active-sonar',
    entryText:'逃生电梯需要九十秒充电。巨型章鱼盘绕在电梯外环，触腕表面嵌着工牌、输液管和仍在眨眼的人脸。它没有开口，驾驶舱里却响起无数人共同的念头：下来，这里没有疼痛。',
    scoutFootage:'主动声纳绘出章鱼完整轮廓：三条触腕挡住充电接口，两条护着德尔罗伊的休息舱，中央躯体与Panacea管网连成一体。每次声纳脉冲都让它短暂收缩，但下一次反应更快。',
    scoutFacts:['e.l4.octopus-network-core','e.l4.sonar-repels-octopus','e.l4.charge-port-blocked'],plannedSeconds:{travel:80,reading:90,action:105},
    choices:[
      {id:'pulse-charge',label:'控制声纳间隔，逐段逼退触腕并接上充电',instructions:[...cost(.035,5),set('world.octopusState','repelled'),set('world.elevatorCharge',90)],evidence:['e.l4.charge-connected','e.l4.octopus-learning'],resultText:'结果声纳显示三条触腕退到外环之外，充电接口锁定。章鱼开始在脉冲之间提前收缩，像在学习你的节奏。倒计时：90秒。',npcLines:[line('player','它在学。我只有这一轮。')],consequence:'主动声纳暂时逼退章鱼，电梯开始充电。'},
      {id:'irregular-pulse',label:'用不规则声纳节奏掩护机械臂接线',instructions:[...cost(.045,4),set('world.octopusState','confused'),set('world.elevatorCharge',90)],evidence:['e.l4.charge-connected','e.l4.octopus-confused'],resultText:'不规则脉冲让章鱼的触腕数次扑空。机械臂把充电线锁入接口。最后一次回波里，它不再后退，只安静地挡在电梯门前。倒计时：90秒。',npcLines:[line('player','它不怕了。它在等我用完声音。')],consequence:'不规则声纳延缓章鱼学习，为接线争取时间。'}
    ],
    resolveText:'最终Boss并非陌生巨兽，而是德尔罗伊养大的章鱼。它通过Panacea继承了整座基地的记忆，也把“让父亲不再失去家人”扩张成吞并所有个体。',
    resolutions:[continueWith('begin-charge','锁定充电线，进入九十秒生存阶段','电梯指示灯逐格亮起。章鱼的思想贴近驾驶舱：“你喜欢安静。我们记得。”',[set('world.finalDefenseStarted',true)])]
  },
  {
    id:'L4-02',chapter:5,title:'黑暗里的三个断路器',location:'-4层油井底站 · 电梯控制壁',observation:'camera',
    entryText:'充电到六十秒时，底站断电。三个断路器必须按正确顺序复位，错误一次就会清空进度。舷窗外完全黑暗，章鱼触腕正在移动。你只有一次照明弹和一卷可显影影像。',
    scoutFootage:'照明弹把底站照亮五秒。显影完成时，现场早已重新黑暗，但照片清楚记录三个断路器的编号与触腕位置：B在左下，C在中央护板后，A在右上；安全顺序写在维护牌上：C—A—B。',
    scoutFacts:['e.l4.breaker-sequence-cab','e.l4.tentacle-snapshot','e.l4.single-flare-spent'],plannedSeconds:{travel:60,reading:95,action:115},
    choices:[
      {id:'restore-cab',label:'按照片记忆在黑暗中复位C—A—B',instructions:[...cost(.02,4),set('world.breakerSequenceKnown',true),set('world.elevatorCharge',100),set('world.octopusState','at-door')],evidence:['e.l4.breakers-restored','e.l4.elevator-fully-charged'],resultText:'结果影像借电梯应急灯拍下：三个断路器都保持闭合，电量达到100%。章鱼已经移到电梯门外，触腕尖端模仿人手按着开门按钮。',npcLines:[line('player','它看过我们怎么用这部电梯。')],consequence:'延迟影像提供唯一可靠的空间记忆，电梯完成充电。'},
      {id:'restore-bac',label:'凭肉眼残像尝试B—A—C',instructions:[...cost(.015,4),set('world.breakerSequenceKnown',false),set('world.elevatorCharge',35),add('player.stress',8)],evidence:['e.l4.breaker-reset-failed','e.l4.octopus-at-door'],resultText:'结果影像里，B断路器的故障灯亮着，充电退回35%。章鱼已经贴到电梯门上。照片中的维护牌仍清楚写着C—A—B，你还有一次按照片纠正的机会。',npcLines:[line('player','我记错了。照片没错。')],consequence:'错误顺序造成时间损失，但结果照片明确给出补救答案。'},
      {id:'recover-cab',label:'按照片改为C—A—B，完成复位',condition:eq('world.elevatorCharge',35),instructions:[...cost(.025,5),set('world.breakerSequenceKnown',true),set('world.elevatorCharge',100),set('world.octopusState','at-door')],evidence:['e.l4.breakers-restored','e.l4.elevator-fully-charged'],resultText:'应急灯重新亮起。三个断路器保持闭合，充电达到100%。门外的触腕已经弯成一只手的形状，轻轻敲了三下。',npcLines:[line('player','C，A，B。开门。')],consequence:'结果反馈支持补救，状态机不会因一次误判阻塞。'}
    ],
    resolveText:'摄影机制在最终关承担核心职责：玩家无法实时看见操作空间，只能依靠已经过去的五秒影像在黑暗中行动，并用结果影像确认后果。',
    resolutions:[continueWith('enter-elevator','切断充电线，驾驶潜艇进入电梯','潜艇进入轿厢。门闭合到最后一米时，章鱼拖来德尔罗伊的身体，像把父亲带进一间不会再分离的家。',[set('world.subInElevator',true)])]
  },
  {
    id:'L4-03',chapter:5,title:'上面重新有了声音',location:'-4层油井逃生电梯 · 轿厢',observation:'system',
    entryText:'电梯上升。万斯的信号重新接通，他兴奋地说公司愿意支付额外奖金，只要你把Panacea研究数据带回去。噪声、命令和结算条款一股脑灌进驾驶舱。深海的共同意识则在下面安静等待。',
    scoutFootage:'电梯系统读数显示：上行线路通往公司的隔离接收站，数据端口会在抵达时自动上传；紧急下降线路仍然可用，终点是已经被Panacea网络覆盖的海底。维拉的记录、马库斯的身份牌和一路影像都保存在潜艇内，不会因选择方向而消失。',
    scoutFacts:['e.l4.surface-auto-upload','e.l4.emergency-descent-available','e.l4.evidence-preserved'],plannedSeconds:{travel:70,reading:105,action:95},
    choices:[
      {id:'continue-ascent',label:'保持上升，把事故证据带回陆地',instructions:[...cost(.005,1),set('world.finalChoice','ascend')],evidence:['e.l4.ascent-continues','e.l4.records-ready'],resultText:'结果读数显示上升速度稳定。万斯开始逐条确认隔离流程。深海的声音没有愤怒，只在距离拉远时重复你的名字。',npcLines:[line('vance','罗温，把记录留在本地备份。上来以后先别让公司的人碰原件。')],consequence:'玩家选择保留个体意识，并把真相带回嘈杂的人类世界。'},
      {id:'emergency-descent',label:'按下急停，启动紧急下降',instructions:[...cost(.005,1),set('world.finalChoice','descend')],evidence:['e.l4.descent-engaged','e.l4.surface-link-fading'],resultText:'结果读数显示高度开始下降。万斯的声音被拉成一条越来越细的线，最终消失。章鱼从井壁松开一条触腕，为轿厢让出道路。',npcLines:[line('vance','罗温？你按了什么？回答我——')],consequence:'玩家主动返回深海，选择没有痛苦也没有自我的平静。'}
    ],
    resolveText:'结局把序章的性格伏笔变成真正选择：喜欢安静不等于愿意消失，但深海提供的诱惑确实击中了玩家最初承认的欲望。',
    resolutions:[
      {id:'commit-ascent',label:'确认上行',condition:eq('world.finalChoice','ascend'),instructions:[set('world.endingCommitted',true)],text:'你把手从急停按钮上移开。潜艇日志开始向万斯朗读第一条证据：马库斯·韦尔，死亡地点，0层接驳港。'},
      {id:'commit-descent',label:'确认下行',condition:eq('world.finalChoice','descend'),instructions:[set('world.endingCommitted',true)],text:'你关闭广播，把舱内最后一盏提示灯调暗。下降的失重感包住身体。下面没有掌声，也没有命令，只有欢迎。'}
    ]
  }
];

export const campaign:Campaign={
  id:'abyssal-grace-state-machine',version:3,title:'深渊恩赐',
  premise:'Panacea治愈高压、缺氧、饥饿与疾病，也抹除个体意识。基地居民不是遭受折磨的感染者，而是被绝对平静吸引、主动加入深海集体意识的人。',
  prologue:{title:'序章：下潜之前',location:'支援船下方 · 单人调查潜艇',text:'万斯要求罗温调查失联基地并取回研究数据。罗温承认自己讨厌陆地的噪声和人际关系，待在狭窄潜艇里反而放松。随着深度增加，万斯失联；这份对安静的向往成为终局选择的情感前提。',stateChanges:['任务：调查事故并取回研究数据','玩家倾向：渴望安静，但尚未同意放弃自我','通信：万斯失联','导航：抵达0层接驳港坐标']},
  chapters:[
    {id:1,title:'接驳港',depth:1800,dramaticQuestion:'求救者能否被救出，基地里出现了什么？'},
    {id:2,title:'生活区',depth:2400,dramaticQuestion:'怪物为何不攻击艾里亚斯？'},
    {id:3,title:'生物实验区',depth:3100,dramaticQuestion:'Panacea究竟治愈了人，还是取代了人？'},
    {id:4,title:'能源站',depth:3900,dramaticQuestion:'艾里亚斯、德尔罗伊与章鱼如何共同造成悲剧？'},
    {id:5,title:'油井底站',depth:4700,dramaticQuestion:'玩家要把真相带回陆地，还是接受深海的平静？'}
  ],
  scenes,
  endings:[
    {id:'ending.ascent',title:'带着噪声活下去',priority:10,condition:all(eq('world.finalChoice','ascend'),eq('world.endingCommitted',true)),summary:'罗温带着维拉日志、公司授权记录和全部影像返回陆地。陆地依然嘈杂，公司仍会争夺Panacea，但个体证词第一次有机会对抗“恩赐”。'},
    {id:'ending.descent',title:'深渊恩赐',priority:10,condition:all(eq('world.finalChoice','descend'),eq('world.endingCommitted',true)),summary:'罗温关闭无线电，返回已经让出道路的深海。最后的声音不是尖叫，而是所有失踪者用同一个呼吸说：现在安静了。'}
  ],
  initialWorld:{
    vanceAlive:true,vanceSignal:'lost',investigationQuestion:'accident',dockCreature:'loose',outerRoute:'unknown',
    eliasNature:'panacea-preserved',eliasStatus:'trapped',eliasAlive:true,eliasRescued:false,brotherBodySeen:false,marcusTagTaken:false,
    controlRoomClear:false,soundHunter:'control-room',soundHunterMethod:'none',cameraWithElias:false,lifeDoorOpen:false,rationRecordsTaken:false,eliasPhotoClue:false,level1Unlocked:false,
    spores:'unknown',sporesFiltered:false,panaceaTruth:'unknown',veraRecordsTaken:false,panaceaSample:false,investigationComplete:false,angler:'hidden',fallenToEnergy:false,
    valvesOpened:0,delroyState:'patrol',coolingFlow:false,eliasRevealed:false,graceRefused:false,pumpsOnline:false,energyEscaped:false,elevatorPowered:false,
    octopusState:'dormant',elevatorCharge:0,finalDefenseStarted:false,breakerSequenceKnown:false,subInElevator:false,finalChoice:'pending',endingCommitted:false
  }
};
