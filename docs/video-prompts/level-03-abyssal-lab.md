# 第三关视频提示词库：深渊生物研究所《术前检查》

本库只服务第三关（-2层）。剧情与流程见 `docs/level-03-abyssal-lab-design.md`，录像剧本见 `docs/level-03-elias-tapes.md`，剧情状态机见 `src/story-pipeline/level-03.ts`。
条目：`VR-3xx` 本关规则，`VP-3xx` 每一段要生成的视频。拼装与检查：`npx tsx tools/level-03-video-prompt-check.ts`。

状态总览：提示词已写（REQUIRED）。第三关场景、艾里亚斯机位截图、录像回复链路都还没做（NOT_IMPLEMENTED）。没有生成过任何一段真实视频，画面效果未验证。

2026-11-06 当前执行规则：同一镜头ID只生成一条完整录像；下列历史“段”仅是有序动作素材，不再分别提交。剧情按内容选择时长且不超过15秒，玩家摄影5秒；完整提示词上限7000字符。E10使用能覆盖人物、手术台、头盔架和阀门的单一固定机位，保留抓住、摘盔、无气泡、戴回头盔及开阀的顺序；历史分段机位和各段0–10秒时间轴不再是运行契约。实际整条演出尚待实片验收。

## VR-301 本关录像怎么拼

状态：REQUIRED。关键词：第三关 艾里亚斯 探头 录像回复 分段 固定机位 拼装 字幕。

**两种视频**

| 类型 | 谁拍的 | 每段时长 | 正文上限 |
|---|---|---|---|
| elias-story | 艾里亚斯的摄像探头 | 按内容选择，≤15秒，整条一次生成 | 7000字符 |
| player-capture / player-action | 罗温潜艇的固定摄像头 | 5秒 | 2200字符 |

上限按最终提交的全文计算，包括网络层参考图说明与所选自拍／固定机位条款（`src/pod/content/fixed-camera.ts`）。

**2026-10-24 用户修订：艾里亚斯任务回传采用宇航员式手持自拍。** 只借用臂长自拍构图，不改变潜水服、头盔、地点或剧情。使用原子词典 `src/pod/content/elias-video-atoms.ts`，任务ID选择对应参考图；允许轻微手持摆动和展示证据的小幅转腕。玩家摄影保持固定机位。VP-313至315是探头被夺落地后的既定剧情录像，保留落地固定视角，不改成第三人称电影镜头。

**拼装顺序**：类型前缀 → 本段正文（槽位按剧情状态机选中的表演替换）→ 统一后缀。槽位名与 `src/story-pipeline/level-03.ts` 中各镜头的 slot 名一致，槽位键与表演 key 一致；状态机选中哪个表演，就替换成哪句英文。

**说话与文字**：
- 他说的话不写进视频提示词。游戏在播放录像时显示字幕并配语音，视频里他只做“对着镜头说话”的动作。他的面罩是深色的，看不见嘴型，不需要对口型。字幕取自状态机选中表演的 `dialogue`，字体、字号、位置与时间按 [VR-116](./structured-prompt-standard.md)；录像原声照常播放。游戏配语音尚未实现（GAP）。
- 墙上告示、槽号这类要玩家看清的字，来自运行时上传的现场截图（游戏场景里真实贴着的标牌）。提示词只要求“保持截图里的字和排版不变”，不让模型自己写字。重要内容同时出现在字幕里，不依赖模型画对字。

**首帧图从哪来**：
- **罗温的照片**：取潜艇当时的真实截图（VR-107），因为水道和收容环会做成可驾驶的关卡。
- **艾里亚斯的录像**：用户2026-10-23决定，他走过的地方不做成关卡，只用视频呈现。所以他的录像不截游戏画面，而是每个地点用一张固定的“地点首帧图”作为首帧上传，生产图放在 public/assets/abyssal/plates/ 目录里，编号见参考图提示词第16至21张以及第6、8张。同一地点的几卷共用同一张图，保证前后一致。这条是对 VR-107 中“艾里亚斯剧情取其坐标锚定的场景机位截图”在第三关的替代，原因是第三关没有他那一侧的场景可截。地点首帧图生成好之前，这些提示词只能离线预览，不能提交（GAP）。

| 地点首帧图 | 用于 |
|---|---|
| 16 检疫更衣室 | VP-301、VP-302、VP-303 |
| 17 实验室走廊 | VP-304 |
| 6 收容环监控室 | VP-305、VP-306、VP-321、VP-322 |
| 18 车间控制室 | VP-307、VP-308 |
| 8 术前准备室 | VP-309、VP-310 |
| 19 手术室环形挑台 | VP-311、VP-312 |
| 20 手术台近景（探头落地视角） | VP-313、VP-314、VP-315 |
| 21 竖井检修平台 | VP-316 |

