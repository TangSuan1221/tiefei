# 第二关后半段独立逻辑审查 · 2026-10-27

入口：`http://127.0.0.1:5180/?level=2`，实际 `LivingDeckSite / LivingSurvey`。已读项目 AGENTS 与全局 metrics，执行针对第二关供水、阀门、动态密码、录像的本地 query；check 返回 `PASS: 43 metrics, all sources and references current.`

本次是独立代码审查与隔离浏览器合成诊断，**不是盲玩、连续驾驶通关或真实生成影片验收**。未接触其他玩家浏览器，未修改生产代码，所有 `/api/**` 请求被浏览器路由拦截。前置剧情、证据与故障片条目由脚本注入；未用合成媒体声称正式片通过。工具：`tools/living-survey-late-audit.mjs`；原始结果：`late-route-diagnostic.json`。浏览器错误列表为空。

**修复后复测：下述P1与P2已由主代理修复，并通过本代理独立诊断复测。** 修前证据不覆盖；修后证据为 `late-route-diagnostic-fixed.json`。本代理没有修改生产代码。

## 新发现

### P1：媒体未就绪时核验会封死本卷后续核验

复现：令流程位于待核验 L2-S06，片盒已有该任务的 video 条目及当前 code，但远端 playlist 尚未安装（本测试合成这一失败状态）。在分析台执行正式 `PodRun.analyzeTape()`。

实际结果：严格站点门禁正确拒绝，`codeSeen=false`、`pending=L2-S06`；然而外层仍写入 `tape.analyzed=true`。再次核验时站点验证函数调用次数为 0，停在外层“这一卷已经拆过”分支。因此媒体恢复并不自动给这卷重新核验机会。正常恢复片盒后网络下载未完/下载失败，是该风险对应的现实触发条件；本次未伪称进行了真实下载恢复。

依据：审查时 `src/pod/sim/run.ts` 3207 附近的 analyzed 早退，以及 3231–3237 的无条件扣费/报告封存；`src/pod/view/deepsea/living-deck-site.ts` 697 的严格 playlist 检查；`living-task-player.ts` 22–25 的异步恢复下载。MET-011/017/021/022 要求失败可恢复且不能丢必需事实。

建议限定第二关处理：失败核验保留重试，不扣分析费用；旧已分析但未授予事实的任务片可在严格媒体验证后重试。不要通过接受缺 playlist、空媒体或错误 code 绕过门禁。

### P2：任务片成功事实与证据状态显示接口不一致

合成设置 S06 已接受后，`codeSeen=true`，但 `site.evidenceStatus({livingTask:'L2-S06',...})` 返回 `accepted:false`。该接口只识别 `capture.survey`，没有识别 `livingTask`，因而会向调用它的影片 UI 报告未通过。此项复现为接口诊断，未声称真实生成片或屏幕截图验收。

依据：`living-deck-site.ts` 682 附近。应按当前局 accepted 任务与其对应快照判断，仍保持 code 和真实影片门禁。

## 后半段专项结果

| 环节 | 本次结果与边界 |
|---|---|
| 第二只证据→求助 | 既有事实序列会排入 S03；任意明确回复后交代供水点及原因。前置由合成事实建立。 |
| 先读说明再阀门 | 未读说明时正确阀门拒绝并明确提示开灯摄影；错误 C 阀自复位且不置 valve。照灯/真实摄影可达性沿用既有专项，本次未重复冒充测量。 |
| 操作后主动报告 | 关闭后推进61秒只排入 S04，reported/clearSeen 均 false；主动报告后排入 S05，不能仅凭关阀视为人员侧结果已确认。 |
| 锁门→主动求助 | 未查门前求密码不置 askedCode；查门后求助才排入 S06。 |
| 未知密码 | 求助文字不含隐藏 code；即使诊断知道正确值，在 codeSeen=false 时 enterCode 仍拒绝。未发现核验前普通文本泄漏。 |
| 已知密码与重复查询 | 已核验后 `livingTaskLine` 附确切四位数，重复询问可重述。每局构造随机1000–9999，快照保存同一 code；S06 cache key含码的prompt哈希，核验检查本局code。 |
| 第三目标→会合→离层 | 源码要求第三目标仅 unlocked 后可发证据；三份调查+解锁+会合现场才排 S07；接受S07且持配重才 complete。既有GM全流程覆盖机制，本次不重复以传送证明驾驶。 |

## 真实看片得知密码仍为 GAP

`livingTaskPrompt(S06)`要求口播当前逐位数字，禁止生成字幕；确切数字在任务核验后的游戏报告/对话里显示。当前没有受控数字字幕叠加到视频帧，也没有校验模型是否实际念对四位数。本次禁止生成API，所以无法认定真实成片可听清、读对或满足 MET-007/011。

正式核验要求真实片条目、对应快照、playlist 和当前 code；但可播放资格不等于播放完成，`analyzeTape`没有 watched/播放时长门槛。若“必须亲自看片才可知道密码”是严格产品要求，现实现允许收到真实可播放片后直接核验报告取码，仍属于体验缺口。不要用新增任意观看倒计时替代真实影片可读性验收。

既有 `living-survey-gm-flow-check.mjs` 从 `survey.code` 直接读取密码输入，是明确GM诊断；它证明流程接线，不证明玩家能从影片获得密码。后续验收必须从播放器/受控字幕实际读码，禁止测试脚本读取隐藏值代答。

## 主代理修复后的独立回归

复测仍为合成故障与合成媒体测试：使用既有本地 `qa-synthetic-playback.mp4`，导入浏览器实际运行的 `footage.ts` 模块并安装解码playlist，所得3帧不是真实剧情录像，未证明NPC口播或画面内容。

- 缺playlist首次核验：`analyzed=false`，电量1→1，无密码事实；报告明确等待下载后重试且未扣电。
- 缺playlist再次核验：继续可重试，未进入站点证据验证，无事实被授予。
- 手动模拟旧错误封存 `analyzed=true` 后，安装同runtime playlist；错误code、错误任务ID均被拒绝，`codeSeen=false`。
- 恢复正确任务ID及当前码，走实际 `run.analyzeTape()` 成功，`codeSeen=true`、`evidenceStatus.accepted=true`；本次成功只扣0.045。
- 再核验已成功片，电量不变，不重复推进。
- 错code与错ID的两次合成尝试各扣0.045，属于既有已播放但不合格证据的分析收费行为，不是媒体下载未就绪分支。本报告不将其记作正式玩家正常路线已经触发。
- 无pageerror；修后出现1条 `console: Failed to load resource: net::ERR_FAILED`，诊断环境拦截网络请求，未将此记成真实API成功或影片成功。

修后没有再发现本专项覆盖范围内的确定通关阻塞。真实影片读码与连续后半段驾驶仍未验收。

## 已有验证与本次增量

已阅读 `living-survey-check.ts`、`living-survey-gm-flow-check.mjs`、`living-survey-media-negative-check.mjs`、caption 与 interaction-ui 专项及共享浏览器库。本次补的是**拒绝核验后重试可恢复性**和**任务片 evidenceStatus一致性**，不重复旧GM全流程。整体商业画面、恐怖节奏、资源预算与连续盲玩未由本报告验收。
