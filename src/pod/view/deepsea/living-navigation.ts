import type { NavigationConsole, PassiveContact, SoundRecord } from '../../sim/authored-site';
import type { PodRun } from '../../sim/run';
import type { Control } from '../chrome';
import type { CreatureType } from '../../content/living-deck-layout';
import type { PassiveContact as CreatureContact } from '../../sim/living-creatures';
import { drawSonarOwnship, sonarHeading } from '../sonar-ownship';
import { formatCoords } from '../../sim/site-coords';

export interface LivingNavigationHost {
  run: PodRun;
  position: { x: number; y: number; z: number };
  readonly datum: number;
  /** Creature sources audible on the passive array; bearings are relative to the hull, never ranges. */
  contacts(): CreatureContact[];
  drawActive(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  readonly waypointCatalog: readonly { position: readonly [number, number, number]; name: string; detail: string }[];
}

const BINS = 120, ROWS = 48, F0 = 35, F1 = 45, LOCK_SECONDS = .45;
const BEARINGS = ['前方', '右前方', '右舷', '右后方', '后方', '左后方', '左舷', '左前方'];
export const LIVING_TYPE_CN: Record<CreatureType, string> = { lumen: '趋光者', shade: '避光者', blind: '盲猎者', swarm: '玻璃鱼群' };
const FORM: Record<CreatureType, { unknown: string; known: string }> = {
  lumen: { unknown: '低频窄带嗡鸣 · 缓慢摆动', known: '趋光者 · 低频嗡鸣，随灯光靠拢' },
  shade: { unknown: '中频周期涌动 · 宽带起伏', known: '避光者 · 涌动声，强光下收缩' },
  blind: { unknown: '高频成串咔嗒 · 竖向脉冲', known: '盲猎者 · 侧线咔嗒，追声音' },
  swarm: { unknown: '高频细碎嘶声 · 散点', known: '玻璃鱼群 · 无害，扑灯' },
};

/** Level-two receiver: passive bearings from the deck's fauna, waypoint entry, and active sonar from the site. */
export class LivingNavigation implements NavigationConsole {
  readonly autoReceive = true;
  readonly editing = false;
  radioRecords: SoundRecord[] = [];
  passiveContacts: PassiveContact[] = [];
  passiveFocus: { contact: PassiveContact | null; held: number; locked: boolean } = { contact: null, held: 0, locked: false };
  frequency = 37.8;
  target: number[] | null = null;
  waypoints: number[][] = [];
  markerHits: { index: number; x: number; y: number; r: number }[] = [];
  private rows: Float32Array[] = [];
  private clock = 0;
  private sampleClock = 0;
  private sample = 0;
  private loggedAt = new Map<string, number>();
  private types = new Map<string, CreatureType>();
  constructor(private readonly host: LivingNavigationHost) {}
  get passiveRows() { return this.rows; }
  get pendingRadioCount() { return 0; }
  get receivedCoordinates() { return '−1层生活区 · 基地中继无信号 · 被动阵列常开'; }
  recordDialogue(text: string) { if (text && this.radioRecords.at(-1)?.text !== text) this.radioRecords.push({ text, frequency: this.frequency, at: this.clock, kind: 'voice' }); }
  private label(relative: number) { return BEARINGS[Math.round((((relative % 360) + 360) % 360) / 45) % 8]!; }
  private buildContacts(): PassiveContact[] {
    const out: PassiveContact[] = [];
    this.types.clear();
    for (const c of this.host.contacts()) {
      this.types.set(c.id, c.type);
      out.push({ id: c.id, kind: c.identified ? 'bio' : 'unknown', label: c.identified ? LIVING_TYPE_CN[c.type] : '???', form: c.identified ? FORM[c.type].known : FORM[c.type].unknown,
        frequency: c.frequency, width: c.type === 'swarm' ? 1.1 : c.type === 'blind' ? .45 : .6, intensity: Math.min(.95, .2 + c.intensity * .9), bearing: this.label(c.bearing) });
    }
    const run = this.host.run;
    if (run.sonarEmitting) out.push({ id: 'self', kind: 'self', label: '本艇主动脉冲', form: '44kHz 周期横条 · 自噪声', frequency: 44.2, width: .6, intensity: .8, bearing: '本艇' });
    return out;
  }
  private updateFocus(dt: number) {
    let c: PassiveContact | null = null;
    for (const x of this.passiveContacts) if (x.kind !== 'self' && Math.abs(this.frequency - x.frequency) <= Math.max(.32, x.width) && (!c || x.intensity > c.intensity)) c = x;
    const prev = this.passiveFocus.contact;
    const held = c && prev && prev.id === c.id ? this.passiveFocus.held + dt : 0;
    const locked = !!c && held >= LOCK_SECONDS;
    this.passiveFocus = { contact: c, held, locked };
    if (!locked || !c) return;
    const last = this.loggedAt.get(c.id); if (last !== undefined && this.clock - last < 90) return;
    this.loggedAt.set(c.id, this.clock);
    const text = c.kind === 'unknown'
      ? `未登记声纹：${c.form}。大致方位：${c.bearing}。被动声纳不提供距离，需摄影核验后才能登记。`
      : `${c.label}：${c.form}。大致方位：${c.bearing}。`;
    this.radioRecords.push({ text, frequency: c.frequency, at: this.clock, kind: c.kind, label: c.label });
  }
  setFrequency(value: number) { if (Number.isFinite(value)) this.frequency = Math.max(35, Math.min(45, value)); }
  setWaypoint(value: number[]) {
    if (value.length !== 3 || !value.every(Number.isFinite) || value.some(v => Math.abs(v) > 10000)) return false;
    if (!this.waypoints.some(w => this.same(w, value))) { this.waypoints.push([...value]); if (this.waypoints.length > 8) this.waypoints.shift(); }
    this.target = [...value]; return true;
  }
  selectWaypoint(index: number) { const w = this.waypoints[index]; if (!w) return false; this.target = [...w]; return true; }
  analyzeSignal() {
    const c = this.passiveFocus.contact;
    if (!c) return null;
    return { kind: c.kind === 'unknown' ? '未登记声纹' : c.label, text: `${c.form}。大致方位：${c.bearing}。只有方位，没有距离。` };
  }
  reply() { return false; }
  controls(): Control[] { return []; }
  action(_id: string) { return false; }
  key(_key: string) { return false; }
  tick(dt: number) {
    dt = Number.isFinite(dt) ? Math.max(0, dt) : 0; this.clock += dt;
    this.passiveContacts = this.buildContacts();
    this.updateFocus(dt);
    this.sampleClock += dt;
    if (this.sampleClock < .35) return;
    this.sampleClock %= .35; this.sample++;
    this.rows.unshift(this.spectrumRow()); this.rows.length = Math.min(ROWS, this.rows.length);
  }
  /** Model spectrum (not audio FFT): one band and texture per source type, no range or obstacle data. */
  private spectrumRow() {
    const n = this.sample, row = new Float32Array(BINS);
    const rnd = (a: number, b = 0) => { const v = Math.sin(a * 127.1 + b * 311.7 + n * 74.7) * 43758.5453; return v - Math.floor(v); };
    const add = (f: number, width: number, amp: number) => { for (let i = 0; i < BINS; i++) { const fi = F0 + (i + .5) * (F1 - F0) / BINS; row[i] += amp * Math.exp(-(((fi - f) / width) ** 2)); } };
    for (let i = 0; i < BINS; i++) row[i] = .03 + .05 * rnd(i);
    for (const c of this.passiveContacts) {
      const type = this.types.get(c.id), a = c.intensity;
      if (c.kind === 'self') { if (n % 9 === 0) { for (let f = 43.4; f < 45; f += .1) add(f, .08, .42); for (let i = 0; i < BINS; i++) row[i] += .06; } continue; }
      if (type === 'lumen') add(c.frequency + .18 * Math.sin(n * .21 + c.frequency), .14, .6 * a);
      else if (type === 'shade') { const swell = .5 + .5 * Math.sin(n * .55 + c.frequency); add(c.frequency, .55, .5 * a * swell); }
      else if (type === 'blind') { if (rnd(c.frequency, 3) < .35 + a * .4) for (let f = c.frequency - .9; f < c.frequency + .9; f += .1) add(f, .06, .38 * a); add(c.frequency, .1, .2 * a); }
      else for (let k = 0; k < 6; k++) add(c.frequency + (rnd(k, c.frequency) - .5) * 1.6, .06, (.18 + .25 * rnd(k, 5)) * a);
    }
    for (let i = 0; i < BINS; i++) row[i] = Math.min(.95, row[i]!);
    return row;
  }
  drawWaterfall(ctx: CanvasRenderingContext2D, w: number, h: number, caption = true, amber = false) {
    ctx.save(); ctx.fillStyle = amber ? '#120c04' : '#071817'; ctx.fillRect(0, 0, w, h);
    const phosphor = amber ? '255,178,72' : '122,225,153';
    for (let row = 0; row < this.rows.length; row++) { const r = this.rows[row]!; for (let col = 0; col < r.length; col++) { ctx.fillStyle = `rgba(${phosphor},${r[col]})`; ctx.fillRect(col * w / r.length, row * h / ROWS, w / r.length + .5, h / ROWS + .5); } }
    if (caption) { ctx.fillStyle = '#abcaba'; ctx.font = `${Math.max(11, h * .075)}px "Microsoft YaHei"`; ctx.fillText(this.passiveContacts.some(c => c.kind !== 'self') ? '被动接收 · 只有方位，没有距离' : '被动接收常开 · 暂无声源', 8, h - 8); }
    ctx.restore();
  }
  private same(a: readonly number[], b: readonly number[]) { return a.every((v, i) => Math.abs(v - b[i]!) < .05); }
  describeWaypoint(v: readonly number[]) {
    const known = this.host.waypointCatalog.find(p => Math.hypot(p.position[0] - v[0]!, p.position[2] - v[2]!) <= 1.5 && Math.abs(p.position[1] - v[1]!) <= 1.5);
    if (known) return { name: known.name, detail: known.detail };
    const n = this.waypoints.findIndex(w => this.same(w, v)) + 1;
    return { name: `自定义航点 ${n || this.waypoints.length + 1}`, detail: '未登记设施 · 仅作惯导参考，不代表回波或障碍。' };
  }
  private markerAt(v: readonly number[], cx: number, cy: number, radius: number) {
    const dx = v[0]! - this.host.position.x, dz = v[2]! - this.host.position.z;
    const a = Math.atan2(dx, -dz) - this.host.run.heading * Math.PI / 180, distance = Math.hypot(dx, dz), d = Math.min(1, distance / 24);
    return { a, distance, outside: distance > 24, x: cx + Math.sin(a) * radius * d, y: cy - Math.cos(a) * radius * d };
  }
  drawActive(ctx: CanvasRenderingContext2D, w: number, h: number, panel = true) {
    this.markerHits = [];
    if (!this.host.run.powered || !this.host.run.activeSonarEnabled) return;
    ctx.save(); this.host.drawActive(ctx, w, h);
    const size = Math.min(w, h / .93), cx = size / 2, cy = size * .48, radius = size * .30;
    this.waypoints.forEach((v, index) => {
      const m = this.markerAt(v, cx, cy, radius), active = !!this.target && this.same(v, this.target);
      ctx.save();
      if (active) { ctx.strokeStyle = '#63fff1'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(m.x, m.y); ctx.stroke(); ctx.setLineDash([]); }
      ctx.translate(m.x, m.y);
      const s = active ? 12 : 8;
      if (m.outside) { ctx.rotate(m.a); ctx.beginPath(); ctx.moveTo(0, -s - 1); ctx.lineTo(s - 1, s * .75); ctx.lineTo(0, s / 3); ctx.lineTo(1 - s, s * .75); }
      else { ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0); }
      ctx.closePath();
      if (active) { ctx.fillStyle = '#63fff1'; ctx.strokeStyle = '#031719'; ctx.lineWidth = 5; ctx.stroke(); ctx.fill(); }
      else { ctx.strokeStyle = '#7fd8cf'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = 'rgba(3,23,25,.75)'; ctx.fill(); }
      if (!m.outside) { ctx.fillStyle = active ? '#031719' : '#bff7f0'; ctx.font = `bold ${active ? 11 : 9}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(index + 1), 0, 1); }
      ctx.restore();
      this.markerHits.push({ index, x: m.x, y: m.y, r: 16 });
    });
    drawSonarOwnship(ctx, cx, cy, 12);
    if (panel) this.drawWaypointPanel(ctx, size + 8, 0, Math.max(50, w - size - 12), h);
    ctx.restore();
  }
  drawWaypointPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, _h: number) {
    ctx.save(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    let cy = y + 20;
    const line = (value: string, font = 15, color = '#63fff1', bold = true, gap = 1.45) => {
      ctx.font = `${bold ? 'bold ' : ''}${font}px "Microsoft YaHei"`; ctx.fillStyle = color;
      let row = '';
      for (const ch of value) { if (ctx.measureText(row + ch).width > w && row) { ctx.fillText(row, x, cy); cy += font * gap; row = ch; } else row += ch; }
      if (row) { ctx.fillText(row, x, cy); cy += font * gap; }
    };
    line(`艇首 ↑ ${sonarHeading(this.host.run.heading)}`, 13, '#e9fff2', false);
    if (!this.target) { line('尚未写入航点', 15, '#adc7b5'); line('用下方 X / Y / DEPTH 输入坐标后写入。', 12, '#adc7b5', false); ctx.restore(); return; }
    const t = this.target, info = this.describeWaypoint(t), m = this.markerAt(t, 0, 0, 1);
    const relative = ((m.a * 180 / Math.PI + 540) % 360) - 180, depthDelta = t[1]! - this.host.position.y;
    const arrived = m.distance <= 2.5 && Math.abs(depthDelta) <= 1;
    cy += 4; ctx.fillStyle = '#092b2e'; ctx.fillRect(x - 6, cy - 16, w + 10, 2); cy += 8;
    line(`◆ ${this.waypoints.findIndex(v => this.same(v, t)) + 1} · ${info.name}`, 18, '#63fff1');
    line(info.detail, 13, '#cfe9df', false, 1.4);
    cy += 4; line(formatCoords(t, this.host.datum), 14, '#e9fff2');
    line(`水平距离 ${m.distance.toFixed(1)} m`, 15);
    line(arrived ? '位置到达 · Shift 制动' : Math.abs(relative) < 3 ? '艇首已对准' : `${relative < 0 ? '左转' : '右转'} ${Math.abs(relative).toFixed(0)}°（按住 ${relative < 0 ? 'J' : 'L'}）`, 17);
    line(Math.abs(depthDelta) > 1 ? `${depthDelta > 0 ? '上浮' : '下潜'} ${Math.abs(depthDelta).toFixed(1)} m（PageUp / PageDown）` : m.outside ? '超出量程 · 沿边缘箭头' : '深度吻合', 14);
    line(this.waypoints.length > 1 ? `已存 ${this.waypoints.length} 个航点 · 点击声纳图中的菱形切换` : '惯导指引 · 非障碍回波', 12, '#adc7b5', false);
    ctx.restore();
  }
  /** Few short lines for a small physical screen: the active waypoint, range, turn and depth change. */
  waypointBrief() {
    if (!this.target) return { title: '尚未写入航点', lines: ['用下方键盘输入坐标'] };
    const t = this.target, info = this.describeWaypoint(t), m = this.markerAt(t, 0, 0, 1);
    const relative = ((m.a * 180 / Math.PI + 540) % 360) - 180, depthDelta = t[1]! - this.host.position.y;
    const arrived = m.distance <= 2.5 && Math.abs(depthDelta) <= 1;
    return { title: `◆${this.waypoints.findIndex(v => this.same(v, t)) + 1} ${info.name}`, lines: [
      `距离 ${m.distance.toFixed(1)} m`,
      arrived ? '已到达 · Shift 制动' : Math.abs(relative) < 3 ? '艇首已对准' : `${relative < 0 ? '左转' : '右转'} ${Math.abs(relative).toFixed(0)}°`,
      Math.abs(depthDelta) > 1 ? `${depthDelta > 0 ? '上浮' : '下潜'} ${Math.abs(depthDelta).toFixed(1)} m` : m.outside ? '超出量程' : '深度吻合',
    ] };
  }
  draw(ctx: CanvasRenderingContext2D, w: number, h: number) { this.drawActive(ctx, w, h); }
  snapshot() { return { clock: this.clock, frequency: this.frequency, target: this.target ? [...this.target] : null, waypoints: this.waypoints.map(w => [...w]), radioRecords: structuredClone(this.radioRecords) }; }
  static validateSnapshot(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const s = value as ReturnType<LivingNavigation['snapshot']>;
    if (!Number.isFinite(s.clock) || s.clock < 0 || !Number.isFinite(s.frequency) || s.frequency < 35 || s.frequency > 45) return false;
    if (s.target !== null && (!Array.isArray(s.target) || s.target.length !== 3 || !s.target.every(Number.isFinite))) return false;
    if (!Array.isArray(s.waypoints) || s.waypoints.length > 8 || s.waypoints.some(w => !Array.isArray(w) || w.length !== 3 || !w.every(Number.isFinite))) return false;
    return Array.isArray(s.radioRecords) && s.radioRecords.every(r => !!r && typeof r.text === 'string' && Number.isFinite(r.frequency));
  }
  restore(value: unknown) {
    if (!LivingNavigation.validateSnapshot(value)) return false;
    const s = value as ReturnType<LivingNavigation['snapshot']>;
    this.clock = s.clock; this.setFrequency(s.frequency); this.target = s.target ? [...s.target] : null;
    this.waypoints = s.waypoints.map(w => [...w]); this.radioRecords = structuredClone(s.radioRecords);
    this.rows = []; this.loggedAt.clear(); this.passiveFocus = { contact: null, held: 0, locked: false };
    return true;
  }
}
