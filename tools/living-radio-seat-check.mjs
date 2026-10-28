// Deck two: M radio from the camera seat must return to camera after send/close, so the habitual "2" cannot power the active sonar.
import {openLevelTwo,startNew,sit} from './living-browser-lib.mjs';
import {writeFileSync} from 'node:fs';
const {browser,page,errors}=await openLevelTwo('qa/living-survey/continuous');
const rows=[];const read=()=>page.evaluate(()=>({at:window.__pod.at,active:window.__pod.activeSonarEnabled}));
try{
 await startNew(page);await sit(page);
 rows.push({name:'seated at camera',...await read()});
 await page.keyboard.press('m');rows.push({name:'radio open borrows nav',...await read()});
 const box=page.getByRole('textbox',{name:'无线电发言'});await box.fill('你还好吗');await box.press('Enter');await page.waitForTimeout(400);
 rows.push({name:'after send returns to camera',...await read()});
 await page.keyboard.press('2');await page.waitForTimeout(400);rows.push({name:'habitual 2 keeps sonar off',...await read()});
 await page.keyboard.press('m');await page.keyboard.press('Escape');await page.waitForTimeout(400);rows.push({name:'after Esc close returns to camera',...await read()});
 await page.keyboard.press('Escape');await page.waitForTimeout(400);await page.keyboard.press('6');await page.waitForTimeout(900);
 await page.keyboard.press('m');const b2=page.getByRole('textbox',{name:'无线电发言'});await b2.fill('收到');await b2.press('Enter');await page.waitForTimeout(400);
 rows.push({name:'radio from nav stays at nav',...await read()});
 await page.keyboard.press('2');await page.waitForTimeout(400);rows.push({name:'explicit 2 at nav still toggles sonar',...await read()});
}finally{
 const pass=rows[1]?.at==='nav'&&rows[2]?.at==='camera'&&rows[3]?.active===false&&rows[4]?.at==='camera'&&rows[5]?.at==='nav'&&rows[6]?.active===true;
 writeFileSync('qa/living-survey/continuous/radio-seat-return.json',JSON.stringify({method:'Real keyboard M/text/Enter/Esc/2/6 in level two; state read for assertions only; APIs blocked',pass,rows,errors},null,2));
 console.log(JSON.stringify({pass,rows}));await browser.close();if(!pass)process.exitCode=1;
}
