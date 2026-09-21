/**
 * 逃生舱会话 —— 从标题画面接手之后，这就是整场游戏。
 * ============================================================================
 * 玩家被封在九米长的铁罐子里。没有行动清单。没有地图。
 * 你在舱里走动，在五个工位之间坐下，按它们的键。
 *
 * 平静态：时间只在你动手时走。
 * 警报态：红点在靠近，秒表是真的。
 */

import { seedToCoords } from '@/core/rng';
import { stationForKey, type StationId } from '../types';
import { PodRun } from '../sim/run';
import { PodView } from './present';
import { performControl, stationControls } from './stations';
import { bindGm, closeGmConsole, closePromptPanel, isGmConsoleOpen } from './gm';
import { installFootageSink } from './footage';

const DEATH_TITLE: Record<string, string> = {
  asphyxiation: '氧气用完了',
  hypothermia: '你不再觉得冷了',
  trauma: '失血比你以为的快',
  infection: '它已经在你身体里了',
  implosion: '舱体让步了',
  listener: '它找到了你',
  ritual: '仪式完成了',
  drowning: '水先漫过面罩',
  self: '你自己做的决定',
};

export async function startPodSession(_resume: boolean): Promise<void> {
  const override = sessionStorage.getItem('ironlung.seedOverride');
  sessionStorage.removeItem('ironlung.seedOverride');
  const seed = override ? Number(override) >>> 0 : (Date.now() ^ 0x9e3779b9) >>> 0;

  const uiRoot = document.getElementById('ui-root') as HTMLDivElement;
  uiRoot.innerHTML = '';
  document.querySelectorAll('.corner, .boot-log').forEach((n) => n.remove());
  const bgCanvas = document.getElementById('bg-canvas') as HTMLCanvasElement;
  bgCanvas.style.opacity = '0';
  const outCanvas = document.getElementById('post-canvas') as HTMLCanvasElement;
  outCanvas.style.transition = 'opacity 1.6s ease';
  outCanvas.style.opacity = '1';

  const run = new PodRun(seed);
  const view = new PodView(run, outCanvas);
  bindGm({
    run: () => run,
    reinstallSink: () => installFootageSink(run),
  });
  installFootageSink(run);

  // 开发期把 run 挂出去。航线是线性的，想看第四段的样子就得先老实开完前三段 ——
  // 调一个站点的画面不值得付那个代价。发布构建里这行会被摇掉。
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__pod = run;
    (window as unknown as Record<string, unknown>).__cabinPose = () => view.cabin.pose();
  }

  run.pushLog(`三号逃生舱 · 坐标 ${seedToCoords(seed)}`, 'system');
  run.pushLog('舱外没有窗户。你的眼睛是雷达、全息屏，和那一台摄像头。', 'neutral');

  new PodSession(run, view).start();
}

export class PodSession {
  private blurred = false;
  private last = performance.now();
  private ended = false;
  private readonly keys = new Set<string>();
  private epilogueAt = 0;
  private stepDistance = 0;
  private dragLook = false;
  private heldPilot:string|null=null;
  private stickDrag:{x:number;y:number}|null=null;
  private canvas = document.getElementById('post-canvas') as HTMLCanvasElement;

  private centerHit():string|null {
    const r=this.canvas.getBoundingClientRect();
    return this.view.pick(r.left+r.width/2,r.top+r.height/2);
  }

  private toggleJournal():void {
    const old=document.getElementById('campaign-journal');
    if(old){old.remove();return;}
    if(document.pointerLockElement) document.exitPointerLock();
    this.keys.clear();
    const panel=document.createElement('section');panel.id='campaign-journal';
    panel.setAttribute('role','dialog');panel.setAttribute('aria-label','航行证据记录');
    panel.style.cssText='position:fixed;inset:10% 12%;z-index:120;overflow:auto;padding:28px;background:#091416f5;color:#d6d6bd;border:1px solid #647b73;font:16px/1.9 monospace;user-select:text';
    const close=document.createElement('button');close.textContent='关闭记录 · J / Esc';
    close.style.cssText='background:#172a2b;color:#ddd6b9;border:1px solid #647b73;padding:8px 14px;cursor:pointer;font:inherit';
    close.onclick=()=>panel.remove();panel.append(close);
    const title=document.createElement('h2');title.textContent=this.run.campaign.current.title;panel.append(title);
    const goal=document.createElement('p');goal.textContent=`当前行动：${this.run.campaign.objective}`;panel.append(goal);
    if(this.run.mode==='alert') {
      const warning=document.createElement('p');warning.textContent='警报仍在计时。Esc 关闭记录，先应对舱外威胁。';warning.style.color='#f29975';panel.append(warning);
    }
    for(const entry of this.run.campaign.journal) {
      const stage={hook:'启程',arrival:'抵达',film:'读片',evidence:'现场核对',departure:'离站'}[entry.beat];
      const line=document.createElement('p');line.textContent=`[${entry.chapter+1} / ${stage}] ${entry.text}`;panel.append(line);
    }
    const question=document.createElement('p');question.textContent=`未解之问：${this.run.campaign.has(this.run.campaign.chapter,'film')?this.run.campaign.current.question:'万斯的指引与现场记录一致吗？先核对本关录像。'}`;panel.append(question);
    document.body.append(panel);close.focus();
  }

