import assert from 'node:assert/strict';
import test from 'node:test';
import { Box3, Mesh, Vector3 } from 'three';
import { createExpedition, newExpeditionState, expeditionDoorPosition } from '../src/pod/content/expedition';
import { createReferenceMaterials } from '../src/pod/view/deepsea/reference-materials';
import { createExpeditionWorld } from '../src/pod/view/deepsea/expedition-world';

test('seven physical facilities have traversable connections, solid doors and reusable resources', async t=>{
  const materials=createReferenceMaterials();
  try{
    for(let index=0;index<7;index++)await t.test(`level ${index+1}: actual room/corridor unions match collision and content`,t=>{
      const level=createExpedition(index),world=createExpeditionWorld(level,materials),state=newExpeditionState(level);
      try{
        world.update(state,0);world.root.updateMatrixWorld(true);
        assert.equal(world.doors.size,level.edges.length);assert.equal(world.interactables.size,level.items.length);
        assert.ok(world.colliders.length>level.rooms.length);assert.equal(world.walkable.length,level.rooms.length+level.edges.length);
        for(const b of [...world.colliders,...world.walkable,...[...world.doors.values()].map(d=>d.bounds)]){
          assert.ok(!b.isEmpty());assert.ok([...b.min.toArray(),...b.max.toArray()].every(Number.isFinite));
        }
        const solids=world.colliders.map(b=>b.clone().expandByScalar(.28));
        function assertClear(p:Vector3,label:string){
          assert.ok(!solids.some(b=>b.containsPoint(p)),`${label}: static solid blocks route at ${p.toArray()}`);
          for(const [dx,dz] of [[0,0],[.28,0],[-.28,0],[0,.28],[0,-.28]])assert.ok(world.walkable.some(b=>b.containsPoint(p.clone().add(new Vector3(dx,0,dz)))),`${label}: missing walkable seam`);
        }
        for(const edge of level.edges){
          const a=level.rooms.find(r=>r.id===edge.from)!,b=level.rooms.find(r=>r.id===edge.to)!;
          const steps=Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.5);
          for(let n=0;n<=steps;n++)assertClear(new Vector3(a.x+(b.x-a.x)*n/steps,0,a.z+(b.z-a.z)*n/steps),edge.id);
          const [doorX,doorZ]=expeditionDoorPosition(a,b);
          assert.ok(world.doors.get(edge.id)!.bounds.containsPoint(new Vector3(doorX,0,doorZ)),`${edge.id}: closed door must block centreline`);
        }
        for(const item of level.items){
          const object=world.interactables.get(item.id)!;
          const target=object.getWorldPosition(new Vector3()),approach=target.clone().add(new Vector3(0,0,2));
          approach.y=Math.max(-1.25,Math.min(2.75,approach.y));
          assert.ok(approach.distanceTo(target)<=3.4,`${item.id}: actual target within reach`);
          assertClear(approach,item.id);
          assert.equal(object.userData.interactionId,item.id);
          assert.ok(!new Box3().setFromObject(object).isEmpty());
        }
        let triangles=0;
        world.root.traverse(object=>{if(object instanceof Mesh){
          const p=object.geometry.getAttribute('position');assert.ok(p.count>0);
          for(const value of p.array)assert.ok(Number.isFinite(value));
          triangles+=(object.geometry.index?.count??p.count)/3;
        }});
        t.diagnostic(`level ${index+1}: ${triangles} actual triangles; budget < 2000000`);
        assert.ok(triangles<2_000_000,`geometry budget exceeded: ${triangles}`);
        // Saved opened doors snap to their open state on a fresh world, not re-blocking the route.
        const second=createExpeditionWorld(level,materials);
        try{state.opened.push(...level.edges.map(e=>e.id));second.update(state,0);
          for(const d of second.doors.values())assert.ok(d.mesh.children.some(child=>!child.visible),'saved door leaf not open');
        }finally{second.dispose();}
      }finally{world.dispose();world.dispose();assert.equal(world.root.children.length,0);}
    });
  }finally{materials.dispose();}
});
