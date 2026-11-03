# 操作台独立视觉审查

日期：2026-11-03。审查人：独立子 Agent `/root/visual_review`。

参考为用户上传操作台图片。实际使用 `view_image` 查看原图以及每轮生成的 `comparison-ab.png`，并检查第二轮真实驾驶座截图。A 为 Three.js 实机，B 为参考。审查者知道来源，因此这是匿名标签并排对照，不是真正双盲测试，也不包含人类受试者。

## 第一轮

未通过参考匹配。新品黄绿塑料感、连续棕色剥落边、近白轨道与按钮环、平圆制动帽、文字压扁且粗白，是主要问题。形状布局较历史截图明显改善，但参考的旧金属质感明显更好。

## 第二轮

文字字形比例、深灰绿色、摇杆橡胶罩、半球制动帽和窄金属边均改善。11 个原有控制器分别通过投影位置附近的真实 `pick` 射线查询，不执行曝光，不请求生成服务。详见 `round2/diagnostics.json`。运行控制台无错误；渲染统计 619 draw calls、165710 三角形、1056 geometry、66 texture。这只是瞬时统计，不是性能基准或完整功能验收。

参考图仍明显胜出：实机表面有均匀重复的模糊斑块，缺少参考中位置合理的金属露底、油污与细碎高光；轨道/按钮边仍整洁；照明指示灯偏白。参考有更复杂而自然的表面层次与光影。不能判定达到 UE5 AAA 或与参考等质。

## 第三轮

统一纵深比例与琥珀指示灯更接近参考，铭牌字形比例合格；细碎划痕和接触层增加表面信息。11/11 射线检查通过、运行 console errors 为空，629 draw calls、165730 三角形、1066 geometry、70 texture。未看见明显条纹状阴影伪影。

仍未通过：金属轨道、按钮边及制动环从第二轮偏白变为近黑绿色，失去参考图的银灰反射；边缘露底不足，均匀随机白点无法代替集中在上沿与前唇的磨损。已要求第四轮将金属响应调回两轮之间并强化合理位置的磨损。图中 A/B 相同标签仍不是盲测。

## 第四轮

实际查看并排图与驾驶座图。宋体铭牌、银灰边缘磨损和分区配色进一步靠近参考，11/11 命中且 console errors 为空。然而金属由偏黑回到均匀奶白色，反射缺乏参考图沿圆环不均匀的油污与磨亮变化。已要求第五轮针对金属贴图粗尺度反射差异，而不是继续整体调亮/调暗。参考仍更自然，未达到等质。

## 第五轮

实际查看完整 A/B 图与 1440×900 驾驶座图。粗尺度油污打断了均匀奶白圈，金属有反射变化，前折边、分区与宋体铭牌改善。但 A 仍更暗、更规整，表面磨损及高光自然程度仍不如参考 B；不能据此宣称 AAA 等质。

1920×1080 与 1440×900 两种实际驾驶座俯视均 11/11 控件命中、运行 errors 为空。阴影诊断中静止 200ms 更新时刻不变，摇杆 yaw=.5 后更新时刻推进且缓存 pose=.5，归零后缓存 pose=0，证明该诊断下静止缓存与动画刷新有效。

另存 `shadow-profile/point-light-profile.json`：42 个静止帧 CPU render 提交中位数 2.3ms（2.1–3.1ms），629 draw calls；11 个阴影刷新帧中位数 4.1ms（3.9–5.5ms），1702–1705 draw calls。这是一次浏览器 CPU 提交测量，不是 GPU 时间、FPS 基准或独立模型成本，不用于保证任何设备性能。

## 第六轮参考角度复核

`round6/reference-angle.png` 使用临时诊断相机 (.12,1.37,-.65)，观察 (.12,.96,-1.42)，垂直 FOV 40°；保留正视 `closeup.png`、原位 `panel.png` 与 `panel-1440.png`，没有修改游戏相机。该角度更接近参考的梯形透视，并恢复可见的旋钮侧面与摇杆体积。实际查看 `round6/comparison-ab.png`，结构布局和材质方向明显改善，参考 B 仍在自然高光、边缘磨损与暗部层次上胜出。没有发现明显阴影条纹；两分辨率 11/11 命中继续通过，errors 为空。

## 第七轮单张阴影优化复核

