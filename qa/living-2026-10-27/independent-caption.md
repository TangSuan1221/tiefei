# 第二关曝光字幕布局专项（2026-10-27）

PASS（所测机修补给提示）。脚本tools/living-survey-caption-check.mjs，API全拦截、独立headless Edge。合法诊断定位[56,0,27.5]朝180°、设置灯/镜头/电量，键鼠走到驾驶台并点击真实曝光按钮；真实5秒计时，截图时exposing剩3.9秒，完成后developing且10帧sensorFrames。没有跳过曝光/直接注入shot状态，没有真实生成影片，不是盲玩。

直接检查三张图：caption-rectangle-exposing.png、caption-circle-exposing.png、caption-cockpit-exposing.png。前两张为浏览器内实际导出生产drawStationScreen/drawObservationWindow绘制结果；第三张为真实驾驶舱屏幕截图。矩形图补给字幕文字顶Y555.3、背景底597.6，曝光状态基线662.4；圆窗经过偏移缩放后文字顶Y510.6、背景底545.3，状态基线619.2。字幕与摄影状态均有明显间隔。圆窗航向180°基线98.6、俯仰163.4，不被下方字幕遮挡；实际驾驶舱截图同样可辨且无重叠。

代码范围核对：h*.83字幕下沿位于LivingDeckSite.drawInteraction，仅第二关类；首关PodExpedition.drawInteraction为独立实现。共享stations的矩形.92/圆窗.86状态线未由本次字幕下沿修复改变。此为所涉方法的作用域审核，不声称整个工作区所有变更都只影响第二关。未修改运行代码。

边界：本次真实附近补给文字为单行；三行长反馈、所有分辨率及ready核验状态未逐一实机验收，后者与exposing共用同一状态坐标。无pageerror；两条无URL的ERR_FAILED处于API拦截环境，不能逐条确认归因。RAG check当前因living-survey-fixtures.ts和living-world.ts最新改动提示stale，未自行重建。
