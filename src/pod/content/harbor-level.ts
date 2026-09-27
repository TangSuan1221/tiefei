import type { ExpeditionEdge, ExpeditionItem, ExpeditionLevel, ExpeditionRoom } from './expedition';

export const HARBOR = {
  permit: 'harbor.token.permit', tool: 'harbor.token.repair-tool', power: 'harbor.token.shore-power',
  photo: 'harbor.fact.pod-present', module: 'harbor.evidence.load-module',
  discrepancy: 'harbor.fact.evacuation-discrepancy', card: 'harbor.evidence.employee-card',
  cardAnalyzed: 'harbor.fact.card-analyzed', routeRecord: 'harbor.evidence.diversion',
  route: 'harbor.fact.downward-route', exitReady: 'harbor.token.exit-ready',
  depthReady: 'harbor.token.depth-ready', shortcut: 'harbor.token.shortcut',
  searchComplete: 'harbor.fact.retrieval-complete',
} as const;
const names: Record<string, string> = {
  [HARBOR.permit]: '无线电抵达报告与调查授权', [HARBOR.tool]: '岸电维修工具',
  [HARBOR.power]: '岸电控制修复', [HARBOR.photo]: '救生舱有效录像（分析台核验）',
  [HARBOR.module]: '计量坞载荷模块', [HARBOR.discrepancy]: '录像与载荷曲线比对',
  [HARBOR.card]: '疏散员工卡', [HARBOR.cardAnalyzed]: '员工卡事故档案分析',
  [HARBOR.routeRecord]: '分流井机械改道记录', [HARBOR.route]: '下行路线核验',
  [HARBOR.exitReady]: '出口机构准备', [HARBOR.depthReady]: '耐压、氧、电及推进储备检查',
  [HARBOR.shortcut]: '港务侧捷径释放',
  [HARBOR.searchComplete]: '行李检修廊疏散记录检索完成',
};
export const harborRequirementName = (token: string): string => names[token] ?? token;
export const HARBOR_EXIT_REQUIREMENTS = [HARBOR.photo, HARBOR.module, HARBOR.discrepancy,
  HARBOR.card, HARBOR.cardAnalyzed, HARBOR.routeRecord, HARBOR.searchComplete, HARBOR.route, HARBOR.exitReady, HARBOR.depthReady];

