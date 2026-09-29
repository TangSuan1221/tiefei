# 项目本地 RAG：关卡 Metrics

这是文件内的本地知识检索层：以中文双字词及英文词的 BM25 检索规则分块，为设计/实现提供带来源的上下文。不调用外部模型、不上传数据、不代表已同步任何外部向量数据库。后续回答由使用检索结果的助手生成。

权威文档：`docs/level-metrics.md`。入口：`tools/level-rag.mjs`。白名单：`rag/manifest.json`。检索索引：`rag/level-metrics.index.json`。

## 使用

```powershell
node tools/level-rag.mjs query "主游戏交互距离 3.4米 机械臂"
node tools/level-rag.mjs query "机械臂操作可以同时录像吗" --top 3
node tools/level-rag.mjs query "通道净宽 门洞 掉头" --json
node tools/level-rag.mjs query "MET-013" --top 1
node tools/level-rag.mjs check
```

查询返回完整规则、IMPLEMENTED/REQUIRED/GAP状态、原文行号及源文件引用。必须同时阅读适用范围，不把首关专用参数套到后续模式。需要完整验收时阅读整份规范，不能仅凭一次top-k检索视为覆盖全部规则。

## 更新

1. 核查当前实际入口、代码行为与用户新决定。
2. 修改权威规范；事实、设计标准、待实现能力分开。
3. 必要时更新manifest版本与明确的证据文件白名单。
4. 运行 `node tools/level-rag.mjs build`，再运行 `node tools/level-rag.mjs check`。
5. 用相关自然语言问题查询，确认返回新内容。

索引记录规范与证据文件的SHA-256。文件变化后查询拒绝使用过期索引；重新build只更新检索数据，不能代替人工核验新代码的语义。工具不会自动爬取环境变量、密钥、素材或其他个人资料。

## 每次关卡设计的最低检索集

- 入口/尺度：MET-001、002、003、004。
- 摄影/交互：MET-005至014。
- 门与威胁：MET-015、016。
- 资源/动线/新设备：MET-017至019。
- 分支/保存/验收：MET-020至023。

当前旧关卡和旧叙事提案不因入库自动获得“已合规”状态。本轮未更改运行机制或关卡地图。
