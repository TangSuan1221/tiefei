# 第一关剧情管线：事实、自由输入与视频分支

2026-10-11 更新：自由输入的固定阶段限制与所有路线健康获救已由 [首关因果剧情与跨关伏笔](harbor-causal-narrative-2026-10-11.md) 覆盖；第一章即时后果和第二章接应者/回片已接线。下文旧方案只在未被该更新覆盖的范围内适用。

状态（2026-10-09）：IMPLEMENTED（`src/story-pipeline/level-01.ts`+`runtime.ts` 接入 `HarborRescueSite`：麦克风自由文本、本地分类、事实写入、录像表演槽位、存档、万斯衰减与失联、跨窗口证词去重、看片后压低声音、入仓片回应读取先前谎话）/ GAP（尸体模型；语音识别未实机验证；姿态 palm_stay/still 可读性弱；重拍不改下一句；跨关呼应未接入后续关卡；视频生成未在自动游玩中触发）/ NOT_IMPLEMENTED（AAA品质认证：三轮苛刻盲评均判 NO，不以Agent自评认证）。本文是制作资料（MET-032），不是正文；第4节为原切分计划，实际文件名见上。适用 `/` 主游戏 PodRun→PodExpedition→HarborRescueSite 的正式首关。

## 0. 前提与不变量

- 关卡、机制、物理状态机全部不变：`HarborRescue` 的证据、供电、闸门、诱导、隔离、撤离条件与 `HarborRescueDialogue` 的阶段顺序（contact→…→done）及各阶段任务文本保持原样。分支只替换阶段内的台词、写入非物理事实、改变录像 prompt 中的人物表演槽位。
- 不新增道具、交互、操作位或噪声规则。“说话产生噪声”未采纳。
- 艾里亚斯在首关必定真实获救，不撒谎、无身体异常；兄弟身份、死亡责任与袖口异常不提前透露（MET-020、MET-035、VR-003）。
- 玩家原文不进入 prompt、不作为事实；分类器只能从当前窗口的合法 tag 中选（MET-024）。
- 录像不授予证据；prompt 只读曝光快照（MET-011、VR-001）。快门后的发言只影响下一卷。
- 每个视频分支同时提供中文分析台描述，无视频模式与请求失败时仍能感知（MET-037、MET-010）。

## 1. 第一关事实表

格式：键 = 值。层：W 客观事实，K 某人认知，R 关系，S 言行记录，C 承诺，T 证词。寿命：关内 / 持久（写入跨关存档）。“读者”指读取它的剧情片段、prompt 槽位或报告；没有读者的事实不登记。

### 1.1 客观事实（W，多数已存在，只读）

| 键 | 值 | 来源 | 读者 |
| --- | --- | --- | --- |
| `pod.zone` | A / C / B / 01 / 02 / 03 / cargo | 艇位 | 万斯衰减、窗口开启 |
| `pod.pulse` | on / off | `run.sonarEmitting` | 艾里亚斯感知、prompt `pulse` |
| `pod.lamp` | on / off | `run.lit` | prompt `lamp` |
| `pod.hull` | intact / damaged | `run.hull`、`noiseStrikes` | prompt `hull` |
| `rescue.*` | signal、heard、replied、identified、warned、powered、gateOpen、gateClosed、monsterInside、lureConfirmed、isolated、verified、departing、departed、departureConfirmed | `HarborRescueState` | 阶段推进、可行性条件、prompt |
| `creature.zone` | near_elias / roaming / entering_cargo / inside_cargo / behind_gate / outside_cargo | `HarborPursuit` | 艾里亚斯感知、prompt `monster` |
| `elias.location` | wall / corridor / beyond_door | `departing/departed` | prompt `elias` |
| `elias.posture` | 见第3.2节 | 本管线在曝光时推导（纯表演，不影响物理） | 3D姿态、prompt `elias_beat` |
| `corpse.present` | none / background | 场景（尸体模型缺失，GAP） | prompt `corpse`、尸体话题开关 |

### 1.2 证据（W，持久）

