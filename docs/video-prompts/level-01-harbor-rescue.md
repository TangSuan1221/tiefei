# 第一关视频提示词库：接驳港断桥救援

本库只服务第一关（0层接驳港，`/` 主游戏 PodRun→PodExpedition→HarborRescueSite）的录像生成提示词。条目分三类：`VR` 全局规则，`VP` 需要生成视频的拍摄点，`PT` 按游戏进程划分的提示词模板。检索与拼装入口 `tools/video-prompt-rag.mjs`，白名单 `rag/video-prompt.manifest.json`。

状态总览：本库内容为 REQUIRED 设计规范；运行时仍使用 `src/pod/content/footage.ts` 的通用拼装，尚未读取本库（NOT_IMPLEMENTED）。现状差距见 VR-006。不得因本库存在而声称首关录像已按进程生成。

模板正文写英文，交给视频模型；`{槽位}` 由 `compose` 命令按 VR-005 的槽位表替换。中文说明只给制作者，禁止进入提示词。

## VR-001 拼装顺序与镜头契约

状态：REQUIRED。关键词：拼装 顺序 首帧 曝光图 五秒 镜头契约 前缀。

每卷片子是一次5秒曝光的回收录像，接口固定 5 秒、768p、16:9（`docs/video-api-probe.md`）。拼装顺序固定为：前缀（本条）→ 进程模板正文（PT）→ 槽位句 → 后缀（VR-002）。主体必须出现在模板正文的第一句；模型对前约20个词最敏感，风格约束放最后。

首帧曝光图是空间权威：录像只能在曝光图已有的墙体、开口、人物与设施内变化；未被首帧覆盖的人物、尸体、门、文字不得新增。录像只记录曝光那一刻锁定的事实（`run.ts` beginShoot 快照），不得演出之后才发生的动作。

单条拼装结果建议不超过 2200 字符（现行运行时约 4300 字符，主体被淹没）。

```prompt-prefix
SHOT CONTRACT: one continuous five-second recording from a camera bolted to a small research submarine, looking out of its porthole. The supplied exposure image is the spatial authority: keep its walls, openings, people and perspective. Do not add rooms, doors, bodies, text or events that are not in that image.
```

## VR-002 画质、四色与负面约束

状态：IMPLEMENTED（摘自 `src/pod/content/footage.ts` 的 CAMERA_CLAUSE / PALETTE_CLAUSE / NEGATIVE_CLAUSE，精简后语义不变）。关键词：四色 禁绿 模拟摄像机 负面 后缀 水印。

四色约束是硬规则：锈橙唯一暖光、深渊蓝黑阴影、骨白高光、一处警示血红；必须穷举否定绿色同义词。提示词只是请求，颜色最终由客户端 `src/pod/view/degrade.ts` 查找表强制，因此后缀不追加任何正面色彩形容。负面约束沿用现行条款，并加入首关专用禁项：不得出现邪教、神像、经文与水面阳光。

```prompt-suffix
Battered 1980s analogue hull camera beside one narrow floodlight; low frame rate, light interlace and grain that never hides the subject; readable midtones, never crush the subject into black; condensation at the edge of the lens port; dense marine snow. Colour strictly limited to rust orange as the only warm light, abyssal blue-black shadows, bone white highlights and one single note of warning red. Absolutely no green and no teal: no green tint, no cyan, no emerald, no olive, no night-vision look, no sea-green water. No on-screen text, captions, watermark, timecode or user interface. No divers swimming in open water, no daylight, no sunbeams, no water surface, no coral, no tropical fish, no cinematic grading, no lens flare. No cult chapel, no inscriptions, no tentacled deity, no altar, no glowing runes, no priest.
```

## VR-003 正典与剧透禁区

状态：REQUIRED。关键词：正典 剧透 尸体 兄弟 袖口 Panacea 艾里亚斯 万斯 MET-035。

依据 MET-035 与现行正文 `docs/story-split-route-2026-09-30.md` 第一章。

