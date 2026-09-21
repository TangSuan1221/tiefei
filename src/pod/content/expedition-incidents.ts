import type { ExpeditionItem, ExpeditionRoom } from './expedition';

const INCIDENTS = [
  ['断开的拖救索', '筛机停转后留下的拖救痕迹。潜水服密封完整，乘员已无生命迹象。', '折弯的矿筛脱扣器'],
  ['未接回的呼吸管', '呼吸软管通向已关闭的供气阀。手套仍停在应急接头旁。', '供气阀检修接头'],
  ['隔热层下的乘员', '隔热毯与矿物沉积覆盖了潜水服，没有留下撤离记录。', '封口的热泉样管'],
  ['中断的转运', '翻倒的担架旁是一名未能转运的乘员。工具袋打开，医疗封包尚未拆封。', '未拆封的救援包'],
  ['断轴后的检修员', '破损护罩与脱落电缆留在检修员身旁；没有任何仍在活动的东西。', '断电锁扣'],
  ['失联的观测员', '面罩朝着声学接收器，安全系绳仍系在固定座上。黑水中没有可辨认的生物。', '离线声学记录芯'],
  ['气闸外的旧潜水服', '洁净密封件旁留下了磨损的潜水服和一名未完成交接的乘员。', '旧式压力校验环'],
] as const;

/** Optional evidence only: these grants are deliberately absent from all gates. */
export function createIncidentItems(index: number, rooms: ExpeditionRoom[]): ExpeditionItem[] {
  if (!Number.isInteger(index) || index < 0 || index > 6) throw new RangeError('Incident index must be 0–6');
  const prefix = `expedition.${index + 1}`, theme = INCIDENTS[index];
  const items: ExpeditionItem[] = [];
  for (let s = 0; s < 4; s++) {
    const stateNames = [INCIDENTS[index][0], '撤离后遗留的救援装备', '未完成遮盖的乘员', '空安全带与断裂系绳'];
    const stateDescriptions = [theme[1],
      `此处没有乘员。救援袋已打开，呼吸设备和胸前记录器留在地上；${theme[2]}属于这次中断的救援。`,
      `一名已无生命迹象的乘员被隔热布部分遮盖，密封头盔仍露在外面。胸前记录器留有${theme[0]}的后续记录。`,
      `此处没有乘员。安全带已经打开，系绳断端与卸下的记录器留在地上；不能据此判断穿戴者的去向。`];
    for (const record of [true, false]) {
      const room = rooms.find(r => r.id === `${prefix}.s${s}.r${record ? 3 : 4}`);
      if (!room) throw new Error(`Missing incident room: ${prefix}.s${s}`);
      if (room.width < 10 || room.depth < 10) throw new Error(`Incident room too small: ${room.id}`);
      const id = `${prefix}.s${s}.incident-${record ? 'record' : 'pickup'}`;
      items.push({ id, room: room.id, kind: record ? 'record' : 'pickup',
        name: record ? stateNames[s] : theme[2], description: record ? stateDescriptions[s] : '可回收的事故实物；仅留证，不消耗，也不影响通行。',
        grants: [id], x: record ? 3 : -3, z: -3 });
    }
  }
  return items;
}
