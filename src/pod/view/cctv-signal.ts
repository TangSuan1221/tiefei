/** Shared playback-only CCTV signal. Source media and game evidence are never modified. */
type Source = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;
export interface CctvOptions { time:number; corruption?:number }
const vertex = `attribute vec2 aPosition; varying vec2 uv;
void main(){uv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}`;
const fragment = `precision highp float;
varying vec2 uv; uniform sampler2D image; uniform sampler2D history;
uniform vec2 resolution; uniform float clock; uniform float damage; uniform float trail;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 sampleAt(vec2 p){return texture2D(image,clamp(p,vec2(.001),vec2(.999))).rgb;}
void main(){
 vec2 px=1./resolution;
 // Irregular packets with a soft attack and exponential recovery, separated by quiet holds.
 float cycle=floor(clock/4.7),phase=mod(clock,4.7);
 float onset=.7+hash(vec2(cycle,3.))*1.6;
 float age=phase-onset;
 float envelope=smoothstep(0.,.075,age)*exp(-max(age,0.)*5.5);
 float centerY=.12+.76*hash(vec2(cycle,8.));
 float band=exp(-pow((uv.y-centerY)/.028,2.));
 float packet=envelope*band*damage;
 float drift=(noise(vec2(uv.y*6.,clock*.32))-.5)*.32;
 float shift=drift+packet*(1.2+.8*sin(uv.y*160.));
 vec2 p=uv+vec2(shift*px.x,0.);
 vec3 center=sampleAt(p);
 // Luma retains full source detail; only colour has reduced transmission bandwidth.
 float y=luma(center);
 vec3 left=sampleAt(p-vec2(px.x*(.65+packet*1.5),0.));
 vec3 right=sampleAt(p+vec2(px.x*.65,0.));
 vec3 chroma=(left-vec3(luma(left)))*.22+(right-vec3(luma(right)))*.22+(center-vec3(y))*.56;
 vec3 colour=vec3(y)+chroma*.97;
 colour=mix(colour,texture2D(history,uv).rgb,trail);
 // Fine, temporally interpolated sensor grain, strongest in shadows. No block noise.
 float tick=clock*30.,blend=smoothstep(0.,1.,fract(tick));
 vec2 cell=floor(uv*resolution);
 float grain=mix(hash(cell+vec2(mod(floor(tick),193.),17.)),hash(cell+vec2(mod(floor(tick)+1.,193.),17.)),blend)-.5;
 colour+=grain*(.006+.014*pow(1.-y,2.))*(1.+damage*.55);
 // Broad travelling hum and fine line noise are distinct frequency layers.
 float hum=sin(uv.y*13.-clock*.48)*sin(uv.y*4.+clock*.19);
 float line=noise(vec2(uv.y*resolution.y*.5,clock*8.))-.5;
 colour*=1.+damage*(hum*.009+line*.008-packet*.035);
 colour*=1.-.004*(.5+.5*cos(uv.y*resolution.y*3.14159265));
 vec2 edge=uv*2.-1.;colour*=1.-.025*pow(dot(edge,edge)*.5,2.);
 gl_FragColor=vec4(clamp(colour,0.,1.),1.);
}`;
class CctvSignal {
 readonly canvas=document.createElement('canvas');
 private gl:WebGLRenderingContext;
 private program:WebGLProgram;
 private sourceTexture:WebGLTexture;
 private previousTexture:WebGLTexture;
 private source:Source|null=null;
 private time=NaN;
 private damage=-1;
 constructor(){
  const gl=this.canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true});
  if(!gl)throw Error('CCTV WebGL unavailable');this.gl=gl;
  const compile=(type:number,code:string)=>{const s=gl.createShader(type)!;gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error('CCTV shader: '+message);}return s;};
  const vs=compile(gl.VERTEX_SHADER,vertex),fs=compile(gl.FRAGMENT_SHADER,fragment);
  const program=gl.createProgram()!;gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('CCTV shader link failed');this.program=program;gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
  const position=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const texture=(unit:number)=>{gl.activeTexture(gl.TEXTURE0+unit);const t=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;};
  this.sourceTexture=texture(0);this.previousTexture=texture(1);
  gl.uniform1i(gl.getUniformLocation(program,'image'),0);gl.uniform1i(gl.getUniformLocation(program,'history'),1);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,1);
 }
 render(source:Source,sw:number,sh:number,options:CctvOptions):HTMLCanvasElement|null{
  const gl=this.gl;if(gl.isContextLost())return null;
  const scale=Math.min(1,1080/sh,1920/sw),w=Math.max(2,Math.round(sw*scale)),h=Math.max(2,Math.round(sh*scale));
  const damage=Math.max(0,Math.min(1,options.corruption??0));
  const resize=this.canvas.width!==w||this.canvas.height!==h;
  const reset=resize||this.source!==source||options.time<this.time||options.time-this.time>.25;
  if(!resize&&this.source===source&&this.time===options.time&&damage===this.damage)return this.canvas;
  if(resize){this.canvas.width=w;this.canvas.height=h;gl.viewport(0,0,w,h);}
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.previousTexture);
  if(reset)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.sourceTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
  gl.uniform2f(gl.getUniformLocation(this.program,'resolution'),w,h);
  gl.uniform1f(gl.getUniformLocation(this.program,'clock'),options.time%4096);
  gl.uniform1f(gl.getUniformLocation(this.program,'damage'),damage);
  gl.uniform1f(gl.getUniformLocation(this.program,'trail'),reset?0:.025);
  gl.drawArrays(gl.TRIANGLES,0,6);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.previousTexture);gl.copyTexSubImage2D(gl.TEXTURE_2D,0,0,0,0,0,w,h);
  this.source=source;this.time=options.time;this.damage=damage;return this.canvas;
 }
}
let signal:CctvSignal|undefined,unavailable=false;
/** Letterbox instead of cropping evidence. Subtitles are drawn afterwards by the caller. */
export function drawCctvSignal(ctx:CanvasRenderingContext2D,w:number,h:number,source:Source,options:CctvOptions):void{
 const sw=source instanceof HTMLVideoElement?source.videoWidth:source instanceof HTMLImageElement?source.naturalWidth:source.width;
 const sh=source instanceof HTMLVideoElement?source.videoHeight:source instanceof HTMLImageElement?source.naturalHeight:source.height;
 if(!sw||!sh||w<=0||h<=0)return;
 let frame:CanvasImageSource=source;
 if(!unavailable)try{signal??=new CctvSignal();frame=signal.render(source,sw,sh,options)??source;}catch(error){unavailable=true;console.warn('CCTV signal unavailable; preserving original playback.',error);}
 const scale=Math.min(w/sw,h/sh),dw=sw*scale,dh=sh*scale;
 ctx.save();ctx.fillStyle='#020403';ctx.fillRect(0,0,w,h);ctx.imageSmoothingEnabled=true;ctx.drawImage(frame,(w-dw)/2,(h-dh)/2,dw,dh);ctx.restore();
}
