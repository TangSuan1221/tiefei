// Draws the level 3 plan and depth section straight from the layout file, so the
// pictures can never disagree with the coordinates the check verified.
// Usage: npx tsx tools/abyssal-layout-plan.ts
import fs from 'node:fs';
import {
 ABYSS_SPACES,ABYSS_ITEMS,ABYSS_WINDOWS,ABYSS_PHOTO_STATIONS,ABYSS_TANKS,ABYSS_GATES,ABYSS_SPAWN,DOME,DRAIN,PIT_CENTRE,JELLY_TANKS,
 ELIAS_ROUTE,CARETAKER_ROUTE,podRoute,ABYSS_SOLIDS,PIT,CAGE_07,EEL_ORBIT,pitAt,spiralPoint,spiralRadius,alarmBeacons,type Shape,type Vec3,
} from '../src/pod/content/abyssal-lab-layout';

const S=3.1,OX=40,OY=110,MIN_X=-128,MIN_Z=-122;
const X=(x:number)=>OX+(x-MIN_X)*S,Y=(z:number)=>OY+(z-MIN_Z)*S;
const pt=(p:Vec3)=>`${X(p[0]).toFixed(1)},${Y(p[2]).toFixed(1)}`;
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
const label=(x:number,y:number,text:string,o:{size?:number;fill?:string;anchor?:string;weight?:number;halo?:boolean}={})=>
 `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${o.size??12}" fill="${o.fill??'#e8dcc0'}" text-anchor="${o.anchor??'start'}" font-weight="${o.weight??400}"${o.halo===false?'':' paint-order="stroke" stroke="#0b1218" stroke-width="3"'}>${esc(text)}</text>`;

function shapePath(sh:Shape):string{
 if(sh.kind==='cyl')return `<circle cx="${X(sh.centre[0])}" cy="${Y(sh.centre[2])}" r="${sh.radius*S}"/>`;
 if(sh.kind==='obb'){const h=sh.heading*Math.PI/180,f=[Math.sin(h),-Math.cos(h)],r=[Math.cos(h),Math.sin(h)];
  const c=(a:number,b:number):Vec3=>[sh.centre[0]+f[0]*a+r[0]*b,0,sh.centre[2]+f[1]*a+r[1]*b];
  return `<polygon points="${[c(sh.halfL,sh.halfW),c(sh.halfL,-sh.halfW),c(-sh.halfL,-sh.halfW),c(-sh.halfL,sh.halfW)].map(pt).join(' ')}"/>`;}
 const n=80,outer:string[]=[],inner:string[]=[];
 for(let i=0;i<=n;i++){const t=sh.t0+(sh.t1-sh.t0)*i/n,span=i/n;
  outer.push(pt(spiralPoint(t,sh.outer+(sh.bump??0)*Math.sin(Math.PI*span))));inner.push(pt(spiralPoint(t,-sh.inner)));}
 return `<polygon points="${[...outer,...inner.reverse()].join(' ')}"/>`;
}

