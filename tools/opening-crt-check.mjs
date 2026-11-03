import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 await page.goto('http://127.0.0.1:5173/');
 await page.waitForTimeout(800);
 const animations=await page.locator('.crt-signal').evaluate(el=>el.getAnimations({subtree:true}).map(a=>a.animationName));
 assert.equal(animations.length,4);
 const before=await page.locator('.crt-roll').evaluate(el=>getComputedStyle(el).transform);
 await page.waitForTimeout(300);
 assert.notEqual(await page.locator('.crt-roll').evaluate(el=>getComputedStyle(el).transform),before);
 await page.locator('[data-id=options]').click();
 await page.locator('#crt-motion').uncheck();
 assert.equal(await page.locator('.crt-signal').evaluate(el=>el.getAnimations({subtree:true}).length),0);
 await page.locator('#crt-motion').check();
 await page.locator('[data-action=close]').click();
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.crt-signal').evaluate(el=>el.getAnimations({subtree:true}).length),0);
 console.log('PASS: four active CRT animations, rolling band moves, settings and reduced motion stop all signal animations.');
} finally {await browser.close();}
