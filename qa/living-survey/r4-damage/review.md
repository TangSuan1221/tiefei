# R4 death / retreat diagnosis

Read-only production investigation, 2026-10-27. Metrics query/check PASS (43 metrics). No external API. Independent browser closed after diagnostics.

## Evidence and scope

- Fresh-blind 107→108 screenshots are **64.775 wall seconds apart**, confirmed by blind player; 1.8 seconds describes only the Space hold. No intermediate hull telemetry was recorded. Do not describe this incident as 64% damage in 1.8 seconds.
- `pure.json`: fresh survey creature simulation, both screenshot positions/headings, 120/60/30/20/4 Hz, 65 simulated seconds. Four 16% bites reduce 64% to zero at approximately 40 seconds. No frame-rate amplification found. These are stationary fixtures, not the original saved creature state.
- `browser.json`: actual loaded Three.js site, independent explicit pose/resource fixture. Normal site.tick in 0.05-second increments, normal hurt/push/collision calls. First bite interrupts lab viewing and returns to camera. Four bites at +10/+20/+30/+40 seconds. No browser errors. Full run clock, real wall-time HUD warning duration and original blind input are not reproduced.

## Confirmed defect: dynamic blocker can consume a legal submarine pose

At `[109.5,0,27.1]`, heading 131, a recoiling shade at `[117,-2,14]` leaves the submarine clear. Normal creature simulation returns it home. At +13.95 seconds its mode becomes idle at `[110,-1,26]`. `LivingCreatures.blockers()` suddenly returns `[106.4,-3.4,24.2]` to `[113.6,1.4,27.8]`, making the unchanged submarine pose invalid.

Normal `site.move(-0.1)` then fails. The damage shove also fails the clear test. In a diagnostic-only comparison, disabling creature blockers immediately makes the **same pose** clear and reverse succeeds, without changing any wall/cargo collider. The original blocker function is restored afterwards.

This demonstrates a real softlock in the retreat mechanics. It does not prove the blind run had identical creature timers; that snapshot is missing. It does explain how returning shade can prevent the instructed retreat after an otherwise legal approach.

## Minimal proposed production correction

For the survey profile only, omit shade's movement-blocker AABB; preserve legacy behavior, damage, cooldown, illumination retreat, walls, doors and cargo. This removes the dynamic encapsulation without making the player invulnerable or weakening the encounter. Then regress normal reverse/turn and bite timing at the two screenshot poses, including return-from-recoil. No production correction was made by this investigation.

The wind-up already emits directional passive-sonar advice on initial warning and each later wind-up. A separate real-time UI test is still needed to establish that it remains readable while the task/player UI changes. Changing the warning alone does not repair the demonstrated blocked retreat.

## Authorized fix and regression

Implemented the proposed survey-only early return in blockers(); no other production mechanics changed. `after-blocker-fix.json` records actual loaded-world return-to-idle after 14 seconds, legal pose before/after and successful reverse. Actual north wall remains blocking at Z14.85. Stationary attacks remain 16% at 10/20/30/40 seconds; legacy still has its blocker. TypeScript PASS. Original browser.json and pure.json retained unchanged as before evidence. Browser closed.

2026-10-27 continuation: current-source rerun also verifies 30 consecutive normal reverse moves (3 m beyond the initial 0.1 m) after return to idle. Every intermediate pose remains clear; final position [107.1604, 0, 25.0662]. Actual wall and unchanged attack cadence checks still pass, with no page errors. This remains an initial-state regression fixture, not a blind playthrough.
