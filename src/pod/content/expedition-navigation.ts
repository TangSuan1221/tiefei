import { canOpenDoor, expeditionDoorPosition, type ExpeditionLevel, type ExpeditionRoom, type ExpeditionState } from './expedition';

export const LANDMARK_NAMES = ['断轴采矿悬架','三向汇流阀树','矿物烟囱换热器','空置补给转盘','倾斜防护叶轮','黑水观察肋窗','象牙承压升降环'] as const;
export function roomAddress(room:ExpeditionRoom){return `${'ABCD'[room.sector]}-${String(Number(room.id.match(/r(\d+)$/)?.[1]??0)+1).padStart(2,'0')}`;}
export interface ExpeditionNavigation {
  current:string; target:string; item:string; path:string[];
  next:string; x:number; z:number; distance:number; remaining:number; relativeAngle:number;
}
/** Facility plans provide addresses, never hidden item contents or completed prerequisites. */
export function expeditionNavigation(level:ExpeditionLevel,state:ExpeditionState,x:number,z:number,yaw:number):ExpeditionNavigation|null{
  if(state.completed||state.version!==1||state.levelId!==level.id||![x,z,yaw].every(Number.isFinite))return null;
  const rooms=new Map(level.rooms.map(r=>[r.id,r]));
  const stage=level.stages.find(s=>!state.inventory.includes(s.grants));
  const outstanding=stage?.objectives.filter(id=>!state.collected.includes(id))??[];
  const ids=stage?(outstanding.length?outstanding:[stage.terminal]):level.items.filter(i=>i.kind==='exit').map(i=>i.id);
  const links=level.edges.flatMap(edge=>{
    const a=rooms.get(edge.from),b=rooms.get(edge.to);
    return a&&b?[{edge,a,b,length:Math.hypot(a.x-b.x,a.z-b.z)}]:[];
  });
  // Permission reachability replaces sector-number/coordinate guesses. An unopened
  // permitted door remains a route target, but never a license to cross its leaf.
  const reachable=new Set<string>([level.startRoom]);
  for(let changed=true;changed;){
    changed=false;
    for(const {edge,a,b} of links){
      if(!canOpenDoor(level,state,edge.id))continue;
      if(reachable.has(a.id)&&!reachable.has(b.id)){reachable.add(b.id);changed=true;}
      if(reachable.has(b.id)&&!reachable.has(a.id)){reachable.add(a.id);changed=true;}
    }
  }
  const containing=level.rooms.find(r=>reachable.has(r.id)&&Math.abs(x-r.x)<=r.width/2&&Math.abs(z-r.z)<=r.depth/2);
  const distances=new Map<string,number>(),previous=new Map<string,string>();
  let corridor:typeof links[number]|undefined;
  if(containing)distances.set(containing.id,0);
  else{
    // Locate the actual corridor, not a nearby room across a wall. Seed only the
    // side of a closed leaf occupied by the player; do not flip rooms at halfway.
    corridor=links.filter(({a,b,edge,length})=>{
      if(!length||(!reachable.has(a.id)&&!reachable.has(b.id)))return false;
      return Math.abs(a.z-b.z)<1e-5
        ? Math.abs(z-a.z)<=edge.width/2&&x>=Math.min(a.x,b.x)&&x<=Math.max(a.x,b.x)
        : Math.abs(a.x-b.x)<1e-5&&Math.abs(x-a.x)<=edge.width/2&&z>=Math.min(a.z,b.z)&&z<=Math.max(a.z,b.z);
    }).sort((u,v)=>{
      const offset=(l:typeof u)=>Math.abs(l.a.z-l.b.z)<1e-5?Math.abs(z-l.a.z):Math.abs(x-l.a.x);
      return offset(u)-offset(v);
    })[0];
    if(!corridor)return null;
    const {a,b,edge,length}=corridor,dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
    const progress=(x-a.x)*dx+(z-a.z)*dz;
    const [doorX,doorZ]=expeditionDoorPosition(a,b);
    const doorProgress=(doorX-a.x)*dx+(doorZ-a.z)*dz;
    const open=canOpenDoor(level,state,edge.id)&&state.opened.includes(edge.id);
    if(reachable.has(a.id)&&(open||progress<=doorProgress))distances.set(a.id,Math.hypot(x-a.x,z-a.z));
    if(reachable.has(b.id)&&(open||progress>doorProgress))distances.set(b.id,Math.hypot(x-b.x,z-b.z));
  }
  const pending=new Set(reachable);
  while(pending.size){
    let id:string|undefined,best=Infinity;
    for(const candidate of pending)if((distances.get(candidate)??Infinity)<best){id=candidate;best=distances.get(candidate)!;}
    if(!id)break;pending.delete(id);
    for(const {edge,a,b,length} of links){
      const to=a.id===id?b:b.id===id?a:undefined;
      if(!to||!pending.has(to.id)||!canOpenDoor(level,state,edge.id))continue;
      // Starting inside this corridor, crossing its door costs the remaining run,
      // not an artificial detour back to the source-room center.
      const step=corridor?.edge.id===edge.id&&!previous.has(id)?Math.hypot(x-to.x,z-to.z):best+length;
      if(step<(distances.get(to.id)??Infinity)){distances.set(to.id,step);previous.set(to.id,id);}
    }
  }
  const cost=(item:typeof level.items[number])=>{
    const room=rooms.get(item.room);if(!room)return Infinity;
    return containing?.id===room.id?Math.hypot(room.x+item.x-x,room.z+item.z-z):(distances.get(room.id)??Infinity)+Math.hypot(item.x,item.z);
  };
  const item=level.items.filter(i=>ids.includes(i.id)).sort((a,b)=>cost(a)-cost(b))[0];
  if(!item||!Number.isFinite(cost(item)))return null;
  const destination=rooms.get(item.room)!,path=[destination.id];
  while(previous.has(path[0]))path.unshift(previous.get(path[0])!);
  const current=rooms.get(path[0])!,next=rooms.get(path[1]??path[0])!;
  let tx=destination.x+item.x,tz=destination.z+item.z;
  const nextLink=links.find(({a,b})=>(a.id===current.id&&b.id===next.id)||(b.id===current.id&&a.id===next.id));
  if(corridor&&corridor.edge.id!==nextLink?.edge.id){
    // First regain the selected endpoint room through its real mouth before
    // turning toward another exit (or the item); diagonal shortcuts hit walls.
    const other=corridor.a.id===current.id?corridor.b:corridor.a;
    tx=current.x+Math.sign(other.x-current.x)*current.width/2;
    tz=current.z+Math.sign(other.z-current.z)*current.depth/2;
  }else if(nextLink){
    const dx=Math.sign(next.x-current.x),dz=Math.sign(next.z-current.z);
    tx=current.x+dx*current.width/2;tz=current.z+dz*current.depth/2;
    if(corridor||Math.hypot(tx-x,tz-z)<1.4){
      [tx,tz]=state.opened.includes(nextLink.edge.id)?[next.x,next.z]:expeditionDoorPosition(current,next);
    }
  }
  const angle=Math.atan2(-(tx-x),-(tz-z))-yaw;
  return{current:current.id,target:destination.id,item:item.id,path,next:next.id,x:tx,z:tz,
    distance:Math.hypot(tx-x,tz-z),remaining:cost(item),relativeAngle:Math.atan2(Math.sin(angle),Math.cos(angle))};
}
