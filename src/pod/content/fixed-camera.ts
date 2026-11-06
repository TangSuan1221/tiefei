import {ELIAS_SELFIE_CONTRACT} from './elias-video-atoms';
/** Shared by prompt composition and the actual video submission boundary. */
export const FIXED_CAMERA_CONTRACT = 'CAMERA LOCK: One continuous stationary shot. Keep camera position, rotation, framing and focal length fixed for the entire clip. No pan, tilt, roll, dolly, tracking, orbit, zoom, reframing, drift, shake, impact jolt or cuts. Static structures stay at the same screen coordinates; only subjects, water and particles move. Never follow a subject leaving the frame.';

export const ELIAS_VOICE_CONTRACT = 'ELIAS VOICE: English only; same adult male low baritone, lightly gravelly, neutral American accent in every clip, even under stress. Natural helmet-radio delivery. Faithfully translate Chinese speech sources; preserve facts and uncertainty, read code digits individually. Never speak Mandarin.';

export type VideoCameraMode='fixed'|'elias-selfie';
export function lockVideoCamera(prompt:string,mode:VideoCameraMode='fixed'):string {
 if((mode==='elias-selfie'||/\bElias\b/i.test(prompt))&&!prompt.includes(ELIAS_VOICE_CONTRACT))prompt=ELIAS_VOICE_CONTRACT+'\n'+prompt;
 if(mode==='elias-selfie'){const body=prompt.replace(FIXED_CAMERA_CONTRACT,'').trim();return body.includes(ELIAS_SELFIE_CONTRACT)?body:ELIAS_SELFIE_CONTRACT+'\n'+body;}
 return prompt.includes(FIXED_CAMERA_CONTRACT)?prompt:FIXED_CAMERA_CONTRACT+'\n'+prompt;
}
