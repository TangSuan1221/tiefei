# 深海房间 Three.js 接入实现规格

调查日期：2026-09-18。范围：现有房间渲染、模拟状态、驾驶输入、机械臂和关卡生命周期。本文是实现规格；没有修改运行时代码、安装依赖、启动 Blender、生成模型或进行浏览器视觉验收。七关主题由另一工作流提供，本文不重新定义主题。

## 1. 结论与实施边界

推荐保留 `PodRun`、`VolumeNode`、`RoomObstacle` 作为玩法和空间数据源，新增会话级 Three.js 房间渲染器，仅替换实时房间画面；继续使用现有 Canvas 2D 工作台、物资列表、声音和 `PostPipeline`。这能把接入风险限制在视图适配和明确的驾驶重构中。

但“把画面换成 Three.js”不等于“摄像机驾驶”：目前移动只有 `thrust()` 触发的离散脉冲，摄像头键只转云台；领航台与摄像台键位冲突；过门有自动对门和近门瞬移；航渡根本没有连续空间位置。这些路径必须单独处理。

第一阶段应完成“当前房间实时三维驾驶＋原有箱面取物”；房间之间可以保留明确的过门切换，航渡可保留原有抽象，但必须说明它仍然是抽象航渡。真正全程连续驾驶还需要额外的航渡碰撞走廊及跨房间连接几何，不能只拉伸现有图节点位置。

## 2. 已核实的架构与定位

### 2.1 依赖与表现管线

- `package.json`：只有 TypeScript、Vite、tsx、Node 类型等开发依赖，没有 Three.js，也没有测试脚本。`build` 先运行 `tsc --noEmit` 再 Vite build。
- `tsconfig.json`：严格 TypeScript、ES2022、bundler 模块解析，`@/*` 指向 `src/*`，检查范围包括 `src` 和 `tools`。
- `view/session.ts / startPodSession()`：构造 `PodRun` 和 `PodView`，绑定声音、视频生成回调；`PodSession.frame()` 是当前唯一主动画循环，依次处理持续输入、模拟、表现。
- `view/present.ts / PodView`：内部 `scene` 和 `hud` 均为 Canvas 2D；`drawScene()` 先画舱内，再调用 `drawStationView()`；最终 `pipeline.upload(scene, hud)` 上传到 `post-canvas` 的 WebGL2 后处理。
- `view/stations.ts / drawStationViewInner()`：摄像台独立走 `drawCameraWorkbench()`，其他台走普通 CRT＋控件排版。
- `drawCameraWorkbench()`：镜头占工作区宽度 72%，右侧为 `drawLocker()`；镜头控件、机械臂控件分别在镜头下方。
- `drawNav()`：左为回波雷达，中为 `drawHoloMap()` 近场线框，右为航向和推力。仅替换 `drawCamera()` 不会移除这个近场线框导航。
- `drawCamera()`：`drawCameraFeed()` → `drawArmBody()` → `drawShotStatus()` → `drawArmReadout()` → `drawFieldFx()`。
- `view/creature.ts / drawCameraFeed()`：片源优先级为 GM 提示词、主动回放影片、已分析当前房间、全景、空水；之后叠加怪物、雪花、取景器。`roomFeed()` 当前要求 `site && identified && volumeAt`。
- `view/camera-room.ts / drawRoomCamera()`：自制 CPU 投影和 Canvas 2D 面片光照，不是 Three.js；还包含近裁切、雾、阴影、景深和目标标注等辅助处理。换新渲染器时不要再叠完整旧光照管线。
- `view/roomview.ts / buildRoom()` 是原始房间几何；`projectRoom()`、`basisOf()`、`reachableTargets()` 同时支撑投影和交互。模拟侧 `manipulator.ts` 已依赖这里的纯数学，不能因为删除旧渲染而连带删除。

### 2.2 坐标、单位与镜头

模拟约定：米；房间中心原点；X 正向为航向 090°；Y 正向为航向 000°；Z 正向为下潜。`VolumeNode.pos` 是关卡图布局位置，`cabinPos`、障碍 `pos` 和门 `pos` 是当前房间局部坐标。`size` 是完整边长，不是半边长。不能把 `node.pos` 加到箱子上，却不加到摄像机上。

