import {chromium} from '@playwright/test';
const directory=process.argv[2]??'qa/level-03/anonymous-round3';
if(!/^qa\/level-03\/anonymous(?:-round\d+)?$/.test(directory))throw Error('Expected a local anonymous comparison directory');
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1920,height:608}});
 await page.goto(`http://127.0.0.1:5180/${directory}/board.html`);
 await page.waitForFunction(()=>[...document.images].length===2&&[...document.images].every(i=>i.complete&&i.naturalWidth>0));
 await page.screenshot({path:`${directory}/side-by-side.png`});
 console.log('Uncropped equal-width side-by-side board captured; source images unchanged.');
}finally{await browser.close();}
