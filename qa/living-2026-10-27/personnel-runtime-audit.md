# 第二关人员侧生产world独立审查（含清理后复验）
## 最终版复验：PASS

root删除未调用buildAlex、空alexRoot、detached alexLamp及对应每帧查找/更新后，已用新浏览器再次验证。最终JSON为personnel-runtime-audit.json；改前原始数据另存personnel-runtime-before-cleanup.json。

- alexRoot与alexLamp均实际undefined（JSON以null记录），没有空actor根/离场灯残留分配。
- 20个world空间仍无L/M/N；1468个mesh检查仍无人员核心顶点，人员核心结构/装饰碰撞及walkable均空，practical/mood无人员侧灯。
- 可见actor状态与M区域focus压力测试后world节点仍为1654，无补建actor。
- 最终禁名断言forbiddenGlbRequests=[]；没有人员actor/茧尸/生物GLB加载。边界门窗与艇侧尸体GLB保留。
- JS errors为空；API/外网请求仍全部拦截。没有测量FPS，不宣称性能提升。

以下为改前基线及仍有效的兼容数据说明；其中第1项空根/灯分配现已删除，第2至4项历史兼容数据仍需如实区分。

结论（改前）：当前实际world没有创建L/M/N房间、人员侧灯源、可走体积、核心区域碰撞、艾里亚斯/茧尸actor或其GLB加载；但不能表述为“源码与对象分配彻底无残留”。site仍有空actor根和未入场的灯对象分配，详见下文。此基线是在root清理这些残留之前取得。

## 方法与证据

读取createLivingWorld完整构造/更新、buildShells、buildDressing/clutter、buildHeroes、loadHeroGlbs及site fallback链；未只看pod过滤一行。已有tools/living-survey-world-browser-check.mjs仅检查root直接子节点名称，不能覆盖嵌套actor、灯表、加载请求或人员侧内部几何；因此新增独立tools/living-personnel-runtime-audit.mjs。独立浏览器打开主游戏第二关，等待实际world.ready；全/api与外网请求拦截，不影响盲玩家浏览器，无外部生成。

原始证据：qa/living-2026-10-27/personnel-runtime-audit.json。

- 实际root有20个living-space组，无L/M/N。遍历1468个Mesh（包含实例矩阵变换）检查实际世界顶点，L/M/N核心范围没有Mesh顶点。核心范围为每区平面边界内缩1米，垂直边界内缩0.15米，以免把G/A侧共享墙、玻璃窗、F门误算为人员房间。
- 同一核心范围内，world.colliders、decorColliders均无相交包围盒，walkable也没有相交体积。与layout的livingSolids只为pod空间建墙壳、livingWalkable只加入pod空间和open门喉相符。
- practicalLights与moodLights无space=L/M/N条目。world.root下无Three Light节点（场景照明由灯描述表交给renderer）；不能把这个0单独当“不照明”的证据。buildMoodLights明确排除L/M/N；shell fixtures来自实际建造空间，clutter灯表运行结果亦不含它们。
- 实际对象总数1654。显式调用world.update，传入alex.visible=true、人员侧位置及slime=1，再setFocus到M，对象总数仍1654，没有动态补建房间/actor。photoTargets没有alex/cocoon条目。
- 新浏览器完整记录17条GLB HEAD/GET：custom-valve、glass-blast-door、security-post、manager-office、laundry-row、ballast-rack、atrium-balcony、gate-f及atrium-balcony.lod1。无living-diver-alex、cocoon-corpse或living-creature GLB请求。对落盘JSON另执行禁止名称断言PASS。加载的security/manager尸体属于艇侧S/R5资产，不能误报为艾里亚斯actor。
- 页面JS errors为空。外网字体和启动视频API请求被拦截；没有放行外部生成。

## 清理前残留（非实际人员侧场景）

1. site创建alexRoot空Group并加入Scene，实测children=0、visible=false；还创建SpotLight对象alexLamp，实测parent=null、intensity=0。未调用buildAlex，因此没有body/helmet/visor/tank mesh，也未把灯入场。syncVisuals仍每帧查找两个actor名字及更新空根/灯，这属于可清理的无效分配与遍历，不是已渲染actor。
2. buildHeroes保留未挂载的空gateInner、cocoon兼容handle，buildCocoon import未调用。living-alex/createAlex与living-cocoon模块和文件仍存在；定义内才触发loadActorGlb，当前构造链未调用。loadHeroGlbs还用ACTOR_OWNED排除cocoon-corpse。
3. layout仍有L/M/N位置和ALEX_MARKS；world仍有旧probeShots、alex状态类型、setFocus人员区域判断、MOOD旧配置（生成时过滤）及livingFogAt人员区雾逻辑。它们是兼容数据/函数，不能当成房间已建或当前正典。
4. root中四个名称带living.slime的Mesh属于C1/C2/C3/C4艇侧壳体材质，不在人员侧核心；不能因名字有slime就断言创建了M污染走廊。G观察窗、A侧F门及门后薄边界构件仍存在；“不建人员侧房间”不等于删除艇侧共享边界。

该验证证明当前构造链和本次实际加载状态，不证明仓库完全删除历史代码，也不以缺actor声称影片已经生成或验证。root将清理第1项；最终版应再验空对象、灯、mesh、碰撞与网络请求，不能直接复用清理前对象计数。

