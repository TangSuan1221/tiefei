# 深海首关持续迭代状态

更新时间：2026-09-18，本轮完成模型首批真实交付及摄像台离散驾驶；首关正式资产/玩法接入仍未完成，七关未完成，未通过 AAA 视觉验收。

## 本轮恢复结果

- 用户要求“上次有没完成的任务 继续”。已核对上一会话及实际文件：当时仅有建模脚本，没有 GLB/layout/blend；摄像驾驶代码也未交付。
- 原跨会话任务无法 resume，返回 parent mismatch。本轮另行完成了驾驶，并由父执行建模，不继续无结果轮询。
- Blender 工具目录报告 connected，但实际 get_addon_status 两次返回 `MCP descriptor not found for user-blender/get_addon_status`。因此本轮**不是通过 MCP 建模**，而是使用 `D:\blender\blender.exe --background --factory-startup --python-exit-code 1 --python tools/blender/build-l01.py` 的独立进程真实建模导出。没有修改用户打开的 Blender 场景。
- 修复 Blender 5.1.2 中已移除的 SeparateRGB 节点，改用 SeparateColor；导出强制 use_active_scene，避免原 Scene 默认 Cube 混入 GLB。源 blend 保留原 Scene 与新 DS_L01，GLB 只有 DS_L01。
- 没有启动新的循环或定时唤醒；本轮两个独立工作流均已完成。

## 已交付资产

- `public/assets/deepsea/l01-processing.glb`
- `public/assets/deepsea/l01-layout.json`
- `assets/blender/l01-processing.blend`
- `assets/blender/evidence/l01-build-report.json`
- 可复现脚本 `tools/blender/build-l01.py`
- 打包纹理源 `assets/blender/textures/l01/`

范围：18×8×22 米大厅、前方 3 米短廊、矿筛/分离机、两只独立铰链箱、带装备的硬壳深海作业服、管线、梁筋、门轨控制轮、少量底栖蟹与沉积。不是完整 A—F 首关路线，也不是七关。

坐标：Three Y-up，-Z 前，出生 (0,0,8)。真实模型总包围盒约 min(-9.30,-4.30,-14.15) / max(9.30,4.30,11.47)。35 个 Blender 导出对象、28 个网格、26,353 个多边形、8 个材质；GLTFLoader 加载后为 59 个对象（多材质拆分会增加对象数）。

箱体中心 supply(6,-2.3,3)、tools(-6,-2.3,-4)，独立 `crate_lid_supply`/`crate_lid_tools`，实际箱内物品子节点。PBR 基色、法线、粗糙度/金属度已打包，不依赖无法导出的程序节点。

修复了按错误面边顺序分配 UV 导致的墙面纹理拉伸；减少大面积斑驳与反射差异；增加锁扣凹槽、插销、把手、SUPPLY/TOOLS 编号和作业服胸前装备。静态对象按组批处理减少 draw calls。

## 可运行入口与明确边界

- 游戏：`http://127.0.0.1:5173/`
- Blender 模型独立预览：`http://127.0.0.1:5173/deepsea.html`
- Vite 开发服务本轮已重新启动；terminal716003 当前对应开发服务（并行启动返回的716003/716004编号曾与最终文件反置，以命令正文为准）。

预览：W/S 前后、A/D 横移、Q/E 升降、方向键/拖动转头、L 灯。读取同一 l01-layout.json，用扫掠包围盒防穿墙/设备，已移除大厅末端隐形限位，可进出真实短廊。`preview-collision.ts` 只服务预览，不冒充正式 PodRun 物理。预览不结算库存、不解锁七关。

**正式游戏仍显示同源程序房间，不自动用首关GLB覆盖随机房间。**下一步必须将固定布局、模型锚点、门、箱体及库存接入唯一模拟数据，不能直接显示GLB而保留不一致的随机碰撞。

## 摄像台驾驶交付

修改 `sim/run.ts`、`view/session.ts`、`view/stations.ts`，新增 `tools/camera-driving.test.ts`。

