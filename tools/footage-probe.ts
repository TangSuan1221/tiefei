/**
 * 影片提示词与接口的离线探针。
 * ============================================================================
 * 两个用途：
 *
 *   npx tsx tools/footage-probe.ts
 *     把五段的提示词全部印出来，跑一遍调色板体检。**不联网，不花钱。**
 *     改了 route.ts 的 scene 或者 content/footage.ts 的模板之后先跑这个。
 *
 *   npx tsx tools/footage-probe.ts --generate 1
 *     真的去生成第 1 段的片子，写进 tmp/footage/。**一次 $0.345。**
 *     有 ffmpeg 的话顺手抽六帧出来，好在不开浏览器的情况下看画面对不对。
 *
 * 这个脚本刻意**不** import src/pod/net/video.ts —— 那个文件读
 * `import.meta.env`，只在 Vite 里成立。这里自己写一份最小客户端，
 * 同时也就是 docs/video-api-probe.md 那份探测记录的可执行版本。
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ROUTE } from '../src/pod/content/route.ts';
import { creature } from '../src/pod/content/creatures.ts';
import { assertFootagePaletteClean, buildFootagePrompt } from '../src/pod/content/footage.ts';
import { generateVolume } from '../src/pod/gen/volume.ts';
import { faunaOnTape } from '../src/pod/gen/spawn.ts';
import { remapFootagePixels } from '../src/pod/view/degrade.ts';
import { isHorrorGreen } from '../src/render/palette.ts';

const UPSTREAM = 'https://llm-proxy.forgeax.com/v1';
const OUT_DIR = join(process.cwd(), 'tmp', 'footage');

/**
 * 从 .env.local 里读 key。
 *
 * node 不会自己加载 .env.local（那是 Vite 的约定），所以这里手动解一遍。
 * 只认不带 VITE_ 前缀的 LITELLM_KEY —— 和 dev proxy 用的是同一个变量，
 * 免得出现「代理能跑但脚本不能跑」这种莫名其妙的状态差。
 */
function readKey(): string {
  const fromEnv = process.env.LITELLM_KEY;
  if (fromEnv) return fromEnv;
  const p = join(process.cwd(), '.env.local');
  if (!existsSync(p)) return '';
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = /^\s*LITELLM_KEY\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1]!.replace(/^["']|["']$/g, '');
  }
  return '';
}

/** 印出某一段的提示词。生物名单走关卡生成器，不读航线模板上那一只 */
function promptFor(legIndex: number): string {
  const gen = generateVolume(legIndex, 0x51ce, null, null, 82);
  const fauna = faunaOnTape(gen.volume);
  return buildFootagePrompt({
    leg: gen.leg,
    creature: fauna[0] ?? (gen.leg.threats[0] ? creature(gen.leg.threats[0].creature) : null),
    fauna,
    depth: gen.leg.depth,
    lamp: true,
    corruption: legIndex / Math.max(1, ROUTE.length - 1),
    san: 82,
    tells: gen.volume.echoes.map((e) => `${e.sonarLabel} resolving as ${e.truth}`),
  });
}

function listPrompts(): void {
  console.log('\n════════ 影片提示词 ════════');
  for (let i = 0; i < ROUTE.length; i++) {
    const leg = ROUTE[i]!;
    const p = promptFor(i);
    console.log(`\n── [${i}] ${leg.name}`);
    console.log(`   站点 ${leg.siteName}   深度 ${leg.depth}m   scene ${leg.scene ? '有' : '缺（回落到站点名）'}`);
    console.log(`   ${p.length} 字符 / 约 ${p.split(/\s+/).length} 词`);
    console.log(`   ${p}`);
  }

  // 提示词里出现「绿」是这个功能最容易悄悄走形的地方：模型给什么我们都收，
  // 所以约束必须在两处都有 —— 提示词里的否定从句，和 view/footage.ts 的
  // 逐像素调色表。这里查的是前者。
  console.log('\n──── 调色板体检 ────');
  const bad = assertFootagePaletteClean();
  if (bad.length) for (const b of bad) console.log(`  ✗ ${b}`);
  else console.log('  ✓ 四主色无恐怖游戏绿，提示词的正面描述里没有绿系词');

  let leaked = 0;
  for (let i = 0; i < ROUTE.length; i++) {
    const p = promptFor(i);
    const negIdx = p.indexOf('Absolutely no green');
    const positive = negIdx < 0 ? p : p.slice(0, negIdx);
    for (const w of ['green', 'teal', 'cyan', 'emerald']) {
      if (positive.toLowerCase().includes(w)) {
        console.log(`  ✗ [${i}] 正面描述里出现「${w}」`);
        leaked++;
      }
    }
  }
  if (!leaked) console.log(`  ✓ ${ROUTE.length} 段提示词的正面描述全部干净`);

  console.log('\n（要真的生成：--generate <段号>。一次 $0.345。）');
}

