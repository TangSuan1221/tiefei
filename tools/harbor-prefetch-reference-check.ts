import assert from 'node:assert/strict';
import {PodRun} from '../src/pod/sim/run';
import {HARBOR_REFERENCE_REVISION} from '../src/pod/content/harbor-video-references';
import {videoCreatureSubject} from '../src/pod/content/video-creatures';
function prefetch(index:number,monsters:string[]){
 const r:any=new PodRun(314),sent:any[]=[];
 r.prologue=null;r.power=1;r.blackout=false;r.throttle=0;
 const c={story:true,settled:true,stateKey:'isolated',nearestMonster:10,scene:'harbor',actors:[],monsters,outcome:'confined'};
 r.authoredSite={index,position:{x:0,y:0,z:0},videoContext:()=>c};
 r.captureKeyframe=()=> 'data:image/png;base64,AA==';
 r.footageSink=(req:any)=>{sent.push(req);req.settle(-1,true);};
 r.warmStoryVideo(.5);r.warmStoryVideo(3);
 assert.equal(sent.length,1);
 assert.equal(sent[0].cacheKey,r.videoKey(c),'prefetch and exposure must share the versioned key');
 return sent[0];
}
const creature=[videoCreatureSubject('harbor','one individual')];
const harbor=prefetch(0,creature);
assert.equal(harbor.harborCreatureReference,true);
assert(harbor.cacheKey.endsWith(HARBOR_REFERENCE_REVISION));
assert.match(harbor.prompt,/fused mass of multiple human-like heads/);
for(const req of [prefetch(0,[]),prefetch(1,creature)]){
 assert.equal(req.harborCreatureReference,false);
 assert(!req.cacheKey.includes(HARBOR_REFERENCE_REVISION));
}
console.log('PASS: harbor prefetch attaches anatomy reference; exposure/prefetch keys versioned; empty and other chapters excluded. No network calls.');
