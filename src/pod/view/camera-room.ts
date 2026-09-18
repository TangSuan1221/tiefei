/**
 * 探照灯下的这一间房 —— 摄像头实景。
 * ============================================================================
 * 全息屏画的是同一间房的线框，这里画的是同一间房的肉。两边的几何都来自
 * `roomview.ts`：`buildRoom` 出面片，`projectRoom` 出屏幕坐标。玩家在全息屏上
 * 读到「右 22° · 4.1m 有一只货箱」，把云台拧到 22°，那只箱子就必须压在准星上。
 *
 * 这里没有环境光。受光算出来是 0 的地方就是纯黑 —— 一千米以下本来就是这样，
 * 而「开灯」这个动作的分量全部来自这个对比。所以任何「保底亮度」都不许加，
 * 只在两米半以内留一点点漫反射轮廓（那是舱体自己的信号管在漏光）。
 *
 * 画法是 albedo x illumination：材质按满受光画，受光单独攒在一张低分辨率的遮罩上，
 * 最后整幅乘一遍。这两件事混在一起写过一版，结果是每一层（底色、锈、焊缝、铆钉、
 * 高光）都各自乘一遍所在小块的受光，于是细分边界上每一层都各自跳一次 —— 墙上浮出
 * 一张方格。分开之后，受光只有一处、而且是逐顶点线性插值的，接缝在数学上就没了。
 */

import { fbm2, hash2, valueNoise2 } from '@/core/rng';
import { clamp, clamp01, lerp, smoothstep } from '@/core/util';
import { PALETTE, hexToRgb, rgba } from '@/render/palette';
import { makeCanvas, makeGritTile, roundRect, shadeHex } from '@/render/interior';
import type { ObstacleKind } from '../gen/interior';
import type { Vec3, Volume } from '../gen/volume';
import { cjk } from '@/ui/typography';
import {
  basisOf,
  buildRoom,
  focalFor,
  litnessAt,
  litnessCorners,
  projectRoom,
  type Eye,
  type EyeBasis,
  type LampSpec,
  type ProjQuad,
  type RoomGeometry,
  type RoomQuad,
  type Viewport,
} from './roomview';

const TAU = Math.PI * 2;

/** zoom=1 时的竖直半视场角。和 pano.ts 的 FOV_Y/2 对齐，换片源时画面不跳 */
const HALF_FOV = 0.58;

/** 近裁面。比 roomview 的 NEAR 略大一点，避免除出天文数字的顶点 */
const NEAR_CLIP = 0.18;

/** 深度雾的半程距离（米）。水下体积散射是这个游戏的气质，不能省 */
const FOG_HALF = 11;

export interface RoomMark {
  obstacleId: string;
  /** 封条颜色读数，灯照到才看得见 */
  seal?: string;
  label?: string;
  searched?: number;
  passes?: number;
  /** 机械手当前瞄着的那一只 */
  aimed?: boolean;
  /** 机械手实际瞄准的表面点，距离读数与操作判定共用。 */
  aimPoint?: Vec3;
}

export interface RoomCameraInput {
  vol: Volume;
  nodeId: string;
  eye: Eye;
  zoom: number;
  /** 0..1，探照灯 + 信号管 */
  light: number;
  time: number;
  /** 0..1 画面污染 */
  corruption: number;
  marks?: readonly RoomMark[];
}

/**
 * 摄像头云台的视点。
 *
 * 镜头光心刻意和舱体导航基准点重合，**没有**安装偏置。现实里镜头当然焊在舱壳
 * 外面，但全息屏是从 `run.cabinPos` 画的：只要两个视点不是同一个点，近处货箱
 * 的方位就会差出几度，四米处足够差掉十几个像素，玩家会觉得全息屏在骗他。
 * 「灯在舱外」这件事由 `lampOf()` 单独承担 —— 偏的是灯，不是镜头。
 */
export function cameraEye(
  pos: Vec3,
  heading: number,
  pitch: number,
  camPan: number,
  camTilt: number,
): Eye {
  return {
    pos: { x: pos.x, y: pos.y, z: pos.z },
    yaw: (((heading + (camPan * 180) / Math.PI) % 360) + 360) % 360,
    pitch: clamp(pitch + (camTilt * 180) / Math.PI, -86, 86),
  };
}


/** 把这一间房画进已经 clip 好的矩形。原点是左上角 */
export function drawRoomCamera(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  input: RoomCameraInput,
): void {
  const start = mark();
  const light = clamp01(fin(input.light, 0));
  const min = Math.min(w, h);
  const b = basisOf(input.eye);
  // 灯要比几何先算出来：面片怎么切跟着光走，暗处一刀不切
  const lamp = lampOf(input.eye, b, light);
  const geo = roomGeometryLit(input.vol, input.nodeId, lamp);

  if (!geo || min < 8) {
    drawWaterFloor(ctx, w, h, light);
    return;
  }

  const zoom = clamp(fin(input.zoom, 1), 0.5, 4);
  const vp: Viewport = { cx: w * 0.5, cy: h * 0.5, focal: focalFor(min, HALF_FOV / zoom) };
  const quads = projectScene(geo, input.eye, vp);
  const time = fin(input.time, 0);
  const rot = spin(input.eye, time);
  const shearAt = jellyShear(h, vp.focal, time, fin(input.corruption, 0), rot);
  const env: Env = {
    light,
    decay: corrosionOf(input.vol, fin(input.corruption, 0)),
    haze: hazeOf(light),
    min,
    w,
    h,
  };
  const marks = markIndex(input.marks);
  const plates = marks.size ? faceToward(quads) : null;

  // 多边形先全部算出来。这一步不碰画布，但它决定了后面能跳掉多少刀
  const polys: (Pt2[] | null)[] = [];
  for (const q of quads) {
    const poly = screenPoly(q, shearAt);
    if (poly.length < 3) {
      polys.push(null);
      continue;
    }
    // 近裁面切完之后，身侧那些墙会投成一块巨大的、整片在画面外的多边形。
    // 它照样要走 clip + 渐变 + 两层贴图，那是纯烧帧率
    const bb = bbox(poly);
    const off = bb.x > w || bb.y > h || bb.x + bb.w < 0 || bb.y + bb.h < 0;
    polys.push(off ? null : poly);
  }

  // 画家算法最贵的地方是重绘：贴着镜头的一面墙把整个视口盖住，它后面那十几块面
  // 还是会被完整地铺一遍底色、锈层、砂砾。找到最近的那块「盖满视口」的面，
  // 它后面的全部跳掉 —— 每一块面都是一次全屏级别的 blit，这一刀省的是毫秒。
  //
  // 判「盖满」要按**整面**判，不能按细分出来的小块判：贴着镜头的那面墙正是被照亮
  // 的那一面，自适应细分会把它切得最碎，于是没有任何一小块能单独盖满视口，这一刀
  // 就永远砍不下去了。整面那一份本来就在手上（全息屏用的就是它）。
  const coverDepth = coveringDepth(roomGeometry(input.vol, input.nodeId), input.eye, vp, w, h);

  const faces = faceIndex(quads, polys);
  const tier = quality();
  const scene = beginScene(w, h);
  const g = scene ? scene.ctx : ctx;
  const mask = layerBuf('lit', w, h, MASK_DIV);
  const haze = layerBuf('haze', w, h, MASK_DIV);
  // 灯关着的时候既没有镜面反射也没有反弹光，整层连缓冲都不建
  const glint = light > 0.02 ? layerBuf('glint', w, h, GLINT_DIV) : null;
  const layers: Layers = {
    mask: mask?.ctx ?? null,
    haze: haze?.ctx ?? null,
    glint: glint?.ctx ?? null,
    lit: false,
  };
  const drawn: Painted[] = [];
  // 房间之外什么都没有。画进离屏里，合成那一刀就是不透明拷贝而不是混色
  drawWaterFloor(g, w, h, light);

  // 舱壁和障碍分两段画，投影插在中间 —— 影子落在舱壁和地板上，不属于障碍
  const split = quads.findIndex((q) => q.src.kind === 'obstacle');
  const wallEnd = split < 0 ? quads.length : split;

  const fallback: FaceInfo = { pxPerM: 24, dim: 0.5 };
  const paint = (i: number): void => {
    const poly = polys[i];
    if (!poly) return;
    const q = quads[i];
    // 被那面盖满视口的墙挡在后面。留一点余量：同一面墙上的小块深度各不相同，
    // 按面心深度比会把盖住视口的那一面自己的远端小块也砍掉
    if (q.src.kind !== 'obstacle' && q.depth > coverDepth + 0.35) return;
    drawn.push({ poly, depth: q.depth });
    const info = faces.get(parentOf(q.src.id)) ?? fallback;
    const mat = matOf(q.src);
    const sh = shadeOf(q, lamp, input.eye.pos, glossOf(mat, env.decay));
    paintQuad(g, layers, poly, q, mat, sh, info, env, marks, plates);
  };

  for (let i = 0; i < wallEnd; i++) paint(i);
  // 房间的面一块都没画就不用画影子：那说明有个障碍贴在镜头上，挡光的是它自己。
  // 影子画在受光那一层上，不画在底色上 —— 影子就是「这里没有光」，不是
  // 「这里的铁是黑的」。画在底色上会被后面那一遍受光再乘一次，本来就暗的地方
  // 黑成一个洞，而灯扫过去的时候影子不会跟着亮起来
  const casts = drawn.length ? castsOf(geo, b, vp, lamp, light, shearAt) : [];
  drawCastShadows(layers.mask ?? g, casts);
  for (let i = wallEnd; i < quads.length; i++) paint(i);

  // 反弹光要等所有面片都把自己的镜面项涂完再洒，它是叠在那一层上的
  if (layers.glint && drawBounce(layers.glint, casts, env.decay)) layers.lit = true;

  // 受光、雾、高光在这里各盖一遍。必须在海雪和锥雾之前 —— 那两层是水里的散射，
  // 不该跟着表面的明暗走
  applyLayers(g, mask, haze, layers.lit ? glint : null, w, h);

  // 海雪按深度插进画家序列：飘到箱子前面的那几片要挡住封条
  drawSnow(g, w, h, time, light, zoom, drawn);
  drawConeScatter(g, w, h, light, zoom);

  if (scene) {
    composite(scene, w, h, drawn, time, light, tier);
    // 污渍在玻璃上，所以它在景深之后、上采之前 —— 跟着回路一起被压过一遍
    drawLensDirt(scene.ctx, w, h, light, time);
    blit(ctx, scene, w, h);
  } else {
    drawLensDirt(ctx, w, h, light, time);
  }

  drawAimBrackets(ctx, w, h, geo, input, b, vp, shearAt);
  drawVignette(ctx, w, h, light);
  drawMonitorCircuit(ctx, w, h, time, light, fin(input.corruption, 0), rot);
  charge(start);
}

interface Painted {
  poly: Pt2[];
  depth: number;
}

function markIndex(marks: readonly RoomMark[] | undefined): Map<string, RoomMark> {
  const m = new Map<string, RoomMark>();
  if (marks) for (const k of marks) m.set(k.obstacleId, k);
  return m;
}

/**
 * 每只障碍最正对镜头的那一面。铭牌就漆在这一面上 —— 挑一次，不然五个面上会
 * 出现五张一样的牌子。
 */
function faceToward(quads: readonly ProjQuad[]): Map<string, string> {
  const best = new Map<string, { id: string; score: number }>();
  for (const q of quads) {
    const id = q.src.obstacleId;
    if (q.src.kind !== 'obstacle' || !id) continue;
    // facing 越负越正对；再乘面积，免得挑到一条窄边
    const score = -q.facing * q.src.area;
    const cur = best.get(id);
    if (!cur || score > cur.score) best.set(id, { id: q.src.id, score });
  }
  const out = new Map<string, string>();
  for (const [k, v] of best) out.set(k, v.id);
  return out;
}


// ============================================================================
// 几何缓存
// ============================================================================

interface GeoSlot {
  key: string;
  /** 整面的那一份。全息屏画线框用它 */
  coarse: RoomGeometry;
  /** 细分过的那一份。摄像头要按小块取光照。切法跟着灯走，所以单独一把钥匙 */
  fine: RoomGeometry | null;
  fineKey: string;
}

let slot: GeoSlot | null = null;

function slotFor(vol: Volume, nodeId: string): GeoSlot | null {
  const node = vol.nodes.find((n) => n.id === nodeId) ?? vol.nodes[0];
  if (!node) return null;
  const key = `${vol.id}|${node.id}|${node.obstacles.length}|${node.size.x}|${node.size.y}|${node.size.z}`;
  if (slot && slot.key === key) return slot;
  slot = { key, coarse: buildRoom(vol, node), fine: null, fineKey: '' };
  return slot;
}

/**
 * 灯的指纹。云台不动的那几帧不用重切。
 *
 * 量化到 0.5°、12 厘米。再放粗没有意义：把它放到 1.6° / 25 厘米量过，拧云台那一档
 * 只快 0.2ms —— 重切本身不是拧云台变慢的原因，所以不拿切线的精度去换它
 */
function lampKey(lamp: LampSpec | undefined): string {
  if (!lamp || lamp.power < 0.02) return 'dark';
  const q = (v: number, k: number): number => Math.round(v * k);
  return [
    q(lamp.pos.x, 8), q(lamp.pos.y, 8), q(lamp.pos.z, 8),
    q(lamp.dir.x, 120), q(lamp.dir.y, 120), q(lamp.dir.z, 120),
    q(lamp.power, 24), q(lamp.reach, 4),
  ].join(',');
}

/**
 * 整面的几何。一次只在一间房里，所以单槽缓存就够。
 *
 * 全息屏用这一份：它画的是线框，一面墙就该是一个四边形。拿细分过的那份去画，
 * 十几块补丁的半透明底色会叠成一块实色，墙、开口、货箱全糊在一起。
 */
export function roomGeometry(vol: Volume, nodeId: string): RoomGeometry | null {
  return slotFor(vol, nodeId)?.coarse ?? null;
}

/**
 * 细分过的几何。摄像头用这一份。
 *
 * 两份出自同一次 `buildRoom` + 同一次法线修补，而且细分是把整面**精确铺满**的网格：
 * 并集和整面那份逐点相同。所以两块屏的投影和遮挡结论一致，只是取光照的粒度不同 ——
 * 一致性验证里两屏顶点误差 1.5e-12 px 就是这一点的保证。
 */
export function roomGeometryLit(
  vol: Volume,
  nodeId: string,
  lamp?: LampSpec,
): RoomGeometry | null {
  const s = slotFor(vol, nodeId);
  if (!s) return null;
  const key = lampKey(lamp);
  if (!s.fine || s.fineKey !== key) {
    s.fine = { ...s.coarse, quads: subdivide(s.coarse.quads, lamp) };
    s.fineKey = key;
  }
  return s.fine;
}

/** 一小块面片在它所属整面里的位置。材质按整面铺，照明按小块算 */
interface Patch {
  /** 这一小块的左上角在整面米空间里的偏移 */
  u0: number;
  v0: number;
  /** 这一小块自己的尺寸 */
  w: number;
  h: number;
  /** 整面的尺寸 */
  pw: number;
  ph: number;
}

const patches = new Map<string, Patch>();

/**
 * 一块面片细分后的边长上限（米）。
 *
 * 受光在每一小块内部是按顶点线性插值的（见 `fillGouraud`），所以切得越细，光斑的
 * 形状越准。一阶近似在三米半这个尺度上已经够用；再细下去只是在给画家算法和每块
 * 面片的固定开销添堵，光斑的形状不会更像。
 */
const PATCH_M = 3.6;
/** 一块面片最多切几刀。一面 16 米的墙切到 6x6 就够，再细是在给排序添堵 */
const PATCH_MAX = 6;

/**
 * 自适应细分的三个参数。
 *
 * 均匀切是在给整面墙付一样的钱，而光斑只占其中一小块：全黑的那一半切得和锥心
 * 一样细，锥边又切得不够细（3.6 米一段，光斑边缘于是是一条肉眼可见的折线）。
 * 按**照明的插值误差**切就两头都对：误差为零的地方一刀不切，误差大的地方一直
 * 切到半米。全黑的房间误差处处为零，整间房回到未细分的面数。
 */
/**
 * 容许的照明插值误差。
 *
 * 这个数直接决定了面数。实测一面 16x7 的舱壁：0.03 要切 35 块（最大拟合误差
 * 0.073），0.07 只要 12 块（0.140），而均匀切 3.6 米是 10 块、误差 0.213。
 * 取 0.07 就是「和均匀切花一样多的钱，误差小三分之一」—— 而且这十二块是按误差
 * 分配的，全都压在光锥边缘那道折线上，均匀切的十块有一半花在纯黑的角落里。
 */
const CUT_ERR = 0.07;
/** 最细切到多少米。光锥边缘在三四米处，这个尺度上折角已经进了亚像素 */
const CUT_MIN = 0.4;
/** 每个轴最多多少段。防一面巨墙把面数吃光 */
const CUT_SPANS = 10;
/** 整间房的面片预算。超了就只留均匀那一层，不再按误差加细 */
const CUT_BUDGET = 420;

/**
 * 把大面片切成网格。
 *
 * 这是为了照明，不是为了排序。受光在一块面片内部只能按顶点插值，所以一整块
 * 16x14 米的地板上，光斑的形状最细也只能是「四个角之间的线性过渡」—— 探照灯的
 * 光锥在地板上是个椭圆，一次线性插值拟合不出椭圆，画出来是从一头到另一头均匀
 * 变暗的一整面。探照灯在这个游戏里是核心动作，光斑必须是个斑。
 *
 * 切成三米半一块之后，每块四个角各取一次 `litnessAt`，分片线性就能贴着椭圆走；
 * 顺带把画家算法的排序粒度也变细了。总像素面积不变，多出来的只是每块面片的固定
 * 开销。分片线性在公共边上是连续的，所以切了不留缝 —— 那是 `fillGouraud` 的事。
 *
 * 放在这里而不是 `roomview.ts`，是因为两块屏拿的是同一个 geo 对象：切一次，
 * 两边的可见面片必然一致。全息屏拿的是没切过的那一份（见 `roomGeometry`）。
 */
function subdivide(quads: readonly RoomQuad[], lamp?: LampSpec): RoomQuad[] {
  const out: RoomQuad[] = [];
  patches.clear();
  for (const q of quads) {
    const p = q.pts;
    if (p.length !== 4) {
      out.push(q);
      continue;
    }
    const wm = dist3(p[0], p[1]);
    const hm = dist3(p[0], p[3]);
    const room = lamp && out.length < CUT_BUDGET ? lamp : undefined;
    const hs = room ? hotspot(q, room, wm, hm) : null;
    // 整面先扫一遍。全在黑里（或者处处一样亮）就一刀不切 —— 关着灯的房间、
    // 光锥背后的那三面墙，全部落在这一条上，这是这套切法省下来的大头
    const flat = room ? !varies(q, room, hs) : false;
    const us = flat ? UNCUT : cutsAlong(q, wm, 'u', room, hs);
    const vs = flat ? UNCUT : cutsAlong(q, hm, 'v', room, hs);
    const nu = us.length - 1;
    const nv = vs.length - 1;
    if (nu === 1 && nv === 1) {
      out.push(q);
      continue;
    }
    for (let v = 0; v < nv; v++) {
      for (let u = 0; u < nu; u++) {
        const s0 = us[u];
        const s1 = us[u + 1];
        const t0 = vs[v];
        const t1 = vs[v + 1];
        const pts = [
          bilerp(p, s0, t0),
          bilerp(p, s1, t0),
          bilerp(p, s1, t1),
          bilerp(p, s0, t1),
        ];
        // id 要保持唯一：拾取、铭牌归属、调试全靠它
        const id = `${q.id}#${u},${v}`;
        // 记下这一小块在整面里的位置。材质必须按**整面**的坐标去铺，不能按小块自己的
        // 原点 —— 否则每一小块都从头铺一遍，整面墙看起来就是同一张图盖了四十九次
        patches.set(id, {
          u0: s0 * wm,
          v0: t0 * hm,
          w: (s1 - s0) * wm,
          h: (t1 - t0) * hm,
          pw: wm,
          ph: hm,
        });
        out.push({
          ...q,
          id,
          pts,
          center: {
            x: (pts[0].x + pts[1].x + pts[2].x + pts[3].x) * 0.25,
            y: (pts[0].y + pts[1].y + pts[2].y + pts[3].y) * 0.25,
            z: (pts[0].z + pts[1].z + pts[2].z + pts[3].z) * 0.25,
          },
          area: q.area * (s1 - s0) * (t1 - t0),
        });
      }
    }
  }
  return out;
}