// ============================================================================
// 真的生成一段
// ============================================================================

interface Job {
  id: string;
  status: string;
  error?: { message?: string } | null;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function generate(legIndex: number): Promise<void> {
  const key = readKey();
  if (!key) {
    console.error('没有 key。在 .env.local 里写 LITELLM_KEY=sk-...（见 .env.example）');
    process.exit(1);
  }
  const leg = ROUTE[legIndex];
  if (!leg) {
    console.error(`段号越界。航线一共 ${ROUTE.length} 段（0..${ROUTE.length - 1}）`);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const prompt = promptFor(legIndex);
  const tag = `leg${legIndex}-${leg.id.replace(/[^a-z0-9]+/gi, '-')}`;
  writeFileSync(join(OUT_DIR, `${tag}.prompt.txt`), prompt, 'utf8');

  console.log(`\n生成 [${legIndex}] ${leg.name}`);
  console.log(`提示词 ${prompt.length} 字符，已写入 tmp/footage/${tag}.prompt.txt`);

  const auth = { authorization: `Bearer ${key}` };
  const t0 = Date.now();

  // ── 1. 提交。只拿到一个 job id，没有任何视频 URL ──────────────────────
  const submitRes = await fetch(`${UPSTREAM}/videos`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'minimax-h3-max', prompt, duration: 5, size: '480p' }),
  });
  const cost = submitRes.headers.get('x-litellm-response-cost');
  if (!submitRes.ok) {
    console.error(`提交失败 HTTP ${submitRes.status}: ${await submitRes.text()}`);
    process.exit(1);
  }
  let job = (await submitRes.json()) as Job;
  console.log(`  提交 ${((Date.now() - t0) / 1000).toFixed(1)}s  status=${job.status}  计费 $${cost ?? '?'}`);

  // ── 2. 轮询。不计费，所以打得勤一点没关系 ─────────────────────────────
  await sleep(6000);
  const deadline = Date.now() + 120_000;
  while (job.status !== 'completed') {
    if (Date.now() > deadline) {
      console.error('超时。上游还在转。');
      process.exit(1);
    }
    if (job.status === 'failed' || job.error) {
      console.error(`生成失败: ${job.error?.message ?? job.status}`);
      process.exit(1);
    }
    const r = await fetch(`${UPSTREAM}/videos/${encodeURIComponent(job.id)}`, { headers: auth });
    job = (await r.json()) as Job;
    console.log(`  轮询 ${((Date.now() - t0) / 1000).toFixed(1)}s  status=${job.status}`);
    if (job.status !== 'completed') await sleep(2500);
  }

  // ── 3. 取片。直接是 mp4 字节流 ─────────────────────────────────────────
  const contentRes = await fetch(`${UPSTREAM}/videos/${encodeURIComponent(job.id)}/content`, {
    headers: auth,
  });
  if (!contentRes.ok) {
    console.error(`取片失败 HTTP ${contentRes.status}`);
    process.exit(1);
  }
  const mp4 = join(OUT_DIR, `${tag}.mp4`);
  const bytes = Buffer.from(await contentRes.arrayBuffer());
  writeFileSync(mp4, bytes);
  console.log(
    `  取片 ${((Date.now() - t0) / 1000).toFixed(1)}s  ` +
      `${(bytes.length / 1048576).toFixed(2)} MB  type=${contentRes.headers.get('content-type')}`,
  );
  console.log(`\n写入 ${mp4}`);

  // ── 4. 抽帧 + 降质对照。有 ffmpeg 就做，没有就算了 ────────────────────
  try {
    execFileSync(
      'ffmpeg',
      ['-y', '-i', mp4, '-vf', `fps=1.2,scale=${OUT_W}:${OUT_H}`, join(OUT_DIR, `${tag}-raw%02d.png`)],
      { stdio: 'ignore' },
    );
    console.log(`原始抽帧 tmp/footage/${tag}-raw*.png`);
    degradeFrames(mp4, tag);
  } catch (e) {
    console.log(`（ffmpeg 不可用，跳过抽帧。mp4 本身已经存好了。）${String(e).slice(0, 80)}`);
  }
}

/** 对照图的尺寸。16:9，和上游出片的比例一致 */
const OUT_W = 416;
const OUT_H = 234;
/** 游戏里实际的取样宽度。见 view/footage.ts 的 BUF_MAX_W */
const BUF_W = 208;
const BUF_H = 117;

