# 第三关 · 视觉参考图提示词

> **2026-10-24 注意**：玩家路线（要做成真实关卡的水道和收容环）改用 [level-03-route-reference-prompts.md](level-03-route-reference-prompts.md)（R01–R17）。本文件第一、二节里的场景图（第1–5c、7、9、14、15张）只作氛围参考，**不要用来制作关卡**：其中水道转弯方向写成了向左，实际是向右（研究所中心始终在右手边）。
> 本文件仍然有效的部分：第三节艾里亚斯的地点首帧图（第6、8、16–21张），以及第四节角色与生物设定图（第10–13张）。收容环三张已整体移到玩家路线文件。

用途：给美术和场景制作当“长什么样”的参考，不是游戏内视频的提示词。配套：[第三关设计](level-03-abyssal-lab-design.md)。

2026-10-23 已按关卡布局（[平面图](level-03-abyssal-lab-map.svg)、`src/pod/content/abyssal-lab-layout.ts`）更新：每张图的空间关系和尺寸都对应布局里的实际数字。

## 使用说明

- **生成顺序**：先做第1张（总体风格），定下来后，把它当风格参考图，跟着生成后面的每一张。这样材质、色调能统一。
- **画幅**：场景图用 16:9，角色和生物设定图用 3:4 或 1:1。
- **视角**：场景图大多是“从潜艇舷窗往外看”的视角（第一人称、低机位、在水里），这是玩家在游戏里实际看到的样子。
- **颜色**：本作锁定铁锈橙、深渊蓝黑、骨白、警示红四色，**禁止任何绿色和青绿色**。提示词里已经写了，生成结果如果偏绿，请重新生成或后期调色。
- **文字**：AI画的字通常是乱码。告示、地图、槽号这类字，只需要位置和排版对，具体文字我们在游戏里贴图。
- 每条都附了中文说明（给你看）和英文提示词（贴进生成工具）。每条英文后面都要接上“通用后缀”。

### 通用后缀（每条英文末尾都加上）

```
Style: grounded deep-sea industrial horror, realistic materials, cinematic concept art for a first-person submarine game. Colour palette strictly limited to rust orange, abyssal blue-black, bone white, and a single accent of warning red. Absolutely no green, no teal, no cyan, no emerald tint. Murky water with heavy marine snow, limited visibility, light falling off quickly into darkness. No text, no logos, no watermark, no people unless described.
```

### 通用负面词（工具支持负面提示时填入）

```
green, teal, cyan, emerald, neon, sci-fi glow, clean futuristic, sunlight, water surface, coral reef, tropical fish, cartoon, anime, cute, gore, blood splatter, cult symbols, readable text, watermark
```

---

## 一、总体风格（先做这张）

### 1. 研究所外观：海沟里的螺旋

**说明**：从海沟深处远远看过去，整座研究所嵌在岩壁里，像一只巨大的鹦鹉螺壳半埋在悬崖上，约240米宽。外壳绕一圈半往中心收，中心是一个大圆顶（手术室）。外壳上鼓出一个圆形的大包（收容环深坑），一条竖井从上方插进外壳最外端（玩家从这里下来）。表面有一排排小观察窗，只有零星几扇亮着。用来确定整体建筑风格和材质。

```
A massive deep-sea research facility built into the vertical wall of an ocean trench, shaped like a giant nautilus shell half-buried in the rock: about 240 metres across, curved segmented hull plates making one and a half turns inward toward a large domed centre. One round bulge on the shell houses a deep pit; a vertical access shaft drops into the outermost end of the spiral from above. Rows of small round observation windows, only a few still lit with dim orange light. Rusted steel, barnacle crust, hanging cables, an old service pipe running down the cliff. Seen from far away in the dark water, the facility is huge and silent. Wide shot, 16:9.
```

---

## 二、关卡地点（按游玩顺序）

### 2. 检疫泊位

