# Third-party PBR material sources

Downloaded 2026-10-24 from Poly Haven's official public API and `dl.polyhaven.org`. All nine JPEGs are original unmodified 1024×1024 files; their MD5 checksums match the official file metadata. Total approximately 4.13 MB. Blender MCP decoded all nine images successfully. No project files were uploaded, no paid generator was used.

Poly Haven explicitly licenses its texture assets under **CC0**, including commercial use and redistribution: https://polyhaven.com/license ; legal instrument: https://creativecommons.org/publicdomain/zero/1.0/

| Asset | Author / credited roles | Official page | Intended use |
|---|---|---|---|
| Blue Metal Plate | Rob Tuytel — all | https://polyhaven.com/a/blue_metal_plate | Main painted equipment and sheet panels; restrained edge wear rather than uniformly rust-covered surfaces |
| Concrete Wall 007 | Dario Barresi — processing; Rico Cilliers — tiling; Charlotte Baglioni — photography | https://polyhaven.com/a/concrete_wall_007 | Structural wall surface with real casting seams, pitting and mineral discoloration |
| Rusty Painted Metal | Amal Kumar — all | https://polyhaven.com/a/rusty_painted_metal | Optional limited red-painted damaged panels with directional runoff; do not apply uniformly throughout the level |

`sources.json` retains exact download URLs, original metadata dimensions, authors, hashes, byte sizes, and licensing links. It describes downloaded assets only, not implementation status.

## Three.js hookup

- Files: `<asset>_diff_1k.jpg`, `<asset>_rough_1k.jpg`, `<asset>_nor_gl_1k.jpg`.
- Base color is sRGB. Roughness and OpenGL normal maps must stay linear / `NoColorSpace`. The normal is OpenGL convention; do not negate its Y channel by default.
- Use `roughnessMap` with `roughness = 1` initially: reducing the scalar to 0.3 multiplies all texture roughness down and recreates the unwanted mirror-like look. Review under the actual spotlight.
- Paint and rust are dielectric coatings: do not use metalness=1 across the whole painted surface. No metallic map was obtained; begin near zero for these coated sheets and concrete. Exposed bare-metal geometry can retain its own separate material.
- Set normalScale conservatively, e.g. (0.25,0.25) for blue paint and (0.45,0.45) for concrete, then inspect in-game. The source relief should not turn flat sheet panels into lumpy stone.
- Match UV density to actual geometry; the metadata dimensions are retained verbatim rather than silently asserting a unit conversion. Avoid repeating the rectangular blue sheet seam at different scales on neighboring objects; controlled offset variation can break repetition.
- These files do not automatically replace GLB embedded textures. The world integrator must assign the chosen material or maps explicitly and dispose owned GPU resources on teardown.

Current state: **DOWNLOADED / LICENSE VERIFIED / IMAGE DECODE VERIFIED**. Game integration and visual acceptance belong to the world pass and are not claimed by this download record.