// ---------------------------------------------------------------- plan
const W=1560,H=1000;
let s=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Microsoft YaHei,sans-serif">
<rect width="${W}" height="${H}" fill="#0b1218"/>
${label(24,38,'第三关（-2层）深渊生物研究所 · 平面图与动线（按布局文件绘制，带尺寸）',{size:22,weight:600,halo:false})}
${label(24,62,'坐标单位米，+X向东、+Z向南（图上方为北）。蓝色=潜艇可通行的水（只有这部分做成关卡）。艾里亚斯那边不建模，全部由视频呈现。数据源：src/pod/content/abyssal-lab-layout.ts',{size:13,fill:'#9aa7ad',halo:false})}
${label(24,82,'检查：tools/abyssal-layout-check.ts（2.8×5×3米艇壳沿主线全程扫掠、8个机械臂目标、8个通话窗、6个拍照位通过；收容环必须下到坑底才能离开）',{size:13,fill:'#9aa7ad',halo:false})}
`;
// grid
for(let x=-120;x<=120;x+=20)s+=`<line x1="${X(x)}" y1="${Y(MIN_Z)}" x2="${X(x)}" y2="${Y(110)}" stroke="#16222a"/>`+label(X(x),Y(110)+14,String(x),{size:10,fill:'#4d5b63',anchor:'middle',halo:false});
for(let z=-120;z<=100;z+=20)s+=`<line x1="${X(MIN_X)}" y1="${Y(z)}" x2="${X(125)}" y2="${Y(z)}" stroke="#16222a"/>`+label(X(MIN_X)-4,Y(z)+4,String(z),{size:10,fill:'#4d5b63',anchor:'end',halo:false});
// water
s+=`<g fill="#1d4a5e" stroke="#3f8fb0" stroke-width="1">${ABYSS_SPACES.flatMap(sp=>sp.shapes.map(shapePath)).join('')}</g>`;
// pit & dome rings
s+=`<circle cx="${X(PIT_CENTRE[0])}" cy="${Y(PIT_CENTRE[2])}" r="${PIT.radius*S}" fill="#3a0d0d" opacity=".6"/><circle cx="${X(PIT_CENTRE[0])}" cy="${Y(PIT_CENTRE[2])}" r="${EEL_ORBIT.radius*S}" fill="none" stroke="#ff9a9a" stroke-dasharray="2 5" opacity=".7"/>`;
for(const c of ABYSS_SOLIDS)s+=`<circle cx="${X(c.centre[0])}" cy="${Y(c.centre[2])}" r="${c.radius*S}" fill="${c.id==='crane'?'#5a4a3a':'#2a1a1a'}" stroke="#b08a6a"/>`;
{const c=pitAt(CAGE_07.angle,PIT.wall,0);s+=`<rect x="${X(c[0])-7}" y="${Y(c[2])-7}" width="14" height="14" fill="#ff4040" stroke="#fff"/>`+label(X(c[0])+10,Y(c[2])+4,'07号收容舱（坑底）',{size:11,fill:'#ffb0b0'});}
{const c=ABYSS_SOLIDS.find(x=>x.id==='crane')!.centre;s+=label(X(c[0])+18,Y(c[2])+4,'塌落吊车（上层出口堵死）',{size:11,fill:'#d8b890'});}
s+=alarmBeacons().filter((_,i)=>i%2===0).map(p=>`<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[2]).toFixed(1)}" r="2.6" fill="#ff3030"/>`).join('');
s+=`<circle cx="${X(0)}" cy="${Y(0)}" r="${DOME.inner*S}" fill="none" stroke="#c9b27a" stroke-dasharray="4 4"/>`;
s+=`<rect x="${X(-1.3)}" y="${Y(-3.2)}" width="${2.6*S}" height="${6.4*S}" fill="#c9b27a"/>`;
s+=`<circle cx="${X(DRAIN.centre[0])}" cy="${Y(DRAIN.centre[2])}" r="${DRAIN.radius*S}" fill="#000" stroke="#7fc0d8"/>`;
// tanks
ABYSS_TANKS.forEach((t,i)=>{const jelly=(JELLY_TANKS as readonly number[]).includes(i+1);s+=`<circle cx="${X(t.centre[0])}" cy="${Y(t.centre[2])}" r="${t.radius*S}" fill="${jelly?'#c98a3a':'#6b5a3a'}"/>`+label(X(t.centre[0])-8,Y(t.centre[2])+4,String(i+1),{size:10,anchor:'end',fill:jelly?'#ffc070':'#a99'});});
// gates
for(const g of ABYSS_GATES){const a=spiralPoint(g.t,-g.halfW),b=spiralPoint(g.t,g.halfW);s+=`<line x1="${X(a[0])}" y1="${Y(a[2])}" x2="${X(b[0])}" y2="${Y(b[2])}" stroke="${g.id==='sluice'?'#ff9a3a':'#d0d0d0'}" stroke-width="4"/>`;}
// routes
const legs=podRoute(),pod=[ABYSS_SPAWN.position,...legs.map(l=>l.to)];
s+=`<polyline points="${pod.map(pt).join(' ')}" fill="none" stroke="#9fe0ff" stroke-width="2" stroke-dasharray="7 5"/>`;
s+=`<polyline points="${CARETAKER_ROUTE.map(n=>pt(n.at)).join(' ')}" fill="none" stroke="#ff6a6a" stroke-width="1.6" stroke-dasharray="2 4"/>`;
CARETAKER_ROUTE.forEach((n,i)=>{s+=`<circle cx="${X(n.at[0])}" cy="${Y(n.at[2])}" r="3.5" fill="#ff6a6a"/>`+label(X(n.at[0])+5,Y(n.at[2])-5,`护${i+1}`,{size:10,fill:'#ff9a9a'});});
// windows, items, photo stations
for(const w of ABYSS_WINDOWS){s+=`<line x1="${X(w.pod[0])}" y1="${Y(w.pod[2])}" x2="${X(w.window[0])}" y2="${Y(w.window[2])}" stroke="#d2a23a" stroke-width="1"/><rect x="${X(w.window[0])-8}" y="${Y(w.window[2])-8}" width="16" height="16" rx="3" fill="#d2a23a"/>`+label(X(w.window[0]),Y(w.window[2])+4,w.id,{size:9,fill:'#111',anchor:'middle',halo:false});}
for(const it of ABYSS_ITEMS){const c=it.id.includes('med')?'#5bd18a':it.id.includes('key')?'#ff4040':'#bbbbbb';s+=`<circle cx="${X(it.position[0])}" cy="${Y(it.position[2])}" r="5" fill="${c}" stroke="#0b1218"/>`;}
for(const p of ABYSS_PHOTO_STATIONS){const h=p.heading*Math.PI/180,len=Math.min(60,Math.hypot(p.target[0]-p.position[0],p.target[2]-p.position[2]))*S,half=0.55;
 const a=[X(p.position[0])+Math.sin(h-half)*len,Y(p.position[2])-Math.cos(h-half)*len],b=[X(p.position[0])+Math.sin(h+half)*len,Y(p.position[2])-Math.cos(h+half)*len];
 s+=`<polygon points="${X(p.position[0])},${Y(p.position[2])} ${a.join(',')} ${b.join(',')}" fill="#e05252" opacity=".18"/><polygon points="${X(p.position[0])},${Y(p.position[2])-8} ${X(p.position[0])+7},${Y(p.position[2])} ${X(p.position[0])},${Y(p.position[2])+8} ${X(p.position[0])-7},${Y(p.position[2])}" fill="#e05252"/>`+label(X(p.position[0])+9,Y(p.position[2])+14,p.id,{size:10,fill:'#ff9a9a'});}
