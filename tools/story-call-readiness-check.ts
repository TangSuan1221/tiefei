import assert from 'node:assert/strict';
import {callMediaReady,pendingMediaObjective} from '../src/pod/sim/tape-channel';
import type {TapeRecord} from '../src/pod/sim/run';
const cached=new Set<string>();
const has=(key:string)=>cached.has(key);
const tape={id:'harbor.task.test',ready:true,videoResult:'video',cacheKey:'clip'} as TapeRecord;
for(const t of [undefined,tape]){
  assert.equal(callMediaReady(t,has),false);
  assert.ok(!pendingMediaObjective(t,has).includes('接听并完整播放'));
}
assert.match(pendingMediaObjective(tape,has,true),/重试/);
cached.add('clip');
assert.equal(callMediaReady(tape,has),true);
assert.match(pendingMediaObjective(tape,has),/接听并完整播放/);
for(const patch of [{ready:false},{videoResult:'failed'},{cacheKey:undefined},{creatureMissing:true}]){
  assert.equal(callMediaReady({...tape,...patch} as TapeRecord,has),false);
}
cached.clear(); // Reload: saved ready and thumbnails do not restore decoded video.
assert.equal(callMediaReady(tape,has),false);
cached.add('clip');
assert.equal(callMediaReady(tape,has),true);
console.log('PASS: absent, generating/restoring, failed, decoded, invalid and reload media gates');
