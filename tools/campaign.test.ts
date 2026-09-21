import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CAMPAIGN_ENDINGS, CAMPAIGN_STORY } from '../src/pod/content/campaign-story.ts';
import { ACTS } from '../src/pod/content/acts.ts';
import { entryNode, exitNode } from '../src/pod/gen/volume.ts';
import { Campaign, type CampaignBeat, type CampaignChoice } from '../src/pod/sim/campaign.ts';
import { PodRun, type TapeRecord } from '../src/pod/sim/run.ts';

const beats: CampaignBeat[] = ['hook', 'arrival', 'film', 'evidence', 'departure'];
const choices: CampaignChoice[] = ['relay', 'seal', 'archive'];

// Controlled transition fixtures, NOT a full playthrough: invoke real arrive/depart,
// but place the pod at the exit and mark traversal/locks complete without piloting.
function arrive(run: PodRun) {
  (run as any).arrive();
  assert.equal(run.phase, 'site');
  assert.ok(run.volume);
}

function prepareExit(run: PodRun) {
  const volume = run.volume!;
  volume.identified = true;
  volume.visited = [...new Set([...volume.visited, volume.hookNode, exitNode(volume).id])];
  for (const lock of volume.locks) lock.solved = true;
  run.volumeAt = exitNode(volume).id;
  run.power = 1;
  run.blackout = false;
  run.charging = false;
  run.threat = null;
  assert.equal(run.canDepart, true);
}

function atChapter(chapter: number) {
  const run = new PodRun(42);
  for (let i = 0; i <= chapter; i++) {
    arrive(run);
    if (i < chapter) {
      prepareExit(run);
      run.depart();
      assert.equal(run.legIndex, i + 1);
    }
  }
  return run;
}

// Controlled tape fixtures exercise the real analysis gate, not video generation.
function insertTape(run: PodRun, leg = run.legIndex, ready = true): TapeRecord {
  const tape: TapeRecord = {
    id: `fixture.${run.tapes.length}`,
    legId: ACTS[leg].leg.id,
    siteName: ACTS[leg].leg.siteName,
    purpose: 'identify',
    atBreath: run.breaths,
    ready,
    fauna: [],
    caughtThreat: null,
    creatureMissing: false,
    analyzed: false,
    report: [],
  };
  run.tapes.push(tape);
  run.tapeCursor = run.tapes.length - 1;
  return tape;
}

test('content has seven distinct chapters and beats, bounded lines, and actionable objectives', () => {
  assert.equal(CAMPAIGN_STORY.length, 7);
  assert.equal(new Set(CAMPAIGN_STORY.map(c => c.title)).size, 7);
  const texts = CAMPAIGN_STORY.flatMap(c => beats.map(beat => c[beat]));
  assert.equal(new Set(texts).size, 35);
  for (const chapter of CAMPAIGN_STORY) {
    assert.deepEqual(Object.keys(chapter).sort(),
      ['title', 'hook', 'arrival', 'film', 'evidence', 'departure', 'question', 'objective'].sort());
    for (const text of Object.values(chapter)) assert.ok(text.trim().length > 0);
    assert.doesNotMatch(chapter.objective, /拍(?:摄)?出口|分析下一段|关闭无线电/);
    assert.match(chapter.objective, /出口.*离站/);
  }
  const source = readFileSync(new URL('../src/pod/content/campaign-story.ts', import.meta.url), 'utf8');
  source.split(/\r?\n/).forEach((line, i) =>
    assert.ok([...line].length <= 100, `content line ${i + 1} exceeds 100 characters`));
  assert.deepEqual(Object.keys(CAMPAIGN_ENDINGS).sort(), [...choices].sort());
  assert.equal(new Set(Object.values(CAMPAIGN_ENDINGS).map(e => e.body)).size, 3);
});

