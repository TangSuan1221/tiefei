/**
 * 会话入口。
 * ============================================================================
 * 这里曾经住着一整套「在船舱之间走动 + 右侧行动清单」的会话机。玩法改成
 * 逃生舱之后，那套机器整个退役了 —— 玩家不再在船里走，他被封在一个铁罐子里。
 *
 * 保留这个文件只是因为标题画面按这个路径做代码分割。真正的会话在
 * `pod/view/session.ts`。
 *
 * 退役的系统（world / narrative / encounter / 行动清单 HUD）仍然留在仓库里，
 * 但已经没有任何引用，打包时会被整体摇掉。逃生舱复用的是它们下面那层：
 * 生理模拟 sim/、声呐与后处理 render/、程序化音频 audio/。
 */

export async function startSession(resume: boolean): Promise<void> {
  const { startPodSession } = await import('@/pod/view/session');
  await startPodSession(resume);
}
