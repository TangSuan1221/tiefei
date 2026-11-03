import {CRT_FONT} from '../crt-hud';
/** Local door instrument. Digits are dialled on rollers (pointer, wheel, drag or arrow keys);
 * there is no text entry. Dialogue inputs elsewhere remain free-form. */
export interface HarborDoorPanelOptions {
 /** No credential yet: the panel reports the lock and forwards an open request on close. */
 locked?:boolean;
 digits?:number;
 submit?:(code:string)=>string|null;
 onClose?:()=>void;
}
export function showHarborDoorPanel(options:HarborDoorPanelOptions){
 const {locked=false,digits=7,submit,onClose}=options;
 const previous=document.activeElement as HTMLElement|null;
 const values=Array<number>(digits).fill(0);
 const panel=document.createElement('dialog');panel.id='harbor-door-panel';panel.className=locked?'door-locked':'';
 panel.style.setProperty('--door-mono',CRT_FONT.mono);panel.style.setProperty('--door-pixel',CRT_FONT.pixel);
 const wheels=Array.from({length:digits},(_,i)=>`<div class="door-wheel" data-i="${i}"><button type="button" class="door-step" data-d="1" tabindex="-1" aria-label="第${i+1}位加一" ${locked?'disabled':''}>▲</button><div class="door-drum" role="spinbutton" tabindex="${locked?-1:0}" aria-label="第${i+1}位数字" aria-valuemin="0" aria-valuemax="9" aria-valuenow="0" ${locked?'aria-disabled="true"':''}><span class="door-prev"></span><span class="door-cur"></span><span class="door-next"></span></div><button type="button" class="door-step" data-d="-1" tabindex="-1" aria-label="第${i+1}位减一" ${locked?'disabled':''}>▼</button></div>`).join('');
 panel.innerHTML=`<form><div class="door-glass"><header><span>门控终端</span><b>${locked?'访问受限':'解锁程序'}</b><span>C-B</span></header><p class="door-title">第二道压力门 · 通行密码</p><p class="door-hint">${locked?'门锁已上电 · 需要通行密码':'拨动数字滚轮 · 上下拖动、滚轮或点击箭头'}</p><div class="door-wheels">${wheels}</div><p id="harbor-door-status" role="status">${locked?'本艇没有该门的授权记录 · 开门请求已转发总调度室':'门控连接就绪'}</p><footer><button type="button" class="door-cancel">${locked?'关闭':'取消'}</button>${locked?'':'<button type="submit">解锁并开门</button>'}</footer></div></form>`;
 const status=panel.querySelector<HTMLElement>('#harbor-door-status')!;
 const drums=[...panel.querySelectorAll<HTMLElement>('.door-drum')];
 const render=(i:number,dir=0)=>{
  const v=values[i],drum=drums[i];
  drum.querySelector('.door-prev')!.textContent=locked?'-':String((v+1)%10);
  drum.querySelector('.door-cur')!.textContent=locked?'-':String(v);
  drum.querySelector('.door-next')!.textContent=locked?'-':String((v+9)%10);
  drum.setAttribute('aria-valuenow',String(v));
  if(dir){drum.classList.remove('roll-up','roll-down');void drum.offsetWidth;drum.classList.add(dir>0?'roll-down':'roll-up');}
 };
 const step=(i:number,d:number)=>{if(locked)return;values[i]=(values[i]+d+10)%10;render(i,d);status.classList.remove('door-error');};
 values.forEach((_,i)=>render(i));
 panel.querySelectorAll<HTMLElement>('.door-wheel').forEach(wheel=>{
  const i=Number(wheel.dataset.i),drum=drums[i];
  wheel.querySelectorAll<HTMLButtonElement>('.door-step').forEach(b=>b.onclick=()=>{step(i,Number(b.dataset.d));drum.focus();});
  wheel.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();if(Math.abs(e.deltaY)>=1)step(i,e.deltaY<0?1:-1);},{passive:false});
  // Larger digits sit above: drag down or roll up to bring them into the window, 26px per digit.
  let dragY:number|null=null;
  drum.addEventListener('pointerdown',e=>{if(locked)return;dragY=e.clientY;drum.setPointerCapture(e.pointerId);drum.focus();});
  drum.addEventListener('pointermove',e=>{if(dragY===null)return;const dy=e.clientY-dragY;if(Math.abs(dy)>=26){step(i,dy>0?1:-1);dragY=e.clientY;}});
  const end=()=>{dragY=null;};drum.addEventListener('pointerup',end);drum.addEventListener('pointercancel',end);
 });
 const onKey=(event:KeyboardEvent)=>{
  event.stopImmediatePropagation();
  if(event.key==='Escape'){event.preventDefault();close();return;}
  const i=drums.indexOf(document.activeElement as HTMLElement);if(i<0)return;
  if(event.key==='ArrowUp'){event.preventDefault();step(i,1);}
  else if(event.key==='ArrowDown'){event.preventDefault();step(i,-1);}
  else if(event.key==='ArrowLeft'){event.preventDefault();drums[Math.max(0,i-1)].focus();}
  else if(event.key==='ArrowRight'){event.preventDefault();drums[Math.min(digits-1,i+1)].focus();}
 };
 let closed=false;
 const close=()=>{if(closed)return;closed=true;window.removeEventListener('keydown',onKey,true);panel.remove();previous?.focus();onClose?.();};
 panel.querySelector<HTMLButtonElement>('.door-cancel')!.onclick=close;
 panel.oncancel=e=>{e.preventDefault();close();};
 panel.querySelector('form')!.onsubmit=e=>{e.preventDefault();if(locked||!submit)return;const error=submit(values.join(''));if(error){status.textContent=error;status.classList.add('door-error');}else close();};
 document.body.append(panel);window.addEventListener('keydown',onKey,true);if(document.pointerLockElement)document.exitPointerLock();panel.showModal();
 (locked?panel.querySelector<HTMLElement>('.door-cancel')!:drums[0]).focus();
 return close;
}
