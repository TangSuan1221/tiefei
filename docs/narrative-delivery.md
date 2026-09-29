# 五关叙事工作台交付说明

启动项目后打开 `/narrative.html`。主入口和三维白模继续保留，正式存档不被此工作台读取或改写。

## 可以直接使用的内容

- Articy:draft 风格章节流程图、节点分支展开、Condition/Instruction 检查器、全局状态和事件时间线。
- 五章15个摄影环节、50种行动、31种结果后二次决策、5种终局。正典、事故时间线和跨章守恒见 `docs/narrative-canon.md`。
- 5秒曝光、12秒处理的受控文字分镜试玩；状态机保存/恢复；开放JSON节点蓝图导出。
- 玩家、潜艇、关系、角色知识、世界事实分离的确定性分支执行。可注入但默认未联网的模型提议接口，只接受合法候选ID。
- 原生 Articy 工程导入、正式五关三维接入、升级摄影器、人物演出、60分钟真人盲测均不包含在已经通过的项目中。

## 已执行验证

|验证|结果|证据|
|---|---|---|
|独立模型审查|12项通过，202条有界/定向路线，50/50行动、5/5终局有见证|`qa/narrative/model-audit.json`|
|引擎边界|摄影计时、快照、知识、补救、存档与不可逆边界通过|`tools/narrative-engine-check.ts`|
|模型提议接口|公开上下文、超时/离线回退、非法回复、过期epoch拒绝通过|`tools/narrative-model-check.ts`|
|真实浏览器UI|完整15场到检疫结局，30卷记录，零页面错误；首两卷真实等待17.177/17.108秒，其余使用明确标记的模拟快进|`qa/narrative/browser-report.json`|
|导出与移动端|开放JSON下载、节点查看、移动端无横向页面溢出、结局和页脚可滚达|`qa/narrative/visual-report.json`|
|匿名对照|六组合法模型转录，四组持平，两种策略各胜一组，不宣布总体赢家|`docs/narrative-audit.md`|
|构建|TypeScript与Vite生产构建通过|`npm run build`|

作者预算为3600秒，摄影的510秒基础等待包含在整体操作设计中理解，不能重复加算。浏览器模拟钟、测试快进和预算都不能当60分钟实机游玩证据。下一生产门槛是将剧情节点映射至真实五关场景，再进行固定版本的首次玩家测试。

## 可复跑命令

```powershell
npx tsx tools/narrative-engine-check.ts
npx tsx tools/narrative-model-check.ts
npx tsx tools/narrative-audit.ts
node tools/narrative-browser-check.mjs
node tools/narrative-visual-check.mjs
node tools/level-rag.mjs check
npm run build
```

浏览器脚本默认本地5174端口；主流程脚本可通过 `NARRATIVE_URL` 指向实际启动端口。UI摄影证据是明确标识的作者分镜文本，不是生成视频或3D录像。
