# R4分析终端/选片/持续伤害专项（2026-10-27）

## 已核实原因

1. archiveTape与receiveRemoteTape均自动将tapeCursor置最新片，未发现归档忘选新片。真实5秒曝光（目标无效的现场底片，仅测试归档）新增tape.2后selected=tape.2；lab录像页放大时实际键盘2会执行lab.next，循环回旧qa.old.analyzed。GM诊断分析明确读取selectedTape，已分析旧片的survey.analyze可幂等返回true，所以反复显示核验完成而无新目标进度是成立路径。但没有玩家当时tapeCursor/底片evidence，不认定这就是其第二次底片未推进的唯一原因。应显示被核验片ID/目标与失败原因，不默默认为“已分析”必然代表本次目标。

2. 真实按键验证：labVideoExpanded=true/at=lab时，PageDown1秒将Y0降至−.225，随后Space2.5秒使X7到8.245，终端仍保持展开；不是按键卡住。applyHeld明确支持lab驾驶。run.lamp不会因切lab自行关闭；shade攻击要求灯未照到（关灯、供电不足、光锥外或LOS被挡），不能仅据回放画面亮就判断当前探照灯有效。录像页3是分析，非灯开关；2是下一卷，非切回驾驶台。

3. shade.r4在survey模式近艇、未被照亮时每8秒伤害.16并推艇1.5m。LivingDeckSite.tick始终推进creatures；无labVideoExpanded、任务视频busy、网络等待保护分支。LivingTaskPlayer.busy只禁止重复提交，不暂停威胁。正式媒体等待期间仍可驾驶撤退，但若玩家盯着终端，录影片内容掩盖现场；实验不证明完全无警告：代码有hull.crack、摇晃、storyCaption、低血告警，提供截图也显示“船体受损”。问题是警告不直接说明当前外部攻击/回现场处置，不能称玩家无任何提示。

4. 深度不一致已浏览器证实：入口实际Y0时siteDepth=1040，run.depth=1280；Y−.49时分别1040.49/1280.49。run.depth沿旧leg.depth插值再减site.elevation，结算直接读它；“1279m”不是玩家突然下潜240m。第二关应从唯一authoritative datum/elevation提供HUD和结算深度。

## 最小修复建议（不改生产）

- 曝光归档无需补自动选片。让GM诊断/正式核验明确显示当前片目标及是否已有该事实；下一卷与返回驾驶台明确分开。
- lab展开时一旦按驾驶键，主动缩回/返回实时驾驶视图，避免暗中驾驶；保留原输入控制能力。攻击或媒体等待危险提示应在终端可见，指出“外部攻击，回实时画面/保持照明/撤退”，不能以回放亮度代替现场照明。
- 是否给予正式网络生成等待保护是产品规则选择，现代码没有。若补，应限定明确等待状态并公开表现，不默默改变全部怪物规则或称当前已受保护。
- 统一第二关深度datum，修正结算及所有共用run.depth读数。

## 证据与限制

independent-lab-danger.json、tools/living-survey-lab-danger-check.mjs记录上述真实归档/键鼠/深度行为。脚本R4 X104合法teleport被拒，因此实际选择与键鼠在入口合法位置完成；其darkStart也失败，hull保持1，不是R4伤害通过证据。近怪物伤害独立另测，不能把该失败定位混入通过结论。所有API拦截，诊断旧片夹具/初态，非盲玩、非真实生成视频。未改运行文件。RAG query目前site/world修改stale。

独立R4伤害复测成功定位：diag.teleport(103.7,.8,26.1,91)合法，lab展开、lamp=false、hull1，在真实17秒内受一次.16伤至.84，反馈明确“门口的东西一口咬住艇壳，把你甩了出去”；实际推出至X102.20后离开咬击范围，所以没有连续伤至死亡。independent-lab-bite.json记录此结果。证明展开终端/任务影片失败等待不保护该伤害；不能据此声称复现玩家原X106位置的多次致死，连续伤害还需近距滞留（推进靠近、推开受阻等）条件。该测试没有改怪物、关闭碰撞或直接扣血。
