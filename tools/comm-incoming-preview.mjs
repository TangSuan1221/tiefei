import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const b=await chromium.launch({channel:'msedge',headless:true});
try{const p=await b.newPage({viewport:{width:1024,height:720}});await p.goto('http://127.0.0.1:5178/');await p.evaluate(async()=>{
const {drawCommTab}=await import('/src/pod/view/comm-desk.ts');
document.body.innerHTML='<canvas width="1024" height="720"></canvas>';document.body.style.margin='0';const c=document.querySelector('canvas'),g=c.getContext('2d');g.fillStyle='#030903';g.fillRect(0,0,1024,720);g.textBaseline='middle';
const text=(t,x,y,s=22,col='#b7c98c',max=940)=>{g.font=`${s}px monospace`;g.fillStyle=col;g.fillText(t,x,y,max);};
const button=(id,t,x,y,w,h=44)=>{g.fillStyle='#152b1c';g.fillRect(x,y,w,h);g.strokeStyle='#65956a';g.strokeRect(x,y,w,h);text(t,x+12,y+h/2,22);};
text('PELAGIC / 舰载分析终端',28,36,27);text('04 通讯',770,100,26);drawCommTab(g,{tapes:[{id:'harbor.task.preview',ready:true,siteName:'未知来源 · 视频通讯'}],at:'lab',powered:true},3.2,{text,button,playback:()=>'',videoHit(){}});
});await mkdir('qa/comm-incoming',{recursive:true});await p.screenshot({path:'qa/comm-incoming/preview.png'});}finally{await b.close();}
