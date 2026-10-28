import type {TapeRecord} from './run';
// Playback acknowledgement is session-local: an unfinished call must be watched after reload.
const opened=new WeakSet<TapeRecord>(),finished=new WeakSet<TapeRecord>();
export const isHarborOpening=(t: TapeRecord|null|undefined):t is TapeRecord=>t?.id==='harbor.task.L1-E01';
export const harborOpeningOpened=(t:TapeRecord)=>opened.has(t);
export const harborOpeningFinished=(t:TapeRecord)=>finished.has(t);
export function openHarborCall(t:TapeRecord){opened.add(t);}
export function finishHarborCall(t:TapeRecord){if(opened.has(t))finished.add(t);}
