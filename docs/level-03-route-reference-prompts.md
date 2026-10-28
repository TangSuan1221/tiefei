# 第三关 · 玩家路线参考图提示词（用于制作真实关卡）

只包含罗温开潜艇经过、要做成可驾驶关卡的地方。艾里亚斯那边的地点首帧图、生物设定图另见 [level-03-reference-image-prompts.md](level-03-reference-image-prompts.md)。

所有尺寸、方向都按布局文件 `src/pod/content/abyssal-lab-layout.ts` 写，与 [平面图](level-03-abyssal-lab-map.svg)、[纵剖面](level-03-abyssal-lab-section.svg) 一致。

## 使用说明

**这批图是给关卡制作看的**，所以和氛围图不一样：

- **结构要看得清**：墙、地面、顶、门洞、转弯方向都要画清楚。比游戏里实际亮一些也没关系（游戏里舷窗外很暗，主要靠潜艇探照灯和场景里的灯）。
- **不画怪物**：本作的规则是怪物只在照片里出现，实时画面里看不到，所以关卡本身不需要怪物。提示词里已经去掉了。
- **方向固定**：研究所的水道是**顺时针向内**绕的，开船时**研究所中心永远在右手边**。所以“内侧墙”永远在右边，“外侧墙”永远在左边。之前那版参考图把方向写反了，这一版已改正。
- **尺寸参照**：潜艇长5米、宽2.8米、高3米。每张图都写了空间的实际尺寸，生成时如果比例明显不对（比如10米宽的水道画成了走廊），请重新生成。
- **文字**：AI画不对字没关系，只要位置对，字在游戏里贴图。
- **颜色**：铁锈橙、深渊蓝黑、骨白、警示红四色，禁止绿色和青绿色。

**生成顺序**：先生成R01（总体风格），定下来以后，每张都把R01当风格参考一起上传。

### 通用后缀（每条英文末尾都加上）

```
Style: grounded deep-sea industrial architecture, realistic materials (rusted steel plate, riveted ribs, cast concrete, rubber seals, corroded pipework), environment concept art for building a playable first-person submarine level. Structure and scale must be clearly readable. Colour palette strictly limited to rust orange, abyssal blue-black, bone white, and a single accent of warning red. Absolutely no green, no teal, no cyan, no emerald tint. Murky water with marine snow, light falling off with distance. No creatures, no text, no logos, no watermark.
```

### 通用负面词

```
green, teal, cyan, emerald, neon, clean sci-fi, sunlight, water surface, coral reef, fish, creature, monster, cartoon, anime, gore, readable text, watermark, wrong scale, tiny corridor
```

**收容环三张（R08–R10）额外加上这些负面词**（避免画成监狱）：

```
prison, jail, iron bars, cage bars, cell bars, grille, free-standing tower, exterior view of a tower, bridges, open sky, foggy city
```

---

## R01 研究所外观（定风格）

**用途**：确定整体建筑语言和材质。
**内容**：从海沟深处远看。整座研究所嵌在垂直的岩壁里，约240米宽，像半埋在悬崖上的鹦鹉螺壳：外壳顺时针绕一圈半往中心收，中心是一个大圆顶。外壳上有一个圆形的鼓包（收容环深坑），最外端有一根竖井从上方插进来（玩家从这里下来）。表面有一排排小观察窗，只有零星几扇亮着。

```
Wide view across a dark ocean trench toward a massive research facility built into the vertical rock wall, about 240 metres across, shaped like a giant nautilus shell half-buried in the cliff: curved segmented hull plates spiralling clockwise inward for one and a half turns toward a large domed centre. One large round bulge on the shell houses a deep pit. A vertical access shaft drops into the outermost end of the spiral from above. Rows of small round observation windows, only a few lit dim orange. Rusted steel, barnacle crust, hanging cables, an old service pipe running down the cliff. Huge and silent. 16:9.
```

---

## R02 沉降井底（开场）

