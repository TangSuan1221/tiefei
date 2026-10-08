import type { NavigationConsole } from '../../sim/authored-site';
import type { PodRun } from '../../sim/run';
import type { Control } from '../chrome';
import { drawSonarOwnship, sonarHeading } from '../sonar-ownship';

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
  private rows: number[][] = [];
  private sampleClock = 0;
  private sample = 0;
  constructor(private readonly host: HarborRescueNavigationHost) {}
  private coordinates(v: readonly number[]) { return `X ${v[0]} / Y ${v[1]} / Z ${v[2]}`; }
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
  drawActive(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (!this.host.run.powered || !this.host.run.activeSonarEnabled) return;
    ctx.save();this.host.drawActive(ctx, w, h);
    // Match PodExpedition's dedicated head-up sonar layout and 24 m range.
    const size = Math.min(w, h / .93), cx = size / 2, cy = size * .48, radius = size * .30;
    if (this.target) {
      const dx = this.target[0] - this.host.position.x, dz = this.target[2] - this.host.position.z;
      const a = Math.atan2(dx, -dz) - this.host.run.heading * Math.PI / 180;
      const distance = Math.hypot(dx, dz), outside = distance > 24;
      const d = Math.min(1, distance / 24);
      const x = cx + Math.sin(a) * radius * d, y = cy - Math.cos(a) * radius * d;
      // Inertial navigation is cyan; terrain echoes retain their amber palette.
      // Keep off-range targets on the rim, explicitly labelled rather than
      // implying that the clipped marker is a measured sonar return.
      ctx.save();ctx.strokeStyle = '#63fff1';ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);ctx.beginPath();ctx.moveTo(cx, cy);ctx.lineTo(x, y);ctx.stroke();ctx.setLineDash([]);
      ctx.translate(x, y);if(outside)ctx.rotate(a);
      ctx.beginPath();
      if(outside){ctx.moveTo(0,-13);ctx.lineTo(11,9);ctx.lineTo(0,4);ctx.lineTo(-11,9);}
      else{ctx.moveTo(0,-12);ctx.lineTo(12,0);ctx.lineTo(0,12);ctx.lineTo(-12,0);}
      ctx.closePath();ctx.fillStyle='#63fff1';ctx.strokeStyle='#031719';ctx.lineWidth=5;ctx.stroke();ctx.fill();
      ctx.restore();
      const tx=size+8, tw=Math.max(50,w-tx-8);
      ctx.fillStyle='#092b2e';ctx.fillRect(tx-4,49,tw+4,142);
      const label=(value:string,y:number,font=17,color='#63fff1')=>{ctx.fillStyle=color;ctx.font=`bold ${font}px "Microsoft YaHei"`;ctx.fillText(value,tx,y,tw);};
      const relative=((a*180/Math.PI+540)%360)-180;
      const photoTarget=this.replied&&[this.host.photoCoordinates,[77,1,7]].some(p=>p.every((v,i)=>Math.abs(v-this.target![i])<.1));
      const arrived=(distance<=2.5&&Math.abs(this.target[1]-this.host.position.y)<=1)||!!this.host.targetReached?.(this.target);
      const cameraHeading=this.host.run.heading+this.host.run.camPan*180/Math.PI;
      const targetHeading=this.target[0]===77&&this.target[2]===7?180:0;
      const turn=((targetHeading-cameraHeading+540)%360)-180;
      const guidance=photoTarget&&arrived?this.host.photoGuidance?.():undefined;
      label('◆ 已写入航点',67,19);
      label(`X ${this.target[0]}  Y ${this.target[1]}  Z ${this.target[2]}`,92,16,'#e9fff2');
      label(`水平距离 ${distance.toFixed(1)} m`,117);
      label(arrived?(guidance?'已到拍摄区 · 按曝光':'位置到达 · Shift 制动'):Math.abs(relative)<3?'艇首已对准':`${relative<0?'左转':'右转'} ${Math.abs(relative).toFixed(0)}°`,142,20);
      label(arrived&&photoTarget?(Math.abs(turn)<=15?'朝向合适 · 保持水平曝光':`朝北±15° · ${turn<0?'左':'右'}转${Math.abs(turn).toFixed(0)}°`):outside?'超出量程 · 沿边缘箭头':'图中青色菱形为航点',167,15);
      label(arrived&&photoTarget?'位置±2.5m · 俯仰±10°':'惯导指引 · 非障碍回波',185,12,'#adc7b5');
      if(guidance){ctx.fillStyle='#092b2e';ctx.fillRect(tx-4,151,tw+4,62);label(guidance.ready?'目标在画内 · 可曝光取证':'可自由曝光 · 目标未确认',167,14,'#63fff1');label(guidance.detail,189,13,'#e9fff2');label('镜头保持当前朝向 · J/L转艇',208,12,'#adc7b5');}
    }
    drawSonarOwnship(ctx, cx, cy, 12);
    ctx.fillStyle = '#e9fff2';ctx.font = '13px "Microsoft YaHei"';ctx.fillText(`艇首 ↑ ${sonarHeading(this.host.run.heading)}`, size + 8, 22, Math.max(50, w - size - 14));
    ctx.restore();
  }
  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    this.drawActive(ctx, w, h);
  }
  snapshot() { return { radioQueue:structuredClone(this.radioQueue),radioRecords:structuredClone(this.radioRecords),radioSerial:this.radioSerial, frequency: this.frequency, captured: this.captured, heard: this.heard, replied: this.replied, target: this.target ? [...this.target] : null }; }
  static validateSnapshot(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const s = value as ReturnType<HarborRescueNavigation['snapshot']>;
    if (!Number.isFinite(s.frequency) || typeof s.captured !== 'boolean' || typeof s.heard !== 'boolean' || typeof s.replied !== 'boolean') return false;
    if (s.target !== null && (!Array.isArray(s.target) || s.target.length !== 3 || !s.target.every(Number.isFinite))) return false;
    if (s.frequency < 35 || s.frequency > 45 || (s.heard && !s.captured) || (s.replied && !s.heard)) return false;
    if(s.radioQueue!==undefined&&(!Array.isArray(s.radioQueue)||s.radioQueue.some(r=>!r||typeof r.text!=='string'||!Number.isFinite(r.frequency)||r.frequency<35||r.frequency>45||typeof r.initial!=='boolean')))return false;
    if(s.radioRecords!==undefined&&(!Array.isArray(s.radioRecords)||s.radioRecords.some(r=>!r||typeof r.text!=='string'||!Number.isFinite(r.frequency))))return false;
    if(s.radioSerial!==undefined&&(!Number.isInteger(s.radioSerial)||s.radioSerial<0))return false;
    return true;
  }
  restore(value: unknown) {
    if (!HarborRescueNavigation.validateSnapshot(value)) return false;
    const s = value as ReturnType<HarborRescueNavigation['snapshot']>;
    this.setFrequency(s.frequency);this.captured = s.captured;this.heard = s.heard;this.replied = s.replied;
    this.target = s.target ? [...s.target] : null;this.rows = [];
    this.radioQueue=structuredClone(s.radioQueue??[]);this.radioRecords=structuredClone(s.radioRecords??[]);this.radioSerial=s.radioSerial??this.radioRecords.length;this.tuneLock=0;this.playbackLeft=0;
    return true;
  }
}



