import type { FlagStore, FlagValue, EventBus } from './contract';

/**
 * 全局旗标存储。叙事、世界、遭遇三个系统都靠它通信，
 * 所以它是唯一被允许跨模块共享的可变状态。
 *
 * 命名约定（内容校验器会强制检查）:
 *   met.<npc>          是否见过某人
 *   know.<topic>       是否知晓某事
 *   did.<action>       是否做过某事
 *   count.<thing>      计数
 *   ritual.<name>      仪式进度
 *   sys.<key>          系统内部，不出现在剧情条件里
 */
export class Flags implements FlagStore {
  private data = new Map<string, FlagValue>();
  private bus?: EventBus;
  /** 记录每个 flag 首次被设置时的呼吸数，用于"回忆"系统 */
  readonly timestamps = new Map<string, number>();
  private clock: () => number = () => 0;

  constructor(bus?: EventBus, clock?: () => number) {
    this.bus = bus;
    if (clock) this.clock = clock;
  }

  get(key: string): FlagValue | undefined {
    return this.data.get(key);
  }

  getNum(key: string, fallback = 0): number {
    const v = this.data.get(key);
    return typeof v === 'number' ? v : fallback;
  }

  getBool(key: string): boolean {
    const v = this.data.get(key);
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'string') return v.length > 0;
    return false;
  }

  getStr(key: string, fallback = ''): string {
    const v = this.data.get(key);
    return typeof v === 'string' ? v : fallback;
  }

  set(key: string, value: FlagValue): void {
    if (!this.data.has(key)) this.timestamps.set(key, this.clock());
    this.data.set(key, value);
  }

  add(key: string, delta: number): void {
    this.set(key, this.getNum(key) + delta);
  }

  has(key: string): boolean {
    return this.data.has(key);
  }

  delete(key: string): void {
    this.data.delete(key);
  }

  all(): Readonly<Record<string, FlagValue>> {
    return Object.fromEntries(this.data);
  }

  /** 按前缀查询，用于"你知道的一切"界面 */
  withPrefix(prefix: string): [string, FlagValue][] {
    const out: [string, FlagValue][] = [];
    for (const [k, v] of this.data) if (k.startsWith(prefix)) out.push([k, v]);
    return out;
  }

  serialize(): Record<string, FlagValue> {
    return Object.fromEntries(this.data);
  }

  hydrate(data: Record<string, FlagValue> | undefined): void {
    this.data.clear();
    if (!data) return;
    for (const [k, v] of Object.entries(data)) this.data.set(k, v);
  }

  /** 轮回重置：清掉本轮进度，保留 meta.* 与 know.* 中已继承的知识 */
  resetForCycle(keepPrefixes: readonly string[] = ['meta.', 'cycle.']): void {
    for (const k of Array.from(this.data.keys())) {
      if (!keepPrefixes.some((p) => k.startsWith(p))) this.data.delete(k);
    }
  }
}
