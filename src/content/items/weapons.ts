/**
 * 武器。
 *
 * 全船的武器按"伤害 / 噪音"划成两派：
 *   - 铁器（斧、管、扳手）伤害高、噪音高、响度高 —— 用它等于宣布你的位置；
 *   - 刃器与消音改装件伤害低、噪音低 —— 它们是给"不想被听见"的玩家留的路。
 * 所以武器选择不是数值选择，是**要不要被听见**的选择。
 */

import { mk, type GameItem } from './helpers';

export const WEAPONS: readonly GameItem[] = [
  mk('it.dive-knife', '潜水刀', 'weapon', 0.6, 0.2, '不锈钢刃，刀背有锯齿。它不是为了杀人设计的，但它做得很好。', {
    tags: ['blade', 'quiet', 'melee'],
    durability: 50,
    power: 6,
    pierce: 2,
    noise: 3,
    stackable: false,
  }),
  mk('it.honed-knife', '磨利的潜水刀', 'weapon', 0.6, 0.2, '刃口重新开过，能刮下指甲上的一层。它现在能切进腱里而不带走别的东西。', {
    tags: ['blade', 'quiet', 'melee', 'precision', 'crafted'],
    durability: 40,
    power: 9,
    pierce: 4,
    noise: 3,
    stackable: false,
  }),
  mk('it.fire-axe', '消防斧', 'weapon', 3.8, 1.2, '斧刃朝下拖在地上会划出一道。它是全船最好的武器，也是最响的。', {
    tags: ['metal', 'melee', 'heavy', 'loud'],
    durability: 55,
    power: 16,
    pierce: 3,
    noise: 26,
    stackable: false,
  }),
  mk('it.iron-pipe', '铁管', 'weapon', 2.1, 0.9, '一段一寸半的水管，断口不齐。它在钢板上敲一下，整层甲板都会回头。', {
    tags: ['metal', 'melee', 'loud'],
    durability: 60,
    power: 10,
    noise: 20,
    stackable: false,
  }),
  mk('it.muffled-pipe', '消音铁管', 'weapon', 2.4, 0.15, '同一段水管，缠了五层布和一层油脂。打起来闷，像打在湿沙袋上。', {
    tags: ['melee', 'quiet', 'crafted'],
    durability: 34,
    power: 9,
    noise: 5,
    stackable: false,
  }),
  mk('it.speargun', '鱼枪', 'weapon', 2.2, 0.5, '橡筋式，标尺三米。上弦的时候会吱一声，那一声比发射还响。', {
    tags: ['ranged', 'quiet', 'metal'],
    durability: 28,
    power: 13,
    pierce: 5,
    noise: 7,
    stackable: false,
  }),
  mk('it.spear-bolt', '鱼枪箭', 'weapon', 0.3, 0.25, '不锈钢箭，倒钩可拆。回收一次就少一根倒钩。', {
    tags: ['ammo', 'metal'],
    stackable: true,
  }),
  mk('it.heavy-bolt', '重弩箭', 'weapon', 0.5, 0.3, '把船体螺栓焊在箭杆上做出来的。飞得不直，但能穿透拟态层。', {
    tags: ['ammo', 'metal', 'crafted'],
    pierce: 9,
    stackable: true,
  }),
  mk('it.harpoon', '鱼叉', 'weapon', 2.9, 0.65, '两米的手持叉，三齿。它的用途不是杀，是把东西钉在原地。', {
    tags: ['metal', 'melee', 'pin'],
    durability: 30,
    power: 11,
    pierce: 4,
    noise: 12,
    stackable: false,
  }),
  mk('it.tethered-harpoon', '系索鱼叉', 'weapon', 3.4, 0.7, '叉尾系了十五米缆。钉住以后你可以选择拉近它，或者把自己拉开。', {
    tags: ['metal', 'melee', 'pin', 'crafted'],
    durability: 26,
    power: 11,
    pierce: 5,
    noise: 12,
    stackable: false,
  }),
  mk('it.service-revolver', '制式左轮', 'weapon', 1.1, 0.35, '六发，弹巢里有四发。艇长的配枪 —— 按规定它该锁在舰桥保险柜里。', {
    tags: ['firearm', 'ranged', 'loud', 'metal'],
    durability: 100,
    power: 24,
    pierce: 6,
    noise: 44,
    stackable: false,
  }),
  mk('it.revolver-round', '左轮子弹', 'weapon', 0.04, 0.05, '.38，铜壳发绿。四发。你会把它们数到不想再数。', {
    tags: ['ammo', 'metal'],
    stackable: true,
  }),
  mk('it.flare-pistol', '信号枪', 'weapon', 0.9, 0.3, '单发信号枪。它的用途写在名字里：让所有人都看见你。', {
    tags: ['firearm', 'ranged', 'light', 'loud'],
    durability: 20,
    power: 8,
    noise: 34,
    light: 0.9,
    stackable: false,
  }),
  mk('it.ritual-knife', '教团礼刀', 'weapon', 0.45, 0.18, '刃很短，柄很长，柄上缠的不是皮。它是为了划自己设计的，握法是反的。', {
    tags: ['blade', 'quiet', 'ritual', 'melee'],
    durability: 45,
    power: 7,
    pierce: 3,
    noise: 3,
    stackable: false,
    falseName: '开信刀',
  }),
  mk('it.mallet', '铅头锤', 'weapon', 2.6, 0.7, '铅头不会打出火花，所以它被允许带进燃料舱。它也不会反弹。', {
    tags: ['metal', 'melee', 'blunt'],
    durability: 70,
    power: 12,
    noise: 17,
    stackable: false,
  }),
  mk('it.cable-whip', '缆索鞭', 'weapon', 1.4, 0.55, '一段末端散股的钢索。抽出去会带走一层皮，收回来会带走你自己的一层。', {
    tags: ['metal', 'melee', 'crafted'],
    durability: 22,
    power: 8,
    noise: 9,
    stackable: false,
  }),
  mk('it.bone-file', '骨锉', 'weapon', 0.35, 0.15, '医务室的骨锉，齿间还嵌着东西。它是唯一能在不发出噪音的情况下破坏装甲的工具。', {
    tags: ['precision', 'quiet', 'armor-break'],
    durability: 18,
    power: 4,
    pierce: 7,
    noise: 4,
    stackable: false,
  }),
];
