/**
 * 《铁肺迷城》后处理管线 — WebGL2 多通道
 * ============================================================================
 * 输入两张 Canvas2D 纹理：
 *   uScene  主场景（声呐屏 + 舱内剖面）
 *   uHud    面罩内壁投影（HUD 与面板）—— 单独进来是为了让它吃到「玻璃曲率」
 *           而不是跟场景一起被桶形畸变，两层曲率不同才像真的头盔。
 *
 * 通道顺序严格按 GDD §8.1 展开，并在此基础上补齐水下焦散 / SAN 扭曲 /
 * 静电 / 呼吸起伏 / 色调分级。完整清单见 POST_CHANNELS（docs/art-bible.md 同步）。
 *
 * 性能策略：UV 域的几个通道（畸变 / 呼吸 / 扭曲 / 折射 / 色差）在同一个
 * fragment 里完成 —— 它们本质都是对采样坐标做变换，拆开成多个 FBO 只会
 * 多付带宽而不会更正确。泛光是真的多级降采样 + 上采样，不是一发高斯。
 */

import type { PostParams, RenderFrame } from '../core/contract';
import { clamp, clamp01 } from '../core/util';
import { ABYSS_RGB, BONE_RGB, RUST_RGB } from './palette';

// ============================================================================
// 通道清单 —— 评审与美术圣经共用这份数据
// ============================================================================

export interface PostChannel {
  /** 执行顺序 */
  order: number;
  id: string;
  /** 中文名（GDD 用词） */
  cn: string;
  /** 由哪个 shader program 执行 */
  pass: string;
  /** 驱动它的 PostParams 字段 */
  driver: keyof PostParams | 'extras';
  note: string;
}

export const POST_CHANNELS: readonly PostChannel[] = [
  { order: 1, id: 'barrel', cn: '桶形畸变', pass: 'warp', driver: 'barrel', note: '径向 r²/r⁴ 双项，边缘压缩模拟球面舷窗玻璃' },
  { order: 2, id: 'breathe', cn: '呼吸起伏', pass: 'warp+grade', driver: 'breathe', note: '±0.6% 缩放 + 竖向微位移 + 亮度呼吸，吸呼不对称' },
  { order: 3, id: 'warp', cn: 'SAN 几何扭曲', pass: 'warp', driver: 'warp', note: 'fbm 域扭曲 + 同心膜波，低 SAN 时画面会「喘」' },
  { order: 4, id: 'caustic-refract', cn: '焦散折射', pass: 'warp', driver: 'caustics', note: '用焦散场梯度扰动采样坐标，隔水看东西的感觉' },
  { order: 5, id: 'aberration', cn: '色差', pass: 'warp', driver: 'aberration', note: '径向 RGB 三次采样，中心零、边缘最大' },
  { order: 6, id: 'bright-pass', cn: '亮度提取', pass: 'bright', driver: 'bloom', note: '软拐点阈值 + Karis 均值抑制萤火虫' },
  { order: 7, id: 'bloom-chain', cn: '多级泛光', pass: 'down/up', driver: 'bloom', note: '5 级 13-tap 降采样 + 9-tap 帐篷上采样，能量守恒' },
  { order: 8, id: 'caustic-light', cn: '焦散光斑', pass: 'grade', driver: 'caustics', note: '4 次迭代焦散场加性叠加，只染铁锈橙' },
  { order: 9, id: 'grade', cn: '色调分级', pass: 'grade', driver: 'tint', note: 'ACES 色调映射 + 阴影压深渊蓝 / 中调压铁锈 / 高光提骨白' },
  { order: 10, id: 'exposure', cn: '曝光', pass: 'grade', driver: 'exposure', note: '心跳与应急灯会把它推一下' },
  { order: 11, id: 'grain', cn: '胶片颗粒', pass: 'film', driver: 'grain', note: '按亮度加权，暗部颗粒更粗 —— 真胶片就是这样' },
  { order: 12, id: 'static', cn: '静电噪声', pass: 'film', driver: 'static', note: '横向掉线带 + 滚动同步条 + 宽频雪花' },
  { order: 13, id: 'scanline', cn: '扫描线', pass: 'film', driver: 'scanline', note: '行间隙 + 孔径栅格 + 缓慢滚动的回扫亮带' },
  { order: 14, id: 'vignette', cn: '晕影', pass: 'visor', driver: 'vignette', note: '椭圆晕影，非圆形，配合 16:9 构图' },
  { order: 15, id: 'tunnel', cn: 'CO₂ 隧道视野', pass: 'visor', driver: 'tunnel', note: '边缘收缩 + 去饱和 + 脉动，跟着心跳一起夹' },
  { order: 16, id: 'visor', cn: '面罩玻璃', pass: 'visor', driver: 'extras', note: 'HUD 二次曲率 + 划痕 + 反光扫掠 + 呼气起雾' },
  { order: 17, id: 'dither', cn: '有序抖动', pass: 'visor', driver: 'extras', note: '8×8 Bayer，消除深渊蓝黑里的色带' },
];

export const POST_CHANNEL_COUNT = POST_CHANNELS.length;

// ============================================================================
// 额外驱动量 —— 不在 contract 的 PostParams 里，但表现层需要
// ============================================================================

export interface PostExtras {
  /** -1(吸气末) .. +1(呼气末)，由 AudioEngine / 生理模块共享同一个相位 */
  breathPhase: number;
  /** 0..1 心跳冲击，收缩期为 1 */
  heartPulse: number;
  /** 屏息强度 0..1 —— 画面会变「闷」 */
  holdBreath: number;
  /** 面罩起雾 0..1 */
  fog: number;
  /** Veracity 污染度 0..1，驱动 HUD 撕裂与假扫描 */
  corruption: number;
  /** HUD 层整体增益（淡入淡出用） */
  hudGain: number;
  /** 应急灯瞬时亮度 0..1，用于曝光联动 */
  emergency: number;
}

