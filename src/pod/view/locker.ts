/** 摄像打捞台的箱内物资列表；艇内库存不在此处展示。 */
import { PALETTE, rgba } from '@/render/palette';
import { cjk, layoutCJK } from '@/ui/typography';
import { SUPPLIES, type SupplyId } from '../content/supplies';
import type { PodRun } from '../sim/run';
import { drawControls, drawPanel, HitMap, type Control } from './chrome';

const PAGE_SIZE = 5;
export function lockerItems(run: PodRun): SupplyId[] {
  return run.boxItems.filter(item => item.n > 0).map(item => item.id);
}
export function selectedSupply(run: PodRun): SupplyId | null {
  return run.selectedBoxItem;
}
export function lockerControls(run: PodRun): Control[] {
  const items = lockerItems(run);
  const id = selectedSupply(run);
  const start = Math.floor(Math.max(0, items.indexOf(id!)) / PAGE_SIZE) * PAGE_SIZE;
  const busy = run.arm.phase === 'hauling';
  return [
    ...items.slice(start, start + PAGE_SIZE).map(sid => ({
      id: `locker.select:${sid}`, key: '', label: SUPPLIES[sid].name,
      state: busy ? 'disabled' as const : sid === id ? 'active' as const : 'normal' as const,
    })),
    { id: 'locker.prev', key: '[', label: '上一件', state: !busy && items.length > 1 ? 'normal' : 'disabled' },
    { id: 'locker.next', key: ']', label: '下一件', state: !busy && items.length > 1 ? 'normal' : 'disabled' },
    { id: 'box.retrieve', key: '', label: '收回',
      hint: busy ? '正在取回所选物资' : id ? `${SUPPLIES[id].name} ×1` : '空臂收回',
      state: run.armBlock('retract') === 'ok' ? 'active' : 'disabled' },
  ];
}
export function performLockerControl(run: PodRun, action: string): boolean {
  const control = lockerControls(run).find(c => c.id === action);
  if (!control || control.state === 'disabled' || run.at !== 'camera') return false;
  if (action.startsWith('locker.select:')) {
    run.selectBoxItem(action.slice('locker.select:'.length) as SupplyId);
    return true;
  }
  const items = lockerItems(run);
  if (action === 'locker.prev' || action === 'locker.next') {
    const delta = action === 'locker.prev' ? -1 : 1;
    run.selectBoxItem(items[(items.indexOf(selectedSupply(run)!) + delta + items.length) % items.length]!);
    return true;
  }
  if (action === 'box.retrieve') { run.retractArm(); return true; }
  return false;
}
export function drawLocker(
  ctx: CanvasRenderingContext2D, run: PodRun, hits: HitMap,
  x: number, y: number, w: number, h: number, hovered: string | null, time: number,
): void {
  drawPanel(ctx, x, y, w, h, h);
  const pad = w * 0.06, width = w - 2 * pad, left = x + pad;
  const controls = lockerControls(run);
  const items = run.boxItems;
  const selected = selectedSupply(run);
  const start = Math.floor(Math.max(0, items.findIndex(item => item.id === selected)) / PAGE_SIZE) * PAGE_SIZE;
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = rgba(PALETTE.ember, 0.95);
  ctx.font = cjk(h * 0.033, 600);
  ctx.fillText('当前箱子 / 物资', left, y + h * 0.05, width);
  ctx.font = cjk(h * 0.025, 400);
  ctx.fillText(run.searchedBox ? `箱内剩余 ${items.reduce((n, item) => n + item.n, 0)} 件` : '尚未翻找箱子', left, y + h * 0.095, width);
  items.slice(start, start + PAGE_SIZE).forEach((item, i) => {
    const rowY = y + h * (0.135 + i * 0.064);
    const action = `locker.select:${item.id}`;
    const active = item.id === selected;
    ctx.fillStyle = rgba(active ? PALETTE.rustDeep : PALETTE.steelDark, 0.8);
    ctx.fillRect(left, rowY, width, h * 0.059);
    if (run.arm.phase !== 'hauling') hits.add({ id: action, x: left, y: rowY, w: width, h: h * 0.059 });
    ctx.fillStyle = rgba(active || hovered === action ? PALETTE.ember : PALETTE.bone, 0.95);
    ctx.font = cjk(h * 0.027, active ? 600 : 400);
    ctx.fillText(`${active ? '› ' : ''}${SUPPLIES[item.id].name} ×${item.n}`, left + pad * 0.3, rowY + h * 0.037, width - pad);
  });
  ctx.fillStyle = rgba(PALETTE.boneDim, 0.95);
  ctx.font = cjk(h * 0.025, 400);
  const details = selected ? SUPPLIES[selected].desc : run.searchedBox ? '箱子已空。可以收回机械臂。' : '对准箱子，伸出臂后点击翻找，即可查看箱内物资。';
  layoutCJK(ctx, details, width).slice(0, 4).forEach((line, i) => ctx.fillText(line, left, y + h * (0.49 + i * 0.031)));
  drawControls(ctx, hits, left, y + h * 0.64, width, h * 0.08, controls.filter(c => c.id === 'locker.prev' || c.id === 'locker.next'), hovered, time);
  drawControls(ctx, hits, left, y + h * 0.74, width, h * 0.11, controls.filter(c => c.id === 'box.retrieve'), hovered, time);
  ctx.font = cjk(h * 0.023, 400);
  const hint = run.arm.phase === 'hauling' ? '收回到位后，所选物资才进入艇内。' : '每次收回一件；其余物资保留在箱内。';
  layoutCJK(ctx, hint, width).forEach((line, i) => ctx.fillText(line, left, y + h * (0.9 + i * 0.03)));
  ctx.restore();
}