**说明**：玩家进入研究所的第一站。弯月形泊位，水道10米宽、10米高，中段往外侧鼓出，最宽22米。三座消毒喷淋拱门倒在水里，拱门下压着几具穿白色工作服、没戴头盔的尸体（只要轮廓，不要血腥）。**外侧**鼓出的那面墙（靠悬崖一侧）是一排倒塌的金属货架，地上散着几十个箱子，其中几个是白色带红十字的医疗箱。**内侧**的墙上（靠研究所中心一侧）有一扇亮着橙色灯的观察窗（通话窗），窗后隐约能看到一盏头盔灯。

```
First-person view from a small submarine's porthole inside a flooded, crescent-shaped docking bay of an underwater research facility, about 10 metres high, widening from 10 to 22 metres where the outer wall bulges out. Three collapsed decontamination shower arches lie on the floor, and under them the silhouettes of several drowned workers in white overalls without helmets, hair drifting, shown only as dark shapes with no gore. Against the bulging outer wall on the right, a toppled row of steel shelving and dozens of scattered crates on the floor; a few are white medical crates marked with a red cross. On the opposite inner wall on the left, a thick observation window framed by an amber light; behind the glass, the faint glow of a diver's helmet lamp in a dry corridor. The submarine's floodlight cuts a cone through heavy marine snow. 16:9.
```

### 3. 标本长廊

**说明**：一条很长的弯道水道（140米长，10米宽、10米高，一直向左弯，看不到尽头），内侧墙边整排两人高的圆柱玻璃标本罐全碎了，罐里泡过的东西漂在水里：剖开的鱼、没有眼睛的章鱼、一只被钉成十字形的巨型等足虫。安静、死寂，是喘口气的地方，但让人不舒服。

```
First-person view from a submarine moving along a long flooded corridor, 10 metres wide and 10 metres high, that curves steadily to the left. Along the inner (left) wall stands a row of tall cylindrical glass specimen tanks, each taller than two people, all of them shattered, jagged glass rims. Former specimens drift in the water: a dissected fish, an eyeless octopus, a giant isopod pinned in a cross shape on a board. Everything is dead and still. The curve hides the end of the corridor. Floodlight reveals only the nearest tanks, the rest fade into darkness. 16:9.
```

### 4. 研究实验室：3号舱与钥匙箱

**说明**：五个实验舱像鱼鳃一样从水道往**外侧**伸出去，每个舱10米宽、19米深、10米高。镜头从舱口看进已经完全淹没的3号舱，舱内是倒翻的实验台和漂浮的仪器，舱的最里面（约19米外）墙上挂着一个醒目的红色小箱子（应急钥匙箱）。通话窗和传递口在水道对面的内侧墙上，这张图里看不到，见第15张。

```
First-person view from a submarine at the mouth of a fully flooded laboratory chamber, one of five chambers branching outward from a curved water corridor like gills; the chamber is 10 metres wide, 10 metres high and 19 metres deep. Inside: overturned lab benches, floating instruments, loose cables, a microscope on its side. On the far end wall, about 19 metres away, hangs a small bright red emergency key box, catching the floodlight, clearly the focal point. A painted number 3 on the chamber frame. 16:9.
```

### 5、5b、5c. 收容环（已移到玩家路线文件）

收容环的三张场景图已改为 [level-03-route-reference-prompts.md](level-03-route-reference-prompts.md) 的 R08（坑缘俯视）、R09（沿井壁下潜）、R10（坑底），并按“密封实验收容舱、镜头在井内”重写。这里不再保留旧版，避免画成监狱。

### 6. 收容环监控室（艾里亚斯那边·录像首帧）

**说明**：艾里亚斯在坑缘的监控室，第4、5、5b、5c卷都在这里拍。这张图会直接作为录像的首帧，所以**构图就是录像里的样子**：探头放在桌上，正对着他。狭小的弧形房间，一侧有一扇厚窗正对着红色的深坑（红光就是从这里扫进来的），一面墙的小屏幕按格子显示每个收容舱的状态（最底下一格是黑的），旁边是六个大按钮的警报面板。他背后有一扇开着的门，通向黑暗的走廊，门框顶上挂着一块撕破的白布。

