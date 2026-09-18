/**
 * 站点全景的离线预览。
 * ============================================================================
 * 全景这种东西不看图是调不动的：几何对不对、灯够不够亮、门在不在该在的地方，
 * 全都只能用眼睛判。这个脚本把烘出来的等距柱状图和几个云台角度写成 PNG，
 * 顺带报一下烘焙耗时 —— 那是玩家到站时会卡的那一下。
 *
 *   npx tsx tools/pano-preview.ts
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { hexToRgb, PALETTE } from '../src/render/palette';
import { getPano, samplePanoWindow, type PanoView } from '../src/pod/view/pano';

const OUT = 'tmp/pano';

// --- 极简 PNG 编码器（RGB8，无滤波） -----------------------------------------

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function writePng(path: string, w: number, h: number, rgb: Uint8Array): void {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (1 + w * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]));
}

// --- 预览 -------------------------------------------------------------------

const EMBER = hexToRgb(PALETTE.ember);

/** 和采样器里同一套合成：RGB×探照灯 + 自发光×琥珀 */
function composite(px: Uint8ClampedArray, n: number, light: number): Uint8Array {
  const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const em = px[i * 4 + 3]! / 255;
    rgb[i * 3] = Math.min(255, px[i * 4]! * light + EMBER[0] * 255 * em);
    rgb[i * 3 + 1] = Math.min(255, px[i * 4 + 1]! * light + EMBER[1] * 255 * em);
    rgb[i * 3 + 2] = Math.min(255, px[i * 4 + 2]! * light + EMBER[2] * 255 * em);
  }
  return rgb;
}

function rgbaToRgb(px: Uint8ClampedArray, n: number): Uint8Array {
  const rgb = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    rgb[i * 3] = px[i * 4]!;
    rgb[i * 3 + 1] = px[i * 4 + 1]!;
    rgb[i * 3 + 2] = px[i * 4 + 2]!;
  }
  return rgb;
}

mkdirSync(OUT, { recursive: true });

const t0 = performance.now();
const pano = getPano('medbay');
const bakeMs = performance.now() - t0;

console.log(`烘焙  ${pano.w}×${pano.h}  ${bakeMs.toFixed(1)} ms`);

// 等距柱状原图，开灯和关灯各一张
writePng(`${OUT}/equirect-lit.png`, pano.w, pano.h, composite(pano.px, pano.w * pano.h, 1));
writePng(`${OUT}/equirect-dark.png`, pano.w, pano.h, composite(pano.px, pano.w * pano.h, 0));

// 几个云台角度。分辨率用游戏里那块屏的实际量级。
const BW = 200;
const BH = 132;
const buf = new Uint8ClampedArray(BW * BH * 4);

// 注意俯仰的符号：游戏里 ↑ 键给的是**负**的 camTilt，所以 tilt<0 才是抬头。
const SHOTS: { name: string; view: PanoView }[] = [
  { name: 'fwd-lamp', view: { pan: 0, tilt: 0, zoom: 1, light: 1, corruption: 0, time: 0 } },
  { name: 'fwd-dark', view: { pan: 0, tilt: 0, zoom: 1, light: 0, corruption: 0, time: 0 } },
  { name: 'up-deck', view: { pan: 0, tilt: -0.45, zoom: 1, light: 1, corruption: 0, time: 0 } },
  { name: 'down-strip', view: { pan: 0, tilt: 0.45, zoom: 1, light: 1, corruption: 0, time: 0 } },
  { name: 'right-bunks', view: { pan: 0.75, tilt: -0.12, zoom: 1, light: 1, corruption: 0, time: 0 } },
  { name: 'left-bunks', view: { pan: -0.75, tilt: -0.12, zoom: 1, light: 1, corruption: 0, time: 0 } },
  { name: 'back-hatch', view: { pan: Math.PI * 0.94, tilt: 0, zoom: 1, light: 1, corruption: 0, time: 0 } },
  { name: 'zoom-door', view: { pan: 0, tilt: 0.1, zoom: 2.6, light: 1, corruption: 0, time: 0 } },
  { name: 'corrupt', view: { pan: 0.3, tilt: 0, zoom: 1, light: 1, corruption: 1, time: 3.1 } },
];

for (const s of SHOTS) {
  samplePanoWindow(pano, s.view, BW, BH, buf);
  writePng(`${OUT}/win-${s.name}.png`, BW, BH, rgbaToRgb(buf, BW * BH));
}

// 预热之后再测。第一次调用带着 JIT 的账，报出来会吓人。
const warm = SHOTS[0]!.view;
for (let i = 0; i < 200; i++) samplePanoWindow(pano, warm, BW, BH, buf);
const t1 = performance.now();
const N = 600;
for (let i = 0; i < N; i++) {
  warm.pan = i * 0.01;
  samplePanoWindow(pano, warm, BW, BH, buf);
}
console.log(`采样  ${BW}×${BH}  ${((performance.now() - t1) / N).toFixed(3)} ms/帧`);
console.log(`输出  ${OUT}/`);