```probe-prefix
SHOT CONTRACT: a continuous Elias mission selfie. Use the supplied task image for the same diver, equipment, location and evidence; reframe as his handheld self-recording. Follow the selected performance and authored outcome only.
```

```fallen-probe-prefix
SHOT CONTRACT: a continuous recording from the same probe after it has fallen onto the floor during the authored incident. Use the supplied operating-table task reference. No added observer or new event.
```

```pod-prefix
SHOT CONTRACT: one continuous five-second recording from the fixed exterior camera of a small research submarine, looking out through flooded water. The supplied reference image is the spatial authority: keep its structures, signs and perspective. Do not add rooms, people, bodies, text or events that are not in that image.
```

```suffix
Low-light analogue video: light grain and interlace that never hide the subject, readable midtones, condensation at the lens edge. Colour limited to rust orange warm light, blue-black shadows, bone-white highlights and warning red; no green, teal or cyan tint, no night-vision look. No captions, subtitles, user interface, timecode or watermark. In-world signs keep exactly the lettering and layout of the reference image; never invent or alter lettering. No daylight, no water surface, no coral, no tropical fish, no cult imagery, no gore.
```

## VR-302 正典与剧透禁区

状态：REQUIRED。关键词：剧透 头盔 呼吸 合格 第三关 艾里亚斯 正典。

- **第10卷之前**，任何一段都不能暗示艾里亚斯不是普通人：不写呼吸异常、气泡、皮肤、面孔，他一直戴着头盔。他会冷、会喘、会怕，要像一个普通的、受惊的潜水员。
- **第10卷**才摘头盔。只写“脸在水里，没有气泡，平静”。他的面孔尚未定稿，提示词只写成年男性、眼睛睁着、表情平静，具体五官以角色参考截图为准；没有参考图前该段标GAP，不让模型自己定脸。
- 不出现Panacea、病毒、感染、实验药名、邪教、神像。护理员是“机器化的深海生物”，不解释来源。
- 护理员在第4卷只露一条腿，第7卷只有门外掠过的影子，第8卷是照片里的它，第9卷之后才在潜艇照片里完整出现。不能提前让它完整出镜。
- 只演录像拍下的那一刻，不补演之前的操作，不演之后才发生的结果。

## VR-303 本关出镜角色与生物外观

状态：REQUIRED。关键词：外观 档案 艾里亚斯 护理员 缝合鳗 温床水母 第三关。

每段只注入本段真正出镜的角色。外观逐物种定义，不互相借用（VR-110）。

```elias-profile
One adult male diver about 1.73 m tall in a dark dry suit with a brown canvas harness and chest pouches, gloved hands, and an ochre-yellow hard diving helmet with a dark tinted faceplate that hides his face completely; a small lamp on the helmet.
```

```caretaker-profile
A giant deep-sea spider rebuilt as a medical machine: a small pale oval body slung between more than a dozen extremely long, thin legs that bend backwards at the joints; several leg tips end in steel surgical forceps and mechanical clamps; a torn white surgical drape hangs from the body. It moves slowly, precisely and patiently, like a nurse; abyssal Lovecraftian horror through scale and calm, not through gore.
```

```eel-profile
Pale eel-like creatures several metres long, each body made of three or four eels sewn end to end with dark surgical sutures; the seams bulge, the small eyes are clouded.
```

```jelly-profile
Thousands of thumbnail-sized translucent jellyfish with faint warm amber cores, packed in shifting clumps.
```

## VP-301 第1卷第1段：分头走

状态：REQUIRED。关键词：第1卷 检疫更衣室 通话 开场 elias-story。
镜头：L3-E01 · 段1/2 · elias-story

```prompt
SUBJECT: one diver in a dry quarantine locker room speaks to the handheld selfie probe. {elias}
SETTING: a narrow locker room with open grey lockers on both sides, a wet tiled floor with a thin film of water, a wall-mounted data terminal with a cable running to the probe.
TIMING: 0-4 s he leans toward the lens, breathing hard, shoulders rising and falling, and taps the terminal cable once. 4-8 s he gestures toward himself and then toward the lens, explaining. 8-10 s he steadies his camera-holding arm.
CAMERA: arm-length self-recording, helmet and upper torso close to the lens; his free glove shows the stated task evidence beside him. Keep any authored background threat visible over his shoulder; only a small wrist turn when needed.
LIGHT: his helmet lamp and one flickering ceiling tube; deep shadows between the lockers.
END: his gloved hand fills the lower corner of the frame as he reaches for the probe.
LIMITS: one person only; he never removes the helmet; no other figures.
```