/**
 * 一个轴上的切线位置（归一化，含两端）。
 *
 * 切线必须是**贯穿整面**的：邻块于是共用整条边，公共边上两边各自的顶点值取自
 * 同一个世界点，插值出来逐位相同，缝在数学上不存在。四叉树按块细分会切出 T 形
 * 接点 —— 小块那个多出来的顶点落在大块的边中间，大块在那里给的是线性值、小块
 * 给的是真值，两者不等，边上就裂开一条亮线。上一轮好不容易把接缝压到 1.7x，
 * 不能在这里还回去。
 *
 * 分配方式是最大误差优先：先按 3.6 米铺一层均匀的（这一层保证不会漏掉整段区间
 * 中间的一个孤立光斑 —— 只测中点的递归会跳过它），然后反复劈误差最大的那一段。
 */
function cutsAlong(
  q: RoomQuad,
  len: number,
  along: 'u' | 'v',
  lamp: LampSpec | undefined,
  hs: Hotspot | null,
): number[] {
  const seeds = clamp(Math.ceil(len / PATCH_M), 1, PATCH_MAX);
  const grid: number[] = [];
  for (let i = 0; i <= seeds; i++) grid.push(i / seeds);
  if (!lamp) return grid;

  const p = q.pts;
  // 三条横线取最大：光斑可能只擦过这一面的一角，按中线一条采会整个漏掉
  const at = (t: number): number => {
    let m = 0;
    for (const c of CROSS) {
      const pt = along === 'u' ? bilerp(p, t, c) : bilerp(p, c, t);
      const v = litnessAt(q, pt, lamp);
      if (v > m) m = v;
    }
    return m;
  };

  interface Span {
    a: number;
    b: number;
    fa: number;
    fb: number;
    err: number;
  }
  // 均匀网格之外，再把光斑的边界直接钉进去。只测中点的递归找不到一个整段区间
  // 中间的孤立亮斑：镜头贴着墙的时候光斑只有半米宽，十六米的墙上怎么对分都踩不中它。
  // 而光斑的位置是算得出来的 —— 灯轴和这个平面的交点，半径是距离乘光锥正切
  const lines = new Set(grid);
  // 光斑比均匀网格还大的时候不用管它，那一层网格自己就压得住
  if (hs && hs.r < len / seeds) {
    const c = (along === 'u' ? hs.u : hs.v) / len;
    // 只钉三条：斑心和斑的两侧边界。斑心里面是光滑的余弦衰减，不值得预先加密 ——
    // 加密交给后面那个按误差劈段的循环，它会把线加在误差真的大的地方。
    // 早先这里钉七条，贴着墙的时候一面墙上排出十二乘九个格子，一大半落在纯黑里
    for (const k of [-1.15, 0, 1.15]) {
      const t = c + (k * hs.r) / len;
      if (t > 0.002 && t < 0.998) lines.add(t);
    }
  }
  const seedLines = [...lines].sort((a, b) => a - b);

  const spans: Span[] = [];
  const errOf = (a: number, b: number, fa: number, fb: number): number =>
    (b - a) * len < CUT_MIN * 2 ? 0 : Math.abs(at((a + b) * 0.5) - (fa + fb) * 0.5);
  let prev = at(0);
  for (let i = 0; i + 1 < seedLines.length; i++) {
    const a = seedLines[i];
    const b = seedLines[i + 1];
    const fb = at(b);
    spans.push({ a, b, fa: prev, fb, err: errOf(a, b, prev, fb) });
    prev = fb;
  }

  while (spans.length < CUT_SPANS) {
    let worst = 0;
    for (let i = 1; i < spans.length; i++) if (spans[i].err > spans[worst].err) worst = i;
    const s = spans[worst];
    if (s.err <= CUT_ERR) break;
    const m = (s.a + s.b) * 0.5;
    const fm = at(m);
    const left: Span = { a: s.a, b: m, fa: s.fa, fb: fm, err: errOf(s.a, m, s.fa, fm) };
    const right: Span = { a: m, b: s.b, fa: fm, fb: s.fb, err: errOf(m, s.b, fm, s.fb) };
    spans.splice(worst, 1, left, right);
  }

  const out = [0];
  for (const s of spans) out.push(s.b);
  return out;
}

/** 采样横线的位置。两条太容易漏掉贴边的光斑，四条又是在白花钱 */
const CROSS: readonly number[] = [0.15, 0.5, 0.85];
/** 整面预扫的网格。5x5 足够判「这一面上有没有东西在变」 */
const SCAN: readonly number[] = [0, 0.25, 0.5, 0.75, 1];
const UNCUT: readonly number[] = [0, 1];

/** 光斑在这一面上的落点与半径（米，面的局部坐标） */
interface Hotspot {
  u: number;
  v: number;
  r: number;
}

/**
 * 光斑落在这一面的什么位置。
 *
 * 不靠采样去撞，直接解：灯轴和这个平面的交点就是斑心，半径是到那一点的距离
 * 乘光锥的正切。贴着墙打的时候光斑只有几十厘米，任何固定密度的预扫都会整个
 * 错过它 —— 而它是那一帧画面里唯一有东西的地方。
 */
function hotspot(q: RoomQuad, lamp: LampSpec, wm: number, hm: number): Hotspot | null {
  if (lamp.power < 0.02) return null;
  const p = q.pts;
  const n = q.normal;
  const den = lamp.dir.x * n.x + lamp.dir.y * n.y + lamp.dir.z * n.z;
  if (Math.abs(den) < 1e-3) return null;
  const t = ((p[0].x - lamp.pos.x) * n.x + (p[0].y - lamp.pos.y) * n.y + (p[0].z - lamp.pos.z) * n.z) / den;
  if (t <= 0.05 || t > lamp.reach) return null;
  const hx = lamp.pos.x + lamp.dir.x * t - p[0].x;
  const hy = lamp.pos.y + lamp.dir.y * t - p[0].y;
  const hz = lamp.pos.z + lamp.dir.z * t - p[0].z;
  const u = (hx * (p[1].x - p[0].x) + hy * (p[1].y - p[0].y) + hz * (p[1].z - p[0].z)) / wm;
  const v = (hx * (p[3].x - p[0].x) + hy * (p[3].y - p[0].y) + hz * (p[3].z - p[0].z)) / hm;
  const r = Math.max(0.25, t * Math.tan(lamp.cone));
  if (u < -r || u > wm + r || v < -r || v > hm + r) return null;
  return { u: clamp(u, 0, wm), v: clamp(v, 0, hm), r };
}

/** 这一整面上的照明有没有起伏到值得切一刀的程度 */
function varies(q: RoomQuad, lamp: LampSpec, hs: Hotspot | null): boolean {
  let lo = Infinity;
  let hi = -Infinity;
  const take = (s: number, t: number): boolean => {
    const v = litnessAt(q, bilerp(q.pts, s, t), lamp);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    return hi - lo >= CUT_ERR;
  };
  // 斑心先测。网格是用来确认「这一面上没东西」的，不是用来找东西的
  if (hs && take(hs.u / Math.max(0.01, dist3(q.pts[0], q.pts[1])), hs.v / Math.max(0.01, dist3(q.pts[0], q.pts[3])))) {
    return true;
  }
  for (const s of SCAN) for (const t of SCAN) if (take(s, t)) return true;
  return false;
}

function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** 四边形上的双线性插值。顶点顺序是 0-1-2-3 绕一圈 */
function bilerp(p: readonly Vec3[], s: number, t: number): Vec3 {
  const ax = p[0].x + (p[1].x - p[0].x) * s;
  const ay = p[0].y + (p[1].y - p[0].y) * s;
  const az = p[0].z + (p[1].z - p[0].z) * s;
  const bx = p[3].x + (p[2].x - p[3].x) * s;
  const by = p[3].y + (p[2].y - p[3].y) * s;
  const bz = p[3].z + (p[2].z - p[3].z) * s;
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, z: az + (bz - az) * t };
}

// ============================================================================
// 画家顺序
// ============================================================================

/**
 * 两块屏共用的唯一投影入口：投影（上游已在世界空间沿近裁面切过），再排序。
 *
 * 必须两边都走这一个函数。只在摄像头这边改排序，两块屏上同一面墙的可见性就会
 * 对不上 —— 那比穿插更糟，因为全息屏会给出和实景矛盾的遮挡关系。
 */
export function projectScene(geo: RoomGeometry, eye: Eye, vp: Viewport): ProjQuad[] {
  return paintOrder(projectRoom(geo, eye, vp), geo, eye.pos);
}

/**
 * 正确的绘制顺序。`projectRoom` 只按面心距离排，对长面片是错的。
 * ============================================================================
 * 最难看的一种是地板：16×14 米的一块面，面心可能只有 4 米远，而站在 10 米外的
 * 货箱面心是 10 米 —— 按面心排，地板会盖在箱子上。管排和支柱与墙的穿插同理。
 *
 * 这里不做细分，靠两条几何不变量把顺序变成精确的：
 *
 *   1. 镜头和所有障碍都在房间这个凸盒子**里面**（spawnInRoom / traceCabin 保证
 *      前者，gen/interior.ts 的 makeObstacleShape 保证后者）。于是舱壁永远不可能
 *      遮住障碍 —— 先把六面墙画完，再画障碍，这一类穿插就根本不存在。
 *      房间自己的内表面互不重叠（每一面占一块独立的立体角，门洞是从墙上抠掉的），
 *      所以墙之间怎么排都不影响结果。
 *   2. 障碍两两之间是不相交的轴对齐盒（生成器的 overlaps() 保证）。不相交的 AABB
 *      至少在一个轴上区间分离，那个轴就是一张分离平面：镜头在平面的哪一侧，那一侧
 *      的盒子就在前面。这给出一个严格的前后关系，拓扑排序即得精确顺序。
 *
 * 凸盒子背面剔除之后剩下的面互不重叠，所以同一只箱子的五个面内部不用再排。
 */
export function paintOrder(
  quads: readonly ProjQuad[],
  geo: RoomGeometry,
  eyePos: Vec3,
): ProjQuad[] {
  const room: ProjQuad[] = [];
  const byObstacle = new Map<string, ProjQuad[]>();
  for (const q of quads) {
    const id = q.src.kind === 'obstacle' ? q.src.obstacleId : undefined;
    if (!id) {
      room.push(q);
      continue;
    }
    const list = byObstacle.get(id);
    if (list) list.push(q);
    else byObstacle.set(id, [q]);
  }
  room.sort((a, b) => b.depth - a.depth);
  if (byObstacle.size === 0) return room;

  const boxes = geo.obstacles.filter((o) => byObstacle.has(o.id));
  const depthOf = new Map<string, number>();
  for (const o of boxes) {
    depthOf.set(o.id, Math.hypot(o.pos.x - eyePos.x, o.pos.y - eyePos.y, o.pos.z - eyePos.z));
  }

  // edge a -> b 意思是「a 必须先画」，也就是 a 在 b 后面
  const after = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const o of boxes) {
    after.set(o.id, []);
    indeg.set(o.id, 0);
  }
  const link = (far: string, near: string): void => {
    after.get(far)!.push(near);
    indeg.set(near, indeg.get(near)! + 1);
  };
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const f = nearerBox(a, b, eyePos);
      if (f === 'a') link(b.id, a.id);
      else if (f === 'b') link(a.id, b.id);
      else if (depthOf.get(a.id)! >= depthOf.get(b.id)!) link(a.id, b.id);
      else link(b.id, a.id);
    }
  }

  // 可画的里面先挑最远的，顺序才稳定
  const ready = boxes.filter((o) => indeg.get(o.id) === 0).map((o) => o.id);
  const order: string[] = [];
  while (ready.length) {
    let pick = 0;
    for (let i = 1; i < ready.length; i++) {
      if (depthOf.get(ready[i])! > depthOf.get(ready[pick])!) pick = i;
    }
    const id = ready.splice(pick, 1)[0];
    order.push(id);
    for (const nxt of after.get(id)!) {
      const d = indeg.get(nxt)! - 1;
      indeg.set(nxt, d);
      if (d === 0) ready.push(nxt);
    }
  }
  // 成环（三个盒子互相压边，理论上可能）：剩下的按面心距离兜底
  if (order.length < boxes.length) {
    const left = boxes.filter((o) => !order.includes(o.id)).sort((a, b) => depthOf.get(b.id)! - depthOf.get(a.id)!);
    for (const o of left) order.push(o.id);
  }

  const out = room;
  for (const id of order) {
    const list = byObstacle.get(id);
    if (!list) continue;
    list.sort((a, b) => b.depth - a.depth);
    for (const q of list) out.push(q);
  }
  return out;
}

interface Box {
  pos: Vec3;
  size: Vec3;
}

/** 两个不相交的 AABB，哪一个离镜头更近。全都重叠时返回 null */
function nearerBox(a: Box, b: Box, eye: Vec3): 'a' | 'b' | null {
  const keys = ['x', 'y', 'z'] as const;
  for (const k of keys) {
    const aMin = a.pos[k] - a.size[k] * 0.5;
    const aMax = a.pos[k] + a.size[k] * 0.5;
    const bMin = b.pos[k] - b.size[k] * 0.5;
    const bMax = b.pos[k] + b.size[k] * 0.5;
    if (aMax <= bMin) return eye[k] < (aMax + bMin) * 0.5 ? 'a' : 'b';
    if (bMax <= aMin) return eye[k] < (bMax + aMin) * 0.5 ? 'b' : 'a';
  }
  return null;
}

// ============================================================================
// 光
// ============================================================================

/** 灯焊在镜头旁边，略前略下。偏置只给灯，给镜头会毁掉方位一致性 */
function lampOf(eye: Eye, b: EyeBasis, light: number): LampSpec {
  const fwd = 0.5;
  const down = 0.34;
  return {
    pos: {
      x: eye.pos.x + b.fwd.x * fwd - b.up.x * down,
      y: eye.pos.y + b.fwd.y * fwd - b.up.y * down,
      z: eye.pos.z + b.fwd.z * fwd - b.up.z * down,
    },
    dir: b.fwd,
    cone: 0.55,
    power: light,
    reach: lerp(16, 22, light),
  };
}

export type Pt2 = { x: number; y: number };

/**
 * 面片在屏上的多边形。全息屏也用这一个 —— 两块屏的轮廓必须逐位相同。
 *
 * `projectRoom` 现在在世界空间沿近裁面切过再投，所以顶点必然全在镜头前面，
 * 这里一个数都不用重算。`ok` 的过滤只是一条守卫：真漏进来一个镜头后面的顶点，
 * 宁可少一条边，也不要除出天文数字的坐标把整幅画面拖垮。
 */
export function quadPoly(q: ProjQuad): Pt2[] {
  const out: Pt2[] = [];
  for (const p of q.pts) if (p.ok) out.push({ x: p.x, y: p.y });
  return out;
}

/** 摄像头版：在共用轮廓上再叠逐行剪切。云台停住时 shearAt 只剩亚像素的抖 */
function screenPoly(q: ProjQuad, shearAt: (y: number) => number): Pt2[] {
  const poly = quadPoly(q);
  for (const p of poly) p.x += shearAt(p.y);
  return poly;
}

function toEye(p: Vec3, b: EyeBasis): { px: number; py: number; z: number } {
  const rx = p.x - b.pos.x;
  const ry = p.y - b.pos.y;
  const rz = p.z - b.pos.z;
  return {
    px: rx * b.right.x + ry * b.right.y + rz * b.right.z,
    py: rx * b.up.x + ry * b.up.y + rz * b.up.z,
    z: rx * b.fwd.x + ry * b.fwd.y + rz * b.fwd.z,
  };
}

function tracePoly(ctx: CanvasRenderingContext2D, poly: readonly Pt2[]): void {
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
}

// ============================================================================
// 材质
// ============================================================================

type MatKind = 'hull' | 'grate' | 'ceiling' | 'door' | 'pipe' | 'crate' | 'tank' | 'column' | 'beam';

interface Mat {
  kind: MatKind;
  base: string;
  /** 材质自己的明度基准。木箱比钢板暗，罐子比钢板亮 */
  gain: number;
}

const OBSTACLE_MAT: Readonly<Record<ObstacleKind, Mat>> = {
  pipe: { kind: 'pipe', base: PALETTE.rustDeep, gain: 1.05 },
  crate: { kind: 'crate', base: PALETTE.rustDim, gain: 1.0 },
  beam: { kind: 'beam', base: PALETTE.steelDark, gain: 0.95 },
  tank: { kind: 'tank', base: PALETTE.steelLit, gain: 1.15 },
  column: { kind: 'column', base: PALETTE.steel, gain: 0.9 },
  grate: { kind: 'grate', base: PALETTE.steelDark, gain: 0.85 },
};

function matOf(q: RoomQuad): Mat {
  if (q.kind === 'obstacle') return OBSTACLE_MAT[q.obstacle ?? 'crate'];
  if (q.kind === 'door') return { kind: 'door', base: PALETTE.abyss, gain: 1 };
  if (q.kind === 'floor') return { kind: 'grate', base: PALETTE.steelDark, gain: 0.8 };
  if (q.kind === 'ceiling') return { kind: 'ceiling', base: PALETTE.steelDark, gain: 0.72 };
  return { kind: 'hull', base: PALETTE.steel, gain: 1 };
}

const FOG_RGB = hexToRgb(PALETTE.abyssHaze);
const DARK_RGB = hexToRgb(PALETTE.abyss);

type RGB3 = readonly [number, number, number];

/** 这一帧的共同项。避免每个 paint* 都拖着七八个参数 */
interface Env {
  light: number;
  decay: Decay;
  /** 雾层的色标。t 是雾浓度，返回带 alpha 的雾色 */
  haze: (t: number) => string;
  /** min(w, h)，线宽和分级都按它算 */
  min: number;
  w: number;
  h: number;
}

/**
 * 雾色。跟着灯走 —— 灯关着的时候水里没有东西可散射，远处就该是纯黑，
 * 而不是一层不知道哪来的蓝灰。
 *
 * 浓度乘进 **RGB** 而不是 alpha。雾层最后是整幅加上去的，所以这一层上的每个像素
 * 只能被涂一次；alpha 会让重叠的地方叠加两遍。而重叠是必然的：一块四边形的
 * 逐顶点插值要拆成两个三角形，第二个三角形盖在第一个上面（见 `fillGouraud`）——
 * alpha 版本于是在每一小块上留下一条对角亮带，整面墙连起来是几道斜着的光柱。
 * 涂成不透明的之后，盖第二遍就只是覆盖，颜色不变。
 */
