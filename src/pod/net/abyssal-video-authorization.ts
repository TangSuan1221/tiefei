/** Explicit local configuration or prior per-tab approval enables level-three uploads.
 * This module only reads a boolean Vite flag. Provider credentials remain server-side.
 */
export function resolveAbyssalVideoAuthorization(config:unknown,sessionConsent:unknown):boolean {
 return config==='1'||sessionConsent==='1';
}
export function abyssalVideoAuthorized():boolean {
 let consent:string|null=null;
 try{if(typeof sessionStorage!=='undefined')consent=sessionStorage.getItem('ironlung.abyssal.videoConsent');}catch{/* Storage may be unavailable; explicit config still works. */}
 return resolveAbyssalVideoAuthorization(import.meta.env?.VITE_ABYSSAL_VIDEO_ENABLED,consent);
}
