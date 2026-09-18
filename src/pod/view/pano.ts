/**
 * 站点全景。
 * ============================================================================
 * 摄像头在站点上是**不动的** —— 舱已经停稳，只有云台在转。视点固定这件事，
 * 恰好是等距柱状全景唯一成立的条件：一张 360°×180° 的图，按 pan/tilt/zoom
 * 取一个窗口出来，就是一台能左右摇、能推拉的摄像机。航渡阶段不能用它，
 * 因为那时候舱在动，而一张全景图没有视差。
 *
 * 这里不读任何外部素材。`bake()` 把一个解析式的小房间（几个 AABB，加一盏
 * 和镜头同轴的探照灯）逐纹素投影成等距柱状图。烘一次，之后一直用。
 *
 * 换成外部生成的全景图时只要替换 bake 这一半 —— 采样与合成那一半不用动，
 * 它只关心「一张 2:1 的 RGBA」。
 *
 * 通道约定：
 *   RGB = 探照灯全开时这个纹素的颜色；
 *   A   = 不依赖探照灯的自发光（还亮着的应急灯带，以及它打在附近钢板上的光）。
 * 所以关灯不是把画面乘成全黑，而是只剩那几条灯带 —— 这正是我们要的。
 */

import { fbm2, hash2, valueNoise2 } from '@/core/rng';
import { clamp, clamp01 } from '@/core/util';
import { hexToRgb, PALETTE } from '@/render/palette';
import type { SitePano } from '../content/route';
import type { PodRun } from '../sim/run';

const TAU = Math.PI * 2;

export interface PanoSource {
  readonly w: number;
  readonly h: number;
  /** RGBA，长度 w*h*4。见文件头的通道约定 */
  readonly px: Uint8ClampedArray;
}

// ============================================================================
// 烘焙：一个解析式的房间 → 等距柱状图
// ============================================================================

/** 等距柱状图的分辨率。2:1 是硬性的，改宽度就行 */
const PANO_W = 640;
const PANO_H = 320;

type V3 = [number, number, number];

type MatId = 'hull' | 'deck' | 'ceil' | 'bunk' | 'strip';

interface Solid {
  min: V3;
  max: V3;
  mat: MatId;
  /** 自发光强度。只有还没烧掉的灯带是正的 */
  emis: number;
}

/**
 * 倒扣的医务艇内部。
 *
 * 镜头在原点，+Z 朝艇内深处，+Y 是**玩家的上方**。艇是底朝天卡在沟壁上的，
 * 所以这个房间上下颠倒：y=+1.4 那面其实是艇的地板（所以有格栅，担架床
 * 从上面倒挂下来），y=-1.5 那面是艇的天花板（所以灯带在脚下）。
 * 这不是炫技，是让玩家在第一眼就看出「这艘船翻了」。
 */
const ROOM_MIN: V3 = [-2.6, -1.5, -1.25];
const ROOM_MAX: V3 = [2.6, 1.4, 8.4];

/** 艇门的洞开在 -Z 那面墙上。穿过它的射线看到的是沟里的黑水 */
const HATCH_HALF_X = 0.92;
const HATCH_HALF_Y = 0.92;

/** 唯一还亮着的那条灯带的中心。它是关灯之后画面里仅剩的东西 */
const LIVE_STRIP: V3 = [0, -1.44, 4.2];