## VP-302 第1卷第2段：地图和宁神剂告示

状态：REQUIRED。关键词：第1卷 地图 宁神剂 告示 elias-story。
镜头：L3-E01 · 段2/2 · elias-story

```prompt
SUBJECT: the diver stands beside a large wall map and a medicine notice and points at them. {elias}
SETTING: the same locker room wall: a large printed facility map shaped like a spiral shell with the centre marked, and beside it a white notice board with a red cross; the lettering is exactly as in the reference image.
TIMING: 0-4 s he traces the spiral on the map with one gloved finger from the outer edge to the centre and taps the centre twice. 4-8 s he moves to the notice with the red cross and taps it. 8-10 s he turns his helmet toward the lens and nods once.
CAMERA: arm-length self-recording, helmet and upper torso close to the lens; his free glove shows the stated task evidence beside him. Keep any authored background threat visible over his shoulder; only a small wrist turn when needed.
LIGHT: his helmet lamp lights the map and the notice; the rest of the room stays dim.
END: he stands beside the notice facing the lens.
LIMITS: do not redraw or change any lettering on the map or notice; one person only.
```

## VP-303 第2卷：头盔卡扣

状态：REQUIRED。关键词：第2卷 尸体 头盔 卡扣 elias-story。
镜头：L3-E02 · 段1/1 · elias-story

```prompt
SUBJECT: the diver answers the lens, then kneels beside a drowned worker lying on the locker-room floor. {elias}
SETTING: the wet locker-room floor; a dead worker in white lab overalls lies on his side in shallow water, no helmet, hair spread in the water; around his neck the metal helmet ring is still attached and its latch is open.
TIMING: 0-3 s {reply} 3-7 s he kneels beside the body and points at the open latch on the neck ring. 7-10 s he stays kneeling, looking at the latch, then slowly looks up toward the lens.
CAMERA: arm-length self-recording, helmet and upper torso close to the lens; his free glove shows the stated task evidence beside him. Keep any authored background threat visible over his shoulder; only a small wrist turn when needed.
LIGHT: his helmet lamp makes a hard pool of light on the body and the latch.
END: he kneels beside the body facing the lens.
LIMITS: the dead worker does not move; no wounds or gore; no face close-up of the dead worker.
```

```slots
{"reply":{"shivers":"He lifts a trembling gloved hand to the lens; his faceplate is fogged.","stung":"He stops, lowers his head for a moment, then turns away from the lens.","nods":"He nods slowly at the lens.","plain":"He nods once at the lens and turns toward the body."}}
```

## VP-304 第3卷：钥匙在3号舱

状态：REQUIRED。关键词：第3卷 实验室 钥匙箱 控制室 淹没 elias-story。
镜头：L3-E03 · 段1/1 · elias-story

```prompt
SUBJECT: the diver stands in a dry laboratory corridor beside a locked control-room door with a large notice. {elias}
SETTING: a curved corridor; a heavy locked door with a large printed notice; beside it a thick side window through which a fully flooded laboratory room is visible, and on that room's far wall hangs a small red box.
TIMING: 0-3 s {reply} 3-6 s he taps the notice on the door. 6-10 s he points through the side window at the red box in the flooded room, then at a small square hatch in the wall below the window.
CAMERA: arm-length self-recording, helmet and upper torso close to the lens; his free glove shows the stated task evidence beside him. Keep any authored background threat visible over his shoulder; only a small wrist turn when needed.
LIGHT: his helmet lamp and weak emergency strips; the flooded room beyond the glass is dark blue-black with the red box catching a little light.
END: he stands with one hand on the small hatch, facing the lens.
LIMITS: he does not open the door; water stays behind the glass; one person only.
```

```slots
{"reply":{"fine":"He gives the lens a small thumbs-up.","points":"He jabs a finger at the notice on the door, impatient.","plain":"He turns toward the locked door."}}
```

## VP-305 第4卷：警报和身后的腿

状态：REQUIRED。关键词：第4卷 收容环 监控室 红色警报 腿 恐怖 elias-story。
镜头：L3-E04 · 段1/1 · elias-story

```prompt
SUBJECT: the diver stands in a monitoring room under a sweeping red alarm light, talking to the lens, while something appears in the doorway behind him. {elias}
SETTING: a small curved monitoring room, a wall of monitors showing rows of containment cells, an alarm panel with six large buttons; behind him an open doorway to a dark corridor.
TIMING: 0-3 s {reply} 3-6 s he points at the monitor wall and then at the six alarm buttons. 4-7 s behind him, centred in the open doorway, one extremely long thin leg that bends backwards at the joint lowers slowly from above into view, its tip a steel clamp; it hangs still for three seconds. 7-8 s the leg withdraws upward out of sight. 8-10 s he spreads his hands toward the lens as if asking a question; he never turns around.
CAMERA: arm-length self-recording, helmet and upper torso close to the lens; his free glove shows the stated task evidence beside him. Keep any authored background threat visible over his shoulder; only a small wrist turn when needed.
LIGHT: a rotating red warning light sweeps the room every second; between sweeps only the monitors glow.
END: he faces the lens; the doorway behind him is empty.
LIMITS: only the single leg is visible, never the body; the leg does not touch him; he does not notice it.
```

