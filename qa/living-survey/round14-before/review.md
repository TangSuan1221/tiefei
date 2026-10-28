# Round 13: local maintenance floor deposits

Changed only `living-shells.ts` R2/C8 floor-decal placement. Existing random-kind selection and RNG consumption are preserved; same counts, material assignments and plane topology, no new texture/material/light/collider. Eight R2 and six C8 placements are now anchored to existing pump bases, shelving/wall edges and threshold sides, with narrower footprints instead of unrelated central pools. Shared first-level materials and shader parameters unchanged.

Fixed view [56,0,26] yaw90/pitch0 and actual near view [68,0,26] yaw90/pitch12 are unchanged between `round13-before` and `round13-after`, live and film. Observed improvement: the discrete central dark pools in C8 no longer interrupt the driving lane; more staining sits beside the dismantled pump and wall equipment. Existing shelf hierarchy is retained. This is placement causality and lane clarity, not a claim that increased dirt improves quality.

Limitation: broad wavy threshold darkness remains; this iteration does not establish its source or resolve all dark areas. Some relocated puddles remain dense black close to a wall; independent review should decide whether their event relation is sufficiently legible. Do not count the remaining threshold band as an authored new leak.

Cost by construction: unchanged14 floor quads, material instances and batching categories; zero additional geometry/textures/lights. Smaller coverage may reduce overdraw but this was not measured and no performance improvement is claimed. TSC PASS. Actual loaded-world navigation PASS4,335 samples, 266 structural colliders, gate blocking intact. Sample count differs from older4,973 due to concurrent parent route shortening; this art change does not modify layout.

RAG query/check at start reported concurrent site source stale. Parent to synchronize final index. No AAA claim. Await independent comparison.