function buildRoom(): Solid[] {
  const s: Solid[] = [];

  // 倒挂的担架床。四张，左右交替，越往里越歪。
  for (let i = 0; i < 4; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const z0 = 1.15 + i * 1.75;
    const xc = side * (1.58 + hash2(i, 41) * 0.18);
    s.push({ min: [xc - 0.6, 0.5, z0], max: [xc + 0.6, 0.71, z0 + 1.62], mat: 'bunk', emis: 0 });
    // 支架：从床板接回艇的地板（在我们头顶）
    for (const zp of [z0 + 0.12, z0 + 1.42]) {
      s.push({ min: [xc - 0.5, 0.71, zp], max: [xc - 0.42, 1.4, zp + 0.08], mat: 'hull', emis: 0 });
      s.push({ min: [xc + 0.42, 0.71, zp], max: [xc + 0.5, 1.4, zp + 0.08], mat: 'hull', emis: 0 });
    }
  }

  // 药柜，贴在右舷
  s.push({ min: [2.18, -0.85, 4.3], max: [2.6, 0.32, 5.95], mat: 'hull', emis: 0 });

  // 深处的隔舱壁，中间留一道门。AABB 开不了洞，所以拆成左右两扇加一道门楣。
  const bz0 = 6.55;
  const bz1 = 6.82;
  s.push({ min: [-2.6, -1.5, bz0], max: [-0.6, 1.4, bz1], mat: 'hull', emis: 0 });
  s.push({ min: [0.6, -1.5, bz0], max: [2.6, 1.4, bz1], mat: 'hull', emis: 0 });
  s.push({ min: [-0.6, 0.34, bz0], max: [0.6, 1.4, bz1], mat: 'hull', emis: 0 });

  // 脚下的应急灯带。三条，只有中间那条还活着。
  for (let i = 0; i < 3; i++) {
    const z0 = 0.7 + i * 2.6;
    s.push({
      min: [-0.34, -1.5, z0],
      max: [0.34, -1.41, z0 + 1.55],
      mat: 'strip',
      emis: i === 1 ? 1 : 0,
    });
  }

  return s;
}

const MAT_RGB: Record<MatId, V3> = {
  hull: hexToRgb(PALETTE.steel) as unknown as V3,
  deck: hexToRgb(PALETTE.steelDark) as unknown as V3,
  ceil: hexToRgb(PALETTE.steelLit) as unknown as V3,
  bunk: hexToRgb(PALETTE.boneDim) as unknown as V3,
  strip: hexToRgb(PALETTE.rustDeep) as unknown as V3,
};
const RUST_RGB3 = hexToRgb(PALETTE.rustDeep) as unknown as V3;

/**
 * 表面细节。返回一个 0..1 的明度系数。
 *
 * 只用两样东西：接缝（把大平面切成钢板）和锈斑（让接缝不整齐）。
 * 分辨率这么低、后面还要过一层降质，再多的细节都会被噪点吃掉。
 */
function surfaceDetail(mat: MatId, u: number, v: number): { shade: number; rust: number } {
  if (mat === 'strip') return { shade: 1, rust: 0 };
  if (mat === 'bunk') {
    const seam = Math.abs((u * 3) % 1 - 0.5) < 0.46 ? 1 : 0.7;
    return { shade: seam * (0.82 + valueNoise2(u * 6, v * 6, 71) * 0.18), rust: 0.15 };
  }
  // 钢板接缝。板子要大、缝要浅 —— 缝一密就变成瓷砖墙了。
  const plate = 1.15;
  const su = Math.abs(((u / plate) % 1 + 1) % 1 - 0.5);
  const sv = Math.abs(((v / plate) % 1 + 1) % 1 - 0.5);
  const seam = Math.min(su, sv) < 0.028 ? 0.58 : 1;
  // 铆钉：接缝交点附近的小亮点
  const rivet = su > 0.455 && sv > 0.455 ? 1.25 : 1;
  // 两级脏：大块的不均匀 + 细一点的水渍
  const blotch = 0.42 + fbm2(u * 0.55, v * 0.55, 3, 91) * 1.05;
  const grime = 0.74 + valueNoise2(u * 2.3, v * 2.3, 17) * 0.36;
  const rust = clamp01(fbm2(u * 0.75 + 4, v * 0.75, 4, 23) * 2.1 - 0.78);
  const grid = mat === 'deck' && (su < 0.14 || sv < 0.14) ? 0.52 : 1;
  return { shade: seam * rivet * grime * blotch * grid, rust };
}

/** 命中面上的两个切向坐标，用来贴细节 */
function surfUV(p: V3, axis: number): [number, number] {
  if (axis === 0) return [p[2], p[1]];
  if (axis === 1) return [p[0], p[2]];
  return [p[0], p[1]];
}

/**
 * 把房间烘成等距柱状图。
 *
 * 每个纹素发一条射线：先求它从外壳哪一面出去，再看有没有更近的实体挡住。
 * 光照只有两盏 —— 和镜头同轴的探照灯（所以 N·L 就是 |n·-d|），
 * 和脚下那条还活着的灯带。没有阴影，没有反弹；这个画面最后要被压成
 * 一块掉帧的屏，多算的每一分都看不见。
 */