`heading` 和 `pitch` 用度；`camPan` 和 `camTilt` 用弧度。`lookDir()` 计算 `(sin heading * cos pitch, cos heading * cos pitch, sin pitch)`。

```86:99:src/pod/view/camera-room.ts
export function cameraEye(
  pos: Vec3,
  heading: number,
  pitch: number,
  camPan: number,
  camTilt: number,
): Eye {
  return {
    pos: { x: pos.x, y: pos.y, z: pos.z },
    yaw: (((heading + (camPan * 180) / Math.PI) % 360) + 360) % 360,
    pitch: clamp(pitch + (camTilt * 180) / Math.PI, -86, 86),
  };
}
```

注意有两份镜头计算：上面的表现函数把合成俯仰限制在 ±86°，`PodRun.cameraEye()` 却不限制合成俯仰。船体允许 ±80°，云台再加约 ±28.65°，极端情况下渲染和瞄准会分离。新实现必须合并为一个纯函数，模拟、三维摄像机、目标提示共同调用，不能只在 Three.js 侧悄悄修正。

还有视场差：Canvas 房间 `HALF_FOV=0.58`，模拟 `camHalfFov=0.55/camZoom`，线框 `HOLO_HALF_FOV=0.678`。核心轴线命中不依赖视场，但边缘目标提示会受影响。先明确一个镜头规格，保持旧轴线行为，再统一边缘提示视场。

推荐渲染坐标转换：模拟 `(x,y,z)` → Three `(x,-z,-y)`，令前方为 Three 的 -Z、上方为 +Y、右方为 +X。逆转换同样为 `(X,-Z,-Y)`；尺寸转换为 `(size.x,size.z,size.y)`，三个尺寸保持正值。设置摄像机位置为转换后位置，朝向为转换后的 `basisOf(eye).fwd`，up 为转换后的 `basisOf(eye).up`。

这个映射含反射，行列式为 -1：从旧面片直接转换顶点时必须检查并反转三角形绕序、重建一致法线，房间内墙与实体外壁分别验证。不要把整个 Three 场景简单设成负缩放再期待法线、阴影和拾取自然正确。不能把 `lookAt()`、Three 默认 up 和模拟向量随意混用，否则可能左右镜像。

Three 摄像机视场建议由已有像素焦距统一换算：`focal = min(w,h)/2/tan(halfFov)`，`verticalFov = 2*atan(h/(2*focal))`。Three 使用度，最后换单位。只把 `2*halfFov` 当竖直视角在窄屏会错；放大应调整投影而不是移动镜头。镜头光心继续严格等于 `cabinPos`，不增加 Blender 摄像机的安装偏置；灯可以偏置。

`run.depth` 当前不包含 `cabinPos.z`，而是航程插值加节点布局 Z；局部下潜不改变 HUD 深度。真正空间驾驶如要求深度即时变化，需要单独修正并验证压力、生存数值影响，不能让渲染坐标直接驱动现有生理模拟。

### 2.3 房间、碰撞与门

`gen/interior.ts`：

- `POD_R=1.2`，实际墙边界使用 `POD_R*0.85`，障碍使用 `POD_R*0.75` 膨胀轴对齐包围盒（AABB）。它是保守盒体检测，不是精确球与网格碰撞。
- `furnishVolume()/furnishRoom()` 按角色布置 pipe/crate/beam/tank/column/grate。中心、中心到门的线段及门附近有障碍避让；固定种子生成后最终按顺序赋 `${node.id}.o${index}`。
- `doorsOf()` 按相邻图节点的最大坐标差选门所在墙轴。门位置是局部坐标，每个图邻居都产生一扇门，不存在精确拼接的走廊网格。
- `traceCabin()` 沿线分段采样，步数至少 10，间隔最多约 0.22m；返回 free/wall/obstacle/door。先测房间边界与门，再测膨胀障碍。
- `inDoorOpening()` 允许门宽高之外各加 0.35m 的中心点容差；和实体艇宽、可见门尺寸不是严格相切关系。
- `spawnInRoom()`：初始生成在靠 -Y 墙，换房则从反向门内缩 `POD_R+0.9`；`settleCabin()` 会重新把船体朝向房间中心。

