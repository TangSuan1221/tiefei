import type { Campaign, Condition, Effect, NpcLine, Resolution, StoryScene } from './types';

const set = (path:string,value:string|number|boolean):Effect => ({path,op:'set',value});
const add = (path:string,value:number):Effect => ({path,op:'add',value});
const eq = (path:string,value:string|number|boolean):Condition => ({path,op:'eq',value});
const has = (path:string,value:string):Condition => ({path,op:'has',value});
const lacks = (path:string,value:string):Condition => ({path,op:'notHas',value});
const all = (...conditions:Condition[]):Condition => ({all:conditions});
const any = (...conditions:Condition[]):Condition => ({any:conditions});
const line = (speaker:NpcLine['speaker'],text:string,requires?:Condition):NpcLine => ({speaker,text,...(requires?{requires}:{})});
const cost = (power=.03,oxygen=3):Effect[] => [add('pod.power',-power),add('pod.oxygen',-oxygen)];
const companion = any(eq('world.eliasStatus','companion'),eq('world.eliasStatus','cooperate'));
const passengers = any(eq('world.nikoRescued',true),eq('world.lenaRescued',true));
const quarantineKnown = has('knowledge.vance','e.l5.dry-contamination');

const drafts:Omit<StoryScene,'resolutions'>[] = [
  {
    id:'l1-01',chapter:1,title:'笼子外面有东西',location:'接收层 · 维修笼外',
    entryText:'你驾驶潜艇停在基地入口。无线电里传来一个男人的声音：“我是维修员埃利亚斯，困在北边的防护笼里。外面有东西，先别开门。”笼子旁边是一间敞开的货仓，仓内装着绞盘——一台收放钢索的电动机。你可以从艇内给它供电。先拍一段笼外的录像，弄清是什么堵住了他的出口。',
    scoutFootage:'录像里，穿着潜水服的埃利亚斯站在格栅后向你招手。货架下面，一只长着数条肢体的怪物拖着缆索爬过笼门。旁边的货仓开着门，绞盘的吊索垂在仓内。笼侧还有一副沿导轨移动的救援座架，可以把穿潜水服的人固定在潜艇外，并接上独立供氧。',
    scoutFacts:['e.l1.elias-trapped','e.l1.predator-outside','e.l1.winch-path'],
    plannedSeconds:{travel:70,reading:55,action:75},
    choices:[
      {id:'low-pulse',label:'让绞盘低速转动片刻，再拍摄仓口',instructions:[...cost(),set('world.lureTested',true),set('world.winchReady',true)],evidence:['e.l1.vibration-response'],resultText:'绞盘已经停下，吊索还在摇晃。录像里，怪物从货架下爬出来，扑向吊索，抓了几下，又退到货仓门口。它离开了维修笼，但还没有被关住。',npcLines:[line('vance','它刚才确实追着吊索过去了。可以再试着把它引深一点。'),line('elias','声音远了一些。我还在笼里，等你。')],consequence:'怪物被吊索吸引；绞盘运转正常，耗电较少。'},
      {id:'high-pulse',label:'让绞盘高速转动片刻，再拍摄仓口',instructions:[...cost(.06),set('world.lureTested',true),set('world.winchReady',true),set('world.winchWorn',true)],evidence:['e.l1.vibration-response','e.l1.winch-wear'],resultText:'录像里，怪物正抓着剧烈摇摆的吊索。绞盘已经停转，过载保护灯亮着，支架上多了一道裂纹。怪物仍在敞开的货仓门口。',npcLines:[line('vance','过载保护跳了。先停下来，得把电机恢复才能继续用。')],consequence:'怪物被吸引过来，但绞盘过载，需要复位；这次试动耗电更多。'},
      {id:'reset-test',label:'复位绞盘，以低速重新试动',condition:eq('world.winchWorn',true),instructions:[...cost(.04,5),set('world.winchWorn',false),set('world.lureTested',true),set('world.winchReady',true)],evidence:['e.l1.vibration-response','e.l1.winch-reset'],resultText:'录像里，绞盘低速运转，吊索在仓内来回摆动。怪物追着吊索抓挠，没有再靠近维修笼。过载保护灯已经熄灭。',npcLines:[line('elias','别急，我还能等。')],consequence:'绞盘恢复正常。维修和试动额外消耗了电力与氧气。'},
    ],
    resolveText:'怪物会追逐这根活动的吊索。货仓有一道能锁住的闸门；把它引进仓内，再关门，埃利亚斯才有机会出来。',
    implementationNotes:['实验文本采用自主短试后记录稳定响应；正式3D不得伸臂与曝光同时进行。'],
  },
  {
    id:'l1-02',chapter:1,title:'把怪物关进货仓',location:'接收层 · 货仓门侧面',
    entryText:'你绕到货仓侧面，停在能看见门底的位置。这里可以控制闸门。埃利亚斯还在维修笼里等着；你得先确认怪物进了仓，才能放他出来。',
    scoutFootage:'录像里，怪物的前肢伸进货仓，尾部还搭在门槛上。右侧门轨夹着一段断钢带。门旁的锁销对着固定孔，只有闸门落到底，锁销才能插进去。',
    scoutFacts:['e.l1.gate-clearance','e.l1.threshold-tail','e.l1.track-debris'],
    plannedSeconds:{travel:45,reading:60,action:105},
    choices:[
      {id:'clear-and-hold',label:'清掉门轨碎片，用绞盘引它深入后关门',instructions:[...cost(.04,4),set('world.predatorIsolated',true),set('world.gateJammed',false)],evidence:['e.l1.predator-isolated','e.l1.lock-engaged'],resultText:'收回机械臂后拍到的录像里，闸门已经落到底，锁销穿过固定孔。门底没有露出肢体。绞盘停转后，仓内仍传来撞击声，闸门没有松动。',npcLines:[line('vance','看门底，再看锁销。两处都对上了，这次关住了。')],consequence:'怪物被锁在货仓里，可以准备救人。'},
      {id:'close-early',label:'趁怪物前半身进仓，立即关门',instructions:[...cost(.02),set('world.predatorIsolated',false),set('world.gateJammed',true)],evidence:['e.l1.gate-obstructed'],resultText:'录像里，闸门斜卡在怪物尾部和断钢带上。锁销顶着孔边，插不进去。怪物还在门口挣动，维修笼的出口仍不安全。',npcLines:[line('elias','它又靠近了。我不出去，你慢慢来。')],consequence:'关门失败。需要抬起闸门，清除碎片，再把怪物引进去。'},
      {id:'recover-gate',label:'抬闸清理碎片，重新引入怪物并锁门',condition:eq('world.gateJammed',true),instructions:[...cost(.05,6),set('world.predatorIsolated',true),set('world.gateJammed',false)],evidence:['e.l1.predator-isolated','e.l1.lock-engaged','e.l1.gate-recovered'],resultText:'再次拍摄时，闸门已经落到底。锁销完整穿过固定孔，门槛上没有肢体，撞击声来自门后。维修笼前的通道空了出来。',npcLines:[line('vance','这次锁住了。再去笼子那边看看路上有没有障碍。')],consequence:'补救成功，可以继续救援；额外消耗了一些电力和氧气。'},
    ],resolveText:'接人前还要从维修笼一侧核对闸门。看到锁销插好，才能开笼；如果门还卡着，就先修好它。',
  },
  {
    id:'l1-03',chapter:1,title:'接到第一个人',location:'接收层 · 维修笼出口',
    entryText:'你把潜艇移到维修笼的出口旁。埃利亚斯要沿导轨坐进救援座架，再由座架固定到艇外。开笼前，你还需要检查货仓门和这段导轨。头顶的上行井传来一声金属挤压声。',
    scoutFootage:'录像左侧是笼门和救援座架，右侧能看见货仓门底与锁杆。座架的导轨末端压着一块碎板。笼旁的设施图标出：你身后的上行井通向海面，基地最底层另有一部旧油井电梯。',
    scoutFacts:['e.l1.transfer-route','e.l1.transfer-debris','e.l1.bottom-exit-map'],
    plannedSeconds:{travel:60,reading:55,action:75},
    choices:[
      {id:'complete-rescue',label:'锁好货仓、清轨接人，再取补给并检查上行井',instructions:[...cost(.03,4),set('world.predatorIsolated',true),set('world.gateJammed',false),set('world.eliasStatus','companion'),set('world.eliasDisposition','companion'),set('world.transferStuck',false),set('world.upperRouteBlocked',true),set('world.bottomExitVerified',true),add('relations.elias.trust',2),add('pod.power',.12)],evidence:['e.l1.elias-rescued','e.l1.transfer-sealed','e.l1.upper-route-blocked','e.l1.bottom-exit-verified'],resultText:'录像里，埃利亚斯坐在艇外救援座架上，固定夹扣紧，供氧管连接完好。他抬手向你示意。座架后方，你来时经过的上行井已经被坍塌的岩石堵死，刚清掉的挡板后面没有可供潜艇通过的空隙。艇外货箱里放着取回的电池和液压接头。无线电随后响起，万斯说：“底层油井电梯的控制线路还通着。我试了一下，轿厢能动。”',npcLines:[line('elias','谢谢。下面的设备我熟。你需要我做什么，叫我就行。',eq('world.eliasStatus','companion')),line('vance','上面的路走不通。底层油井电梯还能动，我们去那里找出口。')],consequence:'埃利亚斯固定在艇外，靠独立供氧随艇同行。你拿到了补给，也确认只能继续向下寻找出路。'},
      {id:'hasty-transfer',label:'锁好货仓后低速试接；清障接人，再取补给并检查上行井',instructions:[...cost(.06,8),set('world.predatorIsolated',true),set('world.gateJammed',false),set('world.transferStuck',false),set('world.eliasStatus','companion'),set('world.eliasDisposition','companion'),set('world.upperRouteBlocked',true),set('world.bottomExitVerified',true),add('relations.elias.trust',2),add('pod.power',.12)],evidence:['e.l1.elias-rescued','e.l1.transfer-sealed','e.l1.upper-route-blocked','e.l1.bottom-exit-verified'],resultText:'录像里，清出的碎板落在导轨旁，埃利亚斯已经坐稳在艇外救援座架上。固定夹扣紧，供氧管没有折弯。座架后方的上行井已被岩石堵死，无法容纳潜艇通过。取回的电池和液压接头放在艇外货箱里。万斯通过无线电告诉你，底层油井电梯的控制线路仍然畅通，测试时轿厢发生了移动。',npcLines:[line('elias','现在稳了。谢谢你，没有把我留在那里。',eq('world.eliasStatus','companion'))],consequence:'埃利亚斯获救并随艇同行；返工多耗了一些电力和氧气。'},
    ],resolveText:'埃利亚斯已固定在艇外救援座架上，你仍留在驾驶舱内。要抵达底层电梯，还得修好潜艇的冷却系统。下一层的维修站存有需要的滤芯和轴封。',
    implementationNotes:['本场两种操作方案都完成真实救援与出口核验，避免缺失核心同伴的另一套未编写战役。'],
  },
  {
    id:'l2-01',chapter:2,title:'两个房间，同一个声音',location:'生活层 · 东西两间隔离舱外',
    entryText:'潜艇进入生活层后，两个方向同时传来一个女人的求救，连咳嗽声都一模一样。埃利亚斯从艇外指出维修站的移动摄影器接口。接好摄影器后，你可以让它沿开放的通道靠近两间舱室，带回艇外基础摄像头拍不到的远处影像。',
    scoutFootage:'移动摄影器带回的录像里，西舱地面躺着一台广播器；东舱墙上的肉状组织随着求救声收缩，一只空衣袖挂在门把手下。西舱的广播器旁留着原始求救记录，标签上的发送时间早于你的出发时间。',
    scoutFacts:['e.l2.replay-source','e.l2.vocal-tissue','e.l2.remote-camera'],
    plannedSeconds:{travel:75,reading:75,action:90},
    choices:[
      {id:'challenge-and-box',label:'核对求救记录，把广播器装入密封工具盒带走',instructions:[...cost(.04),set('world.voiceTool',true),set('world.sourceQuarantined',true)],evidence:['e.l2.first-call-human','e.l2.voice-not-identity','e.l2.voice-tool-tested'],resultText:'你读完原始记录：一名女值班员曾在这里发出求救，随后倒下。你要求两个声源说出一个新数字，西舱仍重复旧录音，东舱却答了出来。广播器装入可传出声音的密封工具盒后，你收臂试播并拍摄。录像里，附近的怪物沿开放水道靠近工具盒，盒内的附着物没有逸出。',npcLines:[line('vance','最早发信号的是活人。我们没有来错，只是来晚了。',has('knowledge.vance','e.l2.first-call-human'))],consequence:'你带走了密封广播器。它的声音可能帮助你把怪物引离通道。'},
      {id:'seal-sources',label:'关上两间舱室，只带走求救记录',instructions:[...cost(.02),set('world.sourceQuarantined',true)],evidence:['e.l2.first-call-human','e.l2.voice-not-identity'],resultText:'操作结束后的录像里，两间舱室的隔断都已闭合，广播器留在西舱。回收到的原始记录显示，一名女值班员曾在这里求救后倒下。现在东舱里模仿她声音的，只剩墙上的组织。',npcLines:[line('elias','救生舱那边还有一个信号，很弱。我把位置发给你。',companion)],consequence:'两个声源被关在舱内。你没有携带广播器，之后需要用其他办法避开怪物。'},
      {id:'recover-tool',label:'从外侧检修口取出广播器，封装后试播',condition:all(eq('world.sourceQuarantined',true),eq('world.voiceTool',false)),instructions:[...cost(.05,5),set('world.voiceTool',true)],evidence:['e.l2.voice-tool-tested'],resultText:'你通过检修口取出广播器并封好，再收回机械臂试播。录像里，开放水道中的怪物向声音靠近；另一只被实心隔断挡住，没有过来。两间舱室的主门仍然关闭。',npcLines:[line('player','盒子封好了。主门不用打开。')],consequence:'你补取了广播器；回收和测试多耗了一些电力与氧气。'},
    ],resolveText:'救生舱还有人在呼叫。刚才的求救声并不都来自活人。接近下一个求救者时，你需要先看到他本人。',
  },
  {
    id:'l2-02',chapter:2,title:'图纸上没有这根管',location:'生活层 · 冷却设备维修站',
    entryText:'维修站里有潜艇需要的冷却滤芯和轴封，但滤芯被沉积物卡住，需要用水反向冲洗才能取下。埃利亚斯说，平时他们会启动公共水泵一起冲洗。万斯按岸上的旧图纸找到了泄压阀，你却在阀旁看见一块后来换上的标牌。动阀以前，先拍清这里的管道。',
    scoutFootage:'录像里，新标牌标出的备用氧瓶管路，正接在旧图所指的泄压口后面。公共冲洗管还通往第三层，管内黏着肉状组织。旁边另有一根能单独关闭的小管，只通向滤芯仓。',
    scoutFacts:['e.l2.revised-manifold','e.l2.backwash-flow','e.l2.local-isolation'],
    plannedSeconds:{travel:70,reading:70,action:100},
    choices:[
      {id:'local-backwash',label:'关好氧瓶管路，单独冲洗滤芯仓，取回维修件',instructions:[...cost(.06,4),set('world.coolingReady',true)],evidence:['e.l2.oxygen-preserved','e.l2.local-backwash-complete'],resultText:'录像里，备用氧瓶的压力保持稳定，公共水泵的叶轮没有转动。维修架上的滤芯安装位已经空了；取回的滤芯和轴封放在潜艇的维修箱内。',npcLines:[line('vance','现场这块标牌是新版。我把找到的图纸都发过去，我们重新核一遍。',has('knowledge.vance','e.l2.revised-manifold'))],consequence:'取回维修材料，保住备用氧气。这条操作路线耗电较多，但不会再把组织冲到下层。'},
      {id:'public-backwash',label:'按旧图泄压，用公共水泵冲洗并取回维修件',instructions:[...cost(.02,8),set('world.coolingReady',true),set('world.wet2Connected',true),set('world.oxygenLost',true)],evidence:['e.l2.oxygen-loss','e.l2.downstream-contamination'],resultText:'录像里，泄压阀已经关闭，备用氧瓶的压力比操作前低了一截。取回的滤芯和轴封放在艇外维修箱内；它们后方的透明管道中，肉状组织正随水流向第三层移动。',npcLines:[line('vance','那只阀接着备用氧瓶，是我的旧图错了。剩下的氧气先保住。')],consequence:'操作省电，但损失了备用氧气，第三层管道也受到污染。'},
      {id:'stop-and-reroute',label:'停掉公共水泵，单独冲洗并取回维修件',condition:eq('world.wet2Connected',true),instructions:[...cost(.05,4),set('world.coolingReady',true),set('world.wet2FlowStopped',true)],evidence:['e.l2.flow-stopped-after-spread'],resultText:'录像里，公共管道的水流已经停止。取回的滤芯和轴封放在艇外维修箱内，空出的安装位还在滴水。第三层入口处的管壁上，仍附着着刚才被冲过去的组织。',npcLines:[line('player','水停了，可那些东西已经过去了。第三层还得小心。')],consequence:'额外耗电，阻止更多组织进入下层；已发生的污染仍需处理。'},
    ],resolveText:'维修材料已经收回。离开维修站前，你要换好冷却滤芯和轴封，再决定是否锁停公共水泵。也可以把管道录像发给万斯，让他修正那张旧图纸。',
  },
  {
    id:'l2-03',chapter:2,title:'救生舱里的尼科',location:'生活层 · 救生舱停放区',
    entryText:'求救者自称尼科。他被困在一只密封救生舱里，靠独立氧瓶维持呼吸。“你能看见左边那个急救包吗？”他问。潜艇外侧只有一个适合这种救生舱的挂架，与埃利亚斯的救援座架分开。接走尼科之前，你得检查缠在舱外挂轨上的东西。',
    scoutFootage:'你请尼科把急救包放到舷窗前，再拍摄确认。录像里，他按要求搬动了急救包，舱内的耗氧记录也在变化。但外侧挂钩缠着肉状组织，供氧软管在转弯处绷得很紧。即使把他接走，也应该让他留在密封舱内。',
    scoutFacts:['e.l2.niko-responsive','e.l2.single-rack','e.l2.transfer-hazards'],
    plannedSeconds:{travel:60,reading:65,action:115},
    choices:[
      {id:'rescue-niko',label:'挡住附着物，清理挂轨后接走整只救生舱',condition:{path:'world.nikoStatus',op:'ne',value:'left'},instructions:[...cost(.06,5),set('world.nikoRescued',true),set('world.nikoStatus','aboard'),set('world.nikoTransferFailed',false),add('relations.niko.trust',2)],evidence:['e.l2.niko-secured','e.l2.niko-seal-complete'],resultText:'收臂后的录像里，护栅把肉状组织挡在挂轨外，救生舱的两个固定夹都已扣紧，供氧软管没有折弯。尼科隔着舷窗点头。他仍在自己的密封舱内，这只舱已经固定在潜艇外侧。',npcLines:[line('niko','还有艾文……他没能出来。别漏了他的名字。',eq('world.nikoStatus','aboard')),line('elias','我认识他。他的工位就在我旁边。',companion)],consequence:'尼科获救，随艇同行。他的救生舱占用了唯一的标准挂架，并需要潜艇供电。'},
      {id:'hasty-hook',label:'不清理挂钩，先试着接上救生舱',condition:all(eq('world.nikoRescued',false),eq('world.nikoStatus','waiting')),instructions:[...cost(.02),set('world.nikoTransferFailed',true)],evidence:['e.l2.niko-hook-obstructed'],resultText:'录像里，救生舱还停在原来的导轨上。一条肉状肢体缠住了挂钩，供氧软管也被拉出一个折角。固定夹没有扣上，继续拉可能扯坏管路。',npcLines:[line('niko','舱在晃。先别拉，我把内门关好了。',eq('world.nikoStatus','waiting'))],consequence:'接驳失败，尼科仍靠舱内氧瓶等待。清理挂轨后还可以再救他。'},
      {id:'leave-niko',label:'留下路线资料，放弃接走尼科',condition:eq('world.nikoRescued',false),instructions:[set('world.nikoStatus','left'),set('world.nikoRescued',false)],evidence:['e.l2.niko-left'],resultText:'录像里，你的挂架已经收回，尼科的救生舱仍停在原处。他靠在窗边，望着潜艇离开的方向。舱内的应急灯还亮着。',npcLines:[line('player','尼科，我把路线留给你。我不能带你走了。')],consequence:'你留下了尼科，潜艇的标准挂架仍然空着。'},
    ],resolveText:'离开前，你还有时间重新安排救援，或给已经接上的小舱补充氧气。驶离这里之后，就要继续往更深处走了。',
  },
  {
    id:'l3-01',chapter:3,title:'实验还在继续',location:'实验层 · 实验室门外',
    entryText:'实验室的门关着，门边有一条排水缝。把微型摄像头送进去，就能查看里面的情况。你还需要找到切割头，才能继续清理下潜路线。门旁的取物槽与外面的机械臂接口相连，可以在不开门的情况下取出小件设备。',
    scoutFootage:'镜头从桌下拍到一只手，正在反复给空培养盒扣盖子。切割头就在盒子旁边，身体被桌板挡住。换到取物槽一侧，能看见槽内的推杆和末端挡块：推杆够得到盒子，也够得到切割头。',
    scoutFacts:['e.l3.repeated-lab-action','e.l3.retrieval-slot'],
    plannedSeconds:{travel:80,reading:80,action:100},
    choices:[
      {id:'move-box',label:'推开培养盒，引开那只手，再从取物槽拿走切割头',instructions:[...cost(.04),set('world.cutterReady',true),set('world.toolDamaged',false)],evidence:['e.l3.body-replaced','e.l3.sample-chain','e.l3.cutter-retrieved'],resultText:'侧面的录像里，那只手仍在远处追着培养盒，手臂拉得很长，根部连着墙上的肉状组织。切割头、样本封签和工伤卡已经放进回收架。卡上的日期显示，工作人员先接触钻探样本，几天后才出现身体异常。',npcLines:[line('elias','切割头拿到了？先把槽关上。',companion)],consequence:'切割头已取回。那只手仍会做实验，但它已经不再连着一个人的身体。'},
      {id:'open-lab',label:'打开实验室大门，直接拿切割头',instructions:[...cost(.03,5),set('world.cutterReady',true),set('world.toolDamaged',true)],evidence:['e.l3.body-replaced','e.l3.sample-chain','e.l3.claw-damage'],resultText:'被迫卸下的夹爪还卡在门内的组织里，备用末端已把切割头和物证取回。侧面录像拍清了那只手：它连着墙上的组织。取回的封签和工伤卡记录了样本接触与身体异常的先后日期。',npcLines:[line('vance','液压负荷超限。卸末端，别拖着整条臂硬退。')],consequence:'切割头拿到了，原夹爪却已损坏，需要维修。'},
      {id:'repair-claw',label:'换上本层的备用夹爪，测试取物槽',condition:eq('world.toolDamaged',true),instructions:[...cost(.04,6),set('world.toolDamaged',false),set('world.cutterReady',true)],evidence:['e.l3.claw-restored'],resultText:'新夹爪完成张开、闭合测试，取物槽也回到了停止位置。实验室的门保持关闭，里面的组织仍在活动。',npcLines:[line('player','夹爪能用了。那扇门别再开了。')],consequence:'机械臂恢复正常。使用的是实验层的备用夹爪，随艇电气备件仍然保留。'},
      {id:'clean-side-retrieval',label:'从未受污染的侧面靠泊，推开盒子后取走工具',condition:all(eq('world.wet2Connected',false),eq('world.toolDamaged',false)),instructions:[...cost(.02,2),set('world.cutterReady',true)],evidence:['e.l3.body-replaced','e.l3.sample-chain','e.l3.cutter-retrieved'],resultText:'侧面泊位仍然畅通。被推开的培养盒留在远处，那只手伸长追着它，另一端连在墙上的组织里。切割头、封签和工伤卡已收进回收架；卡片日期显示，样本接触发生在身体异常之前。',npcLines:[line('player','上面没有往这边排水，还能从侧面靠过去。')],consequence:'侧面路线省去了外廊的防护操作，取物消耗更少。'},
    ],resolveText:'回收的工伤卡上写着埃利亚斯的名字，维修服编号是 M-04。他也接触过这些样本。卡片没有告诉你，他现在的身体变成了什么样。',
  },
  {
    id:'l3-02',chapter:3,title:'他刚才是怎么做到的',location:'实验层 · 维修服检修架',
    entryText:'急流撞歪了潜艇的外挂架。埃利亚斯从救援座架上伸手，把滑脱的载荷推了回去。你把潜艇靠上检修平台，松开座架的安全夹，让他沿扶手进入检修架。先拍摄挂架，看看有没有损坏。',
    scoutFootage:'外挂载荷已经回到接口。检修架就在旁边，埃利亚斯伸着右臂扶住接口。慢放时，他的手肘似乎弯过了维修服的金属挡块，但这个角度看不清。附近的检修托架能固定他的右臂；从那里拍摄，可以同时看见供电插头和关节挡块。',
    scoutFacts:['e.l3.elias-helped','e.l3.motion-needs-check'],
    plannedSeconds:{travel:65,reading:90,action:105},
    choices:[
      {id:'private-test',label:'请埃利亚斯配合检修，断开右臂电源后拍摄',instructions:[...cost(.03),set('world.motionChecked',true)],evidence:['e.l3.identity-motion'],resultText:'录像同时拍着拔下的电源插头和埃利亚斯的右臂。没有电，手肘却仍然越过金属挡块。皮套下面有什么东西在拉动骨架。你还看不到里面的全貌。',npcLines:[line('elias','只是检修？好，你说什么时候动。',companion)],consequence:'这次动作无法用维修服的电机解释。埃利亚斯只知道你在检修，还不知道你看出了什么。'},
      {id:'accept-help',label:'先固定载荷，不检查他的维修服',instructions:[...cost(.02),add('relations.elias.trust',1)],evidence:['e.l3.payload-secured'],resultText:'复拍显示接口已经扣紧，外挂载荷不再滑动。镜头仍然被支架挡住，看不清埃利亚斯的手肘。',npcLines:[line('player','谢谢。先把载荷固定。')],consequence:'载荷保住了。你接受了他的帮助，暂时放下对手肘动作的疑问。'},
      {id:'vance-check',label:'告诉埃利亚斯，万斯也看到了异常录像；要求他接受复检',condition:has('knowledge.vance','e.l3.identity-motion'),instructions:[...cost(.04),set('world.suspicionPublic',true),set('world.motionChecked',true),add('relations.elias.trust',-1),add('relations.vance.respect',1)],evidence:['e.l3.identity-motion','e.l3.public-boundary'],resultText:'埃利亚斯站在指定的检修线外。新的录像里，断电的右臂仍能越过金属挡块。他知道你和万斯都在查他的维修服。',npcLines:[line('vance','我看过你发来的录像了。先别让他碰转运接口。',has('knowledge.vance','e.l3.identity-motion')),line('elias','你要我留在哪里？说清楚。',companion)],consequence:'你公开了怀疑，埃利亚斯对你的信任下降。他暂时不得靠近转运接口。'},
    ],resolveText:'埃利亚斯刚刚帮了你。你要不要把关于他的检查结果告诉万斯，仍由你决定。',
  },
  {
    id:'l3-03',chapter:3,title:'给谁通电',location:'实验层 · 医疗电源柜',
    entryText:'医疗层的电源断了，莱娜的通信时断时续。埃利亚斯建议恢复整层供电，但配电图显示：同一个开关也会启动通往下一层的水泵。柜旁还有一个能挂两个救生舱的双舱支架。装上它，可以少跑一趟，但潜艇会更难横向移动。',
    scoutFootage:'微型摄像头拍到配电柜内部：医疗电源和循环水泵接在同一组开关上。水管经过隔离水槽，继续通向第四层。附近的双舱支架有两组独立锁扣，旁边存放着下潜所需的隔热外套和调压零件。',
    scoutFacts:['e.l3.medical-pump-link','e.l3.buffer-boundary','e.l3.dual-rack-visible'],
    plannedSeconds:{travel:75,reading:80,action:105},
    choices:[
      {id:'medical-only',label:'改用备用加热器的供电线路接通医疗层，带走双舱支架',instructions:[...cost(.06,5),set('world.medicalPowered',true),set('world.dualRack',true),set('world.developHeaterReduced',true),set('world.thermalReady',true)],evidence:['e.l3.medical-only','e.l3.dual-rack-secured'],resultText:'医疗灯亮着，循环泵的叶轮停着不动。双舱支架已经固定，隔热外套和调压零件收进了货架。新的电缆绕过水泵开关，单独通向医疗层；原来接在这条线路上的备用加热器已经断电。',npcLines:[line('lena','电回来了……听着，别让穿 M-04 的人进排水舱。埃利亚斯穿上那套衣服以前，身体就已经变了。',eq('world.lenaStatus','waiting'))],consequence:'医疗层恢复供电，没有为救人再开通水路。双舱支架已准备好，莱娜的警告还需要亲自核实。'},
      {id:'restore-main',label:'恢复整层供电，取走隔热外套和调压零件',instructions:[...cost(.02),set('world.medicalPowered',true),set('world.wet3Connected',true),set('world.thermalReady',true)],evidence:['e.l3.medical-with-spread'],resultText:'医疗灯亮着，循环泵也在转。带着肉状组织的水穿过隔离槽，流向第四层。隔热外套和调压零件已收进货架，双舱支架仍留在原处。',npcLines:[line('lena','通信恢复了。你们先别把水送进来。',eq('world.lenaStatus','waiting'))],consequence:'供电消耗较少，但污染水进入了第四层。没有双舱支架，救人时可能需要分两趟。'},
      {id:'cut-after-flow',label:'停掉循环泵，改接医疗电源，再取双舱支架',condition:eq('world.wet3Connected',true),instructions:[...cost(.06,6),set('world.wet3FlowStopped',true),set('world.medicalPowered',true),set('world.dualRack',true),set('world.developHeaterReduced',true)],evidence:['e.l3.medical-rerouted-after-spread','e.l3.dual-rack-secured'],resultText:'循环泵停止转动，医疗灯仍然亮着。第四层管口残留着肉状组织。新装好的双舱支架固定在艇侧，前方一条没有进水的检修通道通向医疗层。',npcLines:[line('player','泵停了。已经流下去的污水，我们到下面再处理。')],consequence:'花费额外电力和时间停止继续扩散，并准备好第二个救生舱挂位。'},
    ],resolveText:'通信稳定下来，莱娜发来一条新的警告：“你旁边是埃利亚斯吗？先别带他过来。我给你发他的检查记录。看清 M-04 里面是什么，再决定要不要让他靠近。”',
    implementationNotes:['备用加热降低属于正式设备设计；实验曝光显影仍用统一规则，不假称已实现可变12秒计时。'],
  },
  {
    id:'l4-01',chapter:4,title:'请留在镜头里',location:'医疗层 · 维修服检修架',
    entryText:'莱娜传来埃利亚斯的医疗记录和维修服接口图。你靠上医疗层的检修平台，解除座架上的航行安全夹，让他进入检修架。维修服的接口已经破损，微型摄像头可以从那里进入。你把另一台摄像头对准他的右臂，先对齐两台设备的计时，再准备检查。',
    scoutFootage:'外部镜头拍清了胸前的 M-04 编号。内部镜头拍到金属骨架旁正在收缩的肉状组织，但暂时看不出它只是粘在衣服里，还是已经替代了身体。检修架上的固定夹具可以限制维修服的大幅动作。',
    scoutFacts:['e.l4.suit-interface','e.l4.sync-calibrated'],
    plannedSeconds:{travel:75,reading:100,action:105},
    choices:[
      {id:'controlled-inspection',label:'用检修架固定维修服，同时拍摄服内外的动作',instructions:[...cost(.05,5),set('world.inspectionComplete',true),set('world.suspicionPublic',true)],evidence:['e.l4.identity-confirmed','e.l4.medical-delay'],resultText:'检查录像中，埃利亚斯仍在重复转手、停住、反转的动作。两段同步录像显示，服内组织随手臂一起收缩，骨架之间已经没有完整的人体。莱娜的连续检查记录显示，这种变化发生在他穿上维修服之前。记录里还有反对复工的意见，以及拖延处理的签字。',npcLines:[line('elias','你看完了吗？现在能把夹具松开了吗？',companion),line('lena','我当时想给他时间。这一页是我签的。',eq('world.lenaStatus','waiting'))],consequence:'埃利亚斯早已发生转化。他知道你完成了检查，接下来必须决定如何处置他。'},
      {id:'cooperative-inspection',label:'请他按维修步骤活动右臂，暂不说出检查目的',condition:{path:'relations.elias.trust',op:'gte',value:2},instructions:[...cost(.03),set('world.inspectionComplete',true)],evidence:['e.l4.identity-confirmed','e.l4.medical-delay'],resultText:'检查录像中，埃利亚斯仍在重复转手、停住、反转的检修动作。外部手臂每动一下，服内的组织就沿骨架收缩。胸腹位置已经没有完整的人体。埃利亚斯平静地问，下一步还要检查什么。',npcLines:[line('elias','可以了。接下来还要做什么？',companion)],consequence:'你确认了他的身体已经被替代，但还没有把结论告诉他。'},
      {id:'share-boundary',label:'和万斯确认：暂停埃利亚斯使用转运接口',condition:has('knowledge.vance','e.l4.identity-confirmed'),instructions:[...cost(.02),set('world.inspectionComplete',true),set('world.suspicionPublic',true),add('relations.vance.respect',1)],evidence:['e.l4.identity-confirmed','e.l4.boundary-declared'],resultText:'检修架重新归位，埃利亚斯停在外廊的隔离线旁。你和万斯明确告诉他，不得再接近转运接口。夹具还没有锁住他，具体处置仍需你动手完成。',npcLines:[line('vance','原片我看到了。他帮过你，我知道。但现在别让他进转运舱。',has('knowledge.vance','e.l4.identity-confirmed'))],consequence:'万斯已收到服内录像，支持暂停他的接驳权限。接下来仍须决定拘束、合作或攻击。'},
    ],resolveText:'你终于看清了服内的东西。现在的问题是：把埃利亚斯留在这里，还是继续让他帮忙？',
  },
  {
    id:'l4-02',chapter:4,title:'已经锁住了吗',location:'医疗层 · 维修设备区',
    entryText:'埃利亚斯停在维修架旁。你可以用夹具把他锁住，也可以允许他留在外面帮忙。旁边的液压剪切架能够破坏维修服。夹具的一处卡槽塞着碎金属，附近还有通向管道的检修口。',
    scoutFootage:'镜头拍到两只锁爪，其中一只的卡槽被碎片堵住。旁边的管道检修口可以关死。维修服上的液压接头还能回收；如果使用剪切架，接头也会被破坏，只能拿随艇备件来修复潜艇接口。',
    scoutFacts:['e.l4.restraint-debris','e.l4.cooperation-boundary','e.l4.shear-cost'],
    plannedSeconds:{travel:65,reading:85,action:130},
    choices:[
      {id:'restrain',label:'清掉碎片，锁住埃利亚斯，收回液压接头',condition:{path:'world.eliasStatus',op:'ne',value:'damaged'},instructions:[...cost(.05,5),set('world.eliasStatus','restrained'),set('world.eliasDisposition','restrained'),set('world.restraintLoose',false)],evidence:['e.l4.restraint-confirmed'],resultText:'两只锁爪都已闭合，锁销穿过固定孔。埃利亚斯拉动维修服，架子没有松动。你收回液压接头，留下不需要供电的机械锁。',npcLines:[line('elias','你要把我留在这里。',eq('world.eliasStatus','restrained')),line('player','你帮过我，我记得。但我不能让你再碰那些管道。')],consequence:'埃利亚斯被留在维修架上，无法继续同行。'},
      {id:'limited-cooperation',label:'让他继续在外侧帮忙，封住管道检修口',condition:{path:'world.eliasStatus',op:'ne',value:'damaged'},instructions:[...cost(.03),set('world.eliasStatus','cooperate'),set('world.eliasDisposition','cooperate'),set('world.restraintLoose',false),add('relations.elias.respect',1)],evidence:['e.l4.limited-cooperation'],resultText:'埃利亚斯已坐回艇外座架，扣好了防止航行时滑落的安全夹。他的一只手仍搭在旁边的管道检修口上。盖板已经锁死，那只手却迟迟没有收回。',npcLines:[line('elias','我没有让你死。',eq('world.eliasStatus','cooperate')),line('player','我知道。你也让我做过别的事。')],consequence:'你保留了他的帮助，但他仍能寻找其他通向内部的管路。'},
      {id:'damage-suit',label:'用剪切架破坏维修服，封住排液槽',instructions:[...cost(.04,5),set('world.eliasStatus','damaged'),set('world.eliasDisposition','damaged'),set('world.spareParts',0),set('world.residualTissueSealed',true)],evidence:['e.l4.suit-disabled','e.l4.residual-sealed'],resultText:'剪切架下的维修服已停止活动，破损处伸出一段肉状组织，末端被封在排液槽里。液压接头无法再用，随艇电气备件已装进修好的接口。槽内更深处仍然看不见。',npcLines:[line('player','他不动了。槽里还有东西，先把它封住。')],consequence:'埃利亚斯失去了行动能力，随艇备件已经用完。残留组织被封在排液槽内。'},
      {id:'hasty-restraint',label:'不清理卡槽，直接合上夹具',condition:{path:'world.eliasStatus',op:'ne',value:'damaged'},instructions:[...cost(.02),set('world.restraintLoose',true),set('world.eliasStatus','cooperate'),set('world.eliasDisposition','loose')],evidence:['e.l4.restraint-failed'],resultText:'检修架的一只锁爪卡在碎片上，夹具中间已经空了。埃利亚斯抽出了手臂，自己坐回艇外座架，扣上航行安全夹。他看着镜头，等你的下一句话。',npcLines:[line('player','只扣住了一边。他还能动。')],consequence:'夹具没能锁住他。你可以清掉碎片重试，也可以承担让他继续活动的风险。'},
    ],resolveText:'看清锁爪和检修口之后，再决定是否离开。你得知道身后的埃利亚斯还能做什么。',
  },
  {
    id:'l4-03',chapter:4,title:'第二名乘客',location:'医疗层 · 救生舱暂存坞',
    entryText:'莱娜在转运舱内等你。她举起一张健康检查单，又划掉上面的结论：“那天我还不知道该查什么。”这里的暂存坞和下一层电梯底站都有独立供氧。只有一个挂架时，可以先把一只小舱送到底站，固定好并接上氧气，再返回接下一只。',
    scoutFootage:'莱娜已经坐进独立密封的救生舱。镜头扫过舱门和外廊，可检查密封槽是否沾有组织。暂存坞标有独立供氧接口，先给小舱补气，就能利用这里分批转运。',
    scoutFacts:['e.l4.lena-unknown-exposure','e.l4.staging-oxygen','e.l4.transfer-capacity'],
    plannedSeconds:{travel:85,reading:80,action:115},
    choices:[
      {id:'staged-rescue',label:'清洗并补氧，分两趟把救生舱送到电梯底站',condition:{path:'world.lenaStatus',op:'ne',value:'left'},instructions:[...cost(.06,6),set('world.lenaRescued',true),set('world.lenaStatus','aboard'),set('world.transferClean',true),set('world.wellAdapter',true),set('world.wasteTank',true),add('relations.lena.trust',2)],evidence:['e.l4.lena-secured','e.l4.transfer-clean','e.l4.well-equipment'],resultText:'送到电梯底站的摄影器传回录像：经过分批转运，救下来的小舱已固定在底站的暂存坞内，分别接着独立氧瓶。莱娜坐在其中一只舱里，舱门关严，密封槽干净，氧气表指在安全范围。油井接口、废液罐和复位扳手放在潜艇的设备架上。',npcLines:[line('lena','我当时要求再观察几天，没有及时把这件事上报。这份记录，我会带上去。',eq('world.lenaStatus','aboard'))],consequence:'莱娜已安全送到电梯底站，等待转入轿厢。分批转运多用了一趟航程。'},
      {id:'dual-rescue',label:'使用双舱支架，清洗并锁紧各个小舱后一次转运',condition:all(eq('world.dualRack',true),{path:'world.lenaStatus',op:'ne',value:'left'}),instructions:[...cost(.04,4),set('world.lenaRescued',true),set('world.lenaStatus','aboard'),set('world.transferClean',true),set('world.wellAdapter',true),set('world.wasteTank',true),add('relations.lena.trust',2)],evidence:['e.l4.lena-secured','e.l4.transfer-clean','e.l4.well-equipment'],resultText:'莱娜的小舱锁在双舱支架上，舱门和挂钩都已拍清。镜头逐个检查已装载的小舱，清洗后的密封槽没有组织残留。油井接口和废液罐也已经装艇。',npcLines:[line('lena','到了上面也别急着开我的舱。先检查。',eq('world.lenaStatus','aboard'))],consequence:'第三层取来的双舱支架派上了用场，省下一次往返。'},
      {id:'leave-lena',label:'只取油井设备，把莱娜留在这里',condition:eq('world.lenaRescued',false),instructions:[...cost(.02),set('world.lenaStatus','left'),set('world.lenaRescued',false),set('world.wellAdapter',true),set('world.wasteTank',true)],evidence:['e.l4.lena-left','e.l4.well-equipment'],resultText:'油井接口和废液罐装上潜艇。镜头转回暂存位，莱娜的小舱还在那里，没有接上挂架。她不再补充自己的医疗记录；你已经拿到的病理资料仍留在片匣中。',npcLines:[line('player','设备拿到了。我……不带她走。')],consequence:'你取走了逃生设备，留下莱娜。'},
      {id:'clean-corridor-rescue',label:'走干净的外廊，分批将救生舱送到底站',condition:all(eq('world.wet3Connected',false),{path:'world.lenaStatus',op:'ne',value:'left'}),instructions:[...cost(.03,3),set('world.lenaRescued',true),set('world.lenaStatus','aboard'),set('world.transferClean',true),set('world.wellAdapter',true),set('world.wasteTank',true),add('relations.lena.trust',2)],evidence:['e.l4.lena-secured','e.l4.transfer-clean','e.l4.well-equipment'],resultText:'沿干净外廊完成转运后，底站摄影器拍到了莱娜的小舱。救下来的小舱已分别固定在独立供氧位上，舱门闭合。油井设备放在艇外货架内，这一趟没有绕行受污染的通道。',npcLines:[line('lena','这条外廊没有进水。你们保住了它。',eq('world.lenaStatus','aboard'))],consequence:'单独给医疗层供电保住了这条近路，省去了绕行和清理污染的消耗。'},
    ],resolveText:'离开医疗层前，最后核对一次挂架。带上的人需要送到电梯；留在这里的人，已经无法跟随你下潜。',
  },
  {
    id:'l5-01',chapter:5,title:'门两边的人',location:'旧油井层 · 底部转运坞',
    entryText:'你把潜艇停在旧油井电梯的转运坞里，准备把带到这里的救生舱移上轿厢。一条密封通道通向干燥的控制间。电梯的线路图显示：艇内遥控器与轿厢按钮共用一条远控线；线路坏了，就只能有人在底站持续按住应急开关。旁边的检修柜里有维修接点。',
    scoutFootage:'转运导轨有些歪斜，旁边的机械护栏可以合拢，保护救生舱经过。镜头还拍到一条能够封闭的水道。最后一个机位对准你通往电梯的密封通道，那里也需要扶正。',
    scoutFacts:['e.l5.local-control','e.l5.repair-cabinet','e.l5.transfer-route'],
    plannedSeconds:{travel:70,reading:70,action:80},
    choices:[
      {id:'mechanical-corridor',label:'合上防护栏，慢慢扶正导轨和转运舱',instructions:[...cost(.06,5),set('world.finalTransferSecured',true)],evidence:['e.l5.transfer-secured'],resultText:'护栏连成一圈，歪斜的导轨回到原位。已运到的救生舱和通往电梯的密封通道都固定好了。通向井筒排水设施的入口保持封闭。',npcLines:[line('vance','底站电流稳定。正式提升前，先做低幅度试验。')],consequence:'转运路线已固定，不需要埃利亚斯协助，但耗电较多。'},
      {id:'use-voice-tool',label:'用第二层取回的声音诱饵引开怪物，再关闭护栏',condition:eq('world.voiceTool',true),instructions:[...cost(.03),set('world.finalTransferSecured',true)],evidence:['e.l5.voice-tool-used','e.l5.transfer-secured'],resultText:'声音诱饵仍在相通的水道里工作，附近怪物围着声源活动。护栏已经闭合，导轨与已装载的小舱固定在转运位置。',npcLines:[line('player','第二层拿的诱饵还能用。等它们离开，再转运。')],consequence:'先前保留的诱饵减少了这次转运消耗。'},
      {id:'elias-help',label:'请埃利亚斯扶正小舱或通道',condition:all(companion,{path:'relations.elias.trust',op:'gte',value:1}),instructions:[...cost(.02),set('world.finalTransferSecured',true),set('world.eliasProtected',true)],evidence:['e.l5.elias-protected','e.l5.transfer-secured'],resultText:'埃利亚斯还扶着转运架，旁边的水道已经关闭，门把手断在地上。那条路原本也能让怪物通过。镜头中的架体保持稳定，通往电梯的路没有受损。',npcLines:[line('elias','先让他们过去。',all(companion,passengers)),line('elias','你先过去。',all(companion,eq('world.nikoRescued',false),eq('world.lenaRescued',false)))],consequence:'他确实保护了你这边的人。但其他检修管道仍要由你检查。'},
      {id:'force-transfer',label:'强行拉正导轨，再合上护栏',instructions:[...cost(.03,4),set('world.finalTransferSecured',true),set('world.remoteDamaged',true)],evidence:['e.l5.transfer-secured','e.l5.remote-damaged'],resultText:'导轨已经抵住末端挡块，转运载荷保持稳定。被强拉扯断的远控线垂在导轨旁。护栏已经合拢，本地开关仍有响应，艇内远控却没有回信。',npcLines:[line('vance','艇内远控回执断了。本地线还在，先不要正式提升。')],consequence:'必须修好远控才能一起撤离；也可以由你留下操作本地开关，先送伤员上去。'},
    ],resolveText:'通往电梯的转运路线准备好了。接下来要处理排水，防止污染水进入干燥的井筒区域。',
  },
  {
    id:'l5-02',chapter:5,title:'关位不等于关严',location:'旧油井层 · 排水阀组',
    entryText:'电梯井必须和进水的转运坞隔开。大坞的废水应排进固定储液罐，带来的便携罐只够收小舱里的残水。另一条应急排水管通向井筒内的工业集水坑，莱娜此前切断了它。总阀虽然指着关闭位置，旁路是否关严还得再拍。',
    scoutFootage:'两段录像放在一起：总阀的指针停在“关闭”，旁路里的阀片却压着一截碎片，没有贴紧。肉状组织正从缝里向外伸。管道上的箭头指向井筒集水坑，另一根排水管则通向固定储液罐。',
    scoutFacts:['e.l5.bypass-destination','e.l5.valve-not-seal','e.l5.waste-capacity'],
    plannedSeconds:{travel:55,reading:80,action:95},
    choices:[
      {id:'collect-and-lock',label:'把废水导入储液罐，清掉阻挡并锁死阀门',instructions:[...cost(.05,5),set('world.finalIsolation',true),set('world.bypassOpen',false),set('world.explicitLie',false)],evidence:['e.l5.isolation-locked'],resultText:'两处阀门的阀片已经贴紧，锁销穿过固定孔。大坞的排水管通向固定储液罐，小舱的排水软管接在便携罐上。通往井筒的支管里不再有水流。',npcLines:[line('player','两处都关严了。下面不会再往井筒送水。')],consequence:'排水已隔离。先前流进井筒的污染水仍需要向上方说明。'},
      {id:'emergency-drain',label:'打开应急管，把污水排进井筒集水坑',instructions:[...cost(.02),set('world.drySideContaminated',true),set('world.bypassOpen',true),set('world.finalIsolation',false),set('world.explicitLie',false)],evidence:['e.l5.dry-contamination'],resultText:'录像沿管道拍到污染水进入井筒内的集水坑。进水坞的水位开始下降，但原本干燥的逃生区域已经接触了污水。',npcLines:[line('player','污水进了井筒。万斯那边得准备隔离。')],consequence:'你排走了坞内的水，也污染了逃生区域。需要报告万斯，并安排隔离接收。'},
      {id:'conceal-and-drain',label:'把污水排进井筒，隐瞒录像并谎报安全',condition:lacks('knowledge.vance','e.l5.dry-contamination'),instructions:[...cost(.02),set('world.drySideContaminated',true),set('world.bypassOpen',true),set('world.finalIsolation',false),set('world.explicitLie',true)],evidence:['e.l5.dry-contamination','e.l5.false-clearance-sent'],resultText:'录像拍到污染水进入井筒集水坑。你没有把这段影像发给万斯，却告诉上方“隔离通过”。他们正根据你的报告安排接收。',npcLines:[line('player','发送：隔离通过。'),line('vance','收到你的通过报告，常规接收准备中。',eq('world.voluntaryQuarantine',false))],consequence:'上方可能在不知污染的情况下开门接人。现在补交原片或要求检疫，仍可改变接收安排。'},
      {id:'stop-contamination',label:'关掉应急排水管，保留污染录像',condition:eq('world.drySideContaminated',true),instructions:[...cost(.04,4),set('world.bypassOpen',false),set('world.finalIsolation',true),set('world.explicitLie',false)],evidence:['e.l5.dry-contamination','e.l5.flow-stopped'],resultText:'旁路已经重新关严，污水不再流入。镜头另一端，井筒集水坑里的积水仍在。你撤回清洁通行的说法，原始污染录像保留在片匣里，等待提交。',npcLines:[line('player','水止住了。我得把这段发给万斯。')],consequence:'继续扩散已停止，但受污染的区域仍需检疫处理。'},
    ],resolveText:'看完录像后，还要决定把什么告诉万斯。他无法直接读取你的片匣，上面的接收人员正在等你的报告。',
  },
  {
    id:'l5-03',chapter:5,title:'你确定都上去了吗',location:'旧油井层 · 电梯底站与本地控制间',
    entryText:'电梯停在底站，你还坐在潜艇里。正式撤离之前，需要让轿厢试升一小段，再降回来检查挂钩和刹车。通道旁的检修柜里有可拆用的电气接点，能够修复损坏的远控线，只是要多花一些时间和电力。',
    scoutFootage:'镜头拍清轿厢空间、挂钩和制动锁，远控线与本地开关也在画面中。你可以据此核对已经装载的小舱，并检查远控线是否完好。',
    scoutFacts:['e.l5.manifest-test','e.l5.repair-route','e.l5.local-hold-required'],
    plannedSeconds:{travel:50,reading:65,action:95},
    choices:[
      {id:'repair-and-ascend',label:'检查并修好远控，试升后返回底站',condition:eq('world.departureMode','pending'),instructions:[...cost(.06,6),set('world.remoteDamaged',false),set('world.lastPassengerSecured',true),set('world.preparedDepartureMode','ascend')],evidence:['e.l5.manifest-confirmed','e.l5.remote-restored','e.l5.departure-record'],resultText:'远控线路已接好，轿厢在试升后回到底站，制动锁保持闭合。已装载小舱的编号和挂钩都能看清。你仍坐在潜艇里，手边是准备带走的片匣。',npcLines:[line('vance','电梯供电正常。上面按你刚才的报告准备接收。'),line('niko','我还在舱里。可以走了吗？',eq('world.nikoStatus','aboard')),line('lena','上去以后，我会把下面发生的事全部说清楚。',eq('world.lenaStatus','aboard'))],consequence:'电梯具备撤离条件。上方如何接收，仍取决于污染情况和你提交的报告。'},
      {id:'choose-quarantine',label:'修好远控并试升，通知上方准备检疫接收',condition:eq('world.departureMode','pending'),instructions:[...cost(.06,6),set('world.remoteDamaged',false),set('world.lastPassengerSecured',true),set('world.voluntaryQuarantine',true),set('world.preparedDepartureMode','ascend'),set('world.explicitLie',false)],evidence:['e.l5.manifest-confirmed','e.l5.quarantine-requested'],resultText:'试升后的轿厢锁在底站，远控恢复响应，小舱保持固定。万斯确认已经预留隔离停靠位。你仍在潜艇里，尚未执行最后的登梯决定。',npcLines:[line('player','到上面以后，门先别开。我接受检疫。'),line('vance','收到。电梯可以升，有人区的门保持关闭。')],consequence:'无论是否确认感染，上方都会先把你们留在隔离区检查。'},
      {id:'stay-at-control',label:'测试本地开关，准备留下送伤员上去',condition:all(eq('world.departureMode','pending'),eq('world.remoteDamaged',true),eq('world.spareParts',0),passengers),instructions:[...cost(.02,4),set('world.preparedDepartureMode','sacrifice'),set('world.lastPassengerSecured',true)],evidence:['e.l5.local-hold-prepared'],resultText:'轿厢试升后回到底站，伤员小舱保持固定。本地开关测试正常，艇内远控却仍无响应。你已回到潜艇查看录像；正式提升时，必须有人留在控制间持续按住开关。',npcLines:[line('player','要是留下，我就去那间控制室按着开关。现在先别升。'),line('vance','听见了。我留在线上。')],consequence:'这条路能送走已经带来的伤员，你自己却必须留在下面。拆柜修复远控仍是另一个选择。'},
      {id:'enter-wet-side',label:'检查出舱路径，考虑留在深海',condition:all(eq('world.departureMode','pending'),has('knowledge.player','e.l4.identity-confirmed')),instructions:[set('world.preparedDepartureMode','changed')],evidence:['e.l5.wet-entry-prepared'],resultText:'录像里，潜艇外侧的隔离门仍然关闭，污染水正从门外流过。看完录像，你低头望向舱内的开门杆。只要拉下它，海水就会进来。',npcLines:[line('player','先停在这里。我要在打开任何东西以前把片子看完。')],consequence:'你知道接触污水可能让人转化。打开这扇门将是主动放弃撤离，仍需最后确认。'},
    ],resolveText:'试验结束，电梯仍停在底站，你也还在艇内。现在是最后一次补交录像或改变接收安排的机会。正式升井或离开潜艇后，就不能回头重选了。',
    implementationNotes:['预算不是实测；远控维修和主动异化的时间跳转在文本实验中表达，不冒称真实3D已实现。'],
  },
];

