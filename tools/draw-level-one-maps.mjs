import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const out='output/level-one-maps-2026-10-04';
await mkdir(out,{recursive:true});
const C={bg:'#09151e',panel:'#10232e',ink:'#e2edf0',muted:'#8ba7b5',wall:'#71909d',water:'#183b4c',green:'#79e2b1',cyan:'#63dafa',amber:'#f5c270',red:'#ef797d'};
const x=v=>80+v*12,y=v=>230+v*12;
const txt=(a,b,t,size=18,color=C.ink,extra='')=>`<text x="${a}" y="${b}" font-size="${size}" fill="${color}" ${extra}>${t}</text>`;
const line=(a,b,c,d,color=C.wall,w=2,extra='')=>`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${color}" stroke-width="${w}" ${extra}/>`;
const rect=(a,b,w,h,fill,stroke='none',sw=2)=>`<rect x="${a}" y="${b}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const room=(a,b,w,h,fill=C.water)=>rect(x(a),y(b),w*12,h*12,fill,C.wall,3);
const path=(points,color,w=4,extra='')=>`<polyline points="${points.map(([a,b])=>`${x(a)},${y(b)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
const dot=(a,b,label,color=C.cyan)=>`<circle cx="${x(a)}" cy="${y(b)}" r="16" fill="${C.bg}" stroke="${color}" stroke-width="3"/>${txt(x(a),y(b)+6,label,17,color,'text-anchor="middle" font-weight="700"')}`;
function start(title,sub){return `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1240" viewBox="0 0 1800 1240"><defs><pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0V60" fill="none" stroke="#23414e" stroke-width=".7"/></pattern>${['cyan','green','red','amber'].map(k=>`<marker id="${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="${C[k]}"/></marker>`).join('')}</defs><rect width="1800" height="1240" fill="${C.bg}"/><g font-family="Microsoft YaHei, sans-serif">${txt(60,57,'IRON LUNG / LEVEL 01',17,C.cyan,'letter-spacing="4"')}${txt(60,111,title,38,C.ink,'font-weight="700"')}${txt(60,151,sub,18,C.muted)}${rect(50,194,1140,705,'url(#grid)')}${rect(1220,194,520,960,C.panel)}`;}
function base(flow){let s='';
 s+=path([[11,20],[11,22],[11.5,23.5],[12,24],[13,25],[14.5,25.5],[16,26],[17,27],[17.5,27.5],[18,29],[18,30]],C.wall,112);
 s+=path([[11,20],[11,22],[11.5,23.5],[12,24],[13,25],[14.5,25.5],[16,26],[17,27],[17.5,27.5],[18,29],[18,30]],C.water,106);
 s+=room(22,31.5,10,7);s+=room(0,0,22,20);s+=room(0,30,22,20);s+=room(32,0,56,40);
 s+=rect(x(7),y(19.7),8*12,8,C.water);s+=rect(x(14),y(29.7),8*12,8,C.water);s+=rect(x(21.8),y(31.7),11*12,6.6*12,C.water);
 s+=room(33.5,2.5,53,12.6,'#273b3b');
 s+=room(69.7,1.3,15.3,14.7,'#432f35');
 s+=line(x(72.3),y(16),x(81.7),y(16),C.amber,6);
 s+=line(x(32),y(18),x(88),y(18),C.red,5,'stroke-dasharray="8 5"');
 s+=room(58.1,14,3.8,1.8,'#758787');s+=room(58.3,21.6,3.4,1.6,'#758787');
 s+=room(52.2,6.8,1.6,2.7,'#32564b');
 s+=line(x(52.2),y(9.5),x(53.8),y(9.5),C.green,4);
 s+=line(x(6.5),y(21),x(15.5),y(21),C.amber,6);
 s+=line(x(27),y(31.5),x(27),y(38.5),C.amber,6);
 s+=txt(x(2),y(3),'A  检查气闸',22);s+=txt(x(2),y(5.5),'22 × 20 m',15,C.muted);
 s+=txt(x(2),y(44),'C  岸电维修湾',21);s+=txt(x(2),y(47),'22 × 20 m',15,C.muted);
 s+=txt(x(34),y(38),'B  主港救援区 · 56 × 40 m',21,C.muted);
 s+=txt(x(35),y(5),'北侧维修平台',20,C.green);s+=txt(x(71),y(4.2),'隔离货仓',19,C.amber);
 s+=txt(x(34),y(20.6),'断裂隔断：可摄影，艇体不可通过',17,C.red);
 s+=dot(57,11,'人',C.green);s+=dot(64,9,'怪',C.red);
 s+=txt(x(49.3),y(5.4),'内侧逃生门',16,C.green);
 s+=txt(x(3),y(24),'压力门 1',16,C.amber);s+=txt(x(23),y(30),'压力门 2',16,C.amber);
 s+=dot(11,10,'S');s+=txt(x(3),y(14),'起点 (11, 0, 10)',15,C.cyan);
 for(const [a,b,n,col] of [[60,27,'01',C.cyan],[42,28,'02',C.amber],[78,26,'03',C.cyan]]){
  s+=dot(a,b,n,col);s+=rect(x(a+2.5)-4,y(b-2.43)-4,8,8,C.amber);
 }
 if(!flow){s+=txt(x(35),y(31),'配电 / 补给',17,C.amber);s+=txt(x(54),y(30),'观察 / 闸控',17,C.cyan);s+=txt(x(73),y(29),'诱导 / 摄影',17,C.cyan);
  s+=path([[60,27],[57,11]],C.cyan,2,'stroke-dasharray="5 5"');s+=path([[78,26],[77,9]],C.cyan,2,'stroke-dasharray="5 5"');
  s+=txt(x(64),y(24),'断桥缺口',15,C.red);
  s+=path([[11,16],[11,18]],C.cyan,3,'marker-end="url(#cyan)"');s+=txt(x(1),y(18),'入口航点 Z16',15,C.cyan);
 }
 s+=line(1145,277,1145,222,C.ink,2,'marker-end="url(#cyan)"');s+=txt(1120,213,'N / −Z',15,C.muted);
 s+=line(80,865,200,865,C.ink,4);s+=line(80,858,80,872,C.ink);s+=line(200,858,200,872,C.ink);s+=txt(80,890,'0                  10 m',15,C.muted);
 return s;
}
function note(y0,title,lines,color=C.cyan){return txt(1250,y0,title,23,color,'font-weight="700"')+lines.map((t,i)=>txt(1250,y0+34+i*27,t,18)).join('');}
function footer(){return txt(60,1190,'依据：harbor-level.ts · harbor-rescue-world.ts · harbor-rescue-site.ts · MET-001—040｜2026-10-04',16,C.muted)+txt(60,1218,'正式入口 / · main-authored · X/Z 等比例功能平面；墙体、标记及局部通道轮廓简化，非逐碰撞网格测绘。',16,C.muted)+'</g></svg>';}
let plan=start('第一关 · 接驳港俯视图','0 层 / 正式游戏当前救援路线 / 北向为航向 000 / 作业艇位 Y = 0')+base(false);
plan+=note(239,'01  观察与总控',[ '艇位：X60 / Y0 / Z27','初次调查与撤离结果摄影','开货仓闸 → 落闸 → 接通逃生门','撤离核验后，在此确认离港']);
plan+=note(416,'02  配电与补给',['艇位：X42 / Y0 / Z28','先完成首次摄影核验，再恢复供电','电力、氧气补给位'],C.amber);
plan+=note(567,'03  诱导与隔离摄影',['艇位：X78 / Y0 / Z26','朝北发射主动脉冲，引怪入仓','拍入仓证据 → 停脉冲 → 返回01','落闸后再次来此拍摄隔离结果']);
plan+=note(744,'图例与空间边界',['蓝圈：潜艇泊位    黄方块：实体面板','绿圈：艾里亚斯    红圈：怪物初位','红虚线：断裂隔断，禁止艇体穿越','蓝虚线：摄影目标方向，非通行路径'],C.green);
plan+=note(927,'尺寸与实现边界',['艇体基准：2.8 × 5 × 3 m','A—C 标称宽9 m；C—B 标称宽7 m','7 m低于MET-003普通主航道8 m要求','旧外围房间省略，不纳入本次救援链'],C.amber);
plan+=txt(60,947,'阅读要点',25,C.ink,'font-weight="700"');
plan+=txt(60,989,'潜艇始终在南侧作业；艾里亚斯沿北侧内路脱困，首关不登艇。',22,C.green);
plan+=txt(60,1030,'摄影与F操作是两个位置要求：面板在泊位右前方，需真实接近至3.4 m内。',19);
plan+=txt(60,1064,'照片记录曝光时的现场；断桥不会因救援完成而修复，也没有新增跨桥操作。',19);
plan+=txt(60,1098,'离港为01确认后的艇内流程；图中不虚构通向下一关的实体出口。',19);
plan+=footer();
let flow=start('第一关 · 三方动线图','与俯视图采用同一坐标底图 / 蓝：玩家进港 / 黄：作业往返 / 绿：人员撤离 / 红：怪物')+base(true);
flow+=path([[11,10],[11,20],[11,22],[11.5,23.5],[12,24],[13,25],[14.5,25.5],[16,26],[17,27],[17.5,27.5],[18,29],[18,35],[32,35],[60,35],[60,27]],C.cyan,4,'marker-end="url(#cyan)"');
flow+=path([[42,28],[42,32],[60,32],[78,32],[78,26]],C.amber,4,'marker-start="url(#amber)" marker-end="url(#amber)"');
flow+=path([[60,27],[60,32]],C.amber,4,'marker-start="url(#amber)" marker-end="url(#amber)"');
flow+=path([[57,11],[53,11],[53,8.5]],C.green,4,'marker-end="url(#green)"');
flow+=path([[64,9],[67,9],[68,17],[74,17],[77,16],[77,9]],C.red,3,'stroke-dasharray="7 5" marker-end="url(#red)"');
flow+=txt(x(63),y(6.4),'诱导方向*',16,C.red);
flow+=txt(x(37),y(34.5),'02 ↔ 01 ↔ 03：按右侧步骤往返',17,C.amber);
flow+=note(239,'01  进港与建立联系',['S → A-C压力门 → C → C-B压力门','进B后调频收听38.4 kHz并应答','到01，朝北拍摄并核验被困现场']);
flow+=note(388,'02  恢复供电，打开货仓',['01 → 02：F恢复配电 / 补给','02 → 01：F打开货仓闸机'],C.amber);
flow+=note(508,'03  引怪入仓，再返回隔离',['01 → 03：主动脉冲诱导约9秒','完成5秒入仓曝光后停止脉冲','03 → 01：F落闸；入仓窗口180秒'],C.amber);
flow+=note(657,'04  核验隔离，放行人员',['01 → 03：拍摄闭闸与仓内怪物','核验后03 → 01：接通内侧逃生门','艾里亚斯 → 内侧门后（约10秒）'],C.green);
flow+=note(806,'05  确认救援，分路离开',['留在01拍撤离结果，显影并核验','01面板确认 → 艇内离港操作','两人分路；后续会合未画作已实现'],C.green);
flow+=note(955,'补救与声音规则',['未确认入仓 / 超时：重新开闸诱导','02可回访补给；读片在艇内完成','仅实际发射脉冲产生诱敌噪声','声纳屏幕通电、停发可保持静默'],C.amber);
flow+=txt(60,947,'动线解释与已知缺口',25,C.ink,'font-weight="700"');
flow+=txt(60,990,'黄线表示往返共用航道，不表示一次性经过；实际顺序见右侧01—05。',20);
flow+=txt(60,1027,'* 红虚线是绕开仓壁、从南闸入仓的设计意图，未作为已实现寻路标注。',19,C.red);
flow+=txt(60,1061,'当前代码直接从(64,9)插值到(77,9)，会穿越货仓西墙；此处为GAP。',19,C.red);
flow+=txt(60,1095,'当前图为实现提取与缺口说明；摄影5秒、显影至少12秒，不能边拍边驾驶。',19);
flow+=footer();
for(const [name,svg] of [['level-01-top-view',plan],['level-01-circulation',flow]])await writeFile(`${out}/${name}.svg`,svg);
const browser=await chromium.launch({channel:'msedge',headless:true});
try {const page=await browser.newPage({viewport:{width:1800,height:1240},deviceScaleFactor:1.5});for(const [name,svg] of [['level-01-top-view',plan],['level-01-circulation',flow]]){await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);await page.screenshot({path:`${out}/${name}.png`});}}finally{await browser.close();}
console.log(out);
