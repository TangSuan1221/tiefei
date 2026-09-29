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
