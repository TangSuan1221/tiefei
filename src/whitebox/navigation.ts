import * as T from 'three';
import type { NavigationConsole } from '../pod/sim/authored-site';
import type { Control } from '../pod/view/chrome';
import type { WhiteboxSite } from './site';

/** Inertial coordinates and acoustic observations are separate data sources. */
export class PortNavigation implements NavigationConsole {
 editing=false; axis=0; fields=['','']; target:number[]|null=null;
 private echoes:{angle:number;distance:number}[]=[]; private age=99;
 constructor(private site:WhiteboxSite){}
 briefing(){this.site.speak('万斯：接驳港坐标，X 零，Z 四。记好了。摄影台左边是导航台，坐标写进去，再把艇开过去。左侧监听器一直开着；右侧主动声纳要另通电。发射时，水里也能听见你。');}
 controls():Control[]{
  if(this.editing)return ['1','2','3','Backspace','4','5','6','Tab','7','8','9','-','0','.','Enter','Escape'].map(key=>({id:'port.key.'+key,key,label:({Backspace:'退格',Tab:'切换 X / Z',Enter:'写入航点',Escape:'取消'} as Record<string,string>)[key]??key}));
  return [{id:'nav.ping0',key:'1',label:'被动监听'},{id:'nav.active',key:'2',label:this.site.run.activeSonarEnabled?'主动声纳：通电':'主动声纳：断电'},{id:'nav.ping1',key:'3',label:'发射脉冲',state:this.site.run.activeSonarEnabled?'normal':'disabled'},{id:'port.coords',key:'r',label:'输入坐标'},{id:'nav.thrust',key:'4',label:'驾驶操纵'},{id:'port.vance',key:'v',label:'重放万斯通信'}];
 }
 action(id:string){if(id==='port.coords'){this.editing=true;this.axis=0;this.fields=this.target?.map(String)??['',''];this.site.run.pilot.stop();return true;}if(id==='port.vance'){this.briefing();return true;}if(id.startsWith('port.key.'))return this.key(id.slice(9));return false;}
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
 tick(dt:number){this.age+=dt;}
 pulse(){this.age=0;this.echoes=[];const p=this.site.position;
  for(let i=0;i<120;i++){const angle=i*Math.PI/60;const ray=new T.Ray(p,new T.Vector3(Math.sin(angle),0,-Math.cos(angle)));let distance=24;
   for(const box of this.site.world.solids){const hit=ray.intersectBox(box,new T.Vector3());if(hit)distance=Math.min(distance,hit.distanceTo(p));}
   if(distance<24)this.echoes.push({angle,distance});
  }
 }
 draw(ctx:CanvasRenderingContext2D,w:number,h:number){
  ctx.save();ctx.fillStyle='#061114';ctx.fillRect(0,0,w,h);ctx.fillStyle='#a4d8bc';ctx.font=`${Math.max(12,h*.06)}px "Microsoft YaHei"`;
  if(this.editing){ctx.fillText('航点输入 / 本地接驳坐标',w*.05,h*.23);ctx.fillText(`${this.axis===0?'▸':''} X ${this.fields[0]||'____'}     ${this.axis===1?'▸':''} Z ${this.fields[1]||'____'}`,w*.05,h*.57);ctx.fillText('输入后以推进操纵杆驾驶',w*.05,h*.85);ctx.restore();return;}
  const r=Math.min(w*.16,h*.27),cy=h*.40;
  for(let j=0;j<2;j++){const cx=w*(j===0?.25:.75);ctx.strokeStyle='#2c685c';for(let k=1;k<=3;k++){ctx.beginPath();ctx.arc(cx,cy,r*k/3,0,Math.PI*2);ctx.stroke();}ctx.fillStyle='#b3d8c7';ctx.textAlign='center';ctx.fillText(j===0?'被动声纳 · 方位':'主动声纳 · 24m',cx,h*.08);
   if(j===0){const d=new T.Vector3(0,2,-13).sub(this.site.position);if(d.length()<64&&!this.site.rescued){const a=Math.round((Math.atan2(d.x,-d.z)-this.site.run.heading*Math.PI/180)/(Math.PI/6))*Math.PI/6-Math.PI/2;ctx.fillStyle='#b4d9a655';ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,a-Math.PI/12,a+Math.PI/12);ctx.closePath();ctx.fill();}ctx.fillText('声源距离未知',cx,h*.77);}
   else{if(this.site.run.activeSonarEnabled&&this.age<8){ctx.fillStyle=`rgba(157,222,179,${1-this.age/8})`;for(const e of this.echoes){const a=e.angle-this.site.run.heading*Math.PI/180;ctx.fillRect(cx+Math.sin(a)*r*e.distance/24,cy-Math.cos(a)*r*e.distance/24,3,3);}}ctx.fillStyle='#b3d8c7';ctx.fillText(this.site.run.activeSonarEnabled?'换能器通电 · 有噪声':'换能器断电',cx,h*.77);}
  }
  ctx.textAlign='left';ctx.fillStyle='#cbd7c9';ctx.fillText(`惯导 X ${this.site.position.x.toFixed(1)}  Z ${this.site.position.z.toFixed(1)}   航点 ${this.target?this.target.join(' / '):'未输入'}`,w*.04,h*.96);ctx.restore();
 }
}
