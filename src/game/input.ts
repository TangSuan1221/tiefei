import type { Rng } from '@/core/contract';

/**
 * 输入管理。三个不寻常的需求驱动了它的设计：
 *
 * 1. PANIC 相要"部分按键失灵" —— 所以每个动作到按键的映射必须是可运行时打乱的，
 *    而不是散落在各处的 if (e.key === 'w')。
 * 2. 玩家"屏息"是长按而非点按，需要可靠的按下时长统计。
 * 3. 恐怖游戏里误触代价极大，不可逆操作必须支持"按住确认"。
 */

export type GameAction =
  | 'move-fwd' | 'move-back' | 'turn-left' | 'turn-right'
  | 'sonar-passive' | 'sonar-chirp' | 'sonar-boom'
  | 'light-toggle' | 'hold-breath' | 'interact' | 'search'
  | 'inventory' | 'map' | 'journal' | 'confirm' | 'cancel'
  | 'crouch' | 'listen' | 'mark-door' | 'debunk';

const DEFAULT_BINDINGS: Record<GameAction, string[]> = {
  'move-fwd': ['KeyW', 'ArrowUp'],
  'move-back': ['KeyS', 'ArrowDown'],
  'turn-left': ['KeyA', 'ArrowLeft'],
  'turn-right': ['KeyD', 'ArrowRight'],
  'sonar-passive': ['Digit1'],
  'sonar-chirp': ['Digit2', 'Space'],
  'sonar-boom': ['Digit3'],
  'light-toggle': ['KeyF'],
  'hold-breath': ['ShiftLeft', 'ShiftRight'],
  'interact': ['KeyE'],
  'search': ['KeyR'],
  'inventory': ['Tab', 'KeyI'],
  'map': ['KeyM'],
  'journal': ['KeyJ'],
  'confirm': ['Enter'],
  'cancel': ['Escape'],
  'crouch': ['KeyC', 'ControlLeft'],
  'listen': ['KeyQ'],
  'mark-door': ['KeyX'],
  'debunk': ['KeyZ'],
};

interface KeyState {
  down: boolean;
  /** 本帧刚按下 */
  pressed: boolean;
  /** 本帧刚松开 */
  released: boolean;
  /** 已按住的毫秒数 */
  heldMs: number;
  downAt: number;
}

export class InputManager {
  private bindings: Record<GameAction, string[]>;
  /** PANIC 相时生效的错乱映射：action → 被替换成的 action */
  private scramble: Partial<Record<GameAction, GameAction>> = {};
  /** PANIC 相时完全失灵的动作 */
  private deadKeys = new Set<GameAction>();

  private states = new Map<GameAction, KeyState>();
  private codeToActions = new Map<string, GameAction[]>();
  private listeners: (() => void)[] = [];
  /** 供 UI 显示"这个键刚才没反应"的反馈 */
  readonly misfires: { action: GameAction; at: number }[] = [];

  constructor(target: EventTarget = window) {
    this.bindings = structuredClone(DEFAULT_BINDINGS);
    this.rebuildIndex();
    for (const a of Object.keys(DEFAULT_BINDINGS) as GameAction[]) {
      this.states.set(a, { down: false, pressed: false, released: false, heldMs: 0, downAt: 0 });
    }

    const onDown = (e: Event) => this.handleKey(e as KeyboardEvent, true);
    const onUp = (e: Event) => this.handleKey(e as KeyboardEvent, false);
    const onBlur = () => this.releaseAll();
    target.addEventListener('keydown', onDown);
    target.addEventListener('keyup', onUp);
    target.addEventListener('blur', onBlur);
    this.listeners.push(() => {
      target.removeEventListener('keydown', onDown);
      target.removeEventListener('keyup', onUp);
      target.removeEventListener('blur', onBlur);
    });
  }

