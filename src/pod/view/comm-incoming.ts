/** Anonymous data-carrier portrait. Never a photograph, identity reveal or story evidence. */
let carrier:HTMLCanvasElement|undefined,frame=-1;
export function drawIncomingSignal(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,time:number){
 carrier??=document.createElement('canvas');
 const next=Math.floor(time*7);
 if(carrier.width!==Math.round(w)||carrier.height!==Math.round(h)||frame!==next){
  carrier.width=Math.round(w);carrier.height=Math.round(h);frame=next;
  const g=carrier.getContext('2d')!;
  g.fillStyle='#020b04';g.fillRect(0,0,w,h);
  const glow=g.createRadialGradient(w*.5,h*.49,8,w*.5,h*.49,w*.49);
  glow.addColorStop(0,'#163316');glow.addColorStop(1,'#020903');g.fillStyle=glow;g.fillRect(0,0,w,h);
  const noise=(n:number)=>{const v=Math.sin(n*127.1+next*13.7)*43758.5453;return v-Math.floor(v);};
  g.font='bold 3.8px monospace';g.textBaseline='top';g.fillStyle='#c3ffab';
  const glyphs='0011010010110123456789';
  // All anatomy uses one scale: a wider terminal must not stretch the head or neck.
  const size=Math.min(h*.78,w*.42),top=(h-size)*.38;
  for(let row=top;row<top+size;row+=4.1){
   const v=(row-top)/size,head=(v-.245)/.235;
   let radius=Math.abs(head)<1?Math.sqrt(1-head*head)*size*.185:0;
   if(v>.39&&v<.64)radius=Math.max(radius,size*.09);
   if(v>.55)radius=Math.max(radius,size*(.09+Math.sin(Math.min(1,(v-.55)/.45)*Math.PI/2)*.36));
   if(!radius)continue;
   radius*=.92+noise(row+9)*.12;
   const offset=noise(row+3)>.96?(noise(row)-.5)*12:0;
   for(let col=w*.5-radius;col<w*.5+radius;col+=2.25){
    const n=noise(row*313+col);if(n<.18)continue;
    g.globalAlpha=.56+n*.44;g.fillText(glyphs[Math.floor(n*glyphs.length)],col+offset,row);
   }
  }
  g.globalAlpha=1;
  g.fillStyle='#00000022';for(let row=0;row<h;row+=2)g.fillRect(0,row,w,.5);
 }
 ctx.drawImage(carrier,x,y,w,h);
}
