# Round 12 — rejected local lighting experiments

No production scene, profile, layout, geometry, collision or material changes retained. `tools/living-survey-round12-check.mjs` performs runtime-only trials in isolated pages; API requests blocked. Same-page original/candidate pairs use fixed [144,0,60] yaw90 pitch0 and actual legal approach [151,0,60] yaw90 pitch0, both live/film. No global exposure change, light-count increase or new asset.

1. `round12-rejected-edge`: existing [163,3,57] lamp aim [174,-8,61] → [179,.2,59]. Rejected: removes the useful ground-level pool; weak distant line does not compensate.
2. `round12-rejected-high`: existing [154,8.2,57] high lamp aim [155,-2,67] → [177,0,55]. Rejected: mainly changes hanging cable and near tank lighting; middle building boundary remains black. Near tank cap loses definition.
3. This folder: same high lamp position → [191,3,57], aim [199,0,64]. Rejected: live distant wall still unreadable; film introduces isolated warmer ground patches without a continuous architecture edge. Near tank loses its original warm separation.

The moved lamp trial only moved lighting descriptors, not its decorative fixture/hanger; therefore it is explicitly a lighting diagnostic, not a physically integrated result. Because all candidates fail the visual objective, none warranted permanent fixture changes or integration.

## Corrected selection diagnosis

Actual camera/light-table calculation is recorded in `ranking.json`, reproduced by `tools/living-survey-round12-rank.mjs` directly from the renderer formula. **The 40m post-selection key cutoff is not the demonstrated cause.** The moved lamp fails the earlier `d < range+18` filter (range22 means threshold40) and never enters the selected pair. Even removing both distance filters alone would not give it a top-two weight.

| Camera | Source | Distance | Weight | Selection |
|---|---|---:|---:|---|
| [144,0,60] original | [154,8.2,57] | 13.276 | .72106 | slot0 |
| [144,0,60] original | [163,3,57] | 19.468 | .66661 | slot1 |
| [144,0,60] moved case | [163,3,57] | 19.468 | .66661 | slot0 |
| [144,0,60] moved case | [155,8,62] practical | 13.748 | .62726 | slot1 |
| [144,0,60] moved lamp | [191,3,57] | 47.191 | .07126 | range-filtered; not top2 even without filter |
| [151,0,60] original/moved | [163,3,57] | 12.728 | 1.49908 | slot0 |
| [151,0,60] original/moved | [155,8,62] practical | 9.165 | .93427 | slot1 |
| [151,0,60] moved lamp | [191,3,57] | 40.224 | .09791 | range-filtered; not top2 even without filter |

At approach the original high lamp already ranks third (.88226), so changing its aim does not test a selected shadow key there. Lamp aiming is absent from the selection-weight formula. Increasing the cutoff alone is therefore not a useful next test.

Verifiable next step, not implemented: in an isolated diagnostic page, hold all camera/profile/geometry values fixed and force the relocated source into one existing key slot, capture both approach and fixed views, and inspect whether its beam actually reaches a visible far-wall surface or is occluded by tanks/balconies. This separates ranking exclusion from shadow/geometry occlusion without increasing active key count. It would require a test-only selection hook; not a production renderer change. The screenshot shows tanks occlude the lower right far wall, while central far facade remains a possible visible target; no unmeasured claim of clear lamp-to-target sightline is made.

Cost delta retained: zero lights, triangles, batches, textures, collisions. No FPS claim. No geometry/nav revalidation necessary for the zero retained production change; both diagnostic camera positions were checked against actual teleport clearance. RAG query/check at start reported concurrent root layout/run/site sources stale; did not silently rebuild. No AAA claim; request independent confirmation of rejecting these candidates.
