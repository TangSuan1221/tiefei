/**
 * 圣物、文件、钥匙。
 *
 * 圣物在遭遇里有一个**负面机制**：它们抬高玩家的"信仰signature"，
 * 而 THE LISTENER、唱诗班的喉、铁肺都靠这条通道找人。
 * 所以"带着圣物"是一个用安全换叙事与结局的交易 ——
 * 动作 `act.drop-relics` 存在的全部意义就是让玩家可以在关键时刻反悔。
 */

import { mk, type GameItem } from './helpers';

export const RELICS: readonly GameItem[] = [
  mk('it.ring-of-silence', '静默之环', 'relic', 0.1, 0.12, '一枚窄口铁环，内圈刻着一行没有元音的字。戴上它的人不再被要求说话。', {
    tags: ['relic', 'faith', 'silence'],
    stackable: false,
    falseName: '婚戒',
    onUse: [
      { op: 'stigma', stigma: 'silence', delta: 1 },
      { op: 'vital', stat: 'fear', delta: -10 },
    ],
  }),
  mk('it.iron-reliquary', '铁肺圣髑', 'relic', 1.4, 0.55, '一小节铸铁风箱管，两端封死，里面有东西在滑动。摇它会听到不像金属的声音。', {
    tags: ['relic', 'faith', 'iron', 'metal'],
    stackable: false,
    onUse: [
      { op: 'stigma', stigma: 'iron', delta: 1 },
      { op: 'vital', stat: 'san', delta: -4 },
    ],
  }),
  mk('it.choir-tongue', '唱诗班的舌', 'relic', 0.15, 0.03, '一条被盐渍保存的舌，装在玻璃管里。管壁内侧有均匀的水汽，它还在呼吸的话。', {
    tags: ['relic', 'faith', 'organic', 'glass'],
    stackable: false,
    falseName: '一段绳',
    onUse: [
      { op: 'stigma', stigma: 'listening', delta: 1 },
      { op: 'knowledge', node: 'know.choir.fourth-verse' },
    ],
  }),
  mk('it.anchor-scraping', '从锚索上刮下来的', 'relic', 0.05, 0.02, '一片指甲盖大的东西，半透明，切面是分层的。它不属于任何被记录过的门类。', {
    tags: ['relic', 'listener', 'evidence'],
    stackable: false,
    onUse: [
      { op: 'knowledge', node: 'know.bestiary.ent.listener' },
      { op: 'vital', stat: 'san', delta: -7 },
    ],
  }),
  mk('it.mother-tape', '母亲的录音带', 'relic', 0.2, 0.1, '三英寸磁带，标签上是你的名字，字迹是你母亲的。录音时长四分十二秒。', {
    tags: ['relic', 'anchor-chain', 'personal'],
    stackable: false,
    falseName: '空白带',
  }),
  mk('it.zero-film', '零号胶片', 'relic', 0.1, 0.04, '一小段 16 毫米胶片。对着光看，每一格都是同一个房间，房间里每一格都多一个人。', {
    tags: ['relic', 'secret', 'evidence'],
    stackable: false,
    onUse: [
      { op: 'knowledge', node: 'know.truth.room-zero' },
      { op: 'vital', stat: 'san', delta: -12 },
    ],
  }),
  mk('it.prelate-mask', '教长的面罩', 'relic', 0.9, 0.35, '全封闭潜水面罩，视窗被从内侧涂黑了。它不是为了看，是为了在别人面前有一张脸。', {
    tags: ['relic', 'faith', 'gear'],
    stackable: false,
    onUse: [
      { op: 'stigma', stigma: 'listening', delta: 2 },
      { op: 'vital', stat: 'fear', delta: -15 },
      { op: 'vital', stat: 'san', delta: -8 },
    ],
  }),
  mk('it.drowned-icon', '溺者圣像', 'relic', 1.2, 0.4, '铅铸的小像，人形，头部朝下。底座刻着一个日期 —— 是下个月的日期。', {
    tags: ['relic', 'faith', 'metal', 'drowned'],
    stackable: false,
    onUse: [
      { op: 'stigma', stigma: 'drowned', delta: 1 },
      { op: 'vital', stat: 'coreTemp', delta: -0.6 },
    ],
  }),
];