PointLight 改为 SpotLight 后，实际查看完整 `round7/comparison-ab.png` 未发现视觉退化或条纹。两种分辨率仍 11/11 命中，阴影静止缓存及摇杆刷新通过，errors 为空。`shadow-profile/profile.json` 中阴影刷新为 1218 draw calls、331296 三角形，低于点光的 1702–1705 calls、约 540000 三角形；静止仍为 629 calls。SpotLight 的 CPU 采样与截图浏览器并发运行，不能与前一次隔离测量作严格 CPU 耗时对比。

本轮独立结论：相比最初实机，形状、文字、分区材质、控件细节和旧设备氛围明显改善；参考 B 仍有更自然的高光和磨损细节，AAA 等质未得到证明。本结论没有因为测试通过而放宽视觉判断。

## 第八轮量化匹配与灯光变体

继续迭代，没有把第七轮作为参考等质通过。以参考内面板四角 (99,157)、(956,160)、(1012,481)、(25,481) 为手工地标，使用实际模型 matrixWorld 和最小二乘拟合诊断相机。模型纵向比例从 .65 增至 .74 后，首个拟合四角 RMS 7.52px；板面纵向范围实际 159–481px 对参考 157–481px。该方法不改变运行时机位。

原本参考投影宽高比约 2.85，旧模型内面物理宽高比约 3.11，单靠相机无法真实匹配同样纵深。此问题由模型纵向比例修正，而非对截图拉伸。

正确驾驶座诊断下两个分辨率仍 11/11 命中，2K 材质 shader 无错误。另一个并行任务增加序章并将新开局设于导航座，旧 `sit()` 失效，因此本轮测试浏览器仅在内存把序章设为完成并 `walkTo('camera')`；未更改运行时源代码或持久存档，不声称自然通关。初次受序章干扰的截图已重采。

局部灯 .13/.26/.39（aux .08）在同机位测试，原始数值见 `round8/patch-measurements.json`。参考左板 RGB 中位数 (51,64,50)，.26 为 (36,60,42)，.39 为 (48,71.5,54)：游戏绿色差值偏大。参考中板亮度中位数 73.4，.39 为 53.6；参考前唇 100.3，.39 为 42.6。顶部采样还包含模型窗框遮挡，不能全部解释为灯光不足。曝光帽参考 114.5，.26 为 122.4，已不需要整体提亮。

位置差：当前窗框遮板上沿约 20px，红灯比参考低约32–42px；摇杆球头比参考低约43px，基座低约25px。其余四键、制动、照明、曝光、机械臂主钮的 y 位置已约在±3px内。均为1024宽参考尺度的手工图像读数，约±5px不确定性。已把具体修正发给模型/灯光负责人。

## 第九至十一轮：校准继续，未按 AAA 通过

第九轮引入 authored 2K enamel 后微表面更自然，但左板 RGB (83,97,52)、中板 (127,141,108) 明显比参考 (51,64,50)/(65,77,56) 偏亮黄，因此否决该亮度。三板贴图均 loaded，原控件两尺寸均 11/11 命中。出现一次 ERR_SSL_PROTOCOL_ERROR，未进行无关代码修复；第十、十一轮未复现，网络失败采样仅发现切离标题视频的 ERR_ABORTED。

第十轮改真实材质铭牌与透明字墨，消除原虚线边框；校准后左板偏暗，中板仍偏亮。前沿补光 .055/.09 对应采样亮度约66/82，参考100；曝光帽约141，参考115，不能用全局加灯解决。另发现此前 raw Three.js projection 没考虑 present.ts 的桶形后处理，边缘位置误差可达10–18px：此前四角 RMS 仅代表后处理之前，不是真正截图像素误差。

第十一轮诊断工具使用与 `present.pick` 对应的桶形/心跳/呼吸映射反解，拟合最终画面坐标；仅在模型诊断近景冻结现有 post 参数/时间与主灯微闪时相，保留效果而非关闭。实际游戏驾驶座和射线检查在冻结之前执行。该轮中间输出坐标为1024×576，后续报告将 y 换算为 ×572/576；第十二轮起工具直接以1024×572测量，A/B 576高容器有2px参考留边。

