# 深海 Three.js 摄像机

当前实现是程序网格与程序材质基础，**不是 Blender 成品**。没有远程资源加载、付费服务或自己的动画循环。

## 接入

从 `./deepsea` 导入 `drawDeepseaRoom`、`disposeDeepseaRenderer`。

原摄像机绘制点先调用 `drawDeepseaRoom(ctx, w, h, input)`；返回 `false` 时再调用原 `drawRoomCamera(ctx, w, h, input)`。两者使用同一个 `RoomCameraInput`，仅采用类型导入，不引入 `camera-room.ts` 的运行时循环依赖。

调用者仍负责 Canvas2D 的坐标平移、裁剪与游戏外框；此模块将离屏 WebGL 当帧同步拷贝到 `(0,0,w,h)`。机械臂状态机、碰撞、工位与输入不在本模块修改范围内。

会话销毁时调用 `disposeDeepseaRenderer()`。WebGL2 不可用、着色器编译失败或 context loss 时返回 false，随后保持软件降级，避免每帧创建新上下文。显式 dispose 后可重新尝试。

## 几何与光学

- `buildRoom` 的实体面逐顶点保留；`door` 面作为开口而非实体堵板。真实门洞仅向房间外延伸 0.42 米门套，不缩小原截面。
- 箱、梁、柱、管排等全部来自实际 `obstacles`；没有随机可交互物。真实 `marks` 才能产生封条铭牌。
- 游戏坐标 `(x,y,z)` 转为 Three `(x,-z,-y)`。这是反射变换，三角形绕向按目标法线修正。
- 光心与 `Eye.pos` 重合。姿态取 `basisOf`，焦距严格使用 `focalFor(min(w,h), 0.58/zoom)`。不会对监视画面做抖动、畸变或改变命中位置的后处理。
- SpotLight 位于镜头前 0.5 米、下方 0.34 米，阴影图 1024²。仅有 3 米内弱舱体漏光，无全局环境照明。
- 物理材质使用颜色、法线、粗糙度贴图；四组 256² 贴图只在初始化时生成。180 个缓慢漂移粒子中最多 3 个极弱自发光点，仅作非交互浮游生物。

## 资源预算

- 全模块单一 WebGLRenderer；场景仅缓存当前房间。
- 缓存键包含房间尺寸、位置、实际障碍 ID/类型/位置/尺寸、相邻节点位置与连接关系，保留数字精度。
- DPR ≤ 1.5，最长边 ≤ 1536，物理像素数约 ≤ 130 万。
- 纹理不会被每帧瞄准/翻找进度触发重建。房间切换释放旧几何、铭牌与粒子，关闭会话释放材质、纹理、阴影与 renderer。

## 后续 Blender / GLB

`setDeepseaAssetFactory` 是默认关闭的同步注入接口。调用者须先取得并解码真实存在的 GLB；本模块不会猜测 URL 或主动请求资源。

工厂只补充与当前 `RoomGeometry` 对齐的非交互表面细节，现有碰撞外壳始终保留。资产作者必须验证米制比例、坐标、门洞净空与实体边界；不能把任意整间 GLB 塞入房间，也不能引入假的箱子或门。工厂交付独占的根节点和释放回调，原始共享 GLB 资源应由调用方持有。

## 验证

- 类型：`npm run typecheck`。
- 回归：`node --import tsx --test tools/deepsea-renderer.test.ts`。
- 独立固定帧页面：`/tools/deepsea-browser-probe.html`（已有 Vite 服务），没有后台循环。可测试开关灯与显式释放。

已自动验证投影一致性、六向门洞、障碍顶点、法线绕向、缓存变化、铭牌缓存、资源释放和无 DOM 降级。浏览器工具连接不可用，因此本次未完成真实 GPU 截图、实际帧率、运行时 context loss 与视觉验收；不能据此宣称达到最终美术质量。
