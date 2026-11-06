import {HARBOR_REFERENCES} from './harbor-video-references';
import {lockVideoCamera} from './fixed-camera';
import {HARBOR_R28_TASKS} from './harbor-r28-videos';
import {subtitleLines} from './video-subtitles';
const place='a dry harbor security room, closed personnel door behind him';
export const HARBOR_TASKS = {
 ...HARBOR_R28_TASKS,

 'L1-E01': {title:'接驳岗呼叫',line:'接驳岗呼叫，X11，Y16，深度1012米。收到请回复。这是你先到的入口接驳点，不是我的位置。穿过压力门和维修湾，才到主港。我是艾里亚斯，比你先到的调查员。八个小时了，我还以为不会有人来了。先把主动声纳关掉，快。',speech:'坐标是入口，不是我这儿。收到请回复。八个小时了……先关主动声纳，快。',place,action:'He checks his wrist clock, leans toward the lens with relief, then urgently gestures for quiet.',target:[11,0,16]},
 'L1-E04': {title:'声纳警告',line:'这座基地养过不少海洋实验生物。事故以后，实验舱还能不能关住它们，没人知道。被动声纳留着听；主动声纳一通电就持续发声，能测地形，也可能把东西招来。你需要它的时候再开。',speech:'实验舱还关不关得住它们，我不知道。被动留着听，主动声纳要小心用。',place,action:'He lowers his voice and listens at the closed door without opening it.',target:[11,0,16]},
 'L1-E05': {title:'被困安保室',line:'我到的时候，水还没漫过接驳台。我穿好潜水服进了安保室，想从里面查。刚关上门，外面就开始撞——我的驾驶舱，接着是升降机。现在升降机断了，艇也回不去。我在主港北侧安保室，隔着水道面对你要去的01面板。内侧逃生门也断电了，外面还有那东西，我不敢出去。',speech:'我刚进安保室，它就撞了驾驶舱，连升降机也撞断了。我被困在门后。',place,action:'He points back at the door, steadies his breathing and describes the attack from memory. Do not show a flashback.',target:[60,0,27]},
 'L1-E06': {title:'门外的东西',line:'什么东西？没看清。大王乌贼？我不知道，别把这个写成结论。我只知道，外面一响，它就撞过来。刚才还在那边……你听。',speech:'大王乌贼？我没看清，别当成结论。外面一响，它就撞过来。你听。',place,action:'He starts to offer a guess, stops himself, then freezes at a sound beyond the door.',target:[60,0,27]},
 'L1-E02': {title:'货仓诱导',line:'它来了。不能再耗在这里。02配电箱，X42、Y28、深度1012米，先用机械臂接电，这路电也供我的内侧逃生门；先隔离外面的东西，我再走。然后去01，X60、Y27，同一深度，开货仓闸门。进仓后去X77、Y7、深度1011米，开启主动声纳引它进来。声源转进仓内就关主动声纳，停稳、收臂、拍摄，送分析台留给公司核对。关声纳不保证它立刻停下，别猛踩推进。看清完整入仓，再回01落闸。',speech:'这路电也开我的逃生门。先接电开货仓，引它进去，停声纳拍清楚，再回来关闸。',place,action:'He regains control of his breathing and points to a cargo circuit diagram beside his shoulder.',target:[42,0,28]},
 'L1-E07': {title:'确认行动结果',line:'你那边怎么样？它关进去了吗？我看不到水道，得靠你告诉我。没完成就直说；让我等，我就等。别拿猜的当确认。',speech:'成功了吗？它关进去了吗？没完成就直说。让我等，我就等。',place,action:'He holds one hand near the personnel door latch but does not open it yet.',target:[60,0,27]},
 'L1-E08': {title:'受伤回传',line:'等一下——它还在外面！……我把门顶回去了。肩膀擦伤，手还能动。先让我把带子勒紧。你刚才说的，我听见了；下次把看见的和猜的分开。这里还能绕进值班室，我慢一点走。',speech:'它还在外面！肩膀擦伤，手还能动。下次，把看见的和猜的分开。',place,action:'Inside the closed security room, he presses his gloved hand to an injured shoulder. Minor injury, no gore; he can still walk.',target:[60,0,27]},
 'L1-E03': {title:'安全区回执',line:'我进值班室了，门锁上了。回港通道塌了，你别折返。从01下潜到生活区，我沿人员通道慢慢走。到生活区末端的密码闸门再碰头。频道留着。',speech:'我到值班室了。你从零一下潜，我走人员通道。生活区的密码闸门见。',place:'a dry harbor duty-room refuge, latched personnel door behind him',action:'He checks the closed door latch, then looks into the camera. He has actually reached safety.',target:[60,0,27]}
} as const;
export type HarborTaskId=keyof typeof HARBOR_TASKS;
/** Elias names himself in V02; calls before that come from an unknown source. */
export const harborCaller=(id:HarborTaskId)=>id==='L1-R28-V01'||id==='L1-R28-V02'||id==='L1-E01'?'未知来源':'艾里亚斯';
/** Chinese localized subtitles preserve the source meaning; generated Elias audio is English. */
export const harborTaskSubtitles=(id:HarborTaskId)=>subtitleLines('艾里亚斯',HARBOR_TASKS[id].speech);
export const HARBOR_TASK_REFERENCE=HARBOR_REFERENCES.story;
/** A communication is one complete generation, never sentence-sized clips. */
export function harborSpeechParts(id:HarborTaskId){return [HARBOR_TASKS[id].speech];}
export function harborTaskPrompt(id:HarborTaskId,injured=false,replySpeech?:string){const t=HARBOR_TASKS[id];return lockVideoCamera([
 'REFERENCE: Primary image is the Elias story portrait; additional images define his character equipment and dispatch room, not an exact opening composition. Use exactly one helmeted Elias; discard sheet layout, labels, white background and all unhelmeted views.',
 'IDENTITY: Worn yellow diving helmet, opaque dark visor, black diving drysuit, tan harness. Helmet stays sealed; no visible face or body anomaly.',
 'LOCATION: '+t.place+'. Dry floor, breathable air, normal gravity; no underwater particles or bubbles around Elias.',
 'ACTION: '+(replySpeech?'He answers over his helmet camera from his current location. Stay in place; do not perform a mission action or reenact the previous message.':t.action)+(injured?' Preserve a minor shoulder injury and guarded arm movement; he can walk.':' No injury unless explicitly described in ACTION.'),
 'SPEECH SOURCE (Chinese localization): Render the following meaning faithfully in natural spoken English only: '+(replySpeech??t.speech),
 'DELIVERY: One continuous complete message. Speak the supplied meaning once, in order; do not repeat lines, restart the message, or create separate parts.',
 'MESSAGE: No subtitles or text generated in the picture; the game displays the exact task and coordinates separately.',
 'No other characters, creature, hidden identity reveal, space setting or cinematic cut.'
 ].join('\n'),'elias-selfie');}
