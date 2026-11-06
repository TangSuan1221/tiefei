/** Request duration policy, independent of camera mode and story evidence gates. */
export type VideoKind = 'observation' | 'story';
export const VIDEO_DURATION_REVISION = 'whole-dynamic-v1';
export const STORY_VIDEO_MAX_SECONDS = 15;
/** Content-based fallback; callers may supply any supported whole-second duration. */
export function storyVideoDuration(speech = '', action = '', requested?: number): number {
 if(requested !== undefined){
  if(!Number.isInteger(requested)||requested<1||requested>STORY_VIDEO_MAX_SECONDS)throw new RangeError('Story video duration must be an integer from 1 to 15 seconds');
  return requested;
 }
 const chinese=(speech.match(/[\p{Script=Han}]/gu)??[]).length;
 const words=(speech.replace(/[\p{Script=Han}]/gu,' ').match(/[\p{L}\p{N}]+/gu)??[]).length;
 const beats=(action.match(/[.;。；]/g)??[]).length;
 return Math.min(STORY_VIDEO_MAX_SECONDS,Math.max(5,Math.ceil(1+Math.max(chinese/4+words/2.5,beats*1.5))));
}
export function videoDuration(kind:VideoKind,requested?:number):number {
 return kind==='observation'?5:storyVideoDuration('', '', requested);
}