  private rebuildIndex(): void {
    this.codeToActions.clear();
    for (const [action, codes] of Object.entries(this.bindings) as [GameAction, string[]][]) {
      for (const c of codes) {
        const list = this.codeToActions.get(c) ?? [];
        list.push(action);
        this.codeToActions.set(c, list);
      }
    }
  }

  private handleKey(e: KeyboardEvent, down: boolean): void {
    const actions = this.codeToActions.get(e.code);
    if (!actions) return;
    // Tab 会切走焦点，Space 会滚页，恐怖游戏里这两个都是灾难
    e.preventDefault();
    if (down && e.repeat) return;

    for (const raw of actions) {
      if (this.deadKeys.has(raw)) {
        if (down) this.misfires.push({ action: raw, at: performance.now() });
        continue;
      }
      const action = this.scramble[raw] ?? raw;
      const st = this.states.get(action);
      if (!st) continue;
      if (down) {
        if (!st.down) {
          st.down = true;
          st.pressed = true;
          st.downAt = performance.now();
          st.heldMs = 0;
        }
      } else {
        if (st.down) {
          st.down = false;
          st.released = true;
          st.heldMs = performance.now() - st.downAt;
        }
      }
    }
  }

  private releaseAll(): void {
    for (const st of this.states.values()) {
      if (st.down) {
        st.down = false;
        st.released = true;
        st.heldMs = performance.now() - st.downAt;
      }
    }
  }

  /** 每帧末调用，清掉 pressed/released 的瞬时位 */
  endFrame(dtMs: number): void {
    const now = performance.now();
    for (const st of this.states.values()) {
      st.pressed = false;
      st.released = false;
      if (st.down) st.heldMs = now - st.downAt;
    }
    while (this.misfires.length && now - this.misfires[0].at > 1200) this.misfires.shift();
  }

  down(a: GameAction): boolean { return this.states.get(a)?.down ?? false; }
  pressed(a: GameAction): boolean { return this.states.get(a)?.pressed ?? false; }
  released(a: GameAction): boolean { return this.states.get(a)?.released ?? false; }
  heldMs(a: GameAction): number { return this.states.get(a)?.heldMs ?? 0; }

  /** 按住确认：用于不可逆操作，返回 0..1 的进度 */
  holdProgress(a: GameAction, requiredMs = 800): number {
    const st = this.states.get(a);
    if (!st || !st.down) return 0;
    return Math.min(1, (performance.now() - st.downAt) / requiredMs);
  }

  /**
   * 进入 PANIC 相：打乱一部分按键，让另一部分彻底失灵。
   * severity 0..1 决定被影响的比例。这是机制层面的恐慌。
   */
  enterPanic(rng: Rng, severity: number): void {
    this.scramble = {};
    this.deadKeys.clear();
    const movement: GameAction[] = ['move-fwd', 'move-back', 'turn-left', 'turn-right'];
    const utility: GameAction[] = ['sonar-chirp', 'light-toggle', 'interact', 'search', 'listen'];

    // 移动键互换 —— 最迷失方向，但不至于让玩家完全无法行动
    const shuffled = rng.shuffle([...movement]);
    const swapCount = Math.round(severity * movement.length);
    for (let i = 0; i < swapCount; i++) this.scramble[movement[i]] = shuffled[i];

    // 功能键失灵 —— 按下去没反应，玩家会以为游戏卡了，这正是要的效果
    for (const a of utility) if (rng.bool(severity * 0.5)) this.deadKeys.add(a);
  }

  exitPanic(): void {
    this.scramble = {};
    this.deadKeys.clear();
  }

  get panicking(): boolean {
    return Object.keys(this.scramble).length > 0 || this.deadKeys.size > 0;
  }

  rebind(action: GameAction, codes: string[]): void {
    this.bindings[action] = codes;
    this.rebuildIndex();
  }

  getBindings(): Readonly<Record<GameAction, string[]>> {
    return this.bindings;
  }

  dispose(): void {
    for (const off of this.listeners) off();
    this.listeners.length = 0;
  }
}
