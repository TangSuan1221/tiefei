import type { EventBus, GameEvents } from './contract';

type Handler = (p: any) => void;

/**
 * 同步事件总线。带重入保护 —— 事件处理器里再次 emit 是常见的，
 * 直接遍历会漏掉/重复调用监听器。
 */
export class Bus implements EventBus {
  private map = new Map<string, Set<Handler>>();
  private depth = 0;
  private readonly maxDepth = 32;

  /** 调试用：记录最近事件，视觉检查/回归测试时能看到发生了什么 */
  readonly trace: { k: string; p: unknown; t: number }[] = [];
  traceEnabled = false;
  private traceLimit = 500;

  on<K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void): () => void {
    let set = this.map.get(k as string);
    if (!set) {
      set = new Set();
      this.map.set(k as string, set);
    }
    set.add(fn as Handler);
    return () => this.off(k, fn);
  }

  once<K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void): () => void {
    const wrapped = (p: GameEvents[K]) => {
      this.off(k, wrapped);
      fn(p);
    };
    return this.on(k, wrapped);
  }

  off<K extends keyof GameEvents>(k: K, fn: (p: GameEvents[K]) => void): void {
    this.map.get(k as string)?.delete(fn as Handler);
  }

  emit<K extends keyof GameEvents>(k: K, p: GameEvents[K]): void {
    if (this.depth >= this.maxDepth) {
      console.error(`[bus] event cascade too deep at "${String(k)}" — dropped`);
      return;
    }
    if (this.traceEnabled) {
      this.trace.push({ k: k as string, p, t: performance.now() });
      if (this.trace.length > this.traceLimit) this.trace.shift();
    }
    const set = this.map.get(k as string);
    if (!set || set.size === 0) return;
    this.depth++;
    // 快照，允许处理器在回调中增删监听
    for (const fn of Array.from(set)) {
      try {
        fn(p);
      } catch (err) {
        console.error(`[bus] handler for "${String(k)}" threw`, err);
      }
    }
    this.depth--;
  }

  clear(): void {
    this.map.clear();
    this.trace.length = 0;
  }
}
