import type {Campaign,Condition} from './types';
function reads(c:Condition|undefined,path:string):boolean{return !!c&&('all'in c?c.all.some(x=>reads(x,path)):'any'in c?c.any.some(x=>reads(x,path)):c.path===path);}
/** Structural gate, complemented by reachable-route tests and authored reviews. */
export function auditBranches(campaign:Campaign):string[]{
 if(campaign.branchPolicy!=='causal-v1')return [];
 const errors:string[]=[];
 for(const [index,scene]of campaign.scenes.entries()){
  const axes=scene.branchAxes??[],primary=scene.choices.filter(c=>!c.recovery);
  if(!axes.length||primary.length<2)errors.push(scene.id+': 缺少物质后果轴或真实选择');
  const signatures=new Set<string>();
  for(const c of primary){
   const effects=c.instructions.filter(e=>axes.includes(e.path));
   if(!effects.length)errors.push(scene.id+'/'+c.id+': 只有资源/措辞变化，没有声明的世界后果');
   const key=JSON.stringify(effects.slice().sort((a,b)=>a.path.localeCompare(b.path)));
   if(signatures.has(key))errors.push(scene.id+'/'+c.id+': 主分支写入相同后果');signatures.add(key);
   if(!c.resultText||!c.evidence.length||!c.consequence)errors.push(scene.id+'/'+c.id+': 缺少可见结果');
  }
  for(const axis of axes){
   if(!axis.startsWith('world.')||!(axis.slice(6)in campaign.initialWorld))errors.push(scene.id+': 无效后果轴 '+axis);
   const consumed=campaign.scenes.slice(index).some(s=>s.continuity?.some(v=>reads(v.condition,axis))||s.choices.some(c=>reads(c.condition,axis))||s.resolutions.some(r=>reads(r.condition,axis)))||campaign.endings.some(e=>reads(e.condition,axis));
   if(!consumed)errors.push(scene.id+': '+axis+' 未被后续条件/现场消费');
   if(scene.resolutions.some(r=>!r.condition&&r.instructions.some(e=>e.path===axis)))errors.push(scene.id+': 无条件后续决策覆盖 '+axis);
  }
  for(const c of scene.choices)if(c.recovery&&!c.condition)errors.push(scene.id+'/'+c.id+': 补救没有前置条件');
 }
 return errors;
}
