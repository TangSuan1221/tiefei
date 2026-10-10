# Level two (living deck) PBR scans

All textures are CC0 from Poly Haven, downloaded 2026-10-09 at 1K resolution
(`diff` sRGB albedo, `nor_gl` OpenGL tangent normal, `rough` linear roughness).
Pattern: `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/<id>/<id>_<channel>_1k.jpg`

| id | asset page | used for |
|---|---|---|
| dirty_carpet | https://polyhaven.com/a/dirty_carpet | corridor / office / dorm carpet |
| dirty_tiles | https://polyhaven.com/a/dirty_tiles | laundry and galley wall tile |
| smoked_walnut_veneer | https://polyhaven.com/a/smoked_walnut_veneer | wainscot, desks, balcony fascia |
| decrepit_wallpaper | https://polyhaven.com/a/decrepit_wallpaper | residential upper walls |
| rusty_painted_metal | https://polyhaven.com/a/rusty_painted_metal | industrial bulkheads (V, R2, R4, shafts) |
| old_linoleum_flooring_01 | https://polyhaven.com/a/old_linoleum_flooring_01 | security room / workshop floor |
| concrete_floor_worn_001 | https://polyhaven.com/a/concrete_floor_worn_001 | shaft and service floors |
| leather_white | https://polyhaven.com/a/leather_white | padded wall panels, seating |
| worn_tile_floor | https://polyhaven.com/a/worn_tile_floor | atrium / laundry / gallery floors |

The level-one scans in `public/assets/deepsea/pbr/` (rusty_metal_sheet, metal_plate) are shared through
`acquireHarborScans()`; see `public/assets/deepsea/pbr/sources.json`.
