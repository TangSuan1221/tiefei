import type { NavigationConsole, PassiveContact, SoundRecord } from '../../sim/authored-site';
import {isAudioMuted} from '../../../audio/mute';
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
  entrySource?:string;
  readonly canReply?:boolean;
  readonly photoCoordinatesReleased?:boolean;
  readonly serialDialogue?:boolean;
  targetReached?(target:readonly number[]):boolean;
  /** Facilities whose coordinates get a name and description on the nav screen. */
  readonly waypointCatalog?: readonly {position:HarborCoordinates;name:string;detail:string}[];
  /** Unregistered acoustic source; only its sound reaches the passive array. */
  readonly monster?: {readonly position:{x:number;y:number;z:number};readonly hunting:boolean;readonly awake?:boolean};
}

/** Horizontal metres within which the distress carrier condenses into a lockable band. */
export const VOICE_CAPTURE_RANGE=24;
const BINS=120,ROWS=48,F0=35,F1=45;
const MONSTER_RANGE=30;
const LOCK_SECONDS=.45;

/** Formal harbor receiver: passive carrier gating is independent of active power. */
export class HarborRescueNavigation implements NavigationConsole {
  readonly autoReceive=true;
  isDelivering=false;
  radioRecords:SoundRecord[]=[];
  private radioQueue:{text:string;frequency:number;initial:boolean}[]=[];
  private radioSerial=0;
  private tuneLock=0;
  private playbackLeft=0;
  private clock=0;
  passiveContacts:PassiveContact[]=[];
  passiveFocus:{contact:PassiveContact|null;held:number;locked:boolean}={contact:null,held:0,locked:false};
  private loggedAt=new Map<string,number>();
  get pendingRadioCount(){return this.radioQueue.length;}
  get passiveRows(){return this.rows;}
  recordDialogue(text:string){if(this.radioRecords.at(-1)?.text!==text)this.radioRecords.push({text,frequency:this.frequency,at:this.clock,kind:'voice'});}
  private horizontalDistance(p:{x:number;z:number}){return Math.hypot(p.x-this.host.position.x,p.z-this.host.position.z);}
  /** Within capture range the distress carrier is a coherent band; beyond it only scattered energy arrives. */
  get voiceClear(){const p=this.host.signalPosition;return !p||this.horizontalDistance({x:p[0],z:p[2]})<=VOICE_CAPTURE_RANGE;}
  private bearingTo(x:number,z:number){
    const p=this.host.position,bearing=(Math.atan2(x-p.x,-(z-p.z))*180/Math.PI-this.host.run.heading+720)%360;
    return ['前方','右前方','右舷','右后方','后方','左后方','左舷','左前方'][Math.round(bearing/45)%8]!;
  }
  /** Fixed far-field azimuth: fauna passes outside the harbour walls, never inside the level. */
  private bearingFromAzimuth(azimuth:number){return ['前方','右前方','右舷','右后方','后方','左后方','左舷','左前方'][Math.round(((azimuth-this.host.run.heading)%360+360)%360/45)%8]!;}
  private buildContacts():PassiveContact[]{
    const out:PassiveContact[]=[],t=this.clock;
    const head=this.radioQueue[0];
    if(head&&this.host.signalAvailable){
      const clear=this.voiceClear;
      out.push(clear
        ?{id:'voice',kind:'voice',label:'人声',form:'窄带断续竖线 · 语音调制',frequency:head.frequency,width:.32,intensity:.85,bearing:this.bearingLabel}
        :{id:'voice',kind:'scatter',label:'散乱载波',form:'离散噪点 · 无法收拢',frequency:head.frequency,width:2.2,intensity:.5,bearing:this.bearingLabel});
    }
    const m=this.host.monster;
    if(m&&m.awake!==false){const d=this.horizontalDistance(m.position);if(d<MONSTER_RANGE){
      const near=1-d/MONSTER_RANGE;
      out.push({id:'unknown',kind:'unknown',label:'???',form:'低频宽带 · 不规则横向刮擦',frequency:36.3+.25*Math.sin(t*.13),width:.6,intensity:Math.min(.9,.22+near*.7+(m.hunting?.15:0)),bearing:this.bearingTo(m.position.x,m.position.z)});
    }}
    if(t%140<45)out.push({id:'beaked-whale',kind:'bio',label:'柯氏喙鲸',form:'斜向调频上扫 · 成串咔嗒',frequency:42.1,width:1.9,intensity:.45,bearing:this.bearingFromAzimuth(70)});
    const run=this.host.run;
    if(run.powered&&run.activeSonarEnabled&&run.sonarPulseEnabled)out.push({id:'self',kind:'self',label:'本艇主动脉冲',form:'44kHz 周期横条 · 自噪声',frequency:44.2,width:.6,intensity:.8,bearing:'本艇'});
    return out;
  }
  private focusContact(){
    let best:PassiveContact|null=null;
    for(const c of this.passiveContacts)if(Math.abs(this.frequency-c.frequency)<=Math.max(.32,c.width)&&(!best||c.intensity>best.intensity))best=c;
    return best;
  }
  private updateFocus(dt:number){
    const c=this.focusContact(),prev=this.passiveFocus.contact;
    const held=c&&prev&&prev.id===c.id&&prev.kind===c.kind?this.passiveFocus.held+dt:0;
    const locked=!!c&&c.kind!=='scatter'&&held>=LOCK_SECONDS;
    this.passiveFocus={contact:c,held,locked};
    if(!locked||!c||(c.kind!=='unknown'&&c.kind!=='bio'))return;
    const last=this.loggedAt.get(c.id);if(last!==undefined&&this.clock-last<90)return;
    this.loggedAt.set(c.id,this.clock);
    const text=c.kind==='unknown'
      ?`未登记声纹。低频宽带摩擦，夹杂不规则刮擦，节律不像机械。大致方位：${c.bearing}。被动声纳不提供距离，需摄影确认。`
      :`柯氏喙鲸回声定位：成串调频上扫咔嗒，深潜觅食的正常海洋生物。大致方位：${c.bearing}。`;
    this.radioRecords.push({text,frequency:this.frequency,at:this.clock,kind:c.kind,label:c.label});
  }
  clearPending(){this.radioQueue=[];this.playbackLeft=0;this.tuneLock=0;}
  enqueueRadio(text:string,initial=false){
    const frequency=[38.4,41.2,36.6,43.3,39.7][this.radioSerial++%5];
    this.radioQueue.push({text,frequency,initial});
  }
  private receiveRadio(dt:number){
    this.playbackLeft=Math.max(0,this.playbackLeft-dt);
    if(this.host.signalAvailable&&!this.heard&&!this.radioQueue.some(r=>r.initial))this.enqueueRadio('艾里亚斯：（录音。每隔九十秒，残余蓄电池让一台泵空转三秒，录音就卡在这三秒里）……泵站七，艾里亚斯，修泵的。一个人，断桥对面。……听见请回。小声。',true);
    const next=this.radioQueue[0];
    // No in-cabin tuner any more: a clear carrier is received on its own once it has held for LOCK_SECONDS.
    if(!next||this.playbackLeft>0||!this.voiceClear){this.tuneLock=0;return;}
    this.tuneLock+=dt;if(this.tuneLock<LOCK_SECONDS)return;this.tuneLock=0;
    this.radioQueue.shift();this.radioRecords.push({text:next.text,frequency:next.frequency,at:this.clock,kind:'voice'});
    this.playbackLeft=Math.max(7,Math.min(28,next.text.length*.16));
    this.isDelivering=true;
    try{if(next.initial&&!this.heard){this.captured=true;this.heard=true;this.host.onHeard();}else this.host.speak?.(next.text);}finally{this.isDelivering=false;}
    if(!isAudioMuted()&&!this.host.serialDialogue&&typeof window!=='undefined'&&'speechSynthesis' in window){const voice=new SpeechSynthesisUtterance(next.text);voice.lang='zh-CN';window.speechSynthesis.cancel();window.speechSynthesis.speak(voice);}
  }
  editing = false;
  frequency = 37.8;
  captured = false;
  heard = false;
  replied = false;
  target: number[] | null = null;
  /** Every written waypoint stays on the sonar until the list exceeds eight. */
  waypoints: number[][] = [];
  private rows: Float32Array[] = [];
  private sampleClock = 0;
  private sample = 0;
  constructor(private readonly host: HarborRescueNavigationHost) {}
  private coordinates(v: readonly number[]) { return formatCoords(v); }
  get receivedCoordinates() {
    return `${this.host.entrySource??'万斯'} · 接驳港 ${this.coordinates(this.host.entryCoordinates)}` +
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
    dt=Math.max(0,dt);this.clock+=dt;
    this.passiveContacts=this.buildContacts();
    this.updateFocus(dt);
    this.receiveRadio(dt);
    this.sampleClock += dt;
    if (this.sampleClock < .35) return;
    this.sampleClock %= .35;
    this.sample++;
    this.rows.unshift(this.spectrumRow());
    this.rows.length = Math.min(ROWS, this.rows.length);
  }
  /** Model spectrum, not claimed to be audio FFT; no distance or obstacle data. Each source has its own band and shape. */
  private spectrumRow(){
    const n=this.sample,row=new Float32Array(BINS);
    const rnd=(a:number,b=0)=>{const v=Math.sin(a*127.1+b*311.7+n*74.7)*43758.5453;return v-Math.floor(v);};
    const add=(f:number,width:number,amp:number)=>{for(let i=0;i<BINS;i++){const fi=F0+(i+.5)*(F1-F0)/BINS;row[i]+=amp*Math.exp(-(((fi-f)/width)**2));}};
    for(let i=0;i<BINS;i++)row[i]=.03+.05*rnd(i);
    for(const c of this.passiveContacts){
      if(c.kind==='voice'){
        // Syllables gate the carrier on and off, leaving a dashed vertical trace with faint sidebands.
        const syllable=Math.sin(n*1.7)+Math.sin(n*.63)>-.4?1:.18;
        add(c.frequency+.05*Math.sin(n*2.3),.16,.72*syllable);add(c.frequency-.62,.12,.22*syllable);add(c.frequency+.62,.12,.22*syllable);
      }else if(c.kind==='scatter'){
        for(let k=0;k<7;k++)add(c.frequency+(rnd(k,9)-.5)*2*c.width,.07,.25+.3*rnd(k,3));
      }else if(c.kind==='unknown'){
        add(c.frequency+(rnd(5,7)-.5)*.5,c.width*(.8+.4*rnd(6)),.55*c.intensity);
        if(rnd(8,8)<(this.host.monster?.hunting?.38:.14))for(let f=35.2;f<38.2;f+=.12)add(f,.09,.32*c.intensity*(.5+rnd(f*10,2)));
      }else if(c.kind==='bio'){
        // Successive rows step up in frequency: repeating diagonal upsweeps.
        const phase=(n%9)/9;add(40.3+3.6*phase,.12,.5*c.intensity/.45*(rnd(2,4)>.2?1:.3));
      }else if(c.kind==='self'&&n%9===0){
        for(let f=43.4;f<45;f+=.1)add(f,.08,.42);
        for(let i=0;i<BINS;i++)row[i]+=.06;
      }
    }
    for(let i=0;i<BINS;i++)row[i]=Math.min(.95,row[i]!);
    return row;
  }
  drawWaterfall(ctx: CanvasRenderingContext2D, w: number, h: number, caption=true, amber=false) {
    ctx.save();ctx.fillStyle = amber?'#120c04':'#071817';ctx.fillRect(0, 0, w, h);
    const phosphor=amber?'255,178,72':'122,225,153';
    for (let row = 0; row < this.rows.length; row++) {const r=this.rows[row]!;for (let col = 0; col < r.length; col++) {
      ctx.fillStyle = `rgba(${phosphor},${r[col]})`;
      ctx.fillRect(col * w / r.length, row * h / ROWS, w / r.length + .5, h / ROWS + .5);
    }}
    if(caption){
      ctx.fillStyle = '#abcaba';ctx.font = `${Math.max(11, h * .075)}px "Microsoft YaHei"`;
      const scatter=this.passiveContacts.some(c=>c.kind==='scatter');
      ctx.fillText(scatter?'载波散乱 · 向声源方位接近':this.pendingRadioCount ? `新录音 ${this.pendingRadioCount} · 自动接收` : '被动接收常开 · 暂无清晰载波', 8, h - 8);
    }
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
  deleteSelectedWaypoint(): boolean {
    const index = this.target ? this.waypoints.findIndex(w => this.same(w, this.target!)) : -1;
    if (index < 0) return false;
    this.waypoints.splice(index, 1);
    const next = this.waypoints[Math.min(index, this.waypoints.length - 1)];
    this.target = next ? [...next] : null;
    this.markerHits = [];
    return true;
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
    if (!this.host.run.powered) return;
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
  /** Few short lines for a small physical screen: the active waypoint, range, turn and depth change. */
  waypointBrief() {
    if (!this.target) return { title: '尚未写入航点', lines: ['用下方键盘输入坐标'] };
    const t = this.target, info = this.describeWaypoint(t), m = this.markerAt(t, 0, 0, 1);
    const relative = ((m.a * 180 / Math.PI + 540) % 360) - 180, depthDelta = t[1]! - this.host.position.y;
    const photoTarget = this.replied && [this.host.photoCoordinates, [77, 1, 7]].some(p => p.every((v, i) => Math.abs(v - t[i]!) < .1));
    const arrived = (m.distance <= 2.5 && Math.abs(depthDelta) <= 1) || !!this.host.targetReached?.(t);
    const guidance = photoTarget && arrived ? this.host.photoGuidance?.() : undefined;
    return { title: `◆${this.waypoints.findIndex(v => this.same(v, t)) + 1} ${info.name}`, photoStatus:guidance?.text, lines: [
      formatCoords(t),
      `距离 ${m.distance.toFixed(1)} m`,
      arrived ? (guidance ? (guidance.ready ? '目标在画内 · 可曝光' : '已到拍摄区') : '已到达 · Shift 制动') : Math.abs(relative) < 3 ? '艇首已对准' : `${relative < 0 ? '左转' : '右转'} ${Math.abs(relative).toFixed(0)}°`,
      Math.abs(depthDelta) > 1 ? `${depthDelta > 0 ? '上浮' : '下潜'} ${Math.abs(depthDelta).toFixed(1)} m` : m.outside ? '超出量程' : '深度吻合',
    ] };
  }
  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    this.drawActive(ctx, w, h);
  }
  snapshot() { return { clock:this.clock,radioQueue:structuredClone(this.radioQueue),radioRecords:structuredClone(this.radioRecords),radioSerial:this.radioSerial, frequency: this.frequency, captured: this.captured, heard: this.heard, replied: this.replied, target: this.target ? [...this.target] : null, waypoints: this.waypoints.map(w => [...w]) }; }
  static validateSnapshot(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const s = value as ReturnType<HarborRescueNavigation['snapshot']>;
    if (!Number.isFinite(s.frequency) || typeof s.captured !== 'boolean' || typeof s.heard !== 'boolean' || typeof s.replied !== 'boolean') return false;
    if (s.target !== null && (!Array.isArray(s.target) || s.target.length !== 3 || !s.target.every(Number.isFinite))) return false;
    if (s.frequency < 35 || s.frequency > 45 || (s.heard && !s.captured) || (s.replied && !s.heard)) return false;
    if(s.radioQueue!==undefined&&(!Array.isArray(s.radioQueue)||s.radioQueue.some(r=>!r||typeof r.text!=='string'||!Number.isFinite(r.frequency)||r.frequency<35||r.frequency>45||typeof r.initial!=='boolean')))return false;
    if(s.radioRecords!==undefined&&(!Array.isArray(s.radioRecords)||s.radioRecords.some(r=>!r||typeof r.text!=='string'||!Number.isFinite(r.frequency))))return false;
    if(s.clock!==undefined&&(!Number.isFinite(s.clock)||s.clock<0))return false;
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
    this.clock=Number.isFinite(s.clock)&&s.clock!>=0?s.clock!:Math.max(0,...this.radioRecords.map(r=>r.at??0));this.loggedAt.clear();this.passiveFocus={contact:null,held:0,locked:false};
    return true;
  }
}