/**
 * 把片子过一遍游戏里那条降质管线，写出对照图。
 *
 * 这是**唯一**能在不开浏览器的情况下回答「四色约束到底管不管用」的办法，
 * 而这个问题必须能回答：实拍的第一段片子交回来的是一片青绿海水，
 * 提示词里那句 "no teal" 被完全无视了。
 *
 * 复刻的是 view/footage.ts 的前两步：先降到 208 宽（欠采样就是画风），
 * 再逐像素过四色表。磁带跑偏和丢帧那两步是逐帧随机的，静态图上看不出来，
 * 所以不复刻。零 npm 依赖 —— 用 ffmpeg 的 rawvideo 做进出，
 * node 这边只碰一块 RGBA 缓冲。
 */
function degradeFrames(mp4: string, tag: string): void {
  const rawPath = join(OUT_DIR, `${tag}.rgba`);
  execFileSync(
    'ffmpeg',
    ['-y', '-i', mp4, '-vf', `fps=1.2,scale=${BUF_W}:${BUF_H}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', rawPath],
    { stdio: 'ignore' },
  );

  const all = readFileSync(rawPath);
  const frameBytes = BUF_W * BUF_H * 4;
  const count = Math.floor(all.length / frameBytes);
  let greenBefore = 0;
  let greenAfter = 0;
  let total = 0;

  for (let i = 0; i < count; i++) {
    const slice = new Uint8ClampedArray(all.subarray(i * frameBytes, (i + 1) * frameBytes));
    // 变换前后各数一遍恐怖游戏绿。这一对数字是四色约束唯一的客观证据 ——
    // 「看起来对了」不算，GDD §8.1 是一条可以判定的规则。
    greenBefore += countHorrorGreen(slice);
    total += slice.length / 4;
    // 探照灯开着，所以 gain = 1（见 remapFootagePixels 的 gain 说明）
    remapFootagePixels(slice, 1);
    greenAfter += countHorrorGreen(slice);
    const binPath = join(OUT_DIR, `${tag}.frame.bin`);
    writeFileSync(binPath, Buffer.from(slice.buffer));
    execFileSync(
      'ffmpeg',
      [
        '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${BUF_W}x${BUF_H}`, '-i', binPath,
        // 放大回对照尺寸。游戏里也是这么放大的 —— 糊是有意的。
        '-vf', `scale=${OUT_W}:${OUT_H}:flags=bilinear`,
        join(OUT_DIR, `${tag}-degraded${String(i + 1).padStart(2, '0')}.png`),
      ],
      { stdio: 'ignore' },
    );
  }
  console.log(`降质对照 tmp/footage/${tag}-degraded*.png（${count} 帧）`);
  const pct = (n: number): string => `${((n / Math.max(1, total)) * 100).toFixed(2)}%`;
  console.log('\n──── 恐怖游戏绿审计（GDD §8.1）────');
  console.log(`  模型交回来的原片   ${greenBefore} / ${total} 像素  ${pct(greenBefore)}`);
  console.log(`  过完四色约束之后   ${greenAfter} / ${total} 像素  ${pct(greenAfter)}`);
  console.log(
    greenAfter === 0
      ? '  ✓ 一个绿像素都不剩'
      : `  ✗ 还有 ${greenAfter} 个绿像素漏过去了 —— 调色表有洞`,
  );
}

/** 一帧里有多少像素落在 isHorrorGreen 的禁区内 */
function countHorrorGreen(px: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    const hex =
      '#' +
      [px[i]!, px[i + 1]!, px[i + 2]!]
        .map((c) => c.toString(16).padStart(2, '0'))
        .join('');
    if (isHorrorGreen(hex)) n++;
  }
  return n;
}

// ============================================================================

const args = process.argv.slice(2);
const gi = args.indexOf('--generate');
const di = args.indexOf('--degrade');
if (gi >= 0) {
  await generate(Number(args[gi + 1] ?? 0));
} else if (di >= 0) {
  // 已经生成过的 mp4 重新过一遍降质管线。调 degrade.ts 的调色表时用这个，
  // 不用再花 $0.345 去生成一段一样的片子。
  const i = Number(args[di + 1] ?? 0);
  const leg = ROUTE[i]!;
  const tag = `leg${i}-${leg.id.replace(/[^a-z0-9]+/gi, '-')}`;
  const mp4 = join(OUT_DIR, `${tag}.mp4`);
  if (!existsSync(mp4)) {
    console.error(`没有 ${mp4}。先 --generate ${i}。`);
    process.exit(1);
  }
  execFileSync(
    'ffmpeg',
    ['-y', '-i', mp4, '-vf', `fps=1.2,scale=${OUT_W}:${OUT_H}`, join(OUT_DIR, `${tag}-raw%02d.png`)],
    { stdio: 'ignore' },
  );
  console.log(`原始抽帧 tmp/footage/${tag}-raw*.png`);
  degradeFrames(mp4, tag);
} else {
  listPrompts();
}
