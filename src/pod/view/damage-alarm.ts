/** Slow emergency beacon; no rapid strobing. Hull is remaining integrity, 0..1. */
export function damageAlarm(hull:number,time:number){
 const level=hull<=.25?2:hull<=.5?1:0;
 const pulse=.5-.5*Math.cos(time*Math.PI*(level===2?1.5:1));
 return {level,intensity:level===0?0:(level===2?3:1.8)+pulse*(level===2?4:2.5)};
}