`PodRun.moveInVolume()` 当前行为尤其需要拆开：

1. 按档位一次走 4.5/7/11m，瞬间写位置；每次扣电、噪音和一口气或警报呼吸累积。
2. 航向与俯仰各在门方向 ±16° 以内时，自动把推进方向改为门中心方向。
3. 距门小于 5.2m 时可直接切换目标房间。
4. 有目标门时调用 `traceCabin(..., !!aimed)`，最后参数为 true 会忽略障碍。
5. 正常 trace 碰到门后也执行换房，两个分支复制了锁、机关、访问、回波、声呐更新逻辑。
6. `depart()` 会阻止带着伸出机械臂离关，但 `moveInVolume()/thrust()` 没有对应禁止，当前可以带臂在房间内推进甚至换房。这是接入驾驶必须补上的模拟层防线，而不是仅灰掉 UI。

墙面几何还有已存在的多门风险：`doorsOf()` 能在同一面墙产生多个门，`buildRoom()` 只用 `doors.find(axis/sign)` 切第一个洞；其他门可能可通过却被画成墙。必须按同墙全部门洞切网格、检测洞口重叠，或在生成器保证一面墙最多一个门。七关多分叉房间都需要做这项检查，不能以“共用 buildRoom”代替验证。

### 2.4 驾驶键位与真实物理路径

`session.ts / onKeyDown()` 当前非方向键忽略 repeat；`applyHeld()` 只在 camera 台持续转云台，完全不推进。

- 过道 A/D 切工位，Enter/空格坐下；数字直达工位，但坐下后优先匹配该工位动作。
- camera：方向键连续云台；Q/E 云台水平步进；W/S 云台垂直步进；1 曝光/回放，2 切片源，3 灯，4 冷焰；R/F/C 为伸出/翻找/收回；Y 操作机关或残骸；`[`/`]` 选择物资；滚轮和 +/- 缩放。
- nav：A/D 航向 ±5°，W/S 船体俯仰 ±8°，Z/X 档位，4 推进，5 离站；1/2/3 声呐，6 充电或诱饵，7 脉冲。
- `performControl()` 最终调 `nudgeHeading/nudgePitch/setThrottle/thrust/depart`。这些模拟方法一般没有工位约束，工位约束主要在 UI 输入路由。
- `thrust()` 的航渡分支仅比较 `safeHeading/tolerance` 并增加 `traveled`，没有用 `cabinPos` 或房间碰撞；`pitch` 对这段空间轨迹不生效。只移动 Three 摄像机绝不会改变航渡进度。

实现主摄像机驾驶的最小控制方案（建议，不是已存在功能）：

