import assert from 'node:assert/strict';
import {HARBOR_LOCAL_VIDEO_IDS,useHarborLocalVideo} from '../src/pod/content/harbor-local-videos';
for(const id of HARBOR_LOCAL_VIDEO_IDS){
 assert.equal(useHarborLocalVideo(id,false),true,`${id} must use its supplied movie in normal mode`);
 assert.equal(useHarborLocalVideo(id,true),true);
}
assert.equal(useHarborLocalVideo('L1-R28-V02-AUTH',false),false,'unmapped tasks retain generation');
import {HarborSimpleFlow} from '../src/pod/sim/harbor-simple-flow';
import {HarborRescue} from '../src/pod/sim/harbor-rescue';
import {freshNarrative} from '../src/pod/sim/narrative-memory';
const make=(ids:string[])=>{const f=new HarborSimpleFlow(new HarborRescue());f.accepted.push(...ids as any);f.world.firstDoor=true;f.greeted=ids.length>1;return f;};
const intro=['L1-R28-V01','L1-R28-V02'];
const send=(f:HarborSimpleFlow,text:string)=>f.routeSay(text,freshNarrative(),false,0);
for(const text of ['你好，收到','我是来帮你的','hello']){const f=make(intro.slice(0,1));assert.equal(send(f,text).task,'L1-R28-V02');assert.equal(send(f,text).route,'mainline');}
for(const text of ['门怎么开','通行码是多少','password please']){const f=make(intro);assert.equal(send(f,text).route,'reply');assert.equal(f.codeAsked,false);f.requestCode();assert.equal(send(f,text).task,'L1-R28-V02-AUTH');assert.equal(send(f,text).route,'mainline');assert.equal(f.credential,false);}
for(const text of ['你在哪','谢谢','我害怕','先别走']){const f=make([...intro,'L1-R28-V02-AUTH']);assert.equal(send(f,text).route,'reply');assert.equal(f.backgroundRequested,false);}
for(const text of ['发生了什么','总部派我下来找你','what happened']){const f=make([...intro,'L1-R28-V02-AUTH']);assert.equal(send(f,text).task,'L1-R28-V02A');}
const warning=make([...intro,'L1-R28-V02-AUTH','L1-R28-V02A','L1-R28-V03']);warning.impactCount=2;
assert.equal(send(warning,'为什么关闭声纳').task,'L1-R28-V03A');
assert.equal(send(warning,'先别走').route,'mainline');assert.equal(warning.reportAnswered,false);
assert.equal(send(make(intro),'  ').route,'empty');
console.log('PASS: mainline/reply exclusive routing, repeated pending input, physical prerequisites, background intent, stop and empty input.');

for(const text of ['什么撞了我的艇？','刚才那一下是什么','有东西碰我，怎么回事','what hit the submarine?']){
 const f=make([...intro,'L1-R28-V02-AUTH']);
 assert.equal(f.tick(3),0);f.world.secondDoor=true;assert.equal(f.pending,null);assert.equal(f.tick(.1),1);
 assert.equal(f.pending,null);assert.equal(f.objective,'询问艾利亚斯潜水艇被什么撞击');
 assert.equal(send(f,'你喜欢我吗').route,'reply');assert.equal(f.pending,null);
 const saved=new HarborSimpleFlow(new HarborRescue());assert.ok(saved.restore(f.snapshot()));saved.sync(f.world);assert.equal(saved.pending,null);
 assert.equal(send(saved,text).task,'L1-R28-V03');assert.ok(saved.accept('L1-R28-V03'));
 assert.equal(saved.backgroundRequested,false);
}

{
 const f=make([...intro,'L1-R28-V02-AUTH']);f.world.secondDoor=true;f.world.active=false;
 f.tick(.1);f.tick(2);assert.equal(f.pending,null,'impacts alone must not start action briefing');
 assert.equal(f.accept('L1-R28-V04'),false);
 assert.equal(send(f,'什么撞了潜艇').task,'L1-R28-V03');
 assert.equal(f.accept('L1-R28-V04'),false,'unwatched warning must not be skipped');
 assert.ok(f.accept('L1-R28-V03'));assert.equal(f.pending,'L1-R28-V04');
 assert.equal(useHarborLocalVideo('L1-R28-V04',false),true,'action briefing uses supplied video in normal mode');
 assert.ok(f.accept('L1-R28-V04'));assert.match(f.objective,/维修工具/);
}
console.log('PASS: action briefing follows watched impact reply and uses supplied video in normal mode.');
