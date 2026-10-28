import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const dir='qa/living-2026-10-27/references';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1600}}),sources=[];
 for(const id of [409710,282140]){
  const response=await page.request.get(`https://store.steampowered.com/api/appdetails?appids=${id}`);
  const data=(await response.json())[id].data;
  sources.push({id,name:data.name,url:`https://store.steampowered.com/app/${id}/`,screenshots:data.screenshots.slice(0,6).map(s=>s.path_full)});
 }
 await writeFile(dir+'/sources.json',JSON.stringify(sources,null,2));
 await page.setContent('<body style="margin:0;background:#111;color:white;font:18px sans-serif">'+sources.map(s=>'<h3>'+s.name+'</h3><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">'+s.screenshots.map((url,i)=>`<div>${i}<img style="width:100%;aspect-ratio:16/9;object-fit:contain" src="${url}"></div>`).join('')+'</div>').join('')+'</body>');
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:60000});
 await page.screenshot({path:dir+'/selection.png',fullPage:true});
 console.log('Reference selection board captured from official Steam screenshots; remote assets not imported into game.');
}finally{await browser.close();}
