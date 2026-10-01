import * as T from 'three';
import type { NavigationConsole } from '../pod/sim/authored-site';
import type { Control } from '../pod/view/chrome';
import type { WhiteboxSite } from './site';

/** Inertial coordinates and acoustic observations are separate data sources. */
export class PortNavigation implements NavigationConsole {
 editing=false; logOpen=false; tuning=false; frequency=37.8; captured=false; heard=false; axis=0; fields=['','']; target:number[]|null=null;
 private scanTime=0; private missLeft=0;
 get screenAction(){return this.tuning?'port.capture':undefined;}
 // The approach lies inside the port transmitter's acoustic footprint. Once
 // docked, loss of a tiny position trigger must never cut the rescue channel.
 get inSignal(){return (this.site.dockReached||this.site.position.distanceTo(new T.Vector3(0,2,-13))<48)&&!this.site.rescued;}
 get reception(){return this.inSignal?Math.max(0,1-Math.abs(this.frequency-38.4)/.65):0;}
 get bearingLabel(){if(!this.inSignal)return '方位未知';const d=new T.Vector3(0,2,-13).sub(this.site.position);const a=(Math.atan2(d.x,-d.z)*180/Math.PI-this.site.run.heading+360)%360;return ['前方','右前方','右舷','右后方','后方','左后方','左舷','左前方'][Math.round(a/45)%8];}
 readonly receivedCoordinates='万斯 · 接驳港  X 0 / Z 4';
 private history:number[][]=[]; private sampleClock=0; private sampleId=0;
 private echoes:{angle:number;distance:number}[]=[]; private age=99;
 constructor(private site:WhiteboxSite){}
 briefing(){this.site.speak('万斯：接驳港坐标，X 零，Z 四。我发到左侧导航台的通信记录里了，忘了就翻记录。输入坐标，再把艇开过去。被动监听一直开着，主动声纳有独立电源。发射时，水里也能听见你。');}
 controls():Control[]{
  if(this.tuning)return [{id:'port.capture',key:'c',label:this.captured?'已捕捉':'点击锁定',hint:'指针经过波峰时'},{id:'port.play',key:'p',label:'播放录存',state:this.captured?'normal':'disabled'},{id:'port.rescan',key:'r',label:'重新扫描'},{id:'port.tune',key:'1',label:'返回声纳'},{id:'port.vance',key:'v',label:'通信记录'}];
  if(this.editing)return ['1','2','3','Backspace','4','5','6','Tab','7','8','9','-','0','.','Enter','Escape'].map(key=>({id:'port.key.'+key,key,label:({Backspace:'退格',Tab:'切换 X / Z',Enter:'写入航点',Escape:'取消'} as Record<string,string>)[key]??key}));
  return [{id:'port.tune',key:'1',label:'调频接收',hint:'被动接收常开'},{id:'nav.active',key:'2',label:this.site.run.activeSonarEnabled?'关闭主动声纳':'开启主动声纳',state:this.site.run.activeSonarEnabled?'active':'normal'},{id:'nav.ping1',key:'3',label:'发射脉冲',hint:this.site.run.activeSonarEnabled?'通电就绪':'电源关闭',state:this.site.run.activeSonarEnabled?'normal':'disabled'},{id:'port.coords',key:'r',label:'输入坐标'},{id:'nav.thrust',key:'4',label:'驾驶操纵'},{id:'port.vance',key:'v',label:this.logOpen?'返回声纳':'通信记录',hint:'万斯 · 接驳港坐标'}];
 }
 action(id:string){
  if(id==='port.tune'){this.tuning=!this.tuning;this.logOpen=false;if(this.tuning&&!this.captured){this.scanTime=0;this.frequency=35;this.site.speak('罗温：接收机在自动扫频。等指针经过那道高峰，我就把信号锁住。');}return true;}
  if(id==='port.rescan'){this.captured=false;this.scanTime=0;this.frequency=35;return true;}
  if(id==='port.capture'){if(this.captured)return true;if(!this.inSignal||Math.abs(this.frequency-38.4)>.65){this.missLeft=1.2;return false;}this.captured=true;this.site.run.onCue?.('radio.squelch',.4);return true;}
  if(id==='port.play'){if(!this.captured)return false;if(!this.heard){this.heard=true;this.site.startRadio();}else this.site.replayRadio();return true;}
if(id==='port.coords'){this.logOpen=false;this.editing=true;this.axis=0;this.fields=this.target?.map(String)??['',''];this.site.run.pilot.stop();return true;}if(id==='port.vance'){this.tuning=false;this.logOpen=!this.logOpen;return true;}if(id.startsWith('port.key.'))return this.key(id.slice(9));return false;}
 key(key:string){if(!this.editing)return false;
  if(key==='Escape')this.editing=false;
  else if(key==='Tab')this.axis=1-this.axis;
  else if(key==='Backspace')this.fields[this.axis]=this.fields[this.axis].slice(0,-1);
  else if(key==='Enter'){
   const [x,z]=this.fields.map(Number);
   if(this.fields.every(s=>s.trim()!==''&&Number.isFinite(Number(s)))&&x>=-20&&x<=20&&z>=-18&&z<=24){this.target=[x,z];this.editing=false;this.site.speak(`罗温：航点记下了，X ${x}，Z ${z}。准备推进。`);}
   else this.site.speak('罗温：坐标没写对，我再核对一下通信记录。');
  }else if(/^[0-9.-]$/.test(key)&&this.fields[this.axis].length<6)this.fields[this.axis]+=key;
  return true;
 }
 tick(dt:number){
  this.missLeft=Math.max(0,this.missLeft-dt);
  if(this.tuning&&!this.captured){this.scanTime+=dt;const t=(this.scanTime%10)/5;this.frequency=35+10*(t<=1?t:2-t);}
  this.age+=dt;this.sampleClock+=dt;
  if(this.sampleClock<.5)return;this.sampleClock%=.5;this.sampleId++;



  // Simplified carrier spectrum, not a real audio FFT. Rows store past samples.
  const audible=this.inSignal;
  const energy=audible?(.45+.2*Math.sin(this.site.elapsed*2.3)**2):0;
  this.history.unshift(Array.from({length:72},(_,i)=>{
   const a=35+i*10/72,d=Math.abs(a-38.4);
   const noise=.03+.09*(.5+.5*Math.sin(i*17.17+this.sampleId*3.1));
   return Math.min(1,noise+Math.min(.3,this.site.run.noise*.15)+energy*Math.exp(-d*d/(2*.18*.18)));
  }));this.history.length=Math.min(48,this.history.length);
 }
 pulse(){this.age=0;this.echoes=[];const p=this.site.position;
  for(let i=0;i<120;i++){const angle=i*Math.PI/60;const ray=new T.Ray(p,new T.Vector3(Math.sin(angle),0,-Math.cos(angle)));let distance=24;
   for(const box of this.site.world.solids){const hit=ray.intersectBox(box,new T.Vector3());if(hit)distance=Math.min(distance,hit.distanceTo(p));}
   if(distance<24)this.echoes.push({angle,distance});
  }
 }
 draw(ctx:CanvasRenderingContext2D,w:number,h:number){
  ctx.save();ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillStyle='#061114';ctx.fillRect(0,0,w,h);ctx.fillStyle='#a4d8bc';ctx.font=`${Math.max(12,h*.06)}px "Microsoft YaHei"`;
  if(this.editing){ctx.fillText('航点输入 / 本地接驳坐标',w*.05,h*.23);ctx.fillText(`${this.axis===0?'▸':''} X ${this.fields[0]||'____'}     ${this.axis===1?'▸':''} Z ${this.fields[1]||'____'}`,w*.05,h*.57);ctx.fillStyle='#e5c78f';ctx.fillText(this.receivedCoordinates,w*.05,h*.85);ctx.restore();return;}
  if(this.tuning){
   ctx.fillText('水声接收机 / 自动扫描',w*.05,h*.12);
   const x=w*.07,y=h*.24,gw=w*.86,gh=h*.38;
   ctx.fillStyle='#0b2725';ctx.fillRect(x,y,gw,gh);ctx.strokeStyle='#97d6b1';ctx.beginPath();
   for(let i=0;i<=160;i++){const f=35+i/16;const peak=this.inSignal?Math.exp(-(((f-38.4)/.55)**2))*(.68+.12*Math.sin(this.site.elapsed*6)**2):0;const amp=.04+.035*Math.sin(i*1.7+this.site.elapsed*9)**2+peak;const px=x+i/160*gw,py=y+gh*(1-amp);if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.stroke();
   const px=x+(this.frequency-35)/10*gw;ctx.strokeStyle=this.captured?'#9dedb3':'#efc576';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px,y);ctx.lineTo(px,y+gh);ctx.stroke();ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.moveTo(px,y+8);ctx.lineTo(px-6,y-3);ctx.lineTo(px+6,y-3);ctx.fill();
   ctx.font=`${Math.max(12,h*.055)}px "Microsoft YaHei"`;ctx.fillStyle='#b7d1c6';ctx.fillText('35',x,h*.71);ctx.textAlign='center';ctx.fillText(this.frequency.toFixed(1)+' kHz',x+gw*.5,h*.71);ctx.textAlign='right';ctx.fillText('45',x+gw,h*.71);ctx.textAlign='left';
   ctx.fillText(this.captured?'信号已锁定 · P 播放':this.missLeft?'未锁住 · 继续扫描':this.inSignal?'指针经过高峰时，点击声谱锁定':'载波微弱 · 驶近接驳港',x,h*.85);ctx.restore();return;
  }
  if(this.logOpen){
   ctx.fillText('通信记录 / 已保存',w*.05,h*.12);ctx.fillStyle='#e5c78f';ctx.font=`${Math.max(14,h*.085)}px "Microsoft YaHei"`;ctx.fillText('接驳港   X 0 / Z 4',w*.05,h*.31);
   ctx.fillStyle='#b7d1c6';ctx.font=`${Math.max(12,h*.055)}px "Microsoft YaHei"`;
   const text='来源：下潜前 · 万斯（录存）\n“接驳港坐标，X 零，Z 四。输入坐标，再把艇开过去。被动监听一直开着，主动声纳有独立电源。发射时，水里也能听见你。”';
   let line='',row=0;for(const ch of text){if(ch==='\n'||ctx.measureText(line+ch).width>w*.88){ctx.fillText(line,w*.05,h*.45+row*h*.075);row++;line='';if(ch==='\n')continue;}line+=ch;}ctx.fillText(line,w*.05,h*.45+row*h*.075);ctx.restore();return;
  }
  ctx.textAlign='center';ctx.fillText('被动 / 声谱监听',w*.25,h*.08);ctx.fillText('主动 / 量程 24m',w*.75,h*.08);
  const gx=w*.05,gy=h*.21,gw=w*.4,gh=h*.4;
  ctx.fillStyle='#0c2926';ctx.fillRect(gx,gy,gw,gh);
  for(let row=0;row<this.history.length;row++)for(let col=0;col<72;col++){
   const strength=this.history[row][col];ctx.fillStyle=`rgba(122,225,153,${strength})`;ctx.fillRect(gx+col*gw/72,gy+row*gh/48,gw/72+.5,gh/48+.5);
  }
  ctx.strokeStyle='#548675';ctx.strokeRect(gx,gy,gw,gh);ctx.fillStyle='#b7d1c6';ctx.font=`${Math.max(11,h*.047)}px "Microsoft YaHei"`;
  ctx.fillText('35         40         45 kHz',w*.25,h*.17);
  ctx.fillText('24秒记录 / '+this.bearingLabel,w*.25,h*.68);ctx.fillText(this.inSignal?'有载波 · 1 调频接收':'监听中 · 无清晰载波',w*.25,h*.76);
  const r=Math.min(w*.16,h*.24),cx=w*.75,cy=h*.39;
  ctx.strokeStyle='#2c685c';for(let k=1;k<=3;k++){ctx.beginPath();ctx.arc(cx,cy,r*k/3,0,Math.PI*2);ctx.stroke();}
  if(this.site.run.activeSonarEnabled&&this.age<8){ctx.fillStyle=`rgba(157,222,179,${1-this.age/8})`;for(const e of this.echoes){const a=e.angle-this.site.run.heading*Math.PI/180;ctx.fillRect(cx+Math.sin(a)*r*e.distance/24,cy-Math.cos(a)*r*e.distance/24,3,3);}}
  if(this.target){const dx=this.target[0]-this.site.position.x,dz=this.target[1]-this.site.position.z,range=Math.hypot(dx,dz),a=Math.atan2(dx,-dz)-this.site.run.heading*Math.PI/180;const px=cx+Math.sin(a)*r*Math.min(1,range/24),py=cy-Math.cos(a)*r*Math.min(1,range/24);ctx.strokeStyle='#efc576';ctx.strokeRect(px-4,py-4,8,8);ctx.fillStyle='#efc576';ctx.fillText('航点',px,py-8);}
  ctx.fillStyle=this.site.run.activeSonarEnabled?'#e5c78f':'#b7d1c6';ctx.fillText(this.site.run.activeSonarEnabled?'电源 ON · 换能器有噪声':'电源 OFF · 未发射',cx,h*.68);ctx.fillText(this.site.run.activeSonarEnabled?'3 发射 / 2 关闭':'2 开启主动声纳',cx,h*.76);
  ctx.textAlign='left';ctx.fillStyle='#cbd7c9';ctx.fillText(`惯导 X ${this.site.position.x.toFixed(1)}  Z ${this.site.position.z.toFixed(1)}   航点 ${this.target?this.target.join(' / '):'未输入'}`,w*.04,h*.87);
  ctx.fillStyle='#e5c78f';ctx.fillText(this.receivedCoordinates+'   [V] 记录',w*.04,h*.97);ctx.restore();
 }
}
