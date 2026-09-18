/**
 * 跨模块引用清单。
 *
 * 叙事内容会引用别的 Agent 拥有的 ID（道具、实体、遭遇、状态、门、音效 cue）。
 * 这些 ID 在 Agent C 这边没有定义体，所以在这里**登记**，由 tools/validate-content.ts
 * 校验"叙事只引用登记过的外部 ID"。等对应模块落地后，把这张表和它们的注册表对一遍即可。
 *
 * 这不是占位符，是接口清单。每一项都写明用途。
 */

export interface ExternalRef {
  id: string;
  /** 由谁拥有 */
  owner: 'items' | 'bestiary' | 'encounter' | 'sim' | 'world' | 'audio' | 'game' | 'narrative';
  note: string;
}

/** 叙事引用到的道具 ID */
export const ITEM_REFS: readonly ExternalRef[] = [
  { id: 'nameplate', owner: 'items', note: '铺位牌。上面刻着你的名字，但笔画的深度不对。' },
  { id: 'manifest', owner: 'items', note: '船员名单，十九人，没有小孩。' },
  { id: 'tape.mother', owner: 'items', note: '一盘磁带。三十七秒，反复的一句家常话。' },
  { id: 'logbook.vance', owner: 'items', note: '万斯的值班簿。最后三页的字迹越来越工整。' },
  { id: 'hymnal', owner: 'items', note: '唱诗本。曲谱下面是坐标。' },
  { id: 'keycard.dorn', owner: 'items', note: '大副钥匙卡。多恩不会给你，只会让你自己拿。' },
  { id: 'relic.tongue', owner: 'items', note: '圣物室里的那件东西。教团管它叫"舌"。' },
  { id: 'chart.zero', owner: 'items', note: '一张多画了一个舱的图纸。' },
  { id: 'welder', owner: 'items', note: '焊枪。焊死月池要用它。' },
  { id: 'wrench', owner: 'items', note: '管钳。也可以用来敲管道回话。' },
  { id: 'scalpel', owner: 'items', note: '医务室的刀。尸检、割绳、割自己都用它。' },
  { id: 'mirror', owner: 'items', note: '锚定物三件之一。' },
  { id: 'photo', owner: 'items', note: '锚定物三件之一。照片上的人比你记得的年轻。' },
  { id: 'earwax', owner: 'items', note: '蜡。塞住耳朵，代价是听不见它，也听不见自己。' },
  { id: 'oil.corpse', owner: 'items', note: '尸油。掩盖气味，留下 flesh 标记。' },
  { id: 'whistle.pelle', owner: 'items', note: '一枚铁哨。佩勒说这是他的，但他不肯说从哪来的。' },
  { id: 'valve-handle', owner: 'items', note: '阀门摇把。压载与淹没都要它。' },
  { id: 'lime', owner: 'items', note: '碱石灰。制氧链的第一环。' },
  { id: 'magnesium', owner: 'items', note: '镁条。一次性强光。巨大噪音。' },
  { id: 'tooth', owner: 'items', note: '一颗牙。零号舱里捡到的，是你的。' },
  { id: 'rebreather', owner: 'items', note: '从月池绳子上拉起来的空呼吸器。带子是扣好的。' },
  { id: 'sedative', owner: 'items', note: '镇静剂。医务室里唯一被领空的药。' },
  { id: 'otoscope', owner: 'items', note: '耳镜。十九套里的一套，刻着编号。' },
  { id: 'clapper', owner: 'items', note: '铜钟的钟舌。被人卸下来用干布包好，等最后一个。' },
  { id: 'pen.warm', owner: 'items', note: '空白页里夹的那支笔。永远是温的。' },
  { id: 'consent.blank', owner: 'items', note: '空白同意书。只差签名，边角被捏软了。' },
];

/** 结局解锁的元进度 ID（game 层的 meta 存档） */
export const META_REFS: readonly ExternalRef[] = [
  { id: 'meta.first-exit', owner: 'game', note: '第一次逃出。解锁开局可选携带一件锚定物。' },
  { id: 'meta.weld', owner: 'game', note: '缄默结局。解锁开局知道补板在哪。' },
  { id: 'meta.apostasy', owner: 'game', note: '叛教结局。解锁圣物室的门不再需要仪式锁。' },
  { id: 'meta.hymn', owner: 'game', note: '入会结局。解锁点名表，可在 UI 里看到自己的编号。' },
  { id: 'meta.trunk-plug', owner: 'game', note: '铁肺结局。解锁维生总管的第二十个接口。' },
  { id: 'meta.zero-berth', owner: 'game', note: '零号结局。解锁零号舱在图纸上的位置。' },
  { id: 'meta.pen', owner: 'game', note: '真结局。解锁"停笔"：任何一轮都可以在月池停手。' },
  { id: 'meta.eighth-column', owner: 'game', note: '真结局。解锁记录表第八栏的表头，从此它有名字。' },
];