**用途**：关卡起点，接第二关的下行井。
**尺寸**：竖井直径14米，玩家从井上方Y30一路沉到Y0；井底接一条10米宽、10米高的水道，往前**向右**弯。
**内容**：从潜艇往下看。竖井是天然岩石和研究所外层管线混在一起，管线之间卡着两具穿白色研究服、没戴头盔的尸体（只要剪影）。井底右前方是研究所水道的入口，金属框，往右弯进去。

```
First-person view from a submarine sinking down a vertical shaft, 14 metres in diameter, camera tilted down. The shaft walls are raw rock mixed with the outer pipework of a research facility; between the pipes two drowned workers in white lab overalls without helmets are caught, shown only as still silhouettes. At the bottom, about 25 metres below, the steel-framed mouth of a 10-metre-wide flooded channel opens toward the front right and curves away to the right. Submarine floodlight cone through heavy marine snow. 16:9.
```

---

## R03 检疫泊位

**用途**：第一个功能区，教玩家通话、用机械臂夹医疗箱。
**尺寸**：弯月形，约100米长，高10米。宽度从10米逐渐鼓到22米再收回，**鼓出的一侧在左边**（外侧，靠悬崖）。
**内容**：
- 左边鼓出的那面墙：一排倒塌的金属货架，地上散落几十个箱子，其中几个是白底红十字的医疗箱（要夹的目标，结构碰撞）。
- 水道中间：三座倒塌的消毒喷淋拱门，拱门下压着几具没戴头盔的尸体（装饰，不挡船）。
- 右边内侧墙：一扇亮着琥珀色灯的通话窗（T1），细节见R16。

```
First-person view from a submarine entering a flooded crescent-shaped docking bay, 10 metres high, about 100 metres long, curving gently to the right. The bay widens from 10 to 22 metres where the left (outer) wall bulges outward. Against the bulging left wall, a toppled row of steel shelving and dozens of scattered crates on the floor; a few are white crates with a red cross. In the middle of the channel, three collapsed decontamination shower arches lie on the floor with the silhouettes of drowned workers without helmets beneath them. On the right (inner) wall ahead, a thick observation window framed by amber lights. Submarine floodlight and a few dim amber wall lamps. 16:9.
```

---

## R04 标本长廊

**用途**：安静的过渡段，没有任务。
**尺寸**：约140米长，宽10米、高10米，**一直向右弯**，看不到尽头。
**内容**：右边内侧墙边一整排两人高的圆柱玻璃标本罐，全碎了，玻璃边缘参差。罐里泡过的东西漂在水里（剖开的鱼、无眼章鱼、被钉成十字的等足虫，都是死的）。标本罐和漂浮物都是装饰，不挡船。墙上中途有一扇通话窗（T2）。

```
First-person view from a submarine moving along a long flooded corridor, 10 metres wide and 10 metres high, curving steadily to the right so the end is never visible. Along the right (inner) wall stands a continuous row of tall cylindrical glass specimen tanks, each taller than two people, every one shattered with jagged rims. Dead former specimens drift in the water: a dissected fish, an eyeless octopus, a giant isopod pinned in a cross on a board. Halfway along on the right wall, one amber-framed observation window. Everything still and silent. Floodlight shows only the nearest tanks; the rest fade into darkness. 16:9.
```

---

## R05 研究实验室：五个实验舱

**用途**：交代实验舱的布局。
**尺寸**：主水道宽10米，约130米长，继续向右弯。**左边**（外侧）依次伸出五个实验舱，每个宽10米、深19米、高10米，像鱼鳃一样排开，舱口上喷着1到5的编号。
**内容**：从主水道看过去，左边一排舱口一个接一个。舱里都淹了，有倒翻的实验台和漂浮的仪器。右边内侧墙上有通话窗T3，窗下有一个方形传递口（见R16）。

```
First-person view from a submarine in a curved flooded corridor, 10 metres wide and high, curving to the right. Along the left (outer) wall, a sequence of five large rectangular chamber openings branch outward like gills, each 10 metres wide and high, painted with large numbers 1 to 5 on their frames; inside each, a flooded laboratory 19 metres deep with overturned benches and floating instruments. On the right (inner) wall, an amber-framed observation window with a small square steel hatch below it. 16:9.
```