  private useTerminal(id:string|null):void {
    if(!id) return;
    if(id==='site.interact'){this.run.authoredSite?.interact();return;}
    this.view.cabin.selectFace(id);
    const ok=performControl(this.run,id);
    if(this.run.at && document.pointerLockElement) document.exitPointerLock();
    this.keys.clear();
    this.view.audio.cue(ok?'ui.select':'ui.error',{gain:.4});
  }

  constructor(
    private readonly run: PodRun,
    private readonly view: PodView,
  ) {}

  start(): void {
    this.wireSpatialAudio();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointerdown', this.onPointer);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', () => { this.dragLook = false;this.heldPilot=null;this.releaseStick(); });
    window.addEventListener('pointercancel', () => {this.dragLook=false;this.heldPilot=null;this.releaseStick();});
    window.addEventListener('contextmenu', e => {
      if((!this.run.at||this.run.at==='camera') && (e.target===this.canvas || e.target===document.getElementById('ui-root'))) e.preventDefault();
    });
    window.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('pointerlockchange',()=>this.keys.clear());
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVisibility);
    requestAnimationFrame(this.frame);
  }

  /**
   * 把「这个声音在外面哪儿」接到音频引擎上。
   *
   * 表现层原本装的那个回调只传 gain。舱内的一百多个 cue 应该继续走那条路 ——
   * 它们本来就在你脑袋旁边，加距离衰减只会让界面糊掉。这里在它外面包一层：
   * **只有带了位置的那几个** cue 会走空间化的链路，其余一个字节都不变。
   */
  private wireSpatialAudio(): void {
    const audio = this.view.audio;
    this.run.onCue = (cue, gain, space) => {
      if (!space) {
        audio.cue(cue, { gain: gain ?? 0.85 });
        return;
      }
      audio.cue(cue, {
        gain: gain ?? 0.85,
        pan: space.pan,
        space: { dist: space.dist, room: space.room, flooded: space.flooded },
      });
    };
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    this.applyHeld(dt);
    this.run.frame(dt);
    this.view.frame(dt, this.run);
    if((this.run.at || this.run.outcome.kind!=='alive' || this.blurred || isGmConsoleOpen()) && document.pointerLockElement===this.canvas) {
      document.exitPointerLock();this.keys.clear();
    }
    // 摄像头换了一间房，混响尾巴就该跟着换。引擎自己按档位去重，
    // 所以这里可以每帧无脑推
    const room = this.run.roomAcoustics;
    this.view.audio.setRoomAcoustics(room.size, room.flooded);

    if (!this.ended && this.run.outcome.kind !== 'alive') {
      this.ended = true;
      this.epilogueAt = now + 2200;
    }
    if (this.ended && this.epilogueAt && now >= this.epilogueAt) {
      this.epilogueAt = 0;
      this.showEpilogue();
    }
  };

  private syncInputBlock(): boolean {
    const active = document.activeElement as HTMLElement | null;
    const editing = !!active?.closest('input, textarea, select, [contenteditable="true"]');
    const blocked = this.blurred || document.hidden || editing || isGmConsoleOpen()
      || !!document.querySelector('.gm-prompt, #campaign-journal');
    this.run.driveInputBlocked = blocked;
    if (blocked || this.run.outcome.kind !== 'alive') this.keys.clear();
    return blocked;
  }

  private onBlur = (): void => {
    this.run.navDriveEngaged=false;
    this.releaseStick();
    this.blurred = true;
    this.dragLook = false;
    this.heldPilot=null;
    this.keys.clear();
    this.run.driveInputBlocked = true;
  };
  private onFocus = (): void => { this.blurred = false; this.syncInputBlock(); };
  private onVisibility = (): void => { this.keys.clear(); this.syncInputBlock(); };

  private applyHeld(dt: number): void {
    if(this.run.at!=='nav' || this.run.driveBlock || this.keys.has('shift') || this.keys.has('n')) this.run.navDriveEngaged=false;
    if(this.run.at!=='camera') this.releaseStick();
    if (this.syncInputBlock() || this.run.outcome.kind !== 'alive') {this.run.navDriveEngaged=false;this.heldPilot=null;this.releaseStick();return;}
    if(!this.run.at) {
      const k=this.keys;
      const distance=this.view.cabin.move(Number(k.has('w'))-Number(k.has('s')),Number(k.has('d'))-Number(k.has('a')),dt);
      this.stepDistance+=distance;
      if(this.stepDistance>.43) {
        this.stepDistance=0;
        this.view.audio.cue('step.metal',{gain:.28});
        this.run.addNoise(.008);
        if(this.run.mode==='calm') this.run.spend(1,.12);
      }
      this.view.hovered=this.centerHit();
      return;
    }
    if(this.run.at==='camera' || this.run.at==='nav') {
      const down=(key:string,id:string)=>this.keys.has(key)||this.heldPilot===id;
      this.run.holdHeave(Number(down('w','nav.pitchUp'))-Number(down('s','nav.pitchDown')));
      this.run.holdPilot(this.view.cabin.helmInput.thrust+Number(down(' ','drive.forward')||this.run.navDriveEngaged)-Number(down('n','drive.back')),
        this.view.cabin.helmInput.yaw+Number(down('l','drive.right'))-Number(down('j','drive.left')),
        Number(down('k','drive.down'))-Number(down('i','drive.up')),this.keys.has('shift')||this.heldPilot==='helm.brake');
    }
    if(this.run.at!=='camera') return;
    const k = this.keys;
    const speed = 0.85 * dt * this.run.camZoom;
    if (k.has('arrowleft')) this.run.panCamera(-speed);
    if (k.has('arrowright')) this.run.panCamera(speed);
    if (k.has('arrowup')) this.run.tiltCamera(-speed * 0.6);
    if (k.has('arrowdown')) this.run.tiltCamera(speed * 0.6);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const editing=(document.activeElement as HTMLElement|null)?.closest('input,textarea,select,[contenteditable="true"]');
    if(!editing && !e.repeat && !e.ctrlKey && !e.metaKey && e.code==='KeyJ' && this.run.at!=='camera' && this.run.at!=='nav') {
      e.preventDefault();this.toggleJournal();return;
    }
    if(e.key==='Escape' && document.getElementById('campaign-journal')) {
      document.getElementById('campaign-journal')!.remove();this.keys.clear();return;
    }
    const movementKey = !this.run.at && /^Key[WASD]$/.test(e.code);
    if (this.syncInputBlock() || e.ctrlKey || e.metaKey || e.altKey || (e.isComposing && !movementKey)) return;
    if(movementKey) {
      e.preventDefault();
      this.keys.add(e.code.slice(3).toLowerCase());
      return;
    }
    if (this.run.at === 'camera' && e.key === ' ') e.preventDefault();
    if (e.repeat && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
      return;
    }
    void this.view.unlockAudio();
    const key = e.key.toLowerCase();
    if (isGmConsoleOpen()) return;
    this.keys.add(key);
    if(this.run.at==='camera' && key==='f'){e.preventDefault();this.run.authoredSite?.interact();return;}
    if(this.run.at==='nav'&&key==='4'){e.preventDefault();this.toggleNavDrive();return;}
    if((this.run.at==='camera'||this.run.at==='nav') && [' ','n','j','l','i','k','w','s','shift'].includes(key)) {
      e.preventDefault();return;
    }

    if (this.run.outcome.kind !== 'alive') return;

    if (key === 'escape') {
      e.preventDefault();
      this.releaseStick();
      this.heldPilot=null;
      if (closePromptPanel() || closeGmConsole()) return;
      this.keys.clear();
      if (this.run.at) this.run.leaveStation();
      if(document.pointerLockElement===this.canvas) document.exitPointerLock();
      return;
    }

    if (!this.run.at) {
      if (key === 'e' || key === 'enter') {
        e.preventDefault();
        this.useTerminal(this.centerHit());
        return;
      }
      if (key >= '1' && key <= '6') {
        const id = stationForKey(key);
        if (id) this.run.walkTo(id);
        return;
      }
      return;
    }

    if (this.run.at === 'camera') {
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
        // 按住方向键由 applyHeld 连续转云台，避免默认行为同时滚动页面。
        e.preventDefault();
        return;
      }
      if (key === '+' || key === '=') this.run.zoomCamera(0.25);
      if (key === '-' || key === '_') this.run.zoomCamera(-0.25);
    }

    const controls = stationControls(this.run, this.run.at);
    const hit = controls.find((c) => (c.key === '空格' ? ' ' : c.key.toLowerCase()) === key);
    if (hit) {
      e.preventDefault();
      if (hit.state !== 'disabled') performControl(this.run, hit.id);
      return;
    }
    // 坐下时 1–6 仍可换台：分析台占用 1–3，提示却写「按 6」去领航台。
    if (key >= '1' && key <= '6') {
      const id = stationForKey(key);
      if (id && id !== this.run.at) {
        e.preventDefault();
        this.run.walkTo(id);
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
    if(/^Key[WASD]$/.test(e.code)) this.keys.delete(e.code.slice(3).toLowerCase());
  };

  private onPointer = (e: PointerEvent): void => {
    if (this.syncInputBlock()) return;
    this.keys.clear();
    void this.view.unlockAudio();
    if (this.run.outcome.kind !== 'alive') return;
    if(e.target!==this.canvas && e.target!==document.getElementById('ui-root')) return;
    if(this.run.at==='camera'&&e.button===2){this.dragLook=true;e.preventDefault();return;}
    if(this.run.at&&e.button!==0)return;
    if(!this.run.at) {
      if(e.button===2) { this.dragLook=true;e.preventDefault();return; }
      if(e.button!==0) return;
      if(document.pointerLockElement!==this.canvas) {
        try {
          void this.canvas.requestPointerLock()?.catch(()=>{
            this.run.pushLog('鼠标锁定不可用：WASD 仍可移动，按住右键拖动环视。','system');
          });
        } catch {
          this.run.pushLog('按住右键拖动环视；WASD 移动。','system');
        }
      } else this.useTerminal(this.centerHit());
      return;
    }
    const id = this.view.pick(e.clientX, e.clientY);
    if(id==='helm.stick'){this.stickDrag={x:e.clientX,y:e.clientY};return;}
    if(id==='helm.brake'){this.heldPilot='helm.brake';return;}
    if(id==='nav.thrust'){this.toggleNavDrive();return;}
    if(id==='nav.pitchUp'||id==='nav.pitchDown'){this.heldPilot=id;return;}
    if(id && ['drive.forward','drive.back','drive.left','drive.right','drive.up','drive.down'].includes(id)) {
      this.heldPilot=id;return;
    }
    this.useTerminal(id);
  };

  private onMove = (e: PointerEvent): void => {
    if(this.run.at==='camera'&&this.dragLook){this.view.cabin.turn(e.movementX,e.movementY);return;}
    if(this.stickDrag){
      const input=this.view.cabin.helmInput;
      const axis=(v:number)=>{const a=Math.abs(v);return a<8?0:Math.sign(v)*Math.min(1,(a-8)/110);};
      input.yaw=axis(e.clientX-this.stickDrag.x);
      input.thrust=axis(this.stickDrag.y-e.clientY);return;
    }
    if(!this.run.at && (document.pointerLockElement===this.canvas || this.dragLook)) {
      this.view.cabin.turn(e.movementX,e.movementY);
      return;
    }
    const id = this.view.pick(e.clientX, e.clientY);
    if (id !== this.view.hovered) {
      this.view.hovered = id;
      if (id) this.view.audio.cue('ui.hover', { gain: 0.28 });
    }
  };

  private releaseStick():void {
    this.stickDrag=null;this.view.cabin.helmInput.thrust=0;this.view.cabin.helmInput.yaw=0;
  }
  private toggleNavDrive():void {
    if(this.run.driveBlock){this.run.pushLog(this.run.driveBlock,'system');this.run.navDriveEngaged=false;return;}
    this.run.navDriveEngaged=!this.run.navDriveEngaged;
    this.run.pushLog(this.run.navDriveEngaged?'推进电机接通。再次点击停推；Shift 制动。':'推进电机断开。艇体仍在惯性滑行。','system');
    this.view.audio.cue('ui.select',{gain:.5});
  }

  private onWheel = (e: WheelEvent): void => {
    if (this.syncInputBlock() || this.run.at !== 'camera' || this.run.outcome.kind !== 'alive') return;
    e.preventDefault();
    this.run.zoomCamera(e.deltaY > 0 ? -0.18 : 0.18);
  };

  private showEpilogue(): void {
    const run = this.run;
    const root = document.getElementById('ui-root') as HTMLDivElement;
    const out = run.outcome;
    const title =
      out.kind === 'escaped' ? (run.campaign.ending?.title ?? '升降井就在上面')
      : out.kind === 'dead' ? (DEATH_TITLE[out.cause] ?? '你停止了呼吸')
      : '——';
    const body =
      out.kind === 'escaped'
        ? (run.campaign.ending ? `${run.campaign.current.departure} ${run.campaign.ending.body}` : '铁盖打开的时候你没有立刻爬出去。你在听。频道里什么都没有了。')
        : out.kind === 'dead' ? out.line
        : '';
    root.innerHTML = `
      <div class="epilogue">
        <h2>${title}</h2>
        <p>${body}</p>
        <ul>
          <li>${run.breaths} 口气</li>
          <li>最深 ${run.depth.toFixed(0)} 米</li>
          <li>${run.leg.name}</li>
        </ul>
        <button id="again">再进一次舱</button>
      </div>`;
    document.getElementById('again')?.addEventListener('click', () => location.reload());
  }
}
