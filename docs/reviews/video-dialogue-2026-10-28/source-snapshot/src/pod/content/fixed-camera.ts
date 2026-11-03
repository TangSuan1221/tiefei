import {ELIAS_SELFIE_CONTRACT} from './elias-video-atoms';
/** Shared by prompt composition and the actual video submission boundary. */
export const FIXED_CAMERA_CONTRACT = 'CAMERA LOCK: One continuous stationary shot. Keep camera position, rotation, framing and focal length fixed for the entire clip. No pan, tilt, roll, dolly, tracking, orbit, zoom, reframing, drift, shake, impact jolt or cuts. Static structures stay at the same screen coordinates; only subjects, water and particles move. Never follow a subject leaving the frame.';

export type VideoCameraMode='fixed'|'elias-selfie';
export function lockVideoCamera(prompt:string,mode:VideoCameraMode='fixed'):string {
 if(mode==='elias-selfie'){const body=prompt.replace(FIXED_CAMERA_CONTRACT,'').trim();return body.includes(ELIAS_SELFIE_CONTRACT)?body:ELIAS_SELFIE_CONTRACT+'\n'+body;}
 return prompt.includes(FIXED_CAMERA_CONTRACT)?prompt:FIXED_CAMERA_CONTRACT+'\n'+prompt;
}