// zone labels
const zl:[string,Vec3,string][]=[['0 沉降井底',spiralPoint(0,-14),'end'],['Q 检疫泊位',spiralPoint(0.75,22),'end'],['G 标本长廊',spiralPoint(1.8,12),'middle'],['L 研究实验室',spiralPoint(3.0,34),'start'],['K 水闸弯道',spiralPoint(3.95,12),'start'],['C 收容环',[PIT_CENTRE[0],0,PIT_CENTRE[2]+40],'middle'],['P 生产车间',spiralPoint(6.8,-22),'start'],['R 术前准备室弯道',spiralPoint(8.45,12),'start'],['O 手术室',[0,0,-16],'middle'],['D 排水竖井',[DRAIN.centre[0]-9,0,DRAIN.centre[2]+2],'end']];
for(const [t,p,a] of zl)s+=label(X(p[0]),Y(p[2]),t,{size:14,weight:600,anchor:a});
// dimensions
const dim=(a:Vec3,b:Vec3,text:string,dx=0,dy=0)=>`<line x1="${X(a[0])}" y1="${Y(a[2])}" x2="${X(b[0])}" y2="${Y(b[2])}" stroke="#f0e2b8" stroke-width="1"/>`+label((X(a[0])+X(b[0]))/2+dx,(Y(a[2])+Y(b[2]))/2+dy,text,{size:11,fill:'#f0e2b8'});
s+=dim(spiralPoint(2.0,-5),spiralPoint(2.0,5),'水道宽10',6,-4);
s+=dim(spiralPoint(0.75,-5),spiralPoint(0.75,17),'泊位宽22',6,0);
s+=dim(spiralPoint(6.9,-8),spiralPoint(6.9,8),'车间沟宽16、沟底深-16',6,0);
s+=dim(spiralPoint(8.0,-4),spiralPoint(8.0,4),'弯道宽8',6,-6);
s+=dim([PIT_CENTRE[0]-PIT.radius,0,PIT_CENTRE[2]],[PIT_CENTRE[0]+PIT.radius,0,PIT_CENTRE[2]],'深坑直径68、高70（坑底-60）',-80,-6);
s+=dim([-DOME.radius,0,0],[DOME.radius,0,0],'',0,0)+label(X(-DOME.radius)+6,Y(0)-30,'穹顶直径64（挑台以上内圈54）',{size:11,fill:'#f0e2b8'});
// scale bar & north
s+=`<line x1="${X(-120)}" y1="${Y(100)}" x2="${X(-70)}" y2="${Y(100)}" stroke="#f0e2b8" stroke-width="3"/>`+label(X(-95),Y(100)-6,'50米',{anchor:'middle'});
s+=`<polygon points="${X(-120)},${Y(80)-22} ${X(-120)-7},${Y(80)} ${X(-120)+7},${Y(80)}" fill="#f0e2b8"/>`+label(X(-120),Y(80)+16,'北',{anchor:'middle'});
// legend
const L=1010;let ly=110;const row=(sw:string,text:string,c='#c8d4d8')=>{const r=`<g transform="translate(${L},${ly})">${sw}</g>`+label(L+44,ly+5,text,{fill:c,halo:false});ly+=24;return r;};
s+=label(L,ly-10,'图例',{size:15,weight:600,halo:false});ly+=10;
s+=row(`<line x1="0" y1="0" x2="34" y2="0" stroke="#9fe0ff" stroke-width="2" stroke-dasharray="7 5"/>`,'罗温的潜艇主线（1316米，全程检查）');
s+=row(`<line x1="0" y1="0" x2="34" y2="0" stroke="#ff6a6a" stroke-width="1.6" stroke-dasharray="2 4"/><circle cx="17" cy="0" r="3.5" fill="#ff6a6a"/>`,'护理员的路线（护1–护8，见下表）');
s+=row(`<rect x="9" y="-8" width="16" height="16" rx="3" fill="#d2a23a"/>`,'通话窗T1–T8（细线连到停艇位）');
s+=row(`<circle cx="17" cy="0" r="5" fill="#5bd18a"/>`,'医疗箱（宁神剂）×6');
s+=row(`<circle cx="17" cy="0" r="5" fill="#ff4040"/>`,'红色应急钥匙箱（3号实验舱）');
s+=row(`<circle cx="17" cy="0" r="5" fill="#bbbbbb"/>`,'传递口（T3下方）');
s+=row(`<polygon points="17,-8 24,0 17,8 10,0" fill="#e05252"/>`,'拍照位P01–P06（扇形=朝向；P05、P06为坑底可选）');
s+=row(`<circle cx="17" cy="0" r="3" fill="#ff3030"/>`,'红色旋转警报灯（6层共144盏，图上画一半）');
s+=row(`<line x1="2" y1="0" x2="32" y2="0" stroke="#ff9a3a" stroke-width="4"/>`,'实验室水闸（开局关闭）');
s+=row(`<line x1="2" y1="0" x2="32" y2="0" stroke="#d0d0d0" stroke-width="4"/>`,'冲压机（每10秒同时抬起3秒）');
s+=row(`<circle cx="17" cy="0" r="6" fill="#c98a3a"/>`,'培养槽（橙=有水母：2、3、6号）');
s+=row(`<circle cx="17" cy="0" r="8" fill="none" stroke="#ff9a9a" stroke-dasharray="2 5"/>`,'缝合鳗绕圈范围（半径16米，深-12到-32）');
ly+=10;s+=label(L,ly,'护理员路线',{size:15,weight:600,halo:false});ly+=22;
CARETAKER_ROUTE.forEach((n,i)=>{s+=label(L,ly,`护${i+1}  ${n.note}`,{size:11,fill:'#ffb0b0',halo:false});ly+=18;});
s+='</svg>\n';
fs.writeFileSync('docs/level-03-abyssal-lab-map.svg',s);

