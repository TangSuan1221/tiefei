const {chromium}=require('playwright'); const http=require('http');
(async()=>{const b=await chromium.launchPersistentContext('qa/living-2026-10-27/blind-browser-profile',{viewport:{width:1440,height:1000},executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true}); const p=await b.newPage();await p.routeWebSocket('**',ws=>ws.close());await p.route('**/api/**',r=>r.abort());await p.goto('http://127.0.0.1:5180/?level=2'); http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;try{let a=JSON.parse(raw||'{}');if(a.text)await p.keyboard.insertText(a.text);if(a.reload)await p.reload();if(a.click)await p.getByRole('button',{name:a.click,exact:true}).click();if(a.xy)await p.mouse.click(...a.xy);if(a.key){await p.keyboard.down(a.key);await p.waitForTimeout(a.ms||80);await p.keyboard.up(a.key);}if(a.shot)await p.screenshot({path:'qa/living-2026-10-27/'+a.shot});res.end(await p.locator('body').innerText());}catch(e){res.end(String(e));}}).listen(5197,'127.0.0.1'); console.log('READY');})();




