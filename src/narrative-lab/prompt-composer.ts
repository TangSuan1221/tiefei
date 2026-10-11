import {FIXED_CAMERA_CONTRACT} from '../pod/content/fixed-camera';
import library from './prompt-library.json' with {type:'json'};
import type {StoryScene,Choice} from './types';
export function composeBranchPrompt(scene:StoryScene,choice:Choice){
 return composeShot(scene,choice.id,choice.resultText);
}
export function composeScoutPrompt(scene:StoryScene){
 return composeShot(scene,'@scout',scene.scoutFootage);
}
function composeShot(scene:StoryScene,choiceId:string,sourceText:string){
 const fail=(reason:string)=>({prompt:null as string|null,storyboard:null as string|null,note:'GAP · '+reason});
 if(scene.observation!=='camera'&&scene.observation!=='mobile-camera')return fail('非光学观察不生成现场视频。');
 const shot=library.shots.find(s=>s.sceneId===scene.id&&s.choiceId===choiceId);
 if(!shot)return fail('缺少已审查镜头：须补齐外观、空间、可见动作与结果边界，不能直接使用剧情段落。');
 if(shot.sourceResult!==sourceText||shot.observation!==scene.observation)return fail('剧情结果或摄影方式变化，镜头需要重新审查。');
 const catalog=library.profiles as Record<string,{description:string;sources:string[]}>;
 const profiles=shot.profiles.map(id=>catalog[id]);
 if(profiles.some(p=>!p?.description||!p.sources.length))return fail('缺少角色外观或来源。');
 const prompt=[shot.subject,`DURATION: ${library.duration} seconds, one continuous shot.`,...profiles.map(p=>p.description),'SETTING: '+shot.space,'CAMERA: '+shot.camera+' '+FIXED_CAMERA_CONTRACT,'LIGHT: '+shot.light,'TIMING: '+shot.beats.join(' '),'AUDIO: '+shot.audio,'END STATE: '+shot.endState,library.style,'No additional people, bodies, creatures or props. Do not reveal hidden identities, biological origins or later events.'].join('\n\n');
 if(prompt.length>library.maxCharacters||/[{}\p{Script=Han}]/u.test(prompt))return fail('长度或未解析内容校验失败。');
 return {prompt,storyboard:'storyboard' in shot && typeof shot.storyboard==='string'?shot.storyboard:null,note:`${shot.id} · ${library.duration}秒连续镜头 · 曝光时锁定 · 文生测试，未生成视频。来源：${[...new Set([...shot.sources,...profiles.flatMap(p=>p.sources)])].join('、')}`};
}
