# Expedition content contract, version 1

Scope: `src/pod/content/expedition.ts` is pure deterministic TypeScript. It has no Three.js, browser, random, clock, network or asset dependency. This is an expanded exploration layout using the seven names and narrative themes in `deepsea-seven-levels.md`, not a claim to reproduce that document's smaller first-level vertical-slice coordinates or implement its hazards, cinematics and endings.

## Frozen integration contract

`createExpedition(index)` accepts integers 0–6 and returns fresh `ExpeditionLevel` data. Invalid indices throw `RangeError`. Exported interfaces in the source are authoritative:

- Level: `id, index, name, description, rooms, edges, items, stages, spawn: [x,z], startRoom, exitRoom`.
- Room: `id, name, role, sector, x, z, width, depth`. X/Z are world centre coordinates in metres, sector is 0–3. Bounds are centre ± half dimensions. Roles are descriptive, not progression conditions.
- Edge: `id, from, to, width, lock?, requires?`. Endpoints are room IDs. Width is 4 m. `lock` is a display label; `requires` contains permanent inventory tokens, all required. An unlocked edge is still a closed physical door until opened.
- Item: `id, room, kind, name, description, grants?, requires?, x, z`. Kinds are `pickup | cache | terminal | record | exit`. X/Z are **local to the room**; add the room centre once. Grants and prerequisites are inventory token IDs.
- Stage: `id, name, objectives: string[], terminal, grants`. Objectives and terminal refer to item IDs; `grants` is the terminal's permanent stage token.
- State: `version: 1, levelId, inventory, collected, opened, visited, recorded, completed`. All collections are string arrays; IDs are namespaced by level. Create with `newExpeditionState(level)`. Store saves per level and version; a different level or version is rejected by progression operations. Invalid arbitrary save shapes still require runtime validation before use.

`interactExpedition(level,state,itemId)` and `openDoor(level,state,edgeId)` **mutate the supplied state**, returning `{ok:boolean,message:string}`. `canOpenDoor(level,state,edgeId)` is read-only and answers whether the door can be opened, not whether it is currently open. Unknown IDs and unmet requirements return false without mutation. `openDoor` is idempotent. Items cannot grant duplicate rewards. No token is consumed and no required reward is random.

`opened` contains both edge IDs and cache IDs. A cache's first interaction adds its ID to `opened`, without granting anything. Its second interaction grants a collectible token and adds the ID to `collected`; further interactions fail without changes. These tokens currently appear in inventory only: they have no repair, consumption or other gameplay effect. The legacy-looking `optional-supply` token suffix is an identifier, not a promise of a resource system. `collected` also contains completed record, terminal and exit IDs. `recorded` contains only record item IDs. Exit success sets `completed`; it does not load another level or select an ending.

Runtime responsibilities: validate physical proximity, visibility and traversal before calling interaction methods; animate opened doors; block closed doors; update `visited` on room entry; enforce camera/recording presentation; transition levels. Content methods intentionally do not infer location from `visited`, which is history rather than current position. Room entry has no automatic rewards. The module does not create timers, require ammunition, drain power or prevent backtracking.

## Geometry

Each level contains 28 functional rooms in four sectors. Seven authored sector plans now have pairwise non-isomorphic connectivity: mining processing/return loop, pump hub and dead-end maintenance branches, thermal offset loop, living-area circulation, twin machine-bank service loops, observation dogleg and branch, and serial offset core airlocks. Sector gates preserve ordered progression. See `expedition-spatial-design.md` for current dimensions and `expedition-layouts.ts` for the authoritative authored plans.

Edges remain axis-aligned. Corridor width depends on theme (3.4–5 m); floor is −2 m and corridor ceiling is +4 m. Rooms have independent ceiling heights and real upper transition walls. Doors use `expeditionDoorPosition` at the midpoint of the gap between the two facing room boundaries, not the midpoint of room centres. No unrelated room/corridor intersections or unrecorded shortcuts are allowed. Items use local X/Z, with interaction centre Y −0.2 m.

## Ordered progression and themes

Every sector has two mandatory objectives plus a terminal: eight evidence/tool objectives and four terminal verifications per level, followed by the exit. Each terminal requires both local objective tokens and, except in sector zero, the previous terminal token. Either local objective can be obtained first. Both are reachable before their terminal. Each later sector's objects also require the previous stage token, so calling an object remotely cannot skip the dependency chain. Physical reach still belongs to runtime.

