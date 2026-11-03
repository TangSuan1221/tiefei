import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const dir='qa/opening-blend'; await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 await page.route('**/src/game/session.ts',()=>{});
 await page.goto('http://127.0.0.1:5173/');
 await page.waitForTimeout(1800);
 await page.screenshot({path:dir+'/menu.png'});
 await page.locator('[data-id=new]').click();
 await page.waitForTimeout(400);
 await page.screenshot({path:dir+'/loading.png'});
 await page.setViewportSize({width:1024,height:768});
 await page.screenshot({path:dir+'/loading-4x3.png'});
 console.log('Captured menu and loading at 1600x900 and loading at 1024x768; session import held to avoid starting gameplay.');
} finally {await browser.close();}
