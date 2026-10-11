import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const dir=process.argv[2]||'qa/porthole-style/baseline';await mkdir(dir,{recursive:true});
const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-gpu','--ignore-gpu-blocklist']});
try{const p=await b.newPage({viewport:{width:1600,height:900}});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/**',r=>r.abort());await p.goto('http://127.0.0.1:5174/');await p.locator('[data-id="new"]').click();await p.waitForFunction(()=>!!window.__pod);await p.evaluate(()=>{const r=window.__pod;r.receive();r.arrive();r.power=1;r.lamp=true;r.walkTo('camera');});await p.waitForTimeout(6000);await p.screenshot({path:`${dir}/cockpit.png`});await writeFile(`${dir}/result.json`,JSON.stringify({errors}));console.log({dir,errors});}finally{await b.close();}
