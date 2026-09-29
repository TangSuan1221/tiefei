import '../game/boot.css';
import { PodRun, type FootageRequest } from '../pod/sim/run';
import { PodView } from '../pod/view/present';
import { PodSession } from '../pod/view/session';
import { WhiteboxSite } from './site';

// This module is loaded only by whitebox.html. It never restores or writes a
// campaign save and never installs the production video service.
const root = document.getElementById('ui-root')!;
root.innerHTML = `<section class="title-screen">
  <div><div class="title-mark">独立灰盒 · 原驾驶与摄影系统</div>
  <h1 class="title-cn">接驳港 · 救援演练</h1>
  <p class="title-tag"><span>观察、诱导、隔离，然后救援。</span>
  <span>曝光 5 秒，机载显影 12 秒；在分析台核验真实感光录像。</span>
  <span>本次从零开始，不读取或覆盖正式游戏存档。</span></p></div>
  <p class="title-tag">空格前进 · N 倒车 · J / L 转向 · Shift 刹车 · F 操作设施<br>2 摄影工位 · 5 分析台；靠近面板前先转正，离开时先倒退。</p>
  <nav class="menu"><button class="menu-item" id="whitebox-start" data-idx="01">
  <span>进入灰盒</span><span class="sub">仅本地录像 · 无网络生成</span></button></nav>
</section>`;

document.getElementById('whitebox-start')!.addEventListener('click', () => {
  root.replaceChildren();
  root.style.pointerEvents = 'none';
  const canvas = document.getElementById('post-canvas') as HTMLCanvasElement;
  canvas.style.opacity = '1';
  const run = new PodRun(0x57424954);
  run.gmLevelSession = true;
  const view = new PodView(run, canvas);
  run.createAuthoredSite = () => new WhiteboxSite(run);

  // Keep campaign fact bookkeeping, but do not replay the unrelated authored
  // campaign's dialogue or pretend its evidence has already been obtained.
  run.campaign.tick = () => null;
  const record = run.campaign.record.bind(run.campaign);
  run.campaign.record = (chapter, beat) => {
    const added = record(chapter, beat);
    if (added) {
      const entry = run.campaign.journal.at(-1)!;
      entry.text = {
        hook: '独立救援灰盒开始。', arrival: '已抵达灰盒入口。',
        film: '现场录像已由分析台核验。', evidence: '已完成现场操作。',
        departure: '本次救援演练完成。',
      }[beat];
    }
    return added;
  };
  const chapter = { ...run.campaign.current, title: '接驳港 · 独立救援灰盒',
    question: '录像中的实际状态是否支持下一步操作？' };
  Object.defineProperties(run.campaign, {
    current: { get: () => chapter },
    objective: { get: () => (run.authoredSite as WhiteboxSite | null)?.objective
      ?? '拍摄并分析现场；按实体终端提示完成诱导、隔离和救援。' },
  });

  // Recording-only biological detail uses the same site camera and geometry.
  // The flag is scoped to each genuine sensor capture, never live rendering.
  const recorded = (capture: (() => string) | null) => () => {
    const site = run.authoredSite as WhiteboxSite | null;
    if (site) site.recording = true;
    try { return capture?.() ?? ''; }
    finally { if (site) site.recording = false; }
  };
  run.captureSensorFrame = recorded(run.captureSensorFrame);
  run.captureKeyframe = recorded(run.captureKeyframe);

  let pending: FootageRequest | null = null;
  run.footageSink = request => { pending = request; };
  const frame = run.frame.bind(run);
  run.frame = dt => {
    frame(dt);
    if (!pending) return;
    if (pending.token !== run.shot.token) { pending = null; return; }
    if (run.shot.phase !== 'developing' || run.shot.developed < 12) return;
    const request = pending;
    pending = null;
    request.settle(request.token, false, '机载感光序列已显影：本次未提交网络视频生成。');
  };

  // Receive the original opening gate, then enter this independent site's
  // start position. No evidence, items, machinery, or rescue progress is set.
  run.receive();
  (run as unknown as { arrive(): void }).arrive();
  run.pending.length = 0;
  run.heard.length = 0;
  run.log.length = 0;
  run.campaign.journal.length = 0;
  run.storyCaption = '';
  run.storyCaptionLeft = 0;
  run.walkTo('camera');
  run.lamp = true;
  // The greybox finishes at its physical exit; the campaign departure control
  // must not create a second, unrelated level in this isolated runtime.
  run.depart = () => run.pushLog(run.authoredSite?.complete
    ? '本次独立救援演练已完成。可使用右上角按钮从零重启。'
    : '请完成现场救援，再靠近实体下潜接口操作。', 'system');
  run.pushLog('独立灰盒：先在观察位拍摄，显影后前往分析台核验。', 'system');
  run.pushLog('使用原驾驶、实体交互与工位控制；曝光 5 秒，显影 12 秒。正式存档不受影响。', 'system');

  Object.defineProperty(window, '__whitebox', {
    configurable: true,
    value: { run, get site() { return run.authoredSite as WhiteboxSite | null; } },
  });
  const restart = document.createElement('button');
  restart.textContent = '重启灰盒';
  restart.setAttribute('aria-label', '从零重启独立灰盒');
  restart.style.cssText = 'position:fixed;right:12px;top:12px;z-index:100;padding:8px 12px;background:var(--abyss);color:var(--bone);border:1px solid var(--rust-dim);font:inherit;cursor:pointer';
  restart.addEventListener('pointerdown', event => event.stopPropagation());
  restart.addEventListener('click', () => location.reload());
  document.body.append(restart);
  new PodSession(run, view).start();
  void view.unlockAudio();
}, { once: true });