export const DOCUMENTS: readonly GameItem[] = [
  mk('it.crew-manifest', '船员名单', 'document', 0.1, 0.01, '四十一个名字，三个班。第七行是 K·奥尔森，轮机兵。名单上没有小孩。', {
    tags: ['document', 'knowledge'],
    stackable: false,
    onUse: [{ op: 'knowledge', node: 'know.crew.manifest' }],
  }),
  mk('it.sonar-log', '声呐日志', 'document', 0.25, 0.02, '手写记录，每四小时一条。最后十七条的内容完全一样：「同上」。', {
    tags: ['document', 'knowledge'],
    stackable: false,
    onUse: [{ op: 'knowledge', node: 'know.sonar.log' }],
  }),
  mk('it.medbay-records', '医务记录', 'document', 0.3, 0.02, '四十一份档案。每一份的"听觉检查"一栏都被重做过三次以上。', {
    tags: ['document', 'knowledge'],
    stackable: false,
    onUse: [{ op: 'knowledge', node: 'know.medbay.hearing-tests' }],
  }),
  mk('it.catechism', '教义册', 'document', 0.4, 0.03, '《缄默问答》，共四十九问。第一问是「你听见了吗」，第四十九问也是。', {
    tags: ['document', 'ritual', 'knowledge'],
    stackable: false,
    onUse: [
      { op: 'knowledge', node: 'know.cult.catechism' },
      { op: 'stigma', stigma: 'listening', delta: 1 },
    ],
  }),
  mk('it.your-logbook', '你自己的日志', 'document', 0.2, 0.02, '你的笔迹。最后一页写着你十分钟前做过的事，而你没有写过它。', {
    tags: ['document', 'knowledge', 'personal'],
    stackable: false,
    falseName: '别人的日志',
    onUse: [
      { op: 'knowledge', node: 'know.truth.samples' },
      { op: 'vital', stat: 'san', delta: -9 },
    ],
  }),
  mk('it.anatomy-atlas', '解剖图谱', 'document', 0.6, 0.04, '教团编的，图是手绘的，标注很专业。收录了十一种，其中有三种的图被涂掉了。', {
    tags: ['document', 'bestiary'],
    stackable: false,
    onUse: [{ op: 'flag-add', key: 'count.atlas-read', delta: 1 }],
  }),
  mk('it.chart-fragment', '海图残页', 'document', 0.08, 0.01, '一角海图。标注的水深是 -2,100，图上这一块本该是空白。', {
    tags: ['document', 'navigation'],
    stackable: false,
    onUse: [{ op: 'knowledge', node: 'know.chart.blank-spot' }],
  }),
  mk('it.repair-manual', '维修手册', 'document', 0.8, 0.05, 'KYRIE-9 随艇手册。第四章"压载与制氧"被翻烂了，第七章"月池操作"是新的。', {
    tags: ['document', 'craft'],
    stackable: false,
    onUse: [{ op: 'knowledge', node: 'know.ship.systems' }],
  }),
  mk('it.pelle-drawing', '佩勒的画', 'document', 0.03, 0, '蜡笔画在配给单背面：一条船，一个人，一个比船大的东西。那个东西没有轮廓，只有线条向内。', {
    tags: ['document', 'personal'],
    stackable: false,
    onUse: [
      { op: 'knowledge', node: 'know.pelle.exists' },
      { op: 'vital', stat: 'san', delta: -5 },
    ],
  }),
  mk('it.confession-roll', '忏悔录', 'document', 0.35, 0.03, '卷起来的长纸条，三十九个人签了名。每个人写的都是同一句话，字迹各不相同。', {
    tags: ['document', 'ritual'],
    stackable: false,
    onUse: [
      { op: 'knowledge', node: 'know.cult.confession' },
      { op: 'stigma', stigma: 'listening', delta: 1 },
    ],
  }),
];

export const KEYS: readonly GameItem[] = [
  mk('it.hatch-key', '舱门钥匙', 'key', 0.06, 0.25, '黄铜三角钥，柄上打了 D2 的钢印。它开的不止一道门，但也不是全部。', {
    tags: ['key', 'metal'],
    stackable: false,
  }),
  mk('it.breaker-key', '配电钥', 'key', 0.05, 0.2, '配电柜的方钥。全船只有三把，大副手上那把不在他身上。', {
    tags: ['key', 'metal'],
    stackable: false,
  }),
  mk('it.reliquary-key', '圣物室钥', 'key', 0.09, 0.3, '铁钥，齿型很深，柄部铸成一只耳朵。它锁的东西不希望被拿出来。', {
    tags: ['key', 'metal', 'faith'],
    stackable: false,
  }),
  mk('it.code-slip', '密码纸条', 'key', 0.01, 0, '一张撕下来的纸角，上面四位数字。第三位被划掉重写过两次。', {
    tags: ['key', 'paper'],
    stackable: false,
  }),
  mk('it.crew-tag', '船员牌', 'key', 0.03, 0.15, '铝制身份牌，压着名字与血型。名字是你的。血型不是。', {
    tags: ['key', 'metal', 'personal'],
    stackable: false,
    falseName: '别人的牌',
  }),
  mk('it.moonpool-card', '月池卡', 'key', 0.02, 0.01, '塑料磁卡，边缘磨白。刷卡机在月池那一侧，所以这张卡只能用一次。', {
    tags: ['key', 'endgame'],
    stackable: false,
  }),
];