test('Campaign records each chapter beat once and rejects evidence before arrival', () => {
  const campaign = new Campaign();
  assert.equal(campaign.record(-1, 'hook'), false);
  assert.equal(campaign.record(7, 'hook'), false);
  for (let chapter = 0; chapter < 7; chapter++) {
    assert.equal(campaign.record(chapter, 'evidence'), false);
    for (const beat of beats) {
      assert.equal(campaign.record(chapter, beat), true);
      assert.equal(campaign.record(chapter, beat), false);
      assert.ok(campaign.has(chapter, beat));
      assert.equal(campaign.journal.at(-1)?.text, CAMPAIGN_STORY[chapter][beat]);
    }
  }
  assert.equal(campaign.journal.length, 35);
  assert.equal(new Set(campaign.journal.map(e => e.id)).size, 35);
});

test('alert pauses narrative without dropping beats or consuming the quiet cooldown', () => {
  const campaign = new Campaign();
  campaign.record(0, 'hook');
  campaign.record(0, 'arrival');
  campaign.record(0, 'film');
  for (let i = 0; i < 30; i++) assert.equal(campaign.tick(1, true), null);
  assert.equal(campaign.tick(0, false)?.beat, 'hook');
  for (let i = 0; i < 30; i++) assert.equal(campaign.tick(1, true), null);
  assert.equal(campaign.tick(1000, false), null, 'large frame must not skip pacing');
  for (let i = 0; i < 8; i++) assert.equal(campaign.tick(1, false), null);
  assert.equal(campaign.tick(1, false)?.beat, 'arrival');
  for (let i = 0; i < 9; i++) assert.equal(campaign.tick(1, false), null);
  assert.equal(campaign.tick(1, false)?.beat, 'film');
  for (let i = 0; i < 20; i++) assert.equal(campaign.tick(1, false), null);
});

test('premature choices fail; a ready final choice is intentional and immutable', () => {
  for (const choice of choices) {
    const campaign = new Campaign();
    for (let i = 0; i < 4; i++) campaign.record(i, 'film');
    assert.equal(campaign.choose(choice, true), false);
    assert.equal(campaign.ending, null);
    campaign.record(6, 'arrival');
    assert.equal(campaign.choose(choice, false), false);
    assert.equal(campaign.choice, null);
    assert.equal(campaign.choose(choice, true), true);
    assert.deepEqual(campaign.ending, CAMPAIGN_ENDINGS[choice]);
    for (const next of choices) assert.equal(campaign.choose(next, true), false);
    assert.equal(campaign.choice, choice);
  }
});

test('archive needs four distinct chapter films; duplicate films and other beats do not count', () => {
  const campaign = new Campaign();
  for (let i = 0; i < 7; i++) {
    campaign.record(i, 'arrival');
    campaign.record(i, 'evidence');
  }
  for (let i = 0; i < 3; i++) {
    campaign.record(i, 'film');
    assert.equal(campaign.record(i, 'film'), false);
    assert.equal(campaign.choose('archive', true), false);
  }
  campaign.record(3, 'film');
  assert.equal(campaign.choose('archive', true), true);
});

test('controlled PodRun transitions record arrivals/departures only on successful transitions', () => {
  const run = new PodRun(42);
  assert.deepEqual(run.campaign.journal.map(e => e.id), ['0.hook']);
  for (let chapter = 0; chapter < 7; chapter++) {
    assert.equal(run.canSurvey, false);
    assert.equal(run.campaign.has(chapter, 'arrival'), false);
    arrive(run);
    assert.equal(run.campaign.has(chapter, 'arrival'), true);
    run.depart();
    assert.equal(run.legIndex, chapter);
    assert.equal(run.campaign.has(chapter, 'departure'), false);
    prepareExit(run);
    if (chapter === 6) {
      run.depart();
      assert.equal(run.outcome.kind, 'alive');
      assert.equal(run.campaign.has(6, 'departure'), false);
      assert.equal(run.chooseTransmission('relay'), true);
    }
    run.depart();
    assert.equal(run.campaign.has(chapter, 'departure'), true);
    assert.equal(run.legIndex, chapter + 1);
    if (chapter < 6) {
      assert.equal(run.phase, 'transit');
      assert.equal(run.campaign.has(chapter + 1, 'arrival'), false);
    }
  }
  assert.equal(run.outcome.kind, 'escaped');
  assert.equal(run.campaign.journal.filter(e => e.beat === 'arrival').length, 7);
  assert.equal(run.campaign.journal.filter(e => e.beat === 'departure').length, 7);
});

