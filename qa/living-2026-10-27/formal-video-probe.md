# 第二关 S01 正式录像验证

一次真实提交成功，已下载 13,287,268 字节视频并送入游戏任务录像列表。网络记录见 formal-video-network.json；持久缓存及返回状态见 formal-video-probe.json。

旧样本视觉不合格：root 对 formal-S01-contact.png 的抽帧检查发现面部露出。收到文件不等同身份遮蔽或台词正确。音频未验。游戏播放器真实点击验证尚未完成；仅收到并解码不能代替播放验收。

全过程停留入口，仅正常 W/E 就坐；未分析接受 S01，未生成 S02、玩家片或第三关视频。生产代码未修改。

缓存回放升级执行被自动审批系统拒绝：usage limit 导致 automatic approval review could not be completed；这是审批服务失败而非不安全判定。命令未执行，未绕过。修后单次生成脚本已准备 formal-S01-sealed-probe.mjs，使用独立 formal-sealed-profile 和新输出名，未执行。

RAG query/check 初始返回 living-world.ts / living-survey-fixtures.ts stale（并行修改），未擅自重建索引。

## 参考输入修正与新的审批结果

root通过ffprobe确认原片H264 1344×768约10.125秒、AAC约10.144秒。formal-S01-contact.png中段露出眼鼻嘴，违反第二关不透明面罩要求；拼图最后黑格为空槽，不代表原片黑帧。

原设计参考整张包含裸脸肖像。第二关LivingTaskPlayer新增livingSealedReference，只从固定素材第一列取密封全身像，组合为1280×720参考画布，裸脸面板不再上传。原素材和第一关使用方式保持。tools/living-sealed-reference-check.mjs已在禁API浏览器运行，实际输出sealed-task-reference.png经目检仅含密封人物。提示词明确不透明面罩全段不露脸，发声为无线电而非露脸唇同步；输入字节/提示hash变化不会复用旧生成缓存。类型检查通过，但未证明生成模型必然遵从。

恢复目标后的单次修后复验再次正常申请升级执行，自动审批明确拒绝：需要用户授权向llm-proxy.forgeax.com传输角色素材及提示词、并接受可能计费。本次与此前审批服务usage-limit故障不同；脚本未执行。已向用户提出具体单次授权问题，等待答复；禁止绕过或改其他入口间接提交。其余本地制作和盲玩继续。

用户随后明确答复“暂不调用外部生成”。修后生成脚本保持未执行，不再请求本章或其他章节的外部生成；继续本地既有媒体、建模和隔离盲玩。正式影片质量因此保持GAP，不能用本地合成片替代验收。
