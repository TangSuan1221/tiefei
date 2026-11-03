# 舷窗操作台贴图

`worn-enamel-albedo-v1.png`：2026-11-03，内置 imagegen 以用户提供的操作台参考图作为材质风格依据生成的旧漆金属色彩纹理。它不是参考图投影，也不是模型渲染图；控件、文字、反射、光照和阴影仍由 Three.js 构造。

生成方式：built-in `image_gen__imagegen`，非CLI。参考原件：`qa/helm-reference-review/reference.png`。

`worn-enamel-albedo-v2.png`：同日以 v1 和原参考图为双参考生成的候选，加强稀疏油污、微小漆片与细裂纹；生成要求保持近似平均颜色，不含控件、字牌或烘焙照明。是否用于运行时以材质代码中的路径及独立实机审查为准，不因生成成功而自动替换。

v2提示词核心：保持v1的正方形平面布局、暗灰橄榄平均色及薄不规则露铁边；加强参考中央面板的局部深色油渍、氧化、细小凹坑和磨损，降采样到250像素仍能辨认；保留大面积完整旧漆，禁止规则噪声、条纹、重复几何块、云状高光、透视、控件、文字、投影与反射，只生成漫反射表面贴图。

生成提示词：

> Use case: precise-object-edit. Project asset: physically based albedo texture for the REAL Three.js submarine console model shown in the reference. Derive ONLY the painted metal surface from the central rectangular green panel in this reference image. Remove ALL knobs, buttons, lettering, screws, labels, lamps, seams between panels and all background. Output ONE square, flat orthographic full-frame surface material image, entirely filled with old cold olive-grey enamel on steel. It is an unlit diffuse COLOR texture, NOT a render of a console and NOT a mockup. Match the reference's extremely convincing aged naval metal surface: subtle irregular dark oily hand stains, very fine hairline scratches and abrasion, tiny dents and paint microcracking, a restrained amount of neutral silver-grey exposed primer/steel and dark oxidation. A narrow irregular worn border approximately 2 percent of image width on all four edges, heavier in a few sections of the top and bottom edge, should transition naturally into the broad largely intact grey-green enamel interior. High-fidelity photographic surface detail with believable scale, not random noise, no black insect-like dots, no decorative pattern, no heavy orange rust. Flat diffuse even lighting with no directional illumination, no specular glare, no cast shadows, no vignette, no perspective, no three-dimensional edges, no objects, no hardware, no text, no logos. The texture must be suitable to wrap a single rectangular metal plate approximately 60cm across. Keep a dark desaturated neutral grey-green palette closely matching the reference central plate. Produce the texture asset at high detail.
