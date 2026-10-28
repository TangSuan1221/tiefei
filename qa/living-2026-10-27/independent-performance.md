# 首关回归与第二关性能独立检查 · 2026-10-27

首关：本轮执行 `npx tsx tools/harbor-simple-flow-check.ts` 与 `HARBOR_TEST_URL=http://127.0.0.1:5180/ node tools/harbor-simple-browser-check.mjs`，两者通过。浏览器所有 **/api/** 请求abort。

纯FSM覆盖必经序列、问候、一次性冲击、真假/未知报告、hold/cancel、真实隔离事实、受伤逃离、信任幂等、存档原子性和后续肩伤承接。

浏览器覆盖新局Elias实时隐藏、无自动航点、伪造/本地任务媒体拒绝、文字不可越过物理证据、fresh/finished snapshot恢复、主动声纳通电但不脉冲仍发声、关闭电源停止发声、角色参考图HTTP200、健康/受伤出口路径。返回complete=true、injuryComplete=true、injuredTrust=-2且无pageerror。

后半流程使用synthetic protocol fixtures与直接状态机动作，只证明adapter协议回归没有发现首关新破坏，不是首关真实录像或完整物理驾驶通关。

第二关性能使用 `tools/living-survey-performance-check.mjs`。实际composer.renderer计数包括LivingRender多pass的draw calls/triangles，不能和只算单次主场景render的统计比较。每场景预热3秒、RAF样本6秒；CPU提交时间不等于GPU耗时。诊断合法传送到入口、机修、说明牌、中庭，采样时停船灯开主动声纳关。此为headless Edge独立进程，设备/驱动详见JSON，不能冒称用户可见窗口帧率或低配性能。

人员侧：shells的scatter与shell创建只遍历s.pod；hero的gateInner/cocoon是空Group，无人员侧actor loads；world不调用旧personnel构建；mood过滤L/M/N。运行时检查living-space:L/M/N均不存在。历史布局表/HERO_SPACE仍保留M及旧字段，保留数据不等于场景实例。

第一轮性能工具错误地import到非活跃renderer，出现calls=0/geometries=0。已弃用该轮GPU计数，改用live composer.renderer重跑；最终数据见independent-performance.json。

## 有效最终采样

实际GPU标识：ANGLE NVIDIA GeForce RTX 5080 / D3D11；Edge156 headless、Windows、DPR1、24逻辑线程、1600×900。没有回退软件GPU，但仍不能代表用户前台窗口/低配设备。

|场景|RAF p50 / p95 / p99 ms|LivingRender calls p50 / p95|triangles p50 / p95|CPU提交 p50 / p95 ms|
|---|---|---|---|---|
|入口|16.7 / 16.8 / 33.3|541 / 573|1,280,522 / 1,437,698|3.4 / 5.5|
|机修|16.7 / 16.8 / 33.4|544 / 570|1,179,988 / 1,338,284|3.4 / 5.6|
|说明牌|16.7 / 33.3 / 33.4|637 / 665|2,368,880 / 2,419,180|4.2 / 6.6|
|中庭|16.7 / 16.9 / 33.4|537 / 547|1,829,996 / 1,864,132|3.8 / 5.5|

RAF每场景332–354样本；LivingRender每场景387–413次，说明一显示帧可有额外渲染调用，因此calls表是每次完整LivingRender管线统计，不是总应用一帧统计。world共1328 Mesh；L/M/N场景根均不存在，也无personnel命名对象。几何/纹理GPU驻留计数从入口186/104升至中庭519/156，是遍历后资源上传变化，不能据此单独断定泄漏。

未发生pageerror；API主动阻断环境下记录一条net::ERR_FAILED；本工具未保存该条URL，不能逐条确认归因。说明牌场景p95达到33.3ms，未满足稳定每帧16.7ms；该高端GPU样本也不能用来宣称低配或全程性能已通过。没有本轮前后相同基线，因此不虚报性能提升百分比。


## 第三轮画面冻结后复测（2026-10-27）

复用原脚本、相同机位/朝向/采样时长；冻结前原始JSON保留为independent-performance-before-freeze.json，最新结果为independent-performance.json。G对应manual说明牌机位[137.8,0,13.5]朝90度。API全部拦截；合法诊断传送、停船灯开，非盲玩。同期另有盲玩浏览器可能争用GPU，帧时仅记录，不作严格FPS性能回归结论。

|场景|calls p50/p95|triangles p50/p95|RAF ms p50/p95/p99|
|---|---|---|---|
|入口|559 / 564|1,280,626 / 1,363,432|16.7 / 16.8 / 16.8|
|机修|585 / 587|1,190,176 / 1,306,236|16.7 / 16.8 / 16.9|
|G说明牌|265 / 283|591,146 / 592,522|16.7 / 16.8 / 16.8|
|中庭|540 / 550|1,857,974 / 1,892,110|16.7 / 16.8 / 16.8|

G相同观测点calls中位由637降265（约58.4%），triangles中位由2,368,880降591,146（约75.0%）；p95分别665→283、2,419,180→592,522。这是每次完整LivingRender管线工作量，不能解读为全应用每帧成本或FPS提升百分比，也不能证明剔除在所有角度无漏画。其他机位calls没有同幅下降；机修中位544→585，仍需按其场景资产与渲染路径分别看待。每点RAF361样本、LivingRender421样本。未修改运行代码；RAG check通过43条，所有来源与引用当前。
