import { Box3, Ray, Vector3 } from 'three';
import { createWhiteboxWorld } from '../src/whitebox/world.ts';
import { harborHullClear, sweepHarborHeading } from '../src/pod/sim/harbor-navigation.ts';

// Static geometry only: this does not exercise rendering, controls or a playthrough.
const world = createWhiteboxWorld();
const gateBox = new Box3(new Vector3(7, 0, -5.3), new Vector3(17, 6.5, -4.7));
let failures = 0;
function result(name: string, ok: boolean, detail: unknown = '') {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`, JSON.stringify(detail));
}
const bearing = (a: Vector3, b: Vector3) => (Math.atan2(b.x-a.x, -(b.z-a.z))*180/Math.PI+360)%360;
const delta = (a:number,b:number) => ((b-a+540)%360)-180;
const closeHeading = (a:number,b:number) => Math.abs(delta(a,b)) < .001;
for (const closed of [false, true]) {
  const solids = closed ? [...world.solids, gateBox] : world.solids;
  const clear = (p:Vector3,h:number) => harborHullClear(p,h,world.walkable,solids);
  const state = closed ? 'gate closed' : 'gate open';
  for (const name of ['start','observe','power','control','rescue','exit']) {
    result(`${state}: ${name} north-facing hull`, clear(world.anchors[name],0));
  }
  for (const [a,b] of [['start','observe'],['observe','power'],['observe','control'],['observe','rescue'],['start','exit']]) {
    for (const [from,to] of [[a,b],[b,a]]) {
      const p=world.anchors[from], q=world.anchors[to], heading=bearing(p,q);
      const count=Math.ceil(p.distanceTo(q)/.08); let firstBlocked:number|null=null;
      for(let i=0;i<=count;i++) if(!clear(p.clone().lerp(q,i/count),heading)){firstBlocked=i/count;break;}
      result(`${state}: ${from} -> ${to} translation`,firstBlocked===null,{heading,firstBlocked});
      for (const [name,point] of [[from,p],[to,q]] as const) {
        const achieved=sweepHarborHeading(0,delta(0,heading),h=>clear(point,h));
        result(`${state}: ${name} turn north -> route`,closeHeading(achieved,heading),{heading,achieved});
      }
    }
  }
  const dock=world.anchors.control;
  const heading=bearing(dock,world.anchors.controlPanel);
  result(`${state}: control panel docking heading`,clear(dock,heading),{heading});
  const achieved=sweepHarborHeading(0,heading,h=>clear(dock,h));
  result(`${state}: control north -> panel sweep`,closeHeading(achieved,heading),{achieved,requested:heading});
}
for (const [name,origin,target] of [
  ['initial creature',world.anchors.observe,new Vector3(3,2,-10)],
  ['contained creature',world.anchors.control,new Vector3(12,2,-10)],
] as const) {
  const ray=new Ray(origin,target.clone().sub(origin).normalize()),distance=origin.distanceTo(target);
  const blocked=world.solids.some(box=>{const hit=ray.intersectBox(box,new Vector3());return hit!==null&&hit.distanceTo(origin)<distance-.3;});
  result(`${name}: static centre sightline`,!blocked,{distance});
}
for (const key of ['power','control','rescue','exit']) {
  const origin=world.anchors[key], target=world.anchors[key+'Panel'];
  const distance=origin.distanceTo(target), heading=bearing(origin,target);
  result(`${key}: panel within real interaction reach`,distance<=3.4,{distance});
  result(`${key}: hull fits while aiming at panel`,harborHullClear(origin,heading,world.walkable,world.solids),{heading});
  const ray=new Ray(origin,target.clone().sub(origin).normalize());
  const blocked=world.solids.some(box=>{
    if(box.containsPoint(target))return false;
    const hit=ray.intersectBox(box,new Vector3());return hit!==null&&hit.distanceTo(origin)<distance-.3;
  });
  result(`${key}: panel has unobstructed interaction ray`,!blocked);
}
console.log(`Static geometry checks complete: ${failures} failure(s). Not a rendered or interactive acceptance test.`);
process.exitCode=failures?1:0;