已有：`evidence.threat`、`evidence.lure`、`evidence.gate`、`evidence.departure`（分析台核验）。可选：`evidence.bodyPosition`（GAP，依赖尸体模型；用现有快门与分析台，不新增操作）。

### 1.3 认知（K）

艾里亚斯（只能通过感知或被告知获得）：

| 键 | 值 | 写入方式 | 寿命 |
| --- | --- | --- | --- |
| `elias.hears.pulse` | bool | 感知：`pod.pulse=on` 且在通信设备范围 | 关内 |
| `elias.hears.scrape` | bool | 感知：`rescue.isolated=false` | 关内 |
| `elias.believes.monster` | unknown / near_me / told_nothing / sealed | 罗温的陈述；`sealed` 需罗温放行且自己听不到刮擦 | 关内 |
| `elias.knows.rowanRole` | unknown / investigator / rescuer | 罗温自报 | 持久 |
| `elias.knows.rowanAskedBody` | bool | 罗温问及 | 持久 |
| `elias.instruction.hold` | none / freeze / signal | 罗温指示（别动 / 我来了朝灯看） | 关内 |
| `elias.instruction.route` | none / rail | 罗温给路线指示 | 关内 |

罗温（玩家视角）：

| 键 | 值 | 写入方式 | 寿命 |
| --- | --- | --- | --- |
| `rowan.knows.monster` | bool | = `evidence.threat` 核验 | 持久 |
| `rowan.notedBody` | bool | 已核验录像含尸体且罗温问及（GAP） | 持久 |
| `rowan.demeanor` | calm / afraid / hard | 语气 tag 累计的众数 | 持久 |

万斯：

| 键 | 值 | 写入方式 | 寿命 |
| --- | --- | --- | --- |
| `vance.knows.rowanUneasy` | bool | 罗温表达不安 | 持久 |
| `vance.lastHeard` | none / steady / afraid / question / doubt | 信号断开前最后一句的 tag | 持久 |

### 1.4 关系（R，持久）

- `relation.elias.trust`：整数 -2..+2，初始 0；每个窗口同类加减只计一次。
- `relation.vance.rapport`：-1..+1，初始 0。

### 1.5 言行记录（S，持久）

- `said.rowan.promisedRescue`：bool。
- `said.rowan.downplayed`：bool，看片后淡化或隐瞒怪物。
- `said.rowan.falseClear`：计数，物理未隔离时叫他出来。
- `said.rowan.release`：bool，确认阶段明确放行。

### 1.6 承诺（C，持久）

- `commitment.elias.records`：bool，请他沿途保留值班记录。
- `commitment.elias.meet`：none / gate / keepChannel，与MET-041第二关末密码闸门会合衔接。

### 1.7 证词（T，持久，只记来源与内容，不等于事实）

- `testimony.vance.official`：公司口径——Panacea为修复治疗项目，事故条目“出现形态异常的工作人员；坍塌发生在发现异常之后”。
- `testimony.elias.accident`：“警报响的时候我在接驳层工作。有人开始往水里走，后来门也开了。谁开的我没看见。”

合计约50键。会话临时量（当前窗口、重复计数、待播队列）属于对话状态，不登记为事实。

## 2. 自由输入环节

### 2.1 输入方式

麦克风保持现状（长按开始、松开发送）。新增：按住期间在被动CRT下沿出现一行文本输入，回车或松开发送；原文以“罗温”名义写入声音记录，不改写。同时给2–4个快捷短语（与tag一一对应），不打字也能玩。键盘M保留。

### 2.2 分类

当前窗口声明合法tag集，分四类：意图（一句一个）、话题、陈述、语气。默认本地规则与关键词；可选模型分类器只返回tag ID，超时回退本地规则。第一次识别失败回“信号断了，再说一遍”，第二次走窗口默认tag。未列出的话题走“不影响事实”的通用回应。

### 2.3 窗口一览

对象可随时呼叫；当前没有对应窗口时，播放通用片段（不写事实）。

