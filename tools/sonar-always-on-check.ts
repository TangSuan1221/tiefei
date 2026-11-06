import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PodRun} from '../src/pod/sim/run';
const r=new PodRun(42);
r.power=1;r.blackout=false;
assert.equal(r.activeSonarEnabled,true);
// Old saves and old callers cannot turn off the removed power switch.
r.activeSonarEnabled=false;r.toggleActiveSonar();
assert.equal(r.activeSonarEnabled,true);
r.stopSonarPulses();assert.equal(r.sonarEmitting,false);
r.toggleSonarPulses();assert.equal(r.sonarEmitting,true);
r.stopSonarPulses();assert.equal(r.sonarEmitting,false);
r.ping(2);assert.equal(r.sonarEmitting,true);
r.stopSonarPulses();assert.equal(r.sonarEmitting,false);
for(const file of ['src/pod/view/stations.ts','src/pod/view/cabin-active-controls.ts','src/pod/view/sonar-desk.ts']){
 assert.ok(!readFileSync(file,'utf8').includes("'nav.active'"),file+' still exposes the removed switch');
}
console.log('PASS always-on sonar: legacy writes, pulses, full-power stop and removed controls');
