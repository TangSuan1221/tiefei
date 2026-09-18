// One-shot wake for the explicitly requested deep-sea iteration loop.
// No filesystem watcher, file writes, or child processes; the shell owns this PID.
const seconds = Number(process.argv[2] ?? 180);
if (!Number.isFinite(seconds) || seconds < 30 || seconds > 3600) throw new Error('Delay must be 30..3600 seconds');
console.log(`DEEPSEA_LOOP_ARMED pid=${process.pid} delay=${seconds}s`);
setTimeout(() => {
  const payload = {
    prompt: '执行低开销深海制作巡检，用户要求定期检查避免无效token消耗。先读docs/deepsea-iteration-state.md，只核对三个既有任务最新结果/末尾记录、关键交付文件和最近开发服务日志；不要全库扫描、重复派发、用resume轮询运行状态或无变更重跑测试截图。对比上次基线，记录有无实际进展。连续两次5分钟巡检无进展则标记疑似阻塞并一次性告知用户，只做有依据的针对性诊断；仍无新证据时退避到15分钟，不重复空转。不得擅自中断仍运行的任务或争用Blender。收到新交付才执行对应验收，真实截图须独立视觉检查，不宣称AAA通过。更新巡检基线；仅安排一个下一次单次唤醒，通常300秒，空闲退避900秒。完成通知为主要信号，重复完成通知忽略。用户要求停止则停止且不重排。',
  };
  console.log(`AGENT_LOOP_WAKE_DEEPSEA_L01 ${JSON.stringify(payload)}`);
}, seconds * 1000);