// ---------------------------------------------------------------- depth section along the pod route
const pts=pod;let acc=0;const prof:{d:number;y:number;zone:string}[]=[];
for(let i=0;i<pts.length;i++){if(i){const a=pts[i-1],b=pts[i];acc+=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);}prof.push({d:acc,y:pts[i][1],zone:''});}
const SW=1560,SH=620,sx=(d:number)=>60+d/acc*(SW-120),sy=(y:number)=>60+(32-y)*5.6;
let c=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SW} ${SH}" font-family="Microsoft YaHei,sans-serif"><rect width="${SW}" height="${SH}" fill="#0b1218"/>
${label(24,32,'第三关 · 潜艇主线纵剖面（横轴=沿路线的累计距离，纵轴=高度Y，单位米）',{size:18,weight:600,halo:false})}`;
for(let y=30;y>=-60;y-=10)c+=`<line x1="60" y1="${sy(y)}" x2="${SW-60}" y2="${sy(y)}" stroke="#16222a"/>`+label(52,sy(y)+4,String(y),{size:10,fill:'#5d6b74',anchor:'end',halo:false});
for(let d=0;d<=acc;d+=100)c+=label(sx(d),SH-14,`${d}m`,{size:10,fill:'#5d6b74',anchor:'middle',halo:false});
c+=`<polyline points="${prof.map(p=>`${sx(p.d).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')}" fill="none" stroke="#9fe0ff" stroke-width="2"/>`;
const mark=(d:number,text:string,col='#f0e2b8',y=-30)=>`<line x1="${sx(d)}" y1="${sy(30)}" x2="${sx(d)}" y2="${sy(-62)}" stroke="${col}" stroke-dasharray="3 4" opacity=".5"/>`+label(sx(d)>SW*0.85?sx(d)-4:sx(d)+4,sy(y),text,{size:11,fill:col,anchor:sx(d)>SW*0.85?'end':'start'});
const near=(p:Vec3)=>{let best=0,bd=1e9;pts.forEach((q,i)=>{const dd=Math.hypot(q[0]-p[0],q[2]-p[2]);if(dd<bd){bd=dd;best=i;}});return prof[best].d;};
c+=mark(0,'出生 Y30（第二关下行井延续）');
c+=mark(near(ABYSS_WINDOWS[0].pod),'T1 检疫泊位',undefined,24);
c+=mark(near(ABYSS_ITEMS.find(i=>i.id==='abyss.box.key')!.position),'3号舱钥匙箱',undefined,18);
c+=mark(near(spiralPoint(3.75)),'水闸','#ff9a3a',12);
c+=mark(near(ABYSS_WINDOWS[3].pod),'收容环：坑缘T4、拍缝合鳗','#ff6060',6);
{const bottom=prof.reduce((b,p)=>p.y<b.y?p:b,prof[0]);c+=mark(bottom.d,'坑底-55（07号收容舱、回收槽）','#ff6060',-50);}
{const top=prof.find(p=>p.d>near(ABYSS_WINDOWS[3].pod)+30)!;c+=mark(top.d,'自己沿井壁一圈圈往下探','#ff6060',-8);}
c+=mark(near(spiralPoint(5.95,0,-11)),'坑底排水通道爬升进车间',undefined,-24);

c+=mark(near(spiralPoint(7.25)),'冲压机','#d0d0d0',-30);
c+=mark(near(spiralPoint(8.3)),'T6 准备室（净高8）',undefined,24);
c+=mark(near([0,0,0]),'手术室穹顶（地面-12、挑台7、顶14）',undefined,18);
c+=mark(acc,'排水竖井出关 Y<-40','#7fc0d8',-36);
c+='</svg>\n';
fs.writeFileSync('docs/level-03-abyssal-lab-section.svg',c);
console.log(`wrote plan (${(s.length/1024).toFixed(0)} KB) and section (${(c.length/1024).toFixed(0)} KB); route ${acc.toFixed(0)} m; spiral R ${spiralRadius(0)}→${spiralRadius(9).toFixed(0)}`);
