import assert from 'node:assert/strict';
import {LivingSurvey,SURVEY_CALL_X,type SurveyCapture} from '../src/pod/sim/living-survey';
const s=new LivingSurvey();
const accept=()=>{assert(s.pending);assert(s.acceptVideo(s.pending!));};
const photo=(target:number|'manual',id=String(target),lit=true)=>{const e:SurveyCapture={survey:true,id,target,lit,valid:true};assert(s.issue(e));s.commit(e);return s.analyze(e);};
assert.equal(s.issue({survey:true,id:'early',target:0,lit:true,valid:true}),null);
assert.equal(s.pending,null);s.operate('body');s.tick(0,SURVEY_CALL_X);assert.equal(s.pending,'L2-S01');accept();s.say('不传递摄像仪',{nearTransfer:true});assert(!s.shared);
s.say('传递摄像仪');assert(!s.shared);s.say('传递摄像仪',{nearTransfer:true});assert(s.shared);accept();
assert(photo('manual'));assert(photo(1));assert(photo(0));assert.equal(s.pending,'L2-S03');accept();
s.say('随便一句');assert(s.helpReplied);s.say('关好了');assert(!s.reported);
s.operate('valve-s',false);assert(!s.valve);s.operate('valve-s');s.say('还没关好');assert(!s.reported);s.say('关好了，你试试？');assert(s.reported);accept();
s.operate('door');s.say('密码是什么');assert(s.askedCode);const code=s.code;s.say(code);assert(!s.unlocked,'typed digits must never open the door');s.operate('door',false);assert(!s.unlocked);s.operate('door');assert(!s.unlocked,'request pending: no authorization yet');accept();s.say(code);assert(!s.unlocked);s.operate('door',false);assert(!s.unlocked);s.operate('door');assert(s.unlocked);assert(photo(2));assert(!s.pending);s.operate('reunion');accept();assert(s.reunion);s.operate('exit');assert(!s.complete);s.operate('ballast');s.operate('exit');assert(s.complete);
const save=s.snapshot(),r=new LivingSurvey();assert(r.restore(save));assert.equal(r.code,code);assert.deepEqual(r.snapshot(),save);
for(const mutate of [(v:any)=>v.photos.push(2),(v:any)=>v.code='bad',(v:any)=>v.shared=false,(v:any)=>v.manual=false,(v:any)=>v.accepted.splice(1,1),(v:any)=>v.captures[0].valid=false,(v:any)=>v.rewarded.push('fake'),(v:any)=>v.pendingCapture={...v.captures[0]}]){const bad=structuredClone(save);mutate(bad);const before=r.snapshot();assert(!r.restore(bad));assert.deepEqual(r.snapshot(),before);}
console.log('PASS living survey: physical gates, evidence, free replies, code persistence, atomic restore');
for(const line of ['确认交接','传递移动摄像仪']){
 const handoff=new LivingSurvey();handoff.operate('body');handoff.say(line);assert(!handoff.shared,'spoken confirmation cannot bypass physical reach');handoff.say('不'+line,{nearTransfer:true});assert(!handoff.shared);handoff.say(line,{nearTransfer:true});assert(handoff.shared,'NPC wording must be accepted at the receiver');
}
// Every save boundary must restore without inventing subsequent facts.
const p=new LivingSurvey();
const checkpoint=()=>{const q=new LivingSurvey();assert(q.restore(p.snapshot()));assert.deepEqual(q.snapshot(),p.snapshot());};
checkpoint();p.tick(30);checkpoint();assert.equal(p.pending,null);p.tick(0,SURVEY_CALL_X);checkpoint();assert.equal(p.pending,'L2-S01B');p.acceptVideo(p.pending!);checkpoint();p.operate('body');checkpoint();p.operate('transfer');checkpoint();p.acceptVideo(p.pending!);checkpoint();
for(const target of [0,1] as const){const e={survey:true as const,id:'p'+target,target,lit:true,valid:true};p.issue(e);p.commit(e);p.analyze(e);checkpoint();}
p.acceptVideo(p.pending!);p.say('你先别动');checkpoint();const e={survey:true as const,id:'pmanual',target:'manual' as const,lit:true,valid:true};p.issue(e);p.commit(e);p.analyze(e);p.operate('valve-s');p.tick(61);assert.equal(p.pending,'L2-S04');p.acceptVideo(p.pending!);checkpoint();
for(const line of ['关好了，公司到底想干什么？','含硫支路已关闭，密码呢？']){const q=new LivingSurvey();assert(q.restore(p.snapshot()));q.say(line);assert(q.reported);assert.equal(q.pending,'L2-S05');assert(!q.askedCode);assert(!q.clearSeen);}
for(const line of ['还没关好，公司到底想干什么？','如果关好了，你能给我密码吗？']){const q=new LivingSurvey();assert(q.restore(p.snapshot()));q.say(line);assert(!q.reported);}
p.say('我还没有关好');assert(!p.reported);p.say('含硫支路已关闭');checkpoint();p.acceptVideo(p.pending!);p.operate('door');p.say('不用密码');assert(!p.askedCode);p.say('给我密码');checkpoint();
const missing=p.snapshot();missing.accepted.reverse();assert(!new LivingSurvey().restore(missing));
console.log('PASS all intermediate checkpoints and delay/negation branches');
// Handing the camera over before Elias's S01 arrives makes S01 moot: no request for the camera may be pending or accepted afterwards.
const early=new LivingSurvey();assert.equal(early.pending,null);early.operate('body');assert.equal(early.pending,null);early.operate('transfer');early.tick(0,SURVEY_CALL_X);
assert.equal(early.pending,'L2-S02');assert(!early.acceptVideo('L2-S01'));{const q=new LivingSurvey();assert(q.restore(early.snapshot()));}
assert(early.acceptVideo('L2-S02'));{const q=new LivingSurvey();assert(q.restore(early.snapshot()));assert.equal(q.pending,null);}
const noShare=early.snapshot();noShare.shared=false;noShare.briefed=false;noShare.accepted=[];assert(new LivingSurvey().restore(noShare));
const skipped=early.snapshot();skipped.shared=false;assert(!new LivingSurvey().restore(skipped),'S02 without handoff stays invalid');
console.log('PASS camera handoff before S01 skips the stale request');
// MET-044: the lock has a physical request path that needs no wording, and no typed text ever unlocks it.
const phys=new LivingSurvey();phys.acceptVideo('L2-S01');phys.operate('body');phys.operate('transfer');phys.acceptVideo('L2-S02');
for(const target of [0,1,'manual'] as const){const e={survey:true as const,id:'m'+target,target,lit:true,valid:true};phys.issue(e);phys.commit(e);phys.analyze(e);if(target===1)phys.acceptVideo('L2-S03');}
phys.say('收到');phys.operate('valve-s');phys.say('关好了');phys.acceptVideo('L2-S05');
phys.operate('door');assert(phys.doorSeen&&!phys.askedCode,'first press only inspects');phys.operate('door');assert(phys.askedCode);assert.equal(phys.pending,'L2-S06');
for(const text of [phys.code,'密码'+phys.code,'开门','确认'])phys.say(text);assert(!phys.unlocked);
assert(phys.acceptVideo('L2-S06'));assert(phys.objective.includes('按 F 确认'));phys.operate('door');assert(phys.unlocked);
{const q=new LivingSurvey();assert(q.restore(phys.snapshot()));}
console.log('PASS 03 door: physical request and confirm, no typed code');
// First call: Rowan picks the case up unprompted, Elias calls at the shaft exit; without the case he sends Rowan back.
{const a=new LivingSurvey();assert(!/按 M|输入/.test(a.objective));assert.match(a.operate('body'),/这个东西应该给艾里亚斯，没准能方便我们联络/);assert.equal(a.pending,null,'no call before the shaft exit');
 a.tick(1,SURVEY_CALL_X-.1);assert.equal(a.pending,null);a.tick(1,SURVEY_CALL_X);assert.equal(a.pending,'L2-S01');assert(a.acceptVideo('L2-S01'));
 assert(!/按 M|输入/.test(a.objective));assert.match(a.objective,/传递口/);a.operate('transfer');assert.equal(a.pending,'L2-S02');{const q=new LivingSurvey();assert(q.restore(a.snapshot()));}}
{const b=new LivingSurvey();b.tick(1,SURVEY_CALL_X);assert.equal(b.pending,'L2-S01B');assert(b.acceptVideo('L2-S01B'));assert.match(b.objective,/X10 Y11.5/);
 b.operate('body');assert.equal(b.pending,null,'no second call after going back');assert.match(b.objective,/传递口/);{const q=new LivingSurvey();assert(q.restore(b.snapshot()));}
 b.operate('transfer');assert.equal(b.pending,'L2-S02');assert(b.acceptVideo('L2-S02'));{const q=new LivingSurvey();assert(q.restore(b.snapshot()));}}
{const c=new LivingSurvey();c.tick(1,SURVEY_CALL_X);assert.equal(c.pending,'L2-S01B');c.operate('body');assert.equal(c.pending,'L2-S01','pickup before the call lands switches to the handoff call');assert(!c.acceptVideo('L2-S01B'));assert(c.acceptVideo('L2-S01'));}
{const d=new LivingSurvey();d.tick(1,SURVEY_CALL_X);d.acceptVideo('L2-S01B');const v=d.snapshot();
 const both=structuredClone(v);both.accepted.push('L2-S01');assert(!new LivingSurvey().restore(both));
 const uncalled=structuredClone(v);uncalled.called=false;assert(!new LivingSurvey().restore(uncalled));
 const legacy=new LivingSurvey();legacy.operate('body');legacy.called=true;legacy.acceptVideo('L2-S01');const old=legacy.snapshot();delete old.called;const q=new LivingSurvey();assert(q.restore(old));assert(q.called);}
console.log('PASS first call: unprompted pickup, shaft-exit trigger, return-for-case variant, save validity');
