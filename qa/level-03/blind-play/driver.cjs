const { chromium } = require('playwright');
const readline = require('readline');
const fs = require('fs');
(async () => {
 const browser = await chromium.launch({channel:'msedge',headless:true});
 const page = await browser.newPage({viewport:{width:1440,height:900}});
 await page.routeWebSocket(/^ws:\/\/127\.0\.0\.1:5180\/\?token=/, ws => ws.close());
 await page.goto('http://127.0.0.1:5180/?level=3');
 const rl=readline.createInterface({input:process.stdin});
 console.log('READY');
 for await (const line of rl) {try {
  const c=JSON.parse(line); fs.appendFileSync('qa/level-03/blind-play/actions.jsonl',JSON.stringify(c)+'\n');
  if(c.reload) await page.reload();
  if(c.close) {await browser.close();process.exit(0);}
  if(c.click) await page.getByRole('button',{name:c.click,exact:false}).click();
  if(c.xy) await page.mouse.click(...c.xy);
  if(c.key) {await page.keyboard.down(c.key); await page.waitForTimeout(c.ms||100); await page.keyboard.up(c.key);}
  if(c.wait) await page.waitForTimeout(c.wait);
  if(c.shot) await page.screenshot({path:'qa/level-03/blind-play/'+c.shot+'.png'});
  console.log(await page.locator('body').innerText());
 } catch(e){console.log(String(e));}}
 await browser.close();
})();
