# 收容环坍塌吊车（本地制作）

2026-10-24 使用 Blender MCP 在独立 `L03_CollapsedCrane` 集合制作；不改用户原物件，不上传，不调用付费生成器或录像服务，不制作生物。`build_collapsed_crane.py` 为源脚本，`abyssal-collapsed-crane.blend` 为可追加编辑的 collection 库。GLB 位于 `public/assets/level-03/abyssal-collapsed-crane.glb`。

可识别机构：轨道及脱轨车轮、I型钢底盘、绕线卷扬鼓、法兰与制动器、减速箱和散热电机、铰接A架、弯折桁架和撕裂焊接板、滑轮组、连接真实轮槽/卷筒的钢索、松弛回线和落地吊钩。几何原创；蓝漆和局部红漆使用已下载 Poly Haven CC0 贴图（许可见 `public/assets/level-03/materials/README.md`），没有额外下载。

精确包络（第9轮）：源模型水平最大半径 5.75520m，高度范围 0.02–8.65m；47004 三角面，5 个材质网格。根节点位于原 crane centre，Y=-5；只进入 decorColliders。现有导航 SolidCyl radius6/floor-5/ceil5 及 world centre±6/Y[-5,5] AABB 未改，未改路线/门禁。原标牌坐标和朝向未改。

第一轮以轨道跨度沿螺旋切向布置，实机发现机构被端视压缩。第二轮让脱轨吊车横跨通道，glTF +Z 朝坑，主卷扬鼓和桁架侧面可辨认。原型黄色梁和临时圆筒饰件已删除。导出时明确 use_active_scene，检查 GLB 仅含5个 Crane_Batch 节点，不混入其他场景物件。

证据：

- `qa/level-03/crane-blender-preview.png`：独立材质照明渲染，已人工查看。
- `qa/level-03/visual/before-review8/crane.png`、`pit.png`：替换前保留。
- `qa/level-03/visual/crane.png`、`pit.png`：第二轮实机拍摄；标牌仍完整可读。截图来自固定诊断机位，不能当作真人盲玩。
- tsc、decor collision channel、abyssal layout 检查通过；decor 检查打印的首关旧GLB Node URL警告与本吊车无关。第二轮朝向调整没有改结构数据，待最终统一复核。

第9轮：针对独立审查所指“像停放机械”，把上部A架/桁架单独向坑侧折倒，底盘不作整件倾斜；左前支腿保留断裂短桩和分离落地的下段，倒架由落地折弯桁架承托。顶部原承梁向内屈曲并压住倒架，弯折点位于玩家可见的开口左半。回索改成松弛下垂。保留 `visual/before-review9`；当前crane/pit为此版的实机截图，尚需独立判断事故表达，不将离线图作为验收替代。

真实差距：入口门框仍遮挡右侧部分机构与吊钩，远景不保证能读出每处断裂；扫描蓝漆贴图在部分投影方向仍可能重复。折倒关系是手工造型，不是经结构仿真验证的受力解。不能据此认定 AAA 或独立视觉验收通过。