function bakeRoom(): PanoSource {
  const px = new Uint8ClampedArray(PANO_W * PANO_H * 4);
  const solids = buildRoom();
  const n = solids.length;

  // 摊平成定长数组：内层循环里不碰对象属性，快很多
  const bmin = new Float64Array(n * 3);
  const bmax = new Float64Array(n * 3);
  const bemis = new Float64Array(n);
  const bmat: MatId[] = [];
  for (let i = 0; i < n; i++) {
    const s = solids[i]!;
    bmin[i * 3] = s.min[0]; bmin[i * 3 + 1] = s.min[1]; bmin[i * 3 + 2] = s.min[2];
    bmax[i * 3] = s.max[0]; bmax[i * 3 + 1] = s.max[1]; bmax[i * 3 + 2] = s.max[2];
    bemis[i] = s.emis;
    bmat.push(s.mat);
  }

  const hit: V3 = [0, 0, 0];
  const nrm: V3 = [0, 0, 0];

  for (let y = 0; y < PANO_H; y++) {
    const lat = (0.5 - (y + 0.5) / PANO_H) * Math.PI;
    const cl = Math.cos(lat);
    const dy = Math.sin(lat);
    for (let x = 0; x < PANO_W; x++) {
      const lon = ((x + 0.5) / PANO_W - 0.5) * TAU;
      const dx = Math.sin(lon) * cl;
      const dz = Math.cos(lon) * cl;

      // --- 1. 外壳：从内部求出射点 ---
      let t = Infinity;
      let axis = 0;
      let sign = 1;
      for (let a = 0; a < 3; a++) {
        const d = a === 0 ? dx : a === 1 ? dy : dz;
        if (Math.abs(d) < 1e-9) continue;
        const bound = d > 0 ? ROOM_MAX[a]! : ROOM_MIN[a]!;
        const tt = bound / d;
        if (tt > 0 && tt < t) { t = tt; axis = a; sign = d > 0 ? -1 : 1; }
      }
      let mat: MatId = axis === 1 ? (sign < 0 ? 'deck' : 'ceil') : 'hull';
      let emis = 0;
      let outside = false;

      // 艇门的洞：从 -Z 那面出去且落在洞里 = 看见沟里的水
      if (axis === 2 && sign > 0) {
        const hx = dx * t;
        const hy = dy * t;
        if (Math.abs(hx) < HATCH_HALF_X && Math.abs(hy) < HATCH_HALF_Y) outside = true;
      }

      // --- 2. 实体：有没有更近的 ---
      for (let i = 0; i < n; i++) {
        let t0 = 0;
        let t1 = t;
        let ea = -1;
        let es = 1;
        for (let a = 0; a < 3; a++) {
          const d = a === 0 ? dx : a === 1 ? dy : dz;
          const lo = bmin[i * 3 + a]!;
          const hi = bmax[i * 3 + a]!;
          if (Math.abs(d) < 1e-9) {
            if (0 < lo || 0 > hi) { t0 = t1 + 1; break; }
            continue;
          }
          const inv = 1 / d;
          let ta = lo * inv;
          let tb = hi * inv;
          let s = -1;
          if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; s = 1; }
          if (ta > t0) { t0 = ta; ea = a; es = s; }
          if (tb < t1) t1 = tb;
          if (t0 > t1) break;
        }
        if (t0 <= t1 && t0 > 1e-4 && t0 < t && ea >= 0) {
          t = t0;
          axis = ea;
          sign = es;
          mat = bmat[i]!;
          emis = bemis[i]!;
          outside = false;
        }
      }

      const o = (y * PANO_W + x) * 4;

      if (outside) {
        // 门外。一点点朝下变暗的沟水，仅此而已 —— 外面本来就该什么都没有。
        const murk = 0.030 + clamp01(0.5 - dy) * 0.022;
        px[o] = murk * 255 * 0.55;
        px[o + 1] = murk * 255 * 0.8;
        px[o + 2] = murk * 255 * 1.15;
        px[o + 3] = 0;
        continue;
      }

      hit[0] = dx * t; hit[1] = dy * t; hit[2] = dz * t;
      nrm[0] = 0; nrm[1] = 0; nrm[2] = 0;
      nrm[axis] = sign;

      const [uu, vv] = surfUV(hit, axis);
      const det = surfaceDetail(mat, uu, vv);
      const base = MAT_RGB[mat];
      let ar = base[0] * det.shade;
      let ag = base[1] * det.shade;
      let ab = base[2] * det.shade;
      if (det.rust > 0) {
        ar += (RUST_RGB3[0] - ar) * det.rust * 0.85;
        ag += (RUST_RGB3[1] - ag) * det.rust * 0.85;
        ab += (RUST_RGB3[2] - ab) * det.rust * 0.85;
      }

      // 探照灯：和镜头同轴，所以入射方向就是 -d。
      // 衰减故意收得很紧 —— 房间的深处必须是黑的，那才是玩家会去照的地方。
      const nl = Math.abs(nrm[0] * dx + nrm[1] * dy + nrm[2] * dz);
      const fall = 1 / (1 + (t / 2.15) * (t / 2.15));
      const key = Math.min(1.1, nl * fall * 1.45) + 0.022;

      // 水对红光的吸收比蓝光快得多。这条比任何贴图都更能说明「这里灌满了水」。
      const ab_r = Math.exp(-t * 0.062);
      const ab_g = Math.exp(-t * 0.028);
      const ab_b = Math.exp(-t * 0.011);

      px[o] = clamp01(ar * key * ab_r) * 255;
      px[o + 1] = clamp01(ag * key * ab_g) * 255;
      px[o + 2] = clamp01(ab * key * ab_b) * 255;

      // 自发光通道：灯带本身 + 它打在附近钢板上的那一点
      let glow = emis * 2.4;
      if (emis <= 0) {
        const lx = hit[0] - LIVE_STRIP[0];
        const ly = hit[1] - LIVE_STRIP[1];
        const lz = hit[2] - LIVE_STRIP[2];
        const d2 = lx * lx + ly * ly + lz * lz;
        const dist = Math.sqrt(d2) + 1e-4;
        const lnl = Math.abs((nrm[0] * lx + nrm[1] * ly + nrm[2] * lz) / dist);
        const lum = (ar + ag + ab) * 0.333;
        glow = (lnl / (1 + d2 * 0.55)) * lum * 2.6;
      }
      px[o + 3] = clamp01(glow) * 255;
    }
  }

  return { w: PANO_W, h: PANO_H, px };
}

