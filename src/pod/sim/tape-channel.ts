import type { TapeRecord } from './run';

/** Remote story calls, including saves predating callSeen. */
export const isVideoCall = (t: TapeRecord | null | undefined): boolean =>
  !!t && (t.callSeen !== undefined || /^[a-z]+\.task\./.test(t.id));

/** An unwatched story call never previews its content: the archive shows only who is calling. */
export const STORY_CALL_TITLE = '视频通讯';
export const pendingCallName = (caller: string) => caller + ' · ' + STORY_CALL_TITLE;

/** Saved metadata and thumbnails are not proof of playable media in this session. */
export function callMediaReady(t: TapeRecord | null | undefined, hasPlaylist: (key:string)=>boolean): boolean {
  return !!t && t.ready !== false && t.videoResult === 'video' && !t.creatureMissing && !!t.cacheKey && hasPlaylist(t.cacheKey);
}
export function pendingMediaObjective(t:TapeRecord|undefined, hasPlaylist:(key:string)=>boolean, retryable=false):string {
  if(callMediaReady(t,hasPlaylist))return '收到视频呼叫 · 分析台【通讯】接听并完整播放';
  return retryable?'视频尚未就绪 · 分析台【通讯】可重试接收':'视频呼叫接入中 · 分析台【通讯】接听后等待信号连接';
}
