import type { Control } from '../view/chrome';
export interface NavigationConsole {
 readonly autoReceive?:boolean;
 readonly radioRecords?:readonly {text:string;frequency:number}[];
 readonly pendingRadioCount?:number;
 readonly editing:boolean;
 readonly receivedCoordinates?:string;
 setFrequency?(value:number):void;
 setWaypoint?(value:number[]):boolean;
 analyzeSignal?():{text:string;kind:string}|null;
 reply?():boolean;
 drawWaterfall?(ctx:CanvasRenderingContext2D,w:number,h:number):void;
 drawActive?(ctx:CanvasRenderingContext2D,w:number,h:number,panel?:boolean):void;
 drawWaypointPanel?(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number):void;
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
  readonly diegeticGuidance?:boolean;
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
  captureEvidence?():unknown;
  prepareCapture?():{ok:boolean;message?:string};
  finishCapture?():void;
  commitEvidence?(capture:unknown):void;
  analyzeEvidence?(snapshot:unknown):string[];
  evidenceStatus?(capture:unknown):{accepted:boolean;next:string};
  tick?(dt:number):void;
  restore?(snapshot:unknown):boolean;
  canCounter?(action:{kind:string}):boolean;
  drawInteraction?(ctx:CanvasRenderingContext2D,w:number,h:number):void;
  drawDrivingSonar?(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,dedicated?:boolean):void;
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
