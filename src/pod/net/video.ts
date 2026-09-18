/**
 * 视频生成客户端。
 * ============================================================================
 * 这是整个仓库里**唯一**一个会发网络请求的文件，也是唯一一个有「延迟」概念的
 * 文件。它被刻意隔在这里，好让 sim/ 那一层继续是一个可以在无头环境里跑完
 * 一整条航线的纯状态机（见 sim/run.ts 的 footageSink）。
 *
 * 接口形状是实打出来的，不是猜的 —— 完整探测记录在 docs/video-api-probe.md。
 * 三句话版本：
 *
 *   1. POST /videos        → 只给一个 job id，status:"queued"。**没有视频 URL**
 *   2. GET  /videos/{id}   → 轮询 status 到 "completed"，约 9 秒。不计费
 *   3. GET  /videos/{id}/content → 直接吐 mp4 字节流，2 MB / 5 秒。不计费
 *
 * 端到端约 20 秒。**每次生成计费 $0.345**，所以调用方必须缓存
 * （见 view/footage.ts），而且默认是关着的（见下面的 VIDEO_ENABLED）。
 *
 * ## key 不进仓库
 *
 * 两种配法，默认走第一种：
 *
 *   A. dev proxy（推荐）—— `.env.local` 里写 `LITELLM_KEY=sk-...`（**不带**
 *      VITE_ 前缀），vite.config.ts 里的代理在 node 侧把它塞进
 *      Authorization 头。key 不会进 js 产物。
 *   B. 直连 —— `.env.local` 里写 `VITE_VIDEO_KEY=sk-...`。CORS 是放开的
 *      （实测 `access-control-allow-origin: *`），所以浏览器能直连。
 *      代价是 Vite 会把这个值**内联进打包产物**，等于公开你的 key。
 *      只在本地临时调试时用。
 *
 * 生产环境两种都不够：A 的代理只存在于 vite dev server 里。真要上线必须
 * 自己起一个后端做同样的事（转发 + 注入 key + 限流 + 计费保护）。
 * 这个问题不会自己消失，也没有纯前端的解法。
 */

/** 默认走 vite dev proxy。它等价于上游的 /v1 */
const API_BASE = (import.meta.env.VITE_VIDEO_API_BASE as string | undefined) ?? '/api/video';
/** 直连模式的 key。留空就不发 Authorization 头，由代理去补 */
const API_KEY = (import.meta.env.VITE_VIDEO_KEY as string | undefined) ?? '';
const MODEL = (import.meta.env.VITE_VIDEO_MODEL as string | undefined) ?? 'minimax-h3-max';

/**
 * 功能总开关，默认**关**。
 *
 * 一次拍摄 $0.345，而这是一个会被反复按的按钮。默认关掉意味着：
 * clone 下来直接 `npm run dev` 的人玩到的仍然是一个零依赖、零素材、
 * 完全离线的游戏（摄像头回落到程序化画面），不会有人因为好奇按了几十下
 * 就把额度烧掉。要开就在 `.env.local` 里写 `VITE_VIDEO_ENABLED=1`。
 */
export const VIDEO_ENABLED = /^(1|true|yes)$/i.test(
  (import.meta.env.VITE_VIDEO_ENABLED as string | undefined) ?? '',
);

/** 片长，秒。探测时用的 5，再长没意义 —— 屏幕上放不到两遍就该切走了 */
const DURATION = 5;

/** 首次轮询前先等这么久。生成实测约 9 秒，早问纯属浪费 */
const FIRST_POLL_DELAY = 6000;
const POLL_INTERVAL = 2500;
/** 整个流程的上限。sim 那边给了 100 秒，这里留一点余量先自己超时 */
const TOTAL_TIMEOUT = 88000;

export type VideoFailure =
  /** 没开开关，或者压根没配 */
  | { kind: 'disabled' }
  /** 提交就被拒了。401 = key 不对，400 = 请求体不对 */
  | { kind: 'submit'; status: number; detail: string }
  /**
   * 上游的内容审核把片子拦了。
   *
   * 这不是假想的失败：实拍时「七个溺死的人手挽着手、嘴都开着」那一段
   * 直接被驳回（`status: "failed"`，`error.message: "output new_sensitive"`），
   * 而且**失败照样计费**。本作是恐怖游戏，这一类拒绝会长期存在，
   * 所以它值得一个单独的分支 —— 调用方会拿一份不含怪物的提示词重试。
   */
  | { kind: 'filtered'; detail: string }
  /** 上游说生成失败 */
  | { kind: 'generate'; detail: string }
  /** 我们自己等不下去了 */
  | { kind: 'timeout' }
  /** fetch 直接炸了：断网、CORS、代理没起来 */
  | { kind: 'network'; detail: string };

/** 上游的审核拒绝措辞不统一，只能按关键词认 */
function isFilterRejection(detail: string): boolean {
  return /sensitive|content[_ ]?(policy|filter)|moderation|violat|prohibited|risk/i.test(detail);
}

export type VideoResult =
  | { ok: true; blob: Blob; videoId: string }
  | { ok: false; fail: VideoFailure };

/** 上游返回的 job 对象。只列我们真的会读的字段 */
interface VideoJob {
  id: string;
  status: 'queued' | 'in_progress' | 'processing' | 'completed' | 'failed' | string;
  error?: { message?: string } | null;
}

function headers(json: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  // 直连模式才带 key。走代理时这个头由 node 侧补上，前端不碰 key。
  if (API_KEY) h['Authorization'] = `Bearer ${API_KEY}`;
  return h;
}

/** 从上游的 `{error:{message}}` 里掏一句人话出来，掏不到就退回原文 */
async function errorDetail(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body.error?.message ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('aborted', 'AbortError'));
      },
      { once: true },
    );
  });

