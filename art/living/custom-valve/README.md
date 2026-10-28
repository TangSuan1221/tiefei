# L2 local service valve, round 10

Created locally in Blender 5.1.2 via bpy; no external generation, uploads, downloaded mesh, or paid service. Source: `build-valve.py`; editable `l2-service-valve.blend` preserves Cube/Camera/Light and adds only `L2_Valve_R10_Source`. Source objects retain bevel and weighted-normal modifiers. The script is a creation script, not an idempotent update; do not rerun into the populated source scene.

Current low export: `public/assets/deepsea/living/custom-valve/l2-service-valve.glb`, 80604 bytes, SHA256 `8CEC659C6E36D453EFA603062D0957894679BE81FB71482B886F5569743C5DB6`. Three meshes/materials; 1,532 triangles. `export-low.py` makes temporary copies from the intact editable collection, removes tiny bevels/back nuts/hidden studs, retains silhouette bevels on barrel/body/bonnet and reduces the wheel ring. No texture/API dependencies. Blender source coordinates map to Three.js Y-up; main-header junction is local origin, vessel branch extends toward +Z. World placement `[159.6,-3,64.3]`.

Independent review rejected the original 8,220-triangle export as poor value. It is retained only in `art/living/custom-valve/l2-service-valve-high.glb`; high comparison frames remain `qa/living-survey/round10-valve-high`. Current export adds only 36 triangles over the 1,496-triangle procedural component, still three versus four mesh draw units. No FPS benefit is claimed.

Only the rightmost atrium vessel branch replaces the procedural counterpart. Loaded GLB hides `living-valve-r10-fallback`; load failure keeps that old component. The two other branches and shared header stay unchanged. Decoration only; no structural/interaction bounds added. Source prototype support saddle is a cast valve foot, not a claim of independently floor-supported machinery.

Controlled same-page low comparison: `qa/living-survey/round10-valve`. Near pose `[157,0,60]`, yaw150/pitch30; established fixed pose `[144,0,60]`, yaw90/pitch0. Both old/new captured with identical current profile, live and film. Scene totals in report near-before differ due to room visibility settling; do not use that difference as performance improvement. Fixed settled scene totals differ by the exact component delta.

Observed improvement: separate bonnet, stem, flange thickness and fasteners readable near the tank. Fixed distant camera gain is minor. Blue-pipe brightness and room-wide art quality remain unresolved; this asset does not establish AAA quality. No expansion to all branches pending independent review.

Validation: TypeScript PASS; actual loaded-world 4,973 route samples PASS, 266 structural colliders unchanged, closed gate still blocks, personnel-side rooms absent. Re-test source metrics after parent synchronizes concurrent changes; final local RAG check reports stale edited sources, not semantic validation failure.
