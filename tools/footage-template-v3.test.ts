import test from 'node:test';
import assert from 'node:assert/strict';
import {PodRun} from '../src/pod/sim/run';
import {buildFootagePrompt} from '../src/pod/content/footage';
import {directionClause,type FootageState} from '../src/pod/content/footage-director';
test('each exposure state selects its own motion contract',()=>{
 const r=new PodRun(42);r.gmInvasion();r.walkTo('camera');r.beginShoot();
 const captured=r.shot.capture!;
 const clauses=(['calm','anomaly','pursuit','attack','aftermath'] as FootageState[]).map(state=>{
  const clause=directionClause({...captured.direction!,state});
  assert.match(clause,new RegExp(`Template: ${state}`));
  assert.match(clause,/Motion contract:/);return clause;
 });
 assert.equal(new Set(clauses).size,5);
 const before=buildFootagePrompt(captured);r.threat=null;
 assert.equal(buildFootagePrompt(r.shot.capture!),before);
 assert.match(before,/recognizable anatomy/);
 assert.doesNotMatch(before,/jolt and displaced sediment/);
});
test('physical attack prompt has one creature, no mandatory stencil or contradictory body ban',()=>{
 const r=new PodRun(42);r.gmInvasion();r.walkTo('camera');r.beginShoot();
 const capture=r.shot.capture!;
 assert.equal(capture.direction?.identified,'cre.veil');
 const prompt=buildFootagePrompt({...capture,interior:'Current room: flooded pump service bay. Visible: pump and grated floor.',stencil:'GH-72'});
 assert.match(prompt,/curtain of living skin/);
 assert.doesNotMatch(prompt,/GH-72|GH-17|without showing a monster|No visible monster anatomy|no creature and no figure/);
 assert.match(prompt,/readable subject midtones|readable midtones/);
 assert.match(prompt,/pump service bay/);
 assert.equal((prompt.match(/In the water:/g)??[]).length,1);
 const other=buildFootagePrompt({...capture,interior:'Current room: cable tunnel. Visible: low ceiling and cable trays.'});
 assert.match(other,/cable tunnel/);assert.doesNotMatch(other,/pump service bay/);
});
