import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const dir=process.argv[2]??'qa/helm-reference-review/round7';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage({viewport:{width:2096,height:632}});const a=await readFile(dir+'/reference-angle.png'),b=await readFile('qa/helm-reference-review/reference.png');await page.setContent(`<body style="margin:0;background:#171717;color:#ddd;font:20px sans-serif"><div style="display:flex;gap:16px;padding:16px">${[['A',a],['B',b]].map(([label,data])=>`<div style="width:1024px">${label}<img style="width:1024px;height:576px;object-fit:contain" src="data:image/png;base64,${data.toString('base64')}"></div>`).join('')}</div></body>`);await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));await page.waitForTimeout(600);await page.screenshot({path:dir+'/comparison-ab.png'});}finally{await browser.close();}
