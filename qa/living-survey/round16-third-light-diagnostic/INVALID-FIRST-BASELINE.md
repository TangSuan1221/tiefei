此目录为首轮诊断原始证据。新增SpotLight零强度时未初始化shadow map，首张fixed-baseline-live发生黑屏，不能作为前后质量基线。随后候选已初始化，图片可辅助排查但不作为正式配对结论。修正仅QA：初次绘制强制初始化新增阴影并预热。有效完整配对见../round16-third-light-v2。生产源码未修改。
