import type { ActionResult, Campaign, Candidate, Choice, Condition, Effect, NpcLine, Resolution, StoryScene, StoryState, Tape } from './types';

const copy = <T>(value:T):T => structuredClone(value);
const ok = (message:string):ActionResult => ({ok:true,message});
const no = (message:string):ActionResult => ({ok:false,message});
const clamp = (value:number,min:number,max:number) => Math.max(min,Math.min(max,value));
const people = ['vance','elias','niko','lena'] as const;
const own = (value:object,key:string) => Object.prototype.hasOwnProperty.call(value,key);
const isObject = (v:unknown):v is Record<string,unknown> => !!v && typeof v==='object' && !Array.isArray(v);
const finite = (v:unknown):v is number => typeof v==='number' && Number.isFinite(v);
const strings = (v:unknown):v is string[] => Array.isArray(v)&&v.every(x=>typeof x==='string');

/** Deterministic, standalone storyboard simulator; it neither drives nor saves PodRun. */
export class StoryEngine {
  private readonly campaign:Campaign;
  private data!:StoryState;
  constructor(campaign:Campaign) {
    this.campaign=copy(campaign);
    if(!campaign.scenes.length || new Set(campaign.scenes.map(s=>s.id)).size!==campaign.scenes.length)
      throw new Error('叙事场景为空或 ID 重复。');
    for(const scene of campaign.scenes){
      if(!scene.choices.length||new Set(scene.choices.map(c=>c.id)).size!==scene.choices.length)throw new Error(`选项 ID 无效：${scene.id}`);
      for(const choice of scene.choices)for(const effect of choice.instructions)this.validateEffect(effect);
      if(!scene.resolutions.length||new Set(scene.resolutions.map(r=>r.id)).size!==scene.resolutions.length)throw new Error(`缺少结果后二次决策：${scene.id}`);
      for(const resolution of scene.resolutions)for(const effect of resolution.instructions)this.validateEffect(effect);
    }
    this.reset();
  }
  get state():StoryState {return this.snapshot();}
  get scene():StoryScene {return copy(this.current);}
  private get current():StoryScene {return this.campaign.scenes[this.data.sceneIndex];}
  snapshot():StoryState {return copy(this.data);}
  reset():void {
    this.data={schemaVersion:1,campaignId:this.campaign.id,campaignVersion:this.campaign.version,
      sceneIndex:0,phase:'scout',clock:0,epoch:0,selectedChoice:null,selectedResolution:null,
      player:{alive:true,stress:0},pod:{power:.88,hull:1,oxygen:3600,armStowed:true},
      relations:{vance:{trust:0,respect:0},elias:{trust:0,respect:0},niko:{trust:0,respect:0},lena:{trust:0,respect:0}},
      world:copy(this.campaign.initialWorld),knowledge:{player:[],vance:[],elias:[],niko:[],lena:[]},
      tapes:[],activeTapeId:null,captureRemaining:0,developRemaining:0,events:[],endingId:null};
    this.event('enter',this.current.entryText);
  }
  private event(type:string,detail:string,causedBy?:number):number {
    const id=(this.data.events.at(-1)?.id??0)+1;
    this.data.events.push({id,at:this.data.clock,sceneId:this.current.id,type,detail,...(causedBy===undefined?{}:{causedBy})});
    return id;
  }
  private read(path:string,state=this.data):unknown {
    const parts=path.split('.');
    if(parts.some(p=>!p||['__proto__','prototype','constructor'].includes(p)))return undefined;
    let value:unknown=state;
    for(const key of parts){if(!isObject(value)||!own(value,key))return undefined;value=value[key];}
    return value;
  }
  evaluate(condition:Condition):boolean {return this.test(condition,this.data);}
  private test(condition:Condition,state:StoryState):boolean {
    if('all' in condition)return condition.all.every(c=>this.test(c,state));
    if('any' in condition)return condition.any.some(c=>this.test(c,state));
    const value=this.read(condition.path,state);
    switch(condition.op){
      case 'eq':return value===condition.value;
      case 'ne':return value!==undefined&&value!==condition.value;
      case 'gte':return finite(value)&&finite(condition.value)&&value>=condition.value;
      case 'lte':return finite(value)&&finite(condition.value)&&value<=condition.value;
      case 'has':return Array.isArray(value)&&value.includes(condition.value);
      case 'notHas':return Array.isArray(value)&&!value.includes(condition.value);
    }
  }
  private validateEffect(effect:Effect):void {
    const path=effect.path;
    const world=path.startsWith('world.')&&path.split('.').length===2&&own(this.campaign.initialWorld,path.slice(6))&&path!=='world.eliasNature';
    const relation=/^relations\.(vance|elias|niko|lena)\.(trust|respect)$/.test(path);
    const resource=/^pod\.(power|hull|oxygen)$/.test(path)||path==='player.stress';
    if(!world&&!relation&&!resource)throw new Error(`禁止剧情效果写入：${path}`);
    if(!['set','add'].includes(effect.op)||!['string','number','boolean'].includes(typeof effect.value)||
      (typeof effect.value==='number'&&!Number.isFinite(effect.value))||
      ((effect.op==='add'||relation||resource)&&!finite(effect.value)))throw new Error(`效果值无效：${path}`);
    if(world&&typeof effect.value!==typeof this.campaign.initialWorld[path.slice(6)])throw new Error(`世界变量类型不匹配：${path}`);
  }
  private apply(state:StoryState,effect:Effect):void {
    this.validateEffect(effect);
    const parts=effect.path.split('.');let object:Record<string,unknown>=state as unknown as Record<string,unknown>;
    for(const part of parts.slice(0,-1))object=object[part] as Record<string,unknown>;
    const key=parts.at(-1)!;
    object[key]=effect.op==='add'?Number(object[key])+Number(effect.value):effect.value;
  }
  private planned(choice:Pick<Choice,'instructions'>):StoryState|null {
    const next=copy(this.data);
    for(const effect of choice.instructions)this.apply(next,effect);
    if(!Object.values(next.pod).every(v=>typeof v==='boolean'||finite(v))||next.pod.power<0||next.pod.oxygen<0||next.pod.hull<=0)return null;
    next.pod.power=clamp(next.pod.power,0,1);next.pod.hull=clamp(next.pod.hull,0,1);
    next.player.stress=clamp(next.player.stress,0,100);
    return next;
  }
  private get busy():boolean {return this.data.activeTapeId!==null;}
  private irreversible(state=this.data):boolean {
    return state.sceneIndex===this.campaign.scenes.length-1&&['next','ended'].includes(state.phase);
  }
  getChoices():Candidate[] {
    return this.current.choices.map(choice=>{
      let reason='';
      if(!this.data.player.alive)reason='玩家无法行动。';
      else if(this.busy)reason='等待本卷曝光和显影完成。';
      else if(!['decision','resolve'].includes(this.data.phase))reason='先完成本阶段摄影核验。';
      else if(this.data.events.some(e=>e.sceneId===this.current.id&&e.type===`action:${choice.id}`))reason='此行动已经执行，不能重复领取效果。';
      else if(choice.condition&&!this.evaluate(choice.condition))reason='前置事实、报告或人物状态尚未满足。';
      else if(!this.planned(choice))reason='资源不足；返回维护点补给后重试。';
      return {id:choice.id,allowed:!reason,reason,choice:copy(choice)};
    });
  }
  /** A model may propose an ID; only this ordered, guarded candidate list has authority. */
  chooseCandidate(proposedId?:string):Candidate|null {
    const allowed=this.getChoices().filter(c=>c.allowed);
    return allowed.find(c=>c.id===proposedId)??allowed[0]??null;
  }
  act(choiceId:string):ActionResult {
    const candidate=this.getChoices().find(c=>c.id===choiceId);
    if(!candidate)return no('未知选项；没有改变世界。');
    if(!candidate.allowed)return no(candidate.reason);
    const next=this.planned(candidate.choice)!;
    next.selectedChoice=choiceId;next.phase='result';next.epoch++;
    this.data=next;
    this.event(`action:${choiceId}`,`${candidate.choice.label}：${candidate.choice.consequence}`);
    return ok('操作完成。请拍摄现场，查看结果。');
  }
  shoot():ActionResult {
    if(this.busy)return no('已有曝光或显影任务，不能并行拍摄。');
    if(!this.data.player.alive||!this.data.pod.armStowed)return no('需要玩家可行动且机械臂已收回。');
    if(this.data.phase!=='scout'&&this.data.phase!=='result')return no('此阶段无需新授权录像；先行动或继续。');
    if(this.data.pod.power<.06||this.data.pod.oxygen<17)return no('摄影资源不足；维护补给后可以重拍。');
    const choice=this.current.choices.find(c=>c.id===this.data.selectedChoice);
    if(this.data.phase==='result'&&!choice)return no('没有已执行的结果可供拍摄。');
    const tape:Tape={id:`tape.${this.data.tapes.length+1}`,sceneId:this.current.id,kind:this.data.phase,
      epoch:this.data.epoch,capturedAt:this.data.clock,facts:copy(this.data.phase==='scout'?this.current.scoutFacts:choice!.evidence),
      text:this.data.phase==='scout'?this.current.scoutFootage:choice!.resultText,ready:false,analyzed:false,source:'authored-storyboard'};
    this.data.pod.power-=.06;this.data.tapes.push(tape);this.data.activeTapeId=tape.id;
    this.data.captureRemaining=5;this.data.developRemaining=12;
    this.event('exposure',`${tape.id}：${tape.kind==='scout'?'侦察':'结果'}曝光开始，事实已锁定。`);
    return ok('正在拍摄。曝光需要 5 秒，之后等待 12 秒显影。');
  }
  tick(seconds:number):void {
    if(!finite(seconds)||seconds<0)throw new RangeError('时间增量必须为有限非负秒。');
    let left=seconds;
    while(left>0&&this.busy){
      const exposing=this.data.captureRemaining>0;
      const remaining=exposing?this.data.captureRemaining:this.data.developRemaining;
      const step=Math.min(left,remaining);this.data.clock+=step;left-=step;
      this.data.pod.oxygen=Math.max(0,this.data.pod.oxygen-step);
      if(exposing){this.data.captureRemaining=Math.max(0,remaining-step);if(this.data.captureRemaining===0)this.event('developing','曝光结束，进入 12 秒显影。');}
      else {this.data.developRemaining=Math.max(0,remaining-step);if(this.data.developRemaining===0){
        const tape=this.data.tapes.find(t=>t.id===this.data.activeTapeId)!;tape.ready=true;this.data.activeTapeId=null;
        this.event('tape-ready',`${tape.id} 显影完成；尚未分析，不授予知识。`);
      }}
    }
    this.data.clock+=left;
  }
  analyze(tapeId?:string):ActionResult {
    const tape=tapeId?this.data.tapes.find(t=>t.id===tapeId):this.data.tapes.at(-1);
    if(!tape?.ready)return no('录像尚未完成曝光与显影。');
    if(tape.analyzed)return ok('这段录像已经看过，可以随时重看。');
    if(this.busy)return no('等待当前曝光与显影完成。');
    if(tape.sceneId!==this.current.id||tape.epoch!==this.data.epoch)return no('旧片可作历史记录，但不能授权当前现场的新操作。');
    if(tape.kind!==this.data.phase)return no('这卷不属于当前待核验阶段。');
    if(this.data.pod.power<.045)return no('分析台电量不足；补给后本卷仍可继续分析。');
    this.data.pod.power-=.045;tape.analyzed=true;
    this.data.knowledge.player=[...new Set([...this.data.knowledge.player,...tape.facts])];
    this.data.phase=tape.kind==='scout'?'decision':'resolve';
    const source=[...this.data.events].reverse().find(e=>e.type==='exposure'&&e.detail.startsWith(`${tape.id}：`));
    this.event('analysis',`${tape.id}：${tape.text}`,source?.id);
    return ok('录像已看完。万斯还没收到这段内容，你可以向他报告。');
  }
  report():ActionResult {
    if(this.irreversible())return no('最后行动已经执行，不能补交报告改写撤离依据。');
    if(this.data.captureRemaining>0)return no('曝光期间不能离开摄像工位报告。');
    const added=this.data.knowledge.player.filter(f=>!this.data.knowledge.vance.includes(f));
    if(!added.length)return ok('没有尚未报告的新事实。');
    this.data.knowledge.vance.push(...added);this.event('report',`已向万斯报告：${added.join('、')}`);
    return ok(`已报告 ${added.length} 条已核验事实。`);
  }
  private present(speaker:NpcLine['speaker']):boolean {
    if(speaker==='player')return this.data.player.alive;
    if(speaker==='vance')return this.data.world.vanceAlive!==false;
    const w=this.data.world;
    const status=w[`${speaker}Disposition`]??w[`${speaker}Status`];
    const unavailable=['dead','isolated','damaged','restrained','left','missing'];
    if([w[`${speaker}Disposition`],w[`${speaker}Status`]].some(s=>unavailable.includes(String(s)))||w[`${speaker}Alive`]===false)return false;
    if(speaker==='elias')return w.eliasRescued===true||status==='companion'||status==='cooperate'||w.eliasPresent===true;
    return w[`${speaker}Rescued`]===true||w[`${speaker}Present`]===true;
  }
  getNpcLines():NpcLine[] {
    if(!['resolve','next','ended'].includes(this.data.phase))return [];
    const choice=this.current.choices.find(c=>c.id===this.data.selectedChoice);
    return copy(choice?.npcLines.filter(line=>this.present(line.speaker)
      &&(line.speaker!=='vance'||choice.evidence.every(f=>this.data.knowledge.vance.includes(f)))
      &&(!line.requires||this.evaluate(line.requires)))??[]);
  }
  getResolutions():{resolution:Resolution;allowed:boolean;reason:string}[] {
    return this.current.resolutions.map(resolution=>{
      let reason='';
      if(this.busy||this.data.phase!=='resolve')reason='先分析结果录像，再作后续决策。';
      else if(resolution.condition&&!this.evaluate(resolution.condition))reason='已取得知识或当前状态不满足此决策。';
      else if(!this.planned(resolution))reason='资源不足；可先维护补给。';
      return {resolution:copy(resolution),allowed:!reason,reason};
    });
  }
  resolve(id:string):ActionResult {
    const candidate=this.getResolutions().find(c=>c.resolution.id===id);
    if(!candidate)return no('未知后续决策。');
    if(!candidate.allowed)return no(candidate.reason);
    const next=this.planned(candidate.resolution)!;
    next.selectedResolution=id;next.phase='next';next.epoch++;
    this.data=next;this.event(`resolution:${id}`,candidate.resolution.text);
    return ok('后续操作完成。查看下方的结果，然后继续前进。');
  }
  advance():ActionResult {
    if(this.busy||this.data.phase!=='next')return no('先分析结果，并根据结果完成后续决策，再继续。');
    if(this.data.sceneIndex===this.campaign.scenes.length-1){
      const ending=[...this.campaign.endings].sort((a,b)=>b.priority-a.priority).find(e=>this.evaluate(e.condition));
      if(!ending)return no('没有满足条件的结局，请检查尚可执行的补救。');
      this.data.phase='ended';this.data.endingId=ending.id;this.event('ending',`${ending.title}：${ending.summary}`);
      return ok(ending.title);
    }
    this.event('resolve',this.current.resolveText);
    this.data.sceneIndex++;this.data.phase='scout';this.data.selectedChoice=null;this.data.selectedResolution=null;this.data.epoch++;
    this.event('enter',this.current.entryText);return ok('已到达下一处地点。先拍摄周围的情况。');
  }
  resupply():ActionResult {
    if(this.irreversible())return no('最后行动已经执行，维护通路已离开，不能再补给。');
    if(this.busy)return no('先等曝光与显影完成，再接入维护补给。');
    if(this.data.phase==='ended')return no('本次演练已结束。');
    this.data.pod.power=1;this.data.pod.oxygen=Math.max(3600,this.data.pod.oxygen);this.data.pod.hull=Math.max(.75,this.data.pod.hull);
    this.event('resupply','返回本场景维护点补电、补氧与维修；不复活人物，不撤销世界后果。');
    return ok('补电、补氧和艇壳维修完成。');
  }
  serialize():string {return JSON.stringify(this.data);}
  restore(json:string):ActionResult {
    try{
      const value:unknown=JSON.parse(json);this.validateSave(value);
      this.data=copy(value as StoryState);return ok('存档已读取，可以从这里继续。');
    }catch(error){return no(`未读取存档，当前状态保留：${error instanceof Error?error.message:String(error)}`);}
  }
  private validateSave(value:unknown):void {
    const fail=(message:string):never=>{throw new Error(message);};
    if(!isObject(value))fail('格式无效');
    const s=value as unknown as StoryState;
    if(s.schemaVersion!==1||s.campaignId!==this.campaign.id||s.campaignVersion!==this.campaign.version)fail('版本或剧情不匹配');
    if(!Number.isInteger(s.sceneIndex)||s.sceneIndex<0||s.sceneIndex>=this.campaign.scenes.length||!['scout','decision','result','resolve','next','ended'].includes(s.phase))fail('场景或阶段无效');
    if(![s.clock,s.epoch,s.captureRemaining,s.developRemaining].every(v=>finite(v)&&v>=0)||!Number.isInteger(s.epoch)||s.captureRemaining>5||s.developRemaining>12)fail('时钟无效');
    if(!isObject(s.player)||typeof s.player.alive!=='boolean'||!finite(s.player.stress)||s.player.stress<0||s.player.stress>100)fail('玩家状态无效');
    if(!isObject(s.pod)||!finite(s.pod.power)||s.pod.power<0||s.pod.power>1||!finite(s.pod.hull)||s.pod.hull<=0||s.pod.hull>1||!finite(s.pod.oxygen)||s.pod.oxygen<0||typeof s.pod.armStowed!=='boolean')fail('潜艇状态无效');
    if(!isObject(s.world)||Object.keys(s.world).length!==Object.keys(this.campaign.initialWorld).length)fail('世界变量无效');
    for(const [key,initial]of Object.entries(this.campaign.initialWorld))if(!own(s.world,key)||typeof s.world[key]!==typeof initial||(typeof s.world[key]==='number'&&!finite(s.world[key])))fail(`世界变量无效：${key}`);
    if(s.world.eliasNature!==this.campaign.initialWorld.eliasNature)fail('不可改写角色正典身份');
    if(!isObject(s.relations)||people.some(p=>!isObject(s.relations[p])||!finite(s.relations[p].trust)||!finite(s.relations[p].respect)))fail('关系状态无效');
    if(!isObject(s.knowledge)||['player',...people].some(p=>{const facts=s.knowledge[p as keyof StoryState['knowledge']];return !strings(facts)||new Set(facts).size!==facts.length;}))fail('知识状态无效');
    if(!Array.isArray(s.events)||s.events.some((e,i)=>!isObject(e)||e.id!==i+1||!finite(e.at)||e.at<0||e.at>s.clock||(i>0&&e.at<s.events[i-1].at)||typeof e.type!=='string'||typeof e.detail!=='string'||!this.campaign.scenes.some(c=>c.id===e.sceneId)||(e.causedBy!==undefined&&(!Number.isInteger(e.causedBy)||e.causedBy<1||e.causedBy>=e.id))))fail('事件因果链无效');
    const replay=copy(s);replay.world=copy(this.campaign.initialWorld);
    for(const person of people)replay.relations[person]={trust:0,respect:0};
    replay.knowledge={player:[],vance:[],elias:[],niko:[],lena:[]};
    const performed=new Set<string>();
    let entered=-1,replayedPhase:StoryState['phase']='scout',expectedEpoch=0,lastChoice:string|null=null,lastResolution:string|null=null;
    for(const event of s.events){
      if(event.type==='enter'){
        if(entered>=0&&replayedPhase!=='next')fail('未完成结果后二次决策就进入下一场景');
        entered++;
        if(this.campaign.scenes[entered]?.id!==event.sceneId)fail('场景进入顺序不符');
        if(entered>0)expectedEpoch++;
        replayedPhase='scout';lastChoice=null;lastResolution=null;continue;
      }
      if(this.campaign.scenes[entered]?.id!==event.sceneId)fail('事件跨越了尚未进入的场景');
      if(entered===this.campaign.scenes.length-1&&['next','ended'].includes(replayedPhase)&&event.type!=='ending')fail('最后行动执行后仍有世界或知识变更');
      if(event.type==='analysis'){
        const tape=Array.isArray(s.tapes)?s.tapes.find(t=>event.detail.startsWith(`${t?.id}：`)):null;
        if(!tape?.analyzed||tape.sceneId!==event.sceneId||tape.epoch!==expectedEpoch||tape.kind!==replayedPhase)fail('分析缺少当前现场录像');
        const source=s.events.find(e=>e.id===event.causedBy);
        if(!source||source.type!=='exposure'||!source.detail.startsWith(`${tape!.id}：`)||event.at-tape!.capturedAt<17-1e-6)fail('录像曝光因果或时序无效');
        replay.knowledge.player=[...new Set([...replay.knowledge.player,...tape!.facts])];
        replayedPhase=tape!.kind==='scout'?'decision':'resolve';continue;
      }
      if(event.type==='report'){replay.knowledge.vance=[...replay.knowledge.player];continue;}
      if(event.type==='ending'){
        if(replayedPhase!=='next'||entered!==this.campaign.scenes.length-1)fail('提前结局');
        replayedPhase='ended';continue;
      }
      if(!event.type.startsWith('action:')&&!event.type.startsWith('resolution:'))continue;
      const scene=this.campaign.scenes.find(c=>c.id===event.sceneId)!;
      const isAction=event.type.startsWith('action:');
      const id=event.type.slice(isAction?7:11);
      const operation=isAction?scene.choices.find(c=>c.id===id):scene.resolutions.find(r=>r.id===id);
      const key=`${event.sceneId}/${event.type}`;
      if(!operation||performed.has(key))fail('行动不存在或被重复执行');
      if(isAction?!['decision','resolve'].includes(replayedPhase):replayedPhase!=='resolve')fail('行动发生在未授权阶段');
      performed.add(key);
      for(const effect of operation!.instructions)if(effect.path.startsWith('world.')||effect.path.startsWith('relations.'))this.apply(replay,effect);
      expectedEpoch++;replayedPhase=isAction?'result':'next';
      if(isAction)lastChoice=id;else lastResolution=id;
    }
    if(entered!==s.sceneIndex||replayedPhase!==s.phase||expectedEpoch!==s.epoch||lastChoice!==s.selectedChoice||lastResolution!==s.selectedResolution)fail('当前进度与事件因果链不符');
    if(Object.keys(replay.world).some(k=>replay.world[k]!==s.world[k])||people.some(p=>replay.relations[p].trust!==s.relations[p].trust||replay.relations[p].respect!==s.relations[p].respect))fail('世界或关系状态与已执行事件不符');
    if(JSON.stringify(replay.knowledge)!==JSON.stringify(s.knowledge))fail('知识与分析、报告事件不符');
    if(!Array.isArray(s.tapes)||new Set(s.tapes.map(t=>t?.id)).size!==s.tapes.length)fail('片匣无效');
    for(const [index,t] of s.tapes.entries()){
      if(!isObject(t)||t.id!==`tape.${index+1}`||t.source!=='authored-storyboard'||!['scout','result'].includes(t.kind)||!Number.isInteger(t.epoch)||t.epoch<0||t.epoch>s.epoch||!finite(t.capturedAt)||t.capturedAt<0||t.capturedAt>s.clock||typeof t.ready!=='boolean'||typeof t.analyzed!=='boolean'||!strings(t.facts)||typeof t.text!=='string'||(t.analyzed&&!t.ready))fail('录像元数据无效');
      if(t.ready&&s.clock-t.capturedAt<17-1e-6)fail('录像提前显影');
      if(!t.ready&&s.activeTapeId!==t.id)fail('未完成录像丢失计时器');
      const scene=this.campaign.scenes.find(c=>c.id===t.sceneId)!;if(!scene)fail('录像场景无效');
      const authored=t.kind==='scout'?[{text:scene.scoutFootage,facts:scene.scoutFacts}]:scene.choices.map(c=>({text:c.resultText,facts:c.evidence}));
      if(!authored.some(a=>a.text===t.text&&JSON.stringify(a.facts)===JSON.stringify(t.facts)))fail('录像内容不是已登记的分镜');
    }
    const known=new Set(s.tapes.filter(t=>t.analyzed).flatMap(t=>t.facts));
    if(s.knowledge.player.some(f=>!known.has(f))||[...known].some(f=>!s.knowledge.player.includes(f))||s.knowledge.vance.some(f=>!s.knowledge.player.includes(f))||['elias','niko','lena'].some(p=>s.knowledge[p as 'elias'|'niko'|'lena'].length>0))fail('知识缺少已分析录像来源');
    if(s.knowledge.vance.length>0&&!s.events.some(e=>e.type==='report'))fail('万斯知识缺少显式报告');
    const active=s.tapes.find(t=>t.id===s.activeTapeId);
    if(s.activeTapeId!==null&&(!active||active.ready||active.sceneId!==this.campaign.scenes[s.sceneIndex].id||active.epoch!==s.epoch||!['scout','result'].includes(s.phase)||s.captureRemaining+s.developRemaining<=0))fail('进行中的摄影状态无效');
    if(s.activeTapeId===null&&(s.captureRemaining!==0||s.developRemaining!==0))fail('孤立摄影计时器');
    if(s.captureRemaining>0&&s.developRemaining!==12)fail('曝光期间显影尚不应开始');
    const scene=this.campaign.scenes[s.sceneIndex];
    if(s.selectedChoice!==null&&!scene.choices.some(c=>c.id===s.selectedChoice))fail('选项不存在');
    if(s.selectedChoice!==null&&!performed.has(`${scene.id}/action:${s.selectedChoice}`))fail('选项没有真实执行记录');
    if(['result','resolve','next','ended'].includes(s.phase)&&s.selectedChoice===null)fail('结果缺少执行过的选项');
    if(['scout','decision'].includes(s.phase)&&s.selectedChoice!==null)fail('侦察阶段带有结果');
    if(s.selectedResolution!==null&&!scene.resolutions.some(r=>r.id===s.selectedResolution))fail('后续决策不存在');
    if(s.selectedResolution!==null&&!performed.has(`${scene.id}/resolution:${s.selectedResolution}`))fail('后续决策没有真实执行记录');
    if(['next','ended'].includes(s.phase)&&s.selectedResolution===null)fail('尚未执行结果后二次决策');
    if(!['next','ended'].includes(s.phase)&&s.selectedResolution!==null)fail('提前写入后续决策');
    if(s.phase==='ended'){
      const ending=this.campaign.endings.find(e=>e.id===s.endingId);
      if(s.sceneIndex!==this.campaign.scenes.length-1||!ending||!this.test(ending.condition,s))fail('结局不满足条件');
    }else if(s.endingId!==null)fail('提前写入结局');
  }
}