1. 保留 `camera` 工位身份和旧 salvage→camera 别名，以免 `ArmConditions.atCamera`、摄影曝光和箱内列表被拆坏。
2. 在同一台增加明确的“驾驶/作业”模式；驾驶模式锁云台到舱首，A/D 控制船体航向，W/S 控制船体俯仰；方向键仍可用于作业瞄准。R/F/C、3 灯、`[`/`]` 不变。为推进选无冲突的新键，例如空格；Z/X 档位、B 离站。不能把 nav 全部数字键直接拼进 camera 控件。
3. 作业模式保持云台自由转动；主驾驶默认 `camPan=camTilt=0`，或提供显式“船头对齐当前镜头”动作。不能看着右侧箱子却默认船体向另一个方向走、又不显示船头标记。强制回中只在显式模式切换且臂已归位时发生，不能伸臂过程中复位镜头。
4. `drawCameraWorkbench()` 当前只绘制 camera/use-flare 和 arm/salvage 两组过滤后的控件。增加驾驶动作时必须扩展排版和过滤规则，否则键可用但按钮不可见。
5. 将 `drawNav()` 的主近场线框改为辅助信息或移除；`adviseStationFor()`、分析成功日志、`stationRef()`/工位介绍和 HUD 提示统一指向主驾驶摄像台。保留雷达为辅助探测，不能把线框换了颜色当作真实房间。
6. 在 `PodRun` 增加纯输入状态 `setDriveInput(input)` 与 `stepDrive(dt)`；位置只由模拟写，Three 只读。固定步长积分，速度/加速度单位明确，复用 `traceCabin` 或新纯 sweep 函数。
7. 从 `moveInVolume()` 提取统一 `tryCrossDoor()`/`enterRoom()`，保留锁、`resolveTrap`、`markVisited`、`resolveEcho`、声呐刷新；取消摄像驾驶路径的 16° 自动转向、5.2m 提前瞬移和忽略障碍。门只在真正抵达边界时尝试通过，失败留在安全侧。
8. 禁止在 `armOut`、充电、回放/提示词或无电时移动；曝光是否允许移动应明确，建议曝光时停船。`armConditions.onStation` 目前只检查 `phase==='site'`，增加连续速度后还必须检查停稳。伸臂请求不能仅停输入而留下惯性。
9. `collide()` 当前站内每次固定扣 0.05 舱体等；连续接触不能每帧扣一遍。需要接触开始事件或冲量/速度阈值＋冷却。`resolveTrap()` 也不能每帧重试、重复伤害/随机判定。
10. 连续驾驶不能每帧直接调用 `thrust()`，否则每帧都扣整次电、噪音和呼吸。移动距离、时间、基础消耗独立计量；保留 `calm/alert` 混合时钟，明确驾驶消耗与警报基础呼吸的叠加规则。不要再每帧触发转舵 UI 音。
11. `session` 应对 blur、visibilitychange、离台、死亡、控制台/提示框打开清空 held input；GM 打开时现有 `applyHeld` 仍可能使用旧 keys，新增驾驶输入不能沿用这个漏洞。输入中的 CSS 指针坐标需要减工作区偏移再转换为渲染像素。
12. 若用户进一步要求无缝航渡，新增 transitPose/航渡场景和碰撞，进度由沿路线距离计算，抵达调用 `arrive()`；旧 safeHeading 判定与 Three 空间轨迹只能选一个权威，不能并行造成“画面避开墙但模拟仍撞墙”。这是第二阶段，不属于纯渲染替换。

## 3. 箱面瞄准与选物收臂：必须保持的契约

### 3.1 目标必须是表面，不是箱心

`roomview.ts / reachableTargets()`：先测镜头光轴与障碍 AABB，命中就用首次表面交点、`offAxis=0`；未命中才以箱心方向提供调整提示；两条路径都按表面距离、逐障碍遮挡过滤，最后偏角优先、距离次之。

`manipulator.ts / acquireTarget()` 限制 crate，`ARM.reach=6.5m`，`blockRummage()` 偏角上限 0.17rad。放大镜头不能使已命中的箱面丢目标。前方 tank/pipe 等必须挡住后面箱子。

新 Three 版本先继续使用这套纯模拟判定；Raycaster 可做显示对照，不要在视图中另写“最近箱心/鼠标最近模型”的第二套取物规则。目标标记、距离、爪尖接触都读同一 `ArmTarget.pos`；`roomMarks().aimPoint` 已用于这一点。

模型箱子的可操作外表面必须与 AABB 箱面贴合。若美术要做严重倾斜、凹陷或敞开箱盖，第一阶段只把细节放在不改变主体轮廓的位置；否则需要统一替换模拟射线、碰撞和视觉网格，不可只改视觉。箱内展示不是“移除箱子实体”；拿空后继续保留碰撞和障碍 ID。

### 3.2 当前真正运行的作业流程

旧注释仍讲“多爪赌博/随机卡爪/过热”，当前正常箱内列表实现已简化。应以函数体和回归测试为准。

