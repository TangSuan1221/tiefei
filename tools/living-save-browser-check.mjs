// Level two save: play to a mid-level state, let the real 15 s autosave write, reload, Continue, compare.
// All real input: drive to R3, arm pickup, autosave, reload, Continue.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openLevelTwo,startNew,sit,state,heave,drive,turn,physicalClick} from './living-browser-lib.mjs';

const dir=process.env.LIVING_QA_DIR?process.env.LIVING_QA_DIR+'/save':'qa/living/save';
const {browser,page,errors}=await openLevelTwo(dir);
const out={};
const savedPayload=()=>page.evaluate(()=>{const p=JSON.parse(localStorage.getItem('ironlung.living.v1')??'null');return p?JSON.parse(localStorage.getItem(p.slot)):null;});
try{
 await startNew(page);await sit(page);
 await heave(page,0);await physicalClick(page,'camera.lamp');
 for(const [x,z] of [[24,7.5],[60,7.5],[73,7],[72.5,-20],[72.5,-50],[76,-55],[76,-58.4]])await drive(page,x,z);
 out.teleport='none (real drive shaft → C1 → C2 → R3 box)';
 await turn(page,0);
 // Real arm pickup.
 await page.keyboard.down('ArrowDown');await page.waitForTimeout(500);await page.keyboard.up('ArrowDown');
 for(let i=0;i<8;i++){const a=await page.evaluate(()=>window.__living.diag.aimed());if(a?.id==='living.box.probe')break;await page.keyboard.down('ArrowDown');await page.waitForTimeout(120);await page.keyboard.up('ArrowDown');}
 await page.keyboard.press('f');await page.waitForFunction(()=>window.__pod.arm.phase==='aiming',null,{timeout:20000});
 await page.keyboard.press('f');await page.waitForFunction(()=>window.__living.pendingCargo,null,{timeout:20000});
 await page.keyboard.press('f');await page.waitForFunction(()=>window.__living.diag.state().collected.includes('living.box.probe'),null,{timeout:30000});
 await page.waitForFunction(()=>window.__pod.tapes.some(t=>t.id.startsWith('tape.securityLog')),null,{timeout:20000});
 // Move a little so the saved position is not the teleport target.
 await drive(page,76,-52);await turn(page,30);
 const t0=Date.now();
 await page.waitForFunction(()=>{const p=JSON.parse(localStorage.getItem('ironlung.living.v1')??'null');if(!p)return false;const s=JSON.parse(localStorage.getItem(p.slot));return s.site.deck.collected.includes('living.box.probe')&&Math.abs(s.site.position[2]+52)<1.5;},null,{timeout:40000});
 out.autosaveSeconds=Math.round((Date.now()-t0)/1000);
 // Autosave keeps running until the reload, so compare against whatever payload survives it.
 await page.reload();
 const save=await savedPayload();
 out.saved={stage:save.site.deck.stage,position:save.site.position,heading:save.site.heading,collected:save.site.deck.collected,tapes:save.run.tapes.map(t=>t.id),
  creatures:save.site.creatures.mobs.map(m=>({id:m.spawn?.id??m.id,pos:m.pos,mode:m.mode})),dialogue:save.site.dialogue.played,bytes:JSON.stringify(save).length};
 await page.locator('[data-id="continue"]').click();
 await page.waitForFunction(()=>!!window.__living&&window.__pod.legIndex===1,null,{timeout:60000});
 await page.waitForTimeout(300);
 const restored=await page.evaluate(()=>{const l=window.__living,r=window.__pod,s=l.snapshot();return {stage:s.deck.stage,position:s.position,heading:r.heading,collected:s.deck.collected,tapes:r.tapes.map(t=>({id:t.id,frames:t.sensorFrames?.length??0,analyzed:t.analyzed})),
  creatures:s.creatures.mobs.map(m=>({id:m.spawn?.id??m.id,pos:m.pos,mode:m.mode})),dialogue:s.dialogue.played,hull:r.hull,power:r.power};});
 out.restored=restored;
 assert.equal(restored.stage,out.saved.stage);
 assert(restored.position.every((v,i)=>Math.abs(v-out.saved.position[i])<.25),'position mismatch');
 assert.deepEqual(restored.collected,out.saved.collected);
 assert.deepEqual(restored.tapes.map(t=>t.id),out.saved.tapes);
 const sec=restored.tapes.find(t=>t.id.startsWith('tape.securityLog'));assert(sec&&sec.frames>=3,'remote tape frames not restored');
 for(const c of out.saved.creatures){const m=restored.creatures.find(x=>x.id===c.id);assert(m,'missing creature '+c.id);assert(m.pos.every((v,i)=>Math.abs(v-c.pos[i])<1),'creature drifted '+c.id);}
 await page.screenshot({path:dir+'/restored.png'});
 const filtered=errors.filter(e=>!/net::ERR_FAILED|favicon/.test(e));assert.deepEqual(filtered,[],'console errors');
 out.passed=true;console.log('PASS living save',JSON.stringify({autosaveSeconds:out.autosaveSeconds,stage:restored.stage,position:restored.position,tapes:restored.tapes,bytes:out.saved.bytes}));
}catch(e){out.passed=false;out.failure=String(e?.stack??e);console.error('FAIL living save',e);await page.screenshot({path:dir+'/failure.png'}).catch(()=>{});process.exitCode=1;}
finally{out.errors=errors;await writeFile(dir+'/results.json',JSON.stringify(out,null,2));await browser.close();}
