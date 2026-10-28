import {lockVideoCamera} from './fixed-camera';
export const LIVING_TASKS = {
 'L2-S01':{title:'入口设备',line:'我到人员侧了。你井底右前方，那个人旁边的托盘上有只黄色仪器匣。先取匣子，别动他。你的艇载相机留着；里面的移动摄像仪，从旁边传递口送给我，通话窗口能确认交接。',speech:'我到人员侧了。井底那只黄色仪器匣，取下来，从旁边传递口给我。',action:'He checks an empty equipment receiving cradle, then listens for the diver.'},
 'L2-S02':{title:'分头取证',line:'收到了，镜头还好。公司把下潜权限绑在调查影像上。你查机修间01，X53、Y24；压载库02，X108、Y26；中庭03，X166、Y60，都是1040米附近。我查人员侧第四处。这些是调查区域，别光拍门牌和设备。舷窗里未必看得见它们，按被动声纳的方位转过去，停稳、开灯取景，再去分析台看回片。声源会动，别守着旧方向等。漏一处，下面的门就不开。机修间有修补材料、备用电池和氧烛，收妥后在生命维持台按需用。配重在压载库，顺路取。别为了交差把艇撞穿。',speech:'我查第四处，你查三处。拍声源方向，不是门牌。停稳开灯，回片后确认收件。别硬挨撞。',action:'He seats the transferred compact camera, tests its lamp and points to his wrist checklist.'},
 'L2-S03':{title:'面罩污染',line:'罗温，停一下……我前面的房间全是热粘液菌。它们贴住面罩了，一层叠一层。我看不见门，连自己的手都看不清。先别催我走。你还听得见吗？',speech:'罗温，我的面罩被粘液菌糊住了。看不见门……你还听得见吗？',action:'A dense pale microbial film obscures his sealed visor. His gloved hand stops before touching it; he braces against the wall.'},
 'L2-S04':{title:'仍在等待',line:'还要多久？我没走，就在原地。你那边如果关好了，回我一声；如果还没找到，也直说。我看不见你，不知道该等还是退。',speech:'我还在原地。关好了就回我一声，没找到也直说。',action:'He stays braced at the same wall. The visor is still obscured; he checks his breathing slowly.'},
 'L2-S05':{title:'菌群消散',line:'对，就是这根。水流弱了……等一下。面罩边上透光了。很好，它们在散，我能看见门框了。你别再开回去。我沿人员通道查值班终端，南廊的隔离门要是锁着，叫我。',speech:'水流弱了。很好，菌群在散……我看见门框了。别再开回去。',action:'The nonaggressive microbial film slowly breaks into drifting flecks, revealing the opaque visor, never a face. He cautiously checks a doorway.'},
 'L2-S06':{title:'人员侧授权',line:'值班终端还亮着。我给南廊03隔离门下发了这一局的一次性授权，编号在回传里，门锁上会显示同一个。授权只在门旁有人确认时生效，你到门锁旁确认，门就开。别边开艇边看录像，停稳再过去。',speech:'终端还亮着。授权发到03门了，编号{code}。你到门旁确认，门就开。',action:'He presses a key on a wall duty terminal out of frame, then reads the four-digit authorization number it shows, pausing between each digit.'},
 'L2-S07':{title:'会合确认',line:'我到了，F闸门人员侧。第四处影像已经交了，你那三份也收到回执了。隔着门听见你的推进器，我才敢松口气。保持头盔密封，下面还不知道是什么。我走并行人员梯，你从东边下潜井下去，下一层接应。配重装好再降，频道别断。',speech:'我到了，F闸门人员侧。听见你的推进器了。你走东边下潜井，我走人员梯。',action:'He stands at the personnel side of the rendezvous hatch, confirms the same submarine engine sound, and gives a tired restrained nod.'}
} as const;
export type LivingTaskId=keyof typeof LIVING_TASKS;
export const LIVING_TASK_REFERENCE='/assets/harbor/elias-task-reference.png';
export function livingTaskLine(id:LivingTaskId,code:string){return LIVING_TASKS[id].line+(id==='L2-S06'?' 本局授权编号：'+code+'。':'');}
export function livingTaskPrompt(id:LivingTaskId,code:string,injured=false){const t=LIVING_TASKS[id];return lockVideoCamera([
 'REFERENCE: One sealed full-body front view of Elias, equipment reference only. Exactly one helmeted Elias. Replace the plain reference background with the specified passage.',
 'IDENTITY: Worn yellow sealed diving helmet, black drysuit, tan harness. The visor is an opaque black mirrored surface throughout every frame, never transparent or opened. No eyes, nose, mouth, skin or face can be visible, even while he speaks. Speech is helmet radio audio; do not reveal lips for lip sync. Never reveal identity or skin anomalies.',
 'LOCATION: Flooded living-deck personnel passage, human-sized infrastructure. All his travel exists only in this remote video, never a live level.',
 'ACTION: '+t.action+(injured?' Preserve minor shoulder injury, cautious arm movement.':' He is exhausted but able to move.'),
 'SPEECH: Natural brief Mandarin: '+t.speech.replace('{code}',code.split('').join('，')),
 id==='L2-S06'?'AUTHORIZATION NUMBER: '+code+'. Read these exact four digits; no different number.':'',
 'No generated subtitles. Exact coordinates, transcript and verified authorization number appear in the game interface. No unrequested creatures, cuts or third-person camera.'
 ].join('\n'),'elias-selfie');}