- `extendArm()` 校验工位、电、光、目标，强制 `shot.viewing=false`；开始 extending，约 3.4s 后 aiming，不自动发货。
- `rummage()` 捕获 `gripId` 和插入时偏角，清除旧选择；1.8s 后 `stepArm()` 发 grip 事件。
- `resolveGrip()` 首次翻找遍历箱子的剩余内容，形成 `containerItems`，不入艇内库存；再次翻找重用已有列表，不重新生成；当前正常流程不施加随机卡爪/抓臂阻断。
- `locker.ts` 只展示箱内物资，不展示艇内背包；点击或 `[`/`]` 更新 `selectedBoxItem`。
- `retractArm()` 在按下 C/收回按钮时把 `{box,id}` 保存到 `armCargo`，然后 hauling；收回途中禁止改选和重复收回。不能在动画完成时才临时读当前目标。
- `tickArm()` 收到 stowed 事件，才从该箱扣一件并调用 `takeLoot()`；装不下的保留在艇内 `bench`，不丢弃。
- 提前 C 可以中断 gripping，不产生物品。断电、关灯、旧 jammed 都必须能走应急收回；`blockRetract()` 现在没有供电或 jammed 阻断。`stepArm()` 对 hauling 不执行断电暂停。
- 等待选物没有过热强制收回；但噪音、唤醒和警报等其他模拟仍然可能继续，不代表游戏全局暂停或绝对安全。
- 回放/片源切换在臂伸出时被禁，冲洗异步成功不抢实时画面。`tickShot()` 每帧也兜底 `armOut → viewing=false`；收臂后不会自动切回影片。

关键交付时点：

```3607:3620:src/pod/sim/run.ts
          if (ev.phase === 'stowed') {
            this.emitOutside('arm.stow', 0.7);
            const cargo = this.armCargo;
            this.armCargo = null;
            if (cargo) {
              const items = this.containerItems.get(cargo.box) ?? [];
              const item = items.find(item => item.id === cargo.id && item.n > 0);
              if (item) {
                item.n--;
                this.containerItems.set(cargo.box, items.filter(item => item.n > 0));
                const c = this.containers.get(cargo.box);
                if (c) c.exhausted = !items.some(item => item.n > 0);
                this.arm.lastLine = `已取回：${this.takeLoot([[cargo.id, 1]])}`;
                this.pushLog(this.arm.lastLine, 'good');
```

仅换房间 Three 图像时可先保留 `drawArmBody` 的旧二维臂，但这不提供真实深度遮挡：现有遮挡是屏幕中心圆形裁切。若要求真实三维机械臂，应在 Three 场景中放骨架/关节模型，状态仍只读 `armPose`/ArmState，并增加插入时表面接触点快照供动画使用；gripping/jammed 不应跟随随后转动云台的新目标。渲染动画完成回调绝不能负责发物品，仍由 `stepArm→tickArm` 结算。

## 4. 关卡生成与状态推进

- `content/acts.ts` 的 `actAt()`/ACTS 提供七段配方，`gen/volume.ts` 的 LAYOUTS 提供布局；主题工作流可提供 act→themeId 映射，不改掉现有角色、锁、机关、出口等功能字段。
- `generateVolume()` 顺序是 layout → decorate（生物/机关/缓存）→ ensureHook → applyStoryShape → hookNode → furnishVolume → 可选 splice。实体 ID 与顺序影响确定性箱内容，视觉随机流必须独立，不消耗 `run.rng` 或生成器原流。
- 第一关构造时已生成；之后每关 `arrive()` 调 `ensureVolume()` 生成，SAN 分档和跨关记忆参与生成。部分顶部注释仍描述旧“冲洗生成下一段”，当前 `canSurvey` 固定 false，`enterSplicedSite` 是旧兼容路径，不能拿它当正式关卡通行。
- 航渡抵达 → phase=site、归零推力、入 entry、`settleCabin` → 拍摄并进片盒 → `analyzeTape()` 调 `identifyVolume()` → 可探索房间 → 到出口且锁解开 → `depart()` → 下一段 transit；最后一段 depart 触发逃出。
- `tickShot()` 曝光完成就本地存片，随后才调视频服务；网络失败不必阻断本地分析。Three 模型加载也应有同等独立性，不能以外部视频或模型成功为移动/开锁前提。
- `canDepart()` 实际检查 site、电、identified、出口、第一把锁；`explorationDone()` 的全部必访要求并没有在这里调用，`hookGate` 主要用于提示。不要自行把它们“统一”为更严的离站规则，以免七关流程变化。
- `resetArm()` 在到站/离关等阶段重置箱物状态；普通房间切换不应调用它。卸载一个 Three 房间不是清空 `containers/containerItems` 的理由，返回房间后必须保留箱内剩余物资。