- 艾里亚斯在首关是真实获救的人：穿潜水服的单人幸存者，人形完整。不得显示袖口破损、皮下组织或任何"他已改变"的迹象（第三章后才揭示）。
- 首关尸体是艾里亚斯的兄弟。正文要求第一卷断桥下有一具脸朝下、被栏杆挡住的尸体；只能作为背景中的脸朝下的人形，不得出现面部、证件、姓名、伤口特写，不得暗示死亡责任。当前场景没有尸体模型（GAP），在场景补齐前槽位 `corpse` 默认 `none`，模板不得自行添加。
- 怪物外观取正文第一章：很长的手、扭曲的躯干、向下垂的脸、工装陷进皮肉，神情不狰狞、近似安抚。怪物由视频生成、不使用3D模型；外形按VR-110深海克系档案：半透明受压骨白皮肤、三根带鳍膜的长蹼指、脊背破碎鳍条、鳃裂、无腿拖曳下身，悬浮滑行或攀附钢结构，不站、不走、不爬。描述只写外形，不解释来源，不出现 Panacea、病毒、实验、医疗等字样。
- 不写万斯、公司阴谋、邪教、五层结构或后续关卡人物。旧七关文本（`src/pod/content/campaign-story.ts` 的 film 字段，如"倒悬救生舱"）不得进入首关提示词。
- 不演出未发生的结局：受击片不得出现破舱、死亡；隔离片不得出现怪物逃出；撤离片不得出现艾里亚斯与潜艇会合。

## VR-004 怪物描写分级与审核回落

状态：REQUIRED。关键词：怪物 审核 驳回 sensitive 备用 fallback 计费 creature。

接口会驳回过于具体的怪物描写（`output new_sensitive`），失败照样计费约 0.345 美元/次。规则：

- 主提示词使用 `monster` 槽位：先写动作与位置，再以独立句 "The creature: …" 给出外形（`creature` 槽位），只写轮廓、肤色、姿态，不写血肉、内脏、伤口、腐烂等词。
- 备用提示词把整个 `monster` 槽位换成同键的 `monster_trace`：去掉一切解剖（手、臂、脸），保留同一位置、同一时刻必须可读的物理痕迹（被拖开的淤泥、滑过墙面的阴影、格栅受压、撞击溅起的淤泥）。模板固定句不得直接写 "the creature"，以免备用版残留实体。运行时被驳回后只重试一次备用（`src/pod/view/footage.ts` filtered 分支）。
- 备用片不能被当作"看清了怪物"：核验结果由 HarborRescue 状态决定，录像内容不授予证据（MET-011）。

## VR-005 槽位表

状态：REQUIRED。关键词：槽位 slots 照明 脉冲 闸门 艇壳 怪物位置 艾里亚斯 深度。

`compose` 先取本表默认值，再用 PT 的 defaults 覆盖，最后用命令行 `--set 槽位=值` 覆盖。值为表中键名时替换为对应英文句；否则按字面写入。运行时接线时，槽位应由曝光快照读取：`lamp`←`run.lit`，`pulse`←`run.sonarEmitting`，`gate`←闸门网格高度与 `gateOpen/gateClosed`，`hull`←`run.hull`，`monster`←`HarborPursuit` 位置与 `inside`，`elias`←`departing/departed`。

