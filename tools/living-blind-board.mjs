import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {randomInt} from 'node:crypto';
const round=process.argv[2]??'round1';if(!/^round\d+$/.test(round))throw Error('roundN required');
const live=process.argv[3]==='live';
const dir=`qa/living-2026-10-27/anonymous-${round}${live?'-live':''}`;await mkdir(dir,{recursive:true});
const refs=JSON.parse(await readFile('qa/living-2026-10-27/references/sources.json','utf8'));
const pairs=[['atrium',refs[0],3],['entry',refs[1],4],['repair-link',refs[1],1]];
const browser=await chromium.launch({channel:'msedge',headless:true}),key={};
try{
 const page=await browser.newPage({viewport:{width:1920,height:720}});
 for(let i=0;i<pairs.length;i++){
  const [local,ref,index]=pairs[i],current=`http://127.0.0.1:5180/qa/living-survey/art/${local}${live?'-live':''}.png`,reference=ref.screenshots[index];
  const flip=randomInt(2),urls=flip?[reference,current]:[current,reference];key[i+1]={A:flip?ref.name:'current',B:flip?'current':ref.name,local,mode:live?'live':'recording',reference,source:ref.url};
  await page.setContent(`<body style="margin:0;background:#101010;color:#eee;font:20px sans-serif;display:flex"><div style="width:960px">A<img src="${urls[0]}" style="width:960px;height:675px;object-fit:contain"></div><div style="width:960px">B<img src="${urls[1]}" style="width:960px;height:675px;object-fit:contain"></div></body>`);
  await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:60000});
  await page.screenshot({path:`${dir}/pair-${i+1}.png`});
 }
 await writeFile(`${dir}/key.json`,JSON.stringify(key,null,2));
 console.log('Three anonymous equal-width uncropped pairs captured. Reviewer must not read key.json.');
}finally{await browser.close();}
