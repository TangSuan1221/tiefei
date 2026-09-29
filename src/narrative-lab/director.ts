import type {Candidate,StoryState} from './types';
/** The director may reorder legal proposals, never commit or reveal hidden effects. */
export function rankCandidates(state:StoryState,candidates:Candidate[]){
 return candidates.filter(c=>c.allowed).map((candidate,index)=>{
  let score=10-index*.01;const reasons=['前置条件与动作互斥已通过'];
  // Affordability is public telemetry, unlike hidden contamination or identity.
  const energy=candidate.choice.instructions.filter(e=>e.path==='pod.power'&&e.op==='add').reduce((n,e)=>n+Number(e.value),0);
  if(state.pod.power<.35){score+=energy*100;reasons.push('低电量：优先保留摄影与返程余量');}
  const hull=candidate.choice.instructions.filter(e=>e.path==='pod.hull'&&e.op==='add').reduce((n,e)=>n+Number(e.value),0);
  if(state.pod.hull<.65){score+=hull*150;reasons.push('艇壳受损：优先降低进一步损伤');}
  if(state.player.stress>60){score-=Math.max(0,-energy)*20;reasons.push('高压力：减少额外资源负担');}
  return {...candidate,score,reasons};
 }).sort((a,b)=>b.score-a.score);
}