function hazeOf(light: number): (t: number) => string {
  const k = 0.35 + light * 0.65;
  const r = lerp(DARK_RGB[0], FOG_RGB[0], light) * k * 255;
  const g = lerp(DARK_RGB[1], FOG_RGB[1], light) * k * 255;
  const b = lerp(DARK_RGB[2], FOG_RGB[2], light) * k * 255;
  return (t: number): string => {
    const a = clamp01(t);
    return `rgb(${Math.round(r * a)},${Math.round(g * a)},${Math.round(b * a)})`;
  };
}

const albedoCache = new Map<string, RGB3>();

/**
 * 材质在满受光下的本色。
 *
 * 受光**不进这里** —— 它是整幅画面最后统一乘上去的一层遮罩（见 `applyLayers`）。
 * 这是这一版的全部要点：把「这块铁长什么样」和「这块地方有多少光」彻底分开。
 * 混在一起的那一版，每一层（底色、锈、焊缝、铆钉、高光）都各自乘一遍这一小块
 * 中心的受光，于是细分边界上每一层都各自跳一次，墙上就有一张方格。
 *
 * 腐化在这里吃掉一点色温。这是十几米外唯一还读得出幕数的东西 —— 焊缝开没开、
 * 铆钉掉没掉，那个距离上连一个像素都占不到。
 */
function albedoOf(mat: Mat, decay: Decay): RGB3 {
  const key = `${mat.kind}|${decay.level.toFixed(2)}`;
  const got = albedoCache.get(key);
  if (got) return got;
  const base = hexToRgb(mat.base);
  const rot = hexToRgb(PALETTE.rustDeep);
  // 往锈红里沉，同时整体压暗：后面几关的铁是死的，不反光
  const t = decay.level * 0.5;
  const k = mat.gain * 1.45 * (1 - decay.level * 0.22);
  const out: RGB3 = [
    clamp01(lerp(base[0], rot[0], t) * k) * 255,
    clamp01(lerp(base[1], rot[1], t) * k) * 255,
    clamp01(lerp(base[2], rot[2], t) * k) * 255,
  ];
  if (albedoCache.size > 64) albedoCache.clear();
  albedoCache.set(key, out);
  return out;
}

// ============================================================================
// 受光：逐顶点取，最后整幅乘一遍
// ============================================================================

/**
 * 材质的镜面性格。
 *
 * 这是「湿」的全部来源。漫反射只能告诉你这块铁有多亮，告诉不了你它是湿的 ——
 * 湿的标志是一块**跟着镜头走**的高光：视点一动，反射的位置就换一处。烘在贴图里
 * 的那种亮斑做不到，它钉死在材质上。
 *
 * `k` 是镜面指数（越大越窄），`gain` 是反射率。锈是粗糙的氧化物，几乎不反光；
 * 湿钢和刷过漆的罐子窄而亮；泡过水的木条箱在中间，它反的是一层水膜而不是木头。
 */
interface Gloss {
  k: number;
  gain: number;
}

const MAT_GLOSS: Readonly<Record<MatKind, Gloss>> = {
  hull: { k: 44, gain: 0.95 },
  ceiling: { k: 30, gain: 0.62 },
  grate: { k: 26, gain: 0.5 },
  crate: { k: 12, gain: 0.3 },
  tank: { k: 54, gain: 1.0 },
  pipe: { k: 9, gain: 0.16 },
  column: { k: 36, gain: 0.7 },
  beam: { k: 28, gain: 0.5 },
  door: { k: 1, gain: 0 },
};

/** 腐化会同时吃掉反射率和锐度：锈透的铁是哑光的 */
function glossOf(mat: Mat, decay: Decay): Gloss {
  const g = MAT_GLOSS[mat.kind];
  return {
    k: lerp(g.k, 6, clamp01(decay.level * 0.75)),
    gain: g.gain * (1 - decay.level * 0.7),
  };
}

/** 一块面片各顶点的受光、雾与高光。长度等于 `q.pts.length`（裁过的是 3~5 边） */
interface Shade {
  lit: number[];
  fog: number[];
  /** 逐顶点的镜面项。零的时候整层跳掉，那是绝大多数面片的情况 */
  spec: number[];
  /** 这块面上最亮的一个顶点。细节的早退按它判 —— 按面心判会让整块地板一笔不画 */
  peak: number;
  /** 这块面上最强的镜面项。为 0 就不用往高光层上画 */
  gleam: number;
}

/**
 * 逐顶点的受光、雾、高光。
 *
 * 高光用 Blinn-Phong 的半角向量。灯焊在镜头旁边，所以半角向量几乎就是视线方向 ——
 * 这是逆反射，水下探照灯录像的样子：亮斑跟着镜头走，镜头横移过去，亮斑就跟着你
 * 走过整面墙，而贴图上的锈斑和焊缝从亮斑底下滑过去。
 *
 * 镜面项乘的是**没加舱内漫射之前**的那个 `lit`：反射的是探照灯，不是信号管漏的
 * 那一点光，后者没有方向可言。
 */
function shadeOf(q: ProjQuad, lamp: LampSpec, eye: Vec3, gloss: Gloss): Shade {
  const lit = litnessCorners(q.src, lamp);
  const fog: number[] = [];
  const spec: number[] = [];
  const n = q.src.normal;
  let peak = 0;
  let gleam = 0;
  const shiny = gloss.gain > 0.01 && lamp.power > 0.02;
  for (let i = 0; i < lit.length; i++) {
    const p = q.src.pts[i];
    const d = Math.hypot(p.x - eye.x, p.y - eye.y, p.z - eye.z);
    if (shiny && lit[i] > 0.004) {
      const lx = lamp.pos.x - p.x;
      const ly = lamp.pos.y - p.y;
      const lz = lamp.pos.z - p.z;
      const ll = Math.hypot(lx, ly, lz) || 1;
      const vl = d || 1;
      // 半角向量 = 归一化(到灯 + 到眼)
      let hx = lx / ll + (eye.x - p.x) / vl;
      let hy = ly / ll + (eye.y - p.y) / vl;
      let hz = lz / ll + (eye.z - p.z) / vl;
      const hl = Math.hypot(hx, hy, hz) || 1;
      hx /= hl;
      hy /= hl;
      hz /= hl;
      // 背面剔除之后法线一定朝着镜头，但裁剪出来的碎片可能退化，取绝对值兜底
      const nd = Math.abs(hx * n.x + hy * n.y + hz * n.z);
      const s = lit[i] * gloss.gain * Math.pow(nd, gloss.k);
      spec.push(s);
      if (s > gleam) gleam = s;
    } else {
      spec.push(0);
    }
    // 舱体信号管漏出来的一点漫反射。只在两米半内有效，撑不起一个房间，
    // 但足够让「灯关着」的时候还剩一点轮廓 —— 恐怖片里最贵的一点信息
    const v = clamp01(lit[i] + 0.05 * clamp01(1 - d / 2.6));
    lit[i] = v;
    if (v > peak) peak = v;
    fog.push(1 - Math.exp(-d / FOG_HALF));
  }
  return { lit, fog, spec, peak, gleam };
}

/**
 * 按**整面**算的两个分级量。
 *
 * 为什么不按小块算：这两个数都是拿来当细节层的乘数的，而只要一个乘数是逐小块取的，
 * 那一层就会在细分边界上跳一次 —— 和原来直接乘受光是同一个病，只是换了个名字。
 * 上一版栽在这里：`clear` 和 `pxPerM` 都按小块的深度和屏幕面积算，于是锈、砂砾、
 * 焊缝、格栅每一层都各自留了一道台阶，接缝的量化比值一点没降。
 *
 * 按整面算之后，同一面墙上所有小块的乘数逐位相同，面内不可能有台阶；面与面之间
 * 本来就该有边（那里有实物的棱，也描着线）。
 */
interface FaceInfo {
  /** 这一整面上「一米等于多少像素」。远墙上的铆钉连一个像素都占不到 */
  pxPerM: number;
  /** 1 - 雾。细节的对比度按它收：十米外的铆钉不该和近处一样黑 */
  dim: number;
}

function parentOf(id: string): string {
  const cut = id.lastIndexOf('#');
  return cut < 0 ? id : id.slice(0, cut);
}

function faceIndex(
  quads: readonly ProjQuad[],
  polys: readonly (Pt2[] | null)[],
): Map<string, FaceInfo> {
  const acc = new Map<string, { px: number; m: number; wd: number }>();
  for (let i = 0; i < quads.length; i++) {
    const poly = polys[i];
    if (!poly) continue;
    const q = quads[i];
    const px = polyArea(poly);
    const m = Math.max(0.01, q.src.area);
    const key = parentOf(q.src.id);
    const cur = acc.get(key);
    if (cur) {
      cur.px += px;
      cur.m += m;
      cur.wd += q.depth * px;
    } else {
      acc.set(key, { px, m, wd: q.depth * px });
    }
  }
  const out = new Map<string, FaceInfo>();
  for (const [k, v] of acc) {
    const depth = v.px > 0 ? v.wd / v.px : 8;
    out.set(k, {
      pxPerM: Math.sqrt(v.px / v.m),
      dim: Math.exp(-depth / FOG_HALF),
    });
  }
  return out;
}

/**
 * 按顶点值铺一块面片。
 *
 * 用三角形上的**线性**插值，不是一块平色、也不是一圈径向渐变。理由只有一条：
 * 三角形内的线性函数在一条边上只由那条边两端的顶点值决定，所以相邻两小块在公共边
 * 上算出来的值必然逐位相同 —— 接缝因此消失，而不是「变淡」。相邻小块共用世界坐标
 * 的顶点，同一整面又共用法线，`litnessAt` 在那两个点上给出的就是同一个数。
 *
 * 扇形三角化要小心 AA：两块三角形共用的那条对角线上，两边各覆盖一半，源在上的
 * 混色只攒到 0.75 的不透明度，底下透出来，于是每一小块上都多一条对角细线。
 * 解法不是把三角形撑大（那会把梯度也一起撑歪），而是让**第一块三角形的平面铺满
 * 整个多边形**，后面的三角形再盖上去：两块三角形的线性函数在公共边上本来就逐位
 * 相等（两端顶点值相同，线性函数由两端唯一确定），所以盖上去那条 AA 边混的是
 * 同一个值，看不出来。代价是多一次填充，只在裁剪出来的 5 边形上才会发生。
 */
function fillGouraud(
  ctx: CanvasRenderingContext2D,
  poly: readonly Pt2[],
  vals: readonly number[],
  stop: (v: number) => string,
  /**
   * 实际要涂的范围。可以比 `poly` 大（见 `spread`）—— 但**平面永远由 `poly`
   * 的顶点定**，不由涂的范围定。把顶点挪一挪再拿挪过的顶点定平面，是在把
   * 整个平面沿梯度方向平推一段：相邻两块各推向自己外面，公共边上的值就差出了
   * 「两块的斜率之和乘以推的距离」。光斑边缘那里斜率大得惊人，于是接缝比原来还亮。
   */
  path: readonly Pt2[] = poly,
): void {
  const n = poly.length;
  if (n < 3) return;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = vals[i] ?? 0;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  // 整块一样亮就别建渐变对象了，一块平色更便宜也更准
  if (hi - lo < 0.012) {
    ctx.fillStyle = stop((lo + hi) * 0.5);
    tracePoly(ctx, path);
    ctx.fill();
    return;
  }
  triGouraud(ctx, poly[0], poly[1], poly[2], vals[0], vals[1], vals[2], stop, path);
  for (let i = 2; i + 1 < n; i++) {
    triGouraud(
      ctx, poly[0], poly[i], poly[i + 1], vals[0], vals[i], vals[i + 1], stop,
      [path[0], path[i], path[i + 1]],
    );
  }
}

function triGouraud(
  ctx: CanvasRenderingContext2D,
  a: Pt2,
  b: Pt2,
  c: Pt2,
  va: number,
  vb: number,
  vc: number,
  stop: (v: number) => string,
  /** 要涂的范围。平面由 a/b/c 三个顶点定，涂的范围可以比那个三角形大 */
  over: readonly Pt2[],
): void {
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  const cx = c.x;
  const cy = c.y;
  tracePoly(ctx, over);

  // v = p·n + k 的梯度方向。三个顶点定一个平面，两点色标就精确复现它
  const d1x = bx - ax;
  const d1y = by - ay;
  const d2x = cx - ax;
  const d2y = cy - ay;
  const det = d1x * d2y - d1y * d2x;
  const gx = Math.abs(det) < 1e-6 ? 0 : ((vb - va) * d2y - (vc - va) * d1y) / det;
  const gy = Math.abs(det) < 1e-6 ? 0 : ((vc - va) * d1x - (vb - va) * d2x) / det;
  const gl = Math.hypot(gx, gy);
  if (!(gl > 1e-9)) {
    ctx.fillStyle = stop((va + vb + vc) / 3);
    ctx.fill();
    return;
  }
  const nx = gx / gl;
  const ny = gy / gl;
  // 沿梯度方向把顶点投出来，取最远的两端当色标的两头。铺满整个多边形的那一遍要按
  // **多边形**的顶点取 —— 只按三角形取，落在三角形外面的那一角会被色标夹住，
  // 那一块就不是那个平面了
  let sMin = 0;
  let sMax = 0;
  for (const p of over) {
    const s = (p.x - ax) * nx + (p.y - ay) * ny;
    if (s < sMin) sMin = s;
    if (s > sMax) sMax = s;
  }
  if (sMax - sMin < 0.5) {
    ctx.fillStyle = stop((va + vb + vc) / 3);
    ctx.fill();
    return;
  }
  const g = ctx.createLinearGradient(
    ax + nx * sMin, ay + ny * sMin,
    ax + nx * sMax, ay + ny * sMax,
  );
  g.addColorStop(0, stop(va + gl * sMin));
  g.addColorStop(1, stop(va + gl * sMax));
  ctx.fillStyle = g;
  ctx.fill();
}

/** 遮罩上的灰阶。0 = 全黑，1 = 原样 */
function grey(v: number): string {
  const k = Math.round(clamp01(v) * 255);
  return `rgb(${k},${k},${k})`;
}

function paintQuad(
  ctx: CanvasRenderingContext2D,
  layers: Layers,
  poly: Pt2[],
  q: ProjQuad,
  mat: Mat,
  sh: Shade,
  info: FaceInfo,
  env: Env,
  marks: Map<string, RoomMark>,
  plates: Map<string, string> | null,
): void {
  // 这三层都攒在三分之一分辨率的缓冲上，所以一个缓冲像素等于好几个屏幕像素。
  // 撑出去的量要按缓冲的像素算，撑半个屏幕像素在那上面等于没撑
  const soft = spread(poly, q, (MASK_DIV / Math.max(0.2, scale)) * 1.1);
  if (layers.mask) fillGouraud(layers.mask, poly, sh.lit, grey, soft);
  if (layers.haze) fillGouraud(layers.haze, poly, sh.fog, env.haze, soft);
  // 绝大多数面片一点高光都没有（在光锥外，或者锈透了）。那一层就整块跳掉 ——
  // 镜面项窄，能看见它的面片是少数，不该让多数面片替少数买单
  if (layers.glint && sh.gleam > 0.004) {
    fillGouraud(layers.glint, poly, sh.spec, glintStop,
      spread(poly, q, (GLINT_DIV / Math.max(0.2, scale)) * 1.1));
    layers.lit = true;
  }

  if (mat.kind === 'door') {
    paintDoor(ctx, poly, env, info);
    return;
  }

  // 这一块要么整块贴上材质贴图，要么整块铺一色 —— 不能先铺一色再往上贴。
  // 上一版就是这么干的：垫底那一色是材质的**本色**（满亮度、没有锈没有焊缝），
  // 比贴图完成之后亮得多，于是贴图 AA 边上漏出来的那半个像素是一条亮线。
  // 一色的亮度和贴图的亮度差多少，接缝就有多亮 —— 这是上一版最后剩下的那条缝。
  const area = polyArea(poly);
  if (sh.peak > 0.02 && area > env.min * env.min * 0.0008) {
    // 铭牌漆在最正对镜头的那一面上，所以要连着这一面的米空间一起画
    const oid = q.src.obstacleId;
    const plate = oid && plates?.get(oid) === q.src.id ? marks.get(oid) : undefined;
    paintFace(ctx, poly, q, mat, info, env, plate);
  } else {
    // 灯彻底照不到、或者小到几个像素。受光遮罩会把这一块乘成黑的，贴图那一刀不值
    fillFlat(ctx, poly, mat, env);
  }
  strokeEdges(ctx, poly, q, info, env);
}

function fillFlat(
  ctx: CanvasRenderingContext2D,
  poly: readonly Pt2[],
  mat: Mat,
  env: Env,
): void {
  const alb = albedoOf(mat, env.decay);
  tracePoly(ctx, poly);
  ctx.fillStyle = `rgb(${Math.round(alb[0])},${Math.round(alb[1])},${Math.round(alb[2])})`;
  ctx.fill();
}

/**
 * 把小块的多边形往外撑 `d` 个像素，但**只撑细分切出来的那几条边**。
 *
 * 整面的外轮廓不能撑：那里是实物的棱，撑出去就是箱子的受光糊到它背后的墙上，
 * 亮一圈光边。细分边界必须撑，理由见 `paintFace` 里那段。
 *
 * 四边形按边法线精确外扩（顶点挪到两条外扩边的交点，对平行四边形是精确的）；
 * 跨近裁面切出来的多边形没有「整面里的位置」可言，整块照质心撑，反正那种小块
 * 近得整个视口都是它。
 */
function spread(poly: readonly Pt2[], q: ProjQuad, d: number): Pt2[] {
  const face = patches.get(q.src.id);
  if (!face) return poly as Pt2[];
  if (poly.length !== 4) {
    const c = centroidOf(poly);
    return poly.map((p) => {
      const l = Math.hypot(p.x - c.x, p.y - c.y) || 1;
      return { x: p.x + ((p.x - c.x) / l) * d, y: p.y + ((p.y - c.y) / l) * d };
    });
  }
  const eps = 1e-3;
  // 边 i 是顶点 i → i+1。绕向是 (u0,v0)→(u1,v0)→(u1,v1)→(u0,v1)，即上右下左
  const inner = [
    face.v0 > eps,
    face.u0 + face.w < face.pw - eps,
    face.v0 + face.h < face.ph - eps,
    face.u0 > eps,
  ];
  if (!inner[0] && !inner[1] && !inner[2] && !inner[3]) return poly as Pt2[];
  // 外法线的朝向取决于绕向，用带符号面积定
  const sign = polySigned(poly) > 0 ? 1 : -1;
  const off: Pt2[] = [];
  for (let i = 0; i < 4; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % 4];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    // 把边方向转 90°：外法线
    off.push({ x: (sign * (b.y - a.y)) / l, y: (-sign * (b.x - a.x)) / l });
  }
  return poly.map((p, i) => {
    const prev = (i + 3) % 4;
    let dx = 0;
    let dy = 0;
    if (inner[prev]) {
      dx += off[prev].x;
      dy += off[prev].y;
    }
    if (inner[i]) {
      dx += off[i].x;
      dy += off[i].y;
    }
    return { x: p.x + dx * d, y: p.y + dy * d };
  });
}

function polySigned(poly: readonly Pt2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s * 0.5;
}