test('PodRun final choice requires power, site, identification, hook visit, exit, and solved lock', () => {
  const run = atChapter(6);
  prepareExit(run);
  const volume = run.volume!;
  const lock = volume.locks[0];
  assert.ok(lock, 'D-9 must have its glyph lock');
  const reject = () => {
    assert.equal(run.canDepart, false);
    for (const choice of choices) assert.equal(run.chooseTransmission(choice), false);
    run.depart();
    assert.equal(run.outcome.kind, 'alive');
    assert.equal(run.campaign.choice, null);
    assert.equal(run.campaign.has(6, 'departure'), false);
  };
  run.power = 0; reject(); run.power = 1;
  run.phase = 'transit'; reject(); run.phase = 'site';
  volume.identified = false; reject(); volume.identified = true;
  const visited = [...volume.visited];
  volume.visited = visited.filter(id => id !== volume.hookNode); reject();
  volume.visited = visited;
  run.volumeAt = entryNode(volume).id; reject(); run.volumeAt = exitNode(volume).id;
  lock.solved = false; reject(); lock.solved = true;
  assert.equal(run.canDepart, true);
  assert.equal(run.chooseTransmission('seal'), true);
  assert.equal(run.campaign.has(6, 'departure'), false);
  run.depart();
  assert.equal(run.outcome.kind, 'escaped');
  assert.equal(run.campaign.has(6, 'departure'), true);
});

test('PodRun rejects early and post-death choices; each final ending can escape', () => {
  const early = atChapter(0);
  prepareExit(early);
  for (const choice of choices) assert.equal(early.chooseTransmission(choice), false);
  for (const choice of choices) {
    const run = atChapter(6);
    prepareExit(run);
    if (choice === 'archive') {
      assert.equal(run.chooseTransmission(choice), false);
      // Isolate the choice gate; actual tape credit is exercised below.
      for (let i = 0; i < 4; i++) run.campaign.record(i, 'film');
    }
    assert.equal(run.chooseTransmission(choice), true);
    assert.equal(run.chooseTransmission(choice), false);
    run.depart();
    assert.equal(run.outcome.kind, 'escaped');
    assert.deepEqual(run.campaign.ending, CAMPAIGN_ENDINGS[choice]);
  }
  const dead = atChapter(6);
  prepareExit(dead);
  dead.outcome = { kind: 'dead', cause: 'listener' } as typeof dead.outcome;
  for (const choice of choices) assert.equal(dead.chooseTransmission(choice), false);
});

test('unready and old tapes give no current chapter credit; ready current analysis credits once', () => {
  const run = atChapter(1);
  const current = insertTape(run, 1, false);
  const power = run.power;
  run.analyzeTape();
  assert.equal(current.analyzed, false);
  assert.equal(run.power, power);
  assert.equal(run.volumeKnown, false);
  assert.equal(run.campaign.has(1, 'film'), false);
  const old = insertTape(run, 0, true);
  run.analyzeTape();
  assert.equal(old.analyzed, true);
  assert.equal(run.volumeKnown, false);
  assert.equal(run.campaign.has(1, 'film'), false);
  assert.equal(old.report.includes(CAMPAIGN_STORY[1].film), false);
  current.ready = true;
  run.tapeCursor = run.tapes.indexOf(current);
  run.analyzeTape();
  assert.equal(current.analyzed, true);
  assert.equal(run.volumeKnown, true);
  assert.equal(run.campaign.has(1, 'film'), true);
  assert.equal(current.report.includes(CAMPAIGN_STORY[1].film), true);
  run.analyzeTape();
  insertTape(run);
  run.analyzeTape();
  assert.equal(run.campaign.journal.filter(e => e.id === '1.film').length, 1);
});