/** All item x/z are room-relative, as in legacy expeditions. No photo fact is item-granted. */
export function createHarborLevel(): ExpeditionLevel {
  const specs: [string,string,number,number,number,number,number,number,number][] = [
    ['A','检查气闸',11,10,22,20,0,7,0], ['B','倒悬主港',60,20,56,40,0,24,1],
    ['C','岸电维修湾',11,40,22,20,0,8,0], ['D','登船计量坞',44,61,24,18,-8,9,1],
    ['E','行李检修廊',77,61,22,18,-8,6,2], ['F','下沉货仓',60,93,56,22,-20,14,2],
    ['G','撤离分流井',113,63,26,22,-8,16,3], ['H','港务记录侧湾',113,20,26,40,0,10,2],
    ['I','下潜准备坞',113,94,26,20,-20,12,3],
  ];
  const rid = (s: string) => `harbor.room.${s}`;
  const rooms: ExpeditionRoom[] = specs.map(([s,name,x,z,width,depth,elevation,ceiling,sector]) =>
    ({id:rid(s),name,x,z,width,depth,elevation,floorY:elevation-3,ceiling,sector,
      role:s==='B'?'hall':s==='F'||s==='H'?'branch':'chamber'}));
  const edges: ExpeditionEdge[] = [];
  const edge = (a:string,b:string,path:[number,number,number][],requires:string[]=[]) => edges.push({
    id:`harbor.edge.${a}-${b}`,from:rid(a),to:rid(b),width:path.length>6?9:7,ceiling:6,path,requires,
    ...(requires.length?{lock:`${a}—${b}通道`}:{}),
  });
  // Offset pressure passages reveal the next room progressively. Half-metre
  // samples keep the volumetric shell bounded and preserve shared sonar geometry.
  const bend=(a:[number,number,number],b:[number,number,number],c:[number,number,number],d:[number,number,number])=>Array.from({length:9},(_,i)=>{
    const t=i/8,u=1-t;return a.map((v,k)=>Math.round((u*u*u*v+3*u*u*t*b[k]+3*u*t*t*c[k]+t*t*t*d[k])*2)/2) as [number,number,number];
  });
  edge('A','C',[[11,0,20],...bend([11,0,22],[11,0,26],[18,0,25],[18,0,29]),[18,0,30]],[HARBOR.permit]);
  edge('A','B',[[22,0,10],[32,0,10]],[HARBOR.power]);
  edge('C','B',[[22,0,35],[32,0,35]],[HARBOR.power]);
  edge('B','D',[[44,0,40],...bend([44,0,42],[44,-2,46],[49,-6,46],[49,-8,50]),[49,-8,52]]);
  edge('D','E',[[56,-8,61],[66,-8,61]],[HARBOR.discrepancy]);
  edge('E','G',bend([88,-8,63],[94,-8,63],[94,-8,68],[100,-8,68]));
  edge('B','H',bend([88,0,20],[93,0,20],[95,0,26],[100,0,26]));
  edge('H','G',[[113,0,40],[113,0,42],[113,-8,50],[113,-8,52]],[HARBOR.shortcut]);
  edge('D','F',[[44,-8,70],[44,-8,72],[44,-20,80],[44,-20,82]]);
  edge('E','F',[[77,-8,70],[77,-8,72],[77,-20,80],[77,-20,82]]);
  edge('G','I',[[113,-8,74],[113,-8,76],[113,-20,82],[113,-20,84]],[HARBOR.route]);
  const items: ExpeditionItem[] = [];
  const item = (id:string,r:string,kind:ExpeditionItem['kind'],name:string,grants:string[]=[],requires:string[]=[],x=0,z=0) =>
    items.push({id:`harbor.item.${id}`,room:rid(r),kind,name,grants,requires,x,z,
      description:kind==='cache'?'完整机械臂翻找，收妥后入库；箱体保留。':`${name}；重复操作不重复发放。`});
  // Permit/depth readiness are external validated events, not F-key terminals.
  item('tools','C','cache','岸电维修工具箱',[HARBOR.tool],[HARBOR.permit],-5,3);
  item('power','C','terminal','岸电控制箱',[HARBOR.power],[HARBOR.tool],5,-3);
  item('load-module','D','pickup','计量坞载荷模块',[HARBOR.module],[],4,-3);
  item('broadcast','E','terminal','疏散记录检索（将接通外放）',['harbor.event.broadcast-started'],[HARBOR.discrepancy],-5,-3);
  item('employee-card','E','pickup','疏散员工卡',[HARBOR.card],[],4,2);
  item('diversion','G','record','分流井机械改道记录',[HARBOR.routeRecord],[],-5,-3);
  item('port-record','H','record','原始港务回执',['harbor.evidence.port-record'],[],5,-4);
  item('shortcut','H','terminal','港务侧捷径释放',[HARBOR.shortcut],[],0,14);
  item('cargo-near','F','cache','货仓入口维修余量',['harbor.supply.repair'],[],-16,-5);
  item('cargo-deep','F','cache','深处封存补给',['harbor.supply.reserve'],[],15,5);
  item('exit-mechanism','I','terminal','出口机构准备',[HARBOR.exitReady],[HARBOR.route],5,-2);
  item('exit','I','exit','确认下潜至生活区',[],[...HARBOR_EXIT_REQUIREMENTS],0,5);
  return {id:'harbor.1',index:0,name:'坠落接驳港',description:'核对倒悬救生舱，追查中断的撤离，准备向生活区下潜。',
    rooms,edges,items,spawn:[11,10],startRoom:rid('A'),exitRoom:rid('I'),stages:[
      {id:'harbor.stage.power',name:'报告抵达并恢复岸电',objectives:['harbor.item.tools'],terminal:'harbor.item.power',grants:HARBOR.power},
      {id:'harbor.stage.evidence',name:'曝光并到分析台比对载荷',objectives:['harbor.item.load-module'],terminal:'harbor.item.load-module',grants:HARBOR.discrepancy},
      {id:'harbor.stage.route',name:'分析员工卡并核验下行路线',objectives:['harbor.item.employee-card','harbor.item.diversion'],terminal:'harbor.item.diversion',grants:HARBOR.route},
      {id:'harbor.stage.departure',name:'检查耐压与储备并确认下潜',objectives:['harbor.item.exit-mechanism'],terminal:'harbor.item.exit-mechanism',grants:HARBOR.exitReady},
    ]};
}
