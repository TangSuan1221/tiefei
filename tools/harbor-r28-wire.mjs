import fs from 'node:fs';
const path='src/pod/view/deepsea/harbor-rescue-site.ts';let s=fs.readFileSync(path,'utf8');
const replace=(a,b)=>{if(!s.includes(a))throw Error('Missing '+a.slice(0,90));s=s.replace(a,b);};
replace("import {isNoVideoMode}","import {labPlaybackRunning} from '../footage';\nimport {isNoVideoMode}");
replace("from '../../../story-pipeline/level-01'","from '../../../story-pipeline/level-01-legacy'");
replace('private simpleWaypoint=\'\';',"private simpleWaypoint='';\n private kitPending=false;\n private repairBox:T.Mesh|null=null;");
replace('const self=this;',`const kit=new T.Mesh(new T.BoxGeometry(1.35,1.3,.96),new T.MeshStandardMaterial({color:0xc6a35f,roughness:.85}));
  kit.name='港区维修工具箱';kit.position.set(42,-.7,25);kit.userData.interactionId='harbor.rescue.kit';this.world.root.add(kit);this.repairBox=kit;
  this.world.colliders.push(new T.Box3().setFromObject(kit));
  const self=this;`);
replace("if(this.simplified)return this.simpleFlow.awaitingReport?", "if(this.simplified&&!this.simpleFlow.legacy)return this.simpleFlow.awaitingReport?['我已经确认关好了，可以走','请先等我核对']:['你失联很久了，总部不知道你的情况，就派了我下来。','为什么要关闭主动声纳？'];if(this.simplified)return this.simpleFlow.awaitingReport?");
replace("private tickSimple(){", "private tickSimple(dt=0){");
replace("if(this.simplified){this.tickSimple();return;}","if(this.simplified){this.tickSimple(dt);return;}");
replace("if(!s.heard){this.rescue.step", "if(!s.heard&&(this.simpleFlow.legacy||this.base.state.opened.includes('harbor.edge.A-C'))){this.rescue.step");
replace('const firstTick=!this.started;',`this.simpleFlow.sync({firstDoor:this.base.state.opened.includes('harbor.edge.A-C'),secondDoor:this.base.state.opened.includes('harbor.edge.C-B'),active:this.activeNoise,atExit:this.position.distanceTo(new T.Vector3(...L.observe))<=4,inCargo:this.podInCargo(),hull:this.run.hull,kit:this.simpleFlow.kitStored});
  if(this.simpleFlow.tick(dt,this.taskPlayer.waiting||labPlaybackRunning(this.run))){
   if(this.simpleFlow.impactCount===1)this.pursuit.wake(this.position,this.run.heading);
   this.run.hull=Math.min(this.run.hull,this.simpleFlow.impactCount===1?.75:.5);this.run.onShake?.(.85);this.run.onCue?.('hull.crack',.9);
   this.feedback(this.simpleFlow.impactCount===1?'艇壳受到猛烈撞击！':'第二次撞击！艇体受损，完整度50% · 关闭主动声纳电源');
  }
  if(this.repairBox)this.repairBox.visible=!this.simpleFlow.kitStored;
  const firstTick=!this.started;`);