```slots
{"reply":{"covers_helmet":"He presses both gloved hands to the sides of his helmet in the red strobe.","shouting":"He leans close to the lens, shoulders tense, as if shouting over noise."}}
```

## VP-306 第5卷：回头

状态：REQUIRED。关键词：第5卷 警报 回头 刮痕 elias-story。
镜头：L3-E05 · 段1/1 · elias-story

```prompt
SUBJECT: the diver in the monitoring room acts on the alarm decision. {elias}
SETTING: the same monitoring room, the alarm panel with six buttons, the open doorway behind him.
TIMING: 0-4 s {alarm} 4-10 s {behind}
CAMERA: arm-length self-recording, helmet and upper torso close to the lens; his free glove shows the stated task evidence beside him. Keep any authored background threat visible over his shoulder; only a small wrist turn when needed.
LIGHT: as the alarm decision leaves it; his helmet lamp always on.
END: the final position described above.
LIMITS: nothing enters the doorway in this clip; no creature is visible.
```

```slots
{"alarm":{"alarm_off":"He presses the alarm buttons; the red strobe dies and only dim white emergency light remains.","alarm_kept":"He looks at the alarm buttons and leaves them; the red light keeps sweeping."},"behind":{"turns":"He spins around toward the empty doorway; at the top of the door frame there is a fresh long scratch in the paint. He stands still, staring at it, then slowly turns back to the lens.","walks_off":"He picks up something from the desk near the lens and walks out through the empty doorway, leaving the room empty."}}
```

## VP-307 第6卷：水母警告牌

状态：REQUIRED。关键词：第6卷 生产车间 控制室 水母 警告牌 elias-story。
镜头：L3-E06 · 段1/1 · elias-story

```prompt
SUBJECT: the diver in a production control room shows a large warning sign and a row of breakers. {elias}
SETTING: a control room with half-burnt labels, temperature gauges whose needles are falling, a row of eight numbered breakers, and a large printed warning sign on the wall.
TIMING: 0-3 s {reply} 3-6 s he taps the warning sign. 6-10 s he runs a finger along the row of eight breakers, holds up three fingers, then points out of the room toward the tanks and shrugs.
CAMERA: arm-length self-recording, helmet and upper torso close to the lens; his free glove shows the stated task evidence beside him. Keep any authored background threat visible over his shoulder; only a small wrist turn when needed.
LIGHT: weak orange panel light and his helmet lamp.
END: he holds up three fingers toward the lens.
LIMITS: no jellyfish are visible from this room; do not change the sign lettering; one person only.
```

```slots
{"reply":{"rubs_ears":"He taps the side of his helmet as if his ears are still ringing.","plain":"He raises a hand to the lens, asking to be heard, and turns to the wall."}}
```

## VP-308 第7卷：停电

状态：REQUIRED。关键词：第7卷 停电 脚步 细腿 恐怖 elias-story。
镜头：L3-E07 · 段1/1 · elias-story

```prompt
SUBJECT: the diver switches the breakers on and the control room goes dark while something passes outside. {elias}
SETTING: the same control room; an open door to the corridor at the right edge of frame.
TIMING: 0-3 s {switches} 3-4 s all room lights cut out; only his helmet lamp remains, lighting his own gloved hands on the breaker row. 4-8 s he freezes; in the open doorway at the right edge, a shadow of many thin legs slides past across the corridor wall from left to right and is gone. 8-10 s the room lights flicker back on; he grabs the probe.
CAMERA: arm-length self-recording, helmet and upper torso close to the lens; his free glove shows the stated task evidence beside him. Keep any authored background threat visible over his shoulder; only a small wrist turn when needed.
LIGHT: weak room light, then near-total darkness with only his helmet lamp, then light again.
END: his hand covers the lens as he picks up the probe.
LIMITS: only a passing shadow in the doorway, never the creature's body; he is not touched.
```

```slots
{"switches":{"two_three_six":"He pushes up three breakers in the row labelled 2, 3 and 6, one at a time.","guessed":"He pushes up the three breakers at the left end of the row, one at a time."}}
```

## VP-309 第8卷第1段：工作流程

状态：REQUIRED。关键词：第8卷 术前准备室 工作流程 护理员 elias-story。
镜头：L3-E08 · 段1/2 · elias-story

