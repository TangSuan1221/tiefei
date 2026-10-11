import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='qa/lab-desk';await mkdir(dir,{recursive:true});
const b=await chromium.launch({channel:'msedge',headless:true});
try{const p=await b.newPage({viewport:{width:1600,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/**',r=>r.abort());await p.goto('http://127.0.0.1:5175/');await p.locator('[data-id="new"]').click();await p.waitForFunction(()=>!!window.__pod);
const result=await p.evaluate(async()=>{
window.requestAnimationFrame=()=>0;const r=window.__pod;r.receive();r.arrive();r.power=1;r.walkTo('lab');
const {drawStationView,performControl}=await import('/src/pod/view/stations.ts');const {HitMap}=await import('/src/pod/view/chrome.ts');
const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=720;const c=canvas.getContext('2d'),hits=new HitMap(),images={};
function draw(name){hits.clear();drawStationView(c,r,'lab',0,0,1024,720,hits,{time:0,hovered:null});images[name]=canvas.toDataURL();}
function click(id){const rect=hits.rectOf(id);if(!rect)throw Error('Missing hit '+id);if(hits.pick(rect.x+rect.w/2,rect.y+rect.h/2)!==id)throw Error('Overlapping hit '+id);if(!performControl(r,id))throw Error('Failed '+id);}
draw('empty');click('lab.tab:status');draw('status');click('lab.breaker');if(!r.blackout)throw Error('Breaker did not open');draw('breaker-off');click('lab.ack');draw('breaker-off-ack');click('lab.breaker');if(r.blackout)throw Error('Breaker did not close');draw('breaker-on');r.hull=.85;r.power=.88;draw('light-damage');r.clock+=3;r.power=.875;draw('sampled-drain');r.hull=.4;r.power=.15;draw('alarm');click('lab.ack');draw('ack');if(hits.rectOf('lab.ack'))throw Error('Repeated alarm');r.power=.05;draw('escalated');if(!hits.rectOf('lab.ack'))throw Error('No escalation');click('lab.ack');r.hull=.8;r.power=1;draw('recovered');
click('lab.tab:cargo');draw('cargo');click('lab.tab:tapes');
const frame=canvas.toDataURL();r.tapes.push({id:'qa',legId:r.leg.id,siteName:'测试录像',purpose:'identify',atBreath:0,fauna:[],caughtThreat:null,creatureMissing:false,analyzed:true,ready:true,report:Array.from({length:20},(_,i)=>`核验记录 ${i+1}：光源与声源反应。`),sensorFrames:[frame,frame,frame]});r.tapeCursor=r.tapes.length-1;
draw('tapes');click('lab.send:vance');click('lab.send:elias');if(r.selectedTape.sentTo.length!==2)throw Error('Transmission failed');click('lab.reportNext');draw('report');click('lab.expand');draw('expanded');click('lab.expand');r.blackout=true;draw('offline');click('lab.ack');draw('offline-ack');if(hits.rectOf('lab.send:vance'))throw Error('Offline transmit');click('lab.restoreBus');draw('restored');
return {images,recipients:r.selectedTape.sentTo,errors:[]};
});for(const [name,data]of Object.entries(result.images))await writeFile(`${dir}/${name}.png`,Buffer.from(data.split(',')[1],'base64'));delete result.images;if(errors.length)throw Error(errors.join('\n'));await writeFile(`${dir}/result.json`,JSON.stringify(result,null,2));console.log('PASS lab tabs, inventory, alarm acknowledgement/escalation, playback resize, report pages, recipients, offline recovery');
}finally{await b.close();}
