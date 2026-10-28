// Diagnostic read-only hook: records creature mode changes with the input that caused them. Does not alter inputs or results.
export default async({page})=>page.evaluate(()=>{
 const l=window.__living,c=l.creatures;if(c.__traced)return 'already';c.__traced=true;window.__ctrace=[];
 const orig=c.tick.bind(c);let prev={};
 c.tick=(dt,input)=>{const r=orig(dt,input);for(const v of c.views){if(prev[v.id]!==v.mode){window.__ctrace.push({t:l.elapsed,id:v.id,from:prev[v.id],to:v.mode,pos:v.position,pod:input.pod,speed:input.speed,pulse:input.pulse,active:input.activePowered,lamp:input.lampOn,bursts:input.noiseBursts});prev[v.id]=v.mode;}}
  if(r.damage>0)window.__ctrace.push({t:l.elapsed,damage:r.damage,events:r.events,speed:input.speed});return r;};
 return 'hooked';
});
