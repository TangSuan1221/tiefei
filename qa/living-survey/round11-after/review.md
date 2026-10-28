# Round 11: one controlled art variable

Only `living-dressing.ts` R2 storage rack beam argument changed from the default hazard material to existing `m.frame`. No shared material properties, camera, exposure, lamps, scene positions or collisions changed. Door jamb hazard paint remains. No textures/materials/geometries were added. Existing six beam boxes now join the existing frame material batch: triangle delta 0; draw-batch count cannot increase (no FPS gain claim or GPU timing made).

Fixed repair-link view [56,0,26], yaw90, unchanged live/recording captures are in `round11-before` and `round11-after`. All six fixed views were recaptured under `qa/living-survey/art`.

Observation: the three right-side high-contrast shelf bands no longer compete with the doorway jambs. Shelf edges and stored boxes remain visible. This improves this specific boundary hierarchy; does not establish a room-wide or AAA improvement. Random-looking floor patches and atrium middle-distance lighting remain unresolved.

Pixel evidence (live, identical ROI x865..1024 y300..640, includes shelf and adjacent background): mean luma 0.2079→0.1752; RMS 0.1210→0.0939; pixels above luma0.35 8.75%→2.71%. These support reduced local salience, not perceptual-quality proof. Screenshots use separate runs and contain temporal grain.

Actual loaded-world navigation: 4,973 samples PASS, 266 structural colliders, closed gate blocks, no personnel-side L/M/N scenes. Geometry and material count are unchanged by inspection of the single argument change and material batching implementation; no new asset-load or runtime-light cost. Independent visual review remains required.

Pre-change RAG query/check PASS43. Parent should synchronize final source index after concurrent work.