```slots
{
  "depth": "1012",
  "lamp": {
    "on": "The submarine floodlight is on: one hard, narrow cone of light, everything outside it falls off into black.",
    "off": "The floodlight is off. Only weak emergency lamps on the structure and faint biological glints; a sensitive camera keeps shapes readable with grey midtones."
  },
  "pulse": {
    "on": "Every few seconds a faint pressure ripple from the submarine's active sonar shivers through the suspended silt.",
    "off": "The water is quiet; no sonar ripple."
  },
  "hull": {
    "intact": "",
    "damaged": "Fine stress cracks and fogging creep along one edge of the porthole glass from earlier impacts."
  },
  "gate": {
    "closed": "The heavy cargo gate is fully lowered and still; its vertical grille slats are intact.",
    "open": "The heavy cargo gate is raised, leaving a dark open mouth into the cargo hold.",
    "moving": "The heavy cargo gate is still sliding down its rails, shedding rust flakes.",
    "unpowered": "The cargo gate is shut and dark, its panel unlit."
  },
  "creature": "an abyssal deep-sea creature with translucent bone-pale skin, very long arms ending in three webbed fingers, gill slits, no legs but a soft trailing lower body, and grey overall scraps sunk into its flesh; it glides or clings, never crawls; its drooping face is calm, never snarling",
  "monster": {
    "absent": "No creature is in frame.",
    "unseen": "Something unseen displaces the silt at the edge of the light; no body is visible.",
    "near_elias": "Behind the beam of the far doorway, close to the survivor, a creature slowly reaches one long arm toward his shoulder. The creature: {creature}.",
    "roaming": "Far across the harbour, half in shadow, a creature moves slowly along the wreckage. The creature: {creature}.",
    "entering_cargo": "A creature is passing through the open gate into the cargo hold, following the sonar sound. The creature: {creature}.",
    "inside_cargo": "Deep inside the cargo hold, a creature turns slowly among the empty racks. The creature: {creature}.",
    "behind_gate": "Behind the lowered grille, inside the cargo hold, a creature presses one hand against the slats and stays there. The creature: {creature}.",
    "outside_cargo": "A creature is outside the cargo hold, moving away from the open gate. The creature: {creature}.",
    "hunting_pod": "A creature comes straight at the porthole out of the dark and strikes the hull once beside the lens. The creature: {creature}."
  },
  "monster_trace": {
    "absent": "No creature is in frame.",
    "unseen": "Something unseen displaces the silt at the edge of the light; no body is visible.",
    "near_elias": "Behind the beam of the far doorway, close to the survivor, a long trail of silt lifts and a slow shadow slides along the wall toward him; no body is visible.",
    "roaming": "Far across the harbour, a slow shadow slides along the wreckage and silt stirs in its wake; no body is visible.",
    "entering_cargo": "Silt is dragged in a long track through the open gate into the cargo hold, following the sonar sound; no body is visible.",
    "inside_cargo": "Deep inside the cargo hold, loose racks sway and silt turns in a slow eddy; no body is visible.",
    "behind_gate": "Behind the lowered grille, the slats flex once as if pressed from inside the cargo hold, then hold still; no body is visible.",
    "outside_cargo": "A trail of disturbed silt leads out of the cargo hold and away from the open gate; no body is visible.",
    "hunting_pod": "Something unseen slams into the hull beside the lens and silt bursts across the porthole."
  },
  "elias": {
    "waiting": "Across the broken walkway, a single survivor in a dark diving suit presses his back to the wall beside a roller door, keeping very still.",
    "watching": "Across the broken walkway, the same diving-suited survivor waits beside the roller door and looks toward the submarine.",
    "walking": "The diving-suited survivor walks along an inner emergency corridor behind a glass partition, one hand on the rail.",
    "beyond_door": "Behind a now-open inner door, the diving-suited survivor stands safe on the far side, raising one hand.",
    "absent": ""
  },
  "corpse": {
    "none": "",
    "background": "Below the platform, a body floats face down, caught against the broken railing, small in the background."
  }
}
```

## VR-006 现状审计：运行时首关提示词

状态：GAP。关键词：现状 审计 calm 平静 水母 旧文本 坐标 长度 运行时。

2026-10-08 在 5173 主游戏新开局，用 `run.captureFootage` + `buildFootagePrompt` 导出 A气闸、01 威胁确认（开/关灯）、03 诱导、闸门隔离、撤离共7个场景，记录 `qa/video-prompts/runtime-audit-2026-10-08.json`。结果：

