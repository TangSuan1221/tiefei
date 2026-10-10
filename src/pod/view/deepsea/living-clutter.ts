import * as T from 'three';
import {Batcher, rng, type V3} from './living-build';
import {routeClear, spotClear, type DecalKind} from './living-decals';
import {lensMaterial, wearVariant, withStaticLights, type LivingMaterials} from './living-materials';
import type {LivingFlicker} from './living-atmosphere';
import {
  Kit, bench, cableSpool, chair, deadPlant, chandelierWreck, coatStand, conduitRun, crate, deskToppled, drum, extinguisher,
  fileStack, filingCabinet, monitorBank, pallet, shelving, vendingMachine, wallClock,
} from './living-props';
import {ribMids, type ShellBuild, type Side} from './living-shells';
import {FasciaSigns, LIVING_FONT, type FasciaTint} from './living-signage';
import {hang} from './living-wreck';

const PI = Math.PI;
const FACE: Record<Side, number> = {W: PI / 2, E: -PI / 2, N: 0, S: PI};
const NORMAL: Record<Side, V3> = {W: [1, 0, 0], E: [-1, 0, 0], N: [0, 0, 1], S: [0, 0, -1]};

export interface LivingAnchorLamp {
  id: string; space: string;
  /** Lens centre and its outward facing. */
  position: V3; facing: V3; color: 'red' | 'amber';
  flicker: LivingFlicker;
  /** Light source data for world.practicalLights (just in front of the lens, aimed out and down). */
  light: {position: V3; dir: V3; color: string; intensity: number; range: number};
  /** Own lens material when the fixture flickers (emissive animated by the world update). */
  lens?: T.MeshStandardMaterial; lensBase: number;
}
/** Visual-only emergency fixtures (not in LIVING_LIGHTS: gameplay lighting / lumen logic does not see them). */
export const LIVING_ANCHOR_LAMPS: LivingAnchorLamp[] = [];
const LAMP_LIGHT = {
  red: {color: '#d0402e', intensity: 7, range: 8},
  amber: {color: '#dd8a3c', intensity: 15, range: 13},
} as const;

/**
 * Foreground / midground / background dressing per space: kitbash services, personal items,
 * overturned furniture, wall paper decals and instanced debris. Visual only (no colliders);
 * anything taller than the floor band is placed with spotClear() so the pod route stays empty.
 */