```
A small curved monitoring room in a dry corridor of an underwater facility, seen from a low camera propped on the desk. A wall of small CRT monitors shows a grid of containment cells, the largest cell at the bottom completely black. Beside them, an alarm panel with six large square buttons. On one side a thick window looks out into the flooded red-lit pit, and the sweeping red beacons outside wash across the room. A diver in a dark dry suit and ochre-yellow hard helmet with a dark faceplate stands in the middle of the room facing the camera. Behind him, an open doorway leading into a pitch-black corridor; a torn white cloth hangs from the top of the door frame. Cramped, harsh red light, deep shadows. 16:9.
```

### 7. 生产车间

**说明**：一条往下沉、向左弯的长沟，16米宽，沟底比入口低11米，沟底是灌装药瓶的流水线，一排排小玻璃瓶在传送带上。外侧墙边是一排8个大圆柱形培养槽（每个直径3米、高13米，间隔5米），槽身上喷着大号编号1到8，冒着暖橙色的热气。2号、3号、6号槽上挤满了半透明的小水母。培养槽后面，沟的中段有两台巨大的冲压机横跨整条沟。水是浑浊温热的，有一种工厂的压迫感。

```
First-person view from a submarine descending into a long sunken industrial trench, 16 metres wide, curving left. At the bottom, a conveyor line carrying rows of small glass vials. Along the outer wall, a single row of eight large cylindrical culture tanks, each about 3 metres wide and 13 metres tall, 5 metres apart, with big stencilled numbers 1 to 8 on their sides and warm orange haze rising from them. Tanks 2, 3 and 6 are covered with thick clumps of tiny translucent jellyfish with faint amber cores. Beyond the tanks, two enormous industrial press machines span the whole trench and loom in the haze. Murky warm water, oppressive factory scale. 16:9.
```

### 8. 术前准备室（艾里亚斯那边·录像首帧）

**说明**：第8卷的首帧。探头放在不锈钢推车上，正对墙。狭窄的房间，一排钢制储物柜，冷白色顶灯。墙上贴着一张大海报：四行编号的流程，第一行旁边画着一个头盔图标。气氛冷、干净、医院感。

```
A narrow pre-operation room in a dry section of an underwater facility, seen from a low camera propped on a steel trolley. Rows of steel lockers, cold white overhead light, tiled floor with a thin film of water. On the wall, a large printed procedure poster with four numbered lines and a small helmet icon next to the first line; text not legible. A stainless steel instrument trolley in the foreground. Clinical, cold, quiet, unsettling. 16:9.
```

### 9. 手术室（结局场景，重点）

**说明**：螺旋的正中心，最重要的场景。一个完全淹没的巨大圆顶，直径64米，地面到顶部26米。潜艇从一条直通道进来，停在半高处。正中地面上一张不锈钢手术台，台上方一盏大无影灯，台子底下是一个阀门转轮。台子旁边约12米，地面上有一个直径12米的圆形排水格栅（关着，下面是竖井）。圆顶的墙上，离地19米处一圈环形挑台（艾里亚斯在这里），挑台下方的弧形墙上一排排挂架，挂着几十个潜水头盔。穹顶最高处，在黑暗里倒挂着一个巨大的、腿很长的东西（护理员，见第12张），只隐约看到轮廓。

```
First-person view from a submarine that has just entered, halfway up, an enormous fully flooded domed operating theatre at the centre of an underwater facility; the dome is 64 metres across and 26 metres tall, camera tilted slightly down. On the floor in the middle, a single stainless steel operating table under a large round surgical lamp, with a valve wheel underneath the table. Beside it, about 12 metres away, a large closed circular drain grate in the floor. Around the dome wall, a ring-shaped gallery balcony with a railing; below it, along the curved wall, rows of racks holding dozens of diving helmets hanging side by side, like trophies. High above, at the very top of the dome, barely visible in darkness, a huge pale shape with many extremely long thin legs hangs upside down, motionless. Cathedral-like scale, cold, silent, dread. 16:9.
```

### 14. 术前准备室弯道（全关最窄）