- 7个场景只有4种文本，差别仅来自照明；全部判为 `calm` 模板，正文写着"No pursuit, attack, lurking body"与"No visible monster anatomy"。首关怪物由 `HarborPursuit` 控制而非 `run.threat`，`directFootage` 读不到它。威胁确认片因此被要求不得出现怪物。
- 平静模板随机加入"巨大水母群"，与任务主体争画面。
- 叙事补充句为旧剧情的制作注释（"调查底片已分析；不把提示词当作证据"），地点描述为旧"倒悬主港、核对倒悬救生舱"。
- 写入世界坐标与航向（"Camera position 60.00,0.00,27.00, heading 180"），对模型无意义。
- 单条约4270–4400字符。

结论：首关需改为按 VR-007 判定进程并使用 PT 模板（NOT_IMPLEMENTED）。

## VR-007 进程判定表

状态：REQUIRED。关键词：进程 判定 阶段 stage 状态机 优先级 叠加。

曝光时按顺序取第一条命中的进程（字段来自 `src/pod/sim/harbor-rescue.ts` 与 `src/pod/sim/harbor-rescue-dialogue.ts`）：

| 顺序 | 条件 | 进程模板 |
| --- | --- | --- |
| 1 | `departureConfirmed` 或对话 `done` | PT-009 离港 |
| 2 | `departing` | PT-008 撤离 |
| 3 | `isolated` | PT-007 隔离确认 |
| 4 | `lureConfirmed` | PT-006 关闸 |
| 5 | `gateOpen` | PT-005 诱导 |
| 6 | `identified` | PT-004 计划与供电 |
| 7 | `replied` 且对话阶段不早于 `warning` | PT-003 威胁确认 |
| 8 | `signal` 或 `heard` 或 `replied` | PT-002 接通与停发 |
| 9 | 其余 | PT-001 进港 |

叠加层：曝光时艇壳正在受击（`noiseStrikes` 增加后6秒内），或怪物距潜艇小于6米且在追击，叠加 PT-010；不改变主进程。`creature=trace` 的备用提示词由 PT-011 规则生成。照明、断电、艇壳只经槽位变化，不另设进程。

## VP-001 A气闸进港

状态：REQUIRED。关键词：A气闸 入口 进港 自由拍摄 X11 Y16 calm。

位置：入口航点 X11 Y16 DEPTH 1012m 附近，A-C 压力门前。时机：开局到收到艾里亚斯载波前。任务无关的自由拍摄；照常提交生成（每次快门都是一次付费请求）。进程 PT-001。必须可见：气闸框、压力门、海雪、悬浮淤泥。禁止：怪物、人、尸体。

## VP-002 C维修湾与 C-B 通道

状态：REQUIRED。关键词：C维修湾 通道 C-B 压力门 自由拍摄。

位置：A-C 门后至 C-B 门前的维修湾。时机：同 VP-001；若已接通载波则归 PT-002。必须可见：管线、格栅甲板、门叶轨道。禁止：怪物实体（首关此前无人看清它）。

## VP-003 B主港与断桥远景

状态：REQUIRED。关键词：B主港 断桥 远景 载波 接近 自由拍摄。

位置：C-B 门以后进入B主港，靠近 X>27、Y>24 时触发载波。时机：接通前后均可。进程 PT-001/PT-002。必须可见：从中间折断、一端垂入水中的步行桥。若首帧中可见对岸人影，只能是艾里亚斯本人（`elias=waiting`），不得补画。

## VP-004 01 断桥威胁确认（任务片）

状态：REQUIRED。关键词：01 威胁确认 艾里亚斯 怪物 断桥 threat 识别 任务片 X60 Y27。

位置：01 拍摄位 X60 Y27 DEPTH 1012m，6米内；镜头朝向不作要求。时机：对话发布"前往01拍摄艾里亚斯附近"之后（`photoUnlocked`）。证据类型 `threat`，`replied` 为真才有效，分析后 `identified`、`warned` 置真。进程 PT-003。必须可见：断桥、对岸贴墙的艾里亚斯、紧邻他的怪物（只有录像能看见它）。正文第一章要求的断桥下尸体当前缺模型（GAP），`corpse=none`。