/**
 * 面与面之间的暗缝，和棱上那道窄高光。
 *
 * 真实世界里第一条是接触阴影，画面上它是「读得出这是一只箱子」的唯一保证 ——
 * 纯靠受光差，同色的两个面会糊成一块。
 *
 * 两点必须守住：
 *   一、**只许描整面的边**。细分出来的小块之间那些边是切法留下的，不是实物的棱；
 *       照着描就是在每一小块周围画一圈黑线，墙上于是浮出一张网格 —— 上一版最
 *       显眼的那条接缝就是这么来的，而且它比亮度台阶醒目得多。
 *   二、alpha 里不许有逐小块的量。一条横贯整面的底边会被切成五段，每段各取一次
 *       自己的受光，那条线就成了五截深浅不同的短线。受光交给最后那一遍遮罩。
 */
function strokeEdges(
  ctx: CanvasRenderingContext2D,
  poly: readonly Pt2[],
  q: ProjQuad,
  info: FaceInfo,
  env: Env,
): void {
  const face = patches.get(q.src.id);
  if (face && poly.length !== 4) return;
  const dark = rgba(PALETTE.abyss, (0.32 + info.dim * 0.3) * (0.35 + env.light * 0.65));
  const hot = q.src.kind === 'obstacle'
    ? rgba(PALETTE.boneDim, 0.26 * info.dim)
    : '';
  const wide = Math.max(0.7, env.min * 0.0016);
  const thin = Math.max(0.6, env.min * 0.0011);

  ctx.save();
  if (!face) {
    tracePoly(ctx, poly);
  } else {
    // 顶点绕向是 (u0,v0) → (u1,v0) → (u1,v1) → (u0,v1)，所以第 i 条边对应
    // 上 / 右 / 下 / 左。只有压在整面边界上的那几条才是真的棱
    const eps = 1e-3;
    const keep = [
      face.v0 < eps,
      face.u0 + face.w > face.pw - eps,
      face.v0 + face.h > face.ph - eps,
      face.u0 < eps,
    ];
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      if (!keep[i]) continue;
      ctx.moveTo(poly[i].x, poly[i].y);
      ctx.lineTo(poly[(i + 1) % 4].x, poly[(i + 1) % 4].y);
    }
  }
  ctx.strokeStyle = dark;
  ctx.lineWidth = wide;
  ctx.stroke();
  if (hot) {
    ctx.strokeStyle = hot;
    ctx.lineWidth = thin;
    ctx.stroke();
  }
  ctx.restore();
}

/** 开口：后面那一间没有灯，所以就是一个黑洞。余炬色的框是玩家要对准的东西 */
function paintDoor(
  ctx: CanvasRenderingContext2D,
  poly: Pt2[],
  env: Env,
  info: FaceInfo,
): void {
  const light = env.light;
  ctx.save();
  tracePoly(ctx, poly);
  const bb = bbox(poly);
  const g = ctx.createLinearGradient(bb.x, bb.y, bb.x, bb.y + bb.h);
  g.addColorStop(0, 'rgb(2,3,5)');
  g.addColorStop(1, `rgb(${Math.round(6 + light * 5)},${Math.round(9 + light * 7)},${Math.round(14 + light * 9)})`);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  // 门框上的密封棱。灯照在这圈金属上比照在洞里亮得多。
  // 受光由最后那一遍遮罩统一乘，这里只给满亮度的漆
  ctx.save();
  tracePoly(ctx, poly);
  ctx.strokeStyle = rgba(PALETTE.rustDim, 0.75 * info.dim);
  ctx.lineWidth = Math.max(1.4, Math.sqrt(polyArea(poly)) * 0.035);
  ctx.stroke();
  ctx.strokeStyle = rgba(PALETTE.ember, 0.4 * info.dim);
  ctx.lineWidth = Math.max(0.6, Math.sqrt(polyArea(poly)) * 0.012);
  ctx.stroke();
  ctx.restore();
}

/**
 * 受光与雾各攒成一层，最后整幅盖一遍。
 *
 * 为什么不逐块就地乘：`multiply` 会在每一小块的 AA 边上复合。边上那一列像素被
 * 两块各覆盖一半，于是被乘了两次半透明的遮罩 —— m=0.3 时算出 0.42，比该有的亮
 * 40%，每条接缝上多出一条亮线。那正是要消掉的东西。
 *
 * 所以两层都先按画家顺序攒在独立的缓冲上（源在上混色，相邻块在公共边上是插值而
 * 不是复合），最后各盖一次：受光是乘的，雾是加的。雾必须是加的 —— 一千米以下
 * 灯照不到的地方是真的黑，但灯锥里的水本身会亮，远墙于是被一层橙灰糊住而不是
 * 变黑。乘进去的那一版整幅画面都发闷，因为雾也跟着受光一起被压掉了。
 *
 * 缓冲刻意做得很小：这两样都是低频的。上采回来只让几何轮廓上的光照软了两三个
 * 像素 —— 那看起来像接触处的一点漫射，不像瑕疵。空白处两层都是透明的，
 * 所以房间外的水不受影响。
 */
const MASK_DIV = 3;
/**
 * 高光层更小一档。
 *
 * 受光和雾的边界要贴着几何的棱，太糊会让棱上的明暗软掉；高光是一团几十像素宽的
 * 光斑，本来就没有边。六分之一分辨率下它的形状看不出差别，而填充面积只有四分之一
 */
const GLINT_DIV = 4;

interface Layers {
  mask: CanvasRenderingContext2D | null;
  haze: CanvasRenderingContext2D | null;
  /** 高光与反弹光。也是加法的，但和雾分开攒 —— 两者在同一个缓冲上会互相覆盖 */
  glint: CanvasRenderingContext2D | null;
  /** 高光层里到底有没有东西。灯打在光锥外的黑墙上时一块都没有，那一刀就别合成了 */
  lit: boolean;
}

function layerBuf(key: string, w: number, h: number, div: number): Scene | null {
  const s = buffer(key, (w * scale) / div, (h * scale) / div, true);
  if (!s) return null;
  s.ctx.scale(s.cv.width / w, s.cv.height / h);
  return s;
}

function applyLayers(
  ctx: CanvasRenderingContext2D,
  mask: Scene | null,
  haze: Scene | null,
  glint: Scene | null,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if (mask) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(mask.cv, 0, 0, mask.cv.width, mask.cv.height, 0, 0, w, h);
  }
  // 加法的两层都在乘法之后：高光是镜面反射的灯，反弹光是别处反过来的灯，
  // 两者都不该再被这块表面自己的受光乘一遍。雾同理
  ctx.globalCompositeOperation = 'lighter';
  if (haze) ctx.drawImage(haze.cv, 0, 0, haze.cv.width, haze.cv.height, 0, 0, w, h);
  if (glint) ctx.drawImage(glint.cv, 0, 0, glint.cv.width, glint.cv.height, 0, 0, w, h);
  ctx.restore();
}

const GLINT_RGB = ((): RGB3 => {
  const bone = hexToRgb(PALETTE.boneWhisper);
  const ember = hexToRgb(PALETTE.ember);
  // 探照灯是钨丝灯，反射出来是暖白而不是纯白
  return [
    lerp(bone[0], ember[0], 0.22) * 255,
    lerp(bone[1], ember[1], 0.22) * 255,
    lerp(bone[2], ember[2], 0.22) * 255,
  ];
})();

/**
 * 高光层的色标。和雾一样，浓度乘进 RGB 不乘进 alpha —— 这一层每个像素只能被
 * 涂一次，理由见 `hazeOf`。
 */
function glintStop(v: number): string {
  const a = clamp01(v);
  return `rgb(${Math.round(GLINT_RGB[0] * a)},${Math.round(GLINT_RGB[1] * a)},${Math.round(GLINT_RGB[2] * a)})`;
}

// ============================================================================
// 程序纹理
// ============================================================================

let gritBig: HTMLCanvasElement | null = null;
let grateBig: HTMLCanvasElement | null = null;
let dirtLayer: HTMLCanvasElement | null = null;

/** 一张大瓦片覆盖多少米。原瓦片的格距乘拼接数 */
const GRIT_M = 0.55 * 4;
const GRATE_M = 0.34 * 4;
let tilesTried = false;

/** 锈层按幕 + 朝向缓存。一关只换一次，所以几张就够 */
const rustTiles = new Map<string, HTMLCanvasElement | null>();

/** 锈层贴图的边长。整面十几米的墙全靠它拉满，小了就是马赛克 */
const RUST_PX = 256;

function rustFor(decay: Decay, under: boolean): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = `${decay.seed}|${under ? 'u' : 'o'}`;
  const got = rustTiles.get(key);
  if (got !== undefined) return got;
  if (rustTiles.size > 8) rustTiles.clear();
  let cv: HTMLCanvasElement | null = null;
  try {
    cv = bakeRust(decay, under);
  } catch {
    cv = null;
  }
  rustTiles.set(key, cv);
  return cv;
}

/**
 * 自己烘一张原尺寸的锈层。
 *
 * `render/interior.ts` 的 `makeRustLayer` 是在 w/4 x h/4 上烘再放大的 ——
 * 那是主内景渲染器的成本权衡，不是写错，所以不去动它。但这里要把一张图拉满一面
 * 十六米的舱壁，等效 25cm 一个纹素，放大出来就是一片马赛克。
 *
 * 顺带把幕数和朝向烘进来，这是随剧情腐化里最便宜的一半：
 *   - 覆盖率跟着幕数长。第一关是几块渗水印，第七关是整面烂穿。
 *   - 朝上的面积灰（沉降物），朝下的面挂长条的锈瘤（重力方向反了）。
 * 这两样都是低频的，十几米外也读得出来，而焊缝铆钉那个距离上连一个像素都不到。
 */
function bakeRust(decay: Decay, under: boolean): HTMLCanvasElement {
  const [cv, c] = makeCanvas(RUST_PX, RUST_PX);
  const img = c.createImageData(RUST_PX, RUST_PX);
  const d = img.data;
  const seed = decay.seed;
  const rot = decay.level;
  // 门槛越低，锈的覆盖率越高。第一关只有几块，第七关连成片
  const gate = lerp(0.56, 0.3, rot);
  const [dr, dg, db] = hexToRgb(PALETTE.rustDeep);
  const [hr, hg, hb] = hexToRgb(PALETTE.rustHot);
  for (let y = 0; y < RUST_PX; y++) {
    for (let x = 0; x < RUST_PX; x++) {
      const u = x / RUST_PX;
      const v = y / RUST_PX;
      // 低频斑块定大形，高频一层咬出边缘的颗粒
      const lo = fbm2(u * 4.5, v * 3.2, 5, seed);
      const hi = fbm2(u * 19 + 3.3, v * 14 + 7.1, 3, seed + 77);
      // 朝上的面上沉降物平铺；朝下的面上锈顺着重力拉成条
      const bias = under ? 0.06 * v - 0.02 : 0.05 * (1 - v) - 0.04;
      const amount = smoothstep((lo + hi * 0.3 + bias - gate) / 0.26);
      if (amount <= 0.003) continue;
      const core = smoothstep((amount - 0.5) / 0.5);
      const i = (y * RUST_PX + x) * 4;
      if (under) {
        // 挂在下缘的锈瘤偏暗偏红，还带一点附着物的灰
        d[i] = Math.round(lerp(dr * 255 * 0.8, hr * 255 * 0.7, core));
        d[i + 1] = Math.round(lerp(dg * 255 * 0.8, hg * 255 * 0.7, core));
        d[i + 2] = Math.round(lerp(db * 255 * 1.4, hb * 255, core));
      } else {
        d[i] = Math.round(lerp(dr * 255, hr * 255, core));
        d[i + 1] = Math.round(lerp(dg * 255, hg * 255, core));
        d[i + 2] = Math.round(lerp(db * 255, hb * 255, core));
      }
      d[i + 3] = Math.round(amount * lerp(150, 235, rot));
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}

function ensureTiles(): void {
  if (tilesTried) return;
  tilesTried = true;
  if (typeof document === 'undefined') return;
  gritBig = compose(makeGritTile(64, 17), 4);
  grateBig = compose(bakeGrate(48), 4);
}

/**
 * 这一幕的腐化程度。
 *
 * 第一关的舱壁和第七关的舱壁不能长得一样 —— 玩家往下钻的时候，铁本身要在烂下去。
 * 幕数是主项（剧情推进是不可逆的），画面污染只是叠一点即时的加成。
 */
interface Decay {
  /** 0..1。锈、开焊、掉漆全跟着它走 */
  level: number;
  /** 锈层的 seed。换幕就换一张锈，不然七关下来舱壁上是同一片锈斑 */
  seed: number;
}

function corrosionOf(vol: Volume, corruption: number): Decay {
  // 缺字段的房间不该让整帧崩掉。NaN 从这里漏出去会一路流进 `addColorStop`，
  // 那个函数收到 NaN 抛的是 SyntaxError，堆栈指向的地方离真凶十万八千里
  const act = clamp(Math.round(fin(vol.act, 1)), 1, 7);
  return {
    level: clamp01(((act - 1) / 6) * 0.78 + clamp01(fin(corruption, 0)) * 0.22),
    seed: 4409 + act * 977,
  };
}

/** 外面传进来的数只要不是有限数就用兜底值。一个坏字段不该掀掉整帧 */
function fin(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

/** 格栅甲板一格。烘一次，之后靠 pattern 的 transform 缩到 0.34 米一格 */
function bakeGrate(size: number): HTMLCanvasElement {
  const [cv, c] = makeCanvas(size, size);
  c.fillStyle = 'rgba(0,0,0,0.78)';
  c.fillRect(0, 0, size, size);
  c.fillStyle = 'rgba(126,136,148,0.46)';
  c.fillRect(0, 0, size, size * 0.14);
  c.fillRect(0, 0, size * 0.14, size);
  c.fillStyle = 'rgba(58,66,76,0.55)';
  c.fillRect(size * 0.14, size * 0.14, size * 0.4, size * 0.1);
  c.fillStyle = 'rgba(216,210,196,0.13)';
  c.fillRect(0, 0, size, size * 0.04);
  return cv;
}

/**
 * 把一张瓦片按「一格 m 米」铺满米空间里的 wm x hm 矩形。
 *
 * 这里刻意不用 `createPattern`。实测在软件光栅上铺满一屏：pattern 填充 12.2ms，
 * 同样结果的手动 drawImage 铺砖 0.8ms —— 十五倍。pattern 的采样路径每个像素都要
 * 走一遍带变换的取样，而 blit 是一段一段的内存搬运。地面格栅能占到半屏，这一条
 * 就是整个预算的生死线。
 *
 * 末行末列用源矩形裁一刀，所以铺出来严格不超出 wm x hm —— 不能指望调用点一定
 * 有 clip（盖满视口的近墙那一档是故意跳掉 clip 的）。
 */
function tileBlit(
  ctx: CanvasRenderingContext2D,
  tile: HTMLCanvasElement,
  face: Patch,
  m: number,
  alpha: number,
): void {
  if (alpha < 0.01 || face.pw <= 0 || face.ph <= 0) return;
  // 格数取整，让整数块正好铺满**整面**。
  //
  // 这一步不是为了省事：面片被 subdivide() 切成 2.6 米一块，而格栅的周期是 1.36 米，
  // 除不尽。要是按固定周期从每小块的局部原点铺起，每条接缝上纹理都会错半格 ——
  // 地板看起来就像拼错的马赛克。按整面取整之后，相邻小块的周期和相位天然一致。
  let nu = Math.max(1, Math.round(face.pw / m));
  let nv = Math.max(1, Math.round(face.ph / m));
  // 刀数的上限按**这一小块**压着多少格来卡，不是按整面有多少格。
  // 按整面卡会把一整面地板的格栅周期从 1.36 米放大到 2.7 米，画面上直接变成另一种
  // 地面。而真正要防的只是「一次调用里铺几百刀」，那只跟这一小块的大小有关。
  // 粗化必须整面一起粗化（对折），否则相邻小块的相位又对不上了。
  while ((face.w / (face.pw / nu)) * (face.h / (face.ph / nv)) > 64 && (nu > 1 || nv > 1)) {
    nu = Math.max(1, nu >> 1);
    nv = Math.max(1, nv >> 1);
  }
  const du = face.pw / nu;
  const dv = face.ph / nv;
  // 只铺压着这一小块的那几格。坐标系是小块的局部米，所以整面的格子要减掉偏移
  const i0 = Math.max(0, Math.floor(face.u0 / du));
  const j0 = Math.max(0, Math.floor(face.v0 / dv));
  const i1 = Math.min(nu, Math.ceil((face.u0 + face.w) / du));
  const j1 = Math.min(nv, Math.ceil((face.v0 + face.h) / dv));
  ctx.globalAlpha = alpha;
  // 噪声贴图，最近邻反而更脏，正是要的；而且省掉滤波
  ctx.imageSmoothingEnabled = false;
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) {
      ctx.drawImage(tile, i * du - face.u0, j * dv - face.v0, du, dv);
    }
  }
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true;
}

/**
 * 整面坐标里，落在 `from` 之前的最后一个 `start + k * step`。
 *
 * 材质的构造（焊缝、铆钉行、对缝）都按整面的网格排，但每次只画压着当前小块的那几行。
 * 从前一格开始而不是后一格，是为了让跨过小块边界的那一行也画全 —— 少画一行，
 * 接缝上就会缺一条焊缝。
 */
function gridFrom(start: number, step: number, from: number): number {
  if (step <= 0) return from + 1;
  return start + Math.max(0, Math.floor((from - start) / step)) * step;
}

/** 把小瓦片拼成 n x n 的大瓦片。铺同一片面积，blit 刀数少 n² 倍 */
function compose(src: HTMLCanvasElement, n: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  try {
    const [cv, c] = makeCanvas(src.width * n, src.height * n);
    c.imageSmoothingEnabled = false;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) c.drawImage(src, x * src.width, y * src.height);
    }
    return cv;
  } catch {
    return null;
  }
}

/**
 * 把坐标系换成这块面片自己的「米」。
 *
 * 只在四个顶点都在镜头前面时成立（此时面片是个矩形，仿射足够）。跨近裁面的面片
 * 拿不到可用的四角，退回屏幕空间的砂砾，反正那种面片近得只剩一块材质。
 */
function metersTransform(
  ctx: CanvasRenderingContext2D,
  q: ProjQuad,
  poly: Pt2[],
): { wm: number; hm: number; flipU: boolean; flipV: boolean } | null {
  if (poly.length !== 4 || !q.pts.every((p) => p.ok) || q.src.pts.length !== 4) return null;
  const s = q.src.pts;
  const wm = Math.hypot(s[1].x - s[0].x, s[1].y - s[0].y, s[1].z - s[0].z);
  const hm = Math.hypot(s[3].x - s[0].x, s[3].y - s[0].y, s[3].z - s[0].z);
  if (wm < 0.02 || hm < 0.02) return null;
  const ax = (poly[1].x - poly[0].x) / wm;
  const ay = (poly[1].y - poly[0].y) / wm;
  const bx = (poly[3].x - poly[0].x) / hm;
  const by = (poly[3].y - poly[0].y) / hm;
  const det = ax * by - ay * bx;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-7) return null;
  ctx.transform(ax, ay, bx, by, poly[0].x, poly[0].y);
  // 面片的顶点绕向是几何给的，u 轴可能指向屏幕左、v 轴可能指向屏幕上。程序纹理不在乎，
  // 但写在箱子上的字在乎 —— 所以把两个轴的屏幕朝向报出去，铭牌自己翻正。
  return { wm, hm, flipU: ax < 0, flipV: by < 0 };
}