| 窗口 | 对象 | 开启条件 | 结束条件 |
| --- | --- | --- | --- |
| 万斯·入港 | 万斯 | 开局 | `pod.zone` 进入C-B通道 |
| 万斯·衰减 | 万斯 | 进入C-B通道 | 下一句发送后或进入B主港（之后只有噪声） |
| 首次接通 | 艾里亚斯 | `rescue.heard`，阶段contact | 发送或沉默20秒 |
| 警告 | 艾里亚斯 | 阶段stop/warning | 进入photo |
| 等待显影 | 艾里亚斯 | 阶段photo且已曝光未核验 | `identified` |
| 看片报告 | 艾里亚斯 | 阶段report | 发送 |
| 行动期 | 艾里亚斯 | 阶段power到close | `isolated` |
| 放行 | 艾里亚斯 | 阶段confirm（替换原3个固定选项） | 放行发送 |
| 撤离途中 | 艾里亚斯 | 阶段escape | `departed` |
| 告别 | 艾里亚斯 | 阶段departure/done | 离港确认 |

## 3. 输入对剧情与视频的影响

记号：〔无〕不写事实；〔写〕写入事实、不经视频；〔片〕写入事实并在后续录像呈现。台词为初稿，正文定稿另行修改。

### 3.1 各窗口

**万斯·入港**

| tag | 类别 | 写入 | 即时回应（初稿） | 呼应 |
| --- | --- | --- | --- | --- |
| 再问坐标 / 操作 | 〔无〕 | — | 重报坐标或操作提示 | — |
| 表达不安 | 〔写〕 | `vance.knows.rowanUneasy`，rapport+1 | 万斯：“你一向不喜欢人多的地方。下面安静，就当是好事。” | 衰减时的最后一句；第五关上行恢复 |
| 质疑任务 | 〔写〕 | rapport-1 | 万斯：“只有你的艇能进去。别的我也想知道。” | 同上，语气更冷 |
| 询问事故 | 〔写〕 | `testimony.vance.official` | 公司口径两句 | 日志；最终报告“官方说法”栏 |
| 就绪 / 闲聊 | 〔无〕 | — | 简短回应 | — |

**万斯·衰减**：进入C-B通道时，万斯的声音开始断续（只改无线电表现，不改通信规则；万斯失联本身尚未实现，GAP）。罗温此时的一句按tag写入 `vance.lastHeard`：报平安→steady，害怕→afraid，提问→question，质疑→doubt。万斯的半句回应由此与 `rowanUneasy` 决定，例如 uneasy 且 afraid：“……罗温，慢慢来，我在——”。此后呼叫只有噪声〔无〕。

**首次接通**（原罗温固定台词改为玩家原文；艾里亚斯随后必说“快关掉主动声纳”，阶段照常进入stop）

| tag | 类别 | 写入 | 艾里亚斯回应（初稿） | 视频 |
| --- | --- | --- | --- | --- |
| 自报调查员 | 〔写〕 | `rowanRole=investigator` | “调查……好。那你得先活着出去。” | — |
| 自报救援 | 〔写〕 | `rowanRole=rescuer` | “廊桥断了，你过不来。” | — |
| 问位置 | 〔无〕 | — | “断桥对面，卷帘门边。” | — |
| 问伤情 | 〔写〕 | trust+1 | “暂时没有。谢谢你问。” | — |
| 指示别动 | 〔片〕 | `instruction.hold=freeze` | “好，我不动。可你的声纳——” | PT-003 `frozen` |
| 承诺来救 | 〔片〕 | `promisedRescue`，`instruction.hold=signal` | “你看得见我的方向吗？我朝你的灯——” | PT-003 `signals_pod` |
| 怀疑身份 | 〔写〕 | trust-1 | “我是接驳港维修员艾里亚斯。我没时间证明这个。” | PT-003 `guarded` |
| 沉默20秒 | 〔写〕 | 无写入（默认） | 重复呼叫一次，然后直接喊出警告 | PT-003 `listening` |

