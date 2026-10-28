import assert from 'node:assert/strict';
import {PodRun} from '../src/pod/sim/run';
const r=new PodRun(3344);r.createAuthoredSite=()=>({index:2,description:'研究所当前区域环境记录',managesThreats:true,managesNarrative:true,complete:false,move(){return true;},turn(){return 0;},dispose(){}} as any);r.beginAbyssalLab();
const capture=(r as any).captureFootage('identify');
assert.deepEqual(capture.fauna,[]);assert.deepEqual(capture.direction.fauna,[]);assert.equal(capture.creature,null);assert.equal(capture.story,undefined);assert.equal(capture.narrativeTrace,undefined);assert.equal(capture.leg.scene,undefined);assert.equal(capture.leg.name,'研究所当前区域环境记录');assert.equal(capture.leg.siteName,'研究所当前区域环境记录');assert(!/热泉廊|管水母|无害可穿|诱饵/.test(JSON.stringify(capture)));
console.log('PASS third-level exposure snapshots contain no legacy scene/fauna/story inference');
