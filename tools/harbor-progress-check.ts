import assert from 'node:assert/strict';
import { createExpedition, interactExpedition, newExpeditionState } from '../src/pod/content/expedition';
import { HARBOR, HARBOR_EXIT_REQUIREMENTS } from '../src/pod/content/harbor-level';
import { analyzeHarborEvidence, captureHarborEvidence, grantHarborEvent, HARBOR_PHOTO_TARGET,
  newHarborProgress, resolveHarborEvidence, syncHarborInventory, harborObjective } from '../src/pod/sim/harbor-progress';

const level=createExpedition(0);
assert.equal(level.id,'harbor.1');assert.equal(level.rooms.length,9);assert.equal(level.edges.length,11);
const ids=[level.id,...level.rooms.map(x=>x.id),...level.edges.map(x=>x.id),...level.items.map(x=>x.id),...level.stages.map(x=>x.id)];
assert(ids.every(id=>id.startsWith('harbor.')));assert.equal(new Set(ids).size,ids.length);
for(const room of level.rooms) { assert.equal(room.floorY,room.elevation!-3);assert(room.ceiling!>=6); }
for(const edge of level.edges) {
  const path=edge.path!;assert(path.length>=2);
  for(const [roomId,p] of [[edge.from,path[0]],[edge.to,path.at(-1)!]] as const) {
    const r=level.rooms.find(r=>r.id===roomId)!;
    assert.equal(p[1],r.elevation);
    const dx=Math.abs(p[0]-r.x),dz=Math.abs(p[2]-r.z);
    assert((dx===r.width/2&&dz<=r.depth/2-edge.width/2)||(dz===r.depth/2&&dx<=r.width/2-edge.width/2),edge.id);
  }
  for(let i=1;i<path.length;i++) assert(path[i][0]===path[i-1][0]||path[i][2]===path[i-1][2]);
}
for(let index=1;index<7;index++) {const l=createExpedition(index);assert.equal(l.id,`expedition.${index+1}`);assert.equal(l.rooms.length,28);}
assert(!level.items.some(i=>i.grants?.includes(HARBOR.photo)||i.grants?.includes(HARBOR.discrepancy)));
const game=newExpeditionState(level);game.inventory.push(...HARBOR_EXIT_REQUIREMENTS.filter(x=>x!==HARBOR.photo));
assert.equal(interactExpedition(level,game,'harbor.item.exit').ok,false);
assert.equal(game.completed,false);
let state=newHarborProgress();const original=JSON.stringify(state);
const capture={id:'harbor.exposure.1',roomId:'harbor.room.B',position:[60,0,20] as [number,number,number],direction:[0,0,1] as [number,number,number],
  capturedAt:123,targetId:HARBOR_PHOTO_TARGET,targetVisible:true,unobstructed:true,distance:20,stableSeconds:1,lightOn:false,threat:'calm'};
