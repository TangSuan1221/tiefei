/** User-supplied finished movies, matched by exact task ID. */
export const HARBOR_LOCAL_VIDEO_IDS = [
 'L1-R28-V01','L1-R28-V02','L1-R28-V02A','L1-R28-V03',
 'L1-R28-V03A','L1-R28-V04','L1-R28-V04R-STORED',
] as const;
export const HARBOR_LOCAL_VIDEOS:Readonly<Partial<Record<string,string>>> = Object.fromEntries(
 HARBOR_LOCAL_VIDEO_IDS.map(id=>[id,`/assets/harbor/task-videos/${id}.mp4`]),
);
export const harborLocalVideoKey=(id:string)=>'harbor-fixed:'+id+':2026-11-02';

/** Supplied task movies take precedence over generation in every playback mode. */
export const useHarborLocalVideo=(id:string,_noVideo:boolean)=>!!HARBOR_LOCAL_VIDEOS[id];
