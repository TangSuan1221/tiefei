import assert from 'node:assert/strict';
import {HarborSimpleFlow} from '../src/pod/sim/harbor-simple-flow';
import {HarborRescue} from '../src/pod/sim/harbor-rescue';
import {freshNarrative} from '../src/pod/sim/narrative-memory';
const make=()=>{const flow=new HarborSimpleFlow(new HarborRescue());flow.accepted.push('L1-R28-V01','L1-R28-V02');return flow;};
for(const text of ['你在哪里 告诉我','你在那儿','把座标给我','我怎么到你那边','你的具体位置','过哪道门能找到你，你在哪','where are you?','How do I reach you?']){
 const f=make();f.requestCode();
 const line=f.say(text,freshNarrative(),false,0)[1];
 assert.match(line,/X42、Y28，深度1012米/);assert.match(line,/第二道压力门/);
 assert.match(line,/不是房间内部/);assert.equal(f.codeAsked,false);assert.equal(f.accepted.length,2);
 assert.equal(f.rescue.state.departed,false);
}
const authorized=make();authorized.accepted.push('L1-R28-V02-AUTH');
assert.match(authorized.say('你在哪',freshNarrative(),false,0)[1],/已经收到的密码/);
authorized.world.secondDoor=true;
assert.match(authorized.say('你在哪',freshNarrative(),false,0)[1],/已经过了第二道压力门/);
// state is a read-only snapshot getter; use an explicit fixture for the post-departure branch.
Object.defineProperty(authorized.rescue,'state',{get:()=>({departed:true})});
const departed=authorized.say('你在哪',freshNarrative(),false,0)[1];
assert.match(departed,/X60、Y27/);assert.match(departed,/1040米/);assert.doesNotMatch(departed,/X42/);
console.log('PASS location paraphrases, door-route stages, no password/story grants, departed route.');