/**
 * 生成一段视频，拿到 mp4 的 Blob。
 *
 * 这个函数只会 reject 在 AbortError 上；其他一切失败都走返回值，
 * 因为调用方（view/footage.ts）对每一种失败都有一句对应的游戏内台词，
 * 而 try/catch 里区分不出「key 不对」和「断网」。
 */
export async function requestVideo(prompt: string, signal?: AbortSignal): Promise<VideoResult> {
  if (!VIDEO_ENABLED) return { ok: false, fail: { kind: 'disabled' } };

  const deadline = Date.now() + TOTAL_TIMEOUT;

  // ── 1. 提交 ────────────────────────────────────────────────────────────
  // 注意 size 这个参数上游**不尊重**：请求 480p，回来的是 768p 16:9。
  // 照样发是为了将来它被修好的那一天，但客户端不能依赖它 ——
  // 降到游戏分辨率的活全在 view/footage.ts 里干。
  let job: VideoJob;
  try {
    const res = await fetch(`${API_BASE}/videos`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ model: MODEL, prompt, duration: DURATION, size: '480p' }),
      signal,
    });
    if (!res.ok) {
      return { ok: false, fail: { kind: 'submit', status: res.status, detail: await errorDetail(res) } };
    }
    job = (await res.json()) as VideoJob;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    return { ok: false, fail: { kind: 'network', detail: String(e) } };
  }

  if (!job.id) return { ok: false, fail: { kind: 'generate', detail: '响应里没有 job id' } };

  // ── 2. 轮询 ────────────────────────────────────────────────────────────
  await sleep(FIRST_POLL_DELAY, signal);
  while (job.status !== 'completed') {
    if (Date.now() > deadline) return { ok: false, fail: { kind: 'timeout' } };
    if (job.status === 'failed' || job.error) {
      const detail = job.error?.message ?? 'status=failed';
      return { ok: false, fail: { kind: isFilterRejection(detail) ? 'filtered' : 'generate', detail } };
    }
    try {
      const res = await fetch(`${API_BASE}/videos/${encodeURIComponent(job.id)}`, {
        headers: headers(false),
        signal,
      });
      if (!res.ok) {
        return { ok: false, fail: { kind: 'generate', detail: await errorDetail(res) } };
      }
      job = (await res.json()) as VideoJob;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') throw e;
      return { ok: false, fail: { kind: 'network', detail: String(e) } };
    }
    if (job.status !== 'completed') await sleep(POLL_INTERVAL, signal);
  }

  // ── 3. 取片 ────────────────────────────────────────────────────────────
  // 这一步没有 JSON 中转，直接是字节流。也不计费，所以同一个 id
  // 可以反复取 —— view/footage.ts 的 sessionStorage 缓存就靠这一点。
  try {
    const res = await fetch(`${API_BASE}/videos/${encodeURIComponent(job.id)}/content`, {
      headers: headers(false),
      signal,
    });
    if (!res.ok) {
      return { ok: false, fail: { kind: 'generate', detail: await errorDetail(res) } };
    }
    const blob = await res.blob();
    if (blob.size < 1024) {
      return { ok: false, fail: { kind: 'generate', detail: `片子只有 ${blob.size} 字节` } };
    }
    return { ok: true, blob, videoId: job.id };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    return { ok: false, fail: { kind: 'network', detail: String(e) } };
  }
}

/**
 * 只把已经生成好的片子取回来。
 *
 * 用于 sessionStorage 命中的情况：刷新页面之后 blob 没了，但 job id 还在，
 * 而取片是免费的。这是「同一个站点不要反复生成」的第二道防线 ——
 * 第一道是内存缓存，它挡不住 F5。
 */
export async function fetchVideoContent(videoId: string, signal?: AbortSignal): Promise<VideoResult> {
  if (!VIDEO_ENABLED) return { ok: false, fail: { kind: 'disabled' } };
  try {
    const res = await fetch(`${API_BASE}/videos/${encodeURIComponent(videoId)}/content`, {
      headers: headers(false),
      signal,
    });
    if (!res.ok) {
      return { ok: false, fail: { kind: 'generate', detail: await errorDetail(res) } };
    }
    const blob = await res.blob();
    if (blob.size < 1024) return { ok: false, fail: { kind: 'generate', detail: '片子是空的' } };
    return { ok: true, blob, videoId };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    return { ok: false, fail: { kind: 'network', detail: String(e) } };
  }
}

/**
 * 把技术失败翻译成舱里那个人会说的话。
 *
 * 玩家不该看见 HTTP 状态码。这个映射表存在的唯一理由是：
 * 一个失败的请求必须读起来像一卷废掉的胶片，而不是像一个 bug。
 */
export function failureLine(fail: VideoFailure): string {
  switch (fail.kind) {
    case 'disabled':
      return '冲洗槽是空的。药水在 KYRIE-9 上，而 KYRIE-9 已经不在了。';
    case 'submit':
      return fail.status === 401
        ? '冲洗机认不出这卷片子的编号。它不是这条船上的东西。'
        : '快门和冲洗槽之间那根线接不上。这一卷废了。';
    case 'filtered':
      // 审核驳回在世界观里就是「有一段被人剪掉了」。这比任何报错都合适。
      return '片子中间少了一截。切口很整齐 —— 是被人剪掉的，不是烧掉的。';
    case 'generate':
      return '片子冲坏了。显影一半的时候整卷起了雾。';
    case 'timeout':
      return '冲洗槽转了很久。你把它打开的时候，里面还是一卷黑的。';
    case 'network':
      return '信号中断。冲洗槽那头没人接。';
  }
}
