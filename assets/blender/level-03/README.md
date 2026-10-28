# 第三关 Blender 环境模块

2026-10-24 通过已连接的 Blender MCP / Blender 5.1.2 实际建模、导出并渲染检查。原场景 Cube、Camera、Light 保留；资产位于独立 `L03_OriginalFacilityAssets` 集合。源码 `build_abyssal_assets.py` 可在新的 Blender 文件执行；已有同名集合时主动拒绝覆盖。

参考：`qa/level-03/route/冲压机.png`、`收容坑.png`、`手术室.png`。没有制作任何生物或怪物；没有使用外部模型、付费生成器或第三方贴图。

| 模块 | Three.js 尺寸 X/Y/Z（米） | 三角面 | 材质 draw calls |
|---|---:|---:|---:|
| abyssal-press.glb | 5.9 / 9.9 / 3.8 | 61,704 | 4 |
| abyssal-containment.glb | 6 / 6 / 1.775 | 11,740 | 5 |
| abyssal-surgical-table.glb | 3.1 / 1.54 / 1.863 | 2,068 | 3 |

GLB 位于 `public/assets/level-03/`。Y-up，前面朝 +Z，根节点保持地面中心。子网格局部原点不同，加载时应保留完整 scene 的变换。`abyssal-facility.blend` 可追加该 collection 编辑；库文件中的收容门、手术台分别水平移到 +10、-8 米以便查看，GLB 无此预览偏移。

材质使用原创、固定随机种子的多尺度腐蚀纹理，每种材质包含嵌入的 512px base color、normal、roughness。第二轮把块状噪声改为平滑插值，补上可随 glTF 导出的粗糙度图；GLB JSON 检查确认纹理全部嵌入。`manifest.json` 登记精确源坐标 bounds。

MET-042：这些资产仅作装饰，不得把 GLB 网格注册到结构 `colliders`；与主航道、交互接近位保持距离。需要承载剧情阻挡时，应另外按设计生成明确的结构体，并做艇壳扫掠验收。

检查结果：Blender `look` 材质预览和独立灯光渲染已检视；渲染在 `qa/level-03/blender-assets-preview.png`。尚无足够证据称这些资产达到 AAA：尚有 UV 尺度不均、重复腐蚀分布、缺少逐件手绘损伤和 LOD 的差距；必须以游戏实际布光、距离及帧率复核，不以离线预览代替游戏验收。