---

## R06 3号实验舱内部

**用途**：玩家开进去夹钥匙箱的地方。
**尺寸**：宽10米、深19米、高10米，潜艇要整个开进去再倒出来。
**内容**：从舱口往里看。倒翻的实验台、漂浮的显微镜和线缆（装饰，不挡船）。舱的最里面那面墙上，挂着一个醒目的红色应急钥匙箱（要夹的目标），探照灯照着它。

```
First-person view from a submarine at the mouth of a fully flooded laboratory chamber, 10 metres wide, 10 metres high and 19 metres deep, painted number 3 on the frame. Inside: overturned lab benches, a microscope on its side, floating instruments and loose cables. On the far end wall, a small bright red emergency key box hangs at mid-height, caught in the floodlight, clearly the focal point. 16:9.
```

---

## R07 水闸弯道

**用途**：实验室和收容环之间，开局被水闸挡住。
**尺寸**：约90米长，宽10米、高10米，向右弯。弯道入口是一道横断整条水道的厚重水闸。
**内容**：只画关着的水闸：横贯10米宽水道的厚钢闸门，带液压臂和警示条纹。闸门缝隙里透出一线红光，暗示后面就是收容环。

```
First-person view from a submarine facing a massive closed sluice gate that seals a 10-metre-wide, 10-metre-high flooded corridor from wall to wall: thick riveted steel leaves, hydraulic rams on both sides, worn yellow-and-black hazard stripes along its edges. A thin line of pulsing red light leaks through the gap between the gate leaves from whatever lies beyond. 16:9.
```

---

## R08 收容环·坑缘俯视（全关最重要）

**用途**：玩家第一次进入收容环的画面，必须震撼。
**尺寸**：圆形深坑（竖井），直径68米。潜艇从坑缘水道口进来（Y0），**坑顶在上方10米，坑底在下方60米**，总高70米。
**视角要点**：镜头在**坑的里面**，往下看一口巨大的圆筒形竖井，收容舱嵌在**井的内壁**上、面朝井中心。不是从外面看一座塔。
**内容**：
- **收容舱，不是笼子**：这里是实验室，用来关深海生物做观察和取样。每个收容舱是嵌进井壁的一个钢制压力舱，正面一扇约3米直径的厚圆形观察窗，旁边一扇沉重的圆形压力舱门，舱口上方一块编号铭牌和一盏小状态灯，舱壁上接着取样管和线缆。舱和舱之间是实心的钢壁，没有缝隙。
- 5层，每层24个，层与层间隔12米。每层收容舱下方有一圈环形导轨，是吊运收容舱用的吊车轨道。
- 很多收容舱的舱门开着、观察窗是黑的（里面空了）；还密封着的，观察窗后面是暗红色的水，看不清里面。
- 6圈共144盏红色旋转警报灯排在井壁上，红光一道道扫过水体。
- **右前方约40米**：井壁上一扇亮着的监控室窗（通话窗T4）。
- **正对面偏右，约65米外**：原来往前走的水道口，被一架从导轨上脱落的收容舱吊车横着堵死（结构碰撞）。吊车正下方60米的坑底，就是唯一的出口：排水通道口。
- 往下看不到底，越深越暗。

```
First-person view from a submarine emerging from a channel mouth INSIDE a colossal flooded cylindrical shaft, 68 metres across, camera tilted down; we are inside the shaft looking down and across, not outside a tower. A low ceiling 10 metres above; the shaft drops 60 metres below into darkness. The entire inner wall of the shaft is lined with sealed laboratory containment cells, five tiers of 24, facing inward toward the centre: each cell is a recessed steel pressure capsule with a large round thick-glass observation port about 3 metres across, a heavy circular pressure hatch, a specimen ID plate with a small status lamp, sampling pipes and cables. Solid steel wall between cells, no bars, no gaps. Below each tier runs a circular crane rail. Many hatches stand open with dark empty ports; sealed cells show only murky dark-red water behind their glass. Six rings of rotating red warning beacons, about 144, sweep red beams across the water and marine snow. Ahead and to the right, a lit monitoring-room window in the shaft wall. Directly across and slightly right, about 65 metres away, the opposite channel mouth is blocked by a huge cell-handling crane fallen from its rail and jammed across it. Vast vertical scale; red and black dominate. 16:9.
```

