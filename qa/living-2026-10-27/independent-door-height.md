# 机修门高度/侧框独立复现（2026-10-27）

范围：tools/living-survey-door-height-check.mjs；独立headless Edge、API全拦截。合法diag.teleport只设置初始位置，其后正常site.move、moveVertical、turn，保留真实OBB/实体colliders；诊断将提示节流时间复位便于逐项观察。这不是键鼠盲玩、不是通过直接改位置跨门。生产代码未改。

结果：
- C1-R2门from49..57、bottom−3/top2.5；艇宽2.8、长5、高3。X50.3和中线X53，从Y1.3/Z7.5朝180°正常推进均停在Z9.15，提示艇顶碰门楣、PageDown下潜。深度对应1038.7m。直接传送到Y1.3/Z9.2不合法，因此作废最初非法传送测试；最新证据只含合法起点。
- 正常moveVertical(−1.3)到Y≈0后，中线X53可以继续推进到Z16.15，不再高度提示。独立X53/Y0/Z9.2初始也可直接到Z16.2。门可达。
- X50.3下潜后仍被侧框挡住，最新提示为“艇身擦住侧门框。先按N倒车；门洞中心在左前方，重新对准中间再进”。其距左边缘1.3m小于艇半宽1.4m，不能归因高度；朝南时东侧中心在左前方，方向正确。
- 从该侧框阻挡点用正常move(−2)倒车，turn(−90)转东，move(2.7)横移至X53，turn(90)回南，然后正常推进9m到Z16.15；全部通过，没有跨门teleport或关闭碰撞。
- 真正关闭的C5密码门surveyGateLift=0、bounds Z41.83..42.17，X128.5/Y0/Z37朝南正常推进停Z39.3，提示普通制动/倒车，不误报门楣/门槛；保持真实阻挡。

证据independent-door-height.json；before-side-hint版本记录旧普通侧框提示，已被最新结果覆盖。无pageerror，API拦截环境出现一条无URL的ERR_FAILED，不能逐条确认来源。query与check均提示living-deck-site.ts索引过期，需维护者同步后再检查；本测试不擅自重建索引。提示4秒节流的真实时序、PageUp门槛分支、181°及所有航向未由此脚本验收。
