/**
 * world/content/props.machine.ts — 船自己的东西
 *
 * 阀门、配电、管路、舱盖、终端。
 * 这一组承担**关卡进度**：求解器靠读取这些 prop 的 effects 来推断钥匙来源，
 * 所以标记了 `key-source` 的定义必须**无条件产出** —— 任何依赖 SAN/Stigma 的
 * 产出在悲观验证里都不被采信，会让可通关性证明失效。
 */

import { BREATH } from '../../core/contract';
import type { PropDef } from '../types';
import {
  allOf,
  bump,
  fear,
  flag,
  flagOn,
  hasItem,
  infect,
  ix,
  item,
  know,
  noise,
  oxy,
  prop,
  san,
  sfx,
  stigma,
  trauma,
  warm,
} from './helpers';

export const MACHINE_PROPS: readonly PropDef[] = [
  // ========================================================= 阀门 valve (7)
  prop({
    id: 'prop.valve.trunk-a',
    kind: 'valve',
    name: '主竖井配水阀 A',
    concealment: 0,
    tags: ['key-source', 'critical'],
    fits: ['engine', 'ballast', 'bulkhead', 'corridor', 'flooded'],
    ix: [
      // 无条件产出：这是 D1→D2 主通道的钥匙
      ix('turn', '转动手轮', BREATH.INTERACT + 2, 10, {
        effects: [flag('sys.valve.trunk-a'), noise(10), sfx('valve-groan'), know('know.world.valve.trunk-a')],
      }),
      ix('read-gauge', '读压差表', BREATH.LOOK, 0, { effects: [know('know.world.pressure.trunk')] }),
    ],
    lucid:
      '一人高的手轮，轮辐上缠了防滑布。铭牌：主竖井配水，A 路。旁边的压差表指针停在绿区偏右。',
    drift: '手轮的防滑布是新缠的。布上的手汗还没干，形状比你的手小一号。',
    resonant: '手轮已经在转了，很慢，顺时针。你把手放上去，它就带着你的手一起转。',
  }),
  prop({
    id: 'prop.valve.bilge-c',
    kind: 'valve',
    name: '舱底排水阀 C',
    concealment: 0.15,
    tags: ['key-source'],
    fits: ['ballast', 'flooded', 'engine', 'crawlspace'],
    ix: [
      ix('turn', '转动', BREATH.INTERACT + 2, 12, {
        effects: [flag('sys.valve.bilge-c'), noise(12), sfx('water-suck')],
      }),
      ix('force-with-wrench', '用扳手加力', BREATH.FORCE_DOOR, 20, {
        requires: hasItem('item.wrench'),
        effects: [flag('sys.valve.bilge-c'), flag('sys.drain.local'), noise(20), trauma(2), sfx('metal-shriek')],
      }),
    ],
    lucid: '半没在水里的阀门，手轮上结了一层白色盐壳。转动它会把这一层的水排到下一层去。',
    drift: '盐壳上有手印，五指，但拇指的位置不对——像是有人用手背在转它。',
    resonant: '水在等你转。它不反抗，它配合。它想下去，因为下面有什么在收。',
  }),
  prop({
    id: 'prop.valve.moonpool-drain',
    kind: 'valve',
    name: '月池泄压阀',
    concealment: 0,
    tags: ['key-source', 'critical'],
    fits: ['moonpool', 'airlock', 'flooded', 'bulkhead'],
    ix: [
      ix('turn', '开启泄压', BREATH.INTERACT + 4, 14, {
        effects: [flag('sys.valve.moonpool-drain'), noise(14), sfx('pressure-vent'), know('know.world.moonpool.vented')],
      }),
      ix('listen-through', '贴着阀体听外面', BREATH.INTERACT, 0, {
        effects: [san(-8), fear(12), know('know.world.outside.not-water')],
      }),
    ],
    lucid:
      '黄黑斜纹的大阀，手轮上有三道机械保险。铭牌写着操作前应确认外侧压力。外侧压力表读数是零。',
    drift: '外侧压力表读数是零。在 -2,100 m，零是不可能的读数。除非外面没有水。',
    resonant: '外面没有水。外面有别的东西，它的压强恰好抵掉了海的压强，因为它正在往里挤。',
  }),
  prop({
    id: 'prop.valve.oxygen-bleed',
    kind: 'valve',
    name: '制氧旁通阀',
    concealment: 0.1,
    tags: ['resource'],
    fits: ['engine', 'reactor', 'medbay', 'bulkhead'],
    ix: [
      ix('bleed', '放一口气', BREATH.INTERACT, 7, {
        effects: [oxy(60), noise(7), sfx('gas-hiss'), bump('count.bled-oxygen')],
      }),
      ix('bleed-hard', '放到底', BREATH.INTERACT + 3, 22, {
        effects: [oxy(150), noise(22), fear(6), sfx('gas-roar'), flag('sys.oxygen.line-dry')],
      }),
      ix('check-line', '检查管路余量', BREATH.LOOK * 2, 0, { effects: [know('know.world.oxygen.reserve')] }),
    ],
    lucid: '细管上的旁通阀，压力表还有余量。开它能往面罩里补一口，但气流会尖叫。',
    drift: '表针在你不看的时候会回升一点。管子另一头接的地方，图纸上是一片空白。',
    resonant: '管子另一头接在某个正在呼气的东西上。你补进来的每一口，都是它呼出来的。',
  }),
  prop({
    id: 'prop.valve.steam-crossover',
    kind: 'valve',
    name: '蒸汽联络阀',
    concealment: 0.05,
    tags: ['hazard', 'puzzle'],
    fits: ['engine', 'reactor'],
    ix: [
      ix('open', '开阀', BREATH.INTERACT + 2, 26, {
        effects: [flag('sys.steam.crossover'), noise(26), warm(2.5), sfx('steam-blast')],
      }),
      ix('crack-open', '只开一丝', BREATH.INTERACT + 4, 9, {
        requires: hasItem('item.wrench'),
        effects: [flag('sys.steam.crossover'), noise(9), warm(1.2), sfx('steam-whisper')],
      }),
    ],
    lucid:
      '带隔热套的阀门。全开会灌一整条走廊的蒸汽——热，但很响。用扳手可以控制到只开一丝。',
    drift: '隔热套被撕开过，撕口向内。有人想让这条阀更烫。',
    resonant: '蒸汽里有形状。开阀之后它会站起来，朝声音走。你就是声音。',
  }),
  prop({
    id: 'prop.valve.chapel-font',
    kind: 'valve',
    name: '圣洗池注水阀',
    concealment: 0.2,
    tags: ['cult', 'ritual'],
    fits: ['chapel', 'reliquary'],
    ix: [
      ix('fill', '注满圣洗池', BREATH.INTERACT + 2, 6, {
        effects: [flag('ritual.font-filled'), noise(6), stigma('drowned', 1), san(-3), sfx('water-fill')],
      }),
      ix('drink', '喝一口', BREATH.INTERACT, 1, {
        requires: flagOn('ritual.font-filled'),
        effects: [infect(9), san(6), stigma('listening', 1), know('know.world.font.tastes-like-blood')],
      }),
    ],
    lucid: '铜阀接在石盆上。盆底有排水孔，孔里塞着布。布是干的，说明这盆水被喝完过，不是排掉的。',
    drift: '布是干的。四十一个人喝完了一盆能装两百升的水，在同一个下午。',
    resonant: '盆是满的，一直是满的。水面上有你的倒影，倒影在喝水，你没有。',
  }),
  prop({
    id: 'prop.valve.ballast-blow',
    kind: 'valve',
    name: '压载吹除总阀',
    concealment: 0,
    tags: ['hazard', 'lore'],
    fits: ['ballast', 'engine', 'bridge'],
    ix: [
      ix('inspect', '检查保险位置', BREATH.LOOK * 2, 0, { effects: [know('know.world.ballast.blown-already')] }),
      ix('blow', '吹除', BREATH.FORCE_DOOR, 44, {
        requires: allOf(hasItem('item.wrench'), flagOn('know.world.ballast.blow-sequence')),
        effects: [
          flag('did.blew-ballast'),
          noise(44),
          fear(20),
          sfx('ballast-thunder'),
          know('know.world.ballast.ship-does-not-rise'),
          stigma('iron', 1),
        ],
      }),
    ],
    lucid:
      '红色总阀，保险在「已执行」位。有人吹除过压载。这艘船有过一次上浮的机会，而它没有上浮。',
    drift: '保险在「已执行」位，但压载舱是满的。吹除成功了，水又回来了。',
    resonant: '不是水回来了，是船不想上去。它吹了四十一次，每一次都自己又灌回来。',
  }),

  // ======================================================= 配电 breaker (6)
  prop({
    id: 'prop.breaker.command-bus',
    kind: 'breaker',
    name: '指挥总线断路器',
    concealment: 0,
    tags: ['key-source', 'critical'],
    fits: ['reactor', 'engine', 'bulkhead', 'corridor', 'bridge'],
    ix: [
      ix('close', '合闸', BREATH.INTERACT, 13, {
        effects: [flag('sys.power.command'), noise(13), sfx('breaker-thunk'), know('know.world.power.command-live')],
      }),
      ix('read-tag', '读挂牌', BREATH.LOOK, 0, { effects: [know('know.world.power.tagged-out')] }),
    ],
    lucid:
      '刀闸柜，柜门开着，闸在断位。上面挂着停电检修牌，牌上的日期是下潜当天。签名栏是一个符号，不是字。',
    drift: '挂牌的符号你见过三次了，每次都在「不该有人来过」的地方。它是一只耳朵的简化。',
    resonant: '闸在断位，但柜子里有电流声。电已经从别的地方进来了，这个闸只是让你觉得自己有选择。',
  }),
  prop({
    id: 'prop.breaker.lighting-panel',
    kind: 'breaker',
    name: '照明分电盘',
    concealment: 0.05,
    tags: ['resource'],
    fits: ['corridor', 'bulkhead', 'bunks', 'galley', 'medbay'],
    ix: [
      ix('lights-on', '给这一段供电', BREATH.INTERACT, 9, {
        effects: [flag('sys.light.local'), san(7), noise(9), sfx('fluorescent-strike')],
      }),
      ix('lights-off', '掐掉照明', BREATH.INTERACT, 3, {
        effects: [flag('sys.light.local', false), san(-4), noise(3), bump('count.went-dark')],
      }),
    ],
    lucid: '二十四路小型断路器，绝大多数在断位。合上它能点亮这一段走廊——代价是电弧的响声。',
    drift: '有三路是合着的。它们对应的灯没有亮。电流去了图纸上不存在的三个地方。',
    resonant: '你合上闸，亮起来的不是灯，是走廊尽头那一段本来该是墙的地方。',
  }),
  prop({
    id: 'prop.breaker.sonar-array',
    kind: 'breaker',
    name: '声呐阵列供电',
    concealment: 0.1,
    tags: ['sonar'],
    fits: ['sonar-room', 'reactor', 'bridge'],
    ix: [
      ix('energize', '给阵列上电', BREATH.INTERACT + 2, 11, {
        effects: [flag('sys.power.sonar'), noise(11), sfx('array-charge'), know('know.world.sonar.array-live')],
      }),
      ix('overdrive', '拆掉限流', BREATH.FORCE_DOOR, 19, {
        requires: hasItem('item.wire'),
        effects: [flag('sys.sonar.overdrive'), noise(19), trauma(3), know('know.world.sonar.overdrive-cost')],
      }),
    ],
    lucid: '阵列供电柜，有限流模块。拆掉限流能让全功率脉冲更远，但换能器会烧，人也会听见自己的骨头。',
    drift: '限流模块已经被拆过一次，又装回去了。装回去的人手很稳，但少了一根手指。',
    resonant: '限流是为了不让你听得太清楚。拆掉它你就能听见它了。它也能听见你。',
  }),
  prop({
    id: 'prop.breaker.reactor-scram',
    kind: 'breaker',
    name: '反应堆紧急停堆按钮',
    concealment: 0,
    tags: ['hazard', 'irreversible'],
    fits: ['reactor'],
    ix: [
      ix('inspect', '看按钮上的封条', BREATH.LOOK, 0, { effects: [know('know.world.reactor.never-scrammed')] }),
      ix('scram', '按下', BREATH.INTERACT, 34, {
        effects: [
          flag('did.scrammed'),
          noise(34),
          warm(-3),
          fear(14),
          sfx('reactor-die'),
          stigma('apostasy', 1),
          know('know.world.reactor.what-runs-it'),
        ],
      }),
    ],
    lucid: '玻璃罩下的红色蘑菇头，封条完整。这艘船沉了之后从未停堆——堆还在运行，而它的一次冷却回路是海水。',
    drift: '封条完整。但按钮的漆被磨白了一圈，是拇指的位置。有人在封条下面按过很多次。',
    resonant: '你按下去。堆停了。船一点也没变暗——一直在给船供电的从来不是它。',
  }),
  prop({
    id: 'prop.breaker.pump-contactor',
    kind: 'breaker',
    name: '排水泵接触器',
    concealment: 0.1,
    tags: ['flood'],
    fits: ['ballast', 'engine', 'flooded', 'crawlspace'],
    ix: [
      ix('start-pump', '启泵', BREATH.INTERACT + 2, 30, {
        effects: [flag('sys.pump.running'), noise(30), sfx('pump-howl'), know('know.world.pump.works')],
      }),
      ix('stop-pump', '停泵', BREATH.INTERACT, 6, {
        requires: flagOn('sys.pump.running'),
        effects: [flag('sys.pump.running', false), noise(6)],
      }),
    ],
    lucid: '接触器盒，线圈是通的。启泵能让这一层的水位缓慢下降，但泵声会传遍整条船。',
    drift: '泵在你到之前刚停。轴承还是温的。停它的那只手比你早了不到十分钟。',
    resonant: '泵一直在转，只是抽的不是水。水位在降，因为有别的东西在替它占位。',
  }),
  prop({
    id: 'prop.breaker.hull-ground',
    kind: 'breaker',
    name: '船体接地排',
    concealment: 0.3,
    tags: ['puzzle', 'lore'],
    fits: ['reactor', 'engine', 'void', 'flooded'],
    ix: [
      ix('measure', '测一下船体电位', BREATH.INTERACT, 2, {
        effects: [know('know.world.hull.potential-alive'), san(-5)],
      }),
      ix('bond', '把自己接上接地排', BREATH.RITUAL, 8, {
        requires: hasItem('item.wire'),
        effects: [
          flag('did.bonded-to-hull'),
          stigma('iron', 2),
          san(-10),
          trauma(4),
          know('know.world.hull.it-is-a-body'),
          sfx('body-hum'),
        ],
      }),
    ],
    lucid: '裸铜排，螺栓已氧化成绿色。万用表接上去有读数，而且读数在缓慢起伏，周期约四秒。',
    drift: '周期约四秒。你的呼吸周期也是约四秒。你屏住气，读数的周期没有变。',
    resonant: '它有它自己的呼吸。整条船的钢都在那个周期上起伏。你一直站在一副肺的内壁上。',
  }),

  // ========================================================== 管路 pipe (6)
  prop({
    id: 'prop.pipe.ruptured-main',
    kind: 'pipe',
    name: '破裂的主管',
    concealment: 0.05,
    tags: ['hazard', 'flood'],
    fits: ['engine', 'ballast', 'flooded', 'corridor', 'bulkhead'],
    ix: [
      ix('patch', '打补丁', BREATH.INTERACT * 2, 8, {
        requires: allOf(hasItem('item.gasket'), hasItem('item.tape')),
        effects: [flag('sys.leak.patched'), noise(8), know('know.world.leak.slows')],
      }),
      ix('widen', '把裂口撬得更大', BREATH.FORCE_DOOR, 24, {
        requires: hasItem('item.prybar'),
        effects: [noise(24), flag('sys.flood.accelerated'), sfx('water-jet'), stigma('drowned', 1)],
      }),
      ix('drink', '接一口水喝', BREATH.INTERACT, 2, {
        effects: [item('item.water'), infect(3), oxy(-2)],
      }),
    ],
    lucid: '八寸主管，纵向裂口约两掌长。水以扇形喷出，声音盖住了这一段的大部分动静。',
    drift: '裂口是从内侧鼓出来的。管子里的压力不够把钢撑开成这个形状。是别的东西撑的。',
    resonant: '裂口的边缘有牙痕。它的开口方式像嘴，喷出来的不是水，但你需要水。',
  }),
  prop({
    id: 'prop.pipe.knocking-line',
    kind: 'pipe',
    name: '有规律敲击的管路',
    falseName: '气锤',
    concealment: 0.15,
    tags: ['eerie', 'lore'],
    fits: ['crawlspace', 'corridor', 'bunks', 'ballast', 'bulkhead'],
    ix: [
      ix('count', '数敲击的节拍', BREATH.INTERACT, 0, {
        effects: [know('know.world.knock.pattern'), san(-4)],
      }),
      ix('knock-reply', '敲回去', BREATH.INTERACT, 13, {
        effects: [noise(13), know('know.world.knock.answered'), san(-6), stigma('listening', 1), sfx('pipe-knock')],
      }),
      ix('muffle', '用油布裹住管子', BREATH.INTERACT + 2, 3, {
        requires: hasItem('item.cloth'),
        effects: [flag('sys.knock.muffled'), san(4), stigma('silence', 1)],
      }),
    ],
    lucid: '管路在敲。三短、两长、一短，间隔严格相等。气锤不会这么有耐心。',
    drift: '三短两长一短。这是船员通用的求救节奏的**反向**。有人把它倒着敲。',
    resonant: '它在报你的心跳。你屏住呼吸，敲击照旧，因为它报的不是现在的心跳。',
  }),
  prop({
    id: 'prop.pipe.conduit-bundle',
    kind: 'pipe',
    name: '线缆束',
    concealment: 0.2,
    tags: ['loot'],
    fits: ['crawlspace', 'reactor', 'engine', 'bulkhead', 'sonar-room'],
    ix: [
      ix('strip', '剥一段线', BREATH.SEARCH - 2, 5, {
        effects: [item('item.wire'), item('item.solder'), bump('count.looted')],
      }),
      ix('trace', '顺着线束摸走向', BREATH.INTERACT, 1, {
        effects: [know('know.world.topology.cable-shortcut'), san(-2)],
      }),
    ],
    lucid: '几十根线扎成一束，沿着舱顶走。剥掉外皮能取到铜线和焊料。',
    drift: '线束的走向和图纸差了一整个舱。它绕过了某个房间，像在避开它。',
    resonant: '线束是温的，而且有脉动。顺着摸下去，你的手会停在一个不该有东西的地方。',
  }),
  prop({
    id: 'prop.pipe.crawl-junction',
    kind: 'pipe',
    name: '爬管三通',
    concealment: 0.3,
    tags: ['topology'],
    fits: ['crawlspace'],
    ix: [
      ix('feel-airflow', '摸气流方向', BREATH.LOOK * 2, 0, {
        effects: [know('know.world.topology.airflow'), san(1)],
      }),
      ix('squeeze-through', '硬挤过去', BREATH.STEP * 3, 2, {
        effects: [trauma(3), san(-7), noise(2), bump('count.crawled')],
      }),
    ],
    lucid: '三条管子在此汇合，最窄的一条内径约五十公分。气流从最窄那条吹出来，说明它通着活的空间。',
    drift: '气流是往外吹的。可是三条管子都往外吹。这需要第四条管子，而这里只有三条。',
    resonant: '最窄那条里有东西在往外呼气，节奏和你一致。你钻进去就会遇到它，而它不会让路。',
  }),
  prop({
    id: 'prop.pipe.frozen-branch',
    kind: 'pipe',
    name: '结霜的支管',
    concealment: 0.1,
    tags: ['hazard'],
    fits: ['flooded', 'void', 'moonpool', 'reliquary'],
    ix: [
      ix('touch', '碰一下', BREATH.LOOK, 0, { effects: [warm(-0.8), san(-2), know('know.world.cold.source')] }),
      ix('break', '敲断取冰', BREATH.INTERACT, 17, {
        effects: [item('item.water'), noise(17), warm(-1.2), sfx('ice-crack')],
      }),
    ],
    lucid: '支管上结了一层白霜，霜层厚度从接口处向外递减。冷源在接口里面，不是外面的海。',
    drift: '冷源在船里面。霜的花纹是向内长的，像是有什么在往里吸热。',
    resonant: '霜在你碰过的地方化开，然后重新长出来，长成你指纹的形状，放大了十倍。',
  }),
  prop({
    id: 'prop.pipe.breathing-duct',
    kind: 'pipe',
    name: '会呼吸的通风管',
    falseName: '通风管',
    concealment: 0.25,
    tags: ['eerie', 'nest-hint'],
    fits: ['crawlspace', 'corridor', 'void', 'medbay'],
    ix: [
      ix('listen', '听', BREATH.INTERACT, 0, { effects: [san(-6), fear(9), know('know.world.duct.breathing')] }),
      ix('seal', '用油脂布封住管口', BREATH.INTERACT * 2, 4, {
        requires: allOf(hasItem('item.grease'), hasItem('item.cloth')),
        effects: [flag('sys.duct.sealed'), san(5), stigma('silence', 1), noise(4)],
      }),
      ix('reach-in', '把手伸进去', BREATH.INTERACT + 2, 6, {
        effects: [trauma(6), infect(8), item('item.relic.tooth'), san(-13), sfx('wet-grip')],
      }),
    ],
    lucid: '方形通风管，格栅缺了两片。有气流，但不是恒定的——它以约四秒为周期吸进和吹出。',
    drift: '四秒一个周期。通风机停了，格栅上的灰尘却在随周期抖动。灰尘在被吹和被吸之间来回。',
    resonant: '管子在呼吸。你把手放在格栅上，它把呼吸调成了你的节奏——为了让你放心把手伸进去。',
  }),

  // ========================================================== 舱盖 hatch (5)
  prop({
    id: 'prop.hatch.deck-trunk',
    kind: 'hatch',
    name: '甲板间竖井盖',
    concealment: 0,
    tags: ['topology'],
    fits: ['bulkhead', 'corridor', 'engine', 'ballast', 'airlock'],
    ix: [
      ix('undog', '逐个松开压紧螺栓', BREATH.INTERACT + 3, 11, {
        effects: [flag('sys.hatch.undogged'), noise(11), sfx('dog-clank')],
      }),
      ix('listen-below', '贴着盖子听下面', BREATH.INTERACT, 0, {
        effects: [know('know.world.below.has-water'), san(-3)],
      }),
      ix('weld-shut', '焊死它', BREATH.RITUAL, 28, {
        requires: hasItem('item.magnesium'),
        effects: [flag('did.welded-hatch'), noise(28), stigma('silence', 2), sfx('weld-arc')],
      }),
    ],
    lucid: '圆形竖井盖，八个压紧螺栓。盖子中央有一块观察玻璃，玻璃后面是黑的。',
    drift: '观察玻璃后面是黑的。你用灯照，光没有打到任何表面就消失了。下面不是一个房间的深度。',
    resonant: '玻璃后面有一只眼睛的位置留了空。它一直在从下面往上看，等你把脸凑过去。',
  }),
  prop({
    id: 'prop.hatch.escape-trunk',
    kind: 'hatch',
    name: '逃生筒下盖',
    concealment: 0.1,
    tags: ['topology', 'escape'],
    fits: ['airlock', 'moonpool', 'bulkhead', 'torpedo'],
    ix: [
      ix('inspect', '检查密封圈', BREATH.LOOK * 2, 0, { effects: [know('know.world.escape.seal-cut')] }),
      ix('replace-gasket', '换密封圈', BREATH.INTERACT * 2, 6, {
        requires: hasItem('item.gasket'),
        effects: [flag('sys.escape.sealed'), noise(6), know('know.world.escape.usable')],
      }),
    ],
    lucid: '逃生筒的下盖。密封圈被割断了，割口整齐，是从舱内一侧割的。',
    drift: '割口是从里面割的。有人不想让任何人从这里出去，或者不想让任何东西从这里进来。',
    resonant: '割口在愈合。橡胶长回去的速度大约是每呼吸一毫米。它想让你用这条路。',
  }),
  prop({
    id: 'prop.hatch.torpedo-tube',
    kind: 'hatch',
    name: '鱼雷发射管后盖',
    concealment: 0.05,
    tags: ['topology', 'risk'],
    fits: ['torpedo'],
    ix: [
      ix('open-breech', '开后盖', BREATH.INTERACT + 2, 14, {
        effects: [flag('sys.tube.open'), noise(14), sfx('breech-swing'), know('know.world.tube.loaded-with-what')],
      }),
      ix('crawl-in', '钻进管子里', BREATH.STEP * 4, 3, {
        requires: flagOn('sys.tube.open'),
        effects: [san(-11), trauma(2), noise(3), flag('did.entered-tube'), know('know.world.tube.inside')],
      }),
    ],
    lucid: '一号管后盖，闭锁在解锁位。管内不是鱼雷——是一个用帆布裹好、按人形捆扎的东西。',
    drift: '帆布包是人形的，但比人长。捆扎的绳结打在内侧，需要从里面伸手出来打。',
    resonant: '帆布里的东西在等发射。你钻进去会发现管子比船长，尽头有光，那是外面。',
  }),
  prop({
    id: 'prop.hatch.bilge-plate',
    kind: 'hatch',
    name: '舱底盖板',
    concealment: 0.4,
    tags: ['topology', 'hidden'],
    fits: ['engine', 'ballast', 'galley', 'medbay', 'chapel'],
    ix: [
      ix('pry', '撬起盖板', BREATH.FORCE_DOOR, 18, {
        requires: hasItem('item.prybar'),
        effects: [flag('sys.bilge.open'), noise(18), know('know.world.bilge.passage'), sfx('plate-scrape')],
      }),
      ix('peek', '掀一条缝看', BREATH.LOOK * 2, 4, {
        effects: [san(-4), know('know.world.bilge.something-below')],
      }),
    ],
    lucid: '地板上的方形盖板，与周围的磨损程度不同——它被反复掀开过。螺丝头都是新的划痕。',
    drift: '划痕都是逆时针的。拧松一颗螺丝需要逆时针，但四颗螺丝的划痕都只有一个方向，没有拧紧的痕迹。',
    resonant: '盖板下面不是舱底。是另一个和这里一样的房间，倒着装的，地板对着你的地板。',
  }),
  prop({
    id: 'prop.hatch.sanctum-portal',
    kind: 'hatch',
    name: '圣所门扉',
    concealment: 0,
    tags: ['cult', 'topology'],
    fits: ['chapel', 'reliquary', 'observation', 'void'],
    ix: [
      ix('read-inscription', '读门楣上的刻字', BREATH.LOOK * 3, 0, {
        effects: [know('know.world.code.sanctum'), san(-4)],
      }),
      ix('knock-thrice', '敲三下', BREATH.INTERACT, 15, {
        effects: [noise(15), know('know.world.sanctum.answers'), san(-7), stigma('listening', 1), sfx('door-answer')],
      }),
    ],
    lucid:
      '不是标准舱门。厚，无铰链可见，表面浮雕一只侧耳。门楣刻了一行数字，中间有一个字符不是数字。',
    drift: '那个不是数字的字符，在你第二次看的时候变成了数字。整行读起来是一个深度。',
    resonant: '门不需要开。它一直是开的，只是你的眼睛还没同意。浮雕的耳朵里有东西在动。',
  }),

  // ======================================================= 终端 terminal (7)
  prop({
    id: 'prop.terminal.liturgy-index',
    kind: 'terminal',
    name: '礼仪索引终端',
    concealment: 0.1,
    tags: ['key-source', 'critical', 'lore'],
    fits: ['archive', 'bridge', 'sonar-room', 'chapel', 'reliquary'],
    ix: [
      // 无条件产出 D3→D4 主通道的密码
      ix('query-code', '检索圣所门禁序列', BREATH.SEARCH, 5, {
        effects: [know('know.world.code.sanctum'), noise(5), sfx('key-clack')],
      }),
      ix('browse', '随便翻翻', BREATH.SEARCH - 2, 3, {
        effects: [know('know.world.cult.liturgy-structure'), san(-3), noise(3)],
      }),
    ],
    lucid:
      '绿字单色终端，还有电。索引里按编号列着四十一段礼仪，每段标注了应有的参与人数与深度。门禁序列在附录。',
    drift: '第四十二段礼仪存在，但参与人数一栏是「1」，深度一栏是你现在所处的深度。',
    resonant: '屏幕在等输入。你没有打字，字在出现。它在替你检索你还没想到要查的东西。',
  }),
  prop({
    id: 'prop.terminal.crew-roster',
    kind: 'terminal',
    name: '人员档案终端',
    concealment: 0.1,
    tags: ['lore'],
    fits: ['archive', 'bridge', 'medbay'],
    ix: [
      ix('list', '列出全员', BREATH.SEARCH - 2, 4, {
        effects: [know('know.world.manifest.forty-two'), noise(4), san(-3)],
      }),
      ix('search-self', '检索自己的名字', BREATH.SEARCH, 5, {
        effects: [know('know.world.self.roster-entry'), san(-10), fear(12), noise(5)],
      }),
      ix('print', '打印一份', BREATH.INTERACT, 12, {
        effects: [item('item.doc.crew-manifest'), noise(12), sfx('dot-matrix')],
      }),
    ],
    lucid: '四十一条记录，字段齐全。职务栏里有一个叫「样本」的职务，对应一个人。',
    drift: '「样本」那一条的照片格是空的。所有字段都填了，除了照片。',
    resonant: '「样本」那一条的照片格现在有照片了。它在实时更新，取景是从你正面偏左上四十五度。',
  }),
  prop({
    id: 'prop.terminal.sonar-console',
    kind: 'terminal',
    name: '声呐控制台',
    concealment: 0.05,
    tags: ['sonar', 'tool'],
    fits: ['sonar-room', 'bridge'],
    ix: [
      ix('calibrate', '校准阵列', BREATH.INTERACT + 2, 7, {
        requires: flagOn('sys.power.sonar'),
        effects: [flag('sys.sonar.calibrated'), noise(7), know('know.world.sonar.calibration')],
      }),
      ix('replay', '回放上一次全功率脉冲', BREATH.SEARCH, 9, {
        effects: [know('know.world.sonar.last-boom'), san(-7), noise(9), sfx('sonar-replay')],
      }),
      ix('read-chart', '读挂在旁边的海图', BREATH.LOOK * 3, 0, {
        effects: [know('know.world.chart.blank-area'), san(-3)],
      }),
    ],
    lucid:
      '主控台，示波管还有余辉。旁边挂着海图，本船位置标在一片没有等深线的空白里，用铅笔画了一个圈。',
    drift: '空白区域的边上有人用铅笔写了两个字，擦掉了。凹痕读出来是「在家」。',
    resonant: '示波管上有一条一直存在的回波，距离为零。零距离的回波只能来自换能器自己，或者你。',
  }),
  prop({
    id: 'prop.terminal.engineering-mimic',
    kind: 'terminal',
    name: '机械状态模拟盘',
    concealment: 0.05,
    tags: ['puzzle'],
    fits: ['engine', 'reactor', 'ballast', 'bridge'],
    ix: [
      ix('read', '读全船状态', BREATH.SEARCH - 2, 3, {
        effects: [know('know.world.ship.systems-state'), know('know.world.topology.deck-count'), noise(3)],
      }),
      ix('compare', '把模拟盘和你记的图对一遍', BREATH.INTERACT, 0, {
        effects: [know('know.world.topology.mismatch'), san(-5), flag('know.reweave.suspected')],
      }),
    ],
    lucid: '一整面墙的管线模拟盘，指示灯大部分是暗的。盘面画着这艘船的全部舱段，共五层。',
    drift: '盘面上有六层。第六层没有标注名称，也没有任何指示灯，但它占的面积最大。',
    resonant: '盘面上的舱段在缓慢改位置。它不是坏了，它是实时的。你手里的图才是过期的那份。',
  }),
  prop({
    id: 'prop.terminal.dead-screen',
    kind: 'terminal',
    name: '黑掉的终端',
    falseName: '终端',
    concealment: 0.05,
    tags: ['mirror-hint'],
    fits: ['corridor', 'bunks', 'galley', 'archive', 'void'],
    ix: [
      ix('look', '看屏幕', BREATH.LOOK, 0, { effects: [san(-3), know('know.world.reflection.off-by-one')] }),
      ix('power-cycle', '断电重启', BREATH.INTERACT, 8, {
        requires: flagOn('sys.power.command'),
        effects: [know('know.world.terminal.boot-log'), noise(8), san(-2), sfx('crt-degauss')],
      }),
    ],
    lucid: '没有电的 CRT。曲面玻璃把整个房间压缩成一个凸面的倒影，你在倒影里很小。',
    drift: '倒影里的房间比这个房间多一扇门。你回头看，门不在。你再看屏幕，门还在。',
    resonant: '倒影里的你比你慢半拍。你举手，它等了半拍才举。它举的是另一只手。',
  }),
  prop({
    id: 'prop.terminal.depth-readout',
    kind: 'terminal',
    name: '深度数字显示',
    concealment: 0,
    tags: ['lore', 'hud'],
    fits: ['bridge', 'observation', 'moonpool', 'airlock', 'corridor'],
    ix: [
      ix('read', '读数', BREATH.LOOK, 0, { effects: [know('know.world.depth.current')] }),
      ix('watch', '盯着它看一阵', BREATH.REST, 0, {
        effects: [san(-8), know('know.world.depth.still-descending'), fear(10)],
      }),
    ],
    lucid: '七段数码管，红色。读数在小范围抖动，最后一位一直在变，符合涌浪的影响。',
    drift: '最后一位一直在变，但只往一个方向变。抖动不是抖动，是趋势。',
    resonant: '读数已经超过了这条海沟的最深处。它还在往下。船没有在动——是海在变深。',
  }),
  prop({
    id: 'prop.terminal.blueprint-station',
    kind: 'terminal',
    name: '图纸检索台',
    concealment: 0.15,
    tags: ['key-source', 'topology'],
    fits: ['archive', 'bridge', 'engine'],
    ix: [
      ix('query-hidden', '检索未列入总图的舱段', BREATH.SEARCH + 2, 6, {
        effects: [know('know.world.blueprint.hidden'), noise(6), san(-5), sfx('microfiche-whir')],
      }),
      ix('print-fragment', '打印一段图纸', BREATH.INTERACT, 11, {
        effects: [item('item.doc.blueprint-fragment'), noise(11)],
      }),
    ],
    lucid:
      '缩微胶片检索台，手轮进片。总图之外还有一叠标为「非结构」的片子，编号不连续，缺 0 号。',
    drift: '缺的是 0 号。编号从 1 开始是正常的，除非有人把 0 抽走了，而抽走的动作留下了空的卡位。',
    resonant: '0 号在机器里。你摇手轮，它自己转到了 0 号那一格，屏幕上是一个你走过的房间。',
  }),
];