---

## R09 收容环·沿井壁下潜

**用途**：玩家自由探索时的主要画面，用来做收容舱和井壁的细节。
**尺寸**：潜艇离井壁约10米。每个收容舱正面约6米宽、8米高，观察窗直径约3米。
**内容**：
- 近处一层收容舱，正面朝着潜艇：一排厚厚的圆形观察窗和圆形压力舱门，像一排巨大的实验培养舱。
- 有的舱门开着，往里能看到一个空的圆柱形舱室，舱壁上有取样臂和喷嘴；有的还密封着，观察窗后面黑沉沉的（不画东西）。
- 其中一个开着的收容舱里，地上放着一个白色红十字医疗箱（第三层，Y-24，可选目标）。
- 舱口下方是吊车导轨。上方和下方各一圈红色警报灯。往上能看到远处坑缘的光，往下是黑的。
- 井壁是弧形的，往两边弯出去，显出井有多大。

```
First-person view from a submarine descending inside a vast flooded cylindrical shaft, about 10 metres from its curved inner wall. One tier of sealed laboratory containment cells faces the camera: recessed steel pressure capsules about 6 metres wide and 8 metres tall, each with a large round thick-glass observation port, a heavy circular pressure hatch, a specimen ID plate, a small status lamp and sampling pipes. Solid steel between the cells, no bars. Some hatches are open, revealing empty cylindrical chambers with sampling arms and nozzles inside; sealed cells show only darkness behind their glass. In one open cell, a white crate with a red cross sits on the floor. A circular crane rail runs beneath the tier. A ring of rotating red beacons above and another below. Looking up, faint light at the distant rim; looking down, blackness. The wall curves away on both sides, showing the huge diameter. 16:9.
```

---

## R10 收容环·坑底

**用途**：坑底的可选发现和出口。
**尺寸**：坑底Y-60。正中一个圆形钢制回收槽，直径16米、槽壁高3米（结构碰撞）。
**内容**：
- 正中：回收槽，里面堆着穿白色工作服、没戴头盔的尸体，手腕上挂着白色牌子（只要剪影，不要血腥）。
- **井壁最底层，靠近玩家下来时的这一侧**：最大的07号收容舱，正面约8米宽、8米高，铭牌上大大的“07”。它是从里面被打开的：厚观察窗整块往外爆开，碎玻璃向外翻；圆形压力舱门被从里面顶得往外弯折，挂在一个铰链上；舱口边缘一圈很深的划痕。舱里空了。
- **对面井壁**：排水通道口，10米宽、10米高，往上斜着通走。
- 抬头：六圈红光一层层往上叠，像在井底看天。

```
First-person view from a submarine at the floor of a vast flooded cylindrical shaft, 60 metres down. In the centre, a round steel recovery trough 16 metres across with a 3-metre rim, holding the still silhouettes of drowned workers in white overalls without helmets, small white tags on their wrists, no gore. On the nearby bottom tier of the wall, the largest sealed laboratory containment cell, about 8 metres wide and tall, its ID plate stencilled with a big 07. It has been forced open from inside: the thick round observation glass has burst outward with shards bent out, the heavy circular pressure hatch is buckled outward and hangs from one hinge, deep gouges ring the opening. The cell is empty. On the far wall, a 10-metre drainage tunnel mouth slopes upward. Above, six stacked rings of red rotating beacons and tiers of containment cells climb toward a faint distant rim, like looking up from the bottom of a well. 16:9.
```

---

## R11 坑底排水通道

