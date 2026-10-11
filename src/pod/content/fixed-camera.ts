/** Shared by prompt composition and the actual video submission boundary. */
export const FIXED_CAMERA_CONTRACT = 'CAMERA LOCK: One continuous stationary shot. Keep camera position, rotation, framing and focal length fixed for the entire clip. No pan, tilt, roll, dolly, tracking, orbit, zoom, reframing, drift, shake, impact jolt or cuts. Static structures stay at the same screen coordinates; only subjects, water and particles move. Never follow a subject leaving the frame.';

export function lockVideoCamera(prompt:string):string {
 return prompt.includes(FIXED_CAMERA_CONTRACT)?prompt:FIXED_CAMERA_CONTRACT+'\n'+prompt;
}
