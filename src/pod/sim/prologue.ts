/** Progress is earned from instrument/physical state, never from a timer or dialogue password. */
export const PROLOGUE_STEPS = [
  ['航前校准', 'nav', '我是陆地指挥员万斯，负责这次下潜。拖缆刚刚脱开，前面是进港检修长廊。先看左手导航台，把入口的位置记下来：X 11，Y 16，深度 1012。第三格是深度，数值越大越深。', '在导航台依次录入 X 11、Y 16、DEPTH 1012，点“写入”（辅助：数字键 / Tab / Enter）'],
  ['照亮航道', 'camera.lamp', '位置记住了。坐标只供你查阅，不会替你驾驶。现在打开探照灯，看看艇首外面。', '点击操作台的“照明”旋钮，打开探照灯'],
  ['推进档位', 'helm.throttle', '墙上的灯还亮着，通往港口的路应该没有断。先在原地试一下档位，熟悉后回到一档。切档本身不会让艇动起来。', '拖动档位滑块依次试 I、II、III 档，再回到 I 档松手（辅助：X / Z）'],
  ['前进', 'helm.stick', '慢慢推。别急着进港，我需要确认推进器在水压下还能正常响应。', '操纵杆向上推住，前进至少 1 米，按红色“制动”减速（辅助：空格 / Shift）'],
  ['倒车', 'helm.stick', '好。现在反推一小段。这里足够宽，进了门就没有这么从容了。', '操纵杆向下拉住，倒退至少 0.5 米，按“制动”停车（辅助：N / Shift）'],
  ['上浮', 'nav.pitchUp', '上方还有余量。试一下垂直推进，不必抬起艇首。', '按住“上升”按钮，上浮至少 0.5 米（辅助：PageUp）'],
  ['下潜', 'nav.pitchDown', '再回到刚才的深度。注意，浮沉和艇首俯仰是两套操作。', '按住“下降”按钮，下潜至少 0.5 米（辅助：PageDown）'],
  ['抬头', 'drive.up', '调整艇首，让探照灯扫过长廊顶板。只试一点角度。', '按住“抬头”按钮，艇首上抬至少 4°（辅助：I）'],
  ['低头', 'drive.down', '再压低艇首，把视线放回通道。', '按住“低头”按钮，艇首下压至少 4°（辅助：K）'],
  ['回正与定深', 'window', '把艇首放平，回到入口的深度。别带着低头角度一直推，会碰到底板。', '俯仰回正到 0°，深度调回 1012 米，松手等艇身稳定'],
  ['驶向入口', 'window', '前面那道压力门就是入口。航点只带你到门前，机械臂要看门牌上的距离。靠近前把速度降下来；如果看不清，就停下来再判断。操纵杆左右拨是转向。', '对准压力门驶近，门牌距离 3.4 米内按“制动”停稳（辅助：J / L / 空格 / Shift）'],
  ['机械臂作业', 'arm.extend', '先别拿艇首顶门。让机械爪接触门控，看到门打开后，等它完全收回来。', '对准门控点击“机械臂操作”，等它收回（辅助：F，C 取消）'],
] as const;
export type PrologueSample={target:readonly number[]|null;lamp:boolean;gear:number;gearSettled?:boolean;speed:number;x:number;y:number;z:number;pitch:number;pitchRate:number;verticalSpeed:number;doorReach:boolean;doorOpen:boolean;armStowed:boolean};
export type PrologueSave={step:number;gears:number;anchor:number[]|null};
export class Prologue {
  step=0;gears=0;anchor:number[]|null=null;age=0;lampObservation=0;
  get focusActive(){return this.age<2.5&&this.lampObservation===0;}
  get active(){return this.step<PROLOGUE_STEPS.length;}
  get beat(){return PROLOGUE_STEPS[this.step];}
  tick(dt:number,s:PrologueSample){
    if(!this.active)return false;
    this.age+=dt;
    if(this.step===1)this.lampObservation=s.lamp?this.lampObservation+dt:0;
    this.anchor??=[s.x,s.y,s.z,s.pitch];
    const a=this.anchor;
    if(this.step===2)this.gears|=1<<s.gear;
    const passed=[
      !!s.target&&s.target.every((v,i)=>Math.abs(v-[11,0,16][i])<.05),
      s.lamp&&this.lampObservation>=6,(this.gears&14)===14&&s.gear===1&&s.gearSettled!==false,
      s.speed>.05&&Math.hypot(s.x-a[0],s.z-a[2])>=1,
      s.speed<-.05&&Math.hypot(s.x-a[0],s.z-a[2])>=.5,
      s.y-a[1]>=.5,a[1]-s.y>=.5,
      a[3]-s.pitch>=4,s.pitch-a[3]>=4,
      Math.abs(s.pitch)<.6&&Math.abs(s.y)<.25&&Math.abs(s.pitchRate)<.2&&Math.abs(s.verticalSpeed)<.05,
      s.doorReach&&Math.abs(s.speed)<.08,
      s.doorOpen&&s.armStowed,
    ][this.step];
    if(!passed)return false;
    this.step++;this.age=0;this.lampObservation=0;this.anchor=null;return true;
  }
  snapshot():PrologueSave{return {step:this.step,gears:this.gears,anchor:this.anchor?[...this.anchor]:null};}
  static valid(s:PrologueSave){return !!s&&Number.isInteger(s.step)&&s.step>=0&&s.step<=PROLOGUE_STEPS.length&&Number.isInteger(s.gears)&&s.gears>=0&&s.gears<=15&&(s.anchor===null||Array.isArray(s.anchor)&&s.anchor.length===4&&s.anchor.every(Number.isFinite));}
  restore(s:PrologueSave){if(!Prologue.valid(s))return false;this.step=s.step;this.gears=s.gears;this.anchor=s.anchor?[...s.anchor]:null;this.age=0;this.lampObservation=0;return true;}
}
