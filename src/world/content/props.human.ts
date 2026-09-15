/**
 * world/content/props.human.ts — 人留下的东西
 *
 * 尸体、储物柜、航海日志、无线电。
 * 写作纪律：不写「恐怖的」「诡异的」这类形容词，只写可被观察的事实，
 * 让读者自己得出结论。低 SAN 档不是加感叹号，而是换掉观察者。
 */

import { BREATH } from '../../core/contract';
import type { PropDef } from '../types';
import {
  allOf,
  bump,
  fear,
  flag,
  flagOff,
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
  stigma,
  trauma,
  warm,
} from './helpers';

export const HUMAN_PROPS: readonly PropDef[] = [
  // ======================================================== 尸体 corpse (8)
  prop({
    id: 'prop.corpse.bunk-sleeper',
    kind: 'corpse',
    name: '仍在铺位上的人',
    falseName: '睡着的人',
    concealment: 0.1,
    tags: ['crew', 'loot'],
    fits: ['bunks', 'medbay', 'corridor'],
    ix: [
      ix('search', '摸索口袋', BREATH.SEARCH, 2, {
        effects: [item('item.key.crew-brass'), item('item.ration'), bump('count.looted')],
      }),
      ix('examine', '看他的脸', BREATH.LOOK * 2, 0, {
        effects: [san(-2), know('know.world.crew.no-struggle')],
      }),
      ix('cover', '替他把毯子盖上', BREATH.INTERACT, 1, {
        requires: flagOff('did.covered.sleeper'),
        effects: [san(3), flag('did.covered.sleeper'), stigma('silence', 1)],
      }),
    ],
    lucid:
      '一个人躺在下铺，毯子拉到胸口，手在毯子外面，指甲修剪过。没有挣扎的痕迹。他的靴子整齐地并在床下。',
    drift:
      '他躺得太整齐了。毯子的褶皱是从外面压出来的——有人替他盖好的。指甲修剪过，但不是他自己剪的角度。',
    resonant:
      '他在等。毯子下面的胸口每隔很久起伏一次，和你的间隔一样。你数到第七次的时候发现，是你在替他呼吸。',
  }),
  prop({
    id: 'prop.corpse.valve-clutcher',
    kind: 'corpse',
    name: '抱着阀门的人',
    concealment: 0.05,
    tags: ['crew', 'loot'],
    fits: ['engine', 'ballast', 'bulkhead', 'flooded'],
    ix: [
      ix('pry-hands', '掰开他的手', BREATH.INTERACT + 2, 6, {
        effects: [item('item.wrench'), san(-4), trauma(1), sfx('bone-give')],
      }),
      ix('read-posture', '判断他想关还是想开', BREATH.LOOK * 3, 0, {
        effects: [know('know.world.valve.direction'), san(-1)],
      }),
    ],
    lucid:
      '他跪着，双手锁在手轮上。手轮已经转到底，再也转不动了。他的方向是「关」。水在他身后半米处停住。',
    drift:
      '他跪着抱住手轮，像抱一个人。手轮转到底了。你数了三遍——他转的方向是「开」。水在他身后停住，说明他失败了，或者说明他成功了。',
    resonant:
      '他没跪，他是被手轮长出来的。手腕和金属之间已经分不出界线。他的方向是你等会儿要选的那个方向。',
  }),
  prop({
    id: 'prop.corpse.choir-member',
    kind: 'corpse',
    name: '唱诗班的一位',
    concealment: 0.2,
    tags: ['cult', 'ritual'],
    fits: ['chapel', 'reliquary', 'void', 'observation'],
    ix: [
      ix('listen-throat', '把耳朵贴在他喉咙上', BREATH.INTERACT, 0, {
        effects: [san(-7), fear(10), know('know.world.choir.still-singing'), sfx('throat-hum')],
      }),
      ix('take-wax', '取走他耳朵里的蜡', BREATH.INTERACT, 2, {
        effects: [item('item.relic.wax-ear'), stigma('apostasy', 1), san(-2)],
      }),
      ix('join', '跟着唱一句', BREATH.INTERACT * 2, 22, {
        effects: [stigma('listening', 2), san(-10), know('know.world.choir.your-name'), noise(22)],
      }),
    ],
    lucid:
      '跪姿，前额触地。耳道里灌了蜡，封得很平整——是自己灌的，蜡的走向从里往外。喉部软骨完好。',
    drift:
      '前额触地，但地面被磨出了一个浅坑，说明这个姿势维持了比一个人活着更久的时间。耳朵里的蜡是从里面往外灌的。',
    resonant:
      '他在唱。声带早就没了，声音是从胸腔的空气里直接成形的。唱的是六个音节。第三个和第四个是你的名字。',
  }),
  prop({
    id: 'prop.corpse.medbay-restrained',
    kind: 'corpse',
    name: '被约束带固定的患者',
    concealment: 0.05,
    tags: ['crew', 'loot', 'infection'],
    fits: ['medbay', 'bunks'],
    ix: [
      ix('search', '翻检器械托盘', BREATH.SEARCH, 3, {
        effects: [item('item.scalpel'), item('item.morphine'), bump('count.looted')],
      }),
      ix('check-straps', '检查约束带的扣位', BREATH.LOOK * 2, 0, {
        effects: [know('know.world.restraints.from-inside'), san(-3)],
      }),
      ix('autopsy', '解剖', BREATH.RITUAL, 8, {
        requires: hasItem('item.scalpel'),
        effects: [know('know.world.anatomy.second-lung'), san(-8), infect(4), stigma('flesh', 1)],
      }),
    ],
    lucid:
      '四点约束，腕踝俱全。皮肤下有走向不合解剖学的隆起，从锁骨延伸到耳后。托盘里的器械按顺序摆着，少了一把。',
    drift:
      '约束带的扣子在里侧。要扣上它，手必须先是自由的——所以他自己扣的，或者扣的人在他身体里面。',
    resonant:
      '约束带是为了不让他走出去，还是不让别的东西走进来，取决于你站在哪一边。你站在里面这一边。',
  }),
  prop({
    id: 'prop.corpse.crushed-by-hatch',
    kind: 'corpse',
    name: '被舱门截断的人',
    concealment: 0.05,
    tags: ['crew', 'loot', 'gore'],
    fits: ['bulkhead', 'airlock', 'corridor'],
    ix: [
      ix('search-upper', '搜上半身', BREATH.SEARCH, 3, {
        effects: [item('item.doc.crew-manifest'), item('item.tape'), bump('count.looted')],
      }),
      ix('use-as-wedge', '用他的躯干卡住门', BREATH.INTERACT + 2, 9, {
        effects: [flag('did.wedged-door'), san(-9), stigma('flesh', 1), sfx('wet-drag')],
      }),
    ],
    lucid:
      '液压舱门在第九与第十胸椎之间闭合。上半身在这一侧，姿势是向前爬。门边缘的漆被指甲刮出六道平行痕。',
    drift:
      '六道刮痕。你数了两遍是六道，第三遍是七道。上半身朝向的是门里，不是门外——他在往里爬。',
    resonant:
      '他还在往里爬。每次你不看他的时候，他前进一点。门另一侧那一半也在爬，朝相反方向，正在离开。',
  }),
  prop({
    id: 'prop.corpse.radio-operator',
    kind: 'corpse',
    name: '戴着耳机的通信员',
    concealment: 0.1,
    tags: ['crew', 'loot', 'lore'],
    fits: ['sonar-room', 'bridge', 'archive'],
    ix: [
      ix('take-headset', '取下耳机', BREATH.INTERACT, 2, {
        effects: [item('item.recorder'), san(-3), sfx('static-burst')],
      }),
      ix('wear-headset', '戴上他的耳机', BREATH.INTERACT, 0, {
        effects: [san(-6), fear(8), know('know.world.vance.onboard'), stigma('listening', 1)],
      }),
      ix('read-pad', '读他手边的记录板', BREATH.SEARCH - 2, 1, {
        effects: [know('know.world.coords.drifting'), item('item.doc.sonar-log')],
      }),
    ],
    lucid:
      '坐姿，脊背挺直，右手仍搭在频率旋钮上。耳机通着电。记录板上是同一组坐标，抄了四十一遍，越来越准。',
    drift:
      '四十一遍坐标。后面几遍的笔迹开始像你的。最后一行没抄完，停在小数点后第二位——那是你还没读到的位数。',
    resonant:
      '他在听。耳机里的声音你也听得见，隔着两米的空气，那是有人报出坐标的后半段。声音是你的。',
  }),
  prop({
    id: 'prop.corpse.galley-cook',
    kind: 'corpse',
    name: '灶台后的司务长',
    concealment: 0.15,
    tags: ['crew', 'loot'],
    fits: ['galley'],
    ix: [
      ix('search', '搜他的围裙', BREATH.SEARCH, 2, {
        effects: [item('item.key.crew-brass'), item('item.cutter'), bump('count.looted')],
      }),
      ix('count-portions', '数灶上备了几份', BREATH.LOOK * 2, 0, {
        effects: [know('know.world.manifest.extra-portion'), san(-4)],
      }),
    ],
    lucid:
      '倒在灶台与冷柜之间。灶上有四十二份餐食，都凉了，摆盘整齐。船员名单上是四十一个人。',
    drift:
      '四十二份。你把名单和餐盘对了三次，多的那一份摆在最靠门的位置，刀叉朝向门外。是留给进来的人的。',
    resonant:
      '第四十二份还是热的。你不必碰就知道它是热的。它是按你的口味摆的——你从没告诉过任何人你的口味。',
  }),
  prop({
    id: 'prop.corpse.your-double',
    kind: 'corpse',
    name: '穿着你衣服的人',
    falseName: '一具船员遗体',
    concealment: 0.3,
    tags: ['setpiece', 'self', 'lore'],
    fits: ['bunks', 'void'],
    ix: [
      ix('look-face', '看他的脸', BREATH.LOOK * 3, 0, {
        effects: [san(-14), fear(18), know('know.world.self.previous-cycle'), sfx('heart-lurch')],
      }),
      ix('take-tags', '取下他的身份牌', BREATH.INTERACT, 2, {
        effects: [item('item.doc.own-tags'), san(-6), know('know.world.self.cycle-number')],
      }),
      ix('search-pocket', '摸他左胸口的口袋', BREATH.SEARCH, 2, {
        effects: [item('item.photo'), san(-5)],
      }),
      ix('swap-clothes', '和他换衣服', BREATH.RITUAL, 5, {
        requires: not(flagOn('did.swapped-clothes')),
        effects: [
          flag('did.swapped-clothes'),
          warm(1.5),
          san(-12),
          stigma('drowned', 1),
          know('know.world.self.interchangeable'),
        ],
      }),
    ],
    lucid:
      '他穿的是你身上这一套。同一处磨损，同一颗替换过的纽扣——你自己缝的那一颗，线是绿的。左胸口的口袋鼓着。',
    drift:
      '同一颗绿线纽扣。你伸手摸自己胸前，纽扣在。你再看他，他的也在。世界上应该只有一颗。',
    resonant:
      '这不是像你，这是你。区别只在于他已经走完了，而你还在走。他左胸口的口袋里装着你等会儿会捡到的东西。',
  }),

  // ======================================================= 储物柜 locker (6)
  prop({
    id: 'prop.locker.crew-personal',
    kind: 'locker',
    name: '船员私柜',
    concealment: 0.1,
    tags: ['loot'],
    fits: ['bunks', 'corridor', 'galley'],
    ix: [
      ix('open', '打开', BREATH.OPEN_DOOR, 4, {
        effects: [item('item.cloth'), item('item.ration'), bump('count.looted'), sfx('metal-latch')],
      }),
      ix('force', '撬开', BREATH.FORCE_DOOR, 14, {
        requires: hasItem('item.prybar'),
        effects: [item('item.key.crew-brass'), item('item.grease'), noise(14), sfx('metal-shriek')],
      }),
      ix('read-name', '读柜门上的名牌', BREATH.LOOK, 0, {
        effects: [know('know.world.manifest.name-scratched')],
      }),
    ],
    lucid: '薄钢皮柜，门上有插名牌的槽。名牌还在，字被指甲刮掉了，只剩笔画压出的凹痕。',
    drift: '名牌上的字被刮掉了，但凹痕还在。凑近数笔画，是你名字的笔画数。',
    resonant: '柜门内侧贴着一张排班表，上面每一格都写着你的名字，从这一班到永远。',
  }),
  prop({
    id: 'prop.locker.medical-cabinet',
    kind: 'locker',
    name: '药品柜',
    concealment: 0.05,
    tags: ['loot', 'medical'],
    fits: ['medbay'],
    ix: [
      ix('open', '打开', BREATH.OPEN_DOOR, 3, {
        effects: [item('item.antiseptic'), item('item.morphine'), bump('count.looted')],
      }),
      ix('read-ledger', '查领用登记', BREATH.SEARCH - 2, 1, {
        effects: [know('know.world.medical.mass-sedation'), san(-3)],
      }),
      ix('take-all', '把整格倒进包里', BREATH.INTERACT + 2, 11, {
        effects: [item('item.morphine', 2), item('item.stim'), noise(11), sfx('glass-clatter')],
      }),
    ],
    lucid: '玻璃门，内有分格。镇静剂那一格是空的，登记簿上最后一页写了四十一个剂量，同一个时刻。',
    drift: '四十一个剂量，同一分钟。这不是抢救，这是排队。队尾留了一行空白。',
    resonant: '空白那一行正在被填。笔不在你手里，但笔画的顺序是你的顺序。',
  }),
  prop({
    id: 'prop.locker.dive-suit-rack',
    kind: 'locker',
    name: '潜水服架',
    concealment: 0.1,
    tags: ['loot', 'gear'],
    fits: ['airlock', 'moonpool', 'bulkhead'],
    ix: [
      ix('inspect', '检查气瓶余压', BREATH.LOOK * 2, 1, {
        effects: [know('know.world.suits.all-used')],
      }),
      ix('strip', '拆走可用件', BREATH.SEARCH, 6, {
        effects: [item('item.gasket'), item('item.oxy-candle'), bump('count.looted')],
      }),
      ix('count-suits', '数挂了几套', BREATH.LOOK, 0, {
        effects: [san(-4), know('know.world.suits.one-extra')],
      }),
    ],
    lucid: '八个挂位，挂着九套。每一套的气瓶都是空的，面镜内侧都有一层干涸的呼气痕。',
    drift: '九套挂在八个挂位上。多出的那一套没有挂钩，它就那样立在那里。',
    resonant: '第九套的面镜上有呼气的雾，正在扩大。它在你走进来之后才开始呼吸。',
  }),
  prop({
    id: 'prop.locker.tool-cage',
    kind: 'locker',
    name: '工具笼',
    concealment: 0.05,
    tags: ['loot', 'tool'],
    fits: ['engine', 'ballast', 'reactor', 'torpedo'],
    ix: [
      ix('open', '开笼', BREATH.OPEN_DOOR, 5, {
        effects: [item('item.prybar'), item('item.wrench'), bump('count.looted'), sfx('chain-rattle')],
      }),
      ix('check-board', '看工具影板缺了哪些', BREATH.LOOK * 2, 0, {
        effects: [know('know.world.tools.taken-inward')],
      }),
    ],
    lucid: '铁丝网笼。工具影板上每件工具画了轮廓。缺的是撬棍、切割钳、大锤——都是破门用的，不是修船用的。',
    drift: '缺的三件都是破门的。影板上的轮廓是从内侧描的，描的人当时在笼子里。',
    resonant: '轮廓在缓慢收缩，像在等你把手伸进去比对尺寸。有一个轮廓是你手的形状。',
  }),
  prop({
    id: 'prop.locker.reliquary-drawer',
    kind: 'locker',
    name: '圣物抽屉柜',
    concealment: 0.25,
    tags: ['cult', 'loot'],
    fits: ['reliquary', 'chapel'],
    ix: [
      ix('open-one', '拉开一格', BREATH.OPEN_DOOR, 3, {
        effects: [item('item.relic.tooth'), san(-4), stigma('listening', 1)],
      }),
      ix('open-all', '把所有抽屉一起拉开', BREATH.INTERACT * 2, 18, {
        effects: [
          item('item.relic.tuning-fork'),
          item('item.relic.censer'),
          san(-10),
          fear(14),
          noise(18),
          sfx('drawer-cascade'),
        ],
      }),
      ix('read-labels', '读标签', BREATH.SEARCH - 2, 1, {
        effects: [know('know.world.cult.relic-index'), san(-2)],
      }),
    ],
    lucid:
      '四十一格抽屉，每格一个标签，写着一个人名和一个日期。日期全是同一天。抽屉里是牙齿，每格一颗。',
    drift: '四十一格都有名字。第四十二格没有标签，也没有把手，但它是拉得开的。',
    resonant: '第四十二格里那颗牙是你的。你用舌头去找对应的位置，找到了一个刚好的空洞。',
  }),
  prop({
    id: 'prop.locker.mail-cubbies',
    kind: 'locker',
    name: '信件格架',
    concealment: 0.15,
    tags: ['loot', 'lore'],
    fits: ['bunks', 'corridor', 'galley'],
    ix: [
      ix('sort', '翻一遍', BREATH.SEARCH, 2, {
        effects: [item('item.photo'), item('item.doc.crew-manifest'), bump('count.looted')],
      }),
      ix('find-own', '找有没有你的', BREATH.LOOK * 3, 0, {
        effects: [san(-6), know('know.world.self.mail-waiting')],
      }),
    ],
    lucid: '木格架，每格一个姓。所有信都还没被取走，邮戳日期在下潜之后——这艘船没有靠过港。',
    drift: '邮戳在下潜之后。信是从外面送进来的，或者是从里面写的，然后盖了外面的戳。',
    resonant: '你那一格有信。地址是这艘船，收件人是你，字迹是你的，落款日期是明天。',
  }),

  // ======================================================= 日志 logbook (8)
  prop({
    id: 'prop.logbook.deck-log',
    kind: 'logbook',
    name: '值班航海日志',
    concealment: 0.05,
    tags: ['lore', 'document'],
    fits: ['bridge', 'sonar-room', 'archive', 'corridor'],
    ix: [
      ix('read', '读最后三页', BREATH.SEARCH, 0, {
        effects: [know('know.world.log.descent-voluntary'), san(-2), item('item.doc.sonar-log')],
      }),
      ix('read-all', '通读', BREATH.REST, 0, {
        effects: [know('know.world.log.depth-exceeded'), know('know.world.log.no-order'), san(-5)],
      }),
      ix('tear-page', '撕下一页带走', BREATH.INTERACT, 3, {
        effects: [item('item.doc.liturgy-page'), stigma('apostasy', 1)],
      }),
    ],
    lucid:
      '硬壳簿，铅笔字。深度记录到 -1,120 m 之后换了笔迹，行距变宽，数字仍然精确。没有一条下潜命令。',
    drift: '换笔迹之后的数字仍然精确，但每一页的最后一个数字都比上一页的第一个数字小。它在往回写。',
    resonant: '这本簿子记的是你。每一行是你做过的一个动作，包括你现在正在做的这一个。',
  }),
  prop({
    id: 'prop.logbook.medical-chart',
    kind: 'logbook',
    name: '病历板',
    concealment: 0.1,
    tags: ['lore', 'document', 'medical'],
    fits: ['medbay'],
    ix: [
      ix('read', '读', BREATH.SEARCH - 1, 0, {
        effects: [know('know.world.medical.hearing-loss-pattern'), san(-3)],
      }),
      ix('find-own-chart', '找自己的那一份', BREATH.SEARCH, 1, {
        effects: [san(-9), know('know.world.self.patient-n'), fear(10)],
      }),
    ],
    lucid:
      '夹板上四十一份病历。主诉高度一致：耳鸣，单侧听力下降，夜间听见规律敲击。治疗方案一栏全是同一个词：继续。',
    drift: '治疗方案一栏全写着「继续」。继续什么没有写，因为写的人和读的人都知道。',
    resonant:
      '你的那一份在最底下。主诉是你现在正感觉到的那些。病程记录写到了第四页，字迹越来越稳。',
  }),
  prop({
    id: 'prop.logbook.engineering-rounds',
    kind: 'logbook',
    name: '机舱巡检簿',
    concealment: 0.1,
    tags: ['lore', 'document', 'puzzle'],
    fits: ['engine', 'reactor', 'ballast'],
    ix: [
      ix('read', '查最近的巡检签字', BREATH.SEARCH - 2, 0, {
        effects: [know('know.world.world.valve-sequence'), item('item.doc.blueprint-fragment')],
      }),
      ix('trace-route', '照巡检路线在脑内走一遍', BREATH.INTERACT, 0, {
        effects: [know('know.world.topology.spine-order'), san(1)],
      }),
    ],
    lucid:
      '巡检路线印在封底，一共十一个点位，按顺序签字。签字一直签到最后一班，笔压均匀，没有中断。',
    drift: '十一个点位。封底的路线图和你脑子里的这条船对不上——差的不是位置，是顺序。',
    resonant: '路线图会在你不看的时候把点位重排。它在教你走法，像教一只动物走迷宫。',
  }),
  prop({
    id: 'prop.logbook.chaplain-journal',
    kind: 'logbook',
    name: '随船教士的私记',
    concealment: 0.3,
    tags: ['lore', 'document', 'cult'],
    fits: ['chapel', 'reliquary', 'archive'],
    ix: [
      ix('read', '读', BREATH.SEARCH + 1, 0, {
        effects: [know('know.world.cult.purpose-listening'), san(-6), stigma('listening', 1)],
      }),
      ix('read-margins', '只读页边的字', BREATH.SEARCH, 0, {
        effects: [know('know.world.code.sanctum'), san(-3)],
      }),
      ix('burn', '烧掉', BREATH.INTERACT * 2, 8, {
        requires: hasItem('item.magnesium'),
        effects: [stigma('apostasy', 2), san(5), noise(8), sfx('paper-flare')],
      }),
    ],
    lucid:
      '皮面本。正文是布道稿，抄得端正。页边另有一套小字，用的是不同的笔——那一套在算数：深度、频率、人数。',
    drift: '页边的小字在算一个乘积。你不想把它算完，但你已经把它算完了。',
    resonant:
      '页边的小字是你的笔迹。你读到一句「他会在此处停下来读这一句」，然后你停下来了。',
  }),
  prop({
    id: 'prop.logbook.bunk-diary',
    kind: 'logbook',
    name: '塞在床垫下的日记',
    concealment: 0.45,
    tags: ['lore', 'document', 'hidden'],
    fits: ['bunks'],
    ix: [
      ix('read', '读', BREATH.SEARCH, 0, {
        effects: [know('know.world.crew.pelle-no-child'), san(-4)],
      }),
      ix('take', '带走', BREATH.INTERACT, 1, { effects: [item('item.doc.liturgy-page')] }),
    ],
    lucid:
      '小开本，写了十九天。前十五天记的是天气和饭菜。第十六天起，每天只记一句：「管道里那个孩子今天又说话了。」',
    drift: '第十六天起每天一句。最后一句是「他说他明天要换一个人说」。日记停在那里。',
    resonant: '第二十天有字了，墨还没干。那句是：「他换了。是你。」',
  }),
  prop({
    id: 'prop.logbook.sonar-tape-log',
    kind: 'logbook',
    name: '声呐带记录册',
    concealment: 0.1,
    tags: ['lore', 'document', 'sonar'],
    fits: ['sonar-room', 'bridge'],
    ix: [
      ix('read', '比对波形注记', BREATH.SEARCH, 0, {
        effects: [know('know.world.sonar.artifact-tell'), san(-2)],
      }),
      ix('learn-tell', '学会如何辨别伪影', BREATH.REST, 0, {
        effects: [know('know.world.sonar.double-ping'), flag('know.sonar.tell'), san(2)],
      }),
    ],
    lucid:
      '每页贴一段热敏纸波形，旁边手写注记。有一类回波被反复圈出，注记是：「二次脉冲延迟不一致，判为不存在。」',
    drift: '「判为不存在」被划掉过，又写回来，划掉，又写回来。一共七次。最后一次是写回来。',
    resonant: '圈出来的那些波形，现在全都是一致的了。也就是说，它们都存在了。',
  }),
  prop({
    id: 'prop.logbook.ballast-order-book',
    kind: 'logbook',
    name: '压载命令簿',
    concealment: 0.1,
    tags: ['lore', 'document', 'puzzle'],
    fits: ['ballast', 'bridge', 'engine'],
    ix: [
      ix('read', '读命令序列', BREATH.SEARCH - 2, 0, {
        effects: [know('know.world.ballast.blow-sequence'), item('item.doc.blueprint-fragment')],
      }),
      ix('check-signature', '看谁下的令', BREATH.LOOK * 2, 0, {
        effects: [san(-4), know('know.world.command.unsigned')],
      }),
    ],
    lucid:
      '每条命令一行：注水量、舱号、执行人签字。最后十七行的注水量是递增的，执行人签字栏全部空白。',
    drift: '十七行递增注水，没有人签字。命令是下给船的，船自己执行的。',
    resonant: '第十八行正在出现。注水量的数字和你的氧气余量是同一个数。',
  }),
  prop({
    id: 'prop.logbook.unwritten-log',
    kind: 'logbook',
    name: '一本还没写的日志',
    falseName: '空白日志',
    concealment: 0.4,
    tags: ['setpiece', 'self', 'lore'],
    fits: ['bunks', 'void', 'archive'],
    ix: [
      ix('read', '读它', BREATH.SEARCH, 0, {
        effects: [san(-16), fear(20), know('know.world.self.log-predicts'), sfx('paper-turn')],
      }),
      ix('read-ahead', '往后翻，读还没发生的那几页', BREATH.REST, 0, {
        effects: [
          san(-20),
          know('know.world.truth.author-layer'),
          know('know.world.self.cycle-number'),
          stigma('listening', 1),
        ],
      }),
      ix('write', '在下一页写下一句你不打算做的事', BREATH.INTERACT * 2, 2, {
        effects: [flag('did.wrote-counter-log'), san(4), stigma('apostasy', 1), know('know.world.self.can-refuse')],
      }),
    ],
    lucid:
      '硬壳簿，和舰桥那本同一批。已写了十一页。笔迹是你的。内容是你今天做过的每一件事，按顺序，包括你刚刚推开这扇门。',
    drift: '第十二页写的是你还没做的事。你合上它。你听见自己在合上它之前就读完了那一页。',
    resonant:
      '它不是在预言，它是在指示。你做的每一件事都已经在这页上了，包括你正在考虑的「不照它做」。那一条也在上面。',
  }),

  // ======================================================== 无线电 radio (5)
  prop({
    id: 'prop.radio.bulkhead-set',
    kind: 'radio',
    name: '舱壁通话器',
    concealment: 0.05,
    tags: ['npc', 'lore'],
    fits: ['corridor', 'bulkhead', 'bridge', 'engine'],
    ix: [
      ix('listen', '听', BREATH.INTERACT, 3, {
        effects: [san(-3), know('know.world.vance.first-contact'), sfx('radio-hiss')],
      }),
      ix('answer', '回话', BREATH.INTERACT, 16, {
        effects: [stigma('listening', 1), noise(16), know('know.world.vance.knows-your-deck'), san(-5)],
      }),
      ix('smash', '砸掉', BREATH.FORCE_DOOR, 26, {
        effects: [stigma('silence', 2), noise(26), san(2), sfx('speaker-burst')],
      }),
    ],
    lucid: '铸铁壳通话器，按下即通。底噪很干净，说明线路另一端也是密闭的。有人在那头呼吸。',
    drift: '那头的呼吸和你的间隔一样长。你故意变了一次节奏，那头跟着变了，慢了半拍。',
    resonant: '那头没有人。那头是这个房间，延迟了两秒。你说的话会在两秒后从背后传来。',
  }),
  prop({
    id: 'prop.radio.emergency-beacon',
    kind: 'radio',
    name: '应急示位标',
    concealment: 0.1,
    tags: ['tool', 'risk'],
    fits: ['airlock', 'moonpool', 'bridge', 'observation'],
    ix: [
      ix('inspect', '检查电量', BREATH.LOOK * 2, 1, { effects: [know('know.world.beacon.charged')] }),
      ix('activate', '启动', BREATH.INTERACT * 2, 40, {
        effects: [flag('did.beacon-on'), noise(40), fear(16), sfx('beacon-wail'), know('know.world.beacon.answered')],
      }),
      ix('strip-battery', '拆电池', BREATH.INTERACT, 5, {
        effects: [item('item.battery'), flag('sys.beacon.dead')],
      }),
    ],
    lucid: '橙色壳体，电量满格。它的设计用途是让外面的人找到你。',
    drift: '电量满格。它已经被启动过了——外壳的封条断了，指示灯的塑料被烧成了褐色。',
    resonant: '它一直在响，只是频率在你的听觉之外。外面的人早就找到你了，四十一次。',
  }),
  prop({
    id: 'prop.radio.mother-speaker',
    kind: 'radio',
    name: '广播喇叭',
    falseName: '母亲',
    concealment: 0.05,
    tags: ['npc', 'ai', 'lore'],
    fits: ['corridor', 'galley', 'bunks', 'medbay', 'bridge'],
    ix: [
      ix('listen', '听广播', BREATH.INTERACT, 2, {
        effects: [san(-2), know('know.world.mother.voice-is-hers'), sfx('pa-chime')],
      }),
      ix('request-manifest', '请求朗读船员名单', BREATH.INTERACT, 8, {
        effects: [know('know.world.manifest.forty-two'), san(-6), noise(8)],
      }),
      ix('ask-about-self', '问它你是谁', BREATH.INTERACT + 2, 10, {
        effects: [san(-11), know('know.world.self.sample-n'), fear(12), noise(10)],
      }),
    ],
    lucid:
      '天花板上的号筒喇叭，还通着电。它每隔一段时间播报一次深度与舱压，语调是录音的语调，女声。',
    drift: '女声念数字的方式你很熟悉。她在念到 7 的时候会把尾音拖一下——和你母亲一样。',
    resonant:
      '她不是录音。她在回答你还没问出口的问题，而且答得比你想问的更具体。她一直在等你开口。',
  }),
  prop({
    id: 'prop.radio.pipe-voice',
    kind: 'radio',
    name: '管道里的说话声',
    falseName: '通风噪音',
    concealment: 0.35,
    tags: ['npc', 'child', 'eerie'],
    fits: ['crawlspace', 'corridor', 'ballast', 'bulkhead'],
    ix: [
      ix('listen', '把耳朵贴上管壁', BREATH.INTERACT, 1, {
        effects: [san(-5), know('know.world.pelle.exists'), sfx('pipe-whisper')],
      }),
      ix('reply', '轻声回应', BREATH.INTERACT, 7, {
        effects: [stigma('listening', 1), know('know.world.pelle.knows-your-name'), san(-7), noise(7)],
      }),
      ix('knock-back', '照它的节奏敲回去', BREATH.INTERACT, 12, {
        effects: [flag('did.knocked-back'), know('know.world.pelle.rhythm'), noise(12), san(-4)],
      }),
    ],
    lucid: '管道里有说话声，音高偏高，语速慢，像个孩子。船员名单上没有小孩。',
    drift: '他在管道里，但管道太细了。他的声音必须从比手腕还窄的地方发出来。',
    resonant: '他不在管道里。他在管道的另一侧，也就是你这一侧。他一直站在你背后说话。',
  }),
  prop({
    id: 'prop.radio.self-recorder',
    kind: 'radio',
    name: '一台还在转的录音机',
    concealment: 0.25,
    tags: ['self', 'lore'],
    fits: ['bunks', 'archive', 'sonar-room', 'void'],
    ix: [
      ix('play', '按下播放', BREATH.INTERACT, 6, {
        effects: [san(-8), know('know.world.self.recorded-instructions'), noise(6), sfx('tape-hiss')],
      }),
      ix('rewind-all', '倒回开头', BREATH.REST, 4, {
        effects: [know('know.world.self.cycle-count'), san(-6)],
      }),
      ix('record-over', '录一段盖掉它', BREATH.INTERACT * 2, 14, {
        effects: [flag('did.recorded-over'), stigma('apostasy', 1), noise(14), san(3)],
      }),
    ],
    lucid: '磁带还在走，计数器是三位数。喇叭里是你的声音，在报路线：左、左、下、屏住呼吸。',
    drift: '你的声音在报路线，报的是你接下来要走的这一段。它比你早了大约十五秒。',
    resonant: '带子没有在录你，是你在跟着带子走。三位数的计数器是轮回数。你不在第一轮。',
  }),
];