```prompt
SUBJECT: the diver in a pre-operation room points line by line down a four-line procedure chart. {elias}
SETTING: a narrow pre-operation room with steel lockers; on the wall a large printed procedure chart with four numbered lines and a small drawing of a helmet beside the first line.
TIMING: 0-8 s he points at each of the four lines in turn, pausing on each. 8-10 s his hand stops on the first line and stays there; his head lowers.
CAMERA: arm-length self-recording, helmet and upper torso close to the lens; his free glove shows the stated task evidence beside him. Keep any authored background threat visible over his shoulder; only a small wrist turn when needed.
LIGHT: cold white overhead light and his helmet lamp.
END: his gloved finger rests on line one.
LIMITS: do not change the lettering of the chart; one person only.
```

## VP-310 第8卷第2段：护理员的照片

状态：REQUIRED。关键词：第8卷 照片 护理员 蜘蛛 elias-story。
镜头：L3-E08 · 段2/2 · elias-story

```prompt
SUBJECT: the diver holds a printed photograph up to the lens; the photograph shows the facility's caretaker unit. {elias}
SETTING: the same pre-operation room. The photograph shows: {caretaker}
TIMING: 0-4 s he turns a page on a clipboard and holds the photograph up close to the lens. 4-8 s he holds it still. 8-10 s he lowers it and looks past the lens toward a door at the back of the room marked for the operating theatre.
CAMERA: arm-length self-recording, helmet and upper torso close to the lens; his free glove shows the stated task evidence beside him. Keep any authored background threat visible over his shoulder; only a small wrist turn when needed.
LIGHT: cold white light; slight glare on the paper.
END: he faces the back door.
LIMITS: the caretaker exists only inside the photograph; nothing in the room moves except him.
```

## VP-311 第9卷：帮我看一眼

状态：REQUIRED。关键词：第9卷 手术室 观察走廊 头盔挂架 elias-story。
镜头：L3-E09 · 段1/1 · elias-story

```prompt
SUBJECT: the diver kneels at a ring gallery railing high inside a flooded operating theatre and points down, then up. {elias}
SETTING: a flooded circular domed operating theatre seen from a ring gallery about 19 metres above the floor: a steel operating table in the middle, a valve wheel under the table, a closed round drain grate in the floor beside it, and along the curved wall below the gallery dozens of diving helmets hanging in rows on racks. The top of the dome is out of frame.
TIMING: 0-4 s he points down at the valve under the table. 4-7 s he points upward toward the out-of-frame top of the dome and shakes his helmet. 7-10 s he turns his faceplate toward the lens and waits.
CAMERA: arm-length self-recording, helmet and upper torso close to the lens; his free glove shows the stated task evidence beside him. Keep any authored background threat visible over his shoulder; only a small wrist turn when needed.
LIGHT: weak blue-black ambient light, one dim lamp over the table, his helmet lamp.
END: he kneels at the railing facing the lens.
LIMITS: no creature visible; the dome top stays out of frame.
```

## VP-312 第10卷第1段：抓住

状态：REQUIRED。关键词：第10卷 剧情杀 护理员 开头 elias-story。
镜头：L3-E10 · 段1/4 · elias-story

```prompt
SUBJECT: the diver in the operating theatre, and the caretaker arriving. {elias} The caretaker: {caretaker}
SETTING: the domed operating theatre: steel table, valve under it, helmets on racks along the wall, the gallery above.
TIMING: 0-8 s {opening} 8-10 s a clamp-tipped leg closes around him and the frame jolts as the probe is knocked loose.
CAMERA: arm-length self-recording, helmet and upper torso close to the lens; his free glove shows the stated task evidence beside him. Keep any authored background threat visible over his shoulder; only a small wrist turn when needed.
LIGHT: dim theatre light and his helmet lamp.
END: the probe tumbles; the image blurs.
LIMITS: only legs are visible in this clip, not the whole body; no injury, no blood.
```

```slots
{"opening":{"at_valve":"He holds the probe at arm length; he kneels at the valve and turns it with his free hand; from the darkness above, one long thin leg lowers slowly into the top of the frame.","lamp_on":"He holds the probe facing himself beside the gallery railing in total darkness; only the sound of breathing is implied by his rising shoulders; then a large surgical lamp above the table switches on and floods the frame with light, and long legs are lit above him.","waiting":"He holds the probe facing himself while seated on the gallery floor; he sits with his back against the gallery wall, facing the lens and resting; behind him, past the railing, one long thin leg reaches slowly in toward his shoulder."}}
```

## VP-313 第10卷第2段：摘下头盔

