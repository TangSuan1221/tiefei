# 第三关固定录像首帧

2026-10-24 使用内置 imagegen 生成的本地 PNG。依据 `docs/level-03-reference-image-prompts.md` 第三节地点首帧要求，统一封闭赭色潜水头盔、黑色潜水服、棕色背带、锈橙与冷蓝黑色盘；揭露前不显示裸脸，不生成怪物模型。它们仅是视频生成的输入图，不是实际视频，不授予剧情事实。

| 文件 | 地点 / 表演镜头映射 |
| --- | --- |
| quarantine.png | 检疫泊位，E01/E02 |
| lab.png | 实验室，E03 |
| pit.png | 收容环，E04/E05/E05B/E05C |
| plant.png | 生产车间，E06/E07 |
| prep.png | 术前准备，E08 |
| gallery.png | 手术室通话窗，E09/E10前段 |
| table.png | 手术台，E10后段 |
| shaft.png | 下行井，E11 |

原始生成结果保存在 `C:/Users/Lenovo/.codex/generated_images/01a16d90-55c6-7523-a572-10b1e4ad4396/`，项目内PNG为拷贝。精确视频提示词及表演变体来自 `docs/video-prompts/level-03-abyssal-lab.md`，由 `src/pod/content/abyssal-media.ts` 编译，不在此重复维护。

用户已明确本轮不上传素材到视频服务。实际视频、揭露段面孔参考和跨段人物一致性尚未验收。
