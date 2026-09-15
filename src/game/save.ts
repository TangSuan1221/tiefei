import type { SaveBlob, MetaProgress, GameState, ID, StigmaKind } from '@/core/contract';

const SAVE_KEY = 'ironlung.save.v1';
const META_KEY = 'ironlung.meta.v1';
export const SAVE_VERSION = 1;

/**
 * 存档。两条轨道：
 *   - run 存档：本轮回的完整状态，死亡即清除（roguelite 规则）
 *   - meta 存档：跨轮回的知识、图鉴、见过的结局，永不清除
 *
 * 一个设计上的恶意：本作会**伪造存档提示**（FabricationKind 里的 'save-prompt'）。
 * 因此真实的存档写入必须留下一个玩家可验证的凭据 —— `savedAt` 时间戳。
 * 假提示的时间戳是未来的，这就是它的 tell。
 */
export class SaveManager {
  private storage: Storage | null;

  constructor(storage?: Storage) {
    // 无痕模式/沙箱里 localStorage 可能抛异常，不能让存档失败拖垮游戏
    try {
      this.storage = storage ?? window.localStorage;
      this.storage.setItem('__probe', '1');
      this.storage.removeItem('__probe');
    } catch {
      this.storage = null;
      console.warn('[save] localStorage 不可用，本次游戏不会被保存');
    }
  }

  get available(): boolean {
    return this.storage !== null;
  }

  saveRun(blob: Omit<SaveBlob, 'version' | 'savedAt'>): boolean {
    if (!this.storage) return false;
    const full: SaveBlob = { ...blob, version: SAVE_VERSION, savedAt: Date.now() };
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(full));
      return true;
    } catch (e) {
      console.error('[save] 写入失败', e);
      return false;
    }
  }

  loadRun(): SaveBlob | null {
    if (!this.storage) return null;
    const raw = this.storage.getItem(SAVE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as SaveBlob;
      return this.migrate(parsed);
    } catch (e) {
      console.error('[save] 存档损坏，已丢弃', e);
      this.clearRun();
      return null;
    }
  }

  hasRun(): boolean {
    return this.storage?.getItem(SAVE_KEY) != null;
  }

  clearRun(): void {
    this.storage?.removeItem(SAVE_KEY);
  }

  loadMeta(): MetaProgress {
    const fallback = emptyMeta();
    if (!this.storage) return fallback;
    const raw = this.storage.getItem(META_KEY);
    if (!raw) return fallback;
    try {
      return { ...fallback, ...(JSON.parse(raw) as MetaProgress) };
    } catch {
      return fallback;
    }
  }

  saveMeta(meta: MetaProgress): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(META_KEY, JSON.stringify(meta));
    } catch (e) {
      console.error('[save] 元进度写入失败', e);
    }
  }

  /** 玩家主动抹除一切。给这个操作一个仪式感是值得的。 */
  purge(): void {
    this.storage?.removeItem(SAVE_KEY);
    this.storage?.removeItem(META_KEY);
  }

  private migrate(blob: SaveBlob): SaveBlob | null {
    if (blob.version === SAVE_VERSION) return blob;
    if (blob.version > SAVE_VERSION) {
      console.warn('[save] 存档来自更新的版本，拒绝加载');
      return null;
    }
    // 未来的版本迁移在这里逐级进行
    return { ...blob, version: SAVE_VERSION };
  }
}

export function emptyMeta(): MetaProgress {
  return {
    cyclesPlayed: 0,
    endingsSeen: [],
    knowledgeUnlocked: [],
    deepestDepth: 0,
    totalBreaths: 0,
    bestiary: {},
  };
}

export function emptyStigmata(): Record<StigmaKind, number> {
  return { silence: 0, listening: 0, drowned: 0, iron: 0, flesh: 0, apostasy: 0 };
}

export function newGameState(seed: number, cycle: number, knowledge: readonly ID[]): GameState {
  return {
    seed,
    cycle,
    phase: 'intro',
    breathsElapsed: 0,
    depth: 340,
    knowledge: [...knowledge],
    stigmata: emptyStigmata(),
    flags: {},
  };
}

/** 把一次轮回的结果并入 meta。死亡与通关都走这里。 */
export function foldIntoMeta(
  meta: MetaProgress,
  state: GameState,
  endingId: ID | null,
  bestiaryDelta: Record<ID, number>,
): MetaProgress {
  const endings = new Set(meta.endingsSeen);
  if (endingId) endings.add(endingId);
  const knowledge = new Set([...meta.knowledgeUnlocked, ...state.knowledge]);
  const bestiary = { ...meta.bestiary };
  for (const [k, v] of Object.entries(bestiaryDelta)) {
    bestiary[k] = Math.max(bestiary[k] ?? 0, v);
  }
  return {
    cyclesPlayed: meta.cyclesPlayed + 1,
    endingsSeen: [...endings],
    knowledgeUnlocked: [...knowledge],
    deepestDepth: Math.max(meta.deepestDepth, state.depth),
    totalBreaths: meta.totalBreaths + state.breathsElapsed,
    bestiary,
  };
}
