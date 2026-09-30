# 本项目关卡工作约束

设计、修改或评审任何关卡前，阅读 `docs/level-metrics.md`，并用本地知识库检索相关约束：

```powershell
node tools/level-rag.mjs query "本次关卡涉及的机制和尺寸"
node tools/level-rag.mjs check
```

- 默认主游戏 `/` 的 `PodRun → PodExpedition`；必须区分首关、后续关卡、独立探索和旧生成器参数。
- 保留每条规则的IMPLEMENTED、REQUIRED、NOT_IMPLEMENTED、GAP状态。未实现能力不可当作现成机制；设计标准不可冒称已全关验收。
- 若检索索引过期，先核查代码/用户决定与规范，再build；不得只重建索引掩盖语义差异。
- 用户最新指示优先。修改有关机制或规范时同步 `rag/manifest.json` 与索引，并验证查询。
- 当前剧情按 `docs/story-split-route-2026-09-30.md`：隔断桥真实救下艾里亚斯（旧名埃利亚斯），分路摄影互助，在第三层中段会合；首章无谎言或身份异常线索。`docs/chapter-one-rescue-revision.md` 已标记为历史方案。新稿不代表NPC配合或新动线已接入现有游戏。
- 编写、改写或审查任何剧情（包括文字原型、AI生成内容、Articy节点和对白）前，必须阅读 `docs/level-metrics.md` 的 MET-025 至 MET-029，并检索节奏、人物串联、选择回收、道具成本及实际可操作性。它们来自用户 2026-09-30 的五项否定反馈，优先于旧稿、旧审查通过结论与演示文本。现有剧情仍待按这些标准整改；记录规范不代表整改已完成。
- 这是一套本地检索资料；未实际写入外部服务时，不声称外部RAG已经同步。
- 摄影协作还必须遵守 MET-030：角色能安全走近看清的事，不得强迫玩家摄影代办；关键调查需要无线电线索、拍摄目标、延迟期间未证实信息、看片决策和结果回收。普通走路与喘息不硬凑谜题。现行稿默认在 `/narrative.html` 的剧情阅读页展示，也可独立访问 `/story.html`；旧状态机入口为 `/narrative.html?view=legacy`，不代表新稿已接入模拟。
- 每次剧情重写必须执行 MET-031 的完整约束审查并留下当次记录：逐条列依据、冲突、修改和未实现项，不只检查本次最显眼的反馈。会合、读记录、过场不得计作主要遭遇；恐怖感不能由构建通过或Agent自评分证明。本次第三章记录见 `docs/chapter-three-rewrite-audit.md`。
- 正文和制作说明必须遵守 MET-032 分离；五章现行稿是连续小说式叙事，其他选择见 `docs/story-alternate-scenes.md`，因果与技术资料见 `docs/story-branch-design-2026-09-30.md`，最新整轮审查见 `docs/story-prose-rewrite-audit.md`。勿把作者禁令塞回对白或正文。
- MET-033：补全场景间因果、行动和转场；莱娜须先介绍与寻找再接通，尼科录音不得写成现场真人发言；调查员需要恐惧、追问和撤退考虑。最新审查为 `docs/story-continuity-audit.md`。
- MET-034：五章需有连续事故调查，现场证据与历史记录核验推动下一步行动；不可只增追问和日志。最新审查见 `docs/story-investigation-audit.md`。
