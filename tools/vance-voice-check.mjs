import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();
 await page.route('**/api/**',r=>r.abort());
 await page.goto(process.env.VANCE_TEST_URL??'http://127.0.0.1:5193/');
 const decoded=await page.evaluate(async()=>{
  const spec=await (await fetch('/src/pod/content/vance-voice.json')).json();
  const result=[];
  const context=new AudioContext();
  for(let i=0;i<spec.lines.length;i++){
   const response=await fetch(`/assets/audio/vance/${spec.revision}/${String(i).padStart(2,'0')}.mp3`);
   if(!response.ok)throw Error(`Audio ${i}: HTTP ${response.status}`);
   const bytes=await response.arrayBuffer(),size=bytes.byteLength;
   const decoded=await context.decodeAudioData(bytes).catch(e=>{throw Error(`Audio ${i}: ${size} bytes, ${response.headers.get('content-type')}: ${e}`);});
   result.push({step:i,duration:decoded.duration,ready:2});
  }
  await context.close();
  return result;
 });
 assert.equal(decoded.length,13);assert(decoded.every(x=>x.duration>1&&x.duration<90&&x.ready>=2));
 const lifecycle=await page.evaluate(async()=>{
  const {VanceVoice}=await import('/src/pod/view/vance-voice.ts');
  const player=new VanceVoice();player.play(0);
  const first=player.audio;
  await new Promise(resolve=>setTimeout(resolve,500));
  const started=!!first&&!first.paused;
  const normalPace=first.playbackRate===1.2&&first.defaultPlaybackRate===1.2&&first.preservesPitch;
  player.play(1);const replaced=first.paused&&player.audio!==first;
  const holds=player.tick(.1,false);const muted=!player.tick(.1,true);
  player.play(2);player.stop();const stopped=!player.tick(.1,false);
  player.play(3);const timeout=!player.tick(91,false);
  return {started,normalPace,replaced,holds,muted,stopped,timeout};
 });
 assert(Object.values(lifecycle).every(Boolean),JSON.stringify(lifecycle));
 await fs.mkdir('qa/vance-voice',{recursive:true});
 const spec=JSON.parse(await fs.readFile('src/pod/content/vance-voice.json','utf8'));
 await fs.writeFile('qa/vance-voice/result.json',JSON.stringify({revision:spec.revision,voice:spec.voice,decoded,lifecycle},null,2));
 console.log(JSON.stringify({decoded,lifecycle}));
 console.log('PASS 13 real MP3 decodes; start, replacement, caption hold, mute, disposal and timeout. Voice aesthetics require listening.');
}finally{await browser.close();}
