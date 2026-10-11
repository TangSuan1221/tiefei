import assert from 'node:assert/strict';
import {PodRun} from '../src/pod/sim/run';
import type {AuthoredSite} from '../src/pod/sim/authored-site';
import {PilotMotion} from '../src/pod/sim/pilot';

const run=new PodRun(20261011);run.phase='site';run.at='camera';run.power=1;
let blockedAttempts=0;
run.authoredSite={index:0,complete:false,evidenceReady:false,description:'',hint:'',
 turn(d:number){if(d!==0)blockedAttempts++;return run.heading;},
 move(){return true;},interact(){},draw(){},drawMap(){},snapshot(){return {};},dispose(){},
} as AuthoredSite;
run.pilot.yawRate=12;
const internal=run as unknown as {tickPilot(dt:number):void};
for(let i=0;i<240;i++){run.clock+=.05;internal.tickPilot(.05);}
assert.equal(blockedAttempts,1,'released residual yaw must not repeatedly invoke unwedging');
assert.equal(run.pilot.yawRate,0);
run.holdPilot(0,1,0);internal.tickPilot(.05);
assert.equal(blockedAttempts,2,'a new deliberate yaw remains available');
const pilot=new PilotMotion();pilot.yawRate=.004;pilot.pitchRate=.004;
for(let i=0;i<20;i++)pilot.step(.05,0,0,0);
assert.equal(pilot.yawRate,0);assert.equal(pilot.pitchRate,0);
console.log('PASS blocked turn absorbs residual yaw; released input cannot repeatedly reverse hull');
