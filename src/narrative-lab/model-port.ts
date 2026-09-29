import type {StoryEngine} from './engine';
/** Prompt payload excludes hidden world truth, unrevealed results and other NPC knowledge. */
export function publicProposalContext(engine:StoryEngine){
 const state=engine.snapshot();
 return {sceneId:engine.scene.id,phase:state.phase,epoch:state.epoch,player:state.player,pod:state.pod,
  knownFacts:state.knowledge.player,relationships:state.relations,
  candidates:engine.getChoices().filter(c=>c.allowed).map(c=>({id:c.id,label:c.choice.label})),
  instruction:'Return only a candidate id. Do not generate facts, dialogue, effects or choices.'};
}
export type ModelProposal=(context:ReturnType<typeof publicProposalContext>,signal:AbortSignal)=>Promise<unknown>;
/** Optional provider injection. No network or key configured by default. Never acts for player. */
export async function proposeWithModel(engine:StoryEngine,provider:ModelProposal,timeoutMs=2500){
 const context=publicProposalContext(engine),controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('proposal timeout'));},Math.max(1,Math.min(timeoutMs,10000)));});
  const response=await Promise.race([provider(context,controller.signal),timeout]);
  const now=engine.snapshot();
  if(now.epoch!==context.epoch||now.phase!==context.phase||engine.scene.id!==context.sceneId)return {source:'stale-discarded' as const,candidate:engine.chooseCandidate()};
  const id=typeof response==='string'?response:undefined;
  const legal=engine.getChoices().some(c=>c.allowed&&c.id===id);
  return {source:legal?'model' as const:'fallback' as const,candidate:engine.chooseCandidate(id)};
 }catch{return {source:'fallback' as const,candidate:engine.chooseCandidate()};}
 finally{if(timer)clearTimeout(timer);controller.abort();}
}