状态：REQUIRED。关键词：第10卷 手术台 摘头盔 elias-story。
镜头：L3-E10 · 段2/4 · elias-story

```prompt
SUBJECT: the caretaker lays the diver on the operating table and removes his helmet. {elias} The caretaker: {caretaker}
SETTING: the steel operating table under the surgical lamp; racks of helmets on the wall behind.
TIMING: 0-3 s two mechanical clamps press his shoulders flat onto the table. 3-8 s a pair of steel forceps grips the helmet latch and turns it, one full turn, then a second turn; the helmet comes free. 8-10 s a leg carries the helmet to the wall rack and hangs it among the others.
CAMERA: the fallen probe lies on the floor at a tilted angle, framing the table edge, his upper body and the rack behind.
LIGHT: the surgical lamp casts a hard white cone on the table.
END: the helmet hangs on the rack; his head is off the bottom edge of the frame.
LIMITS: his face is not shown in this clip; the motions are slow and careful, never violent; no blood.
```

## VP-314 第10卷第3段：没有气泡

状态：REQUIRED。关键词：第10卷 揭露 没有呼吸 合格 elias-story。
镜头：L3-E10 · 段3/4 · elias-story

```prompt
SUBJECT: the diver lies on the operating table with his helmet off, underwater, completely calm, while the caretaker examines him and hangs a tag on his wrist. {elias} The caretaker: {caretaker}
SETTING: the operating table under the surgical lamp, fully underwater.
TIMING: 0-5 s close on his bare face in the water: an adult man, eyes open, expression calm; no bubbles rise from his mouth or nose at any moment; his chest does not move. A pair of forceps hovers in front of his face, still, as if inspecting. 5-8 s a clamp hangs a small white tag on a cord around his wrist. 8-10 s the clamps let go and the long legs withdraw upward out of frame.
CAMERA: the fallen probe on the floor, now framing his face and wrist at the table edge.
LIGHT: hard white surgical light on his face.
END: he lies still on the table, eyes open, the tag on his wrist.
LIMITS: absolutely no air bubbles; he does not struggle or choke; no transformation, no wounds, no glowing, no change to his body; his face design must match the character reference image.
```

## VP-315 第10卷第4段：戴回头盔

状态：REQUIRED。关键词：第10卷 戴回头盔 阀门 捂住镜头 elias-story。
镜头：L3-E10 · 段4/4 · elias-story

```prompt
SUBJECT: the diver sits up, puts his own helmet back on, opens the valve and covers the lens. {elias}
SETTING: the operating theatre floor beside the table, the helmet rack, the valve under the table.
TIMING: 0-3 s he sits up on the table and looks straight at the fallen probe for a long moment. 3-6 s he walks to the rack, takes down his ochre-yellow helmet and locks it back on. 6-8 s he kneels at the valve under the table and turns it fully open; water begins to swirl toward the floor. 8-10 s he walks to the probe and his gloved palm covers the lens.
CAMERA: the probe lies on the floor, stationary, until the palm covers it.
LIGHT: surgical lamp, then darkness as the palm covers the lens.
END: black frame, a glove pressed over the lens.
LIMITS: no creature visible; he moves calmly, without hurry.
```

## VP-316 第11卷：到下面再说

状态：REQUIRED。关键词：第11卷 竖井 平台 结尾 elias-story。
镜头：L3-E11 · 段1/1 · elias-story

```prompt
SUBJECT: the diver, helmet on, stands on a steel platform above a draining shaft and faces the lens. {elias}
SETTING: a narrow platform with a railing; behind him a wide vertical shaft where water spirals downward.
TIMING: 0-5 s {reply} 5-10 s he faces the lens and speaks a short sentence, then stays still.
CAMERA: arm-length self-recording, helmet and upper torso close to the lens; his free glove shows the stated task evidence beside him. Keep any authored background threat visible over his shoulder; only a small wrist turn when needed.
LIGHT: his helmet lamp and churning dark water behind him.
END: he stands facing the lens, helmet on.
LIMITS: one person only; no creature.
```

```slots
{"reply":{"long_silence":"He stands completely still for a long moment, then lifts his head slightly toward the lens.","tears_tag":"He looks down at a small white tag on his wrist, pulls it off and lets it drop into the water.","steps_back":"He nods once and takes one step back so that half of his body leaves the frame.","waits":"He simply looks at the lens for a few seconds without moving."}}
```

## VP-317 罗温的照片：收容环

状态：REQUIRED。关键词：潜艇 照片 收容环 缝合鳗 红色警报 player-capture。
镜头：L3-P01 · player-capture