第十一轮实际查看完整 A/B：左板 RGB (49,62,50) 已接近参考 (51,64,50)，中板 (74,89,72) 仍偏亮，曝光帽 (123,123,84) 接近目标 (121,115,85)。前沿采样 (52,61,47) 偏暗，定位发现采样为宽平坦裙边，而此前被加亮的是更低的窄折边，不能继续盲提折边灯光。两分辨率11/11命中、errors为空、所有authored贴图 loaded。

校正后的1024×572投影：球头中心(73.6,224.8)、56.6×51.9，boot含法兰中心(125.1,273.7)、93.9×90.1；参考手工估计球头(102,229)、49×48，boot(130,285)、95×86。应主要调整球头相对基座的位置，不能把整组一起搬。制动(329.3,408.9)、照明(600.2,236.4)、曝光(614.4,389.8)、臂主钮(871.2,274.5)已分别与参考地标比较并送模型agent修正。主体形态尚有明确偏差，未宣称参考等质或 AAA。

## 第十二轮：形体定位接近，表面分布仍待修正

直接使用1024×572后处理校正坐标。完整A/B已实际查看，双分辨率11/11命中、errors为空、authored贴图全部loaded。阴影检查静止缓存不变，yaw变化与复位、档位0→1→0均触发更新。

球头中心(99.7,232.4)，50.2×46.2；boot含法兰中心(127,285.8)，94.9×91.4，接近参考地标，已要求保留位置。制动(346.6,415.3)、照明(602,248.1)、曝光(610.4,393.9)、臂主钮(860,282)均接近参考地标，不再重复小于5px的无意义微调。

左板RGB(48,60.5,48)对参考(51,64,50)接近，曝光帽(120,115,82)对(121,115,85)接近。中板(68,81,67)仍蓝偏多。宽前裙(114,117,108)高于(99,103,80)，更关键是亮度P10/P90为105/123，而参考为72/129：表面过于均匀，缺少暗磨损，不能只整体减曝光。制动铭牌中心手工读数约(350,524)，比参考约(342,500)低24px，已要求只上移铭牌。红灯与琥珀指示灯也记录了最终像素偏差交给负责人修正。

仍不认定AAA等质。最明显余差是旋钮顶的球状鼓起、铭牌字形比例和过于均匀的前裙表面；第十三轮继续针对这些具体问题。

## 第十三轮：定位锁定，铭牌配色退步

完整 A/B 实际查看，双分辨率11/11命中，errors为空。红灯左(57.2,122.9)、右(798.4,119.4)，琥珀灯(598.6,207.6)接近参考；制动牌(341.2,496.2)不再低约20px。球头与基座保持，已要求不再为小于5px差异重复搬动。

独立审查否决了本轮铭牌配色：新的短宽字形方向接近，但底牌变成亮黄绿色，比上一轮暗灰绿更不像参考。前裙 RGB (116,119,106) 高于目标 (99,103,80)，亮度P10/P90=105/126，参考72/129，仍需真实暗磨损而非均匀调色。中板(72,86,72)仍偏亮蓝，去掉不合理反射云后表面过于平滑。曝光帽(120,115,81)已接近参考，建议保持。

灯核采样改为各自实体中心小窗口，避免先前位置不重合造成错误结论：红灯参考(164.5,18,17)，实机(108,4,6)；琥珀参考(255,248,168)，实机(199,174.5,70.5)。已把局部发光层改进交给主Agent，而不是改变照亮整块面板的光强。

## 第十四轮：均值接近不能替代视觉验收

会话执行完成后实际查看完整A/B与1440驾驶座图，未因工具中断提示而跳过审查。11/11两尺寸命中、errors为空。左板(49,62,50)、前裙(99,101,76)、曝光帽(121,116,82)均已接近目标。

仍明确否决：前裙出现一排轮廓清楚的矩形拼贴斑块，正常1440驾驶画面尤其明显，虽然平均颜色正确，却比自然磨损更假。琥珀指示灯变成灰白小球，实体核心采样(203,205,209)，目标(255,248,168)，不能继续只提高亮度。红灯分层改善，但核心(117,45.5,36.5)比目标(164.5,18,17)偏淡橙。中板(69,83,70)依然偏蓝和平滑。

以上缺陷已分别发给材料、模型与主Agent，并要求材料Agent亲自查看截图；没有以像素均值接近或测试通过认定 AAA。

