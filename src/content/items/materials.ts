/** 原料。四条关键制作链（制氧 / 照明 / 静默 / 锚定）的输入全部在这里。 */

import { mk, type GameItem } from './helpers';

export const MATERIALS: readonly GameItem[] = [
  mk('it.soda-lime', '碱石灰', 'material', 1.2, 0.05, '灰白色颗粒，吸二氧化碳。医务室的柜子里按月备着，最后一次补货是三个月前。', {
    tags: ['oxygen-chain', 'chemical'],
    falseName: '骨灰',
  }),
  mk('it.iron-filings', '铁粉', 'material', 0.8, 0.1, '车间地上扫起来的。和氯酸盐混在一起点燃能放氧，也能把你的手烧掉。', {
    tags: ['oxygen-chain', 'metal'],
  }),
  mk('it.chlorate-salt', '氯酸盐砖', 'material', 1.6, 0.05, '压成砖的白色盐块，边角有黄渍。氧烛的主料，也是全船最不该被撞到的东西。', {
    tags: ['oxygen-chain', 'chemical', 'volatile'],
    falseName: '圣餐饼',
  }),
  mk('it.rebreather-mask', '呼吸器面罩', 'material', 2.4, 0.4, '橡胶已经发硬，但密封圈还能用。滤罐接口是标准螺纹。', {
    tags: ['oxygen-chain', 'gear'],
    stackable: false,
  }),
  mk('it.pressure-bottle', '高压气瓶', 'material', 5.5, 0.9, '空瓶，表针在零。装满以后它是你能带的最重也最值钱的东西。', {
    tags: ['oxygen-chain', 'metal'],
    stackable: false,
  }),
  mk('it.magnesium-ribbon', '镁条', 'material', 0.3, 0.15, '一卷未氧化的镁带。烧起来的亮度会在你的视网膜上留一分钟。', {
    tags: ['light-chain', 'metal', 'flammable'],
  }),
  mk('it.fuse-cord', '引信绳', 'material', 0.2, 0.02, '浸过硝的棉绳，燃速大约每秒一厘米。剪多长就是你有多少时间跑。', {
    tags: ['light-chain', 'fabric'],
  }),
  mk('it.paraffin', '石蜡块', 'material', 0.6, 0.02, '从食堂的封罐蜡上刮下来的。能烧，能封，能把字压在里面。', {
    tags: ['light-chain', 'anchor-chain'],
  }),
  mk('it.filament', '灯丝', 'material', 0.05, 0.01, '一小卷钨丝，装在纸包里。船上剩下的完好灯丝不超过二十根。', {
    tags: ['light-chain', 'metal', 'fragile'],
  }),
  mk('it.dry-cell', '干电池', 'material', 0.7, 0.2, '标称 6 伏，实测四伏半。外壳有一圈鼓起，说明它漏过。', {
    tags: ['light-chain', 'power'],
  }),
  mk('it.copper-wire', '铜线', 'material', 0.4, 0.3, '一扎剥了皮的铜线。船上任何还通电的东西都是靠它连着的。', {
    tags: ['light-chain', 'metal'],
  }),
  mk('it.tallow', '油脂', 'material', 0.9, 0.02, '厨房的牛脂，凝固了，表面一层灰。抹在金属上它不再响。', {
    tags: ['silence-chain', 'organic'],
    falseName: '人脂',
  }),
  mk('it.canvas-strip', '粗布条', 'material', 0.3, 0.01, '帆布撕成的条，边缘起毛。缠在什么上面都能让它闭嘴。', {
    tags: ['silence-chain', 'fabric'],
  }),
  mk('it.rubber-gasket', '橡胶垫', 'material', 0.35, 0.02, '舱门密封垫的一段，已经不弹了。踩在钢板上的时候它比你的鞋底好用。', {
    tags: ['silence-chain', 'rubber'],
  }),
  mk('it.sponge-block', '海绵块', 'material', 0.2, 0.01, '吸声用的开孔海绵，声呐室的墙上整片都是。撕一块下来没人会发现。', {
    tags: ['silence-chain'],
  }),
  mk('it.whale-fat', '鲸脂', 'material', 1.4, 0.03, '密封罐里的一块，标签写着"标本 · 勿食"。它已经不是标本了。', {
    tags: ['silence-chain', 'organic'],
    falseName: '婴儿的脂',
  }),
  mk('it.asbestos-cloth', '石棉布', 'material', 0.8, 0.04, '锅炉隔热用，纤维已经散开。它挡热 —— 也挡别人看见你的热。', {
    tags: ['silence-chain', 'fabric', 'heat-shield'],
    masks: { heat: 0.35 },
  }),
  mk('it.mirror-shard', '镜片', 'material', 0.25, 0.25, '医务室洗手台上的镜子碎片，边缘很利。镜子里的东西得和你对上才算数。', {
    tags: ['anchor-chain', 'glass', 'fragile'],
    falseName: '刀片',
  }),
  mk('it.photograph', '照片', 'material', 0.02, 0, '一张被水泡过的照片。你认得上面的人，但想不起来是在哪儿拍的。', {
    tags: ['anchor-chain', 'paper', 'personal'],
    stackable: false,
  }),
  mk('it.blood-bag', '血袋', 'material', 0.5, 0.05, 'O 型，医务室冷柜里的最后一袋。血型标签上的名字被划掉了。', {
    tags: ['anchor-chain', 'organic', 'medical'],
  }),
  mk('it.steel-wire', '钢丝', 'material', 0.5, 0.35, '直径两毫米的钢索，切段以后可以当绑扎、当弦、当绞索。', {
    tags: ['metal'],
  }),
  mk('it.hull-bolt', '船体螺栓', 'material', 0.45, 0.5, 'M16，带锈。它的重量集中在一头 —— 扔出去会响得很有说服力。', {
    tags: ['metal', 'throwable'],
    decoyChannel: 'sound',
  }),
  mk('it.pebble-pouch', '石子袋', 'material', 0.6, 0.15, '压载舱底捡的碎石，装在袜子里。全船最便宜的保命工具。', {
    tags: ['throwable'],
    decoyChannel: 'sound',
  }),
  mk('it.lead-weight', '铅块', 'material', 2.2, 0.3, '配重铅块，两公斤。能配重、能砸、能让你在水里沉下去。', {
    tags: ['metal', 'heavy'],
  }),
  mk('it.epoxy-resin', '环氧树脂', 'material', 0.6, 0.05, '双组分，A 管快见底了。三分钟凝固，凝固之后就不再是你的问题。', {
    tags: ['chemical', 'repair'],
  }),
  mk('it.solder-stick', '锡焊条', 'material', 0.3, 0.2, '铅锡合金条。没有烙铁也能用 —— 只要你有火。', {
    tags: ['metal', 'repair'],
  }),
  mk('it.phenol', '苯酚', 'material', 0.8, 0.05, '棕色瓶，标签腐蚀掉一半。碰到皮肤先是不痛，然后是白色。', {
    tags: ['chemical', 'corrosive'],
    falseName: '圣油',
  }),
  mk('it.rock-salt', '矿盐', 'material', 0.7, 0.08, '粗盐块。腌东西、除冰、做氧烛的稀释剂。船上到处都是。', {
    tags: ['chemical'],
  }),
  mk('it.bone-needle', '骨针', 'material', 0.03, 0.01, '削出来的针，长八厘米，磨得很细。医务室没有这种型号。', {
    tags: ['organic', 'precision'],
    falseName: '鱼刺',
  }),
  mk('it.hymn-page', '圣咏散页', 'material', 0.02, 0, '从一本厚册子上撕下来的一页，第四段。页边有指甲划出的节拍记号。', {
    tags: ['paper', 'ritual'],
  }),
  mk('it.candle-stub', '蜡烛头', 'material', 0.1, 0.01, '礼拜堂的烛台上取下来的，还剩三厘米。烧完大概是六十次呼吸。', {
    tags: ['light-chain'],
    light: 0.18,
  }),
  mk('it.gauze-roll', '纱布卷', 'material', 0.15, 0.01, '灭菌包装完好。这是这条船上少有的、还完全按设计工作的东西。', {
    tags: ['medical', 'fabric'],
  }),
];