可见实体与分析知识应分开：房间数据分析前已经存在，推荐到站后实时画实际墙、门、箱，`identified` 继续控制知识、名称、真伪、机关解法；是否允许未分析移动由玩法决定，第一阶段可保持原 gate 并明确提示。绝不能为显示房间直接把 `identified=true`，否则绕过拍片/分析/通关规则。与此同时，未分析时 `armTarget` 已可计算，而旧 `roomFeed` 不画真实箱子，这个现有不一致应通过真实房间显示解决。

## 5. 建议新增接口与文件职责

以下接口为实现建议，尚未创建。

### 5.1 `src/pod/view/three-room.ts`

会话级 `ThreeRoomRenderer`，归 `PodView` 所有：

- `readonly canvas: HTMLCanvasElement`：独立 WebGL canvas，不能对已有 2D scene 或后处理 out 再申请 Three 上下文。
- `setRoom(snapshot, theme): Promise<void>`：按 sessionId/volumeId/nodeId/geometryRevision/assetRevision 切房；加载期间显示同步的程序化实体占位，成功才替换视觉网格，碰撞早已由模拟决定。
- `resize(widthPx, heightPx): void`：接实际镜头区域像素，不乘第二次设备像素比；只在尺寸变化时重建缓冲。
- `render(frame): CanvasImageSource`：同步渲染并立即返回 canvas 给 `drawImage`。frame 含统一 Eye、投影、time、light、corruption、marks、arm 显示快照，均只读。
- `disposeRoom(): void`：释放本房实例、订阅、局部材质；保留按引用计数管理的共享资源。
- `dispose(): void`：销毁会话资源，可重复安全调用；令所有未完成加载失效。

不要让 `render()` 调 `generateVolume()`、`selectBoxItem()`、`retractArm()` 或改变 `PodRun`。不要让 constructor 在模块 import 时访问 document/WebGL；测试使用 Vite SSR 载入 stations，模块级 WebGL 初始化会直接破坏无头测试。

### 5.2 `src/pod/view/room-frame.ts` 或纯数据适配模块

定义 `RoomRenderSnapshot`：sessionId、volumeId、nodeId、revision、roomSize、doors、obstacles、themeId；稳定关联键为 obstacleId / door.to。门显示状态另带 passageState（open/locked/hazard-blocked），由只读模拟查询取得。查询不能调用带伤害或随机副作用的 `resolveTrap()`。

定义 `CameraFrame`：规范化后的 Eye、半视场/像素焦距、帧时间、供电、灯/冷焰/闪光、目标表面点、ArmState 只读视图。统一 `getCameraPose()`，不要维持 view 和 sim 两套 pitch clamp。

`RoomFramePresenter` 可按 `renderTo2D(ctx,w,h,frame): void` 接口提供 Three 和原 Canvas 两个实现。由 `StationView` 或 `CameraFeedInput` 显式传入 presenter，避免全局单例串会话。camera-room 的数学保持导出兼容，逐步迁移而不是一次删除。

### 5.3 `src/pod/view/deepsea-assets.ts` 与资产清单

七关主题映射、GLB 资产 URL、revision、源单位、基准尺寸、材质参数、许可证/来源、内容哈希。主题只选择材质、模块和装饰，不覆盖模拟 node/obstacle ID。

建议 Blender 交付规则：