**警告**：问“它是什么”“为什么要关”→〔无〕，艾里亚斯：“我不知道该怎么说。先关掉。”拒绝关闭→〔无〕，他重复恳求；物理受击规则不变（只在首片核验后计算）。

**等待显影**：未看片就说“没什么”→〔无〕，“你还没看片吧？”；问还要多久→〔无〕。

**看片报告**（阶段随后照常进入plan，计划内容与任务不变，只换开头）

| tag | 前置 | 类别 | 写入 | 计划开头（初稿） | 视频 |
| --- | --- | --- | --- | --- | --- |
| 如实描述 | `rowan.knows.monster` | 〔片〕 | `believes.monster=near_me` | “……就在门里？离我这么近？” | PT-004 `hidden` |
| 淡化隐瞒 | — | 〔片〕 | `downplayed`，`believes=told_nothing`，trust-1 | “没什么？那墙后面是什么在刮？” | PT-004 `peeking` |
| 表达恐惧/想走 | — | 〔片〕 | `demeanor` 计入afraid | “别走。听我说，只要几步。” | PT-004 `palm_stay` |
| 问事故 | — | 〔写〕 | `testimony.elias.accident` | 证词原文 | — |
| 问尸体 | `corpse.present`（GAP） | 〔写〕 | `rowanAskedBody`，`rowan.notedBody`；开放可选目标“从01拍尸体位置” | “现在别问这个。它就在墙后。” | 尸体槽位见3.3；画面不加反应 |
| 问是什么 / 惊叫 | — | 〔无〕 | — | “我不知道。” | — |

尸体模型缺失期间，“问尸体”tag映射为〔无〕通用回应“我这边看不见你说的地方”。（该句只在尸体不在已核验录像时使用，不构成谎言。）

**行动期**（power→close；任务与物理条件不变）

| tag | 类别 | 写入 | 回应（初稿） |
| --- | --- | --- | --- |
| 问下一步 | 〔无〕 | — | 重复当前计划句 |
| 问事故（未问过） | 〔写〕 | `testimony.elias.accident` | 证词原文 |
| 问他本人 | 〔写〕 | trust+1（一次） | “我管这层的泵和接驳臂。本来下个月轮岗上去。” |
| 安慰 | 〔写〕 | trust+1（一次） | “……嗯。我还在。” |
| 催促 | 〔无〕 | — | “我知道。” |
| 叫他出来（未隔离） | 〔写〕 | `falseClear`+1，trust-1 | “我还听得见它。你确定？……我不出去。” |

**放行**（替换原3个固定选项；`HarborRescue` 撤离仍要求 `verified`，物理条件不变）

| tag | 类别 | 写入 | 回应（初稿） | 视频 |
| --- | --- | --- | --- | --- |
| 放行 | 〔片〕 | `release`，`believes=sealed` | 原撤离句 | VP-011 由 trust 决定 |
| 放行+路线 | 〔片〕 | 另写 `instruction.route=rail` | “扶着走。好。” | VP-012 `rail` |
| 让他再等等 | 〔无〕 | — | “好，我等你说。” | — |
| 说不确定 | 〔无〕 | — | “那你再看一眼。” | — |

**撤离途中**：给路线指示→〔片〕`route=rail`（若尚未写入）；鼓励→〔写〕trust+1（一次）；其余〔无〕。

**告别**（离港确认前）

| tag | 类别 | 写入 | 回应（初稿） | 后续 |
| --- | --- | --- | --- | --- |
| 请找值班记录 | 〔写〕 | `commitment.elias.records` | 调查员身份已知：“我本来就想找。”否则：“记录？好，我留意。” | 第二关远端录像 |
| 约定会合 | 〔写〕 | `commitment.elias.meet=gate` | “下面见。门那边我想办法。” | 第二关会合句 |
| 约定保持频道 | 〔写〕 | `meet=keepChannel` | “能听见我就一直开着。” | 第二关固定通话失效时的最后一句 |
| 问事故（未问过） | 〔写〕 | 证词 | 证词原文 | 日志 |
| 道谢 / 冷淡 / 怀疑 | 〔写〕 | trust ±1（一次） | 见3.4 | 第二关语气 |