## VP-005 01 威胁确认失败或过早拍摄

状态：REQUIRED。关键词：01 失败 过早 未解锁 超出半径 无效 threat。

情形：对话未解锁就拍、离01超过6米、`replied` 为假。录像照常生成，但证据无效（`visible=false`）。进程仍按 VR-007 选择（多为 PT-002/PT-003）。提示词只描写首帧实际能看见的东西，不因"任务需要"补画怪物；超出范围时怪物多半不在画面内（`monster=unseen`）。

## VP-006 02 配电箱

状态：REQUIRED。关键词：02 配电箱 供电 X42 Y28 自由拍摄 应急电力。

位置：X42 Y28 DEPTH 1012m 配电面板。时机：识别怪物后去恢复供电，或之后任意时刻。任务不要求拍摄。进程 PT-004（恢复前 `gate=unpowered`）。必须可见：配电柜、开关、电缆。供电后可出现应急灯。

## VP-007 03 货舱诱导确认（任务片）

状态：REQUIRED。关键词：03 货舱 诱导 入仓 lure 脉冲 X77 Y7 任务片。

位置：潜艇在03货舱内部（X72.5–81.7、Y<15.3），诱导点 X77 Y7 DEPTH 1011m。时机：01 开闸后，仓内开启主动脉冲，怪物进仓。证据 `lure`，要求 `monsterInside` 与 `gateOpen`；成功后 `lureConfirmed`。进程 PT-005。必须可见：货舱内部、敞开的闸口、正在进仓或已在仓内的怪物、脉冲波纹（`pulse=on`）。

## VP-008 03 诱导失败片

状态：REQUIRED。关键词：诱导失败 舱外 未进仓 出仓 lure 无效。

情形：潜艇不在货舱内、怪物尚未进仓、或进仓后又出仓（`resetCycle`）。录像如实记录：怪物在闸口外或向外移动（`monster=outside_cargo`），或只见淤泥扰动（`monster=unseen`）。不得演出"它已经进去了"。

## VP-009 闸门隔离确认（任务片）

状态：REQUIRED。关键词：闸门 隔离 关闸 gate 格栅 任务片 isolated。

位置：任意能拍到闸门的位置，常见为01或闸口外 X77 Y22。时机：停脉冲回01落闸、`isolated` 为真后，闸门完全停止移动（网格位移<0.08）。证据 `gate`，分析后 `verified`。进程 PT-007。必须可见：完全落下的闸门、格栅后的怪物、闸外清空的通路。

## VP-010 闸门移动中或未隔离

状态：REQUIRED。关键词：闸门移动 未隔离 过早关闸 无效 gate。

情形：闸门仍在下落（`gate=moving`），或未拍入仓照就关闸导致 `gateClosed` 但怪物在外。录像如实呈现，不得补画仓内怪物。

## VP-011 01 艾里亚斯撤离确认（任务片）

状态：REQUIRED。关键词：撤离 艾里亚斯 内侧门 departure 任务片 结果片。

位置：01 拍摄位6米内。时机：确认隔离、麦克风回复后接通内侧逃生门，`departing`；约10秒后 `departed`。证据 `departure`，分析后 `departureConfirmed`。进程 PT-008。必须可见：艾里亚斯在内侧门后、断桥仍然分隔两条路线、货舱闸门保持关闭。禁止：艾里亚斯与潜艇会合、袖口异常（VR-003）。

## VP-012 撤离途中

状态：REQUIRED。关键词：撤离途中 应急走廊 walking departing。

情形：`departing` 为真而 `departed` 为假时拍摄。`elias=walking`，证据无效。不得提前演出他到达门后。

## VP-013 追击与受击中曝光

状态：REQUIRED。关键词：受击 追击 撞击 hunt 噪声 叠加 attack。