/**
 * 细节的分级。
 *
 * 用渐隐而不是开关。开关是上一版另一处接缝的来源：`pxPerM` 是按**每一小块**的
 * 屏幕面积算的，相邻两块的深度差一点，这个数就差一点，恰好跨过门槛的那一对上，
 * 铆钉会整行凭空出现 —— 接缝于是又回来了，只是换了一层。渐隐之后门槛附近的
 * alpha 是连续的，深度连续，接缝也就连续。
 */
function lod(pxPerM: number, lo: number, hi: number): number {
  return smoothstep((pxPerM - lo) / Math.max(1e-3, hi - lo));
}

/**
 * 一整面的材质贴图，米空间，满亮度。
 *
 * 为什么要有这一层：材质是按**整面**铺的（锈斑拉满一面墙、焊缝横穿过去），而画的
 * 时候是按**小块**画的。上一版于是每一小块都把整面的材质重画一遍再 clip 掉 —— 一面
 * 16 米的墙切成 5×4，那张整面大的锈层就被缩放绘制了二十次，水渍的渐变建了二十遍。
 * 这是这一轮帧时翻倍的全部来源。
 *
 * 烘成贴图之后，每小块只剩一次「切一块贴上去」。而且贴图跟镜头无关（光和雾都是
 * 另外两层），所以能跨帧缓存：转云台不重烘，只有走近到换档才重烘一张。
 */
interface FaceTex {
  cv: HTMLCanvasElement;
  /** 一米多少纹素 */
  k: number;
}

const faceTexes = new Map<string, FaceTex>();

/**
 * 分辨率的档位。连着 `pxPerM` 走会让镜头一动就重烘 —— 档位带来的那点浪费
 * 比每帧重烘便宜得多
 */
const TEX_STEPS = [5, 8, 13, 21, 33, 48] as const;
/** 单张贴图的边长上限。16 米的墙到这里就是 28 纹素每米，够画铆钉 */
const TEX_SIDE = 448;
/** 贴图缓存留多少张。一间房六面加十几只障碍的可见面，八十张能全装下 */
const TEX_KEEP = 80;

/**
 * 上一次给这一面选的档位。
 *
 * `pxPerM` 是从这一面**当前画得出来的那几块**的屏幕面积反推的，所以它会随细分
 * 切法和裁剪抖动；正好卡在两档之间的时候，一帧一档来回跳，每跳一次就重烘一整面。
 * 加一道回滞：要升一档得多出四分之一，要降一档得少掉五分之一。
 */
const texRes = new Map<string, number>();

function texResOf(key: string, pxPerM: number, wm: number, hm: number): number {
  const cap = TEX_SIDE / Math.max(wm, hm, 0.05);
  let k = Math.min(TEX_STEPS[0], cap);
  for (const s of TEX_STEPS) {
    if (s <= pxPerM && s <= cap) k = s;
  }
  k = Math.max(2, k);
  const was = texRes.get(key);
  if (was !== undefined && was <= cap) {
    if (k > was && pxPerM < k * 1.25) k = was;
    else if (k < was && pxPerM > was * 0.8) k = was;
  }
  if (texRes.size > 256) texRes.clear();
  texRes.set(key, k);
  return k;
}

function faceTexture(
  mat: Mat,
  face: Patch,
  seed: number,
  under: boolean,
  info: FaceInfo,
  env: Env,
): FaceTex | null {
  const wm = face.pw;
  const hm = face.ph;
  const stem = `${mat.kind}|${wm.toFixed(2)}x${hm.toFixed(2)}|${seed}|${under ? 1 : 0}`;
  const k = texResOf(stem, info.pxPerM, wm, hm);
  const key = `${stem}|${k}|${Math.round(env.decay.level * 24)}`;
  const hit = faceTexes.get(key);
  if (hit) {
    // 命中的挪到队尾：下面淘汰的是最久没用过的那一半
    faceTexes.delete(key);
    faceTexes.set(key, hit);
    return hit;
  }

  const cv = document.createElement('canvas');
  cv.width = Math.max(2, Math.round(wm * k));
  cv.height = Math.max(2, Math.round(hm * k));
  const c = cv.getContext('2d');
  if (!c) return null;
  // 调速器要认得出这一帧是在烘焙。它是摊销成本，不该被当成稳态帧时
  baked++;
  // 满了只丢一半，不能整个清空 —— 一间房的可见面数就在上限附近晃，清一次
  // 下一帧全部要重烘一遍，而重烘一整面的锈层是这里最贵的一刀
  if (faceTexes.size > TEX_KEEP) {
    let drop = faceTexes.size - (TEX_KEEP >> 1);
    for (const old of faceTexes.keys()) {
      faceTexes.delete(old);
      if (--drop <= 0) break;
    }
  }

  // 换进米空间，下面每个 paint* 都还是按米写的
  c.scale(cv.width / wm, cv.height / hm);
  const alb = albedoOf(mat, env.decay);
  c.fillStyle = `rgb(${Math.round(alb[0])},${Math.round(alb[1])},${Math.round(alb[2])})`;
  c.fillRect(0, 0, wm, hm);

  const whole: Patch = { u0: 0, v0: 0, w: wm, h: hm, pw: wm, ph: hm };
  // 贴图里的分级按纹素密度算，不是按屏幕 —— 画一条画不出来的线只是在糊纹理
  const wear: Wear = { face: whole, pxPerM: k, seed, under };
  // 锈和砂砾压在材质**底下**。压在上面会把焊缝、铆钉、木条全糊掉 —— 那几条线是
  // 「读得出这是一只木箱而不是一块橙色多边形」的全部依据
  paintWear(c, wear, env);
  switch (mat.kind) {
    case 'hull':
    case 'ceiling':
      paintHull(c, wear, env);
      break;
    case 'grate':
      paintGrate(c, wear, env);
      break;
    case 'crate':
      paintCrate(c, wm, hm, wear, env);
      break;
    case 'tank':
      paintTank(c, wm, hm, env);
      break;
    case 'pipe':
      paintPipe(c, wm, hm);
      break;
    case 'column':
      paintColumn(c, wm, hm);
      break;
    case 'beam':
      paintBeam(c, wm, hm);
      break;
    default:
      break;
  }
  const tex: FaceTex = { cv, k };
  faceTexes.set(key, tex);
  return tex;
}

/**
 * 贴图往小块外面撑出多少个**设备**像素。
 *
 * 一个半：半个是盖住 AA 边，剩下一个是留给仿射贴图和真四边形之间那条发丝 ——
 * 透视强的小块上，仿射把第四个角放偏一点，不撑就漏出底下的水色
 */
const TEX_BLEED = 1.6;

/**
 * 把这一小块该露出的那一块贴图贴上去。
 *
 * 往外撑 `TEX_BLEED` 个像素，但只往整面的内部撑（源矩形夹在贴图里，目标矩形跟着
 * 夹）。相邻两小块因此互相盖住对方那半个 AA 像素 —— 撑出去的内容就是邻块自己的
 * 内容（同一张贴图、同一套坐标），所以盖上去看不出来。不撑的话，边上那一列像素
 * 两边各覆盖一半，源在上混色只攒到 0.75 的不透明度，底下的水色透出来，每条细分
 * 边界上就是一条暗线。这是上一版接缝比值只从 16 降到 13 的原因。
 */
function paintFace(
  ctx: CanvasRenderingContext2D,
  poly: Pt2[],
  q: ProjQuad,
  mat: Mat,
  info: FaceInfo,
  env: Env,
  plate: RoomMark | undefined,
): void {
  ensureTiles();
  const patch = patches.get(q.src.id);
  // 材质的 seed 要取**整面**的 id。取小块的 id 会让同一面墙上每块的锈斑、
  // 焊口、水渍各走一套随机数，接缝就全暴露了
  const seed = hashId(parentOf(q.src.id));

  ctx.save();
  const met = metersTransform(ctx, q, poly);
  if (!met) {
    ctx.restore();
    fillFlat(ctx, poly, mat, env);
    paintScreenGrit(ctx, poly, info.dim, polyArea(poly));
    return;
  }
  const { wm, hm } = met;
  // 细分过的小块要按它在整面里的位置取贴图；没细分的就是自己那一整面。
  // 跨近裁面被上游切过的小块，四角已经不是原来那一块，米空间对不上，退回整面处理
  const fits = patch !== undefined
    && Math.abs(wm - patch.w) < 0.02 && Math.abs(hm - patch.h) < 0.02;
  const face: Patch = fits && patch ? patch : { u0: 0, v0: 0, w: wm, h: hm, pw: wm, ph: hm };
  // 面朝下 = 箱底、吊管的下缘。水不会积在那里，但锈和附着物会挂在那里
  const under = q.src.normal.z > 0.7;
  const tex = faceTexture(mat, face, seed, under, info, env);
  if (!tex) {
    ctx.restore();
    fillFlat(ctx, poly, mat, env);
    return;
  }
  {
    // pxPerM 是按屏幕坐标算的，而真正落地的是缩放过的那张离屏，所以要先换成设备像素
    const bl = TEX_BLEED / Math.max(0.2, scale) / Math.max(4, info.pxPerM);
    const u0 = Math.max(0, face.u0 - bl);
    const v0 = Math.max(0, face.v0 - bl);
    const u1 = Math.min(face.pw, face.u0 + face.w + bl);
    const v1 = Math.min(face.ph, face.v0 + face.h + bl);
    const sx = tex.cv.width / face.pw;
    const sy = tex.cv.height / face.ph;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      tex.cv,
      u0 * sx, v0 * sy, (u1 - u0) * sx, (v1 - v0) * sy,
      u0 - face.u0, v0 - face.v0, u1 - u0, v1 - v0,
    );
  }

  if (plate) paintPlate(ctx, wm, hm, plate, info.pxPerM, { u: met.flipU, v: met.flipV });
  ctx.restore();
}

/** 一块面上跟腐蚀有关的一切。这几个数每个 paint* 都要，单独拎出来传 */
interface Wear {
  face: Patch;
  /** 贴图的分辨率（一米多少纹素）。细节的分级按它走 */
  pxPerM: number;
  seed: number;
  /** 这一面朝下（箱底、吊管的下缘） */
  under: boolean;
}

/**
 * 锈层与砂砾。没有这两层，程序化几何一眼就是「多边形」。
 *
 * 这一层往下所有的 paint* 都画在**贴图**上，所以 alpha 里既不能有光照项也不能有
 * 雾项：光是最后整幅乘的一层遮罩，雾是最后整幅加的一层。掺一个进来，贴图就变成
 * 跟镜头有关的东西，缓存作废，而且会在细分边界上跳一次。
 */
function paintWear(ctx: CanvasRenderingContext2D, wear: Wear, env: Env): void {
  const { face, pxPerM } = wear;
  const rust = rustFor(env.decay, wear.under);
  if (rust) {
    // 锈层是低频的污渍，而且要拉满一面十几米的墙。这一层必须滤波；
    // 高频的砂砾才该用最近邻
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(rust, -face.u0, -face.v0, face.pw, face.ph);
    ctx.globalAlpha = 1;
  }
  // 砂砾是高频层，贴图分辨率撑不住的时候它只是噪声。渐隐而不是开关
  const grit = lod(pxPerM, 10, 22);
  if (gritBig && grit > 0.02) tileBlit(ctx, gritBig, face, GRIT_M, 0.5 * grit);
}

/**
 * 锈钢舱壁：横向拼板 + 焊缝 + 铆钉行 + 往下淌的水渍 + 大块腐蚀。
 *
 * 全部按**整面**的米空间排布，只画压着当前这一小块的那几行。构造是整面墙的构造 ——
 * 焊缝要横穿过去，不能在每一小块里各排一遍。
 */