## 方法与限制

`helm.png` 为实际驾驶座，`panel.png` 为驾驶座向下观察；`closeup.png` 仅在诊断脚本临时改相机用于模型对照，不改变游戏相机逻辑。截图屏蔽 `/api/` 网络请求。游戏原有任务牌仍显示，未为漂亮截图删掉游戏内容。

RAG 相关查询已执行，`node tools/level-rag.mjs check` 通过 44 条 metrics。截图不是关卡通关验收，也不能证明所有状态/输入和所有屏幕比例都通过。

## Round 15 — rectangle mask fixed, visual acceptance still failed

Actual `comparison-ab.png` and normal `panel-1440.png` were inspected. The aligned rectangular mask islands are substantially removed. The apron still reads as horizontal layers with insufficient dark oil variation: median RGB 108/110/87 versus reference 99/103/80; luminance p10/p90 91.6/118.9 versus 71.8/128.8. The middle plate remains smooth and blue-green (69/82/70 versus 65/77/56).

Amber core remains pale grey-cream (203.5/203/192 versus 255/248/168). Runtime diagnostic proves the updated material is active: `helm-amber-dielectric`, emissive `ffbd54` × 1.1, metalness 0, roughness .48, toneMapped true. This is not stale cache; inspect lighting/post or covering geometry before increasing emission again. Red core is more saturated but still dimmer than reference (116/27.5/15.5 versus 164.5/18/17).

All 11 controls hit at both resolutions, no WebGL errors, all three authored textures loaded. Static shadow caching and yaw/throttle change-and-restore checks pass. 1440 view: 592 draw calls, 155754 triangles. Only failed request is the navigation-aborted title video. No exposure was triggered. V2 albedo candidate was not integrated. Reference B remains visually stronger; this is a source-known comparison, not a true blind test or AAA certification.

Round15 follow-up: main agent traced the amber peak ceiling to existing double tone mapping: cabin renderer ACES outputs an LDR canvas, then `src/render/post.ts` applies ACES again to sampled scene RGB. A source channel of 1 becomes approximately .804 before additional curve/tint. Do not chase reference 255 by repeatedly increasing lamp emission; retain warm hue within this existing pipeline, and do not rewrite global exterior/HUD rendering for this local asset task. This limitation does not waive the remaining material-quality failures.

## Round 16 — authored v2 and warmer amber, still not accepted

Inspected A/B and actual 1440 view. V2 oil marks look more natural, but left patch darkened to 40/51/40 (reference 51/64/50), while middle remains smooth and blue (70/82/74 versus 65/77/56). Apron striping is unchanged. Amber is now visibly yellow (206/186.5/71.5); evaluate hue within the established double-tone-map peak limitation, not against an unreachable 255 peak.

Brake red segmentation centroid is 347.40/400.87 versus reference 344.62/398.25: no further position adjustment is warranted. Red bounds are 312,364–383,437 versus reference 312,366–379,426, so the cap silhouette is still taller. Mesh cap center is 347.25/401.50, size 75.93×74.36; guard center is 346.99/415.90. No obvious intersecting geometry, but the raised cap reads too cylindrical. Both resolutions retain 11/11 control hits; no WebGL errors; 1440 costs 593 calls/155946 triangles. Reference remains visually stronger, especially surface variation, worn edges and the front apron. No AAA certification.

## Round 17 — middle diffuse restored, red-opacity variant rejected

Inspected comparison, normal 1440 view, raw Three canvas and opacity .55 variant. Middle plate now reveals the intended oil texture after reducing the overwhelming specular contribution, but is too dark: 47/60/40 against reference 65/77/56. Left is 48/59/47 against 51/64/50. Apron stays 108/110/86 and visibly layered horizontally. Cap silhouette reduction improves the raised button without visible intersections; no further small positional adjustments requested.

`raw-three.png` preserves the original Three canvas before the second post pass. It shows clearer metal/texture response; the final image suppresses highlights and shifts color. This is diagnostic evidence, not a replacement gameplay screenshot. Opacity .55 is rejected: red core changes from 116/27/16 to 118/51/26, becoming orange rather than matching reference 164.5/18/17. Baseline .76 was restored. Default throttle at zero differs from the reference middle-track pose; this is gameplay state, not a geometry error.

