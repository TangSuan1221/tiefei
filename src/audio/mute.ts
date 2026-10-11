/** Output preference only: simulation noise and dialogue timing remain unchanged. */
const KEY='ironlung.audio.muted';
let muted=false;
try{muted=localStorage.getItem(KEY)==='1';}catch{/* storage unavailable */}
const listeners=new Set<(muted:boolean)=>void>();
export const isAudioMuted=()=>muted;
export function onAudioMute(fn:(muted:boolean)=>void){listeners.add(fn);fn(muted);return ()=>{listeners.delete(fn);};}
export function setAudioMuted(value:boolean){
 muted=value;
 try{localStorage.setItem(KEY,value?'1':'0');}catch{/* session-only fallback */}
 if(value&&typeof window!=='undefined'&&'speechSynthesis' in window)window.speechSynthesis.cancel();
 for(const fn of listeners)fn(value);
}
