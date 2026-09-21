/** Authored functional plans. Coordinates are metres, not reskinned copies of a grid. */
export const EXPEDITION_LAYOUTS = [
  { concept:'矿筛输送环与卸料返程', turn:0, points:[[0,0],[32,0],[128,0],[0,-44],[32,-44],[128,-44],[80,-44]], links:[[0,1],[1,2],[0,3],[3,4],[4,6],[6,5],[5,2],[1,4]], hall:[28,20,6.5], entry:[12,14,4.5], labels:['卸矿接驳台','矿筛输送大厅','提升机控制间','碎矿回收间','输送带检修间','卸料称重间','破口取样台'] },
  { concept:'中央汇流枢纽与三路尽端检修', turn:1, points:[[0,0],[52,0],[104,0],[0,38],[52,44],[104,38],[52,-46]], links:[[0,1],[1,2],[0,3],[1,4],[2,5],[1,6]], hall:[22,36,6], entry:[14,12,4.5], labels:['进水缓冲舱','主泵汇流厅','出水调压室','过滤器侧舱','泄压罐间','止回阀室','旧管线盲端'] },
  { concept:'冷热分离折线与取样回路', turn:3, points:[[0,0],[0,-42],[126,0],[42,-42],[42,0],[84,0],[84,42]], links:[[0,1],[1,3],[3,4],[4,5],[5,2],[5,6],[0,4]], hall:[24,28,7.5], entry:[10,16,4], labels:['冷端隔离间','矿物换热大厅','冷却出口控制室','隔热维护间','样本清洗间','计时仪器间','热泉取样盲舱'] },
  { concept:'公共配给中庭与生活舱回环', turn:0, points:[[0,0],[48,0],[96,0],[0,36],[48,36],[96,36],[48,72]], links:[[0,1],[1,2],[0,3],[3,4],[4,5],[5,2],[4,6],[1,4]], hall:[28,22,4.5], entry:[16,12,4], labels:['更衣接驳区','配给公共餐厅','配给登记室','个人储物间','医务分诊间','封存仓库','无人值班宿舱'] },
  { concept:'双机列之间的双回路维护路线', turn:1, points:[[0,0],[42,0],[126,0],[0,-48],[42,-48],[126,48],[42,48]], links:[[0,1],[1,2],[0,3],[3,4],[4,1],[1,6],[6,5],[5,2]], hall:[26,44,8], entry:[12,18,5], labels:['电缆接入舱','双列动力机厅','主配电控制室','润滑泵间','西侧风道检修间','冷却回水间','东侧轴承观察台'] },
  { concept:'沿黑水窗连续转向的观测折返', turn:2, points:[[0,0],[0,48],[132,0],[44,48],[44,0],[88,0],[88,-48]], links:[[0,1],[1,3],[3,4],[4,5],[5,2],[5,6]], hall:[40,18,6], entry:[10,18,4.5], labels:['暗适应气闸','黑水长窗观测厅','井口导航室','声学接收间','窗背维护间','低功率仪器间','井壁末端观察舱'] },
  { concept:'偏轴串联气闸逐层揭示承压核心', turn:3, points:[[0,0],[48,0],[144,0],[0,-44],[48,-44],[144,44],[48,44]], links:[[0,3],[3,4],[4,1],[1,6],[6,5],[5,2]], hall:[32,32,8.5], entry:[18,12,4.5], labels:['粗糙检修入口','承压核心前厅','升降交接承台','第一隔离气闸','第二隔离气闸','图案锁复核间','驳船符号观察口'] },
] as const;

export function expeditionPlan(index:number,sector:number){
  // Render-reviewed human scale: large facilities need dense working spaces,
  // not warehouse-sized empty rooms. Connections retain their authored lengths.
  const plan=EXPEDITION_LAYOUTS[index];
  const mirror=sector%2===0?1:-1;
  const rotate=(x:number,z:number):[number,number]=>plan.turn===1?[-z,x]:plan.turn===2?[-x,-z]:plan.turn===3?[z,-x]:[x,z];
  const stride=Math.max(...plan.points.map(p=>p[0]))+64;
  return {plan,points:plan.points.map(([x,z])=>rotate(x+sector*stride,z*mirror)),swap:plan.turn%2===1,
    rotate,ceiling:(n:number)=>n===1?plan.hall[2]:n===0?plan.entry[2]:[4.2,4,5.2,4,5.5,4.4,6][index]+(index===6&&n===2?1:0)};
}
