import {BoxGeometry,Group,Mesh,MeshBasicMaterial} from 'three';
/** Battery-backed, two-sided doorway lights. Fixed frame remains visible with the leaf open. */
export function passageEmergency(width:number,height:number){
 const root=new Group();root.name='passage-emergency-standard';
 const geometry=new BoxGeometry(1,1,1);
 const cyan=new MeshBasicMaterial({color:'#70e2dc',toneMapped:false});
 const status=new MeshBasicMaterial({color:'#ef392e',toneMapped:false});
 const casing=new MeshBasicMaterial({color:'#182225'});
 const bar=(x:number,y:number,z:number,w:number,h:number,d:number,mat:MeshBasicMaterial)=>{
  const m=new Mesh(geometry,mat);m.position.set(x,y,z);m.scale.set(w,h,d);root.add(m);
 };
 for(const face of [-1,1]){
  for(const side of [-1,1]){
   bar(side*(width/2-.10),0,face*.48,.14,height*.88,.10,casing);
   bar(side*(width/2-.10),0,face*.54,.085,height*.86,.025,cyan);
  }
  bar(width/2-.35,height*.29,face*.48,.30,.46,.12,casing);
  bar(width/2-.35,height*.29,face*.56,.14,.21,.025,status);
 }
 return {root,update(open:boolean){status.color.set(open?'#d6d3a4':'#ef392e');root.userData.open=open;},dispose(){geometry.dispose();cyan.dispose();status.dispose();casing.dispose();}};
}
