import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5173');
 await page.evaluate(async()=>{
  const {RadioTransmit}=await import('/src/pod/view/radio-transmit.ts');
  window.result={draft:'',sent:'',cancelled:false};window.tx=new RadioTransmit();
  window.openTest=()=>window.tx.show({target:'开放频道',choices:[],onDraft:t=>window.result.draft=t,onSend:t=>window.result.sent=t,onClose:()=>window.result.cancelled=true,onChoose:()=>{throw Error('no choices');}});
  window.openTest();
 });
 const input=page.locator('#radio-tx input');
 assert.equal(await page.locator('#radio-tx').evaluate(el=>getComputedStyle(el).opacity),'1');
 assert.notEqual(await page.locator('#radio-tx').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
 await input.click();assert(await input.evaluate(el=>document.activeElement===el));
 await page.keyboard.insertText('这里很安静');
 await input.dispatchEvent('keydown',{key:'Enter',isComposing:true});
 assert.equal(await page.evaluate(()=>window.result.sent),'');
 assert.equal(await page.locator('#radio-tx').count(),1);
 assert.equal(await page.evaluate(()=>window.result.draft),'这里很安静');
 assert.equal(await page.locator('#radio-tx .chips').count(),0);
 await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.result.sent),'这里很安静');
 await page.evaluate(()=>window.openTest());await page.keyboard.press('Escape');assert(await page.evaluate(()=>window.result.cancelled));
 console.log('PASS free microphone: arbitrary text, draft sync, Enter send, Esc cancel, no choices');
}finally{await browser.close();}