const BAKERS: Record<SitePano, () => PanoSource> = {
  medbay: bakeRoom,
};

const CACHE = new Map<SitePano, PanoSource>();

/** 烘一次就留着。第一次调用会卡一下，之后是零成本 */
export function getPano(kind: SitePano): PanoSource {
  let p = CACHE.get(kind);
  if (!p) {
    p = BAKERS[kind]();
    CACHE.set(kind, p);
  }
  return p;
}

/**
 * 这一刻摄像头该看见全景吗。
 * 只有停在站点上、而且这个站点配了全景，才算数 —— 航渡时舱在动，
 * 一张没有视差的图会立刻穿帮。
 */
export function sitePano(run: PodRun): PanoSource | null {
  if (run.phase !== 'site') return null;
  const kind = run.leg.pano;
  return kind ? getPano(kind) : null;
}

// ============================================================================
// 采样：等距柱状图 → 云台窗口
// ============================================================================

export interface PanoView {
  /** 云台方位，弧度。0 = 舱首正前 */
  pan: number;
  tilt: number;
  zoom: number;
  /** 探照灯总量 0..1。乘在 RGB 上，自发光不受影响 */
  light: number;
  corruption: number;
  time: number;
}

/** zoom=1 时的垂直视场角。再宽就开始有鱼眼味了 */
const FOV_Y = 1.16;

let scratch: ImageData | null = null;
let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;
let scratchW = 0;
let scratchH = 0;

const EMBER = hexToRgb(PALETTE.ember);

/**
 * 近似 atan2，最大误差约 1e-5 弧度。
 *
 * 采样循环里每个像素要算两次反三角，`Math.atan2` 在这儿是单项最大开销。
 * 一万分之一弧度的误差落到一张 200 像素宽、之后还要被噪点糊掉的画面上，
 * 连半个像素都不到。
 */
