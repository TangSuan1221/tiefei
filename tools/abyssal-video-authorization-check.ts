import assert from 'node:assert/strict';
import {resolveAbyssalVideoAuthorization,abyssalVideoAuthorized} from '../src/pod/net/abyssal-video-authorization';
import {readFileSync} from 'node:fs';
for(const [config,session,expected] of [[undefined,null,false],['0',null,false],['1',null,true],['0','1',true],[undefined,'1',true],['true',null,false],[1,null,false],['1','0',true]] as const)assert.equal(resolveAbyssalVideoAuthorization(config,session),expected);
assert.equal(abyssalVideoAuthorized(),false,'headless process without explicit Vite config or tab consent stays off');
for(const file of ['src/pod/view/footage.ts','src/pod/view/deepsea/abyssal-lab-site.ts','src/pod/view/deepsea/abyssal-media-player.ts']){const source=readFileSync(file,'utf8');assert(source.includes('abyssalVideoAuthorized()'));assert(!source.includes("sessionStorage.getItem('ironlung.abyssal.videoConsent')"),'all sites must use one authorization rule');}
console.log('PASS explicit flag / legacy session authorization truth table and unified production gates; no network calls');
