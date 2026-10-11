import assert from 'node:assert/strict';
import {reuseShadowsForNormalPass} from '../src/pod/view/deepsea/ssao-shadow-reuse.ts';
for(const auto of [false,true])for(const dirty of [false,true])for(const throws of [false,true]){
 const renderer={shadowMap:{autoUpdate:auto,needsUpdate:dirty}};
 let calls=0;
 const pass={_renderOverride(r:typeof renderer){calls++;assert.equal(r.shadowMap.autoUpdate,false);assert.equal(r.shadowMap.needsUpdate,false);if(throws)throw Error('normal pass');}};
 reuseShadowsForNormalPass(pass as never);
 if(throws)assert.throws(()=>pass._renderOverride(renderer),/normal pass/);else pass._renderOverride(renderer);
 assert.equal(calls,1);assert.deepEqual(renderer.shadowMap,{autoUpdate:auto,needsUpdate:dirty});
}
const unknown={};reuseShadowsForNormalPass(unknown as never);assert.deepEqual(unknown,{});
console.log('SSAO normal shadow reuse: 8 state/error restoration cases and unknown API fallback passed');