test('four different chapters analyzed through PodRun unlock archive; same-chapter rereads do not', () => {
  const run = new PodRun(42);
  for (let chapter = 0; chapter < 7; chapter++) {
    arrive(run);
    if (chapter < 3) {
      for (let repeat = 0; repeat < 2; repeat++) {
        insertTape(run);
        run.analyzeTape();
      }
    }
    prepareExit(run);
    if (chapter < 6) run.depart();
  }
  assert.equal(run.campaign.journal.filter(e => e.beat === 'film').length, 3);
  assert.equal(run.chooseTransmission('archive'), false);
  insertTape(run);
  run.analyzeTape();
  assert.equal(run.campaign.journal.filter(e => e.beat === 'film').length, 4);
  assert.equal(run.chooseTransmission('archive'), true);
});

test('journal, current guidance, and emitted beats do not expose future chapter content', () => {
  const run = new PodRun(42);
  for (let chapter = 0; chapter < 7; chapter++) {
    arrive(run);
    insertTape(run);
    run.analyzeTape();
    assert.equal(run.campaign.chapter, chapter);
    assert.ok(run.campaign.journal.every(e => e.chapter <= chapter));
    assert.equal(run.campaign.ending, null);
    const visible = [run.campaign.objective, run.campaign.current.question,
      ...run.campaign.journal.map(e => e.text), ...run.tapes.flatMap(t => t.report)];
    for (let future = chapter + 1; future < 7; future++) {
      for (const text of Object.values(CAMPAIGN_STORY[future])) {
        assert.ok(!visible.some(shown => shown.includes(text)), `chapter ${future} spoiled in ${chapter}`);
      }
    }
    for (let frame = 0; frame < 100; frame++) {
      const emitted = run.campaign.tick(1, false);
      if (emitted) assert.ok(emitted.chapter <= chapter);
    }
    if (chapter < 6) {
      prepareExit(run);
      run.depart();
    }
  }
});

// Regression fixtures remain fully controlled; these are not full playthroughs.
function drainNarrative(campaign: Campaign): string[] {
  const ids: string[] = [];
  for (let frame = 0; frame < 400; frame++) {
    const entry = campaign.tick(1, false);
    if (entry) ids.push(entry.id);
  }
  return ids;
}

function spliceFixture() {
  const run = atChapter(0);
  const next = structuredClone(atChapter(1).volume!);
  // Isolate transition gates from trap/echo resolution at the destination.
  next.hazards = [];
  next.echoes = [];
  next.hookNode = entryNode(next).id;
  run.chart.push(next);
  prepareExit(run);
  return run;
}

test('rejected final departure without a choice leaves bench cargo and stock unchanged', () => {
  const run = atChapter(6);
  prepareExit(run);
  run.bench.push({ id: 'sup.cell', n: 5 }, { id: 'sup.tape', n: 7 });
  const bench = structuredClone(run.bench);
  const stock = [...run.stock];
  for (let attempt = 0; attempt < 2; attempt++) {
    run.depart();
    assert.deepEqual(run.bench, bench);
    assert.deepEqual([...run.stock], stock);
    assert.equal(run.legIndex, 6);
    assert.equal(run.outcome.kind, 'alive');
    assert.equal(run.campaign.has(6, 'departure'), false);
  }
  assert.equal(run.chooseTransmission('relay'), true);
  run.depart();
  assert.equal(run.outcome.kind, 'escaped');
  assert.notDeepEqual(run.bench, bench, 'successful departure still handles loose cargo');
});

