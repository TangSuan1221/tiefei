/**
 * 物品内容的构造助手。
 *
 * 关键字段是 `loudness`（响度）而不是 `noise`（使用噪音）：
 *   - noise    = 你**用**它的时候有多响；
 *   - loudness = 你**背**着它走路的时候有多响。
 * 第二个字段才是让背包管理变成决策的东西 —— 一把消防斧不用也会出卖你。
 */

import type { ID, ItemDef } from '../../core/contract';
import type { ItemExtra } from '../../encounter/types';

export interface GameItem extends ItemDef, ItemExtra {}

export function mk(
  id: ID,
  name: string,
  kind: ItemDef['kind'],
  weight: number,
  loudness: number,
  description: string,
  opt: Partial<Omit<GameItem, 'id' | 'name' | 'kind' | 'weight' | 'loudness' | 'description'>> = {},
): GameItem {
  return {
    id,
    name,
    kind,
    weight,
    loudness,
    description,
    stackable: opt.stackable ?? (kind === 'material' || kind === 'consumable'),
    tags: opt.tags ?? [],
    falseName: opt.falseName,
    noise: opt.noise,
    durability: opt.durability,
    onUse: opt.onUse,
    masks: opt.masks,
    decoyChannel: opt.decoyChannel,
    power: opt.power,
    pierce: opt.pierce,
    light: opt.light,
  };
}
