import '../game/boot.css';
import { PodRun, type FootageRequest } from '../pod/sim/run';
import { PodView } from '../pod/view/present';
import { PodSession } from '../pod/view/session';
import { WhiteboxSite } from './site';
import { clearCheckpoint, readCheckpoint, restoreCheckpoint, installCheckpoint } from './checkpoint';

// This module is loaded only by whitebox.html. It never restores or writes a
// campaign save and never installs the production video service.
const root = document.getElementById('ui-root')!;
root.innerHTML = `<section class="title-screen">
  <div><div class="title-mark">第一关 · 独立关卡验证</div>
  <h1 class="title-cn">接驳港 · 断桥来声</h1>
  <p class="title-tag"><span>观察、诱导、隔离，然后救援。</span>
  <span>曝光 5 秒，机载显影 12 秒；在分析台核验真实感光录像。</span>
  <span>断桥另一端，一名维修员正在呼救。你只能靠返回的影像确认水里有什么。</span></p></div>
  <p class="title-tag">按住空格前进 · N 倒车 · J / L 转向 · Shift 刹车 · F 操作设施<br>摄影台按 1 拍摄 · 分析台按 3 核验。<br>独立检查点仅保留在本标签页，正式存档不受影响。</p>
  <nav class="menu"><button class="menu-item" id="whitebox-start" data-idx="01">
  <span>开始第一关</span><span class="sub">从入口开始</span></button>
  ${readCheckpoint()?'<button class="menu-item" id="whitebox-continue"><span>继续检查点</span><span class="sub">恢复本标签页的关卡进度</span></button>':''}</nav>
</section>`;
document.getElementById('whitebox-continue')?.addEventListener('click',()=>{sessionStorage.setItem('ironlung.whitebox.resume','1');document.getElementById('whitebox-start')!.click();});

document.getElementById('whitebox-start')!.addEventListener('click', () => {
  let resume=false;try{resume=sessionStorage.getItem('ironlung.whitebox.resume')==='1';sessionStorage.removeItem('ironlung.whitebox.resume');}catch{/* no storage */}
  if(!resume)clearCheckpoint();
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
  const chapter = { ...run.campaign.current, title: '接驳港 · 断桥来声',
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
  run.walkTo('nav');
  run.lamp = true;
  // The greybox finishes at its physical exit; the campaign departure control
  // must not create a second, unrelated level in this isolated runtime.
  run.depart = () => run.pushLog(run.authoredSite?.complete
    ? '本次独立救援演练已完成。可刷新页面重新开始。'
    : '请完成现场救援，再靠近实体下潜接口操作。', 'system');
  const site=run.authoredSite as WhiteboxSite;
  if(resume&&!restoreCheckpoint(run,site))run.pushLog('检查点无法恢复，已回到入口；原记录仍保留。','system');
  installCheckpoint(run,site);
  if(!resume)site.navigationConsole.briefing();
  else site.speak('罗温：艇上的记录还在。继续。');

  Object.defineProperty(window, '__whitebox', {
    configurable: true,
    value: { run, get site() { return run.authoredSite as WhiteboxSite | null; } },
  });
  new PodSession(run, view).start();
  void view.unlockAudio();
}, { once: true });
try{if(sessionStorage.getItem('ironlung.whitebox.resume')==='1')document.getElementById('whitebox-start')!.click();}catch{/* start manually */}
