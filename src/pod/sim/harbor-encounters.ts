export interface EncounterStimuli {light:boolean;speed:number;noise:number;collision:boolean;interaction:boolean;story:boolean;active:boolean;}
export interface EncounterPressure {pressure:number;cooldown:number;warning:boolean;reason:string;}
export const newEncounterPressure=():EncounterPressure=>({pressure:0,cooldown:12,warning:false,reason:''});
/** Simulation time only. No permit, camera alignment or evidence gates. */
export function advanceEncounter(s:EncounterPressure,i:EncounterStimuli,dt:number):'none'|'warning'|'spawn'{
 dt=Math.max(0,Math.min(dt,.25));
 if(i.active){s.cooldown=75;s.pressure=0;s.warning=false;return 'none';}
 s.cooldown=Math.max(0,s.cooldown-dt);
 if(s.cooldown>0){s.pressure=0;return 'none';}
 const light=i.light?.8:0,motion=Math.abs(i.speed)>.15?.7:0,sound=Math.max(0,i.noise-.12)*1.5;
 s.pressure=Math.max(0,s.pressure+dt*(light+motion+sound-.25));
 if(i.light)s.reason='持续探照光';
 if(motion)s.reason='推进器噪声';
 if(sound>.25)s.reason='外部声音';
 if(i.interaction){s.pressure+=7;s.reason='设施／机械臂作业声';}
 if(i.collision){s.pressure+=12;s.reason='艇体碰撞声';}
 if(i.story){s.pressure=Math.max(s.pressure,19);s.reason='救生舱调查';}
 if(s.pressure>=28){s.pressure=0;s.cooldown=75;s.warning=false;return 'spawn';}
 if(s.pressure>=18&&!s.warning){s.warning=true;return 'warning';}
 if(s.pressure<8)s.warning=false;
 return 'none';
}