function paintHull(ctx: CanvasRenderingContext2D, wear: Wear, env: Env): void {
  const { face, seed, pxPerM } = wear;
  const wm = face.pw;
  const hm = face.ph;
  const u0 = face.u0;
  const v0 = face.v0;
  const u1 = u0 + face.w;
  const v1 = v0 + face.h;
  const plate = 1.55;
  const rot = env.decay.level;
  ctx.save();
  ctx.translate(-u0, -v0);

  // 漆。前面几关舱壁还是有漆的一块块拼板，后面几关漆基本没了，只剩裸铁
  if (rot < 0.82) {
    ctx.fillStyle = rgba(PALETTE.steel, 0.22 * (1 - rot / 0.82));
    ctx.fillRect(u0, v0, face.w, face.h);
  }

  // 铆钉。间距固定 —— 跟着 pxPerM 换间距会让相邻两小块的铆钉行对不上，
  // 那是另一条接缝。远了就整行淡出去。
  // 大块腐蚀不在这里：它已经烘进锈层贴图了（见 bakeRust），那一层的低频斑块
  // 就是十几米外唯一还读得出幕数的东西
  const rivets = lod(pxPerM, 14, 30);
  const welds = lod(pxPerM, 7, 16);
  if (rivets < 0.02 && welds < 0.02) {
    paintSheen(ctx, face, rot);
    ctx.restore();
    return;
  }
  for (let v = gridFrom(plate, plate, v0); v < v1; v += plate) {
    if (v > 0 && v < hm && welds > 0.02) {
      ctx.fillStyle = `rgba(0,0,0,${(0.55 * welds).toFixed(3)})`;
      ctx.fillRect(u0, v - 0.016, face.w, 0.032);
      ctx.fillStyle = rgba(PALETTE.steelLit, 0.26 * (1 - rot * 0.7) * welds);
      ctx.fillRect(u0, v + 0.02, face.w, 0.016);
    }
    // 开焊：腐化到一定程度，焊缝就不是一条线而是一串张开的口子
    if (rot > 0.34 && welds > 0.1) {
      const open = (rot - 0.34) / 0.66;
      for (let u = gridFrom(0.2, 0.85, u0); u < u1; u += 0.85) {
        if (hash2(Math.round(u * 7), seed + Math.round(v * 11)) > 0.72 - open * 0.42) continue;
        const gw = 0.18 + hash2(Math.round(u * 13), seed + 5) * 0.5 * open;
        ctx.fillStyle = `rgba(0,0,0,${(0.85 * welds).toFixed(3)})`;
        ctx.fillRect(u, v - 0.028 - open * 0.05, gw, 0.056 + open * 0.1);
        ctx.fillStyle = rgba(PALETTE.rustHot, 0.26 * open * welds);
        ctx.fillRect(u, v + 0.028 + open * 0.05, gw, 0.03);
      }
    }
    if (rivets < 0.02) continue;
    for (let u = gridFrom(0.3, 0.62, u0); u < u1; u += 0.62) {
      // 锈到后面铆钉会整颗掉，留一个黑窝
      const gone = rot > 0.5 && hash2(Math.round(u * 17), seed + Math.round(v * 3)) < (rot - 0.5) * 0.8;
      if (gone) {
        ctx.fillStyle = `rgba(0,0,0,${(0.7 * rivets).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(u, v - 0.1, 0.034, 0, TAU);
        ctx.fill();
        continue;
      }
      ctx.fillStyle = rgba(PALETTE.boneDim, 0.32 * (1 - rot * 0.55) * rivets);
      ctx.beginPath();
      ctx.arc(u, v - 0.1, 0.038, 0, TAU);
      ctx.fill();
      ctx.fillStyle = `rgba(0,0,0,${(0.4 * rivets).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(u + 0.012, v - 0.086, 0.028, 0, TAU);
      ctx.fill();
    }
  }

  // 竖向对缝
  for (let u = gridFrom(3.1, 3.1, u0); u < u1; u += 3.1) {
    if (u <= 0 || u >= wm) continue;
    ctx.fillStyle = `rgba(0,0,0,${(0.4 * welds).toFixed(3)})`;
    ctx.fillRect(u - 0.014, v0, 0.028, face.h);
  }

  // 水渍：从铆钉往下淌，越往下越淡。朝下的面上水不会积，所以不画
  if (!wear.under) {
    const streak = lod(pxPerM, 6, 16);
    const streaks = Math.round(9 + rot * 9);
    for (let i = 0; i < streaks && streak > 0.02; i++) {
      const u = hash2(i, seed) * wm;
      const v = hash2(i + 5, seed + 3) * hm * 0.7;
      const len = hm * (0.08 + hash2(i + 9, seed + 7) * 0.4);
      if (u > u1 || u + 0.15 < u0 || v > v1 || v + len < v0) continue;
      const g = ctx.createLinearGradient(0, v, 0, v + len);
      g.addColorStop(0, `rgba(12,8,4,${(0.42 * streak).toFixed(3)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(u, v, 0.055 + hash2(i, seed + 11) * 0.09, len);
    }
  }

  paintSheen(ctx, face, rot);
  ctx.restore();
}

/**
 * 湿钢的一片镜面。锈透了的铁不反光。
 *
 * 渐变横跨**整面**，这样相邻小块上的高光是接起来的一片，不是一块块的亮斑。
 * 强度不看受光 —— 那由最后那一遍遮罩负责。调用方负责已经 translate 到整面坐标
 */
function paintSheen(
  ctx: CanvasRenderingContext2D,
  face: Patch,
  rot: number,
): void {
  if (rot >= 0.9) return;
  const g = ctx.createLinearGradient(0, 0, face.pw, face.ph);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.5, rgba(PALETTE.boneWhisper, 0.22 * (1 - rot * 0.6)));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(face.u0, face.v0, face.w, face.h);
}

function paintGrate(ctx: CanvasRenderingContext2D, wear: Wear, env: Env): void {
  const { face } = wear;
  const wm = face.pw;
  const hm = face.ph;
  const rot = env.decay.level;
  if (grateBig) tileBlit(ctx, grateBig, face, GRATE_M, 1);
  ctx.save();
  ctx.translate(-face.u0, -face.v0);
  // 大梁：把格栅分段，让地面读得出尺度
  const v1 = face.v0 + face.h;
  for (let v = gridFrom(2.4, 2.4, face.v0); v < v1; v += 2.4) {
    if (v <= 0 || v >= hm) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(face.u0, v - 0.07, face.w, 0.14);
    ctx.fillStyle = rgba(PALETTE.steelLit, 0.2 * (1 - rot * 0.7));
    ctx.fillRect(face.u0, v - 0.07, face.w, 0.03);
  }
  // 塌掉的格栅。这一层刻意不分级：后面几关地面上是一个个能掉下去的窟窿，
  // 那是站在门口就该看见的大形，不是走近才发现的细节
  if (rot > 0.3) {
    const t = (rot - 0.3) / 0.7;
    const holes = Math.round(2 + t * 14);
    for (let i = 0; i < holes; i++) {
      const u = hash2(i, 311) * wm;
      const v = hash2(i, 733) * hm;
      const ru = (0.24 + hash2(i, 97) * 0.5) * (0.6 + t);
      const rv = (0.2 + hash2(i, 41) * 0.44) * (0.6 + t);
      if (u - ru > face.u0 + face.w || u + ru < face.u0 || v - rv > v1 || v + rv < face.v0) {
        continue;
      }
      ctx.fillStyle = 'rgba(0,0,0,0.88)';
      ctx.beginPath();
      ctx.ellipse(u, v, ru, rv, 0, 0, TAU);
      ctx.fill();
      // 塌口翻起来的毛边
      ctx.strokeStyle = rgba(PALETTE.rustDeep, 0.5 * t);
      ctx.lineWidth = 0.04;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 货箱：木条箱身 + 金属角件 + 对角撑。玩家接下来要翻的就是这个 */
function paintCrate(
  ctx: CanvasRenderingContext2D,
  wm: number,
  hm: number,
  wear: Wear,
  env: Env,
): void {
  const rot = env.decay.level;
  const seed = wear.seed;
  const g = ctx.createLinearGradient(0, 0, 0, hm);
  g.addColorStop(0, rgba(PALETTE.rustHot, 0.22));
  g.addColorStop(1, 'rgba(0,0,0,0.34)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, wm, hm);

  // 木条。泡烂了的木头会翘、会裂，缝越张越开
  const slats = Math.max(3, Math.round(hm / 0.34));
  for (let i = 1; i < slats; i++) {
    const v = (hm * i) / slats;
    const gap = 0.024 + rot * 0.03 * hash2(i, seed + 19);
    ctx.fillStyle = `rgba(0,0,0,${(0.5 + rot * 0.24).toFixed(3)})`;
    ctx.fillRect(0, v - gap * 0.5, wm, gap);
    ctx.fillStyle = rgba(PALETTE.ember, 0.14 * (1 - rot * 0.6));
    ctx.fillRect(0, v + gap * 0.6, wm, 0.012);
    // 崩掉一块条
    if (rot > 0.55 && hash2(i, seed + 61) < (rot - 0.55) * 0.9) {
      const u0 = hash2(i, seed + 71) * wm * 0.6;
      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      ctx.fillRect(u0, v - hm / slats + gap, wm * (0.14 + rot * 0.2), hm / slats - gap * 2);
    }
  }
  // 边框与角件
  const rail = Math.min(0.11, Math.min(wm, hm) * 0.09);
  ctx.fillStyle = rgba(PALETTE.steelLit, 0.38);
  ctx.fillRect(0, 0, wm, rail);
  ctx.fillRect(0, hm - rail, wm, rail);
  ctx.fillRect(0, 0, rail, hm);
  ctx.fillRect(wm - rail, 0, rail, hm);
  ctx.fillStyle = rgba(PALETTE.boneDim, 0.26);
  const corner = rail * 2.4;
  for (const [cu, cv] of [[0, 0], [wm - corner, 0], [0, hm - corner], [wm - corner, hm - corner]]) {
    ctx.fillRect(cu, cv, corner, rail * 0.8);
    ctx.fillRect(cu, cv, rail * 0.8, corner);
  }
  // 对角撑
  ctx.strokeStyle = rgba(PALETTE.rustDeep, 0.58);
  ctx.lineWidth = rail * 0.55;
  ctx.beginPath();
  ctx.moveTo(rail, rail);
  ctx.lineTo(wm - rail, hm - rail);
  ctx.stroke();
  // 撬过的痕迹。这一箱不是第一个人来
  if (hash2(seed, 31) > 0.45) {
    ctx.strokeStyle = 'rgba(0,0,0,0.58)';
    ctx.lineWidth = rail * 0.3;
    ctx.beginPath();
    ctx.moveTo(wm * 0.2, hm * 0.62);
    ctx.lineTo(wm * 0.55, hm * 0.55);
    ctx.stroke();
  }
  // 上棱那一道木头的高光
  ctx.fillStyle = rgba(PALETTE.ember, 0.12);
  ctx.fillRect(0, 0, wm, rail * 1.2);
}

function paintTank(ctx: CanvasRenderingContext2D, wm: number, hm: number, env: Env): void {
  const rot = env.decay.level;
  const g = ctx.createLinearGradient(0, 0, wm, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.68)');
  g.addColorStop(0.32, rgba(PALETTE.boneDim, 0.3));
  g.addColorStop(0.62, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.76)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, wm, hm);
  for (let v = hm * 0.18; v < hm; v += hm * 0.3) {
    ctx.fillStyle = rgba(PALETTE.steelLit, 0.36);
    ctx.fillRect(0, v, wm, 0.07);
    ctx.fillStyle = 'rgba(0,0,0,0.48)';
    ctx.fillRect(0, v + 0.07, wm, 0.03);
  }
  // 危险标：罐子是压力容器，漆一条血红的环。漆也会掉
  ctx.fillStyle = rgba(PALETTE.bloodDim, 0.5 * (1 - rot * 0.5));
  ctx.fillRect(0, hm * 0.52, wm, hm * 0.07);
  if (rot > 0.4) {
    // 焊缝渗出来的一道垢。罐子在漏
    const s = ctx.createLinearGradient(0, hm * 0.59, 0, hm);
    s.addColorStop(0, rgba(PALETTE.rustHot, 0.36 * (rot - 0.4) * 1.6));
    s.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = s;
    ctx.fillRect(wm * 0.3, hm * 0.59, wm * 0.22, hm * 0.41);
  }
}

/**
 * 铭牌，漆在箱子这一面的米空间里。
 *
 * 分级的理由：三米外一行汉字只有四个像素高，画出来是一团脏点，不如只留封条的色带。
 * 「那行字真的写在那只箱子上」这件事只在够近的时候才成立，那也正是玩家蹲下去读的
 * 时候。
 */
function paintPlate(
  ctx: CanvasRenderingContext2D,
  wm: number,
  hm: number,
  mark: RoomMark,
  pxPerM: number,
  flip: { u: boolean; v: boolean },
): void {
  // 「灯照到才看得见」由最后那一遍受光遮罩负责，这里只管漆
  const a = 1;
  ctx.save();
  // 把这一面的米空间翻成「u 朝屏幕右、v 朝屏幕下」，不然字是反的或倒的
  if (flip.u) {
    ctx.translate(wm, 0);
    ctx.scale(-1, 1);
  }
  if (flip.v) {
    ctx.translate(0, hm);
    ctx.scale(1, -1);
  }

  // 封条：横贯这一面的一条色带，是最远也读得出的一级
  const bandY = hm * 0.34;
  const bandH = Math.min(0.2, hm * 0.13);
  if (mark.seal) {
    const c = sealColor(mark.seal);
    ctx.globalAlpha = a;
    ctx.fillStyle = rgba(c, 0.82);
    ctx.fillRect(wm * 0.06, bandY, wm * 0.88, bandH);
    ctx.fillStyle = `rgba(0,0,0,${(0.45).toFixed(2)})`;
    ctx.fillRect(wm * 0.06, bandY + bandH, wm * 0.88, bandH * 0.22);
    ctx.globalAlpha = 1;
  }

  // 翻过几遍：一条一条划在封条下面，不用认字也数得出来
  const passes = mark.passes ?? 0;
  if (passes > 0 && pxPerM > 30) {
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = rgba(PALETTE.bone, 0.7);
    ctx.lineWidth = Math.min(0.03, wm * 0.012);
    for (let i = 0; i < Math.min(6, passes); i++) {
      const u = wm * 0.12 + i * Math.min(0.14, wm * 0.09);
      ctx.beginPath();
      ctx.moveTo(u, bandY + bandH * 1.7);
      ctx.lineTo(u + Math.min(0.05, wm * 0.02), bandY + bandH * 2.9);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // 一米不到六十像素的话，汉字渲出来也读不了
  const text = mark.label;
  if (!text || pxPerM < 60) {
    ctx.restore();
    return;
  }
  const fs = clamp(Math.min(hm * 0.13, (2.2 / pxPerM) * 26), 0.08, 0.3);
  ctx.font = cjk(16, 600);
  // 铭牌是印在铁皮上的，不是浮在空中的 UI —— 字压不进这一面就得缩，
  // 溢出箱子边的那一刻整只箱子就不像实物了
  const room = wm * 0.84;
  const tw = ctx.measureText(text).width;
  // 字号是米，要把 font 的像素单位换算过去
  const k = Math.min(fs / 16, room / Math.max(1, tw));
  // 缩到这个份上已经是一道糊掉的划痕，不如只留色带
  if (k * 16 < 0.055) {
    ctx.restore();
    return;
  }
  ctx.globalAlpha = a;
  ctx.translate(wm * 0.08, bandY - bandH * 0.9);
  ctx.scale(k, k);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(text, 0.6, 0.6);
  ctx.fillStyle = rgba(PALETTE.bone, 0.9);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}


/**
 * 圆柱面的明暗。
 *
 * 这一层是几何欺骗，不是受光：一根管子在几何上是个方盒，靠这道横跨的渐变才看起来
 * 是圆的。所以它必须和受光分开 —— 它属于材质，跟灯在哪没关系。
 */
function paintPipe(ctx: CanvasRenderingContext2D, wm: number, hm: number): void {
  const along = wm >= hm;
  const g = along
    ? ctx.createLinearGradient(0, 0, 0, hm)
    : ctx.createLinearGradient(0, 0, wm, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.72)');
  g.addColorStop(0.28, rgba(PALETTE.rustHot, 0.34));
  g.addColorStop(0.6, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.78)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, wm, hm);
  // 法兰
  const step = Math.max(0.9, (along ? wm : hm) / 3);
  ctx.fillStyle = rgba(PALETTE.steel, 0.62);
  for (let t = step * 0.5; t < (along ? wm : hm); t += step) {
    if (along) ctx.fillRect(t, -0.02, 0.09, hm + 0.04);
    else ctx.fillRect(-0.02, t, wm + 0.04, 0.09);
  }
}

function paintColumn(ctx: CanvasRenderingContext2D, wm: number, hm: number): void {
  const g = ctx.createLinearGradient(0, 0, wm, 0);
  g.addColorStop(0, 'rgba(0,0,0,0.6)');
  g.addColorStop(0.4, rgba(PALETTE.boneWhisper, 0.24));
  g.addColorStop(1, 'rgba(0,0,0,0.66)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, wm, hm);
  for (let v = 0.5; v < hm; v += 1.1) {
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.fillRect(0, v, wm, 0.05);
  }
  ctx.fillStyle = rgba(PALETTE.rustDeep, 0.36);
  ctx.fillRect(wm * 0.36, 0, wm * 0.14, hm);
}

function paintBeam(ctx: CanvasRenderingContext2D, wm: number, hm: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, hm);
  g.addColorStop(0, rgba(PALETTE.steelLit, 0.34));
  g.addColorStop(0.5, 'rgba(0,0,0,0.5)');
  g.addColorStop(1, rgba(PALETTE.steelDark, 0.46));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, wm, hm);
  // 腹板上的减重孔
  const step = Math.max(0.6, wm / 6);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  for (let u = step * 0.5; u < wm; u += step) {
    ctx.beginPath();
    ctx.ellipse(u, hm * 0.5, Math.min(0.14, step * 0.2), hm * 0.26, 0, 0, TAU);
    ctx.fill();
  }
}

/** 跨近裁面的面片没法建米空间，退回屏幕空间的一层砂砾 */
function paintScreenGrit(
  ctx: CanvasRenderingContext2D,
  poly: Pt2[],
  dim: number,
  area: number,
): void {
  if (!gritBig) return;
  ctx.save();
  tracePoly(ctx, poly);
  ctx.clip();
  const bb = bbox(poly);
  // 这里的「格」是像素不是米，跨近裁面的面片拿不到米空间
  const px = 256 * Math.max(1, Math.sqrt(area) / 220);
  ctx.translate(bb.x, bb.y);
  const rect: Patch = { u0: 0, v0: 0, w: bb.w, h: bb.h, pw: bb.w, ph: bb.h };
  tileBlit(ctx, gritBig, rect, px, clamp01(0.2 + dim * 0.25));
  ctx.restore();
}

// ============================================================================
// 水、光锥、悬浮物
// ============================================================================

/** 房间之外什么都没有。灯关着的时候这层就是全黑 */
function drawWaterFloor(ctx: CanvasRenderingContext2D, w: number, h: number, light: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, shadeHex(PALETTE.abyss, 0.9 + light * 0.7));
  g.addColorStop(0.55, shadeHex(PALETTE.abyss, 0.6 + light * 0.4));
  g.addColorStop(1, '#010203');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/**
 * 光锥里的体积散射。
 *
 * 灯打进水里，水本身会亮 —— 这层是「这是水下」而不是「这是一间干燥的房间」的
 * 全部区别。它必须加在几何之后，否则会被墙盖掉。
 */
function drawConeScatter(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  light: number,
  zoom: number,
): void {
  if (light < 0.03) return;
  const cx = w * 0.5;
  const cy = h * 0.5;
  const r = Math.max(w, h) * (0.62 / Math.sqrt(zoom));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, rgba(PALETTE.ember, 0.075 * light));
  g.addColorStop(0.32, rgba(PALETTE.rust, 0.04 * light));
  g.addColorStop(0.7, rgba(PALETTE.rustDeep, 0.014 * light));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/**
 * 海雪。
 *
 * 每一片有自己的深度，画之前先问一句「这个位置的几何有多远」，比它近的就把它挡掉。
 * 悬浮物飘到箱子前面挡住封条 —— 这种层次是水下镜头的灵魂，少了它整幅画面就是
 * 一层贴在玻璃上的噪点。
 */
function drawSnow(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  light: number,
  zoom: number,
  drawn: readonly Painted[],
): void {
  const n = 64;
  const diag = Math.max(w, h);
  ctx.save();
  for (let i = 0; i < n; i++) {
    // 0.35 米到 13 米。三次方分布让近处那几片大颗的少而显眼
    const t = hash2(i, 41);
    const depth = 0.35 + t * t * t * 12.6;
    // 近的飘得快。这是唯一免费的深度线索
    const drift = 0.05 / depth;
    const x = (((hash2(i, 5) + time * drift * (hash2(i, 13) - 0.5) * 2) % 1) + 1) % 1 * w;
    const y = (((hash2(i, 23) + time * drift) % 1) + 1) % 1 * h;
    if (depthAt(drawn, x, y) < depth) continue;

    const cone = smoothstep(1 - Math.hypot(x - w * 0.5, y - h * 0.5) / (diag * 0.5));
    // 视直径：一片两厘米的絮，离镜头越近越占屏
    const s = clamp((0.022 / depth) * diag * zoom, 0.6, 7);
    const fogT = 1 - Math.exp(-depth / FOG_HALF);
    const a = (0.06 + light * cone * 1.25) * (1 - fogT * 0.8);
    if (a < 0.012) continue;
    ctx.fillStyle = `rgba(226,214,190,${clamp01(a).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, s * 0.5, s * (0.3 + hash2(i, 31) * 0.4), hash2(i, 53) * TAU, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/** 这个屏幕位置上最近的一块几何有多远。没有几何就是无穷远（房间外面的水） */
function depthAt(drawn: readonly Painted[], x: number, y: number): number {
  // 画家序列是远到近，所以倒着找，第一个命中的就是最近的
  for (let i = drawn.length - 1; i >= 0; i--) {
    if (pointIn(drawn[i].poly, x, y)) return drawn[i].depth;
  }
  return Infinity;
}

/**
 * 最近的那面「盖满视口」的墙有多远。比它远的房间面一块都不用画。
 *
 * 用整面那一份几何来判。剪切不用管：整幅画一起剪，盖满就还是盖满。
 */
function coveringDepth(
  coarse: RoomGeometry | null,
  eye: Eye,
  vp: Viewport,
  w: number,
  h: number,
): number {
  if (!coarse) return Infinity;
  let best = Infinity;
  for (const q of projectRoom(coarse, eye, vp)) {
    if (q.src.kind === 'obstacle' || q.depth >= best) continue;
    if (coversViewport(quadPoly(q), w, h)) best = q.depth;
  }
  return best;
}

/** 凸多边形是否盖住整个视口。四个角都在里面就是盖住了 */
function coversViewport(poly: readonly Pt2[], w: number, h: number): boolean {
  return (
    pointIn(poly, 0.5, 0.5) &&
    pointIn(poly, w - 0.5, 0.5) &&
    pointIn(poly, 0.5, h - 0.5) &&
    pointIn(poly, w - 0.5, h - 0.5)
  );
}

function pointIn(poly: readonly Pt2[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x)) inside = !inside;
  }
  return inside;
}

/**
 * 障碍的投影。
 *
 * 从灯位向障碍盒的八个角做一次点光源投影，落在房间某一面上，取屏幕空间的凸包。
 * 关键是它跟着灯走：拧云台的时候影子会扫过去 —— 「把灯扫过去」这个动作的分量
 * 一半在这里。光锥边缘之外没有影子，因为那里根本没有光可挡。
 *
 * 落在哪一面是算出来的，不是写死地板：灯高于箱子时影子落地，灯和箱子齐平时
 * 影子上墙，而且会被拉得很长 —— 一只一米的箱子在舱壁上拖出四米的黑影，
 * 那是这间房里最有压迫感的一笔。
 *
 * 一道影子可以同时落在两三个面上。八个角各自算自己从房间哪一面射出去，于是
 * 一只斜对着墙角的箱子投出来的是两片：一片在地板上、一片折上舱壁。折法是把
 * 「不属于这一面」的那几个落点夹到房间的棱上，所以两片在棱上严丝合缝地接住，
 * 既不断开也不重叠（重叠面积为零，不会在棱上压出一条更黑的线）。
 *
 * 必须画在舱壁之后、障碍之前：影子属于被照的那一面，不属于箱子。
 */
/** 一只障碍投在房间某一面上的那一道影子。影子和反弹光都从这一份结果出 */
interface Cast {
  hull: Pt2[];
  mid: Pt2;
  /** 影子的浓度 0..1 */
  core: number;
  /** 半影量：盒子离被照那一面越远越散 */
  air: number;
  /** 这只障碍自己收到多少光。反弹光的强度按它算 */
  recv: number;
  kind: ObstacleKind;
  /**
   * 是不是这只障碍的主片（接住最多个角的那一面）。
   * 反弹光一只障碍只洒一团，不能每片都洒一团 —— 绕墙角的箱子会亮两倍
   */
  lead: boolean;
}

function castsOf(
  geo: RoomGeometry,
  b: EyeBasis,
  vp: Viewport,
  lamp: LampSpec,
  light: number,
  shearAt: (y: number) => number,
): Cast[] {
  const out: Cast[] = [];
  if (light < 0.06 || geo.obstacles.length === 0) return out;
  const half = [geo.half.x, geo.half.y, geo.half.z];
  const L = [lamp.pos.x, lamp.pos.y, lamp.pos.z];

  for (const o of geo.obstacles) {
    const C = [o.pos.x, o.pos.y, o.pos.z];
    const S = [o.size.x * 0.5, o.size.y * 0.5, o.size.z * 0.5];

    // 这只障碍自己收到多少光。它朝灯的那一面几乎正对着灯，所以入射角项取满，
    // 只留光锥和距离两项 —— 反弹出去的能量按这个算
    const dc = Math.hypot(C[0] - L[0], C[1] - L[1], C[2] - L[2]);

    // 八个角各射出去一次。落点、落在哪一面、走了多远，三样都逐角算 ——
    // 斜对着墙角的箱子，八个角本来就不落在同一面上
    const exit: number[][] = [];
    const face: number[] = [];
    const tOf: number[] = [];
    for (let i = 0; i < 8; i++) {
      const p = [
        C[0] + (i & 1 ? S[0] : -S[0]),
        C[1] + (i & 2 ? S[1] : -S[1]),
        C[2] + (i & 4 ? S[2] : -S[2]),
      ];
      // 射线离开房间盒子的那一面：三个候选面里 t 最小的那个。
      // t < 1.02 的排掉 —— 那一面在角点前面，挡不到
      let axis = -1;
      let t = Infinity;
      for (let k = 0; k < 3; k++) {
        const dk = p[k] - L[k];
        if (Math.abs(dk) < 1e-4) continue;
        const tk = ((dk > 0 ? half[k] : -half[k]) - L[k]) / dk;
        if (tk > 1.02 && tk < t) {
          t = tk;
          axis = k;
        }
      }
      if (axis < 0 || t > 14) continue;
      exit.push([
        L[0] + (p[0] - L[0]) * t,
        L[1] + (p[1] - L[1]) * t,
        L[2] + (p[2] - L[2]) * t,
      ]);
      face.push(p[axis] - L[axis] > 0 ? axis : axis + 3);
      tOf.push(t);
    }
    if (exit.length < 3) continue;

    // 按落在哪一面分组。接住角最多的是主片
    const tally = new Map<number, number>();
    for (const f of face) tally.set(f, (tally.get(f) ?? 0) + 1);
    let leadFace = -1;
    let leadN = 0;
    for (const [f, n] of tally) {
      if (n > leadN) {
        leadN = n;
        leadFace = f;
      }
    }

    for (const [f, n] of tally) {
      // 只接住一个角的面不画。那种片是墙角上一条针，画出来是噪点
      if (n < 2 && f !== leadFace) continue;
      const axis = f % 3;
      const plane = f < 3 ? half[axis] : -half[axis];

      // 八个落点全都折到这一面上：本来就在这一面的原样，落在别的面上的
      // 沿房间的棱夹进来。于是两片在棱上正好接住
      const pts: Pt2[] = [];
      let tSum = 0;
      let tN = 0;
      for (let i = 0; i < exit.length; i++) {
        const q = [exit[i][0], exit[i][1], exit[i][2]];
        q[axis] = plane;
        for (let k = 0; k < 3; k++) if (k !== axis) q[k] = clamp(q[k], -half[k], half[k]);
        const e = toEye({ x: q[0], y: q[1], z: q[2] }, b);
        if (e.z < NEAR_CLIP) continue;
        const sy = vp.cy - (e.py / e.z) * vp.focal;
        pts.push({ x: vp.cx + (e.px / e.z) * vp.focal + shearAt(sy), y: sy });
        if (face[i] === f) {
          tSum += tOf[i];
          tN++;
        }
      }
      if (pts.length < 3 || tN === 0) continue;
      const hull = convexHull(pts);
      if (hull.length < 3) continue;

      // 光锥外没有影子
      const t = tSum / tN;
      const hx = L[0] + (C[0] - L[0]) * t;
      const hy = L[1] + (C[1] - L[1]) * t;
      const hz = L[2] + (C[2] - L[2]) * t;
      const vx = hx - L[0];
      const vy = hy - L[1];
      const vz = hz - L[2];
      const vl = Math.hypot(vx, vy, vz);
      if (vl < 0.05) continue;
      const ang = Math.acos(clamp((vx * lamp.dir.x + vy * lamp.dir.y + vz * lamp.dir.z) / vl, -1, 1));
      const inCone = clamp01(1 - ang / (lamp.cone * 1.9));
      if (inCone < 0.02) continue;

      // 半影：盒子离被照那一面越远，影子越散。这是「这只箱子是贴着墙的还是
      // 离墙一米的」的唯一提示
      const air = clamp01((t - 1) * 0.55);
      // 雾不在这里算。影子在受光层上，雾是后面单独加的一层 —— 两边都乘一次
      // 就等于把远处的影子抹掉两遍
      const d = Math.hypot(hx - b.pos.x, hy - b.pos.y, hz - b.pos.z);
      const core = clamp01(
        0.7 * light * inCone * (1 - air * 0.5) *
        clamp01(lamp.reach / Math.max(1, d) - 0.2),
      );
      if (core < 0.02) continue;

      const fall = clamp01(1 - dc / lamp.reach);
      out.push({
        hull,
        mid: centroidOf(hull),
        core,
        air,
        recv: clamp01(light * inCone * fall * fall),
        kind: o.kind,
        lead: f === leadFace,
      });
    }
  }
  return out;
}

function drawCastShadows(ctx: CanvasRenderingContext2D, casts: readonly Cast[]): void {
  if (casts.length === 0) return;
  ctx.save();
  for (const c of casts) {
    // 三圈套画就是一层够软的半影。真高斯在这里不值那个钱
    const { hull, mid } = c;
    for (const [k, a] of [[1 + c.air * 0.5, 0.26], [0.78, 0.34], [0.5, 0.36]] as const) {
      ctx.fillStyle = `rgba(0,0,0,${(c.core * a).toFixed(3)})`;
      ctx.beginPath();
      for (let i = 0; i < hull.length; i++) {
        const x = mid.x + (hull[i].x - mid.x) * k;
        const y = mid.y + (hull[i].y - mid.y) * k;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * 二次反弹。
 *
 * 被探照灯打亮的货箱是这间房里第二亮的东西，它朝灯的那一面把一大片橙光反回去，
 * 洒在它周围的舱壁和地板上。少了这一层，箱子看起来像是贴在墙上的一张纸：它自己
 * 亮着，周围一点反应都没有。
 *
 * 不做真 GI，一只障碍一团加法斑。斑心对准影子落点，半径比影子大一倍多 ——
 * 于是影子的芯子暗、边上一圈橙，正好是漫反射填进半影里的样子。颜色取障碍自己的
 * 材质本色：木箱洒橙，钢罐洒的是冷一点的骨白，这样「那边有个箱子」这件事在
 * 光锥扫过去之前就能从墙上的一片颜色里读出来。
 */
function drawBounce(
  ctx: CanvasRenderingContext2D,
  casts: readonly Cast[],
  decay: Decay,
): boolean {
  if (casts.length === 0) return false;
  let any = false;
  ctx.save();
  // 加法：这一层的面片底色是 source-over 涂上去的，斑要叠在它上面而不是盖掉它
  ctx.globalCompositeOperation = 'lighter';
  for (const c of casts) {
    if (!c.lead) continue;
    // 反弹的能量 = 收到的光 x 表面反射率。钢比木头反得多，但都远小于 1
    const alb = albedoOf(OBSTACLE_MAT[c.kind], decay);
    const amp = c.recv * 0.3;
    if (amp < 0.012) continue;
    let r = 0;
    for (const p of c.hull) r = Math.max(r, Math.hypot(p.x - c.mid.x, p.y - c.mid.y));
    r = Math.max(6, r * 2.3);
    const g = ctx.createRadialGradient(c.mid.x, c.mid.y, 0, c.mid.x, c.mid.y, r);
    const f = (k: number): string =>
      `rgba(${Math.round(alb[0])},${Math.round(alb[1])},${Math.round(alb[2])},${(amp * k).toFixed(3)})`;
    // 中间不给满：影子的芯子本来就该是暗的，反弹光只把半影那一圈填起来
    g.addColorStop(0, f(0.55));
    g.addColorStop(0.42, f(0.85));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.mid.x, c.mid.y, r, 0, TAU);
    ctx.fill();
    any = true;
  }
  ctx.restore();
  return any;
}

function centroidOf(poly: readonly Pt2[]): Pt2 {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

/** 八个点的凸包。礼品包装法，点少得没必要上更快的算法 */
function convexHull(pts: readonly Pt2[]): Pt2[] {
  const n = pts.length;
  let start = 0;
  for (let i = 1; i < n; i++) {
    if (pts[i].x < pts[start].x || (pts[i].x === pts[start].x && pts[i].y < pts[start].y)) start = i;
  }
  const out: Pt2[] = [];
  let cur = start;
  for (let guard = 0; guard < n + 1; guard++) {
    out.push(pts[cur]);
    let next = (cur + 1) % n;
    for (let i = 0; i < n; i++) {
      const cross =
        (pts[next].x - pts[cur].x) * (pts[i].y - pts[cur].y) -
        (pts[next].y - pts[cur].y) * (pts[i].x - pts[cur].x);
      if (cross < 0) next = i;
    }
    cur = next;
    if (cur === start) break;
  }
  return out;
}

// ============================================================================
// 云台角速度与果冻效应
// ============================================================================

interface Spin {
  /** 度每秒 */
  yaw: number;
  pitch: number;
}

let lastPose: { yaw: number; pitch: number; time: number } | null = null;
let smoothYaw = 0;
let smoothPitch = 0;

/**
 * 云台角速度，自己从相邻两帧的视点算。
 *
 * 刻意不向 `run.ts` 要 `camPanVel` —— 那样只有一个调用方是对的，而这里对任何
 * 调用方都成立：谁把视点交进来，谁就自动得到正确的剪切。
 */
function spin(eye: Eye, time: number): Spin {
  const prev = lastPose;
  lastPose = { yaw: eye.yaw, pitch: eye.pitch, time };
  if (!prev) return { yaw: 0, pitch: 0 };
  const dt = time - prev.time;
  // 掉帧、暂停、切场景都不算转动：0.4 秒以上的跨度算不出有意义的角速度。
  // 这种时候要把上一次的角速度**衰减掉**而不是留着 —— 留着的话，暂停一下再回来，
  // 画面就一直剪着，而云台明明是停的
  if (dt <= 1e-4 || dt > 0.4) {
    smoothYaw *= 0.4;
    smoothPitch *= 0.4;
    return { yaw: smoothYaw, pitch: smoothPitch };
  }
  let dy = eye.yaw - prev.yaw;
  dy = ((((dy + 180) % 360) + 360) % 360) - 180;
  const k = clamp01(dt * 14);
  smoothYaw += (dy / dt - smoothYaw) * k;
  smoothPitch += ((eye.pitch - prev.pitch) / dt - smoothPitch) * k;
  return { yaw: smoothYaw, pitch: smoothPitch };
}

/** 逐行扫完一帧要多久。比 16.7ms 的帧长短一点，是个便宜 CMOS 的样子 */
const ROLLING = 0.011;

/** 云台停住的时候剩下的那一点抖。舱体自己在震，但幅度必须压在亚像素 */
const HUM_PX = 0.3;

/**
 * 果冻效应。
 *
 * CMOS 是逐行曝光的：猛拧云台的时候，画面下半部分比上半部分晚看到世界十毫秒，
 * 于是整幅画被剪开。振幅严格跟角速度成正比 —— 云台停住时它就是零，这一点是刻意
 * 的，因为玩家读方位读距离的时候画面必须是稳的，不然全息屏那条一致性就成了空话。
 */
function jellyShear(
  h: number,
  focal: number,
  time: number,
  corruption: number,
  rot: Spin,
): (y: number) => number {
  const perDeg = (focal * Math.PI) / 180;
  const swing = clamp(rot.yaw * ROLLING * perDeg, -h * 0.3, h * 0.3);
  const hum = HUM_PX * (0.4 + clamp01(corruption) * 0.6);
  const rows = Math.max(1, h);
  return (y: number): number =>
    swing * (clamp(y / rows, -0.6, 1.6) - 0.5) +
    (valueNoise2(y * 0.012, time * 1.7, 13) - 0.5) * 2 * hum;
}

// ============================================================================
// 离屏与景深
// ============================================================================

interface Scene {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

/** 按 key + 尺寸缓存的离屏画布。每帧重建一张 1280x720 的画布要好几毫秒 */
const buffers = new Map<string, HTMLCanvasElement>();

function buffer(key: string, w: number, h: number, clear = true): Scene | null {
  if (typeof document === 'undefined') return null;
  const iw = Math.max(8, Math.round(w));
  const ih = Math.max(8, Math.round(h));
  let cv = buffers.get(key);
  if (!cv || cv.width !== iw || cv.height !== ih) {
    if (buffers.size > 12) buffers.clear();
    try {
      cv = makeCanvas(iw, ih)[0];
    } catch {
      return null;
    }
    buffers.set(key, cv);
  }
  const c = cv.getContext('2d');
  if (!c) return null;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  // 后面要被一层不透明的东西整张盖掉的话，清屏是白给 —— 720p 一次 clearRect 就是
  // 九十万像素的写入
  if (clear) c.clearRect(0, 0, iw, ih);
  return { cv, ctx: c };
}

/**
 * 各档的内部渲染分辨率。
 *
 * 这是一台泡在水里的监视摄像头，码率本来就不高 —— 内部降分辨率画再上采，画面会更
 * 像一路真的视频回路。便宜和好看在这里刚好同向，很少有这种事。
 *
 * 降档降的是这个数，而不是「要不要走离屏」。填充率是头号开销：一间房三十块面，
 * 每块都要铺底色、锈层、砂砾，全是整屏量级的写入 —— 分辨率打七折，这些全部打五折，
 * 代价只是最后多一刀上采。早先那版在最低档直接不走离屏，结果最低档比中档还慢，
 * 因为省下两刀 blit 的同时把所有几何又按全分辨率铺了一遍。
 */
const SCALE_MAX = 0.72;
/**
 * 再低就不是「码率不高的监视回路」而是「看不清」了。方位和遮挡是玩法要读的信息，
 * 到这个下限还是超预算，就只能让它掉帧 —— 不能为了帧率把画面糊到读不出货箱在哪。
 */
const SCALE_MIN = 0.42;

/**
 * 离屏场景。坐标系仍然是目标画布的像素 —— 用 `scale` 把整个缓冲缩掉，
 * 而不是让每个调用点自己乘系数，那样早晚会漏一处。
 */
function beginScene(w: number, h: number): Scene | null {
  const s = buffer('scene', w * scale, h * scale, false);
  if (!s) return null;
  s.ctx.scale(s.cv.width / w, s.cv.height / h);
  return s;
}

// ============================================================================
// 画质档位
// ============================================================================

/**
 * 自适应画质。
 *
 * 预算是每帧 8 毫秒。离屏 + 两档弥散圈在 720p 上是四次全屏级别的 blit，GPU 合成的
 * 浏览器里不算什么，纯 CPU 光栅（或者集显、或者玩家开了一堆别的东西）就会直接吃掉
 * 整个预算。所以不写死档位，而是自己量自己：连续超预算就降档，宽裕了再升回来。
 *
 * 降到 0 档就完全不走离屏，省掉「几何拷进离屏」和「模糊图上采回来」这两刀全屏 blit。
 * 画面会少掉景深，但方位、遮挡、打光一个都不少 —— 那些是玩法要读的，不能降。
 */
const BUDGET_MS = 8;

/**
 * 帧间隔的容忍上限。
 *
 * 为什么不能只看自己函数体的耗时：canvas2d 是惰性的 —— `drawImage` / `fill` 只是把
 * 命令记进队列，真正的光栅化发生在之后（浏览器合成时，或者下一次读像素时）。实测在
 * 软件光栅上，`drawRoomCamera` 自报 1.1ms，强制冲管线之后是 15ms。差了一个数量级。
 * 只信自报耗时的调速器会永远觉得自己很闲，然后一直挂在最高档上掉帧。
 *
 * 所以再看一个它骗不了的量：两次调用之间的墙上时间。调用方跑在 rAF 上，画得过来
 * 就是 16.7ms，画不过来就往上涨 —— 不管钱花在函数体里还是花在合成器里。
 */
const PERIOD_MS = 19.5;

/**
 * 帧间隔超标要算到自己头上，得先占到这一帧的这个比例。
 *
 * 帧间隔里装的是**整个应用**：舱内、HUD、声呐、站台叠层，还有浏览器自己的合成。
 * 这一路画面只是其中一块。实测这个页面光是停在标题画面空转，帧间隔中位就有 33ms ——
 * 上一版把这笔账全记在自己身上，于是调速器一路踩到地板，而且 `promote()` 要求
 * 帧间隔低于 17.5ms 才肯往回爬，在这种页面上永远不成立，画质就被永久钉死了。
 *
 * 判据改成：只有当这一路画面确实是这一帧的大头时，帧间隔才是我的账。一个只花
 * 3.5ms 的画面在一个每帧 80ms 的页面里降档，既救不了那一页，又只是白白把自己画糊。
 */
const BLAME_SHARE = 0.35;

/**
 * 热身帧数。
 *
 * 前几十帧要烘一房间的贴图、JIT 还没热，慢是必然的，但那是一次性的成本。上一版只
 * 排除了第一帧，结果剩下那几十帧照样把 tier 连降两次，`demoted[]` 于是被锁满，
 * 后面机器再闲也回不去。热身期内**照降不误**（真慢的机器要立刻降），但不计进
 * `demoted[]` —— 防抖的意图保留，把画质永久钉死的副作用去掉。
 */
const WARMUP = 40;

/** 这么多帧没降过档，就把降档计数松一格。当时降档的理由可能早就不成立了 */
const RETRY_FRAMES = 600;

/** 降档后静置多少帧。等 EMA 重新收敛，别在一次抖动上连降三级 */
const SETTLE_DOWN = 45;
/**
 * 升档后静置多少帧。比降档短：从地板爬回顶档要五步，静置太长就等于爬不回去 ——
 * 实测这条要求是「关灯的轻场景连续两百帧内回到顶档」，五步 x 20 帧刚好装得下
 */
const SETTLE_UP = 20;

let frameMs = 0;
/** 帧间隔的滑动均值。它包含了光栅化，所以它才是真的 */
let periodMs = 16.7;
let periodSeen = 0;
let lastCall = 0;
let tier = 2;
/** 内部渲染分辨率。降档的第二级阶梯：弥散圈砍完了还超预算就砍它 */
let scale = 0.72;
let settle = 0;
/** 每一档被降过几次。试两次还是超预算就别再往上爬了，否则画面会一直一卡一卡 */
const demoted = [0, 0, 0];
/** 调用过多少帧。热身期只看它 */
let seen = 0;
/** 连续多少帧没降过档 */
let calm = 0;
/** 这一帧烘了几张贴图。烘焙是摊销成本，不是这一帧的稳态成本 */
let baked = 0;
/** 诊断用：最近这一段里有多少帧在烘贴图 */
let bakeFrames = 0;

const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

function quality(): number {
  return tier;
}

/**
 * 诊断用：当前画质档（0 无景深 / 1 单档弥散 / 2 双档）和实测帧耗时的滑动均值。
 * 调试 HUD 想显示「这台机器跑在几档」就读它，性能回归也拿它当断言。
 */
export function roomCameraStats(): {
  tier: number;
  scale: number;
  frameMs: number;
  periodMs: number;
  /** 这一帧烘了几张整面贴图。稳态下应该是 0 */
  baked: number;
  /** 开机以来有多少帧在烘贴图。除以帧数就是重烘频率 */
  bakeFrames: number;
  /** 这一路画面占了帧间隔的多大比例。低于 `BLAME_SHARE` 时帧间隔不算它的账 */
  share: number;
} {
  return {
    tier,
    scale,
    frameMs,
    periodMs,
    baked,
    bakeFrames,
    share: periodMs > 0 ? frameMs / periodMs : 1,
  };
}

/**
 * 降档的阶梯：先砍弥散圈（只是少了景深），再砍内部分辨率（画面真的会软）。
 * 顺序不能反 —— 景深是锦上添花，分辨率是读不读得出东西。
 */
function demote(): boolean {
  if (tier > 0) {
    // 热身期的降档不上锁：那几十帧慢是因为在烘贴图，不是因为这台机器跑不动
    if (seen > WARMUP) demoted[tier]++;
    tier--;
    return true;
  }
  if (scale > SCALE_MIN + 1e-3) {
    scale = Math.max(SCALE_MIN, scale - 0.08);
    return true;
  }
  return false;
}

/**
 * 升档反着来：先把分辨率还回去，再考虑加景深。
 *
 * 步子比降档大一档（0.1 vs 0.08）：降档是止损，要稳；升档是止亏，要快。从地板
 * 爬回顶档一共五步，慢一点就赶不上「两百帧内回到顶档」那条验收
 */
function promote(): boolean {
  if (scale < SCALE_MAX - 1e-3) {
    scale = Math.min(SCALE_MAX, scale + 0.1);
    return true;
  }
  if (tier < 2 && demoted[tier + 1] < 2) {
    tier++;
    return true;
  }
  return false;
}

/** 记下这一帧开始的时刻，同时把上一帧的间隔收进滑动均值 */
function mark(): number {
  const t = now();
  const gap = t - lastCall;
  lastCall = t;
  // 区间外的间隔不要：太短是同一帧里画了两遍（两块屏），太长是切了标签页、
  // 断点停过、或者这一路画面根本没在连续播。
  //
  // 上限从 100ms 放宽到 400ms：实测一台降频二十倍的机器每帧 190ms，全部落在
  // 100ms 外，于是 `periodMs` 一直停在初值 16.7 —— 帧间隔这个信号偏偏在最该
  // 说话的时候是哑的。放宽之后它才敢说话，至于是不是自己的账，`BLAME_SHARE` 另管
  if (gap > 4 && gap < 400) {
    periodMs += (gap - periodMs) * 0.12;
    periodSeen++;
  }
  return t;
}

function charge(start: number): void {
  const ms = now() - start;
  seen++;
  // 烘了贴图的那一帧不进 EMA，也不做判断。烘焙是摊销成本：走进一间新房、或者
  // 走近一面墙换了档，会有那么几帧要现烘一整面的锈层，一帧几十毫秒。把它算进
  // 稳态成本，调速器就会在每次换场景时降档，而降下去之后那几帧已经过去了 ——
  // 上一版永久钉死在最低档，一半是这么来的
  if (baked > 0) {
    bakeFrames++;
    baked = 0;
    return;
  }
  // 首帧要烘纹理瓦片和离屏画布，不能拿它当依据
  frameMs = frameMs === 0 ? Math.min(ms, BUDGET_MS) : frameMs + (ms - frameMs) * 0.22;
  if (settle > 0) {
    settle--;
    return;
  }
  // 攒够样本才敢信帧间隔，而且只在自己确实是这一帧大头的时候才认账
  const mine = periodSeen > 20
    && periodMs > PERIOD_MS
    && frameMs > periodMs * BLAME_SHARE;
  if (frameMs > BUDGET_MS || mine) {
    if (demote()) {
      // 超得越多越不该慢慢试探：降频二十倍的机器要连降四五级，一级等 45 帧的话
      // 两百帧都走不到底，玩家看到的是「越来越糊」而不是「糊了一下然后稳住」
      settle = frameMs > BUDGET_MS * 2 ? 10 : SETTLE_DOWN;
      calm = 0;
    }
    return;
  }
  calm++;
  // 很久没降过档了，说明当时降档的理由已经不成立（多半只是加载时卡了一下）。
  // 松一格，让 `promote()` 能再试一次。防抖的意图保留，只是不再是永久的
  if (calm > RETRY_FRAMES) {
    for (let i = 0; i < demoted.length; i++) if (demoted[i] > 0) demoted[i]--;
    calm = 0;
  }
  if (frameMs < BUDGET_MS * 0.4 && !mine && promote()) settle = SETTLE_UP;
}

/** 对焦深度。带阻尼，而且刻意追不上 —— 这台摄像机的自动对焦是坏的 */
let focusM = 6;

/** 弥散圈两档的降采样倍数。1/10 上采回来就是一片彻底化开的光斑 */
const DOF_MILD = 4;
const DOF_HARD = 10;

/**
 * 景深合成。
 *
 * 做法是降采样离屏 + 掩膜：把整幅几何缩到 1/4，再缩到 1/10，两档弥散圈都在小图里
 * 叠完，最后**只做一次**全分辨率上采盖回清晰图。没有深度缓冲可用，所以掩膜是拿同
 * 一批多边形按画家序列重画一遍扁平色块得来的 —— 几十个纯色填充在 1/4 图上，比真
 * 高斯便宜两个数量级。
 *
 * 只上采一次是这里唯一重要的性能决定：全分辨率的滤波 blit 在 720p 上一次就是一
 * 两毫秒，两档各来一次直接吃掉整个预算。
 *
 * 对焦点取准星压着的那个东西，但用一阶阻尼去追，而且阻尼系数故意给小：镜头在水里
 * 泡了很久，对焦环是涩的。玩家拧过云台之后画面要糊一下才收清楚，那一下是这台
 * 机器还活着的证据。
 */
function composite(
  scene: Scene,
  w: number,
  h: number,
  drawn: readonly Painted[],
  time: number,
  light: number,
  level: number,
): void {
  // 最低档不做景深；灯全关的时候画面里也没有细节可糊，都省掉这几毫秒
  if (level < 1 || light < 0.04) return;

  const want = depthAt(drawn, w * 0.5, h * 0.5);
  const target = Number.isFinite(want) ? clamp(want, 0.4, 26) : 18;
  const step = lastPose ? clamp01(Math.abs(time - lastPose.time) * 2.6) : 1;
  focusM += (target - focusM) * step;
  if (!Number.isFinite(focusM)) focusM = target;

  const mild = buffer('dof', w / DOF_MILD, h / DOF_MILD, false);
  const mask = buffer('mask', w / DOF_MILD, h / DOF_MILD);
  const hard = buffer('dofx', w / DOF_HARD, h / DOF_HARD, false);
  if (!mild || !mask || !hard) return;
  const bw = mild.cv.width;
  const bh = mild.cv.height;
  const sx = bw / w;
  const sy = bh / h;

  mild.ctx.imageSmoothingEnabled = true;
  mild.ctx.drawImage(scene.cv, 0, 0, scene.cv.width, scene.cv.height, 0, 0, bw, bh);

  // 彻底脱焦的那一档：再缩一次，盖回 1/4 图上，掩膜是它自己的。
  // 这几刀都在小图上，便宜；降档的时候先砍它
  if (level > 1) {
    hard.ctx.imageSmoothingEnabled = true;
    hard.ctx.drawImage(mild.cv, 0, 0, bw, bh, 0, 0, hard.cv.width, hard.cv.height);
    paintMask(mask.ctx, bw, bh, drawn, sx, sy, focusM, 2.1, 7.5);
    hard.ctx.globalCompositeOperation = 'destination-in';
    hard.ctx.imageSmoothingEnabled = true;
    hard.ctx.drawImage(mask.cv, 0, 0, bw, bh, 0, 0, hard.cv.width, hard.cv.height);
    hard.ctx.globalCompositeOperation = 'source-over';
    mild.ctx.drawImage(hard.cv, 0, 0, hard.cv.width, hard.cv.height, 0, 0, bw, bh);
  }

  // 轻微脱焦的那一档：掩膜盖在 1/4 图上，然后盖回离屏自己身上 —— 不是盖回目标画布。
  // 在纯 CPU 光栅上，一次全分辨率的缩放 blit 就是两毫秒，所以整条链只许有一次，
  // 就是最后那一下。
  paintMask(mask.ctx, bw, bh, drawn, sx, sy, focusM, 0.5, 3.0);
  mild.ctx.globalCompositeOperation = 'destination-in';
  mild.ctx.drawImage(mask.cv, 0, 0);
  mild.ctx.globalCompositeOperation = 'source-over';

  scene.ctx.imageSmoothingEnabled = true;
  scene.ctx.drawImage(mild.cv, 0, 0, bw, bh, 0, 0, w, h);
}

function blit(ctx: CanvasRenderingContext2D, scene: Scene, w: number, h: number): void {
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(scene.cv, 0, 0, scene.cv.width, scene.cv.height, 0, 0, w, h);
}

/**
 * 按深度画一张模糊量掩膜。
 *
 * 每块面都「先挖掉再填」：多边形之间要的是覆盖，不是 alpha 叠加 —— 否则近处一块
 * 清晰的箱子会被它背后那面墙的模糊量污染，箱子边上就会糊出一圈。
 */
function paintMask(
  m: CanvasRenderingContext2D,
  mw: number,
  mh: number,
  drawn: readonly Painted[],
  sx: number,
  sy: number,
  focus: number,
  onset: number,
  span: number,
): void {
  m.setTransform(1, 0, 0, 1, 0, 0);
  m.globalCompositeOperation = 'source-over';
  m.globalAlpha = 1;
  m.clearRect(0, 0, mw, mh);
  m.fillStyle = '#000';
  for (const d of drawn) {
    if (d.poly.length < 3) continue;
    const blur = clamp01((Math.abs(d.depth - focus) / focus - onset * 0.22) / span) ** 0.8;
    m.beginPath();
    m.moveTo(d.poly[0].x * sx, d.poly[0].y * sy);
    for (let i = 1; i < d.poly.length; i++) m.lineTo(d.poly[i].x * sx, d.poly[i].y * sy);
    m.closePath();
    m.globalCompositeOperation = 'destination-out';
    m.globalAlpha = 1;
    m.fill();
    if (blur < 0.03) continue;
    m.globalCompositeOperation = 'source-over';
    m.globalAlpha = blur;
    m.fill();
  }
  m.globalAlpha = 1;
  m.globalCompositeOperation = 'source-over';
}

// ============================================================================
// 标记
// ============================================================================

const SEAL_COLOR: Readonly<Record<string, string>> = {
  ember: PALETTE.ember,
  bone: PALETTE.bone,
  blood: PALETTE.bloodHot,
  none: PALETTE.boneWhisper,
  警戒漆: PALETTE.ember,
  骨白编号: PALETTE.bone,
  锈血标记: PALETTE.bloodHot,
  没有漆: PALETTE.boneWhisper,
};

function sealColor(seal: string): string {
  return SEAL_COLOR[seal] ?? PALETTE.boneDim;
}

/**
 * 机械手瞄着的那一只。
 *
 * 封条和铭牌已经漆在箱子自己的米空间里（`paintPlate`），所以这里只剩机器的叠加
 * 层：选中框和读数。刻意画在景深合成之后 —— 那是监视回路自己画上去的东西，不该
 * 跟着镜头一起脱焦；箱子上的漆该，它就在离屏里跟着糊。
 */
function drawAimBrackets(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  geo: RoomGeometry,
  input: RoomCameraInput,
  b: EyeBasis,
  vp: Viewport,
  shearAt: (y: number) => number,
): void {
  const marks = input.marks;
  if (!marks || marks.length === 0) return;
  const min = Math.min(w, h);

  for (const m of marks) {
    if (!m.aimed) continue;
    const o = geo.obstacles.find((x) => x.id === m.obstacleId);
    if (!o) continue;
    const e = toEye(o.pos, b);
    if (e.z < NEAR_CLIP) continue;
    const y = vp.cy - (e.py / e.z) * vp.focal;
    const x = vp.cx + (e.px / e.z) * vp.focal + shearAt(y);
    if (x < -min || x > w + min || y < -min || y > h + min) continue;

    // 框要贴着箱子，而不是一个固定尺寸的方块
    const r = ((Math.max(o.size.x, o.size.y, o.size.z) * 0.5) / e.z) * vp.focal * 1.25;
    ctx.save();
    ctx.strokeStyle = rgba(PALETTE.bloodHot, 0.55 + Math.sin(fin(input.time, 0) * 5.2) * 0.2);
    ctx.lineWidth = Math.max(1.4, min * 0.0035);
    const arm = r * 0.42;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      ctx.beginPath();
      ctx.moveTo(x + dx * r, y + dy * r - dy * arm);
      ctx.lineTo(x + dx * r, y + dy * r);
      ctx.lineTo(x + dx * r - dx * arm, y + dy * r);
      ctx.stroke();
    }

    // 目标框仍围住箱体，操作读数则使用真正命中的箱面，避免报出两套距离。
    const read = bearingOf(m.aimPoint ?? o.pos, input.eye);
    const bits = [`${read.side}${Math.round(read.deg)}°`, `${m.aimPoint ? '箱面 ' : '中心 '}${read.dist.toFixed(1)}m`];
    if (m.passes !== undefined) bits.push(`翻过 ${m.passes}`);
    else if (m.searched !== undefined) bits.push(`${Math.round(clamp01(m.searched) * 100)}%`);
    const text = bits.join(' · ');
    const fs = clamp(min * 0.028, 8, 14);
    ctx.font = cjk(fs, 500);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    const px = x - r;
    const py = y - r - fs * 1.3;
    ctx.fillStyle = rgba(PALETTE.abyss, 0.68);
    roundRect(ctx, px - fs * 0.3, py - fs * 0.72, tw + fs * 0.6, fs * 1.44, fs * 0.22);
    ctx.fill();
    ctx.strokeStyle = rgba(m.seal ? sealColor(m.seal) : PALETTE.rustDim, 0.55);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = rgba(PALETTE.bone, 0.9);
    ctx.fillText(text, px, py);
    ctx.restore();
  }
}

// ============================================================================
// 摄像头自己的毛病
// ============================================================================

/** 镜头污渍。烘一次就够 —— 它焊在舱外，玻璃上那几块脏东西不会自己动 */
function ensureDirt(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = `${Math.round(w)}x${Math.round(h)}`;
  if (dirtLayer && dirtLayer.dataset.key === key) return dirtLayer;
  const [cv, c] = makeCanvas(Math.max(8, w * 0.25), Math.max(8, h * 0.25));
  cv.dataset.key = key;
  const dw = cv.width;
  const dh = cv.height;
  for (let i = 0; i < 16; i++) {
    const x = hash2(i, 601) * dw;
    const y = hash2(i, 701) * dh;
    const r = dh * (0.03 + hash2(i, 801) * 0.13);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(216,210,196,${(0.05 + hash2(i, 901) * 0.08).toFixed(3)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  }
  // 一道刮痕
  c.strokeStyle = 'rgba(216,210,196,0.07)';
  c.lineWidth = Math.max(1, dh * 0.008);
  c.beginPath();
  c.moveTo(dw * 0.12, dh * 0.82);
  c.quadraticCurveTo(dw * 0.45, dh * 0.6, dw * 0.78, dh * 0.7);
  c.stroke();
  dirtLayer = cv;
  return cv;
}

function drawLensDirt(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  light: number,
  time: number,
): void {
  const layer = ensureDirt(w, h);
  if (!layer) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // 污渍只有在有光可散射的时候才看得见，而且会随对焦呼吸
  ctx.globalAlpha = clamp01(0.12 + light * 0.5) * (0.85 + Math.sin(time * 0.6) * 0.15);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(layer, 0, 0, w, h);
  ctx.restore();
}

/**
 * 边缘暗角。
 *
 * 烘成一张图再 1:1 贴，不要每帧重算径向渐变 —— 全屏径向渐变是每像素一次开方，
 * 实测 0.92ms，而一刀 1:1 blit 是 0.45ms。亮度差异交给 globalAlpha 调，
 * 两档色标的比例差在暗角上看不出来。
 */
let vigLayer: HTMLCanvasElement | null = null;
let vigKey = '';

/** 烘的那张图按最暗的情形（light = 1）烘，这样 globalAlpha 永远 <= 1，不会被削顶 */
const VIG_PEAK = 0.76;

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number, light: number): void {
  const key = `${Math.round(w)}x${Math.round(h)}`;
  if (!vigLayer || vigKey !== key) {
    if (typeof document === 'undefined') return;
    try {
      const [cv, c] = makeCanvas(Math.max(8, Math.round(w)), Math.max(8, Math.round(h)));
      const g = c.createRadialGradient(
        w * 0.5, h * 0.5, Math.min(w, h) * 0.28,
        w * 0.5, h * 0.5, Math.hypot(w, h) * 0.58,
      );
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.62, `rgba(0,0,0,${(0.3 / VIG_PEAK).toFixed(3)})`);
      g.addColorStop(1, '#000');
      c.fillStyle = g;
      c.fillRect(0, 0, w, h);
      vigLayer = cv;
      vigKey = key;
    } catch {
      return;
    }
  }
  ctx.save();
  ctx.globalAlpha = clamp01((0.62 + light * 0.14) / VIG_PEAK);
  ctx.drawImage(vigLayer, 0, 0, w, h);
  ctx.restore();
}

/**
 * 监视回路本身的噪点。
 *
 * 灯关着的时候，这是画面上唯一还在动的东西 —— 屏没坏，只是外面真的没有光。
 */
function drawMonitorCircuit(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  light: number,
  corruption: number,
  rot: Spin,
): void {
  const dark = 1 - light;
  const n = Math.round(26 + dark * 54 + corruption * 40);
  ctx.save();
  ctx.globalAlpha = 0.05 + dark * 0.1 + corruption * 0.07;
  const frame = Math.floor(time * 20);
  for (let i = 0; i < n; i++) {
    const x = hash2(i, frame) * w;
    const y = hash2(i + 7, frame + 2) * h;
    ctx.fillStyle = hash2(i, 3) > 0.5 ? 'rgba(226,214,190,0.9)' : 'rgba(0,0,0,0.95)';
    ctx.fillRect(x, y, 1 + hash2(i, 9) * 2, 1 + hash2(i, 11) * 2);
  }
  // 行同步丢一拍：一条横向撕裂。污染越高越常见，猛拧云台的时候几乎必然发生 ——
  // 编码器跟不上，码率一冲就丢帧
  const rush = clamp01((Math.hypot(rot.yaw, rot.pitch) - 40) / 260);
  if (valueNoise2(time * 2.3, 0, 77) > 0.86 - corruption * 0.2 - rush * 0.5) {
    const ty = ((time * 137) % 1) * h;
    const band = Math.max(1, h * (0.004 + rush * 0.05));
    ctx.globalAlpha = 0.12 + corruption * 0.2 + rush * 0.22;
    ctx.fillStyle = 'rgba(226,214,190,0.5)';
    ctx.fillRect(0, ty, w, band);
    if (rush > 0.25) {
      // 撕裂下面那一段整体横移。这是压缩块跟不上的样子
      ctx.globalAlpha = 0.3 + rush * 0.4;
      ctx.fillStyle = `rgba(0,0,0,${(0.2 + rush * 0.3).toFixed(2)})`;
      ctx.fillRect(0, ty + band, w * rush * 0.4, band * 1.6);
    }
  }
  ctx.restore();
}

// ============================================================================
// 小工具
// ============================================================================

function polyArea(poly: readonly Pt2[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += poly[j].x * poly[i].y - poly[i].x * poly[j].y;
  }
  return Math.abs(a) * 0.5;
}

function bbox(poly: readonly Pt2[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of poly) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function hashId(id: string): number {
  let a = 2166136261;
  for (let i = 0; i < id.length; i++) {
    a ^= id.charCodeAt(i);
    a = Math.imul(a, 16777619);
  }
  return (a >>> 8) % 4096;
}

export interface Bearing {
  side: '左' | '右';
  /** 需要拧的云台水平角（度，绝对值）。side 给方向 */
  deg: number;
  /** 需要压的俯仰（度，正 = 往下） */
  tiltDeg: number;
  dist: number;
}

/**
 * 「把云台拧到这里，这个东西就在准星上」的读数。全息屏和实景共用一份。
 *
 * 刻意按罗经约定算（heading 0 = +Y，+X 是 90°，和 `bearingTo` / `faceBearing`
 * 一致），**不**去点乘 `EyeBasis.right`：玩家读到的角度要能直接对应
 * `run.panCamera()` 的正负，那个正负是罗经的，不是某个基向量的。
 */
export function bearingOf(pos: Vec3, eye: Eye): Bearing {
  const dx = pos.x - eye.pos.x;
  const dy = pos.y - eye.pos.y;
  const dz = pos.z - eye.pos.z;
  const horiz = Math.hypot(dx, dy);
  let pan = (Math.atan2(dx, dy) * 180) / Math.PI - eye.yaw;
  pan = ((((pan + 180) % 360) + 360) % 360) - 180;
  const aim = horiz < 1e-4 ? (dz >= 0 ? 90 : -90) : (Math.atan2(dz, horiz) * 180) / Math.PI;
  return {
    side: pan >= 0 ? '右' : '左',
    deg: Math.abs(pan),
    tiltDeg: aim - eye.pitch,
    dist: Math.hypot(dx, dy, dz),
  };
}
