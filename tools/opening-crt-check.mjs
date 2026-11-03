import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5173/');
 await page.waitForTimeout(800);
 const animations=await page.locator('.crt-signal').evaluate(el=>el.getAnimations({subtree:true}).map(a=>a.animationName));
 assert.deepEqual(errors,[]);
 assert.ok(await page.locator('.crt-start').isVisible());
 assert.equal(animations.length,3);
 assert.equal(await page.locator('.crt-snow').count(),0);
 assert.equal(await page.locator('.crt-roll,.crt-sync,.crt-scanlines').count(),0);
 await page.locator('.crt-tear').first().evaluate(el=>{el.getAnimations()[0].pause();el.getAnimations()[0].currentTime=700;});
 assert.notEqual(await page.locator('.crt-tear').first().evaluate(el=>getComputedStyle(el).transform),'none');
 await page.locator('[data-id=options]').click();
 await page.locator('#crt-motion').uncheck();
 assert.equal(await page.locator('.crt-signal').evaluate(el=>el.getAnimations({subtree:true}).length),0);
 await page.locator('#crt-motion').check();
 await page.locator('[data-action=close]').click();
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.crt-signal').evaluate(el=>el.getAnimations({subtree:true}).length),0);
 console.log('PASS: title loads without runtime errors, interference displaces image slices, no rolling scan, settings and reduced motion stop animation.');
} finally {await browser.close();}