情形：警告后开着脉冲或近距离噪声，怪物追来撞艇（现行参数：持续10秒后每6秒一次，每次艇壳-0.10）。任何进程都可能发生，叠加 PT-010。必须可见：怪物冲向舷窗并撞击一次；禁止：破舱、进水、死亡、尸体。

## VP-014 离港后

状态：REQUIRED。关键词：离港 完成 done 下行 自由拍摄。

时机：`departureConfirmed` 之后到确认离港。进程 PT-009。必须可见：安静的主港、关闭的闸门、断桥。艾里亚斯已离开画面（`elias=absent`）。

## PT-001 进港（接通前）

状态：REQUIRED。关键词：进港 平静 接通前 contact 气闸 维修湾 环境。

适用：VR-007 第9条。拍摄点 VP-001、VP-002、VP-003。

```defaults
{"monster":"absent","elias":"absent","pulse":"on","lamp":"off"}
```

```prompt
Inside a flooded industrial docking harbour {depth} metres down: pressure doors, grated steel decks and overhead cable runs, all abandoned after an accident. {lamp} {pulse} The camera drifts a few degrees on its mount. Marine snow and loose silt hang in the water. {monster} {hull} Nothing attacks; no person is present.
```

## PT-002 接通载波与停发脉冲

状态：REQUIRED。关键词：接通 载波 停发 intro stop 不安 痕迹。

适用：第8条（收到载波、回复、被要求关闭主动声纳）。拍摄点 VP-002、VP-003、VP-005。此时首关尚无人看清怪物，只允许间接痕迹。

```defaults
{"monster":"unseen","elias":"absent","pulse":"on","lamp":"off"}
```

```prompt
The same flooded docking harbour, {depth} metres down, the broken walkway somewhere ahead in the dark. {lamp} {pulse} {monster} The disturbance moves toward the source of the sonar sound and then stops, as if listening. {elias} {hull} No body is visible and nothing touches the submarine.
```

## PT-003 断桥威胁确认

状态：REQUIRED。关键词：威胁确认 断桥 艾里亚斯 怪物 photo warning 识别。

适用：第7条。拍摄点 VP-004（有效）、VP-005（无效时改 `monster=unseen`）。这是首关第一次看清怪物的片子，主体按"断桥→人→怪物"顺序出现。

```defaults
{"monster":"near_elias","elias":"waiting","pulse":"off","lamp":"off","corpse":"none"}
```

```prompt
A pedestrian walkway snapped in the middle, one half hanging down into the water, in a flooded docking harbour {depth} metres down. {elias} {monster} The survivor does not see it. {corpse} {lamp} {pulse} {hull} Seconds 0-1 show the broken walkway, seconds 1-4 the survivor and what moves close to him, the final second holds on both, nothing resolved.
```

## PT-004 计划与恢复供电

状态：REQUIRED。关键词：计划 供电 配电箱 report plan power open 已识别。

适用：第6条（识别后至开闸前）。拍摄点 VP-006，以及此阶段在01、B主港的自由拍摄。怪物已被玩家看过，可以出现在远处游荡。

```defaults
{"monster":"roaming","elias":"watching","pulse":"off","lamp":"off","gate":"unpowered"}
```

```prompt
A flooded docking harbour {depth} metres down, an electrical distribution cabinet and its heavy switches bolted to a steel wall, cables running toward a dark cargo gate. {gate} {lamp} {pulse} {monster} {elias} {hull} The scene stays tense and still; no attack.
```

## PT-005 货舱诱导

状态：REQUIRED。关键词：诱导 货舱 开闸 脉冲 lure 入仓 lureBrief。

适用：第5条（开闸后至入仓照确认前）。拍摄点 VP-007（有效）、VP-008（失败：`monster=outside_cargo` 或 `unseen`）。

```defaults
{"monster":"entering_cargo","elias":"absent","pulse":"on","lamp":"off","gate":"open"}
```

