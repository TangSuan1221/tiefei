# 第二关重构交接待办

日期：2026-10-27。工作目录：`C:\Users\Lenovo\Desktop\tiefei`。

## 当前状态

**主流程已实装，尚未完成整关验收。** 新动线、摄像仪收取/传递、三处生物摄影、供水协助、动态密码门、会合/下潜及新版存档均已接入。不要依据旧“待迁移”记录重新制作。

先读 `AGENTS.md`、`docs/level-metrics.md`，执行：

```powershell
node tools/level-rag.mjs query "第二关 LivingSurvey 连续通关 资源预算 真实影片 视觉验收"
node tools/level-rag.mjs check
```

## 待办（按优先级）

1. **新玩家盲玩复验。** 2026-10-27已知路线连续实键诊断已从新局进入第三关（qa/living-survey/continuous/REPORT.md，GM无视频、读取生物坐标瞄准，非盲玩）；并修复M通话后按2误开主动声纳。仍需无上下文玩家从入口完成全章，重点观察：到任务坐标后仍超距的微调、shade先关灯接近再开灯拍、离开R2起步惊醒盲猎。不要将诊断媒体算成正式通关。
2. **真实影片全链。** 验证任务生成、播放、分析、现场证据与本局密码绑定，以及失败重试、读档不换码；占位片/旧片/文字不得授予物理事实。真实生成无法执行时明确保留GAP。
3. **整关资源与跨关存档。** 覆盖正常及低电量/受伤继承、摄影与生成等待、绕路和重试消耗；验证第一关→第二关→第三关及中途读档。18%初始电量到R2取电池已局部通过，不代表低电量全关通过。耗尽电量检查点保护已通过自动保存/刷新/继续菜单诊断，仍需自然游玩复验。
4. **视觉与性能。** 重点解决中庭近罐到远岸层次断裂、维修深处不可辨、入口墙面重复及遗体/台架接触、录像高光压细节。先诊断水体衰减、灯照与材质，保留固定机位及实际接近视角对照并测性能。Round16第三灯、Round17围廊小样均被否决，未集成，不重复当成果。
5. **收尾验证与记录。** 跑相关类型/构建、流程/存档、通行/交互及装饰碰撞检查；更新全部MET复核与剩余缺口。改规范需同步manifest和本地索引并验证查询。

## 关键入口

- 最新制作记录（必须读到末尾）：`docs/level-02-survey-production-2026-10-27.md`
- 路线 / 场景迭代：`docs/level-02-route-2026-10-27.md`、`docs/level-02-world-iteration-2026-10-27.md`
- 事实机 / 场景：`src/pod/sim/living-survey.ts`、`src/pod/view/deepsea/living-deck-site.ts`
- 坐标：`src/pod/content/living-deck-layout.ts`
- 影片：`src/pod/content/living-task-videos.ts`、`src/pod/view/deepsea/living-task-player.ts`
- 存档：`src/pod/sim/living-save.ts`；证据：`qa/living-survey/`

## 不可回退的约束

- 保留工作区大量未提交成果，不整体回退或清理。
- 第二章调查不接回第一章；人员侧仅任务影片；不提前揭露身份/头盔；Panacea无攻击性，污染菌独立处理。
- 被动声纳只给方位，主动通电持续噪声；不缩艇、不扩大交互距离绕过问题。
- 装饰只进`decorColliders`，不得阻挡移动、转向、声纳、摄影。
- 分清IMPLEMENTED / REQUIRED / NOT_IMPLEMENTED / GAP。交付需提供连续游玩、真实媒体、资源、存档及视觉验证证据；构建和局部诊断不能证明整关完成。
