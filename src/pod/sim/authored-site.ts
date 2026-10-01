import type { Control } from '../view/chrome';
export interface NavigationConsole {
 readonly editing:boolean;
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
  readonly diegeticGuidance?:boolean;
  readonly navigationConsole?:NavigationConsole;
  readonly descriptionOnly?:boolean;
  describeEvidence?(capture:unknown):string;
  sonarPulse?(power:0|1|2):void;
  /** Authoritative evidence state after analysis; report text is not success. */
  readonly evidenceReady?:boolean;
  readonly managesThreats?:boolean;
  readonly spatialThreat?:boolean;
  weaponResponse?(weapon:string):void;
  readonly noiseFloor?:number;
  captureEvidence?():unknown;
  analyzeEvidence?(snapshot:unknown):string[];
  tick?(dt:number):void;
  restore?(snapshot:unknown):boolean;
  canCounter?(action:{kind:string}):boolean;
  drawInteraction?(ctx:CanvasRenderingContext2D,w:number,h:number):void;
  drawDrivingSonar?(ctx:CanvasRenderingContext2D,w:number,h:number,time:number,dedicated?:boolean):void;
  move(distance:number):boolean;
  turn?(degrees:number):number;
  moveVertical?(distance:number):boolean;
  readonly elevation?:number;
  interact():void;
  armEvent?(kind:'grip'|'stowed',id?:string):boolean;
  draw(ctx:CanvasRenderingContext2D,w:number,h:number,time:number):void;
  drawMap(ctx:CanvasRenderingContext2D,w:number,h:number):void;
  snapshot():unknown;
  dispose():void;
}
