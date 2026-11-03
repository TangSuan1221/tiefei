const {chromium}=require('@playwright/test');
const readline=require('node:readline');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 await page.goto('http://127.0.0.1:5190/');
 console.log(await page.locator('body').innerText());
 console.log('READY');
 for await(const line of readline.createInterface({input:process.stdin})) {
  try { console.log(await eval('(async()=>{'+line+'})()')); } catch(e){console.log(String(e))}
  console.log('READY');
 }
 await browser.close();
})();
