# Level two environment PBR set (bulkhead steel, deck plate, rubber, rust)

All textures are **CC0 1.0** (public domain) from Poly Haven, downloaded 2026-10-09 at 1K.
No attribution is required; recorded here for provenance.
Pattern: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<id>/<id>_<channel>_1k.jpg`
(`diff` sRGB albedo, `nor_gl` OpenGL tangent normal, `rough` linear roughness).

| id | asset page | used for |
|---|---|---|
| blue_metal_plate | https://polyhaven.com/a/blue_metal_plate | welded bulkhead panels (residential / security / office walls) |
| green_metal_rust | https://polyhaven.com/a/green_metal_rust | chipped painted steel (props, furniture, lockers, trim) |
| metal_plate_02 | https://polyhaven.com/a/metal_plate_02 | dark deck plating, industrial walls, door frames |
| metal_grate_rusty | https://polyhaven.com/a/metal_grate_rusty | tread-plate landings and corridor centre strips |
| rusty_metal_02 | https://polyhaven.com/a/rusty_metal_02 | rust bloom overlay sampled by the world-space wear shader |
| rubber_tiles | https://polyhaven.com/a/rubber_tiles | rubber deck tiles (corridors, gallery), seals |

Derived files (same CC0 licence, made locally with Pillow):

- `panel_gray_diff_1k.jpg` — `blue_metal_plate_diff` desaturated; detail above a 48 px Gaussian kept at
  50 %, the low-frequency blotches below it kept at 25 % (they read as a repeat on 8 m walls); mean
  normalised to ≈ 0.62 so the paint colour is set by `material.color`.
- `paint_gray_diff_1k.jpg` — `green_metal_rust_diff`, same treatment (detail kept at 60 %).

2026-10-27 material trial: the existing `rusty_metal_02` 1K triplet is also used on the failed pressure-vessel manway flange. Rob Tuytel / Poly Haven, https://polyhaven.com/a/rusty_metal_02 ; licence https://polyhaven.com/license (CC0). No preview images downloaded. Source files remain local; SHA256 inventory: qa/living-survey/material-asset-hashes.json. Diffuse uses sRGB, normalGL/roughness linear, geometry UVs in metres and material tile width 1m. Restricted to a small exposed oxidized flange; surrounding painted vessel and blue enamel header retain their distinct surface systems.