const resolutions:Record<string,Resolution[]> = {
  'l1-01':[
    {id:'keep-low-load',label:'让绞盘持续低速运转',instructions:[...cost(.02),set('world.winchWorn',false),set('world.lureMaintained',true)],text:'你复位绞盘的保护开关，再让它保持低速运转。吊索继续在仓内摆动，吸引怪物靠近，方便下一步关门。'},
    {id:'reserve-power',label:'先停绞盘，省电后移到闸门旁',instructions:[set('world.lureMaintained',false),add('pod.oxygen',-5)],text:'你停下绞盘，把潜艇移到闸门侧面。怪物可能再次移动；关门前需要重新启动绞盘，把它引进仓内。'},
  ],
  'l1-02':[
    {id:'mechanical-check',label:'移到救援位置，再检查一次门锁',instructions:[set('world.preRescueLockCheck',true),add('pod.oxygen',-5)],text:'你保持维修笼关闭，把潜艇移到笼口。开笼前还要检查货仓锁销；如果刚才没关好，就先清理门轨再锁门。'},
    {id:'hold-and-reposition',label:'保持绞盘低速运转，再移到笼口',instructions:[...cost(.03),set('world.lureMaintained',true),set('world.preRescueLockCheck',true)],text:'你保持绞盘供电，让怪物继续朝仓内活动，然后把潜艇移到维修笼旁。开笼前仍要确认闸门已锁好。'},
  ],
  'l1-03':[
    {id:'reserve-crew-oxygen',label:'检查埃利亚斯的供氧，补满自己的应急氧瓶',instructions:[add('pod.oxygen',25),...cost(.03),set('world.crewOxygenReserve',true)],text:'埃利亚斯的独立供氧工作正常。你接上补给架的备用氧瓶，启动充气泵，给艇内储气瓶补气，然后准备继续下潜。'},
    {id:'reserve-battery',label:'检查埃利亚斯的供氧，优先换装推进电池',instructions:[add('pod.power',.06),add('pod.oxygen',-10),set('world.crewOxygenReserve',false)],text:'埃利亚斯的独立供氧保持正常。你把补给时间用来更换推进电池，潜艇电量增加，但停留也消耗了一些氧气。'},
  ],
  'l2-01':[
    {id:'retain-equipment',label:'检查封闭情况，带上已经回收的工具',instructions:[...cost(.01),set('world.sourceQuarantined',true)],text:'你检查舱门的锁扣和随艇工具的密封盖，随后收好机械臂，向救生舱的信号来源驶去。'},
    {id:'leave-all-sources',label:'把广播器留在这里，不带走',instructions:[set('world.voiceTool',false),set('world.sourceQuarantined',true),add('pod.oxygen',-4)],text:'你把广播器留在检修仓内，锁上外盖。这东西不会跟着潜艇离开。'},
  ],
  'l2-02':[
    {id:'cap-public-flow',label:'锁停公共水泵，再离开维修站',instructions:[...cost(.03),set('world.wet2FlowStopped',true)],text:'你换好潜艇的滤芯和轴封，冷却压力恢复正常。离开前，你切断公共水泵并锁住阀门，免得水流继续把管里的东西冲向下层。'},
    {id:'leave-current-circuit',label:'不再调整管路，把电力留给救生舱',instructions:[add('player.stress',2)],text:'你换好潜艇的滤芯和轴封，冷却压力恢复正常。你没有再动公共水泵的开关，准备把剩余电力留给前面的救生舱。'},
  ],
  'l2-03':[
    {id:'close-transfer-window',label:'检查挂架，结束这次救援并离开',instructions:[...cost(.01),set('world.nikoWindowClosed',true)],text:'你检查艇外固定夹和供电接口，收好机械臂，驶离救生舱停放区。'},
    {id:'top-up-niko',label:'分出艇用氧气，补给尼科的救生舱',condition:eq('world.nikoRescued',true),instructions:[add('pod.oxygen',-25),set('world.nikoOxygenTopped',true),set('world.nikoWindowClosed',true),add('relations.niko.trust',1)],text:'你把一部分艇用氧气充进尼科的独立救生舱。他能多撑一段时间，你自己的应急储备则减少了。'},
    {id:'leave-empty-rack',label:'确认留下尼科，带着空挂架离开',condition:eq('world.nikoRescued',false),instructions:[set('world.nikoStatus','left'),set('world.nikoWindowClosed',true),add('player.stress',5)],text:'你收回空挂架，离开救生舱停放区。尼科仍留在那里。这个挂架可以用于下一次救援，但这一次，你没有带走他。'},
  ],
  'l3-01':[
    {id:'inspect-tool',label:'检修夹爪，必要时换上实验层备用件',instructions:[...cost(.04,5),set('world.toolDamaged',false)],text:'你检查机械臂，用实验层的备用零件修好夹爪。检修消耗了一些电力和时间，随艇电气备件仍然留着。'},
    {id:'accept-tool-wear',label:'不再维修，把电量留给医疗层',instructions:[add('player.stress',1)],text:'你关掉检修电源，收好机械臂，驶向医疗电源柜。'},
  ],
  'l3-02':[
    {id:'keep-findings-private',label:'暂不告诉埃利亚斯新发现',instructions:[...cost(.01),set('world.privateObservation',true)],text:'你关掉画面，没有向埃利亚斯解释检查结果。离开平台前，你让他坐回艇外救援座架，扣好安全夹，检查独立供氧。'},
    {id:'announce-restriction',label:'告诉埃利亚斯，暂时不要靠近转运接口',instructions:[set('world.suspicionPublic',true),add('relations.elias.trust',-1),add('relations.elias.respect',1)],text:'你通知埃利亚斯：维修服还需要检查，在此之前不要接近转运接口。随后让他坐回艇外救援座架，扣好安全夹，检查独立供氧。他没有再问检修要多久。'},
  ],
  'l3-03':[
    {id:'isolate-before-descent',label:'锁住循环泵，保持医疗供电后下潜',instructions:[...cost(.03),set('world.wet3FlowStopped',true),set('world.medicalPowered',true)],text:'你锁住循环泵，确认医疗电源继续工作。如果污水已经流向第四层，只能到下面再处理。'},
    {id:'prepare-second-rack',label:'装好双舱支架，为两个小舱留出挂位',instructions:[...cost(.04,6),set('world.dualRack',true)],text:'你花时间装好双舱支架。潜艇能同时挂两个救生舱，但横向移动会更吃力。'},
  ],
  'l4-01':[
    {id:'preserve-originals',label:'保存服内原片和医疗记录',instructions:[...cost(.01),set('world.originalEvidencePreserved',true)],text:'你把原片和医疗记录单独封存，准备带回岸上。万斯只有在你主动提交后才能看到它们。'},
    {id:'confront-elias',label:'告诉埃利亚斯，你已经看清服内的东西',condition:has('knowledge.player','e.l4.identity-confirmed'),instructions:[set('world.suspicionPublic',true),add('relations.elias.trust',-1),add('relations.elias.respect',1)],text:'你告诉埃利亚斯，录像已经拍到衣服里面。他沉默了片刻。你们都知道，这次检查再也不能用一句设备故障带过。'},
  ],
  'l4-02':[
    {id:'close-adjacent-service',label:'再封住旁边的管道检修口',instructions:[...cost(.04),set('world.residualTissueSealed',true),set('world.adjacentServiceClosed',true)],text:'你把相邻的检修口封死，堵住又一条通向管道的路。埃利亚斯仍保持刚才录像确认的状态。'},
    {id:'save-current-boundary',label:'不再封堵，保留电量',instructions:[set('world.adjacentServiceClosed',false),add('player.stress',2)],text:'你停止施工，把剩余电量留给下潜。旁边的检修口没有额外封堵，离开前你又看了一遍夹具的结果录像。'},
  ],
  'l4-03':[
    {id:'retain-contained-transfer',label:'保持小舱封闭，再加固一次转运接口',instructions:[...cost(.03),set('world.transferReinforced',true)],text:'你逐一拧紧转运接口的固定件，关闭外盖，准备前往电梯底站。'},
    {id:'retain-solo-reserve',label:'不再加固，保留电量维修电梯',instructions:[set('world.transferReinforced',false),add('pod.oxygen',-3)],text:'你检查现有接口后收回机械臂，没有追加加固。省下的电量留给最底层。'},
  ],
  'l5-01':[
    {id:'close-wet-access',label:'关闭水下的额外检修口',instructions:[...cost(.04),set('world.finalWetAccess',false)],text:'转运完成后，你关上水下检修口。即使埃利亚斯刚才帮过忙，也不能再从这里接触内部管道。'},
    {id:'retain-wet-access',label:'保留水下检修通道，节省电力',instructions:[set('world.finalWetAccess',true),add('player.stress',2)],text:'你没有关上额外的检修通道。这样省下一次操作，但仍在外面活动的人能够接近它。'},
  ],
  'l5-02':[
    {id:'request-isolated-reception',label:'通知万斯：上面必须隔离接收',instructions:[set('world.voluntaryQuarantine',true),set('world.explicitLie',false)],text:'你要求上方不要直接打开有人区的大门，先安排检疫。这项请求已发送；污染原片仍可以另外提交。'},
    {id:'retain-current-report',label:'不改报告，继续试升电梯',instructions:[add('player.stress',2)],text:'你保留之前发给万斯的报告和接收安排，开始准备电梯测试。'},
  ],
  'l5-03':[
    {id:'execute-ascent',label:'带上原片登梯，按现有安排升井',condition:eq('world.preparedDepartureMode','ascend'),instructions:[set('world.departureMode','ascend'),set('world.originalEvidencePreserved',true)],text:'你收起片匣，经密封通道进入电梯，按下轿厢里恢复工作的升井按钮。上方将按你此前提交的信息接收。电梯离开底站，你无法再回到潜艇更改这次报告。'},
    {id:'execute-quarantine-ascent',label:'先要求隔离接收，再带上原片升井',condition:eq('world.preparedDepartureMode','ascend'),instructions:[set('world.departureMode','ascend'),set('world.voluntaryQuarantine',true),set('world.explicitLie',false),set('world.originalEvidencePreserved',true)],text:'万斯确认隔离区已经准备好。你带上原片，穿过密封通道登梯，按下轿厢里的升井按钮。'},
    {id:'execute-local-hold',label:'确认伤员已上梯，去控制间留下操作',condition:all(eq('world.preparedDepartureMode','sacrifice'),eq('world.remoteDamaged',true),eq('world.spareParts',0),passengers),instructions:[set('world.departureMode','sacrifice'),set('world.originalEvidencePreserved',true)],text:'你最后核对伤员小舱，带着片匣穿过密封通道，来到本地控制间。你按住开关，电梯载着伤员开始上升。只要松手，它就会停下来。'},
    {id:'execute-isolated-local-hold',label:'先安排伤员检疫，再留下操作电梯',condition:all(eq('world.preparedDepartureMode','sacrifice'),eq('world.remoteDamaged',true),eq('world.spareParts',0),passengers),instructions:[set('world.departureMode','sacrifice'),set('world.voluntaryQuarantine',true),set('world.explicitLie',false),set('world.originalEvidencePreserved',true)],text:'你先要求万斯隔离接收伤员，再进入本地控制间按住开关。电梯载着他们上升，你留在底站。'},
    {id:'execute-wet-entry',label:'放弃登梯，保持他人小舱封闭，独自进入污染水中',condition:all(eq('world.preparedDepartureMode','changed'),has('knowledge.player','e.l4.identity-confirmed')),instructions:[set('world.departureMode','changed'),set('world.playerExposed',true),set('world.transformationAccepted',true),set('world.finalWetAccess',false)],text:'你取消自己的登梯安排，确认带来的小舱仍各自封闭，随后打开自己的隔离门。海水涌进来。这一次，你没有再等摄像头告诉你外面有什么。'},
  ],
};
const scenes:StoryScene[] = drafts.map(scene=>({...scene,resolutions:resolutions[scene.id]}));

