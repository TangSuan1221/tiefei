# 第三关材质预热诊断

本地 Three.js 0.186.0，`WebGLRenderer.js` compile(约1394行)使用 `scene.traverse`准备所有可渲染材质（含隐藏/视锥外对象），仅灯光用 traverseVisible；compileAsync同步调用compile，之后轮询program readiness。因此无需循环移动相机或改变区域可见性。

`abyssal-prewarm.ts`在world.ready后预编译全scene。临时1×1 HalfFloat渲染目标及shadow enabled匹配现行composer路径，compileAsync返回Promise前同步finally恢复renderer target/shadow/toneMapping，并销毁临时目标；不修改相机、位置、导航、world.focus、visible或灯光。dispose之前尚未开始则跳过；失败不影响游戏。

历史对照（自动hook加入之前，两个独立Edge进程）：1280×800第三关完整draw（包含renderer.getContext().finish，避免只计CPU提交）首次穹顶：未预热437.3ms，手动预热后111.0ms；编译295.5ms。其后8帧约1.5–3.6ms。相机/位置/heading/pitch/visible/renderer状态签名一致，0浏览器错误。原始数据prewarm.json。

自动hook加入后的复测由 tools/abyssal-prewarm-check.mjs 输出prewarm-auto.json。此为单位置8次同步绘制诊断，不能代表实际RAF帧率、全关持续性能或60fps验收。首帧残余仍明显，可能包含几何/纹理上传、shadow及后处理首次准备；本轮不扩展渲染行为以强行掩盖。