/** 叙事引用到的敌人定义 ID */
export const ENTITY_REFS: readonly ExternalRef[] = [
  { id: 'ent.listener', owner: 'bestiary', note: 'THE LISTENER。永不完整出现。' },
  { id: 'ent.choir-body', owner: 'bestiary', note: '唱诗班的一具。被打断唱段时站起来。' },
  { id: 'ent.crawler', owner: 'bestiary', note: '管道里的东西。佩勒管它叫"邻居"。' },
];

/** 叙事触发的遭遇 ID */
export const ENCOUNTER_REFS: readonly ExternalRef[] = [
  { id: 'enc.listener-stalk', owner: 'encounter', note: '噪音超阈值后的潜行相。' },
  { id: 'enc.choir-rise', owner: 'encounter', note: '打断合唱的代价。' },
  { id: 'enc.crawler-pipe', owner: 'encounter', note: '爬行管道中的遭遇。' },
  { id: 'enc.hymn-hunter', owner: 'encounter', note: '主动声呐打了两次之后。它知道你在数。' },
];

/** 叙事施加的状态效果 ID */
export const STATUS_REFS: readonly ExternalRef[] = [
  { id: 'status.ringing', owner: 'sim', note: '耳鸣。听不清门后的声音。' },
  { id: 'status.communion', owner: 'sim', note: '共鸣。仪式后的持续 SAN 漂移。' },
  { id: 'status.iron-lung', owner: 'sim', note: '接入船体维生后的氧气托管。' },
  { id: 'status.marked', owner: 'sim', note: '被标记。Listener 更容易找到你。' },
  { id: 'status.cold-witness', owner: 'sim', note: '目击后的低温与迟钝。' },
  { id: 'status.anchored', owner: 'sim', note: '锚定生效期间抵抗 Veracity。' },
  { id: 'status.humming', owner: 'sim', note: '你在无意识地跟着唱。噪音持续外溢。' },
  { id: 'status.bleeding', owner: 'sim', note: '割了自己之后。' },
];

/** 叙事解锁的门 ID */
export const DOOR_REFS: readonly ExternalRef[] = [
  { id: 'door.archive', owner: 'world', note: '档案室。知识锁。' },
  { id: 'door.reliquary', owner: 'world', note: '圣物室。仪式锁。' },
  { id: 'door.moonpool', owner: 'world', note: '月池。终局。' },
  { id: 'door.zero', owner: 'world', note: '零号舱。图纸上没有。' },
  { id: 'door.dorn-cabin', owner: 'world', note: '大副舱。钥匙卡锁。' },
];

