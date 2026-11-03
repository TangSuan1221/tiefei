import {isLocalNoVideoMode} from '../net/no-video-mode';
import type {TapeRecord} from './run';
import {useHarborLocalVideo,harborLocalVideoKey} from '../content/harbor-local-videos';
// Playback acknowledgement is session-local: an unfinished call must be watched after reload.
const opened=new WeakSet<TapeRecord>(),finished=new WeakSet<TapeRecord>();
/** Story calls whose content only counts once answered and watched to the end (chapter one and two). */
export const isHarborOpening=(t: TapeRecord|null|undefined):t is TapeRecord=>!!t&&(t.id==='harbor.task.L1-E01'||t.id.startsWith('harbor.task.L1-R28-')||t.id.startsWith('living.task.'));
export const harborOpeningOpened=(t:TapeRecord)=>opened.has(t);
export const harborOpeningFinished=(t:TapeRecord)=>finished.has(t);
export function openHarborCall(t:TapeRecord){opened.add(t);}
export function finishHarborCall(t:TapeRecord){if(opened.has(t))finished.add(t);}
/** Only registered supplied movies may use a fixed-media key; photos never qualify. */
export function isHarborTaskMedia(t:TapeRecord,id:string):boolean {
 const e=t.siteEvidence as {harborTask?:string;generated?:boolean}|undefined;
 if(t.id!=='harbor.task.'+id||t.ready===false||t.videoResult!=='video'||e?.harborTask!==id)return false;
 return e.generated===true&&!!t.cacheKey?.startsWith('harbor-task:'+id+':')
  ||useHarborLocalVideo(id,isLocalNoVideoMode())&&t.cacheKey===harborLocalVideoKey(id);
}
