import {createServer} from 'vite';
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const server=await createServer({server:{port:0,hmr:false}});await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();await page.route('**/api/**',r=>r.abort());
 await page.goto(`http://localhost:${server.httpServer.address().port}`);
 await page.evaluate(async()=>{
  const {RadioTransmit}=await import('/src/pod/view/radio-transmit.ts');
  window.radio=new RadioTransmit();window.draft='';window.sent='';
  window.radio.show({inline:true,target:'测试',choices:[],onDraft:t=>window.draft=t,onSend:t=>window.sent=t,onChoose(){},onClose(){}});
 });
 const field=page.locator('#radio-tx input');
 for(const [i,ch] of [...'你在哪里'].entries()){
  await page.keyboard.insertText(ch);
  assert.deepEqual(await field.evaluate(e=>[e.value,e.selectionStart,e.selectionEnd]),['你在哪里'.slice(0,i+1),i+1,i+1]);
 }
 // Native cursor movement must still work; never force all editing to the end.
 await page.keyboard.press('ArrowLeft');await page.keyboard.insertText('这');
 assert.equal(await field.inputValue(),'你在哪这里');
 await page.keyboard.press('Backspace');assert.equal(await field.inputValue(),'你在哪里');
 await page.keyboard.press('End');await page.keyboard.type(' ABC');
 assert.equal(await page.evaluate(()=>window.draft),'你在哪里 ABC');
 // Exercise real browser composition, followed by another committed character.
 await field.fill('');const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.imeSetComposition',{text:'ni',selectionStart:2,selectionEnd:2});
 await cdp.send('Input.insertText',{text:'你'});await page.keyboard.insertText('在');
 assert.equal(await field.inputValue(),'你在');
 await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.sent),'你在');
 console.log('PASS: sequential Chinese/Latin input, caret, middle insertion, deletion, IME commit, draft and send order');
}finally{await browser.close();await server.close();}