export function buildClutter(m: LivingMaterials, shells: ShellBuild, screens: T.Material) {
  const B = (id: string) => shells.batches.get(id)!;
  const sc = (id: string) => shells.scatter.get(id)!;
  const onWall = shells.onWall, grime = shells.grime;
  const wallKit = (space: string, side: Side, along: number, y: number, o = 0) => Kit.at(B(space), onWall(space, side, along, y, o), FACE[side]);
  const floorY = (space: string) => ({A: -9, D: -60} as Record<string, number>)[space] ?? -3;
  let skipped = 0;
  const ownedMats: T.Material[] = [];
  /** Floor prop at p (y = floor) with footprint radius r and height h, only if it stays off the route. */
  const at = (space: string, p: V3, rotY: number, r: number, h: number, extra?: V3) => {
    if (!spotClear(p, r, h)) { skipped++; return null; }
    return Kit.at(B(space), p, rotY, extra);
  };
  const poster = (space: string, side: Side, along: number, y: number, kind: DecalKind, w: number, h: number, roll = 0) => {
    // Paper pinned flat to the panel face (lower panels stand 35 mm proud), with two tape strips.
    const o = y - h / 2 - floorY(space) < 1.4 ? .045 : .02;
    grime.wall(B(space), kind, onWall(space, side, along, y, o), NORMAL[side], w, h, roll);
    const k = wallKit(space, side, along, y, o + .001);
    for (const s of [-1, 1]) k.box([s * w * .38, h / 2 - .01, .002], [.08, .03, .002], m.paper, [0, 0, s * .3]);
  };
  LIVING_ANCHOR_LAMPS.length = 0;
  let fascia: FasciaSigns | null = null;
  const lamp = (id: string, space: string, side: Side, along: number, y: number, color: 'red' | 'amber', o = 0, flicker: LivingFlicker = 'steady', gain = 1) => {
    const k = wallKit(space, side, along, y, o);
    const shared = color === 'red' ? m.lampRed : m.lampAmber;
    const own = flicker === 'steady' ? undefined : color === 'red' ? lensMaterial('#ffb0a0', '#ff3a26', 3.6) : lensMaterial('#ffd29a', '#ff9628', 3.4);
    if (own) { own.name = `living.lamp-${id}`; ownedMats.push(own); }
    const lens = own ?? shared;
    k.rbox([0, 0, .03], [.3, .42, .06], m.frame, .02);
    k.cyl([0, 0, .1], .1, .11, .1, m.trim, 20, [PI / 2, 0, 0]);
    k.sphere([0, 0, .15], [.085, .085, .06], lens, 16);
    for (const a of [0, PI / 2]) k.ring([0, 0, .15], .1, .008, m.chrome, [0, a, 0], 20, PI);
    k.ring([0, 0, .15], .105, .01, m.chrome, [0, 0, 0], 20);
    k.rod([0, .21, .03], [0, .5, .03], .018, m.chrome, 8);
    const p = onWall(space, side, along, y, o + .15), n = NORMAL[side], L = LAMP_LIGHT[color];
    LIVING_ANCHOR_LAMPS.push({
      id, space, position: p, facing: n, color, flicker, lens: own, lensBase: own?.emissiveIntensity ?? 0,
      light: {position: [p[0] + n[0] * .3, p[1] - .05, p[2] + n[2] * .3], dir: [n[0] * .6, -.8, n[2] * .6], color: L.color, intensity: L.intensity * gain, range: L.range * Math.sqrt(gain)},
    });
  };
  const ledMats = (['#3cff6a', '#ff3a26', '#ffaa2a'] as const).map((c, i) => { const l = lensMaterial('#101410', c, i === 1 ? 7 : 5.5); l.name = `living.led-${i}`; ownedMats.push(l); return l; });
  const exitTex = (() => {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 100; const c = cv.getContext('2d');
    if (c) {
      c.fillStyle = '#0c7a34'; c.fillRect(0, 0, 256, 100); c.fillStyle = '#e8fff0';
      c.font = `bold 40px ${LIVING_FONT.sans}`; c.fillText('安全出口', 80, 52); c.font = `600 24px ${LIVING_FONT.cond}`; c.fillText('EXIT', 132, 86);
      c.beginPath(); c.arc(42, 22, 9, 0, 6.28); c.fill(); c.fillRect(34, 32, 14, 30); c.fillRect(20, 60, 12, 30); c.fillRect(48, 58, 12, 26); c.fillRect(48, 36, 22, 8);
    }
    const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; return t;
  })();
  const exitMat = lensMaterial('#0a2a14', '#ffffff', 1.5); exitMat.emissiveMap = exitTex; exitMat.map = exitTex; exitMat.name = 'living.exit-sign'; ownedMats.push(exitMat);
  /** Back-lit exit sign box over a door (kit at the wall face, +z out of the wall). */
  const exitSign = (k: Kit) => { k.box([0, 0, .04], [.6, .26, .08], m.frame); k.box([0, 0, .081], [.54, .21, .004], exitMat); k.rod([-.22, .13, .04], [-.22, .32, .04], .008, m.chrome, 4); k.rod([.22, .13, .04], [.22, .32, .04], .008, m.chrome, 4); };
  /** Wall service cabinet with a row of indicator LEDs (one red fault light). */
  const ledCabinet = (k: Kit, seed: number) => {
    const r = rng(seed * 71);
    k.box([0, .35, .09], [.5, .7, .18], m.steel); k.box([0, .35, .182], [.44, .62, .01], m.trim);
    for (let i = 0; i < 5; i++) k.cyl([-.16 + i * .08, .6, .19], .014, .014, .012, ledMats[i === 2 + (seed % 2) ? 1 : r() < .7 ? 0 : 2], 8, [PI / 2, 0, 0]);
    k.box([0, .3, .19], [.3, .14, .008], m.darkGlass); k.rod([0, .7, .09], [0, 1.3, .06], .02, m.pipe, 6);
  };
  /** Instanced litter along the walls of a space (band within `band` m of the walls). */
  const litter = (space: string, x0: number, x1: number, z0: number, z1: number, n: number, seed: number, band = 1.6) => {
    const r = rng(seed), y = floorY(space) + (space.startsWith('C') ? .03 : 0);
    for (let i = 0; i < n; i++) {
      let x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
      const e = r();
      if (e < .25) x = x0 + r() * band; else if (e < .5) x = x1 - r() * band; else if (e < .75) z = z0 + r() * band; else z = z1 - r() * band;
      const k = r(), yaw = r() * 6.28;
      if (k < .4) sc(space).put('paper', [x, y + .002, z], [(r() - .5) * .1, yaw, 0]);
      else if (k < .55) sc(space).put('can', [x, y + .033, z], [PI / 2, yaw, 0]);
      else if (k < .65) sc(space).put('cup', [x, y + .045, z], [r() < .5 ? PI / 2 : 0, yaw, 0]);
      else if (k < .8) sc(space).put('chunk', [x, y + .03, z], [r() * 3, yaw, r() * 3], [1 + r(), .5 + r() * .6, 1 + r()]);
      else if (k < .9) sc(space).put('shard', [x, y + .006, z], [(r() - .5) * .2, yaw, 0]);
      else sc(space).put('bottle', [x, y + .035, z], [PI / 2, yaw, 0]);
    }
  };
  /** Frame-number stencil plates on rib mids. */
  const frameNumbers = (space: string, side: Side, prefix: string, y: number, every = 2) => {
    ribMids(space, side).forEach((a, i) => { if (i % every === 0) shells.decals.add(`${prefix}-${String(i + 1).padStart(2, '0')}`, '', 'stencil', onWall(space, side, a, y, .02), NORMAL[side], 1.1); });
  };

  // ================================================================ corridors: services, numbers, litter, end anchors
  {
    // C1 (x 14..64, z 3..12): conduits between doors, extinguishers, sagging cables, end lamps.
    conduitRun(wallKit('C1', 'N', 27, -3), m, 8.6, 2.3, [-2.5, 2.8]);
    conduitRun(wallKit('C1', 'N', 45.5, -3), m, 8.4, 2.3, [1.2]);
    conduitRun(wallKit('C1', 'S', 44.5, -3), m, 7, 2.3, [-1.5]);
    conduitRun(wallKit('C1', 'S', 60.5, -3), m, 5.4, 2.3, [1.6]);
    extinguisher(wallKit('C1', 'N', 47.4, -3), m); extinguisher(wallKit('C1', 'S', 34.4, -3), m);
    frameNumbers('C1', 'N', 'C1', 1.4); frameNumbers('C1', 'S', 'C1', 1.4);
    poster('C1', 'N', 23.6, -.6, 'posterCalm', .62, .62); poster('C1', 'S', 46.6, -.55, 'posterSafety', .6, .6, .03);
    poster('C1', 'N', 54.2, -.7, 'posterSchedule', .55, .74, -.02);
    litter('C1', 14.5, 63.5, 3.4, 11.6, 70, 101, 1.4);
    lamp('C1-east', 'C1', 'E', 7.5, 2.75, 'amber', .14);
    lamp('C1-east-jamb-n', 'C1', 'E', 3.09, 1.2, 'red', .14, 'pulse'); lamp('C1-east-jamb-s', 'C1', 'E', 11.91, 1.2, 'red', .14, 'pulse');
    lamp('S-west', 'S', 'W', 10.4, .6, 'red', .02, 'flicker', 1.3);
    // C2 (x 68..77, z −40..−2)
    conduitRun(wallKit('C2', 'W', -15, -3), m, 7.4, 2.3, [-2]); conduitRun(wallKit('C2', 'E', -30.5, -3), m, 6.6, 2.3, [2]);
    extinguisher(wallKit('C2', 'W', -24.6, -3), m); frameNumbers('C2', 'W', 'C2', 1.4); frameNumbers('C2', 'E', 'C2', 1.4);
    poster('C2', 'E', -19.6, -.6, 'posterSafety', .6, .6);
    litter('C2', 68.4, 76.6, -39.6, -2.4, 50, 102, 1.3);
    lamp('C2-R3-end', 'R3', 'N', 69.5, 2.4, 'red', .03, 'pulse', 1.4);
    // C3 (x 82..120, z 3..12)
    conduitRun(wallKit('C3', 'N', 106, -3), m, 9, 2.3, [-3, 2]); conduitRun(wallKit('C3', 'S', 98, -3), m, 8, 2.3, [-2.8]);
    extinguisher(wallKit('C3', 'S', 90.2, -3), m); frameNumbers('C3', 'N', 'C3', 1.4); frameNumbers('C3', 'S', 'C3', 1.4);
    poster('C3', 'N', 91, -.6, 'posterCalm', .62, .62, .04);
    litter('C3', 82.4, 119.6, 3.4, 11.6, 60, 103, 1.4);
    lamp('C3-east', 'C3', 'E', 7.5, 2.75, 'amber', .14, 'flicker');
    lamp('C3-east-jamb-n', 'C3', 'E', 3.09, 1.2, 'red', .14); lamp('C3-east-jamb-s', 'C3', 'E', 11.91, 1.2, 'red', .14, 'dying');
    // C5 (x 124..133, z 22..42)
    conduitRun(wallKit('C5', 'W', 31, -3), m, 6, 2.3, [1.5]); extinguisher(wallKit('C5', 'E', 33.5, -3), m);
    frameNumbers('C5', 'W', 'C5', 1.4); frameNumbers('C5', 'E', 'C5', 1.4);
    litter('C5', 124.4, 132.6, 22.4, 41.6, 30, 105, 1.3);
    lamp('C5-south', 'C5', 'S', 128.5, 2.75, 'amber', .14);
    lamp('C5-south-jamb-w', 'C5', 'S', 124.09, 1.2, 'red', .14, 'pulse'); lamp('C5-south-jamb-e', 'C5', 'S', 132.91, 1.2, 'red', .14, 'pulse');
    // C7 → D and C4 → V sight-line anchors.
    lamp('C7-D-end', 'D', 'W', 68, 1.2, 'red', .03, 'pulse', 1.6);
    lamp('C4-V-end', 'V', 'N', 129.5, .5, 'amber', .03, 'flicker', .8);
    // Long sight lines (C2 → R3, C4 → V): small hot sources down the length instead of more exposure — a failing
    // amber bulkhead lamp mid-run, a red one at the end over a standing puddle, a lit exit sign over the far door
    // and a service cabinet with live indicator LEDs.
    lamp('C2-mid', 'C2', 'W', -34.4, 1.5, 'amber', .02, 'flicker', .7);
    lamp('C2-end', 'C2', 'E', -38.4, 2.1, 'red', .02, 'flicker', 1.2);
    lamp('C4-mid', 'C4', 'W', -12.6, 1.4, 'amber', .02, 'dying', .6);
    lamp('V-south', 'V', 'S', 137.6, .9, 'red', .03, 'flicker', 1.3);
    exitSign(wallKit('C2', 'N', 72.5, 2.62, .02)); exitSign(wallKit('C4', 'N', 130.5, 2.6, .02));
    ledCabinet(wallKit('C2', 'E', -21.6, -1.2, .02), 1); ledCabinet(wallKit('C4', 'E', -14.2, -1.0, .02), 2);
    ledCabinet(wallKit('V', 'S', 124.5, -1.1, .02), 3);
    grime.floor(B('C2'), 'puddle', [74.6, -3 + .006, -37.2], 3.2, 2.4, .3); grime.floor(B('C2'), 'puddle', [70.6, -3 + .006, -33.6], 2.4, 2, 1.1);
    grime.floor(B('C4'), 'puddle', [129.4, -3 + .006, -14.4], 2.6, 2.2, .7);
    // Vending machine (moved out of the R4 doorway) and a second, toppled one.
    const v = at('C3', [98.6, -3, 11.2], PI, .7, 2);
    if (v) vendingMachine(v, m, 7);
    const vt = at('C3', [84.5, -3, 10.6], PI / 2 + .2, 1, .9);
    if (vt) vendingMachine(vt.child([0, .425, .95], [-PI / 2, 0, 0]), m, 8, m.bandBlue);
    // Sagging loose cables off the C1/C3 cable trays (above the hull band, outside the lane).
    for (const [sp, x0, x1] of [['C1', 16, 62], ['C3', 84, 118]] as const) {
      const r = rng(x0), b = B(sp);
      for (let x = x0; x < x1; x += 5 + r() * 6) {
        const z = 11 + (r() - .5) * .3, sag = .3 + r() * .4, l = 2 + r() * 2;
        if (!routeClear(new T.Box3(new T.Vector3(x, 1.92 - sag - .03, z - .03), new T.Vector3(x + l, 1.95, z + .28)))) { skipped++; continue; }
        let prev: V3 = [x, 1.92, z];
        for (let t = 1; t <= 6; t++) { const u = t / 6, p: V3 = [x + l * u, 1.92 - Math.sin(u * PI) * sag, z + .25 * u]; b.rod(prev, p, .014, m.rubber, 6); prev = p; }
        hang(`${sp}-tray-cable-${x.toFixed(1)}`, sp, [x, 1.92, z], [x + l / 2, 1.92 - sag, z + .125], 'tray');
      }
    }
  }

  // ================================================================ R3 security office: counter, CCTV wall, spilled files
  {
    const b = B('R3');
    // Foreground: intake counter splitting the entry from the desks (west of the parking lane).
    const ctr = Kit.at(b, [63.2, -3, -43.2], 0);
    ctr.box([0, .55, 0], [8.6, 1.1, .7], m.steel); ctr.box([0, 1.13, .05], [8.8, .06, .85], m.veneer);
    for (let x = -4; x <= 4; x += 1.2) ctr.box([x, .55, .36], [.04, 1.0, .02], m.trim);
    ctr.rbox([2.4, 1.32, -.05], [.42, .34, .36], m.trim, .03); ctr.box([2.4, 1.32, .14], [.32, .24, .01], screens);
    ctr.box([-1.2, 1.17, .1], [.25, .02, .32], m.paper); ctr.box([-2.6, 1.2, -.1], [.3, .08, .22], m.rubber);
    for (let x = -4.2; x <= 4.2; x += 2.1) ctr.rod([x, 1.16, .32], [x, 2.1, .32], .02, m.chrome, 8);
    ctr.box([0, 2.1, .32], [8.6, .04, .04], m.chrome);
    ctr.box([-1.5, 1.62, .32], [5.4, .9, .012], m.glassSoft);
    // Midground: CCTV wall on the west side, filing bank with pulled drawers, toppled desk and chairs.
    monitorBank(wallKit('R3', 'W', -57.5, -3, .02), m, 5, 3, screens, 31);
    shells.atlas.add('监控中心 · 疗养区', 'CCTV  ·  SANATORIUM WING', 'cyan', onWall('R3', 'W', -57.5, 2.3, .06), [1, 0, 0], 2.4);
    const fb = wallKit('R3', 'E', -51, -3, .32);
    for (let i = 0; i < 5; i++) filingCabinet(fb.child([-1 + i * .5, 0, 0]), m, 4, i === 1 ? [.35, 0, .2, 0] : i === 3 ? [0, .45] : [], m.steel);
    const fallen = at('R3', [80.2, -3, -48.2], .5, .8, .5);
    if (fallen) filingCabinet(fallen.child([0, .31, 0], [-PI / 2, 0, 0]), m, 4, [.25]);
    const dt = at('R3', [60.8, -3, -60.5], 1.1, 1, .9); if (dt) deskToppled(dt, m);
    for (const [x, z, a, t] of [[65.2, -49.2, 2.2, [PI / 2, 0, 0]], [62.4, -58.5, .6, [0, 0, PI / 2]], [79.6, -55.5, 4, [PI / 2, 0, .3]]] as const) {
      const c = at('R3', [x, -3 + .22, z], a, .5, .9, t as unknown as V3); if (c) chair(c, m);
    }
    // Weapons lockers and evidence shelving on the east wall (far from the parking lane).
    const lockers = wallKit('R3', 'E', -56.5, -3, .3);
    for (let i = 0; i < 3; i++) {
      lockers.box([-.6 + i * .6, 1.05, 0], [.56, 2.1, .5], m.paintDark);
      const door = lockers.child([-.88 + i * .6, 1.05, .26], [0, i === 1 ? -1.9 : 0, 0]);
      door.box([.28, 0, 0], [.55, 2.05, .025], m.paintDark);
      for (let y = -.8; y < .9; y += .5) lockers.box([-.6 + i * .6, 1.05 + y, -.2], [.08, .3, .08], m.trim);
    }
    shelving(wallKit('R3', 'E', -47.5, -3, .55), m, 2.6, .5, 2.1, [.4, 1.0, 1.6], 33);
    // Background: clock stopped, evacuation map, roster memo, wall phone, conduit at frieze height.
    wallClock(wallKit('R3', 'N', 66, 2.3, .02), m, 4, 12);
    poster('R3', 'W', -45.4, -.3, 'map', 1.5, 1.0);
    poster('R3', 'S', 80, -.7, 'memo', .32, .42, .05);
    poster('R3', 'S', 82.4, -.6, 'posterSafety', .6, .6, -.04);
    const ph = wallKit('R3', 'S', 77.2, -3, .02); ph.rbox([0, 1.5, .05], [.2, .3, .1], m.trim, .02); ph.rbox([.02, 1.52, .12], [.06, .24, .05], m.rubber, .02);
    ph.rod([0, 1.36, .12], [-.1, .4, .25], .008, m.rubber, 5);
    conduitRun(wallKit('R3', 'W', -52, -3), m, 10, 3.6, [-3, 3]);
    conduitRun(wallKit('R3', 'N', 62, -3), m, 7, 3.6, [2]);
    // Ceiling cable loom torn down near the counter.
    let p: V3 = [65.5, 5, -44.5]; const cr = rng(77);
    for (let i = 0; i < 9; i++) { const n: V3 = [p[0] + (cr() - .5) * .3, p[1] - .55, p[2] + (cr() - .5) * .3]; b.rod(p, n, .03, m.rubber, 6); p = n; }
    hang('R3-cable-loom', 'R3', [65.5, 5, -44.5], p, 'ceiling');
    // Desk tops: binders, mugs, files (instanced).
    for (const [x, z] of [[62.5, -46], [62.5, -54]] as const) {
      sc('R3').put('binder', [x + .6, -3 + .77 + .15, z + .1], [0, .3, .25]);
      sc('R3').put('cup', [x - .7, -3 + .82, z - .2]);
      fileStack(Kit.at(b, [x - .2, -3 + .765, z - .25], .4), m, 4, x * 3 + z);
    }
    for (let i = 0; i < 26; i++) { const r2 = rng(300 + i); sc('R3').put('paper', [60 + r2() * 7, -2.997, -59 + r2() * 12], [(r2() - .5) * .08, r2() * 6, 0]); }
    for (let i = 0; i < 8; i++) { const r2 = rng(400 + i); sc('R3').put('binder', [78.5 + r2() * 5, -3 + .03, -50 + r2() * 4], [PI / 2, r2() * 6, 0]); }
    litter('R3', 58.4, 85.6, -65.6, -40.4, 40, 106, 2);
    // Midground west: cubicle partitions between the duty desks, one knocked flat.
    for (const [x, z, a, down] of [[64.4, -50, 0, false], [60.6, -50, 0, false], [66.3, -56.8, .3, true]] as const) {
      const pk = at('R3', [x, -3, z], a, 1.3, 1.5); if (!pk) continue;
      const pt = down ? pk.child([0, .03, 0], [-PI / 2, 0, 0]) : pk;
      pt.box([0, .72, 0], [2.4, 1.36, .05], m.padTeal); pt.box([0, 1.42, 0], [2.44, .05, .07], m.trim);
      for (const s of [-1, 1]) pt.box([s * 1.2, .72, 0], [.05, 1.42, .07], m.trim);
      if (!down) for (const s of [-1, 1]) pt.box([s * 1.1, .015, 0], [.06, .03, .5], m.trim);
    }
    // Fallen ceiling: a grid section and loose tiles on the floor, dangling hangers above.
    const fc = at('R3', [67.6, -3, -61.8], .4, 1.8, .4);
    if (fc) {
      const g = fc.child([0, .18, 0], [.12, 0, .2]);
      for (let i = -1; i <= 1; i++) { g.box([i * 1.2, 0, 0], [.03, .03, 2.4], m.chrome); g.box([0, 0, i * 1.2], [2.4, .03, .03], m.chrome); }
      for (const [x, z, a] of [[-.6, -.6, .1], [.65, .5, -.2], [1.4, -1.5, .7]] as const) fc.box([x, .02 + Math.abs(x) * .01, z], [1.18, .016, 1.18], m.ceiling, [0, a, .03]);
    }
    for (const [x, z] of [[66.8, -61.2], [68.4, -62.5], [69.1, -60.6]] as const) { b.rod([x, 5, z], [x + .05, 4.1 - (x % 1) * .6, z], .004, m.chrome, 4); hang(`R3-grid-hanger-${x}`, 'R3', [x, 5, z], [x + .05, 4.1 - (x % 1) * .6, z], 'ceiling'); }
    // Holding cell in the north-east corner: bar wall, cot, bucket.
    const cell = Kit.at(b, [80.5, -3, -40], 0);
    for (let x = 0; x <= 5.5; x += .16) if (x < 3.3 || x > 4.3) cell.rod([x, 0, -4.4], [x, 2.6, -4.4], .016, m.chrome, 8);
    for (const y of [.08, 1.2, 2.6]) cell.box([2.75, y, -4.4], [5.6, .06, .08], m.frame);
    const cd = cell.child([3.3, 0, -4.4], [0, -1.1, 0]);
    for (let x = .08; x < 1; x += .16) cd.rod([x, .05, 0], [x, 2.55, 0], .016, m.chrome, 8);
    cd.box([.5, 1.2, 0], [1, .06, .06], m.frame); cd.box([.5, .08, 0], [1, .06, .06], m.frame);
    cell.box([4.4, .42, -1.2], [1.8, .08, .75], m.steel); for (const sx of [-.8, .8]) cell.box([4.4 + sx, .2, -1.2], [.06, .4, .7], m.steel);
    cell.box([4.4, .5, -1.2], [1.7, .08, .66], m.corpseCloth);
    cell.cyl([1.1, .16, -.8], .14, .12, .32, m.steel, 16);
    shells.decals.add('拘留室 1', 'HOLDING 1', 'room', onWall('R3', 'N', 82.6, 2.5, .03), [0, 0, 1], .9);
    // Far south-east corner: evidence cage with tagged boxes, a radio desk and a duty board.
    const ev = Kit.at(b, [79.4, -3, -65.7], 0);
    if (spotClear([82.5, -3, -63.4], 3.2, 2.6)) {
      for (const x of [0, 6.2]) ev.box([x, 1.3, 4.6], [.06, 2.6, .06], m.frame);
      ev.box([3.1, 2.6, 4.6], [6.2, .06, .06], m.frame); ev.box([3.1, .05, 4.6], [6.2, .1, .06], m.frame);
      ev.box([0, 2.6, 2.3], [.06, .06, 4.6], m.frame);
      for (let x = .12; x < 6.2; x += .12) if (x < 3.6 || x > 4.6) ev.rod([x, .1, 4.6], [x, 2.6, 4.6], .004, m.chrome, 4);
      for (let z = .3; z < 4.6; z += .12) ev.rod([0, .1, z], [0, 2.6, z], .004, m.chrome, 4);
      const gate = ev.child([3.6, 0, 4.6], [0, .9, 0]);
      for (let x = .1; x < 1; x += .12) gate.rod([x, .1, 0], [x, 2.55, 0], .004, m.chrome, 4);
      gate.box([.5, 2.55, 0], [1, .05, .05], m.frame); gate.box([.5, .1, 0], [1, .05, .05], m.frame);
      shelving(ev.child([3.1, 0, .35]), m, 5.6, .5, 2.1, [.3, .9, 1.5], 35);
      const er = rng(36);
      for (const y of [.3, .9, 1.5]) for (let x = .6; x < 5.6; x += .55 + er() * .3) {
        if (er() < .2) continue;
        const s = .6 + er() * .5;
        crate(ev.child([x, y + .02, .35], [0, (er() - .5) * .3, 0]), m, [.42 * s, .28 * s, .36], er() < .5 ? m.paintCream : m.steel);
      }
      crate(ev.child([1.2, 0, 2.6], [0, .5, 0]), m, [.6, .4, .5], m.paintCream);
      crate(ev.child([1.3, .4, 2.55], [0, .2, 0]), m, [.45, .3, .4], m.paintCream);
      poster('R3', 'S', 77.2, .2, 'memo', .5, .7, .03);
    } else skipped++;
    const rd = at('R3', [76.6, -3, -65.2], 0, .9, 1.2);
    if (rd) {
      rd.box([0, .74, 0], [1.6, .05, .7], m.veneer); for (const [x, z] of [[-.75, -.3], [.75, -.3], [-.75, .3], [.75, .3]]) rd.box([x, .36, z], [.05, .72, .05], m.trim);
      rd.rbox([-.3, .92, -.05], [.62, .32, .34], m.paintDark, .02); rd.box([-.3, .94, .125], [.5, .18, .01], m.trim);
      for (let i = 0; i < 4; i++) rd.cyl([-.5 + i * .12, .86, .13], .02, .02, .03, m.chrome, 10, [PI / 2, 0, 0]);
      rd.rod([.2, 1.06, -.1], [.25, 1.8, -.2], .006, m.chrome, 4); rd.rbox([.45, .8, .1], [.1, .14, .06], m.rubber, .01);
    }
  }

  // ================================================================ R4 ballast stores: cages, drums, crates, chains
  {
    const b = B('R4');
    // Wire cage bay on the west wall with drums inside.
    const cg = Kit.at(b, [96.3, -3, 13], 0);
    for (const [x, z] of [[2.2, 0], [2.2, 5.6]] as const) cg.box([x, 1.3, z], [.06, 2.6, .06], m.frame);
    cg.box([2.2, 2.6, 2.8], [.06, .06, 5.6], m.frame); cg.box([2.2, .05, 2.8], [.06, .1, 5.6], m.frame);
    for (let z = .1; z < 5.6; z += .12) cg.rod([2.2, .1, z], [2.2, 2.6, z], .004, m.chrome, 4);
    for (let y = .2; y < 2.6; y += .12) cg.rod([2.2, y, 0], [2.2, y, 3.6], .004, m.chrome, 4);
    cg.box([2.2, 1.3, 4.6], [.04, 2.5, 1.0], m.frame, [0, -.6, 0]);
    for (const [x, z, mt] of [[.7, .7, m.bandYellow], [1.4, .9, m.bandBlue], [.8, 1.5, m.bandYellow], [.7, 3.2, m.bandRed]] as const) drum(cg.child([x, 0, z]), m, mt);
    shells.decals.add('BAY 1', '', 'stencilYellow', onWall('R4', 'W', 15.8, 0, .02), [1, 0, 0], 1.6);
    shells.decals.add('BAY 2', '', 'stencilYellow', onWall('R4', 'W', 24, 0, .02), [1, 0, 0], 1.6);
    shells.decals.add('BAY 3', '', 'stencilYellow', onWall('R4', 'W', 31.5, 0, .02), [1, 0, 0], 1.6);
    // Crate stacks and loose drums.
    const cs = at('R4', [117.6, -3, 21.5], .1, 1.2, 2.4);
    if (cs) { crate(cs, m, [1.2, 1, 1]); crate(cs.child([.05, 1, 0], [0, .2, 0]), m, [1.1, .9, .9]); crate(cs.child([-.1, 1.9, .05], [0, -.15, 0]), m, [.8, .5, .7], m.steel); }
    const cs2 = at('R4', [98.6, -3, 31], -.2, 1, 1.2); if (cs2) { crate(cs2, m, [1.1, .9, 1]); pallet(cs2.child([0, .9, 0], [0, .3, 0]), m); }
    for (const [x, z, mt, tip] of [[112.8, 14.6, m.bandBlue, false], [113.5, 15.3, m.bandYellow, false], [101.3, 34.6, m.bandRed, true]] as const) {
      const d = at('R4', [x, -3, z], x, .45, 1); if (!d) continue;
      drum(tip ? d.child([0, .29, 0], [0, 0, PI / 2]) : d, m, mt, !tip);
    }
    const sp = at('R4', [99.6, -3, 15.2], .4, .7, 1); if (sp) cableSpool(sp, m);
    // Overhead hoist beam with chains (well above the hull band).
    b.slab([96.5, 4.3, 19.85], [119.5, 4.52, 20.15], m.frame);
    for (const x of [100, 108.5, 116]) {
      b.box([x, 4.12, 20], [.4, .3, .35], m.bandYellow);
      for (let y = 3.95; y > 2.6; y -= .09) b.ring([x, y, 20], [y * 7 % 2 > 1 ? 1 : 0, 0, y * 7 % 2 > 1 ? 0 : 1], .035, .009, m.chrome, 8);
      b.box([x, 2.5, 20], [.1, .16, .05], m.chrome);
    }
    conduitRun(wallKit('R4', 'S', 101, -3), m, 6, 3.4, [2]);
    litter('R4', 96.4, 119.6, 12.4, 35.6, 50, 107, 1.8);
  }

  // ================================================================ R5 residence office: books, clock, photos, coat
  {
    const b = B('R5');
    // Bookcase on the south wall, one toppled bookcase with spilled books.
    const bk = wallKit('R5', 'S', 156.6, -3, .25);
    shelving(bk, m, 1.8, .4, 2.2, [.05, .5, 1.0, 1.5, 2.0], 51, false, m.veneer, m.veneer);
    const br = rng(52);
    const spines = [m.paintDark, m.corpseCloth, m.trim, m.bandRed, m.veneer, m.paintCream];
    for (const y of [.05, .5, 1.0, 1.5]) for (let x = -.82; x < .82; x += .065 + br() * .02) {
      if (br() < .12) continue;
      const tilt = br() < .1 ? .3 : 0, h = .24 + br() * .08;
      Kit.at(b, onWall('R5', 'S', 156.6 - x, -3 + y + .02 + h / 2, .3 + .2), PI, [0, 0, 0]).box([0, 0, 0], [.04, h, .2 + br() * .05], spines[(br() * spines.length) | 0], [0, 0, tilt]);
    }
    const tb = at('R5', [157.2, -3, 104.2], .35, 1.2, .5);
    if (tb) shelving(tb.child([0, .2, 0], [-PI / 2, 0, 0]), m, 1.8, .4, 2.2, [.05, .5, 1.0, 1.5, 2.0], 53, false, m.veneer, m.veneer);
    for (let i = 0; i < 30; i++) sc('R5').put(i % 3 ? 'book' : 'bookRed', [155.6 + br() * 3.4, -3 + .018 + (i % 4) * .036, 102.6 + br() * 2.6], [(br() - .5) * .3, br() * 6, (br() - .5) * .3]);
    // Clock behind the desk (stopped at the flood), framed photos, schedule and map.
    wallClock(wallKit('R5', 'S', 162, 1.8, .02), m, 4, 12);
    for (const [x, y, w, h] of [[164.4, .6, .3, .23], [165.2, .4, .24, .3], [170.2, .7, .3, .23]] as const) {
      const k = wallKit('R5', 'S', x, y, .02); k.box([0, 0, .015], [w + .06, h + .06, .03], m.veneer);
      grime.wall(b, 'photo', onWall('R5', 'S', x, y, .052), [0, 0, -1], w, h);
    }
    poster('R5', 'W', 98, .3, 'posterSchedule', .6, .8, .02);
    poster('R5', 'N', 154.5, .2, 'map', 1.3, .86);
    poster('R5', 'N', 170.5, .5, 'drawing', .45, .45, -.08);
    // Coat stand, water cooler, side cabinet with personal effects.
    const cst = at('R5', [172.7, -3, 106.7], 0, .35, 1.9); if (cst) coatStand(cst, m, m.corpseCloth);
    const wc = wallKit('R5', 'W', 88.9, -3, .3);
    wc.rbox([0, .5, 0], [.36, 1.0, .36], m.plastic, .03); wc.cyl([0, 1.2, 0], .14, .14, .4, m.glassSoft, 18); wc.box([.0, .85, .19], [.08, .05, .04], m.bandBlue);
    const cab = wallKit('R5', 'E', 90, -3, .02);
    cab.box([0, .45, .25], [1.2, .9, .5], m.steel); for (const x of [-.3, .3]) cab.box([x, .45, .505], [.56, .84, .01], m.steel);
    cab.cyl([-.35, .95, .25], .045, .035, .1, m.porcelain, 12); cab.box([.1, .92, .2], [.24, .03, .3], m.paper);
    cab.box([.38, .91, .3], [.14, .02, .05], m.rubber); cab.rbox([.3, 1.0, .1], [.18, .2, .03], m.veneer, .01);
    // Fallen ceiling fan near the sofa (floor only, outside every photo sight line).
    const fan = Kit.at(b, [155.6, -3, 97.6], .7);
    fan.cyl([0, .06, 0], .12, .14, .12, m.brass, 20);
    for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2; fan.box([Math.cos(a) * .45, .03 + (i === 2 ? .08 : 0), Math.sin(a) * .45], [.7, .012, .14], m.veneer, [0, -a, i === 2 ? .2 : 0]); }
    fan.rod([0, .1, 0], [.6, .1, .9], .012, m.chrome, 6);
    conduitRun(wallKit('R5', 'E', 104.5, -3), m, 6, 3.6, [-1.5]);
    for (let i = 0; i < 12; i++) sc('R5').put('binder', [151 + br() * 3, -3 + .03, 93.5 + br() * 3], [PI / 2, br() * 6, 0]);
    litter('R5', 150.4, 173.6, 86.4, 107.6, 30, 108, 1.4);
    // North wall: archive cabinets (one drawer hanging open), boxed files on top.
    const ac = wallKit('R5', 'N', 168.5, -3, .32);
    for (let i = 0; i < 4; i++) filingCabinet(ac.child([-.75 + i * .5, 0, 0]), m, 4, i === 2 ? [0, .3] : [], m.paintCream);
    for (const [x, s] of [[-.6, .9], [.2, 1.1], [.7, .8]] as const) crate(ac.child([x, 1.33, 0], [0, x, 0]), m, [.4 * s, .26, .32], m.paintCream);
    // Overturned visitor chairs and a dead plant by the entry; rolled rug against the west wall.
    for (const [x, z, a, t] of [[158.8, 89.2, .7, [PI / 2, 0, 0]], [170.4, 101.6, 2.4, [0, 0, PI / 2]]] as const) {
      const c = at('R5', [x, -3 + .22, z], a, .5, .9, t as unknown as V3); if (c) chair(c, m);
    }
    const rug = at('R5', [151.2, -3, 101], 0, .4, .4);
    if (rug) { rug.cyl([0, .17, 0], .17, .17, 2.6, m.carpetRed, 18, [PI / 2, 0, 0]); rug.cyl([0, .17, 1.31], .06, .06, .02, m.carpet, 12, [PI / 2, 0, 0]); }
    const safe = wallKit('R5', 'E', 98.5, -3, .4);
    safe.rbox([0, .45, 0], [.7, .9, .65], m.paintDark, .03); safe.cyl([0, .55, .34], .08, .08, .04, m.chrome, 20, [PI / 2, 0, 0]);
    safe.rod([.2, .3, .33], [.2, .6, .33], .015, m.chrome, 8);
    // West wall: residents' pigeonholes (uncollected mail) and a waiting sofa by the entry.
    const kc = wallKit('R5', 'W', 96.2, -3, .02), kr = rng(54);
    kc.box([0, 1.4, .17], [2.4, 1.6, .02], m.veneer, [0, 0, 0]); kc.box([0, 1.4, .02], [2.4, 1.6, .04], m.paintDark);
    for (let c = 0; c <= 10; c++) kc.box([-1.2 + c * .24, 1.4, .18], [.02, 1.6, .32], m.veneer);
    for (let r = 0; r <= 6; r++) kc.box([0, .6 + r * 1.6 / 6, .18], [2.42, .02, .32], m.veneer);
    kc.box([0, .55, .2], [2.5, .08, .4], m.veneer);
    for (let r = 0; r < 6; r++) for (let c = 0; c < 10; c++) {
      const x = -1.08 + c * .24, y = .62 + r * 1.6 / 6;
      kc.box([x, y + .23, .345], [.1, .025, .004], m.paper);
      if (kr() < .55) kc.box([x + (kr() - .5) * .05, y + .06, .2], [.19, .09 + kr() * .05, .22], m.paper, [0, (kr() - .5) * .3, (kr() - .5) * .15]);
    }
    lamp('R5-west', 'R5', 'W', 101.5, 1.6, 'amber', .02, 'flicker', .7);
    for (let i = 0; i < 9; i++) sc('R5').put('can', [150.6 + kr() * .9, -3 + .01, 95.2 + kr() * 2], [PI / 2, kr() * 6, 0], [.3, .3, .3]);
    const so = wallKit('R5', 'N', 153.2, -3, .1);
    so.box([0, .22, .45], [2.1, .32, .8], m.trim); so.box([0, .46, .47], [2.0, .16, .74], m.padTeal);
    so.box([0, .7, .1], [2.0, .5, .2], m.padTeal, [-.12, 0, 0]);
    for (const s of [-1, 1]) so.box([s * 1.02, .52, .45], [.16, .5, .84], m.padTeal);
    so.box([.4, .58, .5], [.7, .14, .5], m.corpseCloth, [.1, .3, .05]);
    const ct = at('R5', [153.4, -3, 88.6], .2, .7, .5);
    if (ct) { ct.box([0, .42, 0], [1.1, .04, .6], m.veneer); for (const [x, z] of [[-.5, -.25], [.5, -.25], [-.5, .25], [.5, .25]]) ct.box([x, .2, z], [.04, .4, .04], m.trim); ct.box([.1, .45, .05], [.3, .02, .22], m.paper, [0, .4, 0]); }
    const pl = at('R5', [151, -3, 87], 0, .4, 1.3);
    if (pl) { pl.cyl([0, .22, 0], .2, .16, .44, m.porcelain, 16); for (let i = 0; i < 5; i++) pl.rod([0, .4, 0], [Math.cos(i * 1.3) * .3, .9 + i * .08, Math.sin(i * 1.3) * .3], .008, m.veneer, 4); }
  }

  // ================================================================ A atrium: fallen chandelier, trolleys, menu boards, debris
  {
    const b = B('A');
    fascia = new FasciaSigns(b);
    chandelierWreck(Kit.at(b, [172, -9, 61.5], .4), m, 61, 2.2);
    sc('A').put('chunk', [170.2, -8.95, 59.4], [1, 2, .3], [3, 1.5, 2.5]);
    // Trolleys (one toppled), A-frame menu boards, collapsed balcony railing.
    b.detail(40, () => {
    for (const [x, z, a, top] of [[130, 60, .4, false], [181, 63, 2.1, true], [146, 76.5, 1.2, false]] as const) {
      const t = Kit.at(b, [x, -9, z], a);
      const k = top ? t.child([0, .35, 0], [0, 0, PI / 2]) : t;
      for (const [px, pz] of [[-.4, -.25], [.4, -.25], [-.4, .25], [.4, .25]]) { k.rod([px, .08, pz], [px, 1.0, pz], .012, m.chrome, 6); k.sphere([px, .05, pz], [.05, .05, .05], m.rubber, 8); }
      for (const y of [.25, .6, .95]) k.box([0, y, 0], [.9, .02, .6], m.chrome);
      k.cyl([.2, .99, .05], .1, .09, .06, m.porcelain, 14); k.cyl([-.2, .64, 0], .07, .07, .1, m.porcelain, 12);
    }
    for (const [x, z, a] of [[122, 56, .3], [189.5, 70, 2.7]] as const) {
      const f = Kit.at(b, [x, -9, z], a);
      f.box([0, .65, .2], [.6, 1.3, .03], m.trim, [-.28, 0, 0]); f.box([0, .65, -.2], [.6, 1.3, .03], m.trim, [.28, 0, 0]);
      f.box([0, .72, .225], [.5, .8, .005], m.porcelain, [-.28, 0, 0]);
    }
    for (const [x0, z0, x1, z1] of [[148, 79.4, 153.5, 78.6], [194.6, 64, 195.4, 69.5]] as const) {
      b.rod([x0, -8.95, z0], [x1, -8.6, z1], .03, m.chrome, 8); b.rod([x0, -8.6, z0 + .2], [x1, -8.95, z1 + .2], .03, m.chrome, 8);
      for (let t = 0; t <= 1; t += .2) b.rod([x0 + (x1 - x0) * t, -8.97, z0 + (z1 - z0) * t], [x0 + (x1 - x0) * t, -8.6, z0 + (z1 - z0) * t + .2], .018, m.chrome, 6);
    }
    });
    // Rubble under the balconies, cables hanging from the balcony soffit.
    const r = rng(909);
    for (let i = 0; i < 90; i++) {
      const side = r(); let x: number, z: number;
      if (side < .3) { x = 111 + r() * 3; z = 43 + r() * 38; } else if (side < .6) { x = 196 + r() * 3.5; z = 43 + r() * 38; }
      else if (side < .8) { x = 111 + r() * 88; z = 43 + r() * 3; } else { x = 111 + r() * 88; z = 78 + r() * 3.5; }
      sc('A').put(r() < .7 ? 'chunk' : 'tile', [x, -8.97, z], [r() * 3, r() * 6, r() * 3], [1 + r() * 2, .6 + r(), 1 + r() * 2]);
    }
    b.detail(40, () => {
      for (let i = 0; i < 14; i++) {
        const x = 114 + r() * 82, z = r() < .5 ? 45.6 : 78.4, len = 2 + r() * 4;
        const p0: V3 = [x, -.25, z];
        if (!spotClear([x, -.25 - len, z], .1, len)) { skipped++; continue; }
        let prev = p0; for (let t = 1; t <= 4; t++) { const p: V3 = [x + (r() - .5) * .3, -.25 - len * t / 4, z + (r() - .5) * .3]; b.rod(prev, p, .02, m.rubber, 6); prev = p; }
        hang(`A-soffit-cable-${i}`, 'A', p0, prev, 'balcony');
      }
    });
    // Ground-floor arcade: shopfronts between the balcony columns (dark display glass, half-dropped
    // shutters, enamel fascia names). A few emergency lamps over the doors survive as far anchors.
    const shop = (side: 'N' | 'S', x: number, w: number, cn: string, en: string, shutter: number, tint: FasciaTint = 'amber', life = .5) => {
      const k = wallKit('A', side, x, -9, .05);
      for (const s of [-1, 1]) k.box([s * w / 2, 2.4, .16], [.4, 4.8, .32], m.paintDark);
      k.box([0, 4.85, .22], [w + .4, .9, .44], m.paintDark); k.box([0, 4.37, .45], [w + .4, .06, .06], m.chrome);
      const dw = 1.7, pw = (w - dw - .4) / 2;
      for (const s of [-1, 1]) {
        const cx = s * (dw / 2 + .1 + pw / 2);
        k.box([cx, .35, .12], [pw, .7, .22], m.paintCream); k.box([cx, .72, .14], [pw + .04, .05, .26], m.chrome);
        k.box([cx, 2.35, .1], [pw, 3.2, .02], m.darkGlass); k.box([cx, 3.97, .14], [pw + .04, .06, .26], m.chrome);
        k.box([cx, 2.35, .13], [.05, 3.2, .05], m.frame);
      }
      for (const s of [-1, 1]) k.box([s * (dw / 2 + .05), 2, .14], [.1, 4, .24], m.frame);
      k.box([0, 4, .14], [dw + .2, .1, .24], m.frame); k.box([0, 1.6, .02], [dw, 3.2, .02], m.paintDark);
      for (let y = 3.9; y > 3.9 - shutter; y -= .12) k.box([0, y, .2], [dw - .04, .1, .025], m.steel);
      k.box([0, 3.9 - shutter, .21], [dw - .02, .05, .05], m.trim);
      fascia!.add(cn, en, tint, onWall('A', side, x, -9 + 4.85, .05 + .455), NORMAL[side], Math.min(w - .6, 4.2), life, (x * 13 + (side === 'N' ? 1 : 7)) | 0);
      if (life < .45) return;
      // Surviving tubes spill onto the shopfront; the better-kept shops still have a lamp on inside the glass.
      const n = NORMAL[side], p = onWall('A', side, x, -9 + 4.4, 1.1), col = {amber: '#ff9d3c', cyan: '#5fe0d2', red: '#ff4a36'}[tint];
      LIVING_ANCHOR_LAMPS.push({
        id: `A-fascia-${x}`, space: 'A', position: onWall('A', side, x, -9 + 4.85, .52), facing: n, color: 'red', flicker: life > .6 ? 'steady' : 'flicker',
        light: {position: p, dir: [n[0] * .5, -.85, n[2] * .5], color: col, intensity: 2.6 * life, range: 7}, lensBase: 0,
      });
      if (life < .6) return;
      // A lamp left on inside: a dim glow through the grimy display glass, brighter low down.
      const glow = new T.MeshStandardMaterial({color: '#050605', emissive: tint === 'cyan' ? '#1a4640' : '#4a2a10', emissiveIntensity: .9, roughness: .3, transparent: true, opacity: .9, depthWrite: false});
      glow.name = `living.shop-interior-${x}`; ownedMats.push(withStaticLights(glow));
      for (const s of [-1, 1]) k.box([s * (dw / 2 + .1 + pw / 2), 2.0, .113], [pw - .1, 2.4, .004], glow);
    };
    shop('N', 145.5, 7.2, '理发 · 洗浴', 'BARBER  ·  BATHS', 2.6, 'cyan', .45);
    shop('N', 154.5, 7.2, '居民小卖部', 'RESIDENTS STORE', 1.1, 'amber', .7);
    shop('N', 163.5, 7.2, '图书阅览', 'READING ROOM', 3.6, 'cyan', .12);
    shop('N', 172.5, 7.2, '医务站', 'INFIRMARY', .5, 'red', .6);
    shop('S', 118.5, 7.2, '邮件收发', 'MAIL ROOM', 3.0, 'amber', .5);
    shop('S', 127.5, 7.2, '洗衣代收', 'LAUNDRY DESK', 1.8, 'cyan', .35);
    shop('S', 181.5, 7.2, '员工食堂', 'CANTEEN', 3.9, 'amber', .65);
    shop('S', 190.5, 7.2, '行李寄存', 'LUGGAGE STORE', 2.2, 'red', .08);
    lamp('A-canteen', 'A', 'S', 186, -3.25, 'amber', .06, 'pulse');
    lamp('A-E-deck', 'A', 'E', 66, 2.6, 'amber', .06, 'steady', .9);
    // Arcade lamps under the south balcony: the colonnade rhythm across the hall (one dead, one dying).
    lamp('A-S-arcade-1', 'A', 'S', 150, -1.3, 'amber', .06, 'dying', .8);
    lamp('A-S-arcade-2', 'A', 'S', 172.5, -1.3, 'amber', .06, 'steady', .7);
    lamp('A-S-arcade-3', 'A', 'S', 195, -1.3, 'red', .06, 'flicker', 1.2);
    lamp('A-store', 'A', 'N', 154.5, -3.25, 'amber', .06);
    lamp('A-infirmary', 'A', 'N', 172.5, -3.25, 'amber', .06, 'dying');
    lamp('A-mail', 'A', 'S', 123, -3.25, 'amber', .06, 'flicker', .9);
    lamp('A-east', 'A', 'E', 55.5, -5, 'red', .06, 'pulse', 1.3);
    lamp('A-C7-jamb-n', 'A', 'W', 63.6, 1.2, 'red', .14, 'pulse'); lamp('A-C7-jamb-s', 'A', 'W', 72.4, 1.2, 'red', .14, 'pulse');
    lamp('A-N-deck', 'A', 'N', 170, 2.6, 'amber', .06, 'pulse', .8);
    lamp('A-S-upper', 'A', 'S', 140, 8, 'amber', .06, 'steady', .8);

    // ---- Hall midground (floor band below y −2.75 stays clear of the pod's balcony-level route).
    const ra = rng(4711);
    // Riveted octagonal advertising columns: posters on every face, a cap lamp as a far anchor.
    const column = (x: number, z: number, rot: number, capColor: string, capLight: string, flicker: LivingFlicker, kinds: DecalKind[]) => {
      const k = at('A', [x, -9, z], rot, 1, 5.2); if (!k) return;
      const R = .72, ap = R * Math.cos(PI / 8), face = 2 * R * Math.sin(PI / 8);
      k.cyl([0, .22, 0], .9, .95, .44, m.frame, 8, [0, PI / 8, 0]);
      k.cyl([0, 2.3, 0], R, R, 3.8, m.indGreen, 8, [0, PI / 8, 0]);
      for (const y of [.5, 2.3, 4.15]) k.cyl([0, y, 0], R + .04, R + .04, .08, m.trim, 8, [0, PI / 8, 0]);
      k.cyl([0, 4.32, 0], .95, .82, .26, m.frame, 8, [0, PI / 8, 0]);
      k.sphere([0, 4.45, 0], [.8, .55, .8], m.indGreen, 8);
      k.rod([0, 4.9, 0], [0, 5.15, 0], .05, m.brass, 6);
      for (let i = 0; i < 8; i++) {
        const a = rot + i * PI / 4, n: V3 = [Math.sin(a), 0, Math.cos(a)];
        const aspect: Partial<Record<DecalKind, number>> = {posterSchedule: 1.33, map: .67};
        for (const [j, y] of [1.15, 1.85, 2.75, 3.5].entries()) {
          const kind = kinds[(i + j * 3) % kinds.length];
          if (ra() < .25) continue;
          const pw = face * .92;
          grime.wall(b, kind, [x + n[0] * (ap + .006 + j * .001), -9 + y + (ra() - .5) * .08, z + n[2] * (ap + .006 + j * .001)], n, pw, pw * (aspect[kind] ?? 1), (ra() - .5) * .08);
        }
        if (ra() < .5) grime.wall(b, 'rust', [x + n[0] * (ap + .008), -9 + 2.6, z + n[2] * (ap + .008)], n, face * .5, 3.4);
      }
      const lens = lensMaterial(capColor, capLight, 2); lens.name = `living.column-cap-${x | 0}`; ownedMats.push(lens);
      k.sphere([0, 5.0, 0], [.1, .08, .1], lens, 12);
      LIVING_ANCHOR_LAMPS.push({
        id: `A-column-${x | 0}`, space: 'A', position: [x, -9 + 5, z], facing: [0, -1, 0], color: 'red', flicker, lens, lensBase: 2,
        light: {position: [x, -9 + 5.3, z], dir: [0, -1, 0], color: capLight, intensity: 4, range: 8},
      });
    };
    column(133.5, 62.5, .2, '#ffd8a8', '#ffa850', 'dying', ['posterCalm', 'posterSchedule', 'map', 'posterSafety']);
    column(177, 59.5, -.3, '#cdeeea', '#7fd6cc', 'steady', ['posterSafety', 'posterCalm', 'posterSchedule', 'drawing']);
    column(119, 66.5, .6, '#ffd8a8', '#ff9a40', 'pulse', ['map', 'posterCalm', 'posterSafety']);
    // Benches that ringed the fountain, thrown over by the flood.
    b.detail(45, () => {
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * PI * 2 + .3, rr = 7.4 + ra() * .8, x = 155 + Math.cos(a) * rr, z = 62 + Math.sin(a) * rr;
      if (Math.hypot(x - 154.3, z - 70.8) < 3.2) { ra(); ra(); ra(); continue; }
      const tipped = ra() < .55, k = at('A', [x, -9, z], -a + PI / 2 + (ra() - .5) * .6, 1.4, 1.2, tipped ? [ra() < .5 ? PI / 2 : -PI / 2, 0, 0] : undefined);
      if (k) bench(tipped ? k.child([0, .24, 0]) : k, m, 2.4);
    }
    // Long concrete planter troughs with dead shrubs (midground masses between the terrace bays).
    for (const [x, z, rot] of [[145.5, 55.5, 0], [165, 69, 0], [191, 52.5, PI / 2], [120.5, 75.5, 0], [185.5, 74.5, .0]] as const) {
      const k = at('A', [x, -9, z], rot, 2, 2.5); if (!k) continue;
      k.box([0, .42, 0], [3.4, .84, 1.1], m.concrete); k.box([0, .86, 0], [3.5, .06, 1.2], m.trim); k.box([0, .8, 0], [3.2, .06, .9], m.soil);
      for (const s of [-1, 0, 1]) deadPlant(k.child([s * 1.05, .84, 0], [0, ra() * 6, 0]), m, (x * 7 + s * 13) | 0, .7);
      if (ra() < .6) grime.floor(b, 'silt', [x + (ra() - .5) * 2, -9, z + (ra() - .5) * 2], 3.5, 3, ra() * 6);
    }
    });
    // Fallen skylight ribs and their glass, under the lantern: one leans on the fountain rim.
    for (const [x0, z0, x1, z1, y1] of [[149.5, 55.5, 142.5, 51.2, -8.75], [161, 69.5, 167.8, 75.5, -8.8], [158.5, 56.4, 163.2, 54.6, -7.95], [147.2, 66.2, 145.1, 72.4, -8.8]] as const) {
      const lo: V3 = [x0, -8.88, z0], hi: V3 = [x1, y1, z1];
      if (!spotClear([(x0 + x1) / 2, -9, (z0 + z1) / 2], Math.hypot(x1 - x0, z1 - z0) / 2 + .3, 1.4)) { skipped++; continue; }
      b.rod(lo, hi, .12, m.frame, 6);
      const d = [x1 - x0, z1 - z0], len = Math.hypot(d[0], d[1]);
      for (let t = .15; t < .95; t += .2) {
        const px = x0 + d[0] * t, pz = z0 + d[1] * t, py = -8.88 + (y1 + 8.88) * t;
        b.rod([px, py, pz], [px - d[1] / len * .9, -8.95, pz + d[0] / len * .9], .045, m.frame, 5);
      }
      for (let i = 0; i < 14; i++) sc('A').put('shard', [x0 + d[0] * ra() + (ra() - .5) * 2.4, -8.99, z0 + d[1] * ra() + (ra() - .5) * 2.4], [(ra() - .5) * .3, ra() * 6, 0], [1.5 + ra() * 2, 1, 1.5 + ra() * 2]);
    }
    // Silt drifts banked against the walls and in the corners.
    const silt = wearVariant(m.concrete, {silt: 1, grime: .2, bio: .55, floorY: -9}, ownedMats);
    silt.color.set('#6f6a5c');
    for (const [x, z, sx, sz, sy] of [[114, 45, 3.2, 2.4, .45], [197.5, 79.6, 2.6, 2.4, .5], [112.6, 77.5, 2.2, 3.6, .38], [151, 80.4, 4.2, 1.6, .3],
      [131, 43.6, 3.6, 1.5, .32], [196.4, 51.5, 1.8, 4.2, .4], [183, 80.6, 3, 1.4, .28], [112.2, 56, 1.6, 3.2, .3]] as const) {
      const k = at('A', [x, -9, z], 0, Math.max(sx, sz), sy + .1); if (!k) continue;
      k.sphere([0, 0, 0], [sx, sy, sz], silt, 14, [0, ra() * 6, 0]);
      k.sphere([sx * .45, 0, sz * .3], [sx * .5, sy * .7, sz * .55], silt, 10, [0, ra() * 6, 0]);
    }
    // Gel crusts creeping out from gate F (the sanatorium side): glossy, translucent-looking lumps.
    const gel = new T.MeshPhysicalMaterial({color: '#2f3a28', roughness: .28, metalness: 0, clearcoat: 1, clearcoatRoughness: .06, sheen: .6, sheenColor: new T.Color('#86a07e'), emissive: '#0e170e', emissiveIntensity: .25});
    gel.name = 'living.atrium-gel'; ownedMats.push(withStaticLights(gel));
    const blob = (p: V3, s: V3, seed: number) => {
      const g = new T.IcosahedronGeometry(1, 3), pos = g.getAttribute('position'), rr = rng(seed);
      const bumps = Array.from({length: 5}, () => [rr() * 2 - 1, rr() * 2 - 1, rr() * 2 - 1, .1 + rr() * .2]);
      for (let i = 0; i < pos.count; i++) {
        const v = new T.Vector3().fromBufferAttribute(pos, i); let d = 1;
        for (const [bx, by, bz, a] of bumps) d += a * Math.max(0, v.x * bx + v.y * by + v.z * bz) ** 3;
        v.multiplyScalar(d); if (v.y < -.2) v.y = -.2; pos.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals();
      Kit.at(b, p, rr() * 6).geo(g, gel, [0, 0, 0], undefined, s);
    };
    b.detail(45, () => {
      for (const [x, z, s, h] of [[185.6, 43.2, 1.3, .4], [187.4, 44.6, .9, .3], [190.8, 43.4, 1.6, .55], [192.6, 45.4, .8, .25], [183.2, 44.2, .7, .2], [188.9, 46.6, .6, .18]] as const) {
        if (spotClear([x, -9, z], s, h + .3)) blob([x, -9 + h * .2, z], [s, h, s * .8], (x * 31 + z) | 0); else skipped++;
      }
      for (const [x, y, w, h] of [[184.3, -7.6, .35, 1.5], [191.7, -7.2, .45, 2.1], [193.4, -8, .3, 1]] as const) blob([x, y, 42.12], [w, h, .12], (x * 17) | 0);
    });
    // Amber floor guide lamps: fountain → C7 (shaft access, west) and fountain → C6 (office, south). Some dead.
    const guide = (pts: V3[], seed: number) => {
      const rg = rng(seed);
      for (let i = 0; i + 1 < pts.length; i++) {
        const [a, c] = [pts[i], pts[i + 1]], n = Math.max(1, Math.round(Math.hypot(c[0] - a[0], c[2] - a[2]) / 2.6));
        for (let j = 0; j < n; j++) {
          const t = j / n, x = a[0] + (c[0] - a[0]) * t, z = a[2] + (c[2] - a[2]) * t;
          const k = Kit.at(b, [x, -9, z], Math.atan2(c[0] - a[0], c[2] - a[2]));
          k.cyl([0, .006, 0], .16, .17, .012, m.brass, 12);
          k.box([0, .014, 0], [.09, .01, .2], rg() < .28 ? m.lampOff : m.lampAmber);
        }
      }
    };
    guide([[149, -9, 63.5], [130, -9, 66.5], [113.4, -9, 68]], 31);
    guide([[157.5, -9, 67.6], [160.2, -9, 74], [162, -9, 79.6]], 32);
    // Light boxes over the two onward doors (wayfinding anchors that survive at hall distance).
    for (const [side, along, y, cn, en, n] of [['W', 68, 4.4, '竖井通道 C7', 'SHAFT ACCESS  ·  C7 → D', [1, 0, 0]], ['S', 162, 4.4, '管理处 C6', 'RESIDENCE OFFICE  ·  C6', [0, 0, -1]]] as const) {
      const p = onWall('A', side, along, y, .14);
      if (spotClear([p[0], y - .45, p[2]], 1.6, .9)) shells.atlas.add(cn, en, 'cyan', p, n as unknown as V3, 3.2); else skipped++;
    }
    // Cold rim strips under the balcony fascias (gapped, some dead): the far hall reads as layered decks.
    for (const y of [-.62, 5.38]) {
      const runs: [V3, V3][] = [[[114, y, 45.56], [196, y, 45.56]], [[114, y, 78.44], [196, y, 78.44]], [[113.44, y, 46], [113.44, y, 78]], [[196.56, y, 46], [196.56, y, 78]]];
      for (const [a, c] of runs) {
        const len = Math.hypot(c[0] - a[0], c[2] - a[2]), along = c[0] !== a[0];
        for (let s = 0; s + 2.4 < len; s += 4.1) {
          if (ra() < .3) continue;
          const t = (s + 1.2) / len, p: V3 = [a[0] + (c[0] - a[0]) * t, y, a[2] + (c[2] - a[2]) * t];
          if (!spotClear(p, 1.3, .2)) continue;
          const dead = ra() < .25;
          // Batten housing with a diffuser lip, two drop brackets to the soffit and a feed cable.
          const L = along ? [2.36, 0, 0] : [0, 0, 2.36], ax = along ? 0 : 2, sz = (l: number, h: number, d: number): V3 => along ? [l, h, d] : [d, h, l];
          b.box([p[0], y + .035, p[2]], sz(2.36, .09, .13), m.trim, {shadow: false});
          for (const s of [-1, 1]) b.box([p[0] + s * (L[0] / 2 - .02), y + .035, p[2] + s * (L[2] / 2 - .02)], sz(.025, .11, .15), m.frame, {shadow: false});
          for (const s of [-.8, .8]) {
            const q: V3 = [p[0] + (ax ? 0 : s), y + .08, p[2] + (ax ? s : 0)];
            b.box([q[0], y + .2, q[2]], sz(.05, .24, .03), m.frame, {shadow: false});
            hang(`A-rim-${y}-${p[0].toFixed(1)}-${p[2].toFixed(1)}-${s}`, 'A', [q[0], y + .32, q[2]], q, 'balcony');
          }
          b.rod([p[0] + L[0] * .45, y + .08, p[2] + L[2] * .45], [p[0] + L[0] * .5, y + .32, p[2] + L[2] * .5], .008, m.rubber, 4, {shadow: false});
          b.box([p[0], y - .025, p[2]], sz(2.2, .03, .07), dead ? m.lampOff : m.lampCyan, {shadow: false});
        }
      }
    }
    // Catenary service cables strung between the upper balcony fascias, sagging over the hall.
    for (let i = 0; i < 9; i++) {
      const x = 118 + i * 9.6 + (ra() - .5) * 3, sag = 1.6 + ra() * 1.4, z0 = 45.6, z1 = 78.4, y = 5.7;
      const pts: V3[] = [];
      for (let t = 0; t <= 1.0001; t += 1 / 14) pts.push([x + (ra() - .5) * .1, y - sag * 4 * t * (1 - t), z0 + (z1 - z0) * t]);
      if (i % 4 === 3) { pts.splice(9); for (let j = 1; j < 4; j++) pts.push([pts[8][0] + (ra() - .5) * .3, pts[8][1] - j * .9, pts[8][2] + (ra() - .5) * .3]); }
      if (!pts.every(p => spotClear(p, .1, .1))) { skipped++; continue; }
      for (let j = 0; j + 1 < pts.length; j++) b.rod(pts[j], pts[j + 1], .03, m.rubber, 5);
      // Anchor plates and eye bolts on the fascia at each fixed end.
      const ends = i % 4 === 3 ? [pts[0]] : [pts[0], pts[pts.length - 1]];
      for (const e of ends) { b.box([e[0], e[1], e[2] + (e[2] < 62 ? -.03 : .03)], [.16, .2, .02], m.frame, {shadow: false}); b.ring([e[0], e[1] - .02, e[2]], [1, 0, 0], .035, .01, m.chrome, 6); }
      hang(`A-catenary-${i}`, 'A', pts[0], pts[i % 4 === 3 ? pts.length - 1 : 7], 'balcony');
      if (i % 4 !== 3) hang(`A-catenary-${i}-b`, 'A', pts[pts.length - 1], pts[7], 'balcony');
    }
    // Residents' banners hung from the upper balcony rail, waterlogged and torn short.
    for (const [x, z, n, mat] of [[118.5, 45.7, 1, m.carpetRed], [136.5, 45.7, 1, m.padTeal], [181.5, 45.7, 1, m.carpetRed], [127.5, 78.3, -1, m.padTeal], [172.5, 78.3, -1, m.carpetRed], [190.5, 78.3, -1, m.padTeal]] as const) {
      const len = 2.4 + ra() * .8, top = 5.55;
      if (!spotClear([x, top - len, z], .8, len + .5)) { skipped++; continue; }
      const k = Kit.at(b, [x, top, z], n > 0 ? 0 : PI, [(ra() - .5) * .06, 0, (ra() - .5) * .05]);
      // Two cords from rail clamps on the fascia down to the pole ends; the pole bows under the wet cloth.
      const sag = .06 + ra() * .05;
      for (const s of [-1, 1]) {
        k.box([s * .78, .42, -.02], [.1, .08, .06], m.frame); k.rod([s * .78, .38, 0], [s * .74, .05, 0], .007, m.rubber, 4);
        const local = k.child([s * .78, .42, -.02]);
        hang(`A-banner-${x}-${s}`, 'A', local.point([0, 0, 0]), local.point([-s * .04, -.37, .02]), 'balcony');
      }
      for (let j = 0; j < 4; j++) { const u0 = j / 4, u1 = (j + 1) / 4, y = (u: number) => .05 - sag * Math.sin(u * PI); k.rod([-.75 + 1.5 * u0, y(u0), 0], [-.75 + 1.5 * u1, y(u1), 0], .025, m.chrome, 6); }
      // Cloth in vertical strips: the middle hangs lower and bellies out where the water loads it.
      for (let j = 0; j < 5; j++) {
        const u = (j + .5) / 5, w = 1.3 / 5, drop = sag * Math.sin(u * PI), l = len - (j === 3 ? .55 : 0) + Math.sin(u * PI) * .12;
        k.box([-.65 + w * (j + .5), .03 - drop - l / 2, .02 + Math.sin(u * PI) * .03], [w + .004, l, .012], mat, [.025 * Math.sin(u * PI), 0, (u - .5) * .02]);
      }
      k.box([-.35, -len - .25, .02], [.5, .5, .012], mat, [0, 0, .12]);
      k.box([0, -len * .3, .035], [1.1, .08, .004], m.brass);
    }
    // Newspaper kiosk on the south terrace: roof slumped, magazines spilled.
    {
      const ky = PI + .15, k = at('A', [150.5, -9, 74.6], ky, 1.6, 2.8);
      if (k) {
        k.box([0, 1.1, 0], [2.2, 2.2, 1.5], m.paintCream); k.box([0, 1.25, .76], [1.9, .9, .02], m.darkGlass);
        k.box([0, .45, .8], [2.1, .9, .12], m.indGreen); k.box([0, 2.32, .1], [2.6, .1, 1.9], m.indGreen, [.12, 0, .05]);
        b.detail(30, () => { for (let i = 0; i < 12; i++) k.box([(ra() - .5) * 2.4, .01 + i * .004, 1.2 + ra() * 1.2], [.3, .006, .22], m.paper, [0, ra() * 6, 0]); });
        shells.atlas.add('报刊', 'NEWS', 'enamel', [150.5 + Math.sin(ky) * .79, -9 + 1.98, 74.6 + Math.cos(ky) * .79], [Math.sin(ky), 0, Math.cos(ky)], 1.2);
      }
    }

    // Open stair from the arcade floor up to the north balcony (rises west, lands beside the C5 gap).
    {
      const z0 = 46.15, z1 = 48.05, xb = 154, xt = 138, n = 30, run = (xb - xt) / n, rise = 9 / n;
      const treads: V3[] = [];
      for (let i = 0; i < n; i++) treads.push([xb - (i + .5) * run, -9 + (i + 1) * rise, (z0 + z1) / 2]);
      if (treads.every(p => spotClear([p[0], p[1] - .06, p[2]], 1.05, .5)) && spotClear([137, -.2, 47.1], 1.4, 1.3)) {
        for (const p of treads) { b.box([p[0], p[1] - .03, p[2]], [run + .04, .05, z1 - z0 - .1], m.steel); b.box([p[0] - run / 2, p[1] - .01, p[2]], [.04, .04, z1 - z0 - .1], m.chrome); }
        const ang = Math.atan2(9, xb - xt), len = Math.hypot(9, xb - xt);
        for (const z of [z0, z1]) {
          Kit.at(b, [(xb + xt) / 2, -4.5 - .18, z], 0).box([0, 0, 0], [len, .32, .08], m.frame, [0, 0, -ang]);
          b.rod([xb + .2, -8, z], [xt, 1, z], .025, m.chrome, 8);
          for (let i = 0; i <= n; i += 5) { const x = xb - i * run, y = -9 + i * rise; b.rod([x, y, z], [x, y + 1, z], .02, m.chrome, 6); }
        }
        b.slab([136, -.22, z0], [138, -.02, z1], m.steel);
        for (const x of [146, 141]) b.rod([x, -9, (z0 + z1) / 2], [x, -9 + (xb - x) * 9 / (xb - xt) - .35, (z0 + z1) / 2], .1, m.frame, 10);
      } else skipped++;
    }
    // Brass floor inlays on the column grid (floor lines that catch the headlamp across the hall).
    b.detail(40, () => {
      for (let x = 114; x <= 196; x += 9) for (let z = 46.5; z < 77.5; z += 3.1) {
        if (Math.hypot(x - 155, z + 1.55 - 62) < 6.5) continue;
        b.box([x, -8.995, z + 1.55], [.07, .01, 3.04], m.brass, {shadow: false});
      }
      for (const z of [46.5, 77.5]) for (let x = 114; x < 196; x += 4.1) b.box([x + 2.05, -8.995, z], [4.04, .01, .07], m.brass, {shadow: false});
    });
    // Ground-floor vending bank and posters on the south wall under the balcony.
    for (const x of [139, 140.2]) { const k = at('A', [x, -9, 81.3], PI, .6, 2); if (k) vendingMachine(k, m, x | 0, x < 140 ? m.bandRed : m.bandBlue); }
    poster('A', 'S', 143, -7.4, 'posterCalm', .8, .8, .02); poster('A', 'S', 172, -7.6, 'posterSchedule', .7, .95);
    poster('A', 'W', 66, -7.5, 'posterSafety', .7, .7);
    litter('A', 110.4, 199.6, 42.4, 81.6, 90, 109, 4);
  }

  // ================================================================ J1 junction: litter, conduits, toppled chair
  {
    conduitRun(wallKit('J1', 'W', .3, -3), m, 3, 3.6, []);
    conduitRun(wallKit('J1', 'E', 14, -3), m, 3, 3.6, [0]);
    const c = at('J1', [67.5, -3 + .22, 1.2], .9, .5, .9, [PI / 2, 0, 0]); if (c) chair(c, m);
    poster('J1', 'S', 75.5, -.7, 'posterSchedule', .6, .8, -.03);
    litter('J1', 64.4, 81.6, -1.6, 15.6, 40, 110, 1.6);
  }

  // ================================================================ shafts S and D: ring frames, ladders, cable risers, junction boxes
  for (const [id, x0, x1, z0, z1, y0, y1, skipLo, skipHi] of [['S', 0, 14, 0, 14, 5, 39, -3, 3], ['D', 90, 106, 60, 76, -58, 2, -4, 3]] as const) {
    const b = B(id), H = .3;
    for (let y = y0; y <= y1; y += 5) {
      if (y > skipLo && y < skipHi) continue;
      // Ring frame: web + flange on each wall.
      b.slab([x0 + H, y - .12, z0 + H], [x1 - H, y + .12, z0 + H + .35], m.frame); b.slab([x0 + H, y - .25, z0 + H + .35], [x1 - H, y + .25, z0 + H + .4], m.frame);
      b.slab([x0 + H, y - .12, z1 - H - .35], [x1 - H, y + .12, z1 - H], m.frame); b.slab([x0 + H, y - .25, z1 - H - .4], [x1 - H, y + .25, z1 - H - .35], m.frame);
      b.slab([x0 + H, y - .12, z0 + H], [x0 + H + .35, y + .12, z1 - H], m.frame); b.slab([x0 + H + .35, y - .25, z0 + H], [x0 + H + .4, y + .25, z1 - H], m.frame);
      b.slab([x1 - H - .35, y - .12, z0 + H], [x1 - H, y + .12, z1 - H], m.frame); b.slab([x1 - H - .4, y - .25, z0 + H], [x1 - H - .35, y + .25, z1 - H], m.frame);
      // Corner gussets.
      for (const [cx, cz] of [[x0 + H, z0 + H], [x1 - H, z0 + H], [x0 + H, z1 - H], [x1 - H, z1 - H]]) b.box([cx + (cx < (x0 + x1) / 2 ? .45 : -.45), y - .4, cz + (cz < (z0 + z1) / 2 ? .45 : -.45)], [.9, .04, .9], m.frame, {rotY: PI / 4});
    }
    // Cable risers in the corner opposite the ladder, clipped to every ring.
    const rx = id === 'S' ? x1 - H - .7 : x0 + H + .7, rz = z1 - H - .25;
    for (let i = 0; i < 4; i++) b.rod([rx + i * .09, id === 'S' ? -3 : -60, rz - (i % 2) * .08], [rx + i * .09, id === 'S' ? 40 : 3, rz - (i % 2) * .08], .028 + (i % 2) * .01, i % 2 ? m.rubber : m.bandYellow, 8);
    for (let y = (id === 'S' ? -2 : -59); y < (id === 'S' ? 40 : 3); y += 1.2) sc(id).put('cableClip', [rx + .14, y, rz - .04]);
    // Junction boxes and a gauge board every other ring.
    for (let y = y0 + 2.5; y < y1; y += 10) {
      const k = Kit.at(b, [id === 'S' ? x1 - H - .02 : x0 + H + .02, y, (z0 + z1) / 2 + 2.5], id === 'S' ? -PI / 2 : PI / 2);
      k.rbox([0, 0, .12], [.7, .9, .24], m.steel, .02); k.box([0, 0, .245], [.6, .8, .01], m.trim);
      for (let i = 0; i < 3; i++) k.cyl([-.2 + i * .2, .2, .26], .06, .06, .02, m.porcelain, 16, [PI / 2, 0, 0]);
      k.rod([0, -.45, .12], [0, -2.2, .12], .03, m.chrome, 8);
    }
  }
  // D has no ladder yet: caged ladder on the north wall (x 101.5).
  {
    const k = Kit.at(B('D'), [101.5, -60, 60.32], 0);
    for (const x of [-.25, .25]) { k.rod([x, 0, .35], [x, 63, .35], .035, m.chrome, 8); for (let y = 1; y < 63; y += 3) k.box([x, y, .17], [.05, .06, .36], m.frame); }
    for (let y = .3; y < 63; y += .35) sc('D').put('bolt', [101.5, -60 + y, 60.32 + .35], [0, 0, PI / 2], [1, 20, 1]);
    for (let y = 3; y < 63; y += 1.6) k.ring([0, y, .55], .4, .018, m.frame, [PI / 2, 0, 0], 16, PI);
  }

  const signs = fascia as FasciaSigns | null;
  return {
    skipped, owned: ownedMats,
    update(t: number) { signs?.update(t); },
    dispose() { signs?.dispose(); exitTex.dispose(); },
  };
}