- 使用米，应用物体旋转与缩放，导出 GLB；标准箱模块中心原点，与模拟完整尺寸相匹配。若 Blender 工作约定为 X 右、Y 前、Z 上，则其到模拟为 `(x,y,-z)`，标准 glTF 导出再经实物标定确认，加载后不重复轴转换。
- 交付轴向标定模型（前、右、上）和 1m 参考物，检查加载后的 bounding box；不能仅凭文件坐标声明确认方向。
- 静态墙板/地板/门框按模块装配，门洞来自 `doorsOf()`。每关一个封死的整房 GLB 无法直接适应随机房间尺寸与任意门拓扑。
- 名称约定可用 `VIS_*`（可见网格）、`COL_*`（碰撞代理）、`SOCKET_*`（门/灯/机械臂锚点）。清单记录碰撞代理如何导出为模拟数据，不在运行时凭渲染网格另建不同碰撞世界。
- 第一阶段 `COL_*` 必须对应现有 AABB，视觉实例根据 obstacleId 放置。装饰标为 nonCollidable；它不能遮住可操作箱面或占据通行净空，否则玩家看到的和能通过的不一致。
- 任何会挡路/挡取物的新增装饰必须加入统一障碍数据和可达性验证；粒子、轻微污渍不参与碰撞或拾取。
- PBR 材质至少提供合理 base color/roughness/metalness/normal，颜色贴图按 sRGB，数据纹理为线性。烘焙光不应把关灯后的房间持续照亮。Three 色彩输出和现有调色衔接，避免重复 tone mapping。
- 一盏随镜头或船体定义明确的 SpotLight，加入近距离阴影、水下雾和适度悬浮粒子。Three 普通 fog 并不等于真实体积光，不能以 SpotLight＋fog 宣称完成物理体积散射。强度、距离、色彩由主题清单提供，fx.flash 也要进入统一光状态。

这次未启动 Blender，因此上面是交付规范，不代表存在或已经通过模型质量验收。

## 6. 最小侵入合成与释放资源

推荐首版顺序：Three 独立离屏 canvas 渲染实时房间 → 同一次主帧中立刻 `ctx.drawImage` 到现有摄像 CRT 内容矩形 → 现有二维读数/箱列表 → `PostPipeline.upload/render`。这样不用重写全 UI，右侧 HitMap 继续工作。

禁止另起 requestAnimationFrame 或 `renderer.setAnimationLoop`；现有 session frame 是唯一节拍。Three 的模型动画用传入 dt/time。复制必须与 Three render 同一任务立即完成，默认不启用 preserveDrawingBuffer，不使用每帧 readPixels/toDataURL。GL canvas→2D→post 可能有额外复制/同步成本，需实测再决定是否改为统一 WebGL 合成，不能先宣称性能提升。

现有 `PodView.resize()` 限 DPR 为 1.5、总输出像素约 260 万；新房间 render target 应按摄像矩形尺寸单独控制，过道缩放期间避免每帧分配新目标。可量化 resize 或等布局稳定后换尺寸。主镜头未显示时可跳过渲染而保留模拟推进。

当前 `PodSession` 没有 stop/dispose，循环在结局后仍继续，事件监听也一直存在；`PodView` 没有总释放入口，虽然 `PostPipeline.dispose()` 已有。新增资源前补：

1. 存 RAF id，`stop()` 取消下一帧，移除 keydown/up、pointerdown/move、wheel、新增 blur/visibilitychange，清空输入。
2. `PodView.dispose()` 释放 Three、后处理、音频及其它有所有权的资源；回调从 run 解绑定。死亡后如要继续画尾声，明确保留到尾声退出再销毁，不能先 dispose 还继续 render。
3. 每个 BufferGeometry、Material、Texture、render target 显式 dispose；共享纹理/几何引用计数，避免一间房销毁导致相邻房资源失效。处理材料数组、骨骼资源、AnimationMixer 的停止与 uncache；仅场景 remove 不释放 GPU。
4. 自建 ImageBitmap 无引用后 close；Blob URL revoke；加载器 worker/解码器在所有者退出后释放。GLTFLoader 一次性请求未必可取消，仍必须有 generation token，旧请求完成时不得挂到新房。
5. 监听 webglcontextlost/restored，损失时展示明确回落/暂停驾驶策略，恢复时重建 GPU 资源。两条 WebGL 管线会增加显存，重复开局/HMR 必须销毁旧实例。
6. 新缓存 key 包含会话种子或唯一会话标识及几何 revision。现有 `PodRun.roomGeo()` 只用 vol.id/node.id/障碍数量，`camera-room.slotFor()` 再加 size；同数量改位置、跨种子同 ID 都可能缓存错。主题换肤与碰撞 revision 分开，不以加载顺序作为身份。
7. GLB 从 Vite 同源静态资源路径加载；避免外链跨域污染 canvas，导致后处理 upload 失败。

