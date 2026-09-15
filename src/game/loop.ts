/**
 * 固定步长游戏循环 + 渲染插值。
 *
 * 为什么不用朴素的 requestAnimationFrame + dt：
 * 本作的模拟包含生理状态的积分（CO2、体温、感染），可变 dt 会让
 * 不同帧率的玩家得到不同的数值结果，直接破坏平衡与可复现性。
 * 所以模拟跑固定 60Hz，渲染跑显示器刷新率并对状态做插值。
 */
export interface LoopCallbacks {
  /** 固定步长模拟，dt 恒为 1/simHz */
  fixedUpdate(dt: number): void;
  /** 渲染，alpha 是两次模拟之间的插值系数 0..1 */
  render(dtReal: number, alpha: number): void;
}

export class GameLoop {
  private running = false;
  private rafId = 0;
  private lastTime = 0;
  private accumulator = 0;
  private readonly stepMs: number;
  private readonly stepSec: number;
  /** 一帧最多补几次模拟，防止后台标签页回来时的"死亡螺旋" */
  private readonly maxSubSteps = 5;

  // 性能统计 —— 视觉检查 Agent 会读这些数字
  readonly stats = {
    fps: 0,
    simHz: 0,
    frameMs: 0,
    simMs: 0,
    renderMs: 0,
    droppedSteps: 0,
  };
  private frameCount = 0;
  private simCount = 0;
  private statsTimer = 0;

  constructor(
    private cb: LoopCallbacks,
    simHz = 60,
  ) {
    this.stepMs = 1000 / simHz;
    this.stepSec = 1 / simHz;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const frameStart = now;
    let elapsed = now - this.lastTime;
    this.lastTime = now;

    // 标签页切回来时 elapsed 可能是几万毫秒，直接钳制而不是补算
    if (elapsed > 250) elapsed = this.stepMs;

    this.accumulator += elapsed;

    const simStart = performance.now();
    let steps = 0;
    while (this.accumulator >= this.stepMs && steps < this.maxSubSteps) {
      this.cb.fixedUpdate(this.stepSec);
      this.accumulator -= this.stepMs;
      steps++;
      this.simCount++;
    }
    if (this.accumulator >= this.stepMs) {
      // 追不上了，丢弃积压避免螺旋
      this.stats.droppedSteps += Math.floor(this.accumulator / this.stepMs);
      this.accumulator = 0;
    }
    const simEnd = performance.now();

    const alpha = this.accumulator / this.stepMs;
    this.cb.render(elapsed / 1000, alpha);
    const renderEnd = performance.now();

    this.stats.simMs = simEnd - simStart;
    this.stats.renderMs = renderEnd - simEnd;
    this.stats.frameMs = renderEnd - frameStart;
    this.frameCount++;
    this.statsTimer += elapsed;
    if (this.statsTimer >= 500) {
      this.stats.fps = (this.frameCount * 1000) / this.statsTimer;
      this.stats.simHz = (this.simCount * 1000) / this.statsTimer;
      this.frameCount = 0;
      this.simCount = 0;
      this.statsTimer = 0;
    }
  };
}