**说明**：车间之后的一段窄弯道，只有8米宽、8米高，是全关最窄、最压迫的一段。一直向左弯。内侧墙上一扇通话窗，窗后是冷白色灯光的术前准备室，能看到一排钢柜。弯道顶上贴着一排检修管道（护理员会从上面爬过）。弯道尽头是一个稍大的圆形空间（直径14米），从那里转向一条笔直的通道，通道尽头隐约透出手术室圆顶的光。

```
First-person view from a submarine inside a narrow flooded service bend, only 8 metres wide and 8 metres high, curving steadily to the left; the tightest passage of the facility, walls close on both sides. On the inner left wall, a thick observation window with an amber frame light; behind it, a cold white-lit pre-operation room with a row of steel lockers. Along the ceiling, a bundle of maintenance pipes and a narrow crawlway grate. At the end of the bend, a slightly wider round chamber, and beyond it a straight tunnel whose far end glows faintly where a large dome begins. Claustrophobic, cold. 16:9.
```

### 15. 通话窗（核心玩法）

**说明**：这一关最常出现的画面，玩家每次和艾里亚斯说话都停在这里。从潜艇里看，水道内侧墙上一扇厚厚的圆角压力窗，约1.5米宽，窗框一圈琥珀色的指示灯。窗后是一小段干燥的走廊（游戏里只做到窗后这一小段布景，不做可走的空间），艾里亚斯戴着头盔站在窗后，正把摄像探头的线插进墙上的数据终端。窗下方约1米处是一个方形的小传递口（带把手的不锈钢舱门，约60厘米见方），用来把箱子塞进去。潜艇离窗约5米。两边的光完全不一样：外面是黑色的水和潜艇的探照灯，里面是干燥空气里昏黄的灯光。

```
First-person view from a submarine about 5 metres from the inner wall of a flooded corridor. In the wall, a thick rounded-rectangle pressure window about 1.5 metres wide with a ring of amber indicator lights around its frame. Behind the glass is a dry corridor with air, not water: dim warm light, a wall-mounted data terminal, and a diver in a dark dry suit and ochre-yellow hard helmet with a dark faceplate, plugging the cable of a small handheld camera probe into the terminal. About one metre below the window, a small square stainless steel pass-through hatch with a handle, about 60 centimetres across. Outside the glass, black water and marine snow lit by the submarine floodlight; inside, dry still air. The contrast between the two sides is the point of the image. 16:9.
```

---

## 三、艾里亚斯那边的地点首帧图（录像直接用）

艾里亚斯走过的地方**不做成关卡**，只在他的录像里出现。所以这些图不是给美术参考的，而是**直接上传作为他录像的第一帧**，生成视频时会以这张图为准。要求：

- **构图就是录像里的构图**：探头搁在什么地方、朝哪个方向，图就按那个角度画。
- **人要在画面里**：艾里亚斯站在说明写的位置，外观和第10张一致，戴头盔、看不见脸。
- **同一个地点只用这一张**：同一地点的几卷录像都用它当首帧，前后才能一致。
- 告示和屏幕上的字画不对没关系，录像里重要的字会用字幕再显示一遍。
- 第6张（监控室）、第8张（术前准备室）也属于这一类，上面已经写了。

### 16. 检疫更衣室（第1、2卷）

**说明**：探头卡在一扇打开的柜门上，齐胸高，拍到艾里亚斯腰部以上。狭长的更衣室，两边都是打开的灰色储物柜，湿的瓷砖地上有一层薄水。他身后的墙上，左边是一张大地图（画着螺旋形的研究所，中心标了记号），右边是一张白底红十字的告示。地上靠近镜头的地方躺着一具穿白色工作服、没戴头盔的尸体，只露出肩膀和脖子上开着的头盔卡扣圈。墙上的数据终端有一根线连到探头。

```
A narrow locker room in a dry quarantine area of an underwater facility, seen from a small camera clipped to an open locker door at chest height. Grey lockers stand open on both sides; the tiled floor has a thin film of water. A diver in a dark dry suit, brown canvas harness and ochre-yellow hard helmet with a dark faceplate stands facing the camera, framed from the waist up. Behind him on the wall: on the left a large printed facility map shaped like a spiral shell with its centre marked, on the right a white notice with a red cross. A cable runs from a wall data terminal to the camera. In the lower foreground, the shoulder of a dead worker in white overalls lies on the wet floor, no helmet, an open metal helmet ring around the neck. One flickering ceiling tube and the diver's helmet lamp. 16:9.
```

