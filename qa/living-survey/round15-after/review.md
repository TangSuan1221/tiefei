# Round15: sediment geometry crossing open portals

Source isolation in `round15-diagnostic`: baseline, all decal materials hidden, receiveShadow disabled, and sediment material geometry hidden. The long threshold band survives no-decals and no-shadows, then disappears in no-silt. This is geometric sediment, not a decal-alpha fault and not a correct structural shadow. The sediment mesh material is the local concrete wear variant colored6e675a. No-silt also removes legitimate wall-side banks; that global diagnostic is not the production fix.

Source code `living-shells.ts` creates low opaque hemisphere banks along each room perimeter without accounting for open portals. At R2/C8 ends their long axis crosses Z22..30 passage openings. Local fix skips only end-wall banks whose extents overlap those openings. Heights are sampled before the skip, preserving all subsequent RNG consumption. Wall-parallel banks remain; no global material/shadow change or new decoration.

Before images copied from accepted round14-after, fixed [56,0,26]90deg/pitch0 and near [68,0,26]90deg/pitch12, both live/film. Fresh after images originally output to round13-round15 by the existing QA tool prefix, copied unchanged here. Fixed long artificial threshold edge disappears; door frame, stripe and wall-side sediment remain. Near wall-base edges remain where sediment actually follows wall geometry; not all dark shapes have been softened or removed.

Cost: fewer existing drift primitives, same materials/textures/lights/batch categories; no new geometry or shader cost. Structural collisions untouched. TSC PASS; actual loaded world4,335 samples PASS,266 structural colliders, closed gate still blocks. Initial metrics query/check PASS43. Independent visual review required; this is a local placement defect fix, not AAA validation.

Diagnostic script now includes all four modes for reproducibility; do not rerun it to overwrite historical before evidence without copying current files first. Its runtime-only toggles never changed production scene files.
