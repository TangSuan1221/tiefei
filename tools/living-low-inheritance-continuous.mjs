import {openLevelTwo,startNew,sit,drive,turn,state} from './living-browser-lib.mjs';
import {writeFileSync} from 'node:fs';
const out='qa/living-survey/low-inheritance';const {browser,page,errors}=await openLevelTwo(out);const trace=[];let timer;
const log=async label=>{const s=await page.evaluate(()=>({pos:window.__living.diag.state().pos,power:window.__pod.power,cells:window.__pod.count('sup.cell'),reserve:window.__living.reserveUsed,camera:window.__living.survey.camera,shared:window.__living.survey.shared,arm:window.__pod.arm.phase,feedback:window.__living.feedbackText}));trace.push({label,time:Date.now(),...s});console.log(label,JSON.stringify(s));writeFileSync(`${out}/trace.json`,JSON.stringify({method:'Known-route continuous real keyboard driving; once-only 18%/zero-cell fixture; direct normal interact/useSupply; explicit local no-video task acceptance; not blind play, no external API',trace,errors},null,2));};
try{
 await page.evaluate(()=>sessionStorage.setItem('ironlung.gm.novideo','1'));await startNew(page);await page.evaluate(()=>{window.__pod.power=.18;window.__pod.stock.set('sup.cell',0);window.__pod.activeSonarEnabled=false;window.__pod.sonarPulseEnabled=false;window.__pod.lamp=true;});await log('initial fixture');
 timer=setInterval(()=>log('sample').catch(()=>{}),10000);await sit(page);
 await page.evaluate(async()=>{const {performControl}=await import('/src/pod/view/stations.ts');window.__pod.at='lab';window.__pod.authoredSite.tick(.1);window.__pod.at='camera';});await log('local diagnostic intro');
 const aim=async tilt=>page.evaluate(tilt=>{window.__pod.camPan=0;window.__pod.camTilt=tilt;},tilt);
 const arm=async()=>{for(let i=0;i<3;i++){await page.evaluate(()=>window.__living.interact());await page.waitForTimeout(5000);await log('arm stage '+i);}};
 await drive(page,10,7);await turn(page,180);await drive(page,10,8.5);await aim(Math.atan2(1.2,3));await arm();if(!await page.evaluate(()=>window.__living.survey.camera))throw Error('camera not retrieved');
 await aim(0);await drive(page,12,9);await turn(page,180);await aim(Math.atan2(.5,3.45));await page.evaluate(()=>window.__living.interact());await log('transfer');if(!await page.evaluate(()=>window.__living.survey.shared))throw Error('transfer failed');
 await page.evaluate(async()=>{const {performControl}=await import('/src/pod/view/stations.ts');window.__pod.at='lab';window.__pod.authoredSite.tick(.1);window.__pod.at='camera';});await aim(0);
 for(const [x,z]of[[24,7.5],[53,7.5],[53,24],[56,25]]){await drive(page,x,z);await log(`waypoint ${x},${z}`);}
 await turn(page,180);await drive(page,56,27.5);await aim(Math.atan2(.6,3));await arm();await log('battery collected');const used=await page.evaluate(async()=>{const {performControl}=await import('/src/pod/view/stations.ts');performControl(window.__pod,'station:life');return window.__pod.useSupply('sup.cell');});await log('battery normal use '+used);if(!used)throw Error('battery use rejected');
}catch(e){trace.push({error:String(e)});await log('failure');await page.screenshot({path:`${out}/failure.png`});}finally{clearInterval(timer);await log('final').catch(()=>{});await browser.close();}
