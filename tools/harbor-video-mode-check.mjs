import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.route('**/api/**',r=>r.abort());await page.goto('http://127.0.0.1:5194/');
 const result=await page.evaluate(async()=>{
  const {HarborTaskPlayer}=await import('/src/pod/view/deepsea/harbor-task-player.ts');
  const {useHarborLocalVideo,HARBOR_LOCAL_VIDEO_IDS}=await import('/src/pod/content/harbor-local-videos.ts');
  const {isHarborTaskMedia}=await import('/src/pod/sim/harbor-opening.ts');
  const rows=[];
  for(const mode of [false,true]){
   sessionStorage.setItem('ironlung.gm.novideo',mode?'1':'0');
   for(const id of HARBOR_LOCAL_VIDEO_IDS){
    const run={tapes:[],leg:{id:'harbor'},phase:'site',receiveRemoteTape(t){this.tapes.push({...t,ready:true});return true;}};
    const player=new HarborTaskPlayer(run);let generated=false;
    player.deliver=async()=>{generated=true;};
    if(useHarborLocalVideo(id,mode))await player.deliverFixed(id);else player.tick(id);
    await new Promise(r=>setTimeout(r,0));
    rows.push({mode,id,local:run.tapes.length===1,generated,valid:run.tapes[0]?isHarborTaskMedia(run.tapes[0],id):false});player.dispose();
   }
  }
  return rows;
 });
 for(const r of result){const local=r.mode||['L1-R28-V01','L1-R28-V02'].includes(r.id);assert.equal(r.local,local);assert.equal(r.valid,local);if(!local)assert.equal(r.generated,true);}
 console.log(JSON.stringify(result));
}finally{await browser.close();}
