/** Runtime route measurement; shell-only geometry check, not a playthrough. */
import {writeFileSync,mkdirSync} from 'node:fs';
import {Box3,Vector3} from 'three';
import {harborHullClear} from '../src/pod/sim/harbor-navigation';
import {LIVING_SPACES,LIVING_DOORS,LIVING_MAIN_ROUTE,LIVING_SURVEY_ROUTE,LIVING_SPAWN,livingSolids,livingWalkable,type LivingSpace,type LivingDoor,type Vec3} from '../src/pod/content/living-deck-layout';

const route:readonly Vec3[]=LIVING_SURVEY_ROUTE;
const extraSpaces=LIVING_SPACES.filter(s=>s.id==='C8'||s.id==='E');
const extraDoors=LIVING_DOORS.filter(d=>['R2-C8','C8-R4','R4-G','A-E'].includes(d.id));
const box=(b:{min:Vec3;max:Vec3})=>new Box3(new Vector3(...b.min),new Vector3(...b.max));
const walkable=livingWalkable().map(box),solids=livingSolids().map(box);
const failures:string[]=[];
let heading=LIVING_SPAWN.heading,samples=0;
for(let i=1;i<route.length;i++){
 const a=new Vector3(...route[i-1]),b=new Vector3(...route[i]),d=b.clone().sub(a);
 const next=Math.hypot(d.x,d.z)>.01?(Math.atan2(d.x,-d.z)*180/Math.PI+360)%360:heading;
 const delta=(next-heading+540)%360-180,n=Math.max(1,Math.ceil(Math.abs(delta)/.5));
 for(let j=0;j<=n;j++){samples++;if(!harborHullClear(a,heading+delta*j/n,walkable,solids)){failures.push(`turn ${i}: ${a.toArray()}`);break;}}
 heading=next;
 const steps=Math.max(1,Math.ceil(d.length()/.1));
 for(let j=0;j<=steps;j++){samples++;if(!harborHullClear(a.clone().addScaledVector(d,j/steps),heading,walkable,solids)){failures.push(`leg ${i}: ${a.toArray()} -> ${b.toArray()}`);break;}}
}
const length=(r:readonly Vec3[],flat=false)=>r.slice(1).reduce((sum,b,i)=>sum+Math.hypot(b[0]-r[i][0],flat?0:b[1]-r[i][1],b[2]-r[i][2]),0);
const old:readonly Vec3[]=[[7,30,7],...LIVING_MAIN_ROUTE];
const result={status:'IMPLEMENTED_ROUTE_SHELL_CHECK',geometry:'runtime shells and openings only; final assets and dynamic obstacles require separate browser checks',hull:'2.8x5x3',samples,baselineMetres:length(old),proposedMetres:length(route),baselineHorizontalMetres:length(old,true),proposedHorizontalMetres:length(route,true),reductionPercent:100*(1-length(route)/length(old)),failures,route,extraSpaces,extraDoors};
mkdirSync('qa/living-route-2026-10-27',{recursive:true});
writeFileSync('qa/living-route-2026-10-27/geometry.json',JSON.stringify(result,null,2)+'\n');
const xy=(x:number,z:number)=>[60+x*4,335+z*4];
const poly=(r:readonly Vec3[])=>r.map(p=>xy(p[0],p[2]).join(',')).join(' ');
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="910" viewBox="0 0 1200 910"><rect width="1200" height="910" fill="#101b25"/><g font-family="Microsoft YaHei, sans-serif" fill="#e8edf2"><text x="35" y="38" font-size="25">第二章：连续推进的调查路线</text><text x="35" y="67" font-size="15">已接入运行地图 · 非完整通关验收　｜　蓝：新主线　灰虚线：旧主线　金框：新增空间</text>`;
for(const s of LIVING_SPACES.filter(s=>s.pod)){const [x,y]=xy(s.minX,s.minZ),planned=extraSpaces.includes(s);svg+=`<rect x="${x}" y="${y}" width="${(s.maxX-s.minX)*4}" height="${(s.maxZ-s.minZ)*4}" fill="${s.pod?'#203344':'#182830'}" stroke="${planned?'#e8b95c':'#607487'}" stroke-width="${planned?3:1}"/><text x="${x+4}" y="${y+16}" font-size="12">${s.id} ${s.name.replace('（拟新增）','')}</text>`;}
svg+=`<polyline points="${poly(old)}" fill="none" stroke="#99a3ad" stroke-opacity=".55" stroke-width="2" stroke-dasharray="5 5"/><polyline points="${poly(route)}" fill="none" stroke="#49dcf5" stroke-width="4"/>`;
const stops:[number,number,string][]=[[7,7,'1 取摄像仪 / 交接'],[53,24,'2 生物01 / 修补'],[108,26,'3 生物02 / 配重'],[137.8,17,'4 供水说明 / 阀门'],[128.5,36,'5 密码门'],[166,60,'6 生物03'],[188,52,'7 会合'],[208,68,'8 下潜']];
for(const [x,z,label] of stops){const [px,py]=xy(x,z);svg+=`<circle cx="${px}" cy="${py}" r="5" fill="#e8b95c"/><text x="${px+8}" y="${py-9}" font-size="12" stroke="#101b25" stroke-width="3" paint-order="stroke">${label}</text>`;}
svg+=`<text x="35" y="820" font-size="17">参考中心线：${length(old).toFixed(0)}m → ${length(route).toFixed(0)}m（含下降，缩短${result.reductionPercent.toFixed(0)}%）</text><text x="35" y="850" font-size="14">旧线未包含新剧情的全部摄影与操作；此数值仅比较导航骨架，不等于通关时间或体验验收。</text><text x="35" y="878" font-size="14">艇壳采样检查仅覆盖外壳 / 运行门洞；人员侧仅视频；实体模型与交互另见专项检查，连续盲玩仍待验收。</text></g></svg>`;
writeFileSync('docs/level-02-route-2026-10-27.svg',svg);
console.log(JSON.stringify({...result,route:undefined,extraSpaces:undefined,extraDoors:undefined},null,2));
if(failures.length)process.exitCode=1;
