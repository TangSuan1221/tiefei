import { CAMPAIGN_STORY, CAMPAIGN_ENDINGS } from '../content/campaign-story';

export type CampaignBeat = 'hook' | 'arrival' | 'film' | 'evidence' | 'departure';
export type CampaignChoice = 'relay' | 'seal' | 'archive';
export interface CampaignEntry { id:string; chapter:number; beat:CampaignBeat; text:string }

/** Evidence is committed by successful simulation actions, never by UI visits. */
export class Campaign {
  readonly journal:CampaignEntry[]=[];
  private seen=new Set<string>();
  private queue:CampaignEntry[]=[];
  private cooldown=0;
  chapter=0;
  choice:CampaignChoice|null=null;
  record(chapter:number,beat:CampaignBeat):boolean {
    const story=CAMPAIGN_STORY[chapter];
    if(!story) return false;
    const id=`${chapter}.${beat}`;
    if(this.seen.has(id)) return false;
    if(beat==='hook' && chapter>this.chapter) {
      // Do not replay obsolete instructions after leaving; the journal keeps them.
      this.queue=this.queue.filter(e=>e.chapter===chapter-1 && e.beat==='departure');
    }
    // Never announce observations as established proof before their source action.
    if(beat==='evidence' && !this.seen.has(`${chapter}.arrival`)) return false;
    this.seen.add(id);this.chapter=Math.max(this.chapter,chapter);
    const entry={id,chapter,beat,text:story[beat]};
    this.journal.push(entry);
    if(chapter>=this.chapter || beat==='departure') this.queue.push(entry);
    return true;
  }
  has(chapter:number,beat:CampaignBeat) {return this.seen.has(`${chapter}.${beat}`);}
  tick(dt:number,danger:boolean):CampaignEntry|null {
    // Threat cues always have priority; narrative resumes after the encounter.
    if(danger) return null;
    this.cooldown=Math.max(0,this.cooldown-Math.max(0,Math.min(dt,1)));
    if(this.cooldown>0 || !this.queue.length) return null;
    this.cooldown=10;
    return this.queue.shift()!;
  }
  choose(choice:CampaignChoice,ready:boolean):boolean {
    if(!ready || this.chapter!==6 || this.choice) return false;
    if(choice==='archive' && this.journal.filter(e=>e.beat==='film').length<4) return false;
    this.choice=choice;return true;
  }
  get ending(){return this.choice?CAMPAIGN_ENDINGS[this.choice]:null;}
  get current(){return CAMPAIGN_STORY[this.chapter]!;}
  get objective(){
    if(!this.has(this.chapter,'arrival')) return '去领航台：核对声呐，驶向本段设施。';
    if(!this.has(this.chapter,'film')) return '摄像台拍摄本关 → 等待显影 → 分析台读片。';
    if(!this.has(this.chapter,'evidence')) return this.current.objective;
    if(this.chapter===6 && !this.choice) return '抵达出口并解锁后，去无线电台决定最后一次传输。';
    return '完成本关机关并到达出口；摄像台或领航台离站。';
  }
}
