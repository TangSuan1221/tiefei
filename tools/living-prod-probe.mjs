// Production-bundle smoke probe: what a player sees at LIVING_URL/?level=2 without dev hooks.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.LIVING_URL??'http://127.0.0.1:4181';
const dir=process.env.LIVING_QA_DIR??'qa/living/prod-probe';
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--enable-unsafe-swiftshader']});
const page=await (await browser.newContext({viewport:{width:1600,height:900}})).newPage();
const log=[];
page.on('pageerror',e=>log.push('pageerror: '+e.message+'\n'+(e.stack??'')));
page.on('console',m=>log.push(m.type()+': '+m.text()));
await page.goto(base+'/?level=2');
await page.waitForTimeout(3000);
await page.screenshot({path:dir+'/0-menu.png'});
const menu=await page.evaluate(()=>({title:document.title,text:document.body.innerText.slice(0,600),hooks:{pod:!!window.__pod,podView:!!window.__podView,living:!!window.__living}}));
await page.locator('[data-id="new"]').click({timeout:10000}).catch(e=>log.push('click new failed: '+e.message));
await page.waitForTimeout(15000);
await page.screenshot({path:dir+'/1-after-new.png'});
const after=await page.evaluate(()=>({text:document.body.innerText.slice(0,600),hooks:{pod:!!window.__pod,podView:!!window.__podView,living:!!window.__living},leg:window.__pod?.legIndex,canvas:document.querySelectorAll('canvas').length}));
await writeFile(dir+'/probe.json',JSON.stringify({menu,after,log},null,2));
console.log(JSON.stringify({menu,after,log:log.slice(0,30)},null,2));
await browser.close();