**用途**：从坑底爬升到生产车间的通道。
**尺寸**：约90米长，宽10米、高10到12米，**一路往上斜着爬**（爬升约44米，坡度约25度），同时向右弯。
**内容**：圆形截面的排水管道，底部有积泥和铁锈流痕，墙上一圈圈加强肋。往上看，通道尽头透出暖橙色的光（生产车间）。往回看，是坑底的红光。

```
First-person view from a submarine inside a large round drainage tunnel, about 10 metres in diameter, climbing steeply upward at about 25 degrees and curving to the right. Ribbed steel lining with circular reinforcement rings every few metres, silt and rust streaks along the bottom. Far ahead and above, warm orange haze glows where the tunnel opens into a production area. 16:9.
```

---

## R12 生产车间

**用途**：水母谜题的场景。
**尺寸**：一条下沉的长沟，约150米长，宽16米；沟底在Y-16，顶在Y5，高约21米；尽头地面升回Y-5。向右弯。
**内容**：
- 沟底：灌药流水线，传送带上一排排小玻璃瓶（装饰）。
- **左边**（外侧墙）：一排8个大圆柱培养槽，每个直径3米、高13米，间隔5米，槽身上喷着大号编号1到8，冒着暖橙色热气（结构碰撞）。不画水母，水母只在照片里出现。
- **右边**（内侧墙）：通话窗T5。
- 培养槽后面，沟的中段：两台冲压机，见R13。

```
First-person view from a submarine entering a long sunken industrial trench, 16 metres wide and about 21 metres from floor to ceiling, curving to the right. On the trench floor, a conveyor line carrying rows of small glass vials. Along the left (outer) wall, a single row of eight large cylindrical culture tanks, each about 3 metres wide and 13 metres tall, 5 metres apart, stencilled with big numbers 1 to 8, warm orange haze rising from them. On the right (inner) wall, an amber-framed observation window. Further along, the dark shapes of huge press machines across the trench. Murky warm water, oppressive factory scale. 16:9.
```

---

## R13 冲压机

**用途**：要按节奏通过的机关。
**尺寸**：两台巨型冲压机，前后挨着，横跨整条16米宽的沟。冲压头从顶部砸到沟底，两台交替砸下，每10秒有3秒同时抬起，潜艇要在这时穿过。
**内容**：正面看两台冲压机。冲压头是巨大的钢块，导轨上全是磨亮的划痕。一台在下、一台在上。冲压头下面的地面被砸出凹坑。

```
First-person view from a submarine facing two gigantic industrial press machines standing one behind the other across a 16-metre-wide flooded trench. Each has a massive steel ram block riding on vertical guide rails polished bright by wear; one ram is down, crushing the floor, the other raised high. The floor beneath is dented from repeated impacts. Hydraulic cylinders, warning stripes, rust. The gap under the raised ram is just large enough for a small submarine to pass. 16:9.
```

---

## R14 术前准备室弯道

**用途**：全关最窄、最压迫的一段，通往手术室。
**尺寸**：约120米长，**只有8米宽、8米高**，一直向右弯。尽头是一个直径14米的圆形空间，从那里**向右**转进一条49米长的笔直通道，通道尽头是手术室。
**内容**：
- 墙离得很近。右边内侧墙上一扇通话窗T6，窗后是冷白光的准备室（玻璃后只做布景）。
- 顶上贴着一排检修管道和一条窄窄的爬行格栅（护理员会从上面爬过）。
- 尽头笔直通道的远端，透出手术室圆顶的微光。

```
First-person view from a submarine inside a narrow flooded service bend, only 8 metres wide and 8 metres high, curving steadily to the right; walls close on both sides. On the right (inner) wall, an amber-framed observation window with cold white light behind it. Along the ceiling, a bundle of maintenance pipes and a narrow crawlway grate. Ahead, the bend opens into a small round chamber, and from there a straight tunnel leads to the right toward a faint glow where a large dome begins. Claustrophobic, cold. 16:9.
```

---

## R15 手术室

