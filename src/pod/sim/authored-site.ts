/** Main-game adapter for the authored expedition's space and progression. */
export interface AuthoredSite {
  readonly index:number;
  readonly complete:boolean;
  readonly description:string;
  readonly hint:string;
  drawInteraction?(ctx:CanvasRenderingContext2D,w:number,h:number):void;
  move(distance:number):boolean;
  moveVertical?(distance:number):boolean;
  readonly elevation?:number;
  interact():void;
  armEvent?(kind:'grip'|'stowed',id?:string):boolean;
  draw(ctx:CanvasRenderingContext2D,w:number,h:number,time:number):void;
  drawMap(ctx:CanvasRenderingContext2D,w:number,h:number):void;
  snapshot():unknown;
  dispose():void;
}
