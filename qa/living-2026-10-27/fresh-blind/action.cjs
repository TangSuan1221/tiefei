const{chromium}=require('playwright');(async()=>{let b=await chromium.connectOverCDP('http://127.0.0.1:9347');let pages=b.contexts().flatMap(c=>c.pages());let p=pages.filter(p=>p.url().includes('level=2'))[0];let a=JSON.parse(process.argv[2]);if(a.reload){await p.reload();await p.waitForTimeout(2000)}if(a.click)await p.mouse.click(...a.click);if(a.label)await p.getByText(a.label,{exact:true}).click();if(a.hold){await p.keyboard.down(a.hold);await p.waitForTimeout(a.ms);await p.keyboard.up(a.hold)}if(a.text)await p.keyboard.insertText(a.text);if(a.key)await p.keyboard.press(a.key);await p.waitForTimeout(400);await p.screenshot({path:'qa/living-2026-10-27/fresh-blind/'+a.name+'.png'});console.log(await p.locator('body').innerText());await b.close()})();





