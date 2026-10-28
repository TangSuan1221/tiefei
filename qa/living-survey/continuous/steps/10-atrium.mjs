import {expose,diagnoseNewest,say,toCamera,tiltTo} from '../../../../tools/living-continuous-input.mjs';
import {aimAt} from './04-r2.mjs';
export default async({page,lib,log})=>{
 await toCamera(page);await tiltTo(page,0);
 await lib.drive(page,128.5,36);await lib.turn(page,180);
 await lib.drive(page,128.5,46,{creep:true});await log('A entry');
 await lib.drive(page,150,56,{creep:true});await log('A mid');
 const blind=await page.evaluate(()=>window.__living.creatures.views.find(c=>c.id==='blind.a2'));await log('blind.a2 '+JSON.stringify(blind));
 const aim=await aimAt(page,lib,'blind.a2');await log('aim '+JSON.stringify(aim));
 return aim;
};
