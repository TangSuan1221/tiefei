# 第二关快速受损独立诊断 · 2026-10-27

这是诊断初始化复现，不是盲玩或正式通关。未改生产代码、伤害、生物参数；未使用盲测浏览器5197。独立Edge、5180/?level=2，拦截/api/**与HMR。读取metrics并执行query/check；两者因run/authored-site/living-deck-site/living-world索引过期失败，未自行重建掩盖语义检查。

## 确定发现

1. 新开局 `src/pod/view/session.ts:71` 无条件设置 `run.activeSonarEnabled=true`，第二关仅禁止自动脉冲。`LivingDeckSite.activeNoise` 使用 `powered && activeSonarEnabled`，因此玩家未开声纳也会持续发声。被动频谱界面不代表主动声纳断电。
2. 合法诊断艇位(52.3,0,21.9)、航向180°、满船体1、灯开；真实J6秒、L1秒、空格8秒、Shift制动、J1.1秒、等待18秒。Hull setter只记录不改变值。三次伤害分别在模拟时钟5.1663、18.4831、33.1164秒，各减0.18，最终0.46。首次为原地转向，后两次约(60.10,0,23.79)、(60.60,0,23.76)。
3. 三次调用栈均 `LivingDeckSite.hurt <- LivingDeckSite.tick <- PodRun.frame <- session.frame`；lastCreature.damage=.18，事件“撞击！有东西从黑暗里狠狠撞上艇壳。”；blind.r2进入recoil。旧threat始终null、spill/lure始终0。该复现没有旧run叠加伤害、连续碰撞每帧扣血。
4. move/turn结构碰撞不直接扣hull；bump仅产生声音和震动且有1.5秒节流。不能把本次快速伤害归因船体碰墙。
5. 首次hunter将警告送入dialogue.enqueue，但新版tick使用固定空beat，不再消费dialogue队列；feedback遇dialogue.busy提前return，后续伤害字幕和避险建议被吞。父任务独立发现，已对源码复核。huntAdvice虽存在但无调用点。
6. `PodRun.toggleActiveSonar`旧文字声称“停止脉冲保持静默”，与通电持续噪声实现和用户要求相反。

## 证据边界

已查看盲测三图blind-v2-c8aim/c8move/escape：受损/重损报警位于右侧裁切，任务板遮挡数值，中间只有片盒提示，没有来袭原因。盲测的历史hull不可从截图恢复；诊断满船体没有复现同秒死亡，不能声称精确复原全部前置损伤。可以确定原地伤害来源及错误默认声纳状态，不能据此排除所有历史存档携带旧threat的可能。旧tickThreat对已有threat未用managesThreats早退，是另一个潜在隔离缺口，本次没有触发，不列为此次根因。

原始完整日志：damage-audit.json。补充输入采样：damage-audit-input.json（运行后落盘）。诊断脚本damage-audit.mjs。

补充复现实测：damage-audit-input.json三次受击输入均pulse=false、activePowered=true、noiseBursts=[]；首次speed=0，后两次speed=0.1017/0.0067，低于0.45洗流阈值。由此直接确定是默认通电声纳持续锁定，不是玩家旋转或剩余推进噪声。第二次复现各减18%，最终46%。截图damage-audit-hud.png保存本轮HUD。

## 修后独立回归

修前日志和截图保留。父任务修复新局默认主动声纳断电、字幕队列阻塞和HUD后，独立Edge新开局重跑；仍为合法诊断初始化R2和真实J/Shift输入，主动声纳使用公开toggleActiveSonar方法切换，非盲玩，API继续拦截。

- 新局active=false、hull=1。原地J6秒、静止18秒后clock24.5667，hull仍1；无危险反馈。
- 显式通电后约5.52秒发生真正18%伤害，clock30.0833、hull=.82。caption和feedback均为“撞击！有东西从黑暗里狠狠撞上艇壳。”，没有吞字幕。
- 断电、Shift制动，继续静止21秒后clock52.5834，hull保持.82；反馈“那个声源慢慢游远了。”。
- 已目视检查damage-fixed-hit.png：任务板82%/电量99%、主动声纳通电·持续发声、修补停车Esc→1均可读，底部撞击字幕可见。damage-fixed-recovered.png保持82%，主动发声行消失。没有保存首次hunt阶段截图，不能仅凭此三张图评价持续huntAdvice的完整可见性。
- 原始数据damage-audit-fixed.json；脚本damage-audit-fixed.mjs；图片damage-fixed-quiet/hit/recovered.png。

结论限定：修后默认静止/转向安全；显式主动噪声仍会受到真实生物攻击；断电制动能停止此次持续追击。未改伤害、未作弊通关，未重新完成首次玩家整章盲测。
