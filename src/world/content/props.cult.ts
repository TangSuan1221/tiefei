/**
 * world/content/props.cult.ts — 教团与海的东西
 *
 * 祭坛、圣像、标本、镜子、巢、舷窗。
 * 这一组是 Stigma 的主要产地：每一次交互都在玩家身上留疤（支柱 P5），
 * 所以每条交互的 effects 里都必须有一个**不可撤销**的东西。
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
  not,
  oxy,
  prop,
  san,
  sanBelow,
  sfx,
  shake,
  stigma,
  trauma,
  warm,
} from './helpers';

export const CULT_PROPS: readonly PropDef[] = [
  // ========================================================= 祭坛 altar (6)
  prop({
    id: 'prop.altar.threshold-stone',
    kind: 'altar',
    name: '门限石',
    concealment: 0,
    tags: ['key-source', 'critical', 'ritual'],
    fits: ['chapel', 'reliquary', 'observation', 'void'],
    ix: [
      // 无条件产出 D4→D5 主通道所需的仪式进度
      ix('perform', '完成门限仪式', BREATH.RITUAL, 12, {
        effects: [
          flag('ritual.threshold'),
          stigma('listening', 1),
          san(-9),
          noise(12),
          know('know.world.ritual.threshold'),
          sfx('stone-resonance'),
        ],
      }),
      ix('read-rubric', '读仪轨', BREATH.SEARCH, 2, {
        effects: [know('know.world.ritual.rubric'), san(-3), noise(2)],
      }),
      ix('deface', '在石面上刻一道反向的划痕', BREATH.INTERACT + 2, 16, {
        effects: [stigma('apostasy', 2), noise(16), san(4), flag('did.defaced.threshold'), sfx('stone-chip')],
      }),
    ],
    lucid:
      '一块从舱底长出来的石头，不是船上的材料。顶面磨平，刻着一道很浅的凹槽，凹槽里有干掉的东西。仪轨钉在旁边的舱壁上，只有四行。',
    drift:
      '凹槽的形状是一只手掌，尺寸偏小。四十一双手按同一处，能把石头磨成这样吗？这需要更多次。',
    resonant:
      '石头是热的。凹槽在你走近的时候变大了一点，变成刚好容纳你手掌的尺寸。它一直在按你的尺码修改自己。',
  }),
  prop({
    id: 'prop.altar.listening-bench',
    kind: 'altar',
    name: '聆听长凳',
    concealment: 0.1,
    tags: ['ritual', 'cult'],
    fits: ['chapel', 'observation'],
    ix: [
      ix('sit', '坐下来听', BREATH.REST, 0, {
        effects: [san(-6), stigma('listening', 1), know('know.world.cult.what-they-heard'), oxy(-4)],
      }),
      ix('sit-long', '坐到听见为止', BREATH.RITUAL, 2, {
        effects: [
          san(-16),
          stigma('listening', 2),
          know('know.world.truth.voice-is-real'),
          fear(14),
          sfx('deep-tone'),
        ],
      }),
      ix('count-wear', '数座位上的磨痕', BREATH.LOOK * 3, 0, {
        effects: [know('know.world.cult.bench-count'), san(-4)],
      }),
    ],
    lucid:
      '一排面朝舱壁的长凳，不面朝任何祭坛。坐垫上有四十一处磨痕，深浅一致，说明使用时长相同。舱壁上没有任何东西可看。',
    drift: '四十一处磨痕，加上最左边一处更深的。更深那一处的位置，坐上去正好面对舱壁上一道焊缝。',
    resonant:
      '焊缝里有一条缝隙，宽度刚好是一只耳朵。他们不是在礼拜，他们是在排队把耳朵贴上去。最深那道磨痕是排了最多次的人。',
  }),
  prop({
    id: 'prop.altar.offering-slab',
    kind: 'altar',
    name: '供台',
    concealment: 0.1,
    tags: ['ritual', 'loot'],
    fits: ['chapel', 'reliquary', 'void'],
    ix: [
      ix('take-offering', '取走供品', BREATH.INTERACT, 5, {
        effects: [item('item.relic.tooth'), item('item.wax'), stigma('apostasy', 1), noise(5), san(-3)],
      }),
      ix('offer-blood', '献上自己的血', BREATH.RITUAL, 4, {
        requires: hasItem('item.scalpel'),
        effects: [
          item('item.blood-vial'),
          trauma(5),
          stigma('flesh', 1),
          flag('ritual.blood-given'),
          san(-5),
          know('know.world.ritual.blood-accepted'),
        ],
      }),
      ix('offer-relic', '把圣物放回去', BREATH.INTERACT + 2, 3, {
        requires: hasItem('item.relic.tooth'),
        effects: [san(8), stigma('listening', 1), flag('did.returned-relic')],
      }),
    ],
    lucid: '低矮的石台，台面凹陷。凹陷里排着一圈东西：牙齿、蜡块、一小段头发，按大小排序。',
    drift: '排序不是按大小，是按新鲜程度。最新的那一件在最靠你这一侧，还没完全干。',
    resonant: '空位在最靠你这一侧，形状是一颗牙。你的舌头已经找到了要交出去的那一颗。',
  }),
  prop({
    id: 'prop.altar.drowning-basin',
    kind: 'altar',
    name: '溺池',
    concealment: 0.1,
    tags: ['ritual', 'irreversible'],
    fits: ['chapel', 'flooded', 'moonpool', 'reliquary'],
    ix: [
      ix('look-in', '往里看', BREATH.LOOK * 2, 0, {
        effects: [san(-7), know('know.world.basin.bottomless'), fear(8)],
      }),
      ix('submerge-face', '把脸浸进去', BREATH.RITUAL, 3, {
        effects: [
          stigma('drowned', 2),
          san(-14),
          infect(10),
          warm(-2),
          know('know.world.truth.water-remembers'),
          flag('ritual.submerged'),
          sfx('submerge'),
        ],
      }),
    ],
    lucid:
      '嵌在地板里的圆池，直径一米二。水面平静得不合理——在一条会晃的船里，它连涟漪都没有。',
    drift: '水面没有涟漪。你敲舱壁，整条船都在响，水面依旧是一块玻璃。它不在这条船的参考系里。',
    resonant:
      '往下看能看到很深。深到你看见了 D5 的天花板，看见了海床，看见了海床下面有东西在仰面看你。',
  }),
  prop({
    id: 'prop.altar.iron-chair',
    kind: 'altar',
    name: '接入椅',
    concealment: 0.15,
    tags: ['ritual', 'iron', 'irreversible'],
    fits: ['medbay', 'reactor', 'chapel', 'void'],
    ix: [
      ix('inspect', '看椅背上的接口', BREATH.LOOK * 3, 0, {
        effects: [know('know.world.chair.spine-port'), san(-6)],
      }),
      ix('sit-and-connect', '坐上去，接上', BREATH.RITUAL, 18, {
        requires: hasItem('item.wire'),
        effects: [
          flag('ritual.iron-lung'),
          stigma('iron', 3),
          trauma(9),
          san(-12),
          oxy(240),
          know('know.world.truth.ship-is-lung'),
          noise(18),
          shake(0.6),
          sfx('spine-click'),
        ],
      }),
    ],
    lucid:
      '一把固定在甲板上的椅子，椅背中线开了一列插槽，和人的脊椎间距一致。接口上有使用痕迹。',
    drift: '插槽里有组织残留，方向是往外拔的。坐过这把椅子的人是自己站起来走掉的。',
    resonant:
      '椅子在等。你坐下去它会把你接进船的维生回路，你会拿到一整条船的氧气，代价是以后由船决定你什么时候呼吸。',
  }),
  prop({
    id: 'prop.altar.name-wall',
    kind: 'altar',
    name: '名字墙',
    concealment: 0.05,
    tags: ['lore', 'cult'],
    fits: ['chapel', 'archive', 'corridor', 'reliquary'],
    ix: [
      ix('read', '读那些名字', BREATH.SEARCH, 1, {
        effects: [know('know.world.cult.names'), san(-5)],
      }),
      ix('find-own', '找自己的名字', BREATH.SEARCH + 2, 2, {
        effects: [san(-12), fear(15), know('know.world.self.name-already-there'), bump('count.found-self')],
      }),
      ix('scratch-out', '把自己的名字刮掉', BREATH.INTERACT * 3, 20, {
        requires: flagOn('know.world.self.name-already-there'),
        effects: [stigma('apostasy', 2), san(6), noise(20), flag('did.erased-own-name'), sfx('stone-scrape')],
      }),
    ],
    lucid: '整面舱壁刻满名字，从下往上刻，刻到齐胸高的地方停了。停的位置很整齐，像是刻不上去了。',
    drift: '名字是从下往上刻的，说明最早的在最下面。最上面那一行墨还没干，字迹比其他都稳。',
    resonant: '你的名字在最上面那一行，刻得比任何一个都深。刻了不止一次，是同一个位置刻了很多遍。',
  }),

  // =========================================================== 圣像 icon (5)
  prop({
    id: 'prop.icon.choir-plate',
    kind: 'icon',
    name: '唱诗铜版',
    concealment: 0.2,
    tags: ['key-source', 'lore', 'cult'],
    fits: ['chapel', 'reliquary', 'archive', 'observation'],
    ix: [
      ix('study', '辨认铜版上的六个人像', BREATH.SEARCH, 2, {
        effects: [know('know.world.truth.choir'), san(-6), noise(2)],
      }),
      ix('rub', '做一张拓片', BREATH.INTERACT + 2, 3, {
        requires: hasItem('item.cloth'),
        effects: [item('item.doc.liturgy-page'), know('know.world.choir.seventh-figure'), san(-4)],
      }),
    ],
    lucid:
      '一块半米见方的铜版，浮雕六个张口的人，围成一圈，中间空着。工艺很好，口腔内部的细节都刻了。',
    drift: '六个人围成一圈，朝向中心。中心那个空位的边缘有磨损——曾经有第七个，被磨掉了。',
    resonant:
      '中间的空位现在有人了。那是从背面看的一个人，你看不见脸，但肩线和你一样。六张嘴都朝着他。',
  }),
  prop({
    id: 'prop.icon.listening-ear',
    kind: 'icon',
    name: '侧耳像',
    concealment: 0.1,
    tags: ['cult', 'symbol'],
    fits: ['chapel', 'reliquary', 'corridor', 'bulkhead', 'observation', 'void'],
    ix: [
      ix('touch', '按上去', BREATH.INTERACT, 2, {
        effects: [stigma('listening', 1), san(-4), know('know.world.cult.ear-sigil'), noise(2)],
      }),
      ix('pry-off', '把它撬下来', BREATH.INTERACT + 3, 17, {
        requires: hasItem('item.prybar'),
        effects: [item('item.relic.wax-ear'), stigma('apostasy', 1), noise(17), sfx('metal-pop')],
      }),
      ix('whisper-into', '对着它说一句话', BREATH.INTERACT, 6, {
        effects: [noise(6), san(-8), know('know.world.cult.ear-repeats'), stigma('listening', 1), sfx('echo-return')],
      }),
    ],
    lucid: '铸在舱壁上的一只耳朵，尺寸是真人的两倍，耳道是个真的孔，深度不明。',
    drift: '耳道很深。你把灯照进去，光没有照到底，也没有反光。孔里不是金属。',
    resonant: '你说的话从三个舱以外的方向回来，比你说得慢，比你说得完整——它补上了你没说完的部分。',
  }),
  prop({
    id: 'prop.icon.inverted-cross-staff',
    kind: 'icon',
    name: '倒置的测深杖',
    concealment: 0.25,
    tags: ['cult', 'lore'],
    fits: ['chapel', 'reliquary', 'observation', 'bridge'],
    ix: [
      ix('read-marks', '读杖身上的刻度', BREATH.LOOK * 3, 0, {
        effects: [know('know.world.depth.beyond-chart'), san(-5)],
      }),
      ix('take', '带走', BREATH.INTERACT, 4, {
        effects: [item('item.relic.tuning-fork'), stigma('apostasy', 1), noise(4)],
      }),
    ],
    lucid:
      '一根黄铜测深杖，倒插在架上，刻度朝下。刻度是手工加长的——原本到两千米，后面用凿子接着刻，一直刻到杖尾。',
    drift: '手工加长的部分刻了十七个新刻度。刻的人必须先到那个深度，才知道要刻到哪里。',
    resonant: '杖尾还在被刻。凿子的声音你听得见，来自你右手，可是你右手是空的。',
  }),
  prop({
    id: 'prop.icon.wax-tablet',
    kind: 'icon',
    name: '蜡板圣牌',
    concealment: 0.3,
    tags: ['cult', 'loot'],
    fits: ['reliquary', 'chapel', 'archive'],
    ix: [
      ix('read', '读蜡板上的压痕', BREATH.SEARCH - 1, 1, {
        effects: [know('know.world.cult.wax-instruction'), san(-3)],
      }),
      ix('smooth-over', '把蜡抹平', BREATH.INTERACT, 2, {
        effects: [item('item.wax'), stigma('apostasy', 1), san(3), flag('did.erased-wax')],
      }),
      ix('press-own', '把自己的手压上去', BREATH.INTERACT, 1, {
        effects: [stigma('listening', 1), san(-6), know('know.world.self.handprint-matches')],
      }),
    ],
    lucid: '木框蜡板，蜡面上压着字，被反复抹平重写过多次，底层的旧字还留着重影。',
    drift: '底层的重影里有一个手印，掌纹清楚。你比了一下，尺寸对得上。',
    resonant: '你把手压上去，蜡不是凹下去，是让开。它给你的手腾了位置，像认得。',
  }),
  prop({
    id: 'prop.icon.hull-weld-sigil',
    kind: 'icon',
    name: '焊在钢板上的记号',
    falseName: '焊疤',
    concealment: 0.35,
    tags: ['topology', 'reweave-hint'],
    fits: ['corridor', 'bulkhead', 'flooded', 'crawlspace', 'void'],
    ix: [
      ix('examine', '辨认记号', BREATH.LOOK * 2, 0, {
        effects: [know('know.world.reweave.sigil-marks-unstable'), san(-2), flag('know.reweave.suspected')],
      }),
      ix('memorize', '记住这个记号的位置', BREATH.INTERACT, 0, {
        effects: [flag('did.memorized-sigil'), san(2), know('know.world.reweave.can-be-tracked')],
      }),
    ],
    lucid:
      '一小片焊道，形状不是补漏该有的形状——是一个圈里一条横线。全船有很多处，位置看不出规律。',
    drift: '有规律。每一处焊记号旁边都有一扇门，而且都是那种关上以后你会觉得走错了的门。',
    resonant:
      '记号在动。它不是焊在钢上的，它是钢在记事。它标出了船允许自己改动的地方——而这是船告诉你的。',
  }),

  // ======================================================= 标本 specimen (5)
  prop({
    id: 'prop.specimen.jar-row',
    kind: 'specimen',
    name: '一排标本瓶',
    concealment: 0.15,
    tags: ['lore', 'loot'],
    fits: ['medbay', 'reliquary', 'archive', 'sonar-room'],
    ix: [
      ix('read-labels', '读标签', BREATH.SEARCH - 2, 1, {
        effects: [know('know.world.specimen.all-same-organ'), san(-5)],
      }),
      ix('open-one', '打开一瓶', BREATH.INTERACT, 6, {
        effects: [item('item.relic.tooth'), infect(6), san(-6), noise(6), sfx('jar-seal-pop')],
      }),
      ix('smash-all', '全部砸掉', BREATH.FORCE_DOOR, 31, {
        effects: [stigma('apostasy', 2), noise(31), san(4), fear(8), sfx('glass-cascade')],
      }),
    ],
    lucid:
      '福尔马林瓶，十一只，标签编号连续。每一瓶装的是同一个器官，来自不同的人：内耳的一部分，带着一小段骨头。',
    drift: '十一只瓶子，可是编号跳过了第七号。第七号的位置留着，卡槽里的灰尘轮廓还在。',
    resonant: '瓶子里的东西都朝着同一个方向。你走动，它们跟着转，像十一只在追声源的耳朵。',
  }),
  prop({
    id: 'prop.specimen.dredge-tray',
    kind: 'specimen',
    name: '拖网采样盘',
    concealment: 0.1,
    tags: ['lore', 'loot'],
    fits: ['sonar-room', 'archive', 'moonpool', 'observation'],
    ix: [
      ix('sort', '分类', BREATH.SEARCH, 2, {
        effects: [item('item.limestone'), know('know.world.dredge.not-biological'), bump('count.looted')],
      }),
      ix('examine-large', '检查最大的那一块', BREATH.LOOK * 3, 0, {
        effects: [san(-8), know('know.world.dredge.tooth-of-something'), fear(10)],
      }),
    ],
    lucid:
      '分格采样盘，标签写着采样深度。大多是碳酸盐结核。最大的那一格里是一块弯曲的、有珐琅质的东西，长三十一公分。',
    drift: '三十一公分的珐琅质。按比例反推，主人的体长大约是这条船的长度。',
    resonant: '它在盘子里的角度每次都不同。它不是标本，它是一片指甲，掉在这里，主人还在找。',
  }),
  prop({
    id: 'prop.specimen.growth-on-hull',
    kind: 'specimen',
    name: '长在舱壁上的东西',
    concealment: 0.2,
    tags: ['infection', 'hazard'],
    fits: ['flooded', 'void', 'moonpool', 'crawlspace', 'reliquary'],
    ix: [
      ix('examine', '近距离观察', BREATH.LOOK * 2, 0, {
        effects: [san(-5), know('know.world.growth.follows-sound'), infect(2)],
      }),
      ix('cut-sample', '割一块样本', BREATH.INTERACT, 5, {
        requires: hasItem('item.scalpel'),
        effects: [item('item.specimen.tissue'), infect(9), san(-4), noise(5), stigma('flesh', 1)],
      }),
      ix('burn', '烧掉', BREATH.INTERACT * 2, 21, {
        requires: hasItem('item.magnesium'),
        effects: [noise(21), san(6), stigma('apostasy', 1), fear(6), sfx('flesh-burn')],
      }),
    ],
    lucid:
      '一片贴在钢板上的白色组织，边缘有绒毛状结构，绒毛朝一个方向倒伏。倒伏的方向指向舱室出口。',
    drift: '绒毛倒伏的方向变了。它现在指向你。它是靠声音定向的，而这个房间里只有你在响。',
    resonant: '它是耳朵长出来的，不止一只。整片都是，密密地，全都朝着你，全都在等你再发出一点声音。',
  }),
  prop({
    id: 'prop.specimen.folded-crewman',
    kind: 'specimen',
    name: '被折叠的船员',
    concealment: 0.1,
    tags: ['gore', 'lore', 'listener-evidence'],
    fits: ['void', 'flooded', 'crawlspace', 'reliquary', 'moonpool'],
    ix: [
      ix('examine', '看它是怎么被折的', BREATH.LOOK * 3, 0, {
        effects: [san(-13), fear(18), know('know.world.listener.method'), sfx('heart-lurch')],
      }),
      ix('unfold', '试着把他展开', BREATH.INTERACT * 3, 12, {
        effects: [san(-10), trauma(3), noise(12), item('item.doc.liturgy-page'), stigma('flesh', 1)],
      }),
    ],
    lucid:
      '一个人被沿着不存在的关节折了四次，塞进一个二十公分见方的检修孔。表面没有切口，骨头也没断。',
    drift: '没有切口，骨头没断。要做到这一点，必须先让骨头同意。',
    resonant:
      '他还是活的那种意义上的完整。折叠是一种收纳，不是杀。收纳的人是打算以后拿出来用的。',
  }),
  prop({
    id: 'prop.specimen.your-own-lung',
    kind: 'specimen',
    name: '一副标本化的肺',
    falseName: '肺标本',
    concealment: 0.3,
    tags: ['self', 'lore', 'setpiece'],
    fits: ['medbay', 'reliquary', 'archive', 'void'],
    ix: [
      ix('read-label', '读标签', BREATH.LOOK * 2, 0, {
        effects: [san(-11), know('know.world.self.lung-on-file'), fear(12)],
      }),
      ix('breathe-with', '把手放在玻璃上，跟着它呼吸', BREATH.REST, 0, {
        effects: [
          san(-9),
          oxy(30),
          stigma('iron', 1),
          know('know.world.truth.you-are-the-instrument'),
          sfx('glass-fog'),
        ],
      }),
    ],
    lucid:
      '一副浸泡保存的肺，玻璃罐比常规标本罐大。标签上的编号格式和病历板一致，姓名一栏写的是你的名字。',
    drift: '姓名一栏是你的名字，采集日期是明天。保存液是清的，说明它是新的。',
    resonant: '它在动。很慢，但它在动，而且和你反相——你吸，它呼。你们共用同一份空气。',
  }),

  // ========================================================= 镜子 mirror (5)
  prop({
    id: 'prop.mirror.washroom',
    kind: 'mirror',
    name: '洗漱间的镜子',
    concealment: 0.05,
    tags: ['veracity', 'anchor'],
    fits: ['bunks', 'medbay', 'galley', 'corridor'],
    ix: [
      ix('look', '照一下', BREATH.LOOK, 0, {
        effects: [san(-3), know('know.world.reflection.off-by-one')],
      }),
      ix('anchor', '确认这是自己', BREATH.INTERACT + 2, 1, {
        effects: [san(10), flag('did.anchored'), know('know.world.self.still-you'), bump('count.anchored')],
      }),
      ix('smash', '砸碎', BREATH.INTERACT + 2, 23, {
        effects: [
          item('item.mirror-shard'),
          noise(23),
          trauma(2),
          san(-5),
          stigma('apostasy', 1),
          sfx('mirror-break'),
        ],
      }),
    ],
    lucid: '一面小方镜，边缘的镀银已经发黑。镜面上有干掉的水渍，水渍是从下往上流的。',
    drift: '水渍从下往上流。你贴近，呼吸在镜面结雾，雾的形状比你的嘴大。',
    resonant: '镜子里的人比你先抬头。他看你的时间比你看他的时间长，而且他不需要眨眼。',
  }),
  prop({
    id: 'prop.mirror.blackened-glass',
    kind: 'mirror',
    name: '被涂黑的镜子',
    concealment: 0.15,
    tags: ['veracity', 'lore'],
    fits: ['bunks', 'chapel', 'medbay', 'reliquary', 'void'],
    ix: [
      ix('scratch-paint', '刮开一小块漆', BREATH.INTERACT, 4, {
        effects: [san(-7), know('know.world.mirror.why-painted'), noise(4), fear(8)],
      }),
      ix('leave-it', '不刮，走开', BREATH.LOOK, 0, {
        effects: [san(5), stigma('silence', 1), know('know.world.self.can-refuse')],
      }),
    ],
    lucid: '镜子被厚厚地涂了黑漆，涂了好几层。漆刷的走向很急，边缘溢到了舱壁上。',
    drift: '涂了七层。每一层之间都有一段时间——涂一层，过一阵，发现不够，再涂一层。',
    resonant: '漆是从镜子里面涂的。你刮开的那一小块，露出的不是镜面，是另一把刷子在对着你刷。',
  }),
  prop({
    id: 'prop.mirror.polished-bulkhead',
    kind: 'mirror',
    name: '被磨亮的一块舱壁',
    concealment: 0.3,
    tags: ['veracity', 'eerie'],
    fits: ['corridor', 'bulkhead', 'crawlspace', 'flooded'],
    ix: [
      ix('look', '在钢面上看自己', BREATH.LOOK * 2, 0, {
        effects: [san(-6), know('know.world.mirror.someone-polished-this')],
      }),
      ix('breathe-on', '朝它呼一口气', BREATH.INTERACT, 2, {
        effects: [san(-8), know('know.world.mirror.fog-shows-door'), noise(2), sfx('glass-fog')],
      }),
    ],
    lucid:
      '一块约齐眼高的舱壁被磨到能反光。磨痕是环形的，用布蘸着什么反复擦出来的，范围刚好是一张脸。',
    drift: '磨的范围刚好是一张脸的大小，但位置比你的脸高十公分。磨它的人比你高。',
    resonant: '你呼气，钢面结雾。雾里显出一道门框的轮廓，在你背后的实心墙上。',
  }),
  prop({
    id: 'prop.mirror.mirrored-room-seam',
    kind: 'mirror',
    name: '对称缝',
    falseName: '舱壁接缝',
    concealment: 0.4,
    tags: ['setpiece', 'topology'],
    fits: ['corridor', 'bulkhead', 'void', 'bunks'],
    ix: [
      ix('trace', '沿着缝摸一遍', BREATH.INTERACT, 1, {
        effects: [know('know.world.mirror.room-is-mirrored'), san(-7), flag('know.mirror.seam-found')],
      }),
      ix('compare-traces', '比对自己留下的痕迹', BREATH.SEARCH, 0, {
        requires: flagOn('know.mirror.seam-found'),
        effects: [san(-10), know('know.world.mirror.traces-reversed'), fear(13)],
      }),
    ],
    lucid: '一道贯穿地面、舱壁与舱顶的接缝。缝两侧的一切都是对称的，包括螺栓数量和油漆剥落的形状。',
    drift: '对称到了不合理的程度。油漆剥落是随机过程，不可能镜像。有人把这个房间做成了镜像。',
    resonant:
      '你上一次路过留下的鞋印在缝的另一侧，左右是反的。做这件事需要先知道你会走哪一步。',
  }),
  prop({
    id: 'prop.mirror.two-way-observation',
    kind: 'mirror',
    name: '单向观察窗',
    concealment: 0.2,
    tags: ['lore', 'eerie'],
    fits: ['medbay', 'archive', 'observation', 'bridge'],
    ix: [
      ix('look', '往里看', BREATH.LOOK * 2, 0, {
        effects: [san(-6), know('know.world.observation.who-watched-whom')],
      }),
      ix('shade-eyes', '用手遮光看清另一侧', BREATH.INTERACT, 1, {
        effects: [san(-11), fear(14), know('know.world.observation.chair-faces-out'), sfx('glass-tap')],
      }),
      ix('break', '打破', BREATH.FORCE_DOOR, 27, {
        effects: [noise(27), trauma(3), item('item.mirror-shard'), stigma('apostasy', 1), sfx('mirror-break')],
      }),
    ],
    lucid: '一扇观察窗，一侧是镜面。你在镜面这一侧，说明设计上你是被观察的那一方。',
    drift: '你在被观察的那一侧。可是记录笔记的桌椅也在你这一侧，朝着镜子。',
    resonant:
      '遮光看进去：里面是一间和这里一模一样的房间，一把椅子，朝着窗。椅子上坐着的人在记录你。',
  }),

  // ============================================================ 巢 nest (5)
  prop({
    id: 'prop.nest.metal-hoard',
    kind: 'nest',
    name: '金属堆巢',
    concealment: 0.25,
    tags: ['key-source', 'danger', 'loot'],
    fits: ['crawlspace', 'flooded', 'void', 'ballast', 'moonpool'],
    ix: [
      // 无条件产出月池扳手（D4→D5 的备用钥匙）
      ix('rob', '从巢里拿走那把大扳手', BREATH.SEARCH, 14, {
        effects: [
          item('item.key.moonpool-wrench'),
          noise(14),
          fear(11),
          san(-5),
          sfx('metal-slide'),
          know('know.world.nest.it-collects-metal'),
        ],
      }),
      ix('rob-quietly', '一件一件慢慢挪开', BREATH.SEARCH * 2, 4, {
        requires: hasItem('item.grease'),
        effects: [item('item.key.moonpool-wrench'), item('item.solder'), noise(4), san(-3)],
      }),
      ix('study', '看它收集的规律', BREATH.LOOK * 3, 0, {
        effects: [know('know.world.nest.sorted-by-pitch'), san(-4)],
      }),
    ],
    lucid:
      '一堆金属件垒成的碗状结构，直径一米半。里面是扳手、餐具、门把手、一把大号管钳。按大小排过。',
    drift: '不是按大小排的。你敲了几件，是按敲击音高排的，从低到高绕成螺旋。',
    resonant: '它在收集会响的东西。中心的空位是给最响的那一件留的。你身上有金属。',
  }),
  prop({
    id: 'prop.nest.hair-and-cloth',
    kind: 'nest',
    name: '毛发与布的巢',
    concealment: 0.3,
    tags: ['danger', 'loot'],
    fits: ['bunks', 'crawlspace', 'void', 'medbay'],
    ix: [
      ix('search', '翻找', BREATH.SEARCH, 9, {
        effects: [item('item.cloth', 2), item('item.photo'), noise(9), infect(5), san(-4)],
      }),
      ix('count-sources', '判断毛发来自几个人', BREATH.LOOK * 3, 0, {
        effects: [know('know.world.nest.forty-one-donors'), san(-7)],
      }),
      ix('burn', '点燃', BREATH.INTERACT * 2, 19, {
        requires: hasItem('item.magnesium'),
        effects: [noise(19), san(3), fear(9), stigma('apostasy', 1), sfx('hair-burn')],
      }),
    ],
    lucid: '用毛发、撕开的工作服和床单编成的浅碗。编织手法一致，很熟练，是一个人编的。',
    drift: '毛发的颜色至少有四十一种不同。编的人有耐心，而且有充足的材料。',
    resonant: '巢的内壁光滑，有体温。它不是给幼体准备的，尺寸刚好装一个成年人的躯干，坐姿。',
  }),
  prop({
    id: 'prop.nest.egg-cluster',
    kind: 'nest',
    name: '卵团',
    concealment: 0.2,
    tags: ['danger', 'infection'],
    fits: ['flooded', 'void', 'moonpool', 'crawlspace'],
    ix: [
      ix('examine', '数一数', BREATH.LOOK * 2, 0, {
        effects: [san(-6), know('know.world.eggs.count-matches-crew'), infect(3)],
      }),
      ix('crush', '踩碎', BREATH.INTERACT + 2, 20, {
        effects: [noise(20), infect(11), san(-3), stigma('apostasy', 1), fear(10), sfx('wet-burst')],
      }),
      ix('take-one', '取走一枚', BREATH.INTERACT, 4, {
        effects: [item('item.specimen.tissue'), infect(8), stigma('flesh', 1), noise(4)],
      }),
    ],
    lucid: '半透明的团状物，附着在舱壁下缘。四十一枚，尺寸一致。每一枚里面有一个致密的暗核。',
    drift: '四十一枚。暗核的形状是卷曲的，有脊椎的弯法。数量和名单一致，也和病历一致。',
    resonant: '第四十二枚在你脚边，刚落下来，还连着一条丝。它的暗核比其他都大，而且是展开的。',
  }),
  prop({
    id: 'prop.nest.bone-arrangement',
    kind: 'nest',
    name: '骨头的排列',
    concealment: 0.15,
    tags: ['lore', 'listener-evidence'],
    fits: ['void', 'flooded', 'reliquary', 'moonpool', 'chapel'],
    ix: [
      ix('read-pattern', '看排列的图案', BREATH.SEARCH, 1, {
        effects: [know('know.world.listener.writes'), san(-9), fear(12)],
      }),
      ix('disturb', '打乱它', BREATH.INTERACT, 15, {
        effects: [noise(15), san(-6), stigma('apostasy', 1), flag('did.disturbed-bones'), sfx('bone-clatter')],
      }),
      ix('add-to-it', '把自己身上的一样东西摆进去', BREATH.INTERACT + 2, 3, {
        effects: [stigma('listening', 2), san(-7), know('know.world.listener.accepts-contribution')],
      }),
    ],
    lucid:
      '地板上摆着骨头，不是散落，是摆的。长骨平行，间距相等，末端对齐。整体构成一个大约两米宽的图形。',
    drift: '这个图形你认得。它是这一层的走廊拓扑，比例正确，包括你刚才走过的那两个岔口。',
    resonant:
      '图形在更新。你走一步，某一根骨头就换一个位置。它在画你走过的路 —— 它在**记录**，不是在装饰。',
  }),
  prop({
    id: 'prop.nest.listener-sign',
    kind: 'nest',
    name: '它路过的痕迹',
    falseName: '船体变形',
    concealment: 0.1,
    tags: ['listener-evidence', 'eerie'],
    fits: ['corridor', 'bulkhead', 'flooded', 'void', 'crawlspace'],
    ix: [
      ix('measure', '量一下变形的宽度', BREATH.LOOK * 2, 0, {
        effects: [know('know.world.listener.size'), san(-8), fear(13)],
      }),
      ix('touch', '摸一下断面', BREATH.INTERACT, 1, {
        effects: [san(-5), warm(0.6), know('know.world.listener.recent'), infect(3)],
      }),
      ix('follow', '顺着痕迹走向判断它去了哪', BREATH.INTERACT + 2, 0, {
        effects: [know('know.world.listener.heading'), san(-4), flag('know.listener.tracked')],
      }),
    ],
    lucid:
      '走廊的一侧被挤进去了，钢板呈平滑的凹陷，没有撕裂。凹陷从地板一直连到舱顶，宽度约一米八。',
    drift: '钢板是被挤的，不是撞的。挤需要持续的力和时间。它从这里经过时，是慢慢走的。',
    resonant:
      '断面是温的。凹陷的形状不像身体，像是有东西在这里把自己**展开**过，然后又收了回去。',
  }),

  // ======================================================= 舷窗 porthole (5)
  prop({
    id: 'prop.porthole.small-round',
    kind: 'porthole',
    name: '小舷窗',
    concealment: 0.05,
    tags: ['lore'],
    fits: ['bunks', 'galley', 'corridor', 'medbay', 'observation'],
    ix: [
      ix('look-out', '往外看', BREATH.LOOK * 2, 0, {
        effects: [san(-4), know('know.world.outside.no-light')],
      }),
      ix('light-outside', '用灯往外照', BREATH.INTERACT, 3, {
        effects: [san(-9), fear(11), know('know.world.outside.not-water'), noise(3), sfx('glass-tap')],
      }),
    ],
    lucid: '双层加厚玻璃，直径二十公分。外面是黑的。不是暗，是黑 —— 黑到玻璃上照不出你自己。',
    drift: '玻璃照不出你自己。任何玻璃在黑暗中都会反光，除非外面在吸光。',
    resonant: '你把灯往外照，光没有散开，它直着走进去，被什么接住了，然后那东西让开了一条路。',
  }),
  prop({
    id: 'prop.porthole.observation-pane',
    kind: 'porthole',
    name: '观测大窗',
    concealment: 0,
    tags: ['lore', 'cult'],
    fits: ['observation', 'chapel', 'moonpool'],
    ix: [
      ix('look-out', '站在窗前', BREATH.REST, 0, {
        effects: [san(-10), stigma('listening', 1), know('know.world.outside.it-is-looking-back'), fear(14)],
      }),
      ix('check-frame', '检查窗框的受力痕迹', BREATH.LOOK * 3, 0, {
        effects: [know('know.world.window.pushed-from-outside'), san(-6)],
      }),
      ix('press-palm', '把手掌按在玻璃上', BREATH.INTERACT, 2, {
        effects: [san(-8), warm(-1.4), stigma('listening', 1), know('know.world.window.it-pressed-back')],
      }),
    ],
    lucid:
      '两米宽的半球形观察窗，教团在窗前摆了长凳。窗外没有任何东西。玻璃厚三十公分，内表面有均匀的细微裂纹。',
    drift: '裂纹是从内表面开始的。压力在这个深度是从外往内的，除非有一次力是从内往外的。',
    resonant:
      '窗外有东西，一直有。它的表面和黑色完全同色，所以你只能靠它移动时黑得不一样来发现它。它现在不动了，因为你在看。',
  }),
  prop({
    id: 'prop.porthole.cracked-pane',
    kind: 'porthole',
    name: '开裂的舷窗',
    concealment: 0.1,
    tags: ['hazard'],
    fits: ['corridor', 'flooded', 'observation', 'bunks', 'void'],
    ix: [
      ix('examine', '看裂纹走向', BREATH.LOOK * 2, 0, {
        effects: [know('know.world.hull.breach-imminent'), fear(9)],
      }),
      ix('reinforce', '用胶带和垫片加固', BREATH.INTERACT * 2, 5, {
        requires: allOf(hasItem('item.tape'), hasItem('item.gasket')),
        effects: [flag('sys.pane.reinforced'), san(4), noise(5), know('know.world.hull.bought-time')],
      }),
      ix('break-it', '打破它', BREATH.FORCE_DOOR, 48, {
        effects: [
          flag('did.breached-hull'),
          noise(48),
          stigma('drowned', 2),
          trauma(12),
          warm(-6),
          shake(1),
          sfx('implosion'),
        ],
      }),
    ],
    lucid:
      '舷窗有一道贯穿性裂纹，正在渗水，速率大约每分钟几滴。裂纹的两端都有新鲜的白色延伸迹象。',
    drift: '裂纹的延伸速度不是恒定的。你安静时它慢，你出声时它快。它在跟着声音裂。',
    resonant: '裂纹是从外面伸进来的。它不是裂开，它是有什么东西在用很细的东西刻玻璃，从外侧。',
  }),
  prop({
    id: 'prop.porthole.taped-over',
    kind: 'porthole',
    name: '被封住的舷窗',
    concealment: 0.15,
    tags: ['lore'],
    fits: ['bunks', 'corridor', 'galley', 'medbay', 'chapel'],
    ix: [
      ix('peel', '撕开封住的东西', BREATH.INTERACT, 6, {
        effects: [item('item.tape'), san(-7), know('know.world.window.why-covered'), noise(6)],
      }),
      ix('leave', '不去动它', BREATH.LOOK, 0, {
        effects: [san(4), stigma('silence', 1)],
      }),
    ],
    lucid: '舷窗被从内侧用胶带、床单和一块木板封住，封得很仔细，边缘一点缝都没留。',
    drift: '封的层数很多，而且层与层之间垫了布，是为了隔声，不是为了遮光。',
    resonant: '你撕开一角。外面是这条走廊。你正从外面看着自己在撕。',
  }),
  prop({
    id: 'prop.porthole.moonpool-surface',
    kind: 'porthole',
    name: '月池水面',
    concealment: 0,
    tags: ['endgame', 'lore'],
    fits: ['moonpool', 'flooded', 'airlock'],
    ix: [
      ix('look-down', '看水面', BREATH.LOOK * 2, 0, {
        effects: [san(-7), know('know.world.moonpool.surface-wrong'), fear(10)],
      }),
      ix('drop-object', '扔一样东西下去听回声', BREATH.INTERACT, 12, {
        effects: [know('know.world.moonpool.no-splash'), san(-9), noise(12), sfx('no-splash')],
      }),
      ix('touch-surface', '把手指伸进水面', BREATH.INTERACT, 2, {
        effects: [warm(-2.5), infect(7), stigma('drowned', 1), san(-11), know('know.world.moonpool.it-is-warm')],
      }),
    ],
    lucid:
      '一个直通外海的方形开口，水面与甲板齐平。在 -2,100 m，这个开口本该把整条船在一秒内灌满。它没有。',
    drift: '水面和甲板齐平，而且纹丝不动。压力算不平。有东西在从下面顶住这一整片水。',
    resonant: '水面是温的，和体温一样。它不是海。它是某个正在张着的东西的表面，而它一直是张着的。',
  }),
];