All 11 controls remain reachable in both resolutions, zero WebGL errors, 593 calls/155946 triangles at 1440. Still below the reference: middle diffuse needs calibrated brightness, label ink/plates remain too pristine, and front-apron wear reads as horizontal bands. No AAA claim.

## Round 18 — physical depth correction validated, earlier local compensation exposed

Only panel Y scale .90 and circular compensation .65/.90 changed. Actual A/B, normal main view and 1440 downward view inspected. Silver guard projects 113.74×97.96, essentially matching reference 114×98; this supports the deeper physical panel rather than artificially flattening circles. Guard center is 351.84/410.48 versus reference approximately 347/402. Red cap center 353.98/391.69, size69.74×54.09, now lies right/up relative to reference red region ~344.6/398.3.

Old localized corrections no longer hold: grip center137.04/205.76 and diameter42.2 versus reference102/229 and ~49. Boot+flange remains close at131.53/278.78, size93.24×91.55; do not shift the entire stick assembly to correct the sphere. Lamp cap is approximately10px too high and partially hides the amber indicator. These require re-evaluation under the corrected depth, not another global warp.

No window/frame blocks the controls in normal views; all11 controls remain reachable at both resolutions, no WebGL errors. Keep the physical-depth improvement, but visual acceptance remains failed because the old local compensations now create obvious shape/position errors and material/front-apron deficiencies remain.

## Round 19 / 19b — anchors corrected, large material/shape gaps remain

Actual A/B and normal 1440 image inspected. Grip100.9/229.3 (47.4×47.6), silver guard346.7/402.6 (115.2×99.2), red cap344.2/399.2 (67.1×60.6) now closely match their separate reference landmarks. No further position chasing warranted. Lamp complete mesh59.7×59.1 includes its tall sidewall; the actual top-only vertices project about55.0×42.7 centered601.65/239.04. Do not compare the entire cylinder bounds to the reference top ellipse. Sidewall/socket stack is too tall; shortening it while keeping the base can also lower the top toward the target.

The black brake base covers too much of the worn hazard flange. Front apron has fewer stacked physical bands, but now shows aligned broad white islands resembling pasted chips. Middle remains dark50/63/42 versus reference65/77/56. Normal-view labels are clean and uniform. The window is substantially darker than reference; task UI is retained as gameplay content and is not removed for image matching. These large-area differences still fail visual acceptance despite accurate landmarks. Both resolutions11/11 reachable, no WebGL errors.

19 loaded before the main red-lamp position/scale patch. 19b refreshed to verify that patch separately and is preserved; it does not change the above material rejection. Future window adjustments require inspecting normal driving visibility, not only a reference-color patch.

## Final user-directed compact / upper-layout finish

The user accepted the general form and changed the scope to finishing a smaller console, then explicitly requested using the empty upper panel space. The prior pixel-matching/AAA rejection loop is therefore closed. Final evidence is **compact-upper-final**, not earlier compact-final or reference-fit captures.

Viewed normal `panel.png`, `helm.png` and checked both 1920×1080 / 1440×900 diagnostics. The console is uniformly compacted, controls are raised into the previously empty top area, the lower panel is shortened, and the rear support alignment is corrected. Labels and controls remain legible; top labels retain clearance, lower controls are not clipped, and no obvious floating/intersecting assembly is visible. The experimental strong blue window veil was reverted; normal driving view retains the previous dark optical presentation. `normal-before-after.png` compares round19 and final normal cameras without fitting to the reference.

Both resolutions hit all11 control IDs. Static shadow cache stays unchanged; yaw and gear changes refresh and restore shadow pose. Zero browser/WebGL errors in final diagnostics.

Actual pointer gear regression passes **0→I→II→III→0**, with grip localY -.05/.045/.14/-.145 and input unblocked. Evidence: `compact-gear/result.json`. An earlier full prologue test failed at its initial navigation field assertion before reaching any gear test; it is not claimed passed. The isolated gear test uses the already-disclosed in-memory onboarding bypass. Its first attempt sampled before opening camera movement settled; increasing the test-only settling wait from2.5s to6.5s resolved it, without changing runtime behavior. This is acceptance of the user's final layout/finish scope, not a claim of independently certified AAA production quality.