export const DEFAULT_EXTRAS: PostExtras = {
  breathPhase: 0,
  heartPulse: 0,
  holdBreath: 0,
  fog: 0,
  corruption: 0,
  hudGain: 1,
  emergency: 0,
};

export const DEFAULT_POST: PostParams = {
  vignette: 0.58,
  aberration: 0.22,
  grain: 0.26,
  scanline: 0.24,
  barrel: 0.18,
  breathe: 0.7,
  warp: 0.0,
  bloom: 0.60,
  caustics: 0.25,
  exposure: 1.0,
  tint: [1, 1, 1],
  static: 0.04,
  tunnel: 0.0,
};

// ============================================================================
// GLSL
// ============================================================================

const VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  float x = float((gl_VertexID & 1) << 2);
  float y = float((gl_VertexID & 2) << 1);
  vUv = vec2(x, y) * 0.5;
  gl_Position = vec4(x - 1.0, y - 1.0, 0.0, 1.0);
}`;

/** 共享噪声库。全部确定性，禁止依赖 GPU 端的随机。 */
const NOISE = `
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
/* 经典水下焦散场：四次折返迭代，比单纯 sin 叠加有更硬的脉络 */
float caustic(vec2 p, float t){
  vec2 i = p;
  float c = 1.0;
  const float inten = 0.0045;
  for (int n = 0; n < 4; n++){
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

/** 通道 1–5：全部 UV 域操作，一次采样解决 */
const FRAG_WARP = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform vec2  uRes;
uniform float uTime;
uniform float uBarrel;
uniform float uBreathe;
uniform float uBreathPhase;
uniform float uWarp;
uniform float uCaustics;
uniform float uAberration;
uniform float uStatic;
uniform float uCorruption;
uniform float uHeart;
${NOISE}

vec2 barrelUv(vec2 uv, float k){
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  return 0.5 + c * (1.0 + k * r2 + k * k * 0.72 * r2 * r2);
}

void main(){
  vec2 uv = vUv;

  // [2] 呼吸起伏：吸气收（画面微微逼近），呼气放。非对称 —— 吸气比呼气快。
  float bp = uBreathPhase;
  float asym = bp < 0.0 ? bp * 1.35 : bp * 0.85;
  float scale = 1.0 - uBreathe * 0.0060 * asym;
  uv = 0.5 + (uv - 0.5) * scale;
  uv.y += uBreathe * 0.0016 * asym;

  // 心跳踢一下画面，幅度极小但身体能察觉
  uv = 0.5 + (uv - 0.5) * (1.0 - uHeart * 0.0022);

  // [1] 桶形畸变
  uv = barrelUv(uv, uBarrel);

  // [3] SAN 几何扭曲：低频域扭曲 + 从中心向外爬的同心膜波
  if (uWarp > 0.001) {
    vec2 w = vec2(
      fbm(uv * 3.4 + vec2(uTime * 0.13, 0.0)),
      fbm(uv * 3.4 + vec2(11.7, -uTime * 0.11))
    ) - 0.5;
    uv += w * uWarp * 0.055;
    vec2 d = uv - 0.5;
    float rr = length(d);
    float ang = atan(d.y, d.x);
    uv += vec2(cos(ang), sin(ang)) * sin(rr * 26.0 - uTime * 1.6) * uWarp * 0.0042;
    // 高污染时画面会「分层」：行错位
    float tear = step(0.985 - uCorruption * 0.06, hash12(vec2(floor(uv.y * 90.0), floor(uTime * 7.0))));
    uv.x += tear * uCorruption * 0.02 * (hash12(vec2(floor(uv.y * 90.0), 3.0)) - 0.5);
  }

  // [4] 焦散折射：用焦散场的屏幕梯度推采样点
  if (uCaustics > 0.001) {
    vec2 cp = uv * vec2(uRes.x / uRes.y, 1.0) * 7.5;
    float e = 0.02;
    float c0 = caustic(cp, uTime * 0.45);
    float cx = caustic(cp + vec2(e, 0.0), uTime * 0.45);
    float cy = caustic(cp + vec2(0.0, e), uTime * 0.45);
    uv += vec2(cx - c0, cy - c0) * uCaustics * 0.055;
  }

  // 静电撕裂：整行水平抽搐
  float band = hash12(vec2(floor(uv.y * 140.0), floor(uTime * 12.0)));
  uv.x += step(0.968, band) * uStatic * 0.012 * (hash12(vec2(band, uTime)) - 0.5);

  // [5] 色差：径向三次采样，中心为零。
  // 上限约 4 px @1600 —— 再大就从「镜片」变成廉价的彩虹描边。
  vec2 d = uv - 0.5;
  float r2 = dot(d, d);
  float ab = uAberration * (0.0005 + 0.0038 * r2);
  vec2 dir = r2 > 1e-8 ? normalize(d) : vec2(0.0);
  vec3 col;
  col.r = texture(uScene, uv + dir * ab).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - dir * ab * 0.92).b;

  // 越界采样一律落到深渊黑，避免边缘拉伸出难看的条纹
  vec2 inside = step(vec2(0.0), uv) * step(uv, vec2(1.0));
  col *= inside.x * inside.y;

  fragColor = vec4(col, 1.0);
}`;

/** 通道 6：亮度提取 */
const FRAG_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
${NOISE}

vec3 prefilter(vec3 c){
  float br = max(c.r, max(c.g, c.b));
  float soft = br - uThreshold + uKnee;
  soft = clamp(soft, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  float w = max(soft, br - uThreshold) / max(br, 1e-5);
  return c * w;
}

void main(){
  // 4 点 Karis 加权平均：抑制单像素萤火虫在泛光里闪烁
  vec3 a = texture(uSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  vec3 b = texture(uSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  vec3 c = texture(uSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  vec3 d = texture(uSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  float wa = 1.0 / (1.0 + luma(a));
  float wb = 1.0 / (1.0 + luma(b));
  float wc = 1.0 / (1.0 + luma(c));
  float wd = 1.0 / (1.0 + luma(d));
  vec3 col = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
  fragColor = vec4(prefilter(col), 1.0);
}`;

/** 通道 7a：13-tap 降采样（Jimenez / COD 方案） */
const FRAG_DOWN = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;

void main(){
  vec2 t = uTexel;
  vec3 a = texture(uSrc, vUv + t * vec2(-2.0,  2.0)).rgb;
  vec3 b = texture(uSrc, vUv + t * vec2( 0.0,  2.0)).rgb;
  vec3 c = texture(uSrc, vUv + t * vec2( 2.0,  2.0)).rgb;
  vec3 d = texture(uSrc, vUv + t * vec2(-2.0,  0.0)).rgb;
  vec3 e = texture(uSrc, vUv).rgb;
  vec3 f = texture(uSrc, vUv + t * vec2( 2.0,  0.0)).rgb;
  vec3 g = texture(uSrc, vUv + t * vec2(-2.0, -2.0)).rgb;
  vec3 h = texture(uSrc, vUv + t * vec2( 0.0, -2.0)).rgb;
  vec3 i = texture(uSrc, vUv + t * vec2( 2.0, -2.0)).rgb;
  vec3 j = texture(uSrc, vUv + t * vec2(-1.0,  1.0)).rgb;
  vec3 k = texture(uSrc, vUv + t * vec2( 1.0,  1.0)).rgb;
  vec3 l = texture(uSrc, vUv + t * vec2(-1.0, -1.0)).rgb;
  vec3 m = texture(uSrc, vUv + t * vec2( 1.0, -1.0)).rgb;
  vec3 col = e * 0.125;
  col += (a + c + g + i) * 0.03125;
  col += (b + d + f + h) * 0.0625;
  col += (j + k + l + m) * 0.125;
  fragColor = vec4(col, 1.0);
}`;

/** 通道 7b：9-tap 帐篷上采样 + 加性回填 */
const FRAG_UP = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uWeight;

void main(){
  vec2 t = uTexel * uRadius;
  vec3 col = texture(uSrc, vUv).rgb * 4.0;
  col += texture(uSrc, vUv + vec2(-t.x,  0.0)).rgb * 2.0;
  col += texture(uSrc, vUv + vec2( t.x,  0.0)).rgb * 2.0;
  col += texture(uSrc, vUv + vec2( 0.0, -t.y)).rgb * 2.0;
  col += texture(uSrc, vUv + vec2( 0.0,  t.y)).rgb * 2.0;
  col += texture(uSrc, vUv + vec2(-t.x, -t.y)).rgb;
  col += texture(uSrc, vUv + vec2( t.x, -t.y)).rgb;
  col += texture(uSrc, vUv + vec2(-t.x,  t.y)).rgb;
  col += texture(uSrc, vUv + vec2( t.x,  t.y)).rgb;
  // 逐级衰减地回填：不加权的话 5 级叠起来能量是原来的 5 倍，
  // 整屏会糊成一片发光的雾（第一版就是这么翻车的）。
  fragColor = vec4(col / 16.0 * uWeight, 1.0);
}`;

/** 通道 8–10：泛光合成 / 焦散光斑 / 色调分级 / 曝光 */
const FRAG_GRADE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2  uRes;
uniform float uTime;
uniform float uBloom_;
uniform float uCaustics;
uniform float uExposure;
uniform vec3  uTint;
uniform float uBreathe;
uniform float uBreathPhase;
uniform float uHeart;
uniform float uHold;
uniform vec3  uAbyss;
uniform vec3  uRust;
uniform vec3  uBone;
${NOISE}

vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main(){
  vec3 col = texture(uScene, vUv).rgb;

  // [7] 泛光合成。
  // 只有真正的光源（声呐光点、应急灯、七段管）该发光；铁锈舱壁不该发光。
  // 所以亮度提取的阈值定得很高，这里的权重也压得很低。
  vec3 bloom = texture(uBloom, vUv).rgb;
  // 泛光轻微去饱和：纯色泛光会把整个画面染成单一色相
  bloom = mix(vec3(luma(bloom)), bloom, 0.78);
  col += bloom * uBloom_ * 0.30;

  // [8] 焦散光斑：只往铁锈橙方向加，绝不加白，且只落在暗部
  // （亮的地方再加光就是一层橙雾，不是水）
  if (uCaustics > 0.001) {
    vec2 cp = vUv * vec2(uRes.x / uRes.y, 1.0) * 6.0;
    float c1 = caustic(cp, uTime * 0.38);
    float c2 = caustic(cp * 1.9 + 4.3, uTime * 0.27);
    float cc = c1 * 0.72 + c2 * 0.38;
    // 上方更亮：光从水面下来（vUv.y = 1 是画面上缘）
    cc *= mix(0.30, 1.25, vUv.y);
    // 在已经很亮的像素上收手
    cc *= 1.0 - smoothstep(0.18, 0.62, luma(col));
    col += uRust * cc * uCaustics * 0.17;
  }

  // [10] 曝光：呼吸与心跳都在推它
  float breatheLum = 1.0 + uBreathe * 0.045 * uBreathPhase + uHeart * 0.035;
  col *= uExposure * breatheLum;

  // [9] 色调分级：三段染色，严格落在四色主调上。
  // 场景本身已经是铁锈色了 —— 中调只需极轻的推动，重手会糊成一坨橙泥。
  float l = luma(col);
  float sw = pow(1.0 - clamp(l * 2.4, 0.0, 1.0), 2.0);
  float mw = 4.0 * clamp(l, 0.0, 1.0) * (1.0 - clamp(l, 0.0, 1.0));
  float hw = pow(clamp(l, 0.0, 1.0), 1.8);
  vec3 shadowTone = normalize(uAbyss + 0.02) * 1.88;
  vec3 midTone    = mix(vec3(1.0), normalize(uRust) * 1.72, 0.55);
  vec3 highTone   = mix(vec3(1.0), normalize(uBone) * 1.74, 0.42);
  col *= mix(vec3(1.0), shadowTone, sw * 0.58);
  col *= mix(vec3(1.0), midTone,    mw * 0.12);
  col *= mix(vec3(1.0), highTone,   hw * 0.45);

  // 屏息：世界被闷住 —— 去饱和 + 压暗 + 轻微偏蓝
  if (uHold > 0.001) {
    float g = luma(col);
    col = mix(col, vec3(g) * vec3(0.82, 0.90, 1.08), uHold * 0.45);
    col *= mix(1.0, 0.82, uHold);
  }

  col = aces(col);

  // 显示域对比 S 曲线 + 黑位归零。
  // ACES 之后中间调容易发「奶」，这一步把深渊重新压回黑里，
  // 是整条链子里对「是否像 3A」影响最大的五行。
  col = clamp(col, 0.0, 1.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.42);
  col = max(vec3(0.0), col - 0.020) / 0.980;

  col *= uTint;

  // 抬一点最暗处，让深渊蓝黑不是纯黑 —— 纯黑在 OLED 上会「掉洞」
  col = max(col, uAbyss * 0.42);

  fragColor = vec4(col, 1.0);
}`;

/** 通道 11–13：胶片颗粒 / 静电 / 扫描线 */
const FRAG_FILM = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSrc;
uniform vec2  uRes;
uniform float uTime;
uniform float uGrain;
uniform float uStatic;
uniform float uScanline;
uniform float uCorruption;
${NOISE}

void main(){
  vec3 col = texture(uSrc, vUv).rgb;
  vec2 px = vUv * uRes;

  // [11] 胶片颗粒：暗部颗粒更粗更明显，这是胶片的真实行为
  if (uGrain > 0.001) {
    float t = floor(uTime * 24.0);            // 24fps 抖动，比逐帧更像胶片
    float n1 = hash12(px * 0.87 + vec2(t * 13.7, t * 7.3));
    float n2 = vnoise(px * 0.31 + vec2(t * 3.1, -t * 2.7));
    float g = (n1 - 0.5) * 0.75 + (n2 - 0.5) * 0.55;
    float l = luma(col);
    float weight = mix(1.25, 0.28, smoothstep(0.02, 0.50, l));
    col += g * uGrain * 0.052 * weight;
  }

  // [12] 静电：宽频雪花 + 横向掉线带 + 滚动同步条。
  // 掉线带是「信号变弱」，不是「画面变黑」—— 权重必须夹住，
  // 否则会出现几条贯穿全屏的黑杠，一眼假。
  if (uStatic > 0.001) {
    float snow = hash12(px + vec2(uTime * 91.3, uTime * 47.1));
    col += (snow - 0.5) * uStatic * 0.17;
    float bandY = floor(vUv.y * 150.0);
    float drop = step(0.992 - uCorruption * 0.006, hash12(vec2(bandY, floor(uTime * 9.0))));
    vec3 dead = mix(col, vec3(luma(col)) * vec3(0.78, 0.84, 1.02), 0.7) + vec3(0.02) * snow;
    col = mix(col, dead, clamp(drop * uStatic * 1.6, 0.0, 0.62));
    float roll = fract(vUv.y + uTime * 0.13);
    col += smoothstep(0.988, 1.0, roll) * uStatic * 0.09;
  }

  // [13] 扫描线：行间隙 + 孔径栅格 + 回扫亮带
  if (uScanline > 0.001) {
    float lines = 0.5 + 0.5 * sin(vUv.y * uRes.y * 3.14159265 - uTime * 2.0);
    col *= 1.0 - uScanline * 0.20 * lines;
    float aperture = 0.5 + 0.5 * sin(px.x * 2.09439510);   // 2π/3，RGB 三元组
    col *= 1.0 - uScanline * 0.05 * aperture;
    float retrace = fract(vUv.y * 0.5 - uTime * 0.11);
    col += smoothstep(0.976, 0.999, retrace) * uScanline * 0.030;
  }

  fragColor = vec4(col, 1.0);
}`;

/** 通道 14–17：晕影 / CO₂ 隧道 / 面罩玻璃 + HUD 合成 / 抖动 */
const FRAG_VISOR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uSrc;
uniform sampler2D uHud;
uniform vec2  uRes;
uniform float uTime;
uniform float uVignette;
uniform float uTunnel;
uniform float uBarrel;
uniform float uFog;
uniform float uHudGain;
uniform float uCorruption;
uniform float uHeart;
uniform float uBreathPhase;
uniform float uAberration;
uniform vec3  uAbyss;
uniform vec3  uBone;
${NOISE}

vec2 barrelUv(vec2 uv, float k){
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  return 0.5 + c * (1.0 + k * r2 + k * k * 0.72 * r2 * r2);
}

/* 8x8 Bayer 有序抖动矩阵，展开成解析式避免大数组 */
float bayer8(vec2 p){
  vec2 q = floor(mod(p, 8.0));
  float x = q.x, y = q.y;
  float v = 0.0;
  v += mod(floor(x / 4.0) + floor(y / 4.0) * 2.0, 4.0) * 16.0;
  v += mod(floor(x / 2.0) + floor(y / 2.0) * 2.0, 4.0) * 4.0;
  v += mod(x + y * 2.0, 4.0);
  return v / 64.0;
}

void main(){
  vec3 col = texture(uSrc, vUv).rgb;
  vec2 px = vUv * uRes;
  vec2 d = vUv - 0.5;
  float r = length(d * vec2(1.06, 1.0));

  // [16] HUD：面罩内壁投影 —— 比场景更强的曲率，且自己带一点色差
  float hudK = uBarrel * 2.1 + 0.12;
  vec2 huv = barrelUv(vUv, hudK);
  // 呼吸时面罩会相对眼睛微动
  huv += vec2(0.0, uBreathPhase * 0.0012);
  vec2 hdir = r > 1e-6 ? normalize(d) : vec2(0.0);
  float hab = (uAberration * 0.6 + 0.25) * (0.0006 + 0.0042 * dot(d, d));
  vec4 hud = vec4(0.0);
  vec2 hin = step(vec2(0.0), huv) * step(huv, vec2(1.0));
  if (hin.x * hin.y > 0.5) {
    hud.r = texture(uHud, huv + hdir * hab).r;
    vec4 hg = texture(uHud, huv);
    hud.g = hg.g;
    hud.a = hg.a;
    hud.b = texture(uHud, huv - hdir * hab).b;
  }
  // 投影在玻璃上：能量守恒的屏幕混合，而不是生硬的 over
  float hudA = hud.a * uHudGain;
  vec3 hudRgb = hud.rgb;
  // 低理智：HUD 自己在抖，且会漏出一层重影
  if (uCorruption > 0.02) {
    vec2 ghost = huv + vec2(uCorruption * 0.004 * sin(uTime * 3.1), uCorruption * 0.003);
    vec4 gh = texture(uHud, ghost);
    hudRgb = mix(hudRgb, max(hudRgb, gh.rgb * 0.7), uCorruption);
    hudA = max(hudA, gh.a * uCorruption * 0.35 * uHudGain);
  }
  // HUD 压暗它身下的画面再叠上去 —— 投影是「挡在眼前」的，
  // 不压的话字会被后面的铁锈吃掉，只剩一层橙雾。
  col = col * (1.0 - hudA * 0.80) + hudRgb * hudA;
  // 投影的辉光洒回玻璃
  col += hudRgb * hudA * 0.08;

  // 玻璃划痕：各向异性细线，被一道移动的高光点亮。
  // 只在高光扫过时才明显 —— 常亮的划痕会变成一张廉价的「脏镜头」贴图。
  float sc = vnoise(vec2(px.x * 0.12 + px.y * 0.9, px.y * 0.035));
  float sc2 = vnoise(vec2(px.x * 0.031, px.y * 0.14 - px.x * 0.6));
  float scratch = pow(max(sc, sc2), 12.0);
  float sheenPos = fract(uTime * 0.043);
  float sheen = exp(-pow((vUv.x - (sheenPos * 1.6 - 0.3) - vUv.y * 0.25) * 4.2, 2.0));
  col += uBone * scratch * (0.012 + sheen * 0.42) * 0.42;

  // 玻璃整体反光：一道很淡的斜向梯度，让平面「有厚度」
  float gloss = smoothstep(0.75, 0.0, abs(vUv.x * 0.7 + vUv.y - 0.95 - sheenPos * 0.4));
  col += vec3(0.055, 0.065, 0.085) * gloss * 0.16;

  // [16] 起雾：呼气时从下缘与四角爬上来
  if (uFog > 0.001) {
    float fogMask = smoothstep(0.34, 0.0, vUv.y) * 0.8 + smoothstep(0.52, 1.0, r) * 0.9;
    float fogN = fbm(vUv * 5.5 + vec2(0.0, -uTime * 0.05));
    float f = clamp(fogMask * (0.55 + fogN * 0.75), 0.0, 1.0) * uFog;
    f *= 0.55 + 0.45 * max(0.0, uBreathPhase);
    vec3 fogCol = mix(uAbyss * 6.0, uBone * 0.30, 0.30);
    col = mix(col, fogCol, clamp(f * 0.40, 0.0, 0.62));
  }

  // [14] 晕影：椭圆，配 16:9。
  // 再叠一圈潜水面罩的硬边光圈 —— 这一圈黑是「构图」，
  // 它把视线锁进中间的声呐屏，也是画面有纵深的主要来源。
  float vig = smoothstep(1.06, 0.30, r);
  col *= mix(1.0, vig, uVignette * 0.95);
  float rim = smoothstep(0.40, 0.62, r);
  col *= 1.0 - rim * 0.55 * uVignette;
  // 非对称：下缘压得比上缘狠。面罩的下沿离脸最近，而且控制台那一条
  // 大面积浅色金属会把视线从声呐屏上拖下去 —— 构图上必须把它按住。
  col *= 1.0 - smoothstep(0.34, 0.0, vUv.y) * 0.42 * uVignette;
  col *= 1.0 - smoothstep(0.80, 1.0, vUv.y) * 0.26 * uVignette;

  // [15] CO₂ 隧道视野：边缘硬收缩 + 去饱和 + 跟心跳一起夹。
  // 关键是「洞里」和「洞外」必须拉开差距 —— 只把边缘压暗会得到一张
  // 单纯很黑的图，玩家读不出是自己快窒息了。所以洞内还要反向提亮。
  if (uTunnel > 0.001) {
    // 隧道视野必须是屏幕空间里的**正圆**。用 uv 空间的半径会得到一个
    // 宽扁的椭圆，看上去只是「画面变暗了」，而不是「我的视野在合上」。
    float aspect = uRes.x / max(uRes.y, 1.0);
    float rt = length(d * vec2(aspect, 1.0));
    float squeeze = uTunnel * (0.86 + 0.14 * uHeart);
    float inner = mix(1.10, 0.15, squeeze);
    float outer = mix(1.60, 0.34, squeeze);
    float t = smoothstep(outer, inner, rt);
    float g = luma(col);
    col = mix(vec3(g) * vec3(0.70, 0.74, 0.92), col, mix(1.0, t, squeeze));
    // 洞外压到近乎全黑
    col *= mix(1.0, t * t * (0.94 + 0.06 * t), squeeze);
    // 洞内补偿：视野越窄，中心越被「盯住」
    col *= 1.0 + squeeze * 0.55 * smoothstep(outer, inner * 0.55, rt);
    // 洞沿的暗红脉动 —— 血在耳朵里。它跟心跳同相，是最强的窒息暗示。
    float ring = smoothstep(outer, inner, rt) * (1.0 - smoothstep(inner, inner * 0.55, rt));
    col += vec3(0.46, 0.05, 0.07) * ring * squeeze * (0.30 + 0.55 * uHeart);
  }

  // [17] 有序抖动
  col += (bayer8(px) - 0.5) * (1.0 / 255.0) * 1.6;

  fragColor = vec4(col, 1.0);
}`;

// ============================================================================
// WebGL 小工具
// ============================================================================

class Program {
  readonly prog: WebGLProgram;
  private readonly locs = new Map<string, WebGLUniformLocation | null>();

  constructor(private gl: WebGL2RenderingContext, vs: string, fs: string, readonly label: string) {
    const v = compile(gl, gl.VERTEX_SHADER, vs, `${label}.vert`);
    const f = compile(gl, gl.FRAGMENT_SHADER, fs, `${label}.frag`);
    const p = gl.createProgram();
    if (!p) throw new Error(`[post] createProgram failed for ${label}`);
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`[post] link ${label}: ${gl.getProgramInfoLog(p)}`);
    }
    gl.deleteShader(v);
    gl.deleteShader(f);
    this.prog = p;
  }

  use(): void {
    this.gl.useProgram(this.prog);
  }

  private loc(name: string): WebGLUniformLocation | null {
    if (!this.locs.has(name)) this.locs.set(name, this.gl.getUniformLocation(this.prog, name));
    return this.locs.get(name) ?? null;
  }

  f(name: string, v: number): this {
    const l = this.loc(name);
    if (l) this.gl.uniform1f(l, v);
    return this;
  }
  v2(name: string, x: number, y: number): this {
    const l = this.loc(name);
    if (l) this.gl.uniform2f(l, x, y);
    return this;
  }
  v3(name: string, x: number, y: number, z: number): this {
    const l = this.loc(name);
    if (l) this.gl.uniform3f(l, x, y, z);
    return this;
  }
  tex(name: string, unit: number, texture: WebGLTexture | null): this {
    const l = this.loc(name);
    if (l) {
      this.gl.activeTexture(this.gl.TEXTURE0 + unit);
      this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
      this.gl.uniform1i(l, unit);
    }
    return this;
  }

  dispose(): void {
    this.gl.deleteProgram(this.prog);
  }
}

function compile(gl: WebGL2RenderingContext, type: number, src: string, label: string): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new Error(`[post] createShader failed for ${label}`);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s) ?? '';
    const numbered = src
      .split('\n')
      .map((l, i) => `${(i + 1).toString().padStart(3, ' ')}| ${l}`)
      .join('\n');
    throw new Error(`[post] compile ${label}:\n${log}\n${numbered}`);
  }
  return s;
}

class Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;

  constructor(
    private gl: WebGL2RenderingContext,
    public w: number,
    public h: number,
    internalFormat: number,
    format: number,
    type: number,
  ) {
    const tex = gl.createTexture();
    const fb = gl.createFramebuffer();
    if (!tex || !fb) throw new Error('[post] failed to allocate render target');
    this.tex = tex;
    this.fb = fb;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  dispose(): void {
    this.gl.deleteTexture(this.tex);
    this.gl.deleteFramebuffer(this.fb);
  }
}

// ============================================================================
// 管线
// ============================================================================

const BLOOM_MIPS = 5;

export class PostPipeline {
  readonly gl: WebGL2RenderingContext;
  private vao: WebGLVertexArrayObject | null = null;

  private pWarp!: Program;
  private pBright!: Program;
  private pDown!: Program;
  private pUp!: Program;
  private pGrade!: Program;
  private pFilm!: Program;
  private pVisor!: Program;

  private texScene: WebGLTexture;
  private texHud: WebGLTexture;

  private tWarp: Target | null = null;
  private tGrade: Target | null = null;
  private tFilm: Target | null = null;
  private mips: Target[] = [];

  private w = 0;
  private h = 0;
  private lost = false;

  /** 上一帧统计，供 demo 的性能面板读取 */
  readonly stats = { drawCalls: 0, targets: 0, hdr: false };

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true, // 截图要用
    });
    if (!gl) throw new Error('[post] WebGL2 不可用 —— 本作的后处理管线要求 WebGL2');
    this.gl = gl;

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.buildPrograms();
      this.allocate(this.w, this.h, true);
    });

    // HDR 中间缓冲：泛光在 8bit 上会断层，能拿到半浮点就拿
    const halfFloat = gl.getExtension('EXT_color_buffer_half_float');
    const full = gl.getExtension('EXT_color_buffer_float');
    if (full || halfFloat) {
      this.internalFormat = gl.RGBA16F;
      this.type = gl.HALF_FLOAT;
      this.stats.hdr = true;
    } else {
      this.internalFormat = gl.RGBA8;
      this.type = gl.UNSIGNED_BYTE;
      this.stats.hdr = false;
    }
    gl.getExtension('OES_texture_float_linear');
    gl.getExtension('OES_texture_half_float_linear');

    this.texScene = this.makeSourceTexture();
    this.texHud = this.makeSourceTexture();

    this.vao = gl.createVertexArray();
    this.buildPrograms();

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  private internalFormat: number;
  private type: number;

  private makeSourceTexture(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture();
    if (!t) throw new Error('[post] createTexture failed');
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private buildPrograms(): void {
    const gl = this.gl;
    this.pWarp = new Program(gl, VERT, FRAG_WARP, 'warp');
    this.pBright = new Program(gl, VERT, FRAG_BRIGHT, 'bright');
    this.pDown = new Program(gl, VERT, FRAG_DOWN, 'down');
    this.pUp = new Program(gl, VERT, FRAG_UP, 'up');
    this.pGrade = new Program(gl, VERT, FRAG_GRADE, 'grade');
    this.pFilm = new Program(gl, VERT, FRAG_FILM, 'film');
    this.pVisor = new Program(gl, VERT, FRAG_VISOR, 'visor');
  }

  resize(w: number, h: number): void {
    const iw = Math.max(2, Math.round(w));
    const ih = Math.max(2, Math.round(h));
    if (iw === this.w && ih === this.h) return;
    this.allocate(iw, ih, false);
  }

  private allocate(w: number, h: number, force: boolean): void {
    if (!force && w === this.w && h === this.h) return;
    const gl = this.gl;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;

    this.tWarp?.dispose();
    this.tGrade?.dispose();
    this.tFilm?.dispose();
    for (const m of this.mips) m.dispose();
    this.mips = [];

    const fmt = gl.RGBA;
    this.tWarp = new Target(gl, w, h, this.internalFormat, fmt, this.type);
    this.tGrade = new Target(gl, w, h, this.internalFormat, fmt, this.type);
    this.tFilm = new Target(gl, w, h, this.internalFormat, fmt, this.type);

    let mw = w;
    let mh = h;
    for (let i = 0; i < BLOOM_MIPS; i++) {
      mw = Math.max(2, mw >> 1);
      mh = Math.max(2, mh >> 1);
      this.mips.push(new Target(gl, mw, mh, this.internalFormat, fmt, this.type));
    }
    this.stats.targets = 3 + this.mips.length;
  }

  private bind(t: Target | null): void {
    const gl = this.gl;
    if (t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.viewport(0, 0, t.w, t.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.w, this.h);
    }
  }

  private draw(): void {
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    this.stats.drawCalls++;
  }

  /** 把 Canvas2D 的内容传到 GPU。HUD 不脏就不重传，省带宽。 */
  upload(scene: TexImageSource, hud: TexImageSource | null): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texScene);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
    if (hud) {
      gl.bindTexture(gl.TEXTURE_2D, this.texHud);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hud);
    }
  }

  render(frame: RenderFrame, extras: PostExtras): void {
    if (this.lost || !this.tWarp || !this.tGrade || !this.tFilm) return;
    const gl = this.gl;
    const p = frame.post;
    this.stats.drawCalls = 0;
    gl.bindVertexArray(this.vao);

    const bp = clamp(extras.breathPhase, -1, 1);
    const heart = clamp01(extras.heartPulse);

    // ---- Pass A: 通道 1-5 ----------------------------------------------
    this.bind(this.tWarp);
    this.pWarp.use();
    this.pWarp
      .tex('uScene', 0, this.texScene)
      .v2('uRes', this.w, this.h)
      .f('uTime', frame.time)
      .f('uBarrel', p.barrel)
      .f('uBreathe', p.breathe)
      .f('uBreathPhase', bp)
      .f('uWarp', p.warp)
      .f('uCaustics', p.caustics)
      .f('uAberration', p.aberration)
      .f('uStatic', p.static)
      .f('uCorruption', extras.corruption)
      .f('uHeart', heart);
    this.draw();

    // ---- Pass B: 通道 6 亮度提取 ---------------------------------------
    const m0 = this.mips[0];
    this.bind(m0);
    this.pBright.use();
    this.pBright
      .tex('uSrc', 0, this.tWarp.tex)
      .v2('uTexel', 1 / this.w, 1 / this.h)
      .f('uThreshold', 0.80)
      .f('uKnee', 0.22);
    this.draw();

    // ---- Pass C: 通道 7a 降采样链 --------------------------------------
    for (let i = 1; i < this.mips.length; i++) {
      const src = this.mips[i - 1];
      const dst = this.mips[i];
      this.bind(dst);
      this.pDown.use();
      this.pDown.tex('uSrc', 0, src.tex).v2('uTexel', 1 / src.w, 1 / src.h);
      this.draw();
    }

    // ---- Pass D: 通道 7b 上采样回填 ------------------------------------
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = this.mips.length - 1; i > 0; i--) {
      const src = this.mips[i];
      const dst = this.mips[i - 1];
      this.bind(dst);
      this.pUp.use();
      this.pUp
        .tex('uSrc', 0, src.tex)
        .v2('uTexel', 1 / src.w, 1 / src.h)
        .f('uRadius', 1.15)
        .f('uWeight', 0.62);
      this.draw();
    }
    gl.disable(gl.BLEND);

    // ---- Pass E: 通道 8-10 ---------------------------------------------
    this.bind(this.tGrade);
    this.pGrade.use();
    this.pGrade
      .tex('uScene', 0, this.tWarp.tex)
      .tex('uBloom', 1, m0.tex)
      .v2('uRes', this.w, this.h)
      .f('uTime', frame.time)
      .f('uBloom_', p.bloom)
      .f('uCaustics', p.caustics)
      .f('uExposure', p.exposure * (1 + extras.emergency * 0.1))
      .v3('uTint', p.tint[0], p.tint[1], p.tint[2])
      .f('uBreathe', p.breathe)
      .f('uBreathPhase', bp)
      .f('uHeart', heart)
      .f('uHold', clamp01(extras.holdBreath))
      .v3('uAbyss', ABYSS_RGB[0], ABYSS_RGB[1], ABYSS_RGB[2])
      .v3('uRust', RUST_RGB[0], RUST_RGB[1], RUST_RGB[2])
      .v3('uBone', BONE_RGB[0], BONE_RGB[1], BONE_RGB[2]);
    this.draw();

    // ---- Pass F: 通道 11-13 --------------------------------------------
    this.bind(this.tFilm);
    this.pFilm.use();
    this.pFilm
      .tex('uSrc', 0, this.tGrade.tex)
      .v2('uRes', this.w, this.h)
      .f('uTime', frame.time)
      .f('uGrain', p.grain)
      .f('uStatic', p.static)
      .f('uScanline', p.scanline)
      .f('uCorruption', extras.corruption);
    this.draw();

    // ---- Pass G: 通道 14-17，直出屏幕 ----------------------------------
    this.bind(null);
    this.pVisor.use();
    this.pVisor
      .tex('uSrc', 0, this.tFilm.tex)
      .tex('uHud', 1, this.texHud)
      .v2('uRes', this.w, this.h)
      .f('uTime', frame.time)
      .f('uVignette', p.vignette)
      .f('uTunnel', p.tunnel)
      .f('uBarrel', p.barrel)
      .f('uFog', clamp01(extras.fog))
      .f('uHudGain', clamp01(extras.hudGain))
      .f('uCorruption', clamp01(extras.corruption))
      .f('uHeart', heart)
      .f('uBreathPhase', bp)
      .f('uAberration', p.aberration)
      .v3('uAbyss', ABYSS_RGB[0], ABYSS_RGB[1], ABYSS_RGB[2])
      .v3('uBone', BONE_RGB[0], BONE_RGB[1], BONE_RGB[2]);
    this.draw();

    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.tWarp?.dispose();
    this.tGrade?.dispose();
    this.tFilm?.dispose();
    for (const m of this.mips) m.dispose();
    this.gl.deleteTexture(this.texScene);
    this.gl.deleteTexture(this.texHud);
    this.gl.deleteVertexArray(this.vao);
    this.pWarp?.dispose();
    this.pBright?.dispose();
    this.pDown?.dispose();
    this.pUp?.dispose();
    this.pGrade?.dispose();
    this.pFilm?.dispose();
    this.pVisor?.dispose();
  }
}

// ============================================================================
// 由生理状态推导后处理参数 —— 主 Agent 接线时直接调这个
// ============================================================================

export interface PostDriveInput {
  san: number;
  sanMax: number;
  fear: number;
  co2: number;
  oxygen: number;
  oxygenMax: number;
  infection: number;
  trauma: number;
  depth: number;
  flooding: number;
  corruption: number;
  holdingBreath: boolean;
}

/**
 * 把 Vitals 映射到 PostParams。
 * 这条曲线是「玩家感觉」的总控，改这里等于改整个游戏的气质，慎动。
 */
export function derivePost(i: PostDriveInput, into?: PostParams): PostParams {
  const p: PostParams = into ?? { ...DEFAULT_POST, tint: [1, 1, 1] };
  const sanN = clamp01(i.san / Math.max(1, i.sanMax));      // 1 = 清明
  const madness = 1 - sanN;
  const fearN = clamp01(i.fear / 100);
  const co2N = clamp01(i.co2 / 100);
  const oxyLow = 1 - clamp01(i.oxygen / Math.max(1, i.oxygenMax));
  const infN = clamp01(i.infection / 100);
  const depthN = clamp01(i.depth / 2100);
  const flood = clamp01(i.flooding);
  const corr = clamp01(i.corruption);

  p.vignette = 0.52 + fearN * 0.24 + madness * 0.14 + oxyLow * 0.10;
  p.aberration = 0.16 + madness * 0.62 + fearN * 0.18 + corr * 0.30;
  p.grain = 0.22 + madness * 0.30 + oxyLow * 0.16;
  p.scanline = 0.22 + madness * 0.14;
  p.barrel = 0.15 + depthN * 0.10 + co2N * 0.06;
  p.breathe = 0.55 + fearN * 0.65 + co2N * 0.40;
  p.warp = madness * madness * 0.85 + infN * 0.25;
  p.bloom = 0.58 + madness * 0.34 + flood * 0.12;
  p.caustics = 0.12 + flood * 0.60 + depthN * 0.12;
  p.exposure = 1.0 - oxyLow * 0.14 + madness * 0.06;
  p.static = 0.015 + corr * 0.18 + infN * 0.06;
  // CO2 隧道视野在 55 以上才开始咬人，之后急速收紧
  p.tunnel = Math.pow(clamp01((co2N - 0.45) / 0.55), 1.6) * 0.95 + (i.holdingBreath ? 0.06 : 0);

  // 色调：深度把画面往深渊蓝推，感染把它往血红推
  const r = 1.0 - depthN * 0.10 + infN * 0.20;
  const g = 1.0 - depthN * 0.04 - infN * 0.10;
  const b = 1.0 + depthN * 0.12 - infN * 0.14;
  p.tint = [clamp(r, 0.6, 1.4), clamp(g, 0.6, 1.4), clamp(b, 0.6, 1.4)];
  return p;
}