`HitMap` 目前把 CSS 坐标线性映射到 scene 像素，后处理曲面没有逆变换；新镜头新增鼠标射线时还必须考虑 CRT 内容矩形、缩放、后处理变形。首版保留中心准星＋键盘瞄准和原侧栏点击最稳，避免附带引入一套错误的鼠标拾取坐标。

## 7. 验证计划与已知风险

已有回归文件已阅读：

- `tools/arm-targeting.test.ts`：碰撞边界贴箱；箱面优先于箱心；高倍镜头；6.5m 表面距离；四周/上下方向；前后遮挡；roomMarks 使用相同 aimPoint。
- `tools/camera-workbench.test.ts`：旧打捞别名；所有阶段快捷键唯一；伸臂强制实时；异步冲洗不抢画面；一次选择一次收回；禁止收回途中改选；满仓保留；跨会话状态隔离。
- `tools/manipulator.test.ts`：提示方向、伸出不发货、必须翻找、提前收回不发货、空箱安全收回、断电应急收回、相位事件只发一次。
- `tools/arm-retrieval.test.ts`：等待选物不强制过热；旧 jammed 断电可收回。

本次尝试运行一次有限测试命令 `npx tsx --test tools/arm-targeting.test.ts tools/arm-retrieval.test.ts tools/camera-workbench.test.ts tools/manipulator.test.ts`，终端工具返回 Windows sandbox helper 环境错误，没有给出测试执行结果。不能据此声称通过；未启动持续测试或游戏循环。之后实施者应在正常终端运行上述测试、`npm run typecheck` 和 `npm run build`。

新增必须覆盖：

1. 坐标转换往返、000/090/180/270 朝向、上下俯仰、极端 pitch clamp；Three 投影与纯数学投影一致，灯偏移不改变交互光心。
2. 各宽高比和缩放下箱面中心射线与 `armTarget` 同一目标；可见模型表面与 AABB 首交距离一致；操作遮挡不会因模型加载而变化。
3. 各关各房同墙多门、竖直门、门锁与机关关闭；连续碰墙只结算有效碰撞，过门事件只触发一次，出生点不在墙或障碍内。
4. 按住驾驶跨帧推进、松键/失焦立即停输入；作业期禁止推进和过门；回放/提示词模式不允许盲驾；控制台输入不传到船体。
5. 全程用现有按钮链：贴箱→R→F→选择第二种物资→C→到位才入库，箱内数量减一、满仓进台面；途中回调/灯灭/断电不能改变所选 cargo 或重复发货。
6. 切房卸载再回房，箱内剩余不丢；切关按原规则重置；模型加载乱序、失败、缺文件和 WebGL 丢失都有可操作回落。
7. 稳定种子前后布局、障碍 ID、箱内容一致；新视觉随机不改变模拟。七关机关/出口可达性另做有限遍历测试。
8. 浏览器人工验收必须真实记录：新房间实体、探照灯响应、驾驶视点位移、三维遮挡、门洞可见、箱面瞄准、选物收臂和复用资源趋势。现有截图不代表新 Three 结果，不引用旧文件注释中的性能/像素误差作为本次验收。

优先风险顺序：箱面与模型尺寸不一致；摄像 pose 双实现；连续移动沿用离散扣费/伤害；伸臂移动造成跨房取货；自动门吸附绕障碍；同墙多个门只画一个；回放异步盖住驾驶画面；跨会话缓存和 GPU 泄漏。以上先于额外景深、光晕和大型模型细节。
