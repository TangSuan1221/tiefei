# 第三关分批GPU资源预热

本地Three.js 0.186；2026-10-24。已保留材质compileAsync，之后分批准备实际共享纹理与几何。无网络生成，无压缩/重采样纹理，无改相机/导航/物理。

依据本地源码：WebGLRenderer.initTexture公开支持预上传；WebGLGeometries.update遍历全部geometry.attributes。独立1×1离屏Mesh绑定借用geometry，临时drawRange仅3个顶点，逐任务finally恢复原start/count，groups不改。极简RawShader仅准备buffer；不加入原scene，不绘制至屏幕。临时mesh初始geometry、material、target销毁，借用geometry/纹理不dispose。

每批目标4ms，单次驱动调用不可切割；每批后fenceSync/flush，clientWaitSync timeout=0跨RAF轮询，生产路径没有gl.finish或同步等待。每批同步恢复target/viewport/scissor/autoClear/shadow；关卡销毁回调终止后续批次。

拒绝的试验：直接分批全量上传和跳过ImageBitmap版本虽然把首pit降低到约23–37ms，但单批分别609/596ms，不启用。尖峰从某位图迁移到首geometry draw，不能认定是单一纹理导致。JSON保留在upload-prewarm-rejected-*.json。

通过的独立浏览器A/B（upload-prewarm.json）：
- 原compile-only首次1280×800 pit：291.9ms。
- 加RawShader+GPU fence非阻塞分批后：18.7ms，后续7次2.1–3.6ms。
- 943几何+253纹理，共1196任务，14批，总1339.5ms，最大单批15.2ms。
- 前后相机/位置/heading/pitch/全部geometry drawRange/groups/visibility/renderer状态签名一致。
- 预热组出现一条未定位ERR_SSL_PROTOCOL_ERROR资源console，无pageerror；不能宣称全局无资源错误。

实际自动hook复测输出upload-prewarm-auto.json（upload=false指无额外手动预热，材料ready已包含自动分批）。这是本机单位置诊断，不是全关60fps保证；无论RAF采样如何，完整绘制仍须分别衡量。无法保证其他硬件每个不可切割上传都低于16.7ms。

自动hook测试在await materialsReady之后才采集signature；它只能验证诊断区间状态，并用于实际首pit耗时，不能独立证明预热过程恢复。恢复证据来自前述manual A/B跨prewarmAbyssalUploads调用的signature。

实际自动hook复测：首pit完整draw14.2ms，后续1.8–2.4ms，0浏览器错误（仅此测试运行）。原始数据upload-prewarm-auto.json。