```prompt
SUBJECT: stitched eel-creatures circling deep in a huge shaft. {eels}
SETTING: inside a flooded cylindrical shaft, 68 metres across and 70 deep; its inner wall is lined with tiers of sealed lab containment cells with round glass ports and circular hatches, solid steel between, no bars; several hatches open; rings of rotating red warning lights.
TIMING: 0-5 s red light sweeps the water once per second; far below, the creatures circle slowly.
CAMERA: the submarine's fixed camera at the shaft rim, looking down into the depth.
LIGHT: sweeping red; blue-black between sweeps.
END: the creatures still circling.
LIMITS: no people, no other species; keep the open cells of the reference image.
```

```slots
{"eels":{"circling":"The creatures: pale eel-like bodies several metres long, each made of three or four eels sewn end to end with dark surgical sutures; the seams bulge and the small eyes are clouded."}}
```

## VP-318 罗温的照片：培养槽

状态：REQUIRED。关键词：潜艇 照片 生产车间 培养槽 水母 槽号 player-capture。
镜头：L3-P02 · player-capture

```prompt
SUBJECT: dense clumps of small jellyfish crowding three of the culture tanks. {jellies}
SETTING: a sunken production trench with a conveyor line at the bottom and a single row of large cylindrical culture tanks along its outer wall, each tank stencilled with a large number exactly as in the reference image; warm haze rises from the tanks.
TIMING: 0-5 s the jellyfish pulse slowly and stay pressed against the warm tank walls.
CAMERA: the submarine's fixed camera parked on the inner side of the trench, looking across at the row of tanks with the stencilled numbers readable.
LIGHT: the submarine floodlight and a warm orange glow from the tanks.
END: the jellyfish remain on the same three tanks.
LIMITS: jellyfish only on the tanks already shown in the reference image; never redraw the tank numbers.
```

```slots
{"jellies":{"on_236":"Thousands of thumbnail-sized translucent jellyfish with faint warm amber cores pack the walls of the tanks numbered 2, 3 and 6; the other tanks are bare."}}
```

## VP-319 罗温的照片：穹顶顶上

状态：REQUIRED。关键词：潜艇 照片 手术室 穹顶 护理员 倒挂 player-capture。
镜头：L3-P03 · player-capture

```prompt
SUBJECT: the caretaker hangs upside down at the very top of a dome, motionless. {caretaker}
SETTING: the inside of a large flooded dome; ribs of the dome converge at the top; far below, a steel operating table.
TIMING: 0-5 s it hangs completely still, all legs folded close around its body; only the torn drape drifts in the current.
CAMERA: the submarine's fixed camera tilted up toward the top of the dome.
LIGHT: the submarine floodlight reaches the top of the dome weakly; the creature is pale against the dark.
END: it is still hanging, motionless.
LIMITS: it does not move or descend in this clip; no people visible.
```

```slots
{"caretaker":{"asleep":"A giant deep-sea spider rebuilt as a medical machine: a small pale oval body among more than a dozen extremely long, thin, backward-bending legs, steel forceps and clamps at several leg tips, a torn white surgical drape hanging from it."}}
```

## VP-320 罗温的照片：追来的护理员

状态：REQUIRED。关键词：潜艇 照片 护理员 追击 排水 逃离 player-action。
镜头：L3-P04 · player-action

```prompt
SUBJECT: the caretaker climbs down the dome wall toward the camera while water rushes into a drain shaft. {caretaker}
SETTING: the theatre floor: the steel table nearby, the open drain beside it with water spiralling down, the dome wall above.
TIMING: 0-5 s it descends the curved wall head-first with slow, precise steps and stops two body-lengths from the camera.
CAMERA: the submarine's fixed camera just above the open drain, facing the dome wall.
LIGHT: the submarine floodlight on the creature; churning dark water below.
END: it is close to the camera, legs spread across the wall, not touching the camera.
LIMITS: it does not strike or touch the submarine in this clip; no people visible.
```

```slots
{"caretaker":{"approaching":"A giant deep-sea spider rebuilt as a medical machine: a small pale oval body among more than a dozen extremely long, thin, backward-bending legs, steel forceps and clamps at several leg tips, a torn white surgical drape hanging from it."}}
```

## VP-321 第5b卷：锁着的收容舱（可选）

状态：REQUIRED。关键词：第5b卷 收容环 监控屏 收容舱 07 可选 elias-story。
镜头：L3-E05B · 段1/1 · elias-story