const ascend = eq('world.departureMode','ascend');
const spread = all(ascend,eq('world.drySideContaminated',true),eq('world.explicitLie',true),eq('world.voluntaryQuarantine',false),lacks('knowledge.vance','e.l5.dry-contamination'));
const quarantine = all(ascend,any(eq('world.voluntaryQuarantine',true),quarantineKnown,all(eq('world.drySideContaminated',true),eq('world.explicitLie',false))));
const clean = all(ascend,eq('world.drySideContaminated',false),eq('world.voluntaryQuarantine',false),lacks('knowledge.vance','e.l5.dry-contamination'));

export const campaign:Campaign = {
  id:'late-witness-five',version:1,title:'迟到的目击者 · 五关叙事实验',
  chapters:[
    {id:1,title:'第一个活人',depth:1180,dramaticQuestion:'怎样把确实被困的人安全带出来？'},
    {id:2,title:'请再说一遍',depth:1460,dramaticQuestion:'会回应的声音，究竟证明了什么？'},
    {id:3,title:'里面还剩多少',depth:1810,dramaticQuestion:'还在重复日常工作的，真的是基地的工作人员吗？'},
    {id:4,title:'请留在镜头里',depth:2170,dramaticQuestion:'埃利亚斯已经不是人了。你还能让他继续帮忙吗？'},
    {id:5,title:'最后一张照片',depth:2540,dramaticQuestion:'离开深海之前，你会把真相告诉上面的人吗？'},
  ],scenes,
  initialWorld:{
    eliasNature:'transformed',eliasStatus:'trapped',eliasDisposition:'trapped',eliasPresent:true,nikoStatus:'waiting',lenaStatus:'waiting',
    lureTested:false,winchReady:false,winchWorn:false,predatorIsolated:false,gateJammed:false,transferStuck:false,
    upperRouteBlocked:false,bottomExitVerified:false,voiceTool:false,sourceQuarantined:false,coolingReady:false,
    wet2Connected:false,wet2FlowStopped:false,oxygenLost:false,nikoRescued:false,nikoTransferFailed:false,
    cutterReady:false,toolDamaged:false,motionChecked:false,suspicionPublic:false,medicalPowered:false,
    wet3Connected:false,wet3FlowStopped:false,dualRack:false,developHeaterReduced:false,thermalReady:false,
    inspectionComplete:false,restraintLoose:false,spareParts:1,residualTissueSealed:false,lenaRescued:false,
    transferClean:false,wellAdapter:false,wasteTank:false,finalTransferSecured:false,eliasProtected:false,
    remoteDamaged:false,finalIsolation:false,bypassOpen:false,drySideContaminated:false,explicitLie:false,
    voluntaryQuarantine:false,lastPassengerSecured:false,departureMode:'pending',preparedDepartureMode:'pending',playerExposed:false,transformationAccepted:false,
    lureMaintained:false,preRescueLockCheck:false,crewOxygenReserve:false,nikoWindowClosed:false,nikoOxygenTopped:false,
    privateObservation:false,originalEvidencePreserved:false,adjacentServiceClosed:false,transferReinforced:false,finalWetAccess:false,
  },
  endings:[
    {id:'handover',title:'交班',priority:10,condition:clean,summary:'电梯在上端停稳，你交出了带回的片匣和救援名单。埃利亚斯留在下面。万斯问起他的情况，你停了一下：“身体已经转化。没有确认死亡。”这次交班，比你想象的更难说出口。'},
    {id:'quarantine',title:'上面也有一扇门',priority:20,condition:quarantine,summary:'电梯停在空无一人的检疫站。门没有开，万斯的声音却终于不再带着深海里的噪声：“我就在外面。先完成检查。”门外的摄像头亮起来。你抬起手，等它拍清自己。'},
    {id:'spread',title:'救援完成',priority:30,condition:spread,summary:'接收人员相信了你的安全报告。门开了，救援被登记为完成。留在片匣里的录像却清楚记录着：污染水已进入井筒集水坑。没人要求隔离，也没人检查那条接触过污水的撤离路线。'},
    {id:'stay',title:'留一盏灯',priority:40,condition:eq('world.departureMode','sacrifice'),summary:'载着伤员的电梯越升越高。你留在控制间，手没有离开开关。万斯一直报着高度，直到他说出“他们到了”。他没有挂断。你面前的小灯还亮着。'},
    {id:'changed',title:'仍在值班',priority:50,condition:eq('world.departureMode','changed'),summary:'很久以后，另一艘潜艇回收了一卷录像。镜头里，一个身影站在旧油井的入口，做着你熟悉的救援手势，招呼来者靠近。它仍记得怎样救人，也知道怎样让人放下戒心。'},
  ],
};
