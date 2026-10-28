# 第二章独立逻辑 QA · 2026-10-27

结论：局部诊断通过；完整物理通关、真实录像、AAA视觉与恐怖节奏均未通过本次验收。不得将此记录引用为全关PASS。

方法：阅读AGENTS及level-metrics，运行本地RAG query/check（当时5个源码stale，未通过）。Edge独立新上下文访问5180/?level=2，所有 **/api/** 一律abort；HMR禁用避免测试途中重开。浏览器脚本会读取源码并直接改变诊断状态，不是盲玩；未产生视频计费调用。未编辑生产文件。

## 实测结果

- `tools/living-survey-integration-check.mjs`：初态snapshot恢复；坏code存档拒绝且无部分写入；暗片拒绝；未issue底片拒绝；不存在任务媒体拒绝；远端密码拒绝；人员侧场景根缺席；工具箱回调重复调用库存0→2→2。全部通过。直接状态/arm callback注入，不等于物理拾取或保存刷新Continue。
- `tools/living-survey-media-negative-check.mjs`：已commit有效现场片，传入不存在mediaId且自称generated-video/playable，最新adapter拒绝。并行修复前静态发现的普通片绑定缺口已被当前实测关闭。
- `tools/living-survey-reach-check.mjs`：诊断teleport仍执行整艇clear。probe/tools/ballast/feed/lock/uplink找到合法姿态，瞄准距离分别2.515/2.381/2.315/2.612/2.227/2.800m。没有执行这些点之间的连续驾驶。初态传递口被未取得probe前置过滤，不将其判为不可达。
- 说明牌在(137.8,0,13.5)1×得到fill8.58%、字高16.37px，当前framing通过；(137.8,0,17)1×fill6.05%拒绝并提示约1.3×。这是投影计算，未证明实际输出字可读或满足MET-007建议24px。
- `npx tsx tools/living-survey-check.ts`与`living-survey-encounters-check.ts`通过；它们是纯状态机/模拟检查，非驾驶通关。

## 问题与限制

1. S06任务媒体最初只校验ID/cache前缀。报告开发者后，现源码加入code、tape evidence一致、playlist校验；正式S06真实视频仍未验证，不能把源码检查当出片合格。
2. 三处生物computeSeen只有灯范围、视锥、视线、illuminated，没有最小投影尺寸判据。细节可读性保持GAP，不应声称生物影像视觉验收通过。
3. aimed射线原先用扩张0.25m的拾取盒命中距离作3.4m阈值，可能比真实表面多出0.25m。已报告开发者；本报告未完成3.3/3.5m实机边界复现，按静态风险记录。
4. 本轮未覆盖完整刷新Continue、多节点正式存档、无视频GM切回正式、章一/三隔离连续切换、真实录像失败恢复、完整主线驾驶/资源预算、人员侧性能数值。人员侧根不存在只证明当前场景分组，不是FPS验收。
5. 工具箱库存幂等通过是重复armEvent回调诊断；没有证明真实键鼠取物失败路径或中途读档。

证据文件：independent-logic.json、wrong-media.json、independent-reach.json；实际调用和数据以这些文件为准。生产源码正在并行修改，结论仅覆盖本轮加载版本。

补充实测：tools/living-survey-arm-check.mjs通过入口probe真实计时臂状态链stowed→extending→aiming→gripping→aiming→hauling→stowed，收妥后camera=true且cargo包含probe，同一合法艇位nearTransfer=true。使用diagnostic teleport与直接interact()方法调用，未伪称键鼠盲玩。证据independent-arm.json。

## 保存/继续专项复核与修复

新开局真实自动保存→刷新→Continue恢复(7,30,7)。中途合法传送到probe，走真实计时机械臂收回，再等待正常15秒自动保存→刷新→Continue，恢复位置、cargo与随机code一致，证据independent-save.json及independent-mid-save.json。无媒体生成。

发现旧读取器只验adapterVersion，旧第二关路线可在标题被判为有效，直到site.restore才失败；此外早期读取错误弹窗后直接返回，以及启动过程中boot日志被移除，容易使错误不可见。修改living-save.ts强辨routeVersion2/非GM；旧路线读入给出明确中文理由。main.ts保留有原始指针的Continue入口以显示拒绝原因；重挂被setup移除的错误日志。session.ts早期读入错误向标题抛出。未迁移、覆盖或删除旧数据。

旧档负测通过：在标题状态修改隔离浏览器存档副本移除routeVersion，再刷新点击Continue，页面明确显示旧版不兼容及原记录保留，存储仍存在。注意在运行中篡改副本再reload会被正常beforeunload自动保存覆盖，已排除该测试误差。

## 完整GM物理门槛诊断

tools/living-survey-gm-flow-check.mjs已走完：真实计时机械臂取probe→近处传递→S02→三处实际5秒曝光与底片commit/GM分析（分两段）→说明牌摄影→真实aim/interact关S阀→主动报告→S05→真实aim查看门锁→S06当前码→近处输入开门→第三生物摄影→真实计时机械臂取配重→近处F观察窗交互→S07→出口阈值下潜，survey.complete=true。

所有任务视频用明确GM核验；沿途合法teleport跳路、直接调用正常交互和快门入口、直接设置相机与补满电量均为诊断捷径，不能证明连续驾驶、操作教学、资源预算、真人盲玩或真实影片。三处照片不是直接写photos；取物不是直接写cargo；阀/门没有直接改布尔。首次脚本第二次快门未等显影而超时，修正等待后全链通过，属测试错误。

GM关闭后complete=false、captureLivingSave返回null、gmLevelSession=true，当前诊断进度未转成正式存档。证据independent-gm-flow.json。
