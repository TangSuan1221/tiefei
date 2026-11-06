import spec from '../content/vance-voice.json';

/** Bundled neural English performance: no system TTS, pitch shifting or radio distortion. */
export class VanceVoice {
 private audio:HTMLAudioElement|null=null;
 private elapsed=0;
 play(step:number){
  this.stop();
  if(!spec.lines[step])return;
  const audio=new Audio(`${import.meta.env.BASE_URL}assets/audio/vance/${spec.revision}/${String(step).padStart(2,'0')}.mp3`);
  audio.defaultPlaybackRate=audio.playbackRate=spec.playbackRate;
  audio.preservesPitch=true;
  this.audio=audio;this.elapsed=0;
  audio.onended=audio.onerror=()=>{if(this.audio===audio)this.stop();};
  void audio.play().catch(()=>{if(this.audio===audio)this.stop();});
 }
 /** Bound loading failures, but let the actual recording determine caption duration. */
 tick(dt:number,muted:boolean){
  this.elapsed+=dt;
  if(muted||this.elapsed>90)this.stop();
  return !!this.audio;
 }
 stop(){
  const audio=this.audio;this.audio=null;
  if(audio){audio.onended=audio.onerror=null;audio.pause();audio.removeAttribute('src');audio.load();}
 }
}