```prompt
Inside an empty flooded cargo hold {depth} metres down, bare storage racks along the walls, looking back toward its entrance. {gate} {pulse} {monster} {lamp} {hull} The movement follows the sound, not the light; nothing strikes the submarine during these five seconds.
```

## PT-006 停脉冲与关闸

状态：REQUIRED。关键词：关闸 停脉冲 撤出 close closeBrief 撤离货舱。

适用：第4条（入仓照已确认、闸门未落）。拍摄点：撤出货舱途中、回01途中的自由拍摄。

```defaults
{"monster":"inside_cargo","elias":"absent","pulse":"off","lamp":"off","gate":"open"}
```

```prompt
Looking back at the open entrance of a flooded cargo hold {depth} metres down while the submarine slowly withdraws. {gate} {monster} {pulse} {lamp} {hull} Everything is held quiet; nothing turns toward the retreating submarine.
```

## PT-007 隔离确认

状态：REQUIRED。关键词：隔离 闸门 格栅 gate confirm 确认 isolated。

适用：第3条。拍摄点 VP-009（有效）、VP-010（`gate=moving`，或怪物不在仓内时 `monster=outside_cargo`）。

```defaults
{"monster":"behind_gate","elias":"absent","pulse":"off","lamp":"off","gate":"closed"}
```

```prompt
The lowered gate of a flooded cargo hold {depth} metres down, seen from the passage outside. {gate} {monster} The passage in front of the gate is empty and clear. {lamp} {pulse} {hull} Whatever is inside stays behind the grille for all five seconds.
```

## PT-008 艾里亚斯撤离

状态：REQUIRED。关键词：撤离 内侧门 逃生 escape departure 结果片。

适用：第2条。拍摄点 VP-011（`elias=beyond_door`）、VP-012（`elias=walking`）。

```defaults
{"monster":"absent","elias":"beyond_door","pulse":"off","lamp":"off","gate":"closed"}
```

```prompt
The broken walkway of a flooded docking harbour {depth} metres down still separates two routes. {elias} {gate} {monster} {lamp} {pulse} {hull} The survivor and the submarine stay on their own separate routes; they do not meet in this shot.
```

## PT-009 离港

状态：REQUIRED。关键词：离港 完成 done 下行 安静。

适用：第1条。拍摄点 VP-014。

```defaults
{"monster":"absent","elias":"absent","pulse":"off","lamp":"off","gate":"closed"}
```

```prompt
A quiet flooded docking harbour {depth} metres down after the rescue: the broken walkway, the sealed cargo gate, settling silt. {gate} {lamp} {pulse} {monster} {hull} Nothing moves except drifting particles; no new threat.
```

## PT-010 受击叠加层

状态：REQUIRED。关键词：受击 撞击 追击 叠加 attack hunting overlay。

适用：VR-007 叠加条件；拍摄点 VP-013。用法：`compose PT-010 --base PT-00x`，取基础进程的地点句，再以本模板替换主体。审核风险最高，备用必须走 PT-011。

```defaults
{"monster":"hunting_pod","pulse":"on","lamp":"off","hull":"damaged"}
```

```prompt
{base} {monster} The submarine jolts once; the camera keeps recording. {hull} {pulse} {lamp} No breach, no flooding of the cabin, no death; whatever struck withdraws into the dark by the last second.
```

## PT-011 审核备用提示词

状态：REQUIRED。关键词：备用 fallback 审核 驳回 trace 无解剖 重试。

适用：任一 PT 被接口驳回后的唯一一次重试（VR-004）。生成方式：与主提示词使用同一 PT、同一槽位，`monster` 改取同键的 `monster_trace`，`corpse` 强制 `none`，再在末尾追加本条正文。`compose` 每次同时输出主提示词与备用提示词。备用片仍须保留该进程的物理事实（断桥、闸门状态、人物位置）。

```prompt
{base} Fresh scrape marks and a cloud of disturbed silt mark where something heavy passed; no anatomy is visible.
```