### 17. 实验室走廊（第3卷）

**说明**：探头搁在扶手上。弧形的干燥走廊，艾里亚斯站在一扇锁着的厚重控制室门旁边，门上贴着大字告示。门边有一扇厚玻璃侧窗，窗外是完全淹没的3号实验舱（深蓝黑色的水），舱的远墙上挂着一个小小的红色箱子。侧窗下方墙上有一个方形的小传递口。

```
A curved dry corridor in an underwater laboratory wing, seen from a small camera resting on a handrail. A diver in a dark dry suit and ochre-yellow hard helmet with a dark faceplate stands beside a heavy locked control-room door that carries a large printed notice. Next to the door, a thick glass side window looks into a fully flooded laboratory chamber, blue-black water, and on the chamber's far wall hangs a small red box. Below the window, a small square steel pass-through hatch. Weak emergency light strips and the diver's helmet lamp. 16:9.
```

### 18. 车间控制室（第6、7卷）

**说明**：探头放在控制台上。控制室里一排8个编号的大开关，旁边几个温度表的指针在往下掉，墙上一块大警告牌，控制台标签烧糊了一半。艾里亚斯站在开关前。画面右边是一扇开着的门，门外是走廊（第7卷停电时，影子从这里经过）。墙上还贴着一张手写的冲压机节奏表。

```
A production control room in a dry section of an underwater facility, seen from a small camera resting on the control desk. A row of eight large numbered breakers, temperature gauges with falling needles, half-burnt labels, a large printed warning sign on the wall and a handwritten timing sheet taped beside it. A diver in a dark dry suit and ochre-yellow hard helmet with a dark faceplate stands at the breakers. At the right edge of the frame, an open door to a dark corridor. Weak orange panel light and the diver's helmet lamp. 16:9.
```

### 19. 手术室环形挑台（第9卷、第10卷开头）

**说明**：探头用线连着、夹在挑台的栏杆上，往下斜着拍。艾里亚斯跪在挑台栏杆边，在画面左侧。栏杆外往下是整个手术室：正中的手术台、台下的阀门、旁边地上的圆形格栅、墙边挂满头盔的挂架。整个手术室都淹在水里，他也在水里（他戴着头盔，看起来很正常）。穹顶最高处在画面外。

```
A high ring-shaped gallery inside a fully flooded domed operating theatre, seen from a small camera clipped to the gallery railing and angled down. A diver in a dark dry suit and ochre-yellow hard helmet with a dark faceplate kneels at the railing on the left of the frame. Below the railing, about 19 metres down: a stainless steel operating table under a round surgical lamp, a valve wheel under the table, a closed round drain grate in the floor beside it, and along the curved wall dozens of diving helmets hanging in rows on racks. The top of the dome is out of frame. Dim blue-black water, one lamp over the table, the diver's helmet lamp. 16:9.
```

### 20. 手术台近景（第10卷，探头掉在地上）

**说明**：第10卷探头掉在地上以后的视角。低机位，斜着，从地面看过去：手术台的边缘、台上无影灯的强光、台后墙上挂满头盔的挂架。台上**没有人**（人和护理员由视频生成）。这张图决定了揭露那一段的光线和构图，要冷、亮、安静。

```
A low tilted view from a small camera lying on the floor of a fully flooded operating theatre. In the frame: the edge of a stainless steel operating table under a hard white surgical lamp, and behind it a curved wall lined with racks of hanging diving helmets. The table is empty. Water is still and clear near the lamp, dark at the edges. Cold, bright, silent. 16:9.
```

### 21. 竖井检修平台（第11卷）

**说明**：探头搁在平台栏杆上。一个窄窄的钢平台，背后是正在往下抽水的宽竖井，水打着旋往下走。艾里亚斯戴着头盔站在平台上，膝盖以上入画，面对镜头。