test('old tape analysis credits its visited source chapter and reports only source film', () => {
  const run = atChapter(2);
  drainNarrative(run.campaign);
  const currentGuidance = run.campaign.objective;
  const old = insertTape(run, 0, false);
  run.analyzeTape();
  assert.equal(run.campaign.has(0, 'film'), false);
  assert.equal(old.analyzed, false);
  old.ready = true;
  run.analyzeTape();
  assert.equal(old.analyzed, true);
  assert.equal(run.campaign.has(0, 'film'), true);
  assert.equal(run.campaign.has(2, 'film'), false);
  assert.equal(run.campaign.chapter, 2);
  assert.equal(run.campaign.objective, currentGuidance);
  assert.equal(run.volumeKnown, false);
  assert.ok(old.report.includes(CAMPAIGN_STORY[0].film));
  assert.ok(!old.report.includes(CAMPAIGN_STORY[2].film));
  assert.deepEqual(drainNarrative(run.campaign), [], 'old film stays in journal, not live queue');
  insertTape(run, 0);
  run.analyzeTape();
  assert.equal(run.campaign.journal.filter(e => e.id === '0.film').length, 1);
  const future = insertTape(run, 3);
  run.analyzeTape();
  assert.equal(run.campaign.has(3, 'film'), false, 'unvisited source cannot grant credit');
  assert.ok(!future.report.includes(CAMPAIGN_STORY[3].film));
  assert.equal(run.campaign.chapter, 2);
});

test('controlled splice rejects incomplete departure, blocked input, deployed arm, and death', () => {
  const cases: [string, (run: PodRun) => void][] = [
    ['unidentified', r => { r.volume!.identified = false; }],
    ['hook not visited', r => { r.volume!.visited = []; }],
    ['not at exit', r => { r.volumeAt = entryNode(r.volume!).id; }],
    ['no power', r => { r.power = 0; }],
    ['input blocked', r => { r.driveInputBlocked = true; }],
    ['charging', r => { r.charging = true; }],
    ['arm deployed', r => { r.arm.phase = 'aiming'; }],
    ['dead', r => { r.outcome = { kind: 'dead', cause: 'listener' } as typeof r.outcome; }],
  ];
  for (const [label, block] of cases) {
    const run = spliceFixture();
    block(run);
    const before = {
      legIndex: run.legIndex, volumeAt: run.volumeAt, phase: run.phase,
      journal: structuredClone(run.campaign.journal), power: run.power,
      pending: structuredClone(run.pending), nextVisited: [...run.nextVolume!.visited],
      outcome: structuredClone(run.outcome),
    };
    (run as any).enterSplicedSite();
    assert.deepEqual({
      legIndex: run.legIndex, volumeAt: run.volumeAt, phase: run.phase,
      journal: run.campaign.journal, power: run.power,
      pending: run.pending, nextVisited: run.nextVolume!.visited, outcome: run.outcome,
    }, before, label);
  }
  const locked = atChapter(1);
  locked.chart.push(structuredClone(atChapter(2).volume!));
  prepareExit(locked);
  assert.ok(locked.volume!.locks[0]);
  locked.volume!.locks[0].solved = false;
  (locked as any).enterSplicedSite();
  assert.equal(locked.legIndex, 1);
  assert.equal(locked.campaign.has(1, 'departure'), false);
});

test('successful splice records hook before arrival and drops stale queued instructions', () => {
  const run = spliceFixture();
  // Leave all old beats pending to catch stale replay after the transition.
  run.campaign.record(0, 'film');
  run.campaign.record(0, 'evidence');
  (run as any).enterSplicedSite();
  assert.equal(run.legIndex, 1);
  assert.equal(run.phase, 'site');
  assert.equal(run.volumeAt, entryNode(run.volume!).id);
  assert.deepEqual(run.campaign.journal.slice(-4).map(e => e.id),
    ['0.departure', '1.hook', '1.arrival', '1.evidence']);
  assert.deepEqual(drainNarrative(run.campaign),
    ['0.departure', '1.hook', '1.arrival', '1.evidence']);
  assert.ok(run.campaign.has(0, 'film'), 'old journal entries must remain accessible');
  assert.equal(run.campaign.has(1, 'film'), false);
});

test('chapter changes retain only the immediate departure bridge in the narrative queue', () => {
  const campaign = new Campaign();
  for (let chapter = 0; chapter < 3; chapter++) {
    for (const beat of beats) campaign.record(chapter, beat);
  }
  assert.deepEqual(drainNarrative(campaign),
    ['1.departure', '2.hook', '2.arrival', '2.film', '2.evidence', '2.departure']);
  assert.equal(campaign.journal.length, 15);
});