- 可见独立驾驶排：J/L 左右船头，I/K 上下船头，H 镜头回中，空格前进，N 倒退，B 离站。
- 船头与云台分开显示。原云台、R/F/C、箱内选择仍可用。
- 站内每按一次 0.75m，不按住连推；未分析也可移动，不改变 identified。航渡仍为旧抽象进度，一档60m，不是连续航道。
- 取消5.2m吸门、自动朝门修正、瞄门忽略障碍。使用线段扫障碍，中心到实际门面才切房；门锁/机关保留。
- 伸臂、回放、曝光、冲洗、充电、断电、失焦及面板输入期间禁止驾驶；模拟入口同样保护。
- 箱内选择后仅在收臂完成入库。跨房不重置已经生成/取走的箱内物资。
- 跨门仍是房间切换/出生点安置，尚非无缝连续航行。

父整合时另修 `view/roomview.ts`：同墙多扇门都切真实洞口，避免新驾驶能通过的第二扇门在画面里仍是一面墙；新增射线回归。

## 验证与截图

最新相关自动化回归 **61/61 通过**：25 旧机械臂/工作台 +18 新驾驶 +10 渲染/多门 +8 GLB与预览碰撞契约测试。

命令：
`npx tsx --test --test-concurrency=1 tools/manipulator.test.ts tools/arm-targeting.test.ts tools/arm-retrieval.test.ts tools/camera-workbench.test.ts tools/camera-driving.test.ts tools/deepsea-renderer.test.ts tools/deepsea-asset.test.ts`

`npm run build` 成功（含 tsc）。现存非阻断警告为大于500KB分块、rng动态与静态导入并存；不当成失败，也未做无关打包重构。

真实 Edge 浏览器：`node tools/deepsea-gameplay-check.mjs` 通过，errors=[]。真实按键完成航渡、未分析房间驾驶、伸臂禁推、F生成箱内列表、]选择物品、C收臂前库存不增加、归位后增加、倒退、回放禁推。取物部分采用隔离浏览器内确定性箱子夹具，不声称是GLB首关玩法接入。修复主入口 favicon 404 后重新实测通过。

证据：
- `qa/deepsea/camera-driving-live.png`：真实游戏初次到站。
- `qa/deepsea/camera-retrieval-selection.png`、`camera-retrieval-complete.png`：确定性夹具取物，真实 UI 和键盘。
- `qa/deepsea/l01-entry-final.png`、`l01-supply-final.png`、`l01-diver-final.png`：最终资产真实镜位，已实际 Read 查看。
- `qa/deepsea/l01-door.png`：首批资产的短廊镜位；不冒充最终材质版本截图。
- 早期 `l01-entry.png` / `l01-supply.png` / `l01-diver.png` 与 refined 图保留用于同镜位对照。

`tools/deepsea-capture.mjs` 新增可选 x y z yaw pitch 参数，等待模型probe就绪，要求12次绘制成功，否则非零退出。样本时间只是 CPU 提交耗时，不代表 GPU 帧时间或已验收帧率。

## 独立视觉结论与下一步

独立检查 f43e6696-7960-48db-b37a-2b3e83e15937 已实际查看首批四图及最终三图。结论：UV拉伸/强斑驳明显减轻；箱子锁扣/把手/编号更清楚，作业员新增装备可见。但水中散射与纵深、积木化人体、偏平材质仍不足；入口横杆亮纹仍抢眼。无外部参考图，**非盲评，仍未达到 AAA**。

下次优先：
1. 正式首关固定布局和实体GLB接入唯一模拟数据，再做同一模型下的实物选取、开盖、收回、库存一致性。保留已通过的旧取物和驾驶保护。
2. 完成首关门锁/开门动画/出口触发及本地观察记录；目前预览门是静态开启的。
3. 根据实景继续修作业服人体与关节、矿筛结构/高光、水体远近层次；每次变更用同镜位实际截图复查。
4. 首关闭环验收后再建第二关，不把七关主题文档算七关资产完成。

Windows 默认 shell sandbox 返回环境错误；实际命令通过 required_permissions all 执行。不要重复无变更测试/截图或恢复旧空转巡检。
