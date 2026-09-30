import assert from 'node:assert/strict';
import {campaign} from '../src/narrative-lab/campaign';
import {StoryEngine} from '../src/narrative-lab/engine';

function record(engine:StoryEngine):void {
  if(engine.state.pod.power<.15)engine.resupply();
  assert.equal(engine.shoot().ok,true);
  engine.tick(17);
  assert.equal(engine.analyze().ok,true);
}

function play(finalChoice:'continue-ascent'|'emergency-descent',badBreaker=false):StoryEngine {
  const engine=new StoryEngine(campaign);
  while(engine.state.phase!=='ended'){
    const scene=engine.scene;
    if(engine.state.phase==='scout'){record(engine);continue;}
    if(engine.state.phase==='decision'){
      const desired=scene.id==='L4-03'?finalChoice:scene.id==='L4-02'&&badBreaker?'restore-bac':undefined;
      const candidate=engine.getChoices().find(c=>c.allowed&&(!desired||c.id===desired))??engine.getChoices().find(c=>c.allowed);
      assert.ok(candidate,`${scene.id} 没有合法行动`);
      assert.equal(engine.act(candidate.id).ok,true);continue;
    }
    if(engine.state.phase==='result'){record(engine);continue;}
    if(engine.state.phase==='resolve'){
      if(scene.id==='L4-02'&&badBreaker&&engine.state.world.elevatorCharge===35){
        assert.equal(engine.act('recover-cab').ok,true);badBreaker=false;continue;
      }
      const resolution=engine.getResolutions().find(r=>r.allowed);
      assert.ok(resolution,`${scene.id} 没有合法结果后决策`);
      assert.equal(engine.resolve(resolution.resolution.id).ok,true);continue;
    }
    assert.equal(engine.advance().ok,true);
  }
  return engine;
}

assert.equal(campaign.scenes.length,15);
for(const chapter of campaign.chapters)assert.equal(campaign.scenes.filter(s=>s.chapter===chapter.id).length,3);
assert.deepEqual(campaign.scenes.filter(s=>s.observation==='passive-sonar').map(s=>s.id),['L3-01','L3-03']);
assert.deepEqual(campaign.scenes.filter(s=>s.observation==='active-sonar').map(s=>s.id),['L4-01']);
const ascent=play('continue-ascent');
assert.equal(ascent.state.endingId,'ending.ascent');
assert.equal(ascent.state.world.investigationComplete,true);
assert.equal(ascent.state.world.eliasRevealed,true);
const descent=play('emergency-descent',true);
assert.equal(descent.state.endingId,'ending.descent');
assert.equal(descent.state.world.breakerSequenceKnown,true,'错误断路器顺序必须可补救');
assert.equal(descent.state.world.elevatorCharge,100);
console.log('PASS 深渊恩赐状态机：15节点、两结局、调查线、艾里亚斯揭示、断路器失败补救、被动/主动声纳节点均可通关。');
