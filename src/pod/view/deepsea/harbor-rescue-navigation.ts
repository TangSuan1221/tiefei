import type { NavigationConsole } from '../../sim/authored-site';
import type { PodRun } from '../../sim/run';
import type { Control } from '../chrome';
import { drawSonarOwnship, sonarHeading } from '../sonar-ownship';
import { formatCoords } from '../../sim/site-coords';

export type HarborCoordinates = readonly [number, number, number];
export interface HarborRescueNavigationHost {
  run: PodRun;
  position: { x: number; y: number; z: number };
  readonly signalAvailable: boolean;
  readonly phase: string;
  entryCoordinates: HarborCoordinates;
  photoCoordinates: HarborCoordinates;
  signalPosition?: HarborCoordinates;
  /** Callbacks own first-play/reply dialogue and progression. */
  onHeard(): void;
  onReply(): boolean;
  drawActive(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  speak?(text: string): void;
  photoGuidance?(): {ready:boolean;text:string;detail:string};
  distressText?: string;
  readonly canReply?:boolean;
  readonly photoCoordinatesReleased?:boolean;
  readonly serialDialogue?:boolean;
  targetReached?(target:readonly number[]):boolean;
  /** Facilities whose coordinates get a name and description on the nav screen. */
  readonly waypointCatalog?: readonly {position:HarborCoordinates;name:string;detail:string}[];
}

/** Formal harbor receiver: passive carrier gating is independent of active power. */
export class HarborRescueNavigation implements NavigationConsole {
  readonly autoReceive=true;
  isDelivering=false;
  radioRecords:{text:string;frequency:number}[]=[];
  private radioQueue:{text:string;frequency:number;initial:boolean}[]=[];
  private radioSerial=0;
  private tuneLock=0;
  private playbackLeft=0;
  get pendingRadioCount(){return this.radioQueue.length;}
  recordDialogue(text:string){if(this.radioRecords.at(-1)?.text!==text)this.radioRecords.push({text,frequency:this.frequency});}
  clearPending(){this.radioQueue=[];this.playbackLeft=0;this.tuneLock=0;}
  enqueueRadio(text:string,initial=false){
    const frequency=[38.4,41.2,36.6,43.3,39.7][this.radioSerial++%5];
    this.radioQueue.push({text,frequency,initial});
  }
  private receiveRadio(dt:number){
    this.playbackLeft=Math.max(0,this.playbackLeft-dt);
    if(this.host.signalAvailable&&!this.heard&&!this.radioQueue.some(r=>r.initial))this.enqueueRadio('艾里亚斯：有人收到吗？我是接驳港维修员艾里亚斯。我被困在断桥另一边。请回答。',true);
    const next=this.radioQueue[0];
    if(!next||this.playbackLeft>0||Math.abs(this.frequency-next.frequency)>.32){this.tuneLock=0;return;}
    this.tuneLock+=dt;if(this.tuneLock<.45)return;this.tuneLock=0;
    this.radioQueue.shift();this.radioRecords.push({text:next.text,frequency:next.frequency});
    this.playbackLeft=Math.max(7,Math.min(28,next.text.length*.16));
    this.isDelivering=true;
    try{if(next.initial&&!this.heard){this.captured=true;this.heard=true;this.host.onHeard();}else this.host.speak?.(next.text);}finally{this.isDelivering=false;}
    if(!this.host.serialDialogue&&typeof window!=='undefined'&&'speechSynthesis' in window){const voice=new SpeechSynthesisUtterance(next.text);voice.lang='zh-CN';window.speechSynthesis.cancel();window.speechSynthesis.speak(voice);}
  }
  editing = false;
  frequency = 37.8;
  captured = false;
  heard = false;
  replied = false;
  target: number[] | null = null;
  /** Every written waypoint stays on the sonar until the list exceeds eight. */
  waypoints: number[][] = [];
  private rows: number[][] = [];
  private sampleClock = 0;
  private sample = 0;
  constructor(private readonly host: HarborRescueNavigationHost) {}
  private coordinates(v: readonly number[]) { return formatCoords(v); }
  get receivedCoordinates() {
    return `万斯 · 接驳港 ${this.coordinates(this.host.entryCoordinates)}` +
      ((this.host.photoCoordinatesReleased??this.replied) ? `   艾里亚斯 · 拍摄点 ${this.coordinates(this.host.photoCoordinates)}` : '');
  }
  private get recording() {
    return this.host.distressText ?? '艾里亚斯：有人收到吗？我是接驳港的艾里亚斯。我被困在断桥对岸，回路快断了。收到请回答。';
  }
  get bearingLabel() {
    if (!this.host.signalAvailable || !this.host.signalPosition) return '方位未知';
    const [x, , z] = this.host.signalPosition, p = this.host.position;
    const bearing = (Math.atan2(x - p.x, -(z - p.z)) * 180 / Math.PI - this.host.run.heading + 720) % 360;
    return ['前方', '右前方', '右舷', '右后方', '后方', '左后方', '左舷', '左前方'][Math.round(bearing / 45) % 8];
  }
  setFrequency(value: number) { if (Number.isFinite(value)) this.frequency = Math.max(35, Math.min(45, value)); }
  setWaypoint(value: number[]) {
    if (value.length !== 3 || !value.every(Number.isFinite) || value.some(v => Math.abs(v) > 10000)) return false;
    if (!this.waypoints.some(w => this.same(w, value))) {this.waypoints.push([...value]);if (this.waypoints.length > 8) this.waypoints.shift();}
    this.target = [...value];
    return true;
  }
  analyzeSignal() {
    if (!this.host.signalAvailable || Math.abs(this.frequency - 38.4) > .65) return null;
    this.captured = true;
    return { kind: '固定水声通信 / 人声', text: `固定通信设备送来的间歇求救载波，大致来自${this.bearingLabel}。播放录存后，通过麦克风应答。`, recording: this.recording };
  }
  reply() {
    if (!this.heard || !(this.host.canReply??!this.replied)) return false;
    if (!this.host.onReply()) return false;
    this.replied = true;
    return true;
  }
  controls(): Control[] { return []; }
  key(_key: string) { return false; }
  action(id: string) {
    if (id !== 'port.play' || !this.captured) return false;
    if(this.host.serialDialogue)return false; // Received lines are read in history; replay must not advance or interleave the live conversation.
    if (!this.heard) { this.heard = true; this.host.onHeard(); }
    else if (this.host.speak) this.host.speak(this.recording);
    else { this.host.run.storyCaption = this.recording; this.host.run.storyCaptionLeft = 12; }
    return true;
  }
  tick(dt: number) {
    this.receiveRadio(Math.max(0,dt));
    this.sampleClock += Math.max(0, dt);
    if (this.sampleClock < .35) return;
    this.sampleClock %= .35;
    this.sample++;
    // Model spectrum, not claimed to be audio FFT; no distance or obstacle data.
    const signal = this.radioQueue.length>0;
    const carrier=this.radioQueue[0]?.frequency??38.4;
    this.rows.unshift(Array.from({ length: 72 }, (_, i) => {
      const f = 35 + i * 10 / 72;
      const floor = .025 + .055 * (.5 + .5 * Math.sin(i * 17.17 + this.sample * 3.1));
      return Math.min(.92, floor + (signal ? .63 * Math.exp(-(((f - carrier - .07*Math.sin(this.sample*2.3)) / .22) ** 2)) * (.82 + .18 * Math.sin(this.sample * .7) ** 2) : 0));
    }));
    this.rows.length = Math.min(48, this.rows.length);
  }
  drawWaterfall(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.save();ctx.fillStyle = '#071817';ctx.fillRect(0, 0, w, h);
    for (let row = 0; row < this.rows.length; row++) for (let col = 0; col < 72; col++) {
      ctx.fillStyle = `rgba(122,225,153,${this.rows[row][col]})`;
      ctx.fillRect(col * w / 72, row * h / 48, w / 72 + .5, h / 48 + .5);
    }
    ctx.fillStyle = '#abcaba';ctx.font = `${Math.max(11, h * .075)}px "Microsoft YaHei"`;
    ctx.fillText(this.pendingRadioCount ? `新录音 ${this.pendingRadioCount} · 调频自动接收` : '被动接收常开 · 暂无清晰载波', 8, h - 8);
    ctx.restore();
  }
  private same(a: readonly number[], b: readonly number[]) { return a.every((v, i) => Math.abs(v - b[i]!) < .05); }
  /** Registered facility name for a waypoint, or a numbered custom label. */
  describeWaypoint(v: readonly number[]) {
    const known = this.host.waypointCatalog?.find(p => Math.hypot(p.position[0] - v[0]!, p.position[2] - v[2]!) <= 1.5 && Math.abs(p.position[1] - v[1]!) <= 1.5);
    if (known) return { name: known.name, detail: known.detail };
    const n = this.waypoints.findIndex(w => this.same(w, v)) + 1;
    return { name: `自定义航点 ${n || this.waypoints.length + 1}`, detail: '未登记设施 · 仅作惯导参考，不代表回波或障碍。' };
  }
  selectWaypoint(index: number) {
    const w = this.waypoints[index];if (!w) return false;
    this.target = [...w];return true;
  }
  private markerAt(v: readonly number[], cx: number, cy: number, radius: number) {
    const dx = v[0]! - this.host.position.x, dz = v[2]! - this.host.position.z;
    const a = Math.atan2(dx, -dz) - this.host.run.heading * Math.PI / 180, distance = Math.hypot(dx, dz), d = Math.min(1, distance / 24);
    return { a, distance, outside: distance > 24, x: cx + Math.sin(a) * radius * d, y: cy - Math.cos(a) * radius * d };
  }
  /** Draws the sonar picture; `panel=false` lets a caller draw the info panel unscaled via `drawWaypointPanel`. */
  drawActive(ctx: CanvasRenderingContext2D, w: number, h: number, panel = true) {
    this.markerHits = [];
    if (!this.host.run.powered || !this.host.run.activeSonarEnabled) return;
    ctx.save();this.host.drawActive(ctx, w, h);
    // Match PodExpedition's dedicated head-up sonar layout and 24 m range.
    const size = Math.min(w, h / .93), cx = size / 2, cy = size * .48, radius = size * .30;
    // Inertial navigation is cyan; terrain echoes retain their amber palette.
    // Off-range waypoints sit on the rim as arrows rather than implying a measured return.
    this.waypoints.forEach((v, index) => {
      const m = this.markerAt(v, cx, cy, radius), active = !!this.target && this.same(v, this.target);
      ctx.save();
      if (active) {ctx.strokeStyle = '#63fff1';ctx.lineWidth = 2;ctx.setLineDash([5, 5]);ctx.beginPath();ctx.moveTo(cx, cy);ctx.lineTo(m.x, m.y);ctx.stroke();ctx.setLineDash([]);}
      ctx.translate(m.x, m.y);
      const s = active ? 12 : 8;
      if (m.outside) {ctx.rotate(m.a);ctx.beginPath();ctx.moveTo(0, -s - 1);ctx.lineTo(s - 1, s * .75);ctx.lineTo(0, s / 3);ctx.lineTo(1 - s, s * .75);}
      else {ctx.beginPath();ctx.moveTo(0, -s);ctx.lineTo(s, 0);ctx.lineTo(0, s);ctx.lineTo(-s, 0);}
      ctx.closePath();
      if (active) {ctx.fillStyle = '#63fff1';ctx.strokeStyle = '#031719';ctx.lineWidth = 5;ctx.stroke();ctx.fill();}
      else {ctx.strokeStyle = '#7fd8cf';ctx.lineWidth = 2;ctx.stroke();ctx.fillStyle = 'rgba(3,23,25,.75)';ctx.fill();}
      if (!m.outside) {ctx.fillStyle = active ? '#031719' : '#bff7f0';ctx.font = `bold ${active ? 11 : 9}px monospace`;ctx.textAlign = 'center';ctx.textBaseline = 'middle';ctx.fillText(String(index + 1), 0, 1);}
      ctx.restore();
      this.markerHits.push({ index, x: m.x, y: m.y, r: 16 });
    });
    drawSonarOwnship(ctx, cx, cy, 12);
    if (panel) this.drawWaypointPanel(ctx, size + 8, 0, Math.max(50, w - size - 12), h);
    ctx.restore();
  }
  /** Hit circles of the waypoint markers, in the coordinates `drawActive` was given. */
  markerHits: { index: number; x: number; y: number; r: number }[] = [];
  /** Name, description and guidance for the active waypoint, plus the stored list. */
  drawWaypointPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.save();ctx.textAlign = 'left';ctx.textBaseline = 'alphabetic';
    let cy = y + 20;
    const line = (value: string, font = 15, color = '#63fff1', bold = true, gap = 1.45) => {
      ctx.font = `${bold ? 'bold ' : ''}${font}px "Microsoft YaHei"`;ctx.fillStyle = color;
      let row = '';
      for (const ch of value) {if (ctx.measureText(row + ch).width > w && row) {ctx.fillText(row, x, cy);cy += font * gap;row = ch;} else row += ch;}
      if (row) {ctx.fillText(row, x, cy);cy += font * gap;}
    };
    line(`艇首 ↑ ${sonarHeading(this.host.run.heading)}`, 13, '#e9fff2', false);
    if (!this.target) {
      line('尚未写入航点', 15, '#adc7b5');
      line('用下方 X / Y / DEPTH 输入坐标后写入。', 12, '#adc7b5', false);
      ctx.restore();return;
    }
    const t = this.target, info = this.describeWaypoint(t);
    const m = this.markerAt(t, 0, 0, 1);
    const relative = ((m.a * 180 / Math.PI + 540) % 360) - 180;
    const photoTarget = this.replied && [this.host.photoCoordinates, [77, 1, 7]].some(p => p.every((v, i) => Math.abs(v - t[i]!) < .1));
    const arrived = (m.distance <= 2.5 && Math.abs(t[1]! - this.host.position.y) <= 1) || !!this.host.targetReached?.(t);
    const guidance = photoTarget && arrived ? this.host.photoGuidance?.() : undefined;
    const depthDelta = t[1]! - this.host.position.y;
    cy += 4;ctx.fillStyle = '#092b2e';ctx.fillRect(x - 6, cy - 16, w + 10, 2);cy += 8;
    line(`◆ ${this.waypoints.findIndex(v => this.same(v, t)) + 1} · ${info.name}`, 18, '#63fff1');
    line(info.detail, 13, '#cfe9df', false, 1.4);
    cy += 4;
    line(formatCoords(t), 14, '#e9fff2');
    line(`水平距离 ${m.distance.toFixed(1)} m`, 15);
    line(arrived ? (guidance ? '已到拍摄区 · 按曝光' : '位置到达 · Shift 制动') : Math.abs(relative) < 3 ? '艇首已对准' : `${relative < 0 ? '左转' : '右转'} ${Math.abs(relative).toFixed(0)}°`, 17);
    line(Math.abs(depthDelta) > 1 ? `${depthDelta > 0 ? '上浮' : '下潜'} ${Math.abs(depthDelta).toFixed(1)} m（PageUp / PageDown）` : m.outside ? '超出量程 · 沿边缘箭头' : '深度吻合', 14);
    if (guidance) {line(guidance.ready ? '目标在画内 · 可曝光取证' : '可自由曝光 · 目标未确认', 14);line(guidance.detail, 12, '#e9fff2', false);}
    if (this.waypoints.length > 1) {cy += 6;line(`已存 ${this.waypoints.length} 个航点 · 点击声纳图中的菱形切换`, 12, '#adc7b5', false);}
    else line('惯导指引 · 非障碍回波', 12, '#adc7b5', false);
    ctx.restore();
  }
  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    this.drawActive(ctx, w, h);
  }
  snapshot() { return { radioQueue:structuredClone(this.radioQueue),radioRecords:structuredClone(this.radioRecords),radioSerial:this.radioSerial, frequency: this.frequency, captured: this.captured, heard: this.heard, replied: this.replied, target: this.target ? [...this.target] : null, waypoints: this.waypoints.map(w => [...w]) }; }
  static validateSnapshot(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const s = value as ReturnType<HarborRescueNavigation['snapshot']>;
    if (!Number.isFinite(s.frequency) || typeof s.captured !== 'boolean' || typeof s.heard !== 'boolean' || typeof s.replied !== 'boolean') return false;
    if (s.target !== null && (!Array.isArray(s.target) || s.target.length !== 3 || !s.target.every(Number.isFinite))) return false;
    if (s.frequency < 35 || s.frequency > 45 || (s.heard && !s.captured) || (s.replied && !s.heard)) return false;
    if(s.radioQueue!==undefined&&(!Array.isArray(s.radioQueue)||s.radioQueue.some(r=>!r||typeof r.text!=='string'||!Number.isFinite(r.frequency)||r.frequency<35||r.frequency>45||typeof r.initial!=='boolean')))return false;
    if(s.radioRecords!==undefined&&(!Array.isArray(s.radioRecords)||s.radioRecords.some(r=>!r||typeof r.text!=='string'||!Number.isFinite(r.frequency))))return false;
    if(s.radioSerial!==undefined&&(!Number.isInteger(s.radioSerial)||s.radioSerial<0))return false;
    if(s.waypoints!==undefined&&(!Array.isArray(s.waypoints)||s.waypoints.length>8||s.waypoints.some(w=>!Array.isArray(w)||w.length!==3||!w.every(Number.isFinite))))return false;
    return true;
  }
  restore(value: unknown) {
    if (!HarborRescueNavigation.validateSnapshot(value)) return false;
    const s = value as ReturnType<HarborRescueNavigation['snapshot']>;
    this.setFrequency(s.frequency);this.captured = s.captured;this.heard = s.heard;this.replied = s.replied;
    this.target = s.target ? [...s.target] : null;this.rows = [];
    this.waypoints = s.waypoints ? s.waypoints.map(w => [...w]) : this.target ? [[...this.target]] : [];
    this.radioQueue=structuredClone(s.radioQueue??[]);this.radioRecords=structuredClone(s.radioRecords??[]);this.radioSerial=s.radioSerial??this.radioRecords.length;this.tuneLock=0;this.playbackLeft=0;
    return true;
  }
}