// Execute the actual view function/method bodies with controlled dependencies.
// AST extraction avoids importing browser/WebGL modules; this is not browser QA.
async function isolatedViewCallable(
  file: string, name: string, globals: Record<string, unknown> = {}, className?: string,
): Promise<any> {
  const ts = await import('typescript');
  const { runInNewContext } = await import('node:vm');
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  let extracted: string;
  if (className) {
    const declaration = ast.statements.find(node =>
      ts.isClassDeclaration(node) && node.name?.text === className);
    assert.ok(declaration && ts.isClassDeclaration(declaration));
    const method = declaration.members.find(node =>
      ts.isMethodDeclaration(node) && node.name.getText(ast) === name);
    assert.ok(method && ts.isMethodDeclaration(method));
    extracted = `class Fixture { ${method.getText(ast)} }\nFixture.prototype.${name};`;
  } else {
    const declaration = ast.statements.find(node =>
      ts.isFunctionDeclaration(node) && node.name?.text === name);
    assert.ok(declaration && ts.isFunctionDeclaration(declaration));
    extracted = `${declaration.getText(ast).replace(/^export\s+/, '')}\n${name};`;
  }
  const js = ts.transpileModule(extracted, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return runInNewContext(js, globals);
}

test('session journal conceals final question until the final chapter film is analyzed', async () => {
  const panels: any[] = [];
  const document = {
    pointerLockElement: null,
    getElementById: () => null,
    createElement: () => ({
      textContent: '', style: {}, children: [] as any[],
      setAttribute() {}, focus() {}, remove() {},
      append(...children: any[]) { this.children.push(...children); },
    }),
    body: { append(panel: any) { panels.push(panel); } },
  };
  const toggleJournal = await isolatedViewCallable(
    '../src/pod/view/session.ts', 'toggleJournal', { document }, 'PodSession');
  const run = atChapter(6);
  const session = { run, keys: new Set(['J']) };
  const render = () => {
    toggleJournal.call(session);
    return panels.at(-1).children.map((child: any) => child.textContent).join('\n') as string;
  };
  assert.ok(!render().includes(CAMPAIGN_STORY[6].question));
  assert.equal(session.keys.size, 0);
  insertTape(run, 0);
  run.analyzeTape();
  assert.ok(!render().includes(CAMPAIGN_STORY[6].question), 'old film cannot reveal final question');
  const finalTape = insertTape(run, 6, false);
  run.analyzeTape();
  assert.ok(!render().includes(CAMPAIGN_STORY[6].question), 'unready film cannot reveal question');
  finalTape.ready = true;
  run.analyzeTape();
  assert.ok(render().includes(CAMPAIGN_STORY[6].question));
});

test('final radio choices retain receive and respect waiting, earplugs, and archive credit', async () => {
  const stationControls = await isolatedViewCallable('../src/pod/view/stations.ts', 'stationControls');
  const run = atChapter(6);
  prepareExit(run);
  const controls = () => stationControls(run, 'radio') as { id: string; key: string; state?: string }[];
  const receive = () => controls().find(control => control.id === 'radio.recv')!;
  const initial = controls();
  for (const id of ['radio.recv', 'story.relay', 'story.seal', 'story.archive']) {
    assert.equal(initial.filter(control => control.id === id).length, 1);
  }
  assert.equal(new Set(initial.map(control => control.key)).size, initial.length);
  assert.ok(run.radioWaiting);
  assert.equal(receive().state, 'active');
  run.earsPlugged = true;
  assert.equal(receive().state, 'disabled');
  run.earsPlugged = false;
  run.pending.length = 0;
  assert.equal(receive().state, 'disabled');
  run.pending.push({ speaker: 'beacon', text: '三号舱，回答。', at: run.breaths });
  assert.equal(receive().state, 'active');
  assert.equal(controls().find(c => c.id === 'story.archive')?.state, 'disabled');
  for (let chapter = 0; chapter < 4; chapter++) run.campaign.record(chapter, 'film');
  assert.equal(controls().find(c => c.id === 'story.archive')?.state, 'normal');
  assert.equal(receive().state, 'active');
  assert.equal(run.campaign.choice, null, 'rendering choices must not select one');
});