state=captureHarborEvidence(state,capture).state;assert.equal(JSON.stringify(newHarborProgress()),original);
assert.equal(captureHarborEvidence(state,{...capture,threat:'attack'}).state.exposures[0].threat,'calm');
assert.equal(analyzeHarborEvidence(state,[],capture.id).ok,false);
state=resolveHarborEvidence(state,capture.id,{playable:true,source:'still',mediaId:'image.png'}).state;
assert.equal(analyzeHarborEvidence(state,[],capture.id).ok,false);
state=resolveHarborEvidence(state,capture.id,{playable:true,source:'controlled-video',mediaId:'fixture.mp4'}).state;
state=analyzeHarborEvidence(state,[],capture.id).state;
assert.equal(analyzeHarborEvidence(state,[],capture.id).grants.length,0);
assert.equal(analyzeHarborEvidence(state,[],'harbor.analysis.compare').ok,false);
state=analyzeHarborEvidence(state,[HARBOR.module],'harbor.analysis.compare').state;
assert.equal(analyzeHarborEvidence(state,[HARBOR.routeRecord],'harbor.analysis.route').ok,false);
state=analyzeHarborEvidence(state,[HARBOR.card],'harbor.analysis.card').state;
const noBroadcast=analyzeHarborEvidence(state,[HARBOR.routeRecord],'harbor.analysis.route');
assert.equal(noBroadcast.ok,false,'all evidence without retrieval must not unlock route');
assert.match(noBroadcast.message,/行李检修廊疏散记录检索完成/);
assert(!noBroadcast.state.grants.includes(HARBOR.route));
const noBroadcastExit=newExpeditionState(level);
noBroadcastExit.inventory.push(...HARBOR_EXIT_REQUIREMENTS.filter(t=>t!==HARBOR.searchComplete));
assert.equal(interactExpedition(level,noBroadcastExit,'harbor.item.exit').ok,false,'even a preexisting route token cannot bypass retrieval at exit');
assert.equal(noBroadcastExit.completed,false);
assert.match(harborObjective(state,[HARBOR.permit,HARBOR.tool,HARBOR.power,HARBOR.module]),/E区.*检索/);
assert(!level.items.some(i=>i.grants?.includes(HARBOR.searchComplete)),'pressing F must not directly complete retrieval');
const beforeRetrieval=JSON.stringify(state);
const retrieved=grantHarborEvent(state,{type:'retrieval-complete'});
assert.equal(JSON.stringify(state),beforeRetrieval,'grant is pure');
assert.deepEqual(retrieved.grants,[HARBOR.searchComplete]);
state=retrieved.state;
assert.equal(grantHarborEvent(state,{type:'retrieval-complete'}).grants.length,0,'repeated completion is idempotent');
assert(syncHarborInventory(state,[]).includes(HARBOR.searchComplete));
assert(grantHarborEvent(JSON.parse(JSON.stringify(state)),{type:'retrieval-complete'}).grants.length===0,'save roundtrip keeps completion');
state=analyzeHarborEvidence(state,[HARBOR.routeRecord],'harbor.analysis.route').state;
assert(state.grants.includes(HARBOR.route));
const bad=captureHarborEvidence(newHarborProgress(),{...capture,unobstructed:false}).state;
assert.equal(analyzeHarborEvidence(resolveHarborEvidence(bad,capture.id,{playable:true,source:'generated-video',mediaId:'x.mp4'}).state,[],capture.id).ok,false);
// Physical evidence may arrive before photography; explicit re-analysis succeeds in either order.
let reversed=analyzeHarborEvidence(newHarborProgress(),[HARBOR.card],'harbor.analysis.card').state;
assert.equal(analyzeHarborEvidence(reversed,[HARBOR.module,HARBOR.routeRecord],'harbor.analysis.route').ok,false);
reversed=captureHarborEvidence(reversed,capture).state;
reversed=resolveHarborEvidence(reversed,capture.id,{playable:true,source:'generated-video',mediaId:'x.mp4'}).state;
reversed=analyzeHarborEvidence(reversed,[],capture.id).state;
reversed=analyzeHarborEvidence(reversed,[HARBOR.module],'harbor.analysis.compare').state;
reversed=grantHarborEvent(reversed,{type:'retrieval-complete'}).state;
reversed=analyzeHarborEvidence(reversed,[HARBOR.routeRecord],'harbor.analysis.route').state;
assert(reversed.grants.includes(HARBOR.route));
assert.equal(grantHarborEvent(state,{type:'depth-check',pressureReady:true,oxygenReady:false,energyReady:true,propulsionReady:true}).ok,false);
game.inventory.push(HARBOR.photo);assert(interactExpedition(level,game,'harbor.item.exit').ok);assert(game.completed);
assert.equal(interactExpedition(level,game,'harbor.item.exit').ok,false);
const earlyCard=newExpeditionState(level);
assert(interactExpedition(level,earlyCard,'harbor.item.employee-card').ok,'T12 allows early card recovery before retrieval');
console.log('PASS: harbor geometry, six legacy levels, photo gate, noBroadcast route/exit rejection, retrieval idempotence/save, early card and out-of-order analysis.');
