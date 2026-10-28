# 第二关分析终端退出修复复测

所测退出与安全感知链通过，保留本地播放暂停语义缺口。工具tools/living-survey-lab-return-check.mjs有断言/失败非零退出；原始independent-lab-return.json。

诊断只准备合法位置、虚构本地播放夹具与lab放大/设备zoom/shot.viewing初态；Esc、Space及返回按钮使用真实浏览器键鼠，受伤由真实shade tick产生，API全部拦截。非盲玩、非真实影片核验。

- Esc：保持就座，at=camera、zoom=null、expanded=false、viewing=false，速度0。
- 推进：初态lab/zoom=lab/expanded=true/viewing=true，真实Space2.5秒自动回camera并关闭上述状态，X7→8.245，恢复实时驾驶后推进。
- 鼠标返回：真实命中屏幕点[1045,195]，返回camera并清zoom/expanded/viewing，速度0。截图lab-return-button-before.png实查：任务板未遮按钮，卷号、片名、待核验、Esc提示均可见。
- 受击退出：合法R4[103.7,.8,26.1]/91°，灯关，真实shade咬击hull1→.84，推至X102.20；退出lab/zoom/expanded/viewing并显示“船体受击，读片已中断……”。lab-return-after-bite.png实查中央实时视野恢复。保留伤害，不是无敌。
- 深度：入口run.depth=siteDepth=1040；受击位置两者均1039.2，原240m偏差消除。

注意：退出后右侧仍显示“暂停播放”；这些分支没有设置localPlaybackStates.paused，说明关闭放大/shot.viewing不等于暂停本地感光序列。若产品要求暂停播放本身，此项尚未实现；若“暂停”指停船，Esc与返回的停船已实证。已向主代理报告。

GM重复核验提示与本地片名实际目标：已读最新代码确认目标名/“已登记”/数字2含义及nameLocalTapes存在；本脚本未注入GM证据，也不将该部分称为实机通关验证。

首关隔离：相关session/cabin/present/depth/expanded标签均有authoredSite.index===1条件，受击逻辑在第二关类。已有harbor-simple-flow-check和harbor-simple-browser-check均通过，后者含新局适配、媒体伪造拒绝、保存恢复、健康/伤后合成协议分支；全部API拦截，非首关连续实玩。未穷举首关所有UI操作。RAG check因本轮多个源文件变更stale，待统一同步；本QA未改生产代码。

## 真正暂停补丁复测（覆盖上文暂停缺口）

最新实机通过：Esc退出后的本地播放按钮为“继续播放”；推进/鼠标返回/受击退出后同样保持此暂停状态，既有回camera/清zoom/真实扣伤/深度一致断言继续通过。真实鼠标点击本地“继续播放”后变“暂停播放”，可恢复。

另外用本地ffmpeg生成的3秒testsrc测试图MP4（qa-synthetic-playback.mp4）安装到生产remote playlist路径，无外网、无生成API、非剧情影片。真实Esc后HTMLVideoElement.paused=true且currentTime=.7989；真实鼠标点击恢复后paused=false、currentTime=1.3049，标签“继续播放”→“暂停播放”。帧数3、时长3秒，验证的是远端播放器播放机制，不是正式影片验收。首关纯状态机再次通过；新的视频按钮启用条件仍限定第二关。

测试可靠性更正：首次用无query动态import('/src/.../stations.ts')读取状态，与Vite运行时带?t的模块产生两份WeakMap；remote playlist也曾装入另一份模块。由此导致“实际画面继续播放、诊断标签却暂停播放”及孤立视频始终paused的假失败。该两次记录分别保留independent-lab-pause-before-fix.json、independent-lab-pause-duplicate-module-invalid.json，明确作废为生产缺陷证据。已改为从performance资源列表取实际运行模块完整URL导入，最终independent-lab-return.json为有效PASS，脚本exit0。并非首次标签问题证明产品仍失败，不冒称通用播放器/全部媒体格式通过。浏览器已关闭，未改生产代码。