function fastAtan2(y: number, x: number): number {
  const ax = x < 0 ? -x : x;
  const ay = y < 0 ? -y : y;
  const a = (ax < ay ? ax : ay) / ((ax > ay ? ax : ay) + 1e-12);
  const s = a * a;
  let r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
  if (ay > ax) r = 1.5707963267948966 - r;
  if (x < 0) r = Math.PI - r;
  return y < 0 ? -r : r;
}

/**
 * 按云台角度把全景采样进一块 RGBA 缓冲。
 *
 * 和画布无关，所以离线工具能直接调它出预览图 —— 全景这种东西不看图是调不动的。
 */
export function samplePanoWindow(
  pano: PanoSource,
  view: PanoView,
  bw: number,
  bh: number,
  out: Uint8ClampedArray,
): void {
  const src = pano.px;
  const pw = pano.w;
  const ph = pano.h;

  const tanY = Math.tan(FOV_Y / (2 * Math.max(1, view.zoom)));
  const tanX = tanY * (bw / bh);
  const cp = Math.cos(view.pan);
  const sp = Math.sin(view.pan);
  const ct = Math.cos(view.tilt);
  const st = Math.sin(view.tilt);
  const light = clamp01(view.light);
  const corr = clamp01(view.corruption);

  for (let y = 0; y < bh; y++) {
    const ndcY = 1 - (2 * (y + 0.5)) / bh;
    const cy = ndcY * tanY;
    // 磁带跑偏：每一行横向抖一点点。污染越高抖得越凶。
    const wob = corr > 0.01
      ? (valueNoise2(y * 0.7, view.time * 2.1, 5) - 0.5) * corr * 0.06
      : 0;
    for (let x = 0; x < bw; x++) {
      const cx = (((2 * (x + 0.5)) / bw) - 1) * tanX;

      // 相机空间 (cx, cy, 1) → 先俯仰，再偏航
      const y1 = cy * ct - st;
      const z1 = cy * st + ct;
      const dx = cx * cp + z1 * sp;
      const dz = -cx * sp + z1 * cp;

      // 纬度用 atan2(y, |xz|) 算，比 asin(y/len) 少一次三维开方
      const rxz = Math.sqrt(dx * dx + dz * dz);
      const lon = fastAtan2(dx, dz) + wob;
      const lat = fastAtan2(y1, rxz);

      let u = (lon / TAU + 0.5) * pw;
      u -= Math.floor(u / pw) * pw;
      let v = (0.5 - lat / Math.PI) * ph;
      if (v < 0) v = 0;
      else if (v > ph - 1) v = ph - 1;

      const si = ((v | 0) * pw + (u | 0)) * 4;
      const em = src[si + 3]! / 255;
      const o = (y * bw + x) * 4;
      out[o] = src[si]! * light + EMBER[0] * 255 * em;
      out[o + 1] = src[si + 1]! * light + EMBER[1] * 255 * em;
      out[o + 2] = src[si + 2]! * light + EMBER[2] * 255 * em;
      out[o + 3] = 255;
    }
  }
}

/**
 * 把全景的一个窗口画进摄像头屏。
 *
 * 故意在一块低分辨率缓冲上采样再放大：一来省掉几倍的三角函数，二来这台
 * 摄像头本来就该是糊的 —— 欠采样在这里不是瑕疵，是画风。
 */
export function drawPanoWindow(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  pano: PanoSource,
  view: PanoView,
): void {
  const bw = Math.max(64, Math.min(240, Math.round(w / 2.6)));
  const bh = Math.max(36, Math.round((bw * h) / Math.max(1, w)));
  if (!scratch || !scratchCanvas || scratchW !== bw || scratchH !== bh) {
    scratch = ctx.createImageData(bw, bh);
    scratchCanvas = document.createElement('canvas');
    scratchCanvas.width = bw;
    scratchCanvas.height = bh;
    scratchCtx = scratchCanvas.getContext('2d');
    scratchW = bw;
    scratchH = bh;
  }
  if (!scratchCtx) return;

  samplePanoWindow(pano, view, bw, bh, scratch.data);

  // 放大回屏幕尺寸。中间要过一块画布，因为 putImageData 不做缩放。
  scratchCtx.putImageData(scratch, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(scratchCanvas, 0, 0, bw, bh, 0, 0, w, h);
  ctx.restore();
}