**用途**：结局场景。
**尺寸**：完全淹没的圆顶，直径64米。潜艇从8米宽的直通道进来，停在Y0；**地面在下方12米，顶在上方14米**。离地19米（Y7）处，墙往里收5米，形成一圈环形挑台。
**内容**：
- 正中地面：不锈钢手术台（2.6×6.4米，结构碰撞），上方一盏大无影灯，台子底下一个阀门转轮。
- **手术台左后方约12米**：地上一个直径12米的圆形排水格栅（关着，下面是竖井）。
- 挑台下方的弧形墙上：一排排挂架，挂着几十个潜水头盔（装饰）。
- **左前方挑台**：通话窗T7。
- 穹顶最高处：一片漆黑（护理员只在照片里出现，这里不画）。

```
First-person view from a submarine entering, halfway up, an enormous fully flooded domed operating theatre, 64 metres across. The floor lies 12 metres below; the dome rises 14 metres above. On the floor in the centre, a single stainless steel operating table under a large round surgical lamp, a valve wheel beneath the table. To the left of and beyond the table, a large closed circular drain grate 12 metres across set into the floor. Around the dome wall about 7 metres above, the wall steps inward to form a ring-shaped gallery with a railing; on the left part of the gallery, an amber-framed window. Below the gallery, along the curved wall, rows of racks holding dozens of diving helmets hanging side by side. The top of the dome disappears into darkness. Cathedral-like scale, cold, silent. 16:9.
```

---

## R16 通话窗（全关重复使用的组件）

**用途**：T1到T6都是这个组件，做一次多处复用。玩家每次通话都停在这里，离窗约5米。
**尺寸**：圆角压力窗约1.5米宽、1米高，窗框一圈琥珀色指示灯。窗下约1米处是一个方形传递口（约60厘米见方，带把手的不锈钢小舱门，只有T3下方有）。
**内容**：从潜艇里看水道右侧墙。窗后是一小段干燥空间（只做布景，约2米深）：昏黄的灯、墙上一台数据终端。窗后可以有一个戴赭黄色头盔的人影（艾里亚斯），制作时用作角色站位参考。两边的光要明显不同：外面是黑水和探照灯，里面是干燥空气里的暖光。

```
First-person view from a submarine about 5 metres from the right-hand wall of a flooded corridor. In the wall, a thick rounded-rectangle pressure window about 1.5 metres wide and 1 metre tall, framed by a ring of amber indicator lights. Behind the glass, a shallow dry alcove with air, not water: dim warm light and a wall-mounted data terminal; a diver in a dark dry suit and ochre-yellow hard helmet with a dark faceplate stands behind the glass. About one metre below the window, a small square stainless steel pass-through hatch with a handle, about 60 centimetres across. Outside the glass, black water and marine snow in the submarine floodlight; inside, dry still air. 16:9.
```

---

## R17 排水竖井（出口）

**用途**：关卡出口，结尾往下冲。
**尺寸**：直径12米，从手术室地面（Y-12）一直往下到Y-70；玩家下到Y-40以下即出关。井壁上半段有一个窄检修平台（通话窗T8）。
**内容**：从格栅口往下看。圆形竖井，井壁一圈圈钢肋，水打着旋往下抽。上半段井壁上一个窄钢平台带栏杆。

```
First-person view from a submarine at the open grate of a vertical drain shaft, 12 metres in diameter, camera pointing straight down. The shaft is lined with circular steel ribs and drops far into darkness; water spirals downward. On the shaft wall a few metres below, a narrow steel maintenance platform with a railing and a small amber-lit window. Debris and silt swirling down with the current. 16:9.
```

---

## 优先级

1. R01 研究所外观（定风格）
2. **R08 收容环坑缘俯视**、**R09 沿井壁下潜**、**R10 坑底**（全关重点，三张一起定）
3. R16 通话窗（复用最多的组件）
4. R15 手术室
5. R12 生产车间、R13 冲压机
6. R03 检疫泊位、R05 实验舱、R06 3号舱、R14 准备室弯道
7. 其余：R02、R04、R07、R11、R17

生成好以后放进 qa/level-03/route 目录，文件名用编号开头，例如 `R08-pit-rim.png`。
