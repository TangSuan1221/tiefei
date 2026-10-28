import type {VideoContext} from '../content/video-policy';
import type { Control } from '../view/chrome';
/** voice=clean human carrier, scatter=human carrier too far to lock, unknown=unregistered (shown ???), bio=known fauna, self=own pulse. */
export type PassiveKind='voice'|'scatter'|'unknown'|'bio'|'self';
export interface PassiveContact {
 readonly id:string;readonly kind:PassiveKind;readonly label:string;readonly form:string;
 readonly frequency:number;readonly width:number;readonly intensity:number;readonly bearing:string;
}
export interface SoundRecord {text:string;frequency:number;at?:number;kind?:PassiveKind;label?:string}
export interface NavigationConsole {
 readonly autoReceive?:boolean;
 readonly radioRecords?:readonly SoundRecord[];
 /** Sources audible on the passive array right now; never carries range. */
 readonly passiveContacts?:readonly PassiveContact[];
 /** Source under the tuning cursor and how long it has been held there. */
 readonly passiveFocus?:{contact:PassiveContact|null;held:number;locked:boolean};
 /** Per-bin intensity history of the waterfall, newest row first. */
 readonly passiveRows?:readonly ArrayLike<number>[];
 readonly pendingRadioCount?:number;
 readonly editing:boolean;
 readonly receivedCoordinates?:string;
 setFrequency?(value:number):void;
 setWaypoint?(value:number[]):boolean;
 analyzeSignal?():{text:string;kind:string}|null;
 reply?():boolean;
 drawWaterfall?(ctx:CanvasRenderingContext2D,w:number,h:number,caption?:boolean,amber?:boolean):void;
 drawActive?(ctx:CanvasRenderingContext2D,w:number,h:number,panel?:boolean):void;
 drawWaypointPanel?(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number):void;
 /** Active waypoint in a few short lines, for small physical screens. */
 waypointBrief?():{title:string;lines:string[]};
 /** Waypoint marker hit circles in the coordinates last given to `drawActive`. */
 readonly markerHits?:readonly {index:number;x:number;y:number;r:number}[];
 selectWaypoint?(index:number):boolean;
 readonly target?:readonly number[]|null;
 readonly screenAction?:string;
 controls():Control[];
 action(id:string):boolean;
 key(key:string):boolean;
 draw(ctx:CanvasRenderingContext2D,w:number,h:number):void;
}
/** Main-game adapter for the authored expedition's space and progression. */
export interface AuthoredSite {
  readonly index:number;
  readonly complete:boolean;
  readonly description:string;
  readonly hint:string;
  readonly objective?:string;
  readonly dialogueChoices?:readonly string[];
  chooseDialogue?(index:number):boolean;
  /** Free-text radio line through the passive-sonar microphone. */
  radioSay?(text:string):boolean;
  receiveTape?(recipient:'vance'|'elias',tapeId:string):boolean;
  /** Who the microphone reaches now ('万斯' / '艾里亚斯'), null when only static. */
  readonly micTarget?:string|null;
  /** True when someone is listening and not mid-sentence. */
  readonly micReady?:boolean;
  /** Story performance key for the survivor in frame, for 3D pose. */
  readonly eliasBeat?:string;
  readonly diegeticGuidance?:boolean;
  /** Optional per-site presentation; absent keeps the shared defaults (512×360 sensor frames, bottom captions, amber lab). */
  readonly presentation?:{
    readonly sensorFrame?:{readonly width:number;readonly height:number};
    /** Captions in their own backed band clear of the cabin keyboard and console panel. */
    readonly captionBand?:boolean;
    /** Expanded lab playback fills the CRT and keeps the recording's colour. */
    readonly labLargeFrame?:boolean;
  };
  readonly managesNarrative?:boolean;
  readonly navigationConsole?:NavigationConsole;
  readonly descriptionOnly?:boolean;
  describeEvidence?(capture:unknown):string;
  sonarPulse?(power:0|1|2):void;
  noiseBurst?(amount:number):void;
  /** Authoritative evidence state after analysis; report text is not success. */
  readonly evidenceReady?:boolean;
  readonly managesThreats?:boolean;
  readonly spatialThreat?:boolean;
  weaponResponse?(weapon:string):void;
  readonly noiseFloor?:number;
  /** Multiplier on the periodic active-sonar drain (default 1). */
  readonly pulseCostScale?:number;
  videoContext?():VideoContext;
  captureEvidence?():unknown;
  prepareCapture?():{ok:boolean;message?:string};
  finishCapture?():void;
  commitEvidence?(capture:unknown):void;
  analyzeEvidence?(snapshot:unknown):string[];
  isEvidenceMediaReady?(mediaId:string):boolean;
  readonly recoveredDocument?:boolean;
  readonly cargoManifest?: readonly {name:string;quantity:number}[];
  readRecoveredDocument?():string[];
  evidenceStatus?(capture:unknown):{accepted:boolean;next:string};
  tick?(dt:number):void;
  restore?(snapshot:unknown):boolean;
  canCounter?(action:{kind:string}):boolean;
  drawInteraction?(ctx:CanvasRenderingContext2D,w:number,h:number):void;
  /** Live window only; never burned into evidence or replay. */
  resetWindowFocus?():void;
  drawWindowLocks?(ctx:CanvasRenderingContext2D,w:number,h:number):void;
  drawDrivingSonar?(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,dedicated?:boolean):void;
  /** Clearances measured by the most recent active sweep (m, already net of hull); absent until one is drawn. */
  readonly sonarReadout?:{readonly above:number;readonly below:number;readonly front:number;readonly back:number;readonly left:number;readonly right:number};
  move(distance:number):boolean;
  turn?(degrees:number):number;
  moveVertical?(distance:number):boolean;
  readonly elevation?:number;
  /** Surface-referenced depth of world y=0; player-facing DEPTH = datum − y. */
  readonly coordinateDatum?:number;
  /** World-space pod position, for the player-facing X / Y / DEPTH readout. */
  readonly position?:{readonly x:number;readonly y:number;readonly z:number};
  interact():void;
  armEvent?(kind:'grip'|'stowed',id?:string):boolean;
  draw(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,recording?:boolean):void;
  drawMap(ctx:CanvasRenderingContext2D,w:number,h:number):void;
  snapshot():unknown;
  dispose():void;
}