### 3.2 视频：人物表演槽位

只有画面含艾里亚斯的进程片受影响：PT-003、PT-004、PT-008（VP-011/012）。PT-001/002/005/006/007/009 由物理状态决定，输入不改变画面。`elias.posture` 在曝光时由下表规则确定性推导，同时驱动3D姿态（GAP：需4–6个姿态变体；未做时动作写为“从当前姿态开始的轻微动作”）。

| 进程 | 规则（取第一条命中） | 键 | 英文槽位句 | 分析台描述 |
| --- | --- | --- | --- | --- |
| PT-003 | `hold=freeze` | frozen | He keeps perfectly still against the wall, one glove cupped over his helmet lamp. | 艾里亚斯贴墙不动，手套遮住头盔灯。 |
| | `hold=signal` | signals_pod | He lifts one hand toward the submarine's light. | 艾里亚斯朝潜艇灯光举起一只手。 |
| | trust≤-1 | guarded | He keeps his back to the wall and his face turned away from the submarine. | 艾里亚斯背贴墙，脸背向潜艇。 |
| | 其余 | listening | He turns his helmet slightly toward the doorway, as if he heard something. | 艾里亚斯微微转向门洞，像是听见了什么。 |
| PT-004 | `believes=near_me` | hidden | He has drawn back into the shadow and watches the submarine without moving. | 艾里亚斯退进阴影，一动不动地看着潜艇。 |
| | `believes=told_nothing` | peeking | He leans out half a step to look toward the doorway himself. | 艾里亚斯探出半步，自己去看门洞。 |
| | 最近一次语气afraid | palm_stay | He holds one flat palm toward the submarine, asking it to stay. | 艾里亚斯朝潜艇竖起手掌，示意别走。 |
| | 其余 | watching | （沿用现有 `elias.watching`） | 艾里亚斯在卷帘门旁等待。 |
| VP-012 | `route=rail` | rail | He keeps one hand on the rail and never looks back. | 艾里亚斯扶着栏杆走，没有回头。 |
| | trust≤-1 | glance_back | He stops once to look back toward the cargo gate. | 艾里亚斯停下回望货仓闸门。 |
| | 其余 | walking | （沿用现有 `elias.walking`） | 艾里亚斯沿内侧走廊行走。 |
| VP-011 | trust≥1 | trust_wave | He turns back and raises one hand toward the submarine. | 艾里亚斯回身朝潜艇举手。 |
| | trust≤-1 | wary | He checks behind him and does not look toward the submarine. | 艾里亚斯确认身后，没有看潜艇。 |
| | 其余 | still | He stands behind the door, breathing hard, looking at nothing. | 艾里亚斯站在门后喘息。 |

`elias.beyond_door` 现有句中的“raising one hand”须移出到表演槽位，位置句只保留位置。表演句不超过25词，不提怪物解剖，不写受伤、异常或与潜艇会合；审核备用（PT-011）只替换 `monster`，保留 `elias_beat`。

组合规模（审核用）：PT-003 4×照明2×艇壳2=16；PT-004 4×2×2=16；VP-011 3×2×2=12；VP-012 3×2×2=12。共56条，上线前用 `tools/video-prompt-rag.mjs compose` 全部拼出逐条审核。缓存键=PT+全部槽位键+首帧哈希。

### 3.3 视频：尸体细节（GAP）

尸体模型就位且在首帧中时：`rowan.notedBody=false` 用现有 `corpse.background`；`true` 用更可辨认的同位置句（仍脸朝下、无面部、无证件、无伤口）。尸体从不因输入出现或消失。

### 3.4 本关内的非视频呼应

- 万斯衰减句：`rowanUneasy` × `lastHeard`。
- 计划开头：`believes.monster`。
- 拒绝出来：`falseClear`。
- 告别第一句（初稿）：`promisedRescue` 且 trust≥0 → “你说你会来。你真来了。”；trust≥1 → “谢谢。真的。”；trust≤-1 → “……我先走了。”；其余 → “谢谢。”
- 日志：两条证词各写一次，标注来源。
- 可选目标“拍尸体位置”：只在 `rowan.notedBody` 后出现（GAP）。

