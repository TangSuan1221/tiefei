import type { TapeRecord } from './run';

/** Remote story calls, including saves predating callSeen. */
export const isVideoCall = (t: TapeRecord | null | undefined): boolean =>
  !!t && (t.callSeen !== undefined || /^[a-z]+\.task\./.test(t.id));

/** An unwatched story call never previews its content: the archive shows only who is calling. */
export const STORY_CALL_TITLE = '视频通讯';
export const pendingCallName = (caller: string) => caller + ' · ' + STORY_CALL_TITLE;
