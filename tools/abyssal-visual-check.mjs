import {openLevelTwo} from './living-browser-lib.mjs';
import {writeFile} from 'node:fs/promises';
const {browser,page,errors}=await openLevelTwo('qa/level-03/visual',{query:'?level=3'});
try{
 // Match the canvas buffer aspect to its CSS viewport; avoid stretching 16:10
 // renders into the browser helper's default 16:9 screenshot.
 await page.setViewportSize({width:1280,height:800});
 await page.locator('[data-id="new"]').click();await page.waitForFunction(()=>window.__abyss,null,{timeout:120000});
 await page.evaluate(()=>window.__abyss.world.ready);await page.waitForTimeout(1800);
 const shots=['quarantine','gallery','pit','crane','bottom','plant','dome','gallery_close','plant_close','dome_close','entry_guidance','medical_player','quarantine_facility','dome_service'].filter(name=>!process.env.ABYSS_SHOTS||process.env.ABYSS_SHOTS.split(',').includes(name));
 for(const name of shots){
 const stats=await page.evaluate(async name=>{const s=window.__abyss,r=window.__pod,l=await import('/src/pod/content/abyssal-lab-layout.ts');let p,h,pitch=0;
 if(name==='medical_player'){p=[-95.8,0,-81.1];h=18;pitch=11;}
 if(name==='quarantine_facility'){p=l.spiralPoint(.56);h=l.headingTo(p,l.spiralPoint(.56,12,-1));pitch=5;}
 if(name==='dome_service'){p=[-17,-6,-4];h=l.headingTo(p,[-29.9,-8.7,-5.4]);pitch=10;}
 if(name==='entry_guidance'){p=[-114,0,-27.4];h=l.spiralHeading(.235);} if(name==='quarantine'){p=l.spiralPoint(.5);h=l.spiralHeading(.5);}
 if(name==='gallery'){p=l.spiralPoint(1.4);h=l.spiralHeading(1.4);}
 if(name==='pit'){p=l.pitAt(l.PIT_ENTRY_ANGLE,27,1);h=l.headingTo(p,l.pitAt(l.PIT_ENTRY_ANGLE+Math.PI,20,-20));pitch=15;}
 if(name==='crane'){const target=l.spiralPoint(5.26);const a=Math.atan2(target[2]-l.PIT.centre[2],target[0]-l.PIT.centre[0]);p=l.pitAt(a,18,1);h=l.headingTo(p,target);pitch=2;}
 if(name==='bottom'){p=l.ABYSS_PHOTO_STATIONS.find(s=>s.id==='P05').position;h=l.ABYSS_PHOTO_STATIONS.find(s=>s.id==='P05').heading;}
 if(name==='plant'){p=l.spiralPoint(6.31,0,-9);h=l.spiralHeading(6.31);}
 if(name==='dome'){p=[20,-4,10];h=l.headingTo(p,[0,-8,0]);} if(name==='gallery_close'){p=l.spiralPoint(1.35,.5,-1);h=l.headingTo(p,l.spiralPoint(1.37,4.1,-1));} if(name==='plant_close'){const st=l.ABYSS_PHOTO_STATIONS.find(s=>s.id==='P02');p=st.position;h=st.heading;pitch=-st.pitch;} if(name==='dome_close'){p=[6,-6.5,6];h=l.headingTo(p,[0,-8.5,0]);pitch=12;}
 s.position.set(...p);r.heading=h;r.pitch=pitch;r.lamp=true;r.power=1;r.pilot.stop();r.camPan=0;r.camTilt=0;s.world.setFocus(p);s.world.update({time:4,collected:[],sluiceOpen:true,pressOpen:true,drainOpen:true});
 let c=document.getElementById('art-review');if(!c){c=document.createElement('canvas');c.id='art-review';document.body.append(c);Object.assign(c.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',zIndex:999999});}c.width=1280;c.height=800;const before=performance.now();s.draw(c.getContext('2d'),1280,800,4,true);return {meshes:s.world.root.children.length,practicalLights:s.world.practicalLights.length,drawMs:performance.now()-before};},name);
 await page.locator('#art-review').screenshot({path:`qa/level-03/visual/${name}.png`});console.log(name,stats);
 }
 await writeFile('qa/level-03/visual/errors.json',JSON.stringify(errors,null,2));console.log(errors);
}finally{await browser.close();}