/** 叙事请求的程序化音效 cue */
export const SFX_REFS: readonly ExternalRef[] = [
  { id: 'radio.squelch', owner: 'audio', note: '无线电静噪开合。' },
  { id: 'radio.carrier', owner: 'audio', note: '载波底噪，无人说话时的那层。' },
  { id: 'hull.groan', owner: 'audio', note: '船体应力。' },
  { id: 'hull.tick', owner: 'audio', note: '金属冷缩的单点。' },
  { id: 'water.rise', owner: 'audio', note: '水位上升。' },
  { id: 'water.drip', owner: 'audio', note: '单滴。用来数。' },
  { id: 'breath.own', owner: 'audio', note: '你自己的呼吸，被放大。' },
  { id: 'breath.other', owner: 'audio', note: '另一份呼吸，与你同步。' },
  { id: 'choir.unison', owner: 'audio', note: '六声齐唱。' },
  { id: 'choir.break', owner: 'audio', note: '合唱断在半个音上。' },
  { id: 'pipe.knock', owner: 'audio', note: '管道敲击。可数。' },
  { id: 'pelle.hum', owner: 'audio', note: '小孩哼歌，音高偏低半音。' },
  { id: 'mother.tone', owner: 'audio', note: '广播系统的提示音。' },
  { id: 'tape.hiss', owner: 'audio', note: '磁带底噪。' },
  { id: 'tape.splice', owner: 'audio', note: '剪接处的那一下"咔"。' },
  { id: 'ritual.bell', owner: 'audio', note: '仪式钟。' },
  { id: 'ritual.drown', owner: 'audio', note: '水灌进面罩。' },
  { id: 'chair.creak', owner: 'audio', note: '椅子。多恩动了一下。' },
  { id: 'rope.strain', owner: 'audio', note: '绳子受力。' },
  { id: 'weld.arc', owner: 'audio', note: '焊枪起弧。' },
  { id: 'pen.scratch', owner: 'audio', note: '笔尖划过纸。' },
  { id: 'sonar.return', owner: 'audio', note: '回波返回。' },
  { id: 'sonar.extra', owner: 'audio', note: '多出来的一次回波。' },
  { id: 'silence.total', owner: 'audio', note: '所有音床停止。最贵的一个 cue。' },
  { id: 'door.weld-cool', owner: 'audio', note: '焊缝冷却。' },
  { id: 'listener.near', owner: 'audio', note: '它在隔壁。' },
  { id: 'teeth.count', owner: 'audio', note: '牙齿碰撞。' },
  { id: 'lamp.filament', owner: 'audio', note: '灯丝。' },
  { id: 'pump.reverse', owner: 'audio', note: '泵在反向排水。低频抽吸，节律不齐。' },
  { id: 'sonar.paper', owner: 'audio', note: '声呐走纸机一格一格地吐。' },
  { id: 'sonar.ping', owner: 'audio', note: '主动声呐。全船都听得见，这是最贵的一次出声。' },
  { id: 'water.still', owner: 'audio', note: '平得像玻璃的水面。近乎无声，只有极低的空腔共鸣。' },
  { id: 'water.ring', owner: 'audio', note: '水面起圈。圈心不在你脚下。' },
  { id: 'water.swallow', owner: 'audio', note: '水灌进喉咙的那一下。' },
  { id: 'deep.answer', owner: 'audio', note: '下面回了一下。比船体应力更低、更短。' },
  { id: 'deep.hum', owner: 'audio', note: '断电之后才听得见的那个低频。一直都在。' },
  { id: 'bell.dead', owner: 'audio', note: '拉钟绳，没有响。只有绳子和铜壁的摩擦。' },
  { id: 'bell.real', owner: 'audio', note: '装回钟舌之后的那一声。整条船都听见了，包括外面。' },
  { id: 'light.hum', owner: 'audio', note: '礼拜堂照明合闸。镇流器的嗡声。' },
  { id: 'metal.drag', owner: 'audio', note: '补板在甲板上拖动。' },
  { id: 'trunk.hiss', owner: 'audio', note: '维生总管的接口漏气。' },
  { id: 'rack.close', owner: 'audio', note: '零号舱的架子合上。衬布被拉平的声音。' },
  { id: 'pod.release', owner: 'audio', note: '逃生舱释放机构。爆栓。' },
  { id: 'pod.ascend', owner: 'audio', note: '上浮。水压从外壳上一层层松开。' },
  { id: 'pen.stop', owner: 'audio', note: '笔尖停在纸上不动的那种安静。' },
];

/**
 * 由引擎或别的 Agent 写入、叙事内容只读的旗标。
 * 校验器不会把它们报成"读了但没人写"。
 */
export const EXTERNAL_FLAGS: readonly ExternalRef[] = [
  { id: 'count.cycle', owner: 'game', note: '当前轮回编号，game 层在 run 开始时写入。' },
  { id: 'count.knowledge', owner: 'narrative', note: 'NarrativeEngine.syncKnowledgeFlags 维护。' },
  { id: 'count.knowledge-canon', owner: 'narrative', note: '同上。正典知识持有数。' },
  { id: 'count.truth-layer', owner: 'narrative', note: '同上。已抵达的最深真相层 0..5。' },
  { id: 'count.cycles-witnessed', owner: 'narrative', note: '同上。贡献过新知识的轮回数。' },
  { id: 'count.lies-swallowed', owner: 'narrative', note: 'lie 门控被吞下的次数，引擎维护。' },
];

export const ITEM_IDS: ReadonlySet<string> = new Set(ITEM_REFS.map((r) => r.id));
export const ENTITY_IDS: ReadonlySet<string> = new Set(ENTITY_REFS.map((r) => r.id));
export const ENCOUNTER_IDS: ReadonlySet<string> = new Set(ENCOUNTER_REFS.map((r) => r.id));
export const STATUS_IDS: ReadonlySet<string> = new Set(STATUS_REFS.map((r) => r.id));
export const DOOR_IDS: ReadonlySet<string> = new Set(DOOR_REFS.map((r) => r.id));
export const SFX_IDS: ReadonlySet<string> = new Set(SFX_REFS.map((r) => r.id));
export const EXTERNAL_FLAG_IDS: ReadonlySet<string> = new Set(EXTERNAL_FLAGS.map((r) => r.id));
export const META_IDS: ReadonlySet<string> = new Set(META_REFS.map((r) => r.id));
