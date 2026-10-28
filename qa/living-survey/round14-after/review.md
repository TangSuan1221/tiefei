# Round14 — retain authored alpha perimeter

Identified source: `DecalSet.quad` random weather sub-window can cut through nonzero alpha, giving a straight plane-edge silhouette. These decal batches already disable castShadow, so opaque quad shadows were not the supported explanation. Floor geometry already has a3mm lift and polygon offset; neither was changed.

Minimal fix: optional `floor(..., fullCell=false)` skips random atlas cropping when true. Only the existing14 authored R2/C8 maintenance marks pass true. Every other call retains its prior default and crop behavior. The full atlas cell restores the intended alpha falloff. No shader, exposure, light, position, decal count, texture, material instance, mesh topology or collision changes. UV coordinates only; added runtime rendering cost zero by construction, no FPS claim.

Before images are saved round13-after images copied to `round14-before` before this change; same tools/poses. After images in this folder are fresh browser captures. Fixed [56,0,26], yaw90/pitch0; near [68,0,26], yaw90/pitch12; live and film. Temporary capture output was `round13-round14` due to the existing script prefix; its four PNGs were copied unchanged here.

Observed: near-view left pump previously had a triangular hard dark plane edge, now replaced by a soft smaller stain; fixed-view wall-side black marks have softer perimeter. Main route, pump and door signs remain readable. Broad wavy threshold darkness and distant broad brown floor region remain unresolved, and are not attributed to the corrected stamps without further evidence. No claim of general material realism or AAA quality.

TypeScript PASS. Initial metrics query/check PASS43. Independent image review required before accepting this local improvement.