```prompt
SUBJECT: the diver in the pit monitoring room holds the probe close to a wall of containment-cell status monitors. {elias}
SETTING: the same small monitoring room; a wall of small CRT monitors laid out as a grid, one cell per containment unit, tier by tier; a thick window beside it looks into the red-lit pit.
TIMING: 0-4 s he runs a gloved finger along the grid, tapping five lit cells one by one. 4-8 s his finger moves down to the bottom row and stops on the largest cell, which is completely black. 8-10 s he taps it twice and looks at the lens.
CAMERA: arm-length self-recording, helmet and upper torso close to the lens; his free glove shows the stated task evidence beside him. Keep any authored background threat visible over his shoulder; only a small wrist turn when needed.
LIGHT: monitor glow and the red alarm sweep through the window.
END: his finger rests on the black cell.
LIMITS: one person only; no creature visible; do not redraw any lettering from the location image.
```

## VP-322 第5c卷：07（可选）

状态：REQUIRED。关键词：第5c卷 无菌布 07 收容环 可选 elias-story。
镜头：L3-E05C · 段1/1 · elias-story

```prompt
SUBJECT: the diver in the pit monitoring room compares a torn white drape with a photo on the terminal screen. {elias}
SETTING: the same monitoring room; the terminal screen shows a still photo of a large containment cell whose round observation glass has burst outward, with a stencilled 07 on its ID plate; the open doorway behind him.
TIMING: 0-6 s {cloth} 6-10 s he holds the drape up beside the screen so both stencilled numbers are side by side, then slowly lowers it and looks toward the empty doorway.
CAMERA: arm-length self-recording, helmet and upper torso close to the lens; his free glove shows the stated task evidence beside him. Keep any authored background threat visible over his shoulder; only a small wrist turn when needed.
LIGHT: red alarm sweep or dim white emergency light, as in the location image; his helmet lamp.
END: he stands holding the drape, facing the doorway.
LIMITS: nothing appears in the doorway; one person only.
```

```slots
{"cloth":{"already_has":"He pulls a torn white surgical drape from his harness pouch and unfolds it; a black stencilled 07 is printed on it.","finds_it":"He turns from the screen, sees a torn white surgical drape hanging on the door frame, walks over, unhooks it and unfolds it; a black stencilled 07 is printed on it."}}
```

## VP-323 罗温的照片：坑底07号收容舱（可选）

状态：REQUIRED。关键词：潜艇 照片 收容环 坑底 07号收容舱 可选 player-capture。
镜头：L3-P05 · player-capture

```prompt
SUBJECT: the largest containment cell at the bottom of the pit, empty, its ID plate stencilled 07. {cage}
SETTING: the floor tier of the containment pit, 60 metres down; silt on the ledge, other containment cells above fading upward into red-lit darkness.
TIMING: 0-5 s nothing moves inside the cell; silt drifts slowly through the burst opening; the red light sweeps once per second far above.
CAMERA: the submarine's fixed camera about 11 metres from the cage, level with it.
LIGHT: the submarine floodlight on the cell; faint red from above.
END: the empty cell, unchanged.
LIMITS: no creature, no people; do not redraw the stencilled number from the reference image.
```

```slots
{"cage":{"bent_out":"Its thick round observation glass has burst outward from inside and the heavy pressure hatch is buckled outward on one hinge; deep gouges ring the opening."}}
```

## VP-324 罗温的照片：坑底回收槽（可选）

状态：REQUIRED。关键词：潜艇 照片 收容环 坑底 回收槽 尸体 牌子 可选 player-capture。
镜头：L3-P06 · player-capture

```prompt
SUBJECT: a round steel trough at the centre of the pit floor. {trough}
SETTING: the bottom of the containment pit, 60 metres down; the trough is 16 metres across with a low rim; containment cells ring the walls above.
TIMING: 0-5 s nothing moves except drifting silt and loose hair in the water.
CAMERA: the submarine's fixed camera above the trough edge, tilted down.
LIGHT: the submarine floodlight; red alarm light far above.
END: unchanged.
LIMITS: no gore, no faces in close-up, no creature; the bodies stay still.
```

```slots
{"trough":{"rejected":"Inside lie many drowned workers in white overalls without helmets, shown as still dark shapes; small white tags hang from their wrists."}}
```

## VR-304 现状与还没做的

状态：GAP。关键词：第三关 视频 现状 未实现 参考截图 面孔。

- 第三关可驾驶部分（水道和收容环）的场景、潜艇拍摄机位还没做，所以罗温照片所需的现场截图不存在。艾里亚斯那边不做场景，录像首帧改用地点首帧图，这些图也还没生成。在此之前这些提示词只能离线检查，不能提交生成。
- 艾里亚斯摘下头盔后的面孔没有定稿，VP-314 需要先有角色参考图。
- 玩家打字 → 选中表演 → 拼装提示词 → 生成 → 分析台播放并配字幕语音，这条链路还没接进游戏。
- `tools/level-03-video-prompt-check.ts` 只检查拼装、槽位与状态机对得上、长度、无中文、剧透词和外观注入，不证明生成出来的画面好看或恐怖。