```
A narrow steel maintenance platform with a railing inside a wide vertical drain shaft, seen from a small camera resting on the railing. Behind the platform, dark water spirals downward into the shaft. A diver in a dark dry suit, brown canvas harness and ochre-yellow hard helmet with a dark faceplate stands on the platform facing the camera, framed from the knees up. The diver's helmet lamp and churning dark water. 16:9.
```

---

## 四、角色与生物设定图

### 10. 艾里亚斯（全身设定）

**说明**：用来统一他在所有录像里的样子。成年男性潜水员，约1.73米，深色干式潜水服，棕色帆布背带和胸前小包，赭黄色硬质潜水头盔，深色面罩完全看不到脸，头盔上有一盏小灯，手里拿着一个小型摄像探头（带一根线缆）。正面、侧面、背面三视图。**脸不要画**，揭露那一段的脸以后单独定。

```
Character turnaround sheet, front, side and back views, neutral grey background. An adult male deep-sea diver about 1.73 m tall: dark rubberised dry suit, brown canvas harness with chest pouches, heavy gloves, weighted boots, an ochre-yellow hard diving helmet with a dark tinted faceplate that completely hides the face, a small lamp mounted on the helmet. He holds a small handheld camera probe with a coiled cable. Worn, scratched, practical equipment. Realistic, grounded industrial design. 3:4.
```

### 11. 缝合鳗

**说明**：收容环里的实验生物。几条鳗鱼用黑色手术线首尾缝在一起，变成好几米长的一条，接缝处鼓起，小眼睛浑浊。苍白，令人不舒服，但不要血腥。

```
Creature concept sheet, side view and three-quarter view, dark background. A pale eel-like creature several metres long, made of three or four eels sewn end to end with thick dark surgical sutures; the seams bulge and pucker, the skin is pallid and slightly translucent, the small eyes are clouded white. It swims with an uneven, segmented undulation. Disturbing laboratory-made deep-sea horror, no blood, no gore. 1:1.
```

### 12. 护理员（本关Boss，重点）

**说明**：研究所用一只巨型深海蜘蛛（海蜘蛛/皆足类）改造的护理机器。身体只有一辆小汽车大小，十几条腿又细又长，展开约14米，关节往反方向折；好几条腿的末端装着不锈钢手术钳和机械夹；身上披着撕破的白色无菌布。它动作很慢、很精准，像一个耐心的护士。恐怖来自尺寸和安静，不是来自血腥。请画一张全身图，再加一张腿末端工具的特写。

```
Creature concept sheet, full body view plus a close-up detail of the leg tips, dark background. A gigantic deep-sea sea spider rebuilt as a medical caretaker machine: a small pale oval body slung between more than a dozen extremely long, thin legs that bend backwards at the joints, spanning about 14 metres; the body is only the size of a small car. Several leg tips are fitted with stainless steel surgical forceps, clamps and a small articulated gripper. A torn white surgical drape hangs from its body like a nurse's gown. Calm, precise, patient posture. Lovecraftian deep-sea horror conveyed through scale and stillness, not gore. 1:1.
```

### 13. 温床水母（可选）

**说明**：拇指大小的半透明小水母，中心有一点暖橙色的光，成千上万只挤成一团。只需要一张近景群体图。

```
Close-up of a dense swarm of thousands of thumbnail-sized translucent jellyfish packed against a warm metal tank wall, each with a faint warm amber glowing core, gently pulsing. Murky water, marine snow, macro detail. 1:1.
```

---

## 五、优先级

本文件只剩艾里亚斯首帧图和角色生物设定图，建议顺序：

1. 第10张 艾里亚斯（定他的样子，所有地点首帧图都要和它一致）
2. 第6张 收容环监控室、第16张 检疫更衣室（最早出现的两处录像首帧）
3. 第12张 护理员
4. 第17–21张、第8张 其余地点首帧图
5. 第11张 缝合鳗、第13张 温床水母

玩家路线（关卡场景）的顺序见 [level-03-route-reference-prompts.md](level-03-route-reference-prompts.md)。

生成好以后放进 `qa/level-03/reference/`，文件名用编号开头（例如 `10-elias.png`、`16-locker-room.png`），我会按编号对应。