replace('activeSonar:audible&&(this.simplified||warned)', 'activeSonar:audible&&(this.simplified||warned)&&(!this.simplified||this.simpleFlow.threatEnabled&&!this.taskPlayer.waiting&&!labPlaybackRunning(this.run))');
replace('chapterOne:this.simplified,personnelApproaching', 'chapterOne:this.simplified,revised:this.simplified&&!this.simpleFlow.legacy,personnelApproaching');
replace('可输入“先别走”叫停。','可以随时叫他退回门后。');
replace("this.feedback('艾里亚斯遇袭退回安保室 · 伤情回传待接收');","this.simpleFlow.reportAnswered=false;this.feedback('艾里亚斯遇袭退回总调度室 · 伤情回传待接收，需重新隔离');");
replace("if(kind==='stowed'){this.facilityArm=null;", "if(kind==='stowed'){if(this.kitPending){this.kitPending=false;this.simpleFlow.kitStored=true;this.feedback('维修工具已收妥 · 到分析台通讯页执行修复铁鲸');}this.facilityArm=null;");
replace("let zone=id.slice('harbor.rescue.'.length) as RescueZone;const s=this.rescue.state,stage=this.dialogue.stage;",`if(id==='harbor.rescue.kit'){
    if(!this.simpleFlow.repairBriefSeen){this.feedback('先接听维修指引。');return;}
    if(!this.simpleFlow.kitStored){this.kitPending=true;this.feedback('维修工具箱已吸附 · F / C收回，收妥后才入库');}return;
   }
   let zone=id.slice('harbor.rescue.'.length) as RescueZone;const s=this.rescue.state,stage=this.dialogue.stage;`);
replace("if(s.gateOpen&&!this.simpleFlow.entryAnalyzed)","if(s.gateOpen&&!(this.simpleFlow.legacy?this.simpleFlow.entryAnalyzed:this.simpleFlow.entryCaptured))");
replace("先在03拍清怪物完整入仓，并在分析台核验当前轮次录像。","先在03停稳拍清怪物完整入仓，再退出货舱落闸；显影期间可以撤离。");
replace("if(zone==='lure'){",`if(this.simplified&&!this.simpleFlow.legacy&&zone==='observe'&&s.isolated&&!s.departureConfirmed){this.rescue.reopenCargo();this.feedback('货舱闸门重新打开 · 隔离失效，艾里亚斯尚不知情');this.syncVisual();return;}
   if(zone==='lure'){`);
replace("if(door&&['harbor.edge.A-C','harbor.edge.C-B'].includes(door)){",`if(this.simplified&&door==='harbor.edge.C-B'&&!this.simpleFlow.credential){this.feedback('第二道门尚未授权 · 接听艾里亚斯并回应求救，接收门禁资料');return;}
  if(door&&['harbor.edge.A-C','harbor.edge.C-B'].includes(door)){`);
// Physical command buttons do not masquerade as free text.
replace('get hint(){return this.objective;}',`get harborActions(){return this.simplified&&!this.simpleFlow.legacy;}
 harborAction(action:string){
  if(!this.harborActions)return false;
  if(action==='retry'){this.feedback(this.taskPlayer.retry());return true;}
  if(action==='identity'){const ok=this.simpleFlow.identify();this.feedback(ok?'任务身份资料已发送':'先接听求救呼叫');return true;}
  if(action==='background'){this.radioSay('你失联很久了，总部不知道你的情况，就派了我下来。');return true;}
  if(action==='hold'){this.rescue.stopDeparture();this.simpleFlow.reportAnswered=false;this.feedback('已通知艾里亚斯留在门后等待');return true;}
  if(action==='report'){this.feedback(this.simpleFlow.reportEvidence()?'核验结果片已推送 · 艾里亚斯开始通过人员通道':'请先完成当前隔离结果与入仓录像核验，再推送');return true;}
  if(action==='repair'){
   if(this.run.arm.phase!=='stowed'||Math.abs(this.run.pilot.speed)>.05){this.feedback('先停稳并收回机械臂');return true;}
   this.simpleFlow.world.kit=this.simpleFlow.kitStored;
   if(!this.simpleFlow.finishRepair()){this.feedback('先取得维修工具箱并收妥');return true;}
   this.run.hull=1;this.run.leak=0;this.run.flood=0;this.rescue.interact('power',false,true);this.run.power=1;
   this.feedback('铁鲸维修完成 · 艇况100% · 货舱控制回路恢复');return true;
  }return false;
 }
 get hint(){return this.objective;}`);
fs.writeFileSync(path,s);
