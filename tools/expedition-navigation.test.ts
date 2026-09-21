import test from 'node:test';import assert from 'node:assert/strict';
import {createExpedition,newExpeditionState,interactExpedition,canOpenDoor,expeditionDoorPosition} from '../src/pod/content/expedition';
import {expeditionNavigation,roomAddress,LANDMARK_NAMES} from '../src/pod/content/expedition-navigation';
test('seven landmarks and 28 unique room addresses per level',()=>{assert.equal(new Set(LANDMARK_NAMES).size,7);for(let i=0;i<7;i++){const l=createExpedition(i);assert.equal(new Set(l.rooms.map(roomAddress)).size,28);}});
test('all authored door planes remain outside every room',()=>{
  for(let index=0;index<7;index++){
    const level=createExpedition(index);
    for(const edge of level.edges){
      const a=level.rooms.find(r=>r.id===edge.from)!,b=level.rooms.find(r=>r.id===edge.to)!;
      const [x,z]=expeditionDoorPosition(a,b);
      const [reverseX,reverseZ]=expeditionDoorPosition(b,a);
      assert.ok(Math.hypot(reverseX-x,reverseZ-z)<1e-8);
      for(const room of level.rooms)assert.ok(
        Math.abs(x-room.x)>room.width/2||Math.abs(z-room.z)>room.depth/2,
        `${edge.id}: door must be outside ${room.id}`);
    }
  }
});
test('unequal rooms: both approaches in all four directions target the actual closed leaf',()=>{
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])for(const reverseEdge of [false,true]){
    const level=createExpedition(0),a={...level.rooms[0],x:0,z:0,width:6,depth:6},
      b={...level.rooms[1],x:dx*24,z:dz*24,width:30,depth:30};
    level.rooms=[a,b];level.edges=[{id:'test-door',from:reverseEdge?b.id:a.id,to:reverseEdge?a.id:b.id,width:4}];
    const [doorX,doorZ]=expeditionDoorPosition(a,b);
    assert.ok(Math.hypot(doorX-(a.x+b.x)/2,doorZ-(a.z+b.z)/2)>1,'fixture must expose the old center-midpoint bug');
    for(const side of [-1,1]){
      const source=side<0?a:b,target=side<0?b:a;
      const item={...level.items[0],id:'goal',room:target.id,x:0,z:0,requires:[]};
      level.items=[item];level.stages=[{id:'stage',name:'test',objectives:['goal'],terminal:'goal',grants:'permit'}];
      const state=newExpeditionState(level),x=doorX+dx*side*.75,z=doorZ+dz*side*.75;
      const navigation=expeditionNavigation(level,state,x,z,0)!;
      assert.ok(navigation);assert.equal(navigation.current,source.id);
      assert.ok(Math.hypot(navigation.x-doorX,navigation.z-doorZ)<1e-8);
      state.opened.push('test-door');
      const opened=expeditionNavigation(level,state,x,z,0)!;
      assert.ok(opened);assert.ok(Math.hypot(opened.x-doorX,opened.z-doorZ)>1);
    }
  }
});
for(let i=0;i<7;i++)test(`navigation ${i+1}: prerequisites, terminal returns, doorway steering and completion`,()=>{
  const l=createExpedition(i),s=newExpeditionState(l);
  for(const stage of l.stages){
    for(const id of stage.objectives){const item=l.items.find(v=>v.id===id)!,r=l.rooms.find(v=>v.id===item.room)!;const n=expeditionNavigation(l,s,r.x,r.z,0)!;
      assert.ok(n);assert.equal(n.item,id);assert.equal(n.path.length,1);assert.ok(Number.isFinite(n.relativeAngle));
      assert.ok(interactExpedition(l,s,id).ok);
    }
    const r=l.rooms.find(v=>v.id===l.items.find(v=>v.id===stage.objectives[1])!.room)!;
    const n=expeditionNavigation(l,s,r.x,r.z,0)!;assert.equal(n.item,stage.terminal);
    for(let p=1;p<n.path.length;p++){const e=l.edges.find(e=>[e.from,e.to].includes(n.path[p])&&[e.from,e.to].includes(n.path[p-1]))!;assert.ok(canOpenDoor(l,s,e.id));}
    assert.ok(interactExpedition(l,s,stage.terminal).ok);
  }
  const exit=l.items.find(v=>v.kind==='exit')!,r=l.rooms.find(r=>r.id===exit.room)!;assert.equal(expeditionNavigation(l,s,r.x,r.z,0)!.item,exit.id);
  interactExpedition(l,s,exit.id);assert.equal(expeditionNavigation(l,s,r.x,r.z,0),null);
});