| Index | Level | Four sectors |
| --- | --- | --- |
| 0 | 三号采矿区·破口处理大厅 | 破口气闸 → 矿筛处理区 → 下沉转运区 → 出口接口 |
| 1 | 警戒漆分流站 | 警戒漆入口 → 分流阀阵列 → 旧维护侧线 → 汇流出口 |
| 2 | 热泉计时廊 | 冷端停靠区 → 热泉观察区 → 计时检修区 → 冷却出口 |
| 3 | 四号伪补给站 | 补给接驳区 → 空货架区 → 封条复核区 → 站后通道 |
| 4 | 永不停机的散热井 | 散热入口 → 叶轮观察区 → 切割检修区 → 井后转运区 |
| 5 | 井壁伴行廊 | 第一观察窗 → 第二观察窗 → 第三观察窗 → 井口停靠区 |
| 6 | D-9 无垢升降井 | 粗糙检修入口 → 驳船观察口 → 图案锁前室 → 洁净承压井 |

Themes and objective text differ across all seven levels. The escort level has no caches and accepts an unidentifiable silhouette as a valid observation. To satisfy the latest requirement that every level include physical item collection, index 5 includes one optional pickup, **脱落的传感器接头**, in sector 0 room 3 at local `[-3,-3]`. This evidence collectible supersedes the earlier no-supplies theme restriction while preserving no boxes: it grants a permanent inventory token, has no hidden monster or resource consumption, and is never required for progression. The clean shaft has no caches in its entrance, lock chamber or shaft; its single optional cache is at the outside barge. The fifth level's mandatory cutter is available before the corresponding terminal. D-9 records a fixed ring/cross/three-line sequence; this content layer records comparison, and does not implement an input puzzle or radio ending. Other caches provide optional collectibles only, not consumable supplies. Environmental records are optional. Optional-route estimates include optional pickups as well as caches and records.

## Honest duration model

`estimateExpeditionRoute(level, options?)` defaults to the mandatory route. Set `includeOptional:true` for the modeled route visiting all optional objects. The deterministic route planner finds a feasible breadth-first path between each ordered target using current prerequisites, opens each encountered door once, and performs real content interactions. This is not a globally shortest-path solver. Distances sum centre-to-centre travel and an object detour of `2*hypot(localX,localZ)`; returning to the centre after the exit slightly overestimates travel. Players can cut corners, order objectives differently and read while moving.

Defaults: speed **1.6 m/s**, **8 seconds per action**, **12 seconds of orientation per distinct visited room**. Actions include opening encountered doors, eight mandatory objectives, four terminals and exit. Time formula:

`minutes = (distanceMetres / speed + actions * secondsPerAction + uniqueRooms * secondsPerRoom) / 60`.

| Index | Mandatory model distance, rounded m | Mandatory model minutes | All-optional model minutes |
| --- | ---: | ---: | ---: |
| 0 | 1156 | 21.64 | 40.34 |
| 1 | 1380 | 22.64 | 55.96 |
| 2 | 1132 | 20.06 | 35.88 |
| 3 | 1252 | 22.64 | 40.00 |
| 4 | 1180 | 20.56 | 45.79 |
| 5 | 1588 | 27.48 | 38.97 |
| 6 | 1572 | 27.31 | 50.61 |

Thus 20–30 minutes is a first-visit mandatory-route **design estimate**, not a guaranteed minimum or measured playtest result. Door and observation seconds are assumptions about meaningful player actions, never enforced delays. Setting action and orientation seconds to zero gives roughly 12–17 minutes for this route; an expert may be faster through better routing. Completionist exploration can exceed 30 minutes. Runtime speed, inertia, camera readability and physical reach must be playtested before claiming actual duration. There are no forced idle waits or timed locks.

## Verification

Run `node --experimental-strip-types --test tools/expedition.test.ts` on Node 24, or `npx tsx --test tools/expedition.test.ts` where tsx is supported. Tests cover deterministic/fresh generation, distinct geometry, exact names, room/corridor clearance, boundary-gap doors, item containment, authored loops/branches, sector gate cuts, all 16 permutations of objective ordering per level, permanent grants, two-step caches, repeat/invalid interaction safety, save isolation and executable duration estimates. These are content/geometry-data checks, not browser rendering or actual driving acceptance.