### 3.5 跨关输出（只列交接事实与目标，后续关卡正文另写）

| 事实 | 第二关（-1） | 第四关（-3） | 第五关（-4） |
| --- | --- | --- | --- |
| trust、demeanor | 远端录像中他是否出镜、话量 | 对质时的语气 | — |
| `commitment.elias.records` | 多一卷他把记录夹举到探头前（需远端录像改用生成视频，GAP；否则以本地帧呈现） | — | 报告附记录 |
| `commitment.elias.meet` | 固定通话失效前最后一句 / 密码闸门会合句 | — | — |
| `rowanAskedBody`、`evidence.bodyPosition` | — | 他回忆“你在港口问过我”；照片增强 `evidence.brotherIdentity` 比对 | 报告证据栏 |
| `downplayed`、`falseClear` | — | 对质时被提起 | — |
| `vance.*` | — | — | 上行恢复后万斯的回应 |
| 证词 | — | 与记录核对 | 报告“证词”栏，与证据分列 |

第四关承认内容为正典固定，首关输入只改变语气与证据强弱，不改变真相。

### 3.6 三种示例游玩

- 冷静指挥：让他别动→PT-003他贴墙捂灯；如实报告→PT-004他退入阴影；放行附路线→撤离片扶栏不回头；trust+2→门后回身举手，告别“谢谢。真的。”
- 安抚隐瞒：承诺来救→PT-003他朝灯举手，怪物就在身后；报告“没什么”→他追问刮擦声，PT-004探身看门洞；提前叫他出来被拒；trust-2→撤离停下回望闸门，门后不看潜艇，告别“……我先走了。”
- 好奇调查：自报调查员、问伤情、问事故两次、问他本人→证词入日志；（尸体就位后）问尸体并补拍位置；告别时请他找记录→第二关他举着记录夹出现在录像里。

## 4. 实现切分（未开始）

1. `src/pod/sim/harbor-facts.ts`：事实表、感知步骤、快照/恢复。
2. `src/pod/sim/harbor-storylets.ts`：窗口、tag集、片段（视角、条件、写入、台词）。NPC视角片段的台词条件只读该NPC认知；客观事实只用于可行性。
3. `src/pod/sim/intent-classifier.ts`：本地规则；可选模型接口沿用 `narrative-lab/model-port.ts` 的候选ID与超时回退。
4. `harbor-rescue-dialogue.ts`：阶段与 `end` 不变，固定台词改为按片段选择；confirm的3个选项改为放行窗口。
5. 首帧姿态与 `elias_beat` 槽位：依赖VR-006（运行时尚未读取首关prompt库）先完成。
6. `sonar-desk.ts`：麦克风文本输入与快捷短语。
7. 存档：事实快照加入正式检查点；持久键另存跨关槽。
8. 检查：穷举窗口×tag的写入与阶段不变性；56条prompt组合审核；无视频描述覆盖。

## 5. 约束复核与缺口（MET-031）

- MET-011/VR-001：prompt只读快照，表演不改物理；证据仍由分析台核验。符合。
- MET-020/035/VR-003：所有分支艾里亚斯获救、不撒谎；尸体话题回应只在威胁情境下拒谈，或在看不见时如实说看不见。需用户确认口径。
- MET-024：模型只分类tag。符合。
- MET-027：每个〔写〕〔片〕分支均列出关内可感知差异（3.2、3.4）。
- MET-028：无新道具；新增制作项为艾里亚斯4–6个姿态变体，尸体模型为既有GAP。
- MET-029/030：无新交互，无让相机替NPC做能自己看清的事。
- MET-034：证词与证据分开存储与呈现。
- GAP：尸体模型；万斯失联实现；姿态变体；首关prompt库接入运行时（VR-006）；第二关远端录像是否生成；文本输入UI；全部未经实机与玩家盲测，“千人千面”须由玩家体验检验，不以本文或自动检查认证。
