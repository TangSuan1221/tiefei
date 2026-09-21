import {
  Box3, BoxGeometry, BufferGeometry, ExtrudeGeometry, Group, Mesh,
  MeshStandardMaterial, Quaternion, Shape, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ExpeditionLevel, ExpeditionRoom } from '../../content/expedition';
import type { ReferenceMaterials } from './reference-materials';

export interface ExpeditionShells {
  root: Group;
  /** World-space solids. All structures below 3.15m are confined to the wall skin. */
  colliders: Box3[];
  dispose(): void;
}
type V3 = [number, number, number];
type Profile = [number, number][];
const FLOOR = -2, CLEARANCE = 3.15, WALL_SKIN = .19, LIGHT_GAP = .8;
const NAMES = ['高位承重桁架', '弧形承压拱肩', '断层隔热吊顶', '分区吊顶梁网', '跨厅深风道', '八角压力顶肩', '递进承压套框'];

/** Architecture only; world owns roof slabs, lighting, facility bays and navigation.
 * Uses each room's real ceiling. No flat replacement roof at the old four metres.
 * Materials are borrowed, never cloned/disposed. Meshes batch per room/material to
 * retain useful frustum culling. No DOM, randomness, textures, lights or update loop.
 */
export function createExpeditionShells(level: ExpeditionLevel, m: ReferenceMaterials): ExpeditionShells {
  const root = new Group(); root.name = `expedition-shells.${level.id}`;
  const colliders: Box3[] = [], owned = new Set<BufferGeometry>();
  const reports: Array<{
    room: string; concept: string; ceiling: number; parts: number; skippedLightParts: number;
    bounds: { min: V3; max: V3 }[]; lightReservations: { min: V3; max: V3 }[];
  }> = [];
  root.userData.shells = reports;
  let disposed = false;

  try {
    for (const room of level.rooms) {
      if (room.role !== 'hall' && !/\.r0$/.test(room.id)) continue;
      const roof = room.ceiling ?? 4;
      if (![roof, room.width, room.depth, room.x, room.z].every(Number.isFinite) || roof < 3.8 || room.width < 6 || room.depth < 6) {
        throw new Error(`Invalid architectural envelope: ${room.id}`);
      }
      const hall = room.role === 'hall';
      // Local X spans the shorter dimension; local Z follows the long room axis.
      const swap = room.width > room.depth;
      const W = swap ? room.depth : room.width, L = swap ? room.width : room.depth;
      const hw = W / 2, hl = L / 2;
      const world = (p: V3) => new Vector3(room.x + (swap ? p[2] : p[0]), p[1], room.z + (swap ? p[0] : p[2]));
      const localGeometry = (g: BufferGeometry) => {
        if (swap) {
          // Proper rotation (not a reflection): symmetric profiles keep handedness.
          g.rotateY(Math.PI / 2);
          // Local +X then maps to world -Z; room layouts and reservations are symmetric.
        }
        g.translate(room.x, 0, room.z); return g;
      };
      const roomRoot = new Group(); roomRoot.name = `shell.${room.id}`; root.add(roomRoot);
      const batches = new Map<MeshStandardMaterial, BufferGeometry[]>();
      const lights: Box3[] = [];
      const lightY = Math.min(roof - .3, hall ? 4.8 : 3.6);
      const lightPositions: V3[] = hall
        ? [-1, 1].flatMap(x => [-1, 1].map(z => [room.x + x * room.width * .28, lightY, room.z + z * room.depth * .28] as V3))
        : [[room.x - room.width * .26, lightY, room.z - room.depth * .24],
          [room.x + room.width * .26, lightY, room.z + room.depth * .24]];
      for (const p of lightPositions) lights.push(new Box3().setFromCenterAndSize(new Vector3(...p), new Vector3(2 * LIGHT_GAP, 2 * LIGHT_GAP, 2 * LIGHT_GAP)));
      const report = { room: room.id, concept: NAMES[level.index], ceiling: roof, parts: 0, skippedLightParts: 0,
        bounds: [] as { min: V3; max: V3 }[], lightReservations: lights.map(b => ({ min: b.min.toArray() as V3, max: b.max.toArray() as V3 })) };
      reports.push(report);
      const openingRects = level.edges.filter(e => e.from === room.id || e.to === room.id).map(e => {
        const to = level.rooms.find(r => r.id === (e.from === room.id ? e.to : e.from))!;
        const dx = Math.sign(to.x - room.x), dz = Math.sign(to.z - room.z);
        const center = new Vector3(room.x + dx * room.width / 2, .6, room.z + dz * room.depth / 2);
        return new Box3().setFromCenterAndSize(center, new Vector3(dx ? .6 : e.width + .5, 5.2, dz ? .6 : e.width + .5));
      });
      function add(g: BufferGeometry, material: MeshStandardMaterial) {
        localGeometry(g); g.computeBoundingBox(); const b = g.boundingBox!;
        const eps = .002;
        if (b.min.y < FLOOR - eps || b.max.y > roof + eps || b.min.x < room.x - room.width / 2 - eps || b.max.x > room.x + room.width / 2 + eps ||
          b.min.z < room.z - room.depth / 2 - eps || b.max.z > room.z + room.depth / 2 + eps) {
          g.dispose(); throw new Error(`Shell outside real room envelope: ${room.id}`);
        }
        if (lights.some(light => light.intersectsBox(b))) { g.dispose(); report.skippedLightParts++; return; }
        if (b.min.y < CLEARANCE) {
          const flush = b.max.x <= room.x - room.width / 2 + WALL_SKIN + eps || b.min.x >= room.x + room.width / 2 - WALL_SKIN - eps ||
            b.max.z <= room.z - room.depth / 2 + WALL_SKIN + eps || b.min.z >= room.z + room.depth / 2 - WALL_SKIN - eps;
          if (!flush) { g.dispose(); throw new Error(`Shell intrudes into facility bay: ${room.id}`); }
          if (openingRects.some(door => door.intersectsBox(b))) { g.dispose(); return; }
          colliders.push(b.clone());
        }
        report.parts++; report.bounds.push({ min: b.min.toArray() as V3, max: b.max.toArray() as V3 });
        const flat = g.index ? g.toNonIndexed() : g; if (flat !== g) g.dispose();
        flat.clearGroups(); owned.add(flat);
        const parts = batches.get(material) ?? []; parts.push(flat); batches.set(material, parts);
      }
      function box(p: V3, size: V3, material = m.hull) {
        if (size.some(v => v <= 0)) return;
        add(new BoxGeometry(...size).translate(...p), material);
      }
      function beam(a: V3, b: V3, width: number, depth: number, material = m.steel) {
        const start = new Vector3(...a), end = new Vector3(...b), delta = end.clone().sub(start);
        const g = new BoxGeometry(width, delta.length(), depth);
        g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.normalize()));
        const mid = start.add(end).multiplyScalar(.5); g.translate(mid.x, mid.y, mid.z); add(g, material);
      }
      function band(points: Profile, thickness: number, depth: number, z: number, material = m.hull) {
        const shape = new Shape(); shape.moveTo(points[0][0], points[0][1]);
        for (const [x, y] of points.slice(1)) shape.lineTo(x, y);
        for (const [x, y] of [...points].reverse()) shape.lineTo(x, y - thickness);
        shape.closePath();
        const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 });
        g.translate(0, 0, z - depth / 2); add(g, material);
      }
      const stations = hall ? [-.42 * L, 0, .42 * L] : [-.40 * L, .40 * L];
      // Load-bearing spring rails join every section to the real roof perimeter.
      for (const side of [-1, 1]) {
        box([side * (hw - .09), roof - .20, 0], [.18, .40, L], m.steel);
        box([0, roof - .12, side * (hl - .09)], [W - .36, .24, .18], m.steel);
        for (const z of stations) {
          // 16cm-deep wall pilasters end at the spring rail; never free-standing props.
          box([side * (hw - .08), (roof + FLOOR - .35) / 2, z], [.16, roof - FLOOR - .35, .42], m.hull);
        }
      }

      if (level.index === 0) {
        // Deep triangulated transverse girders, open webs and visible roof depth.
        const top = roof - .38, bottom = Math.max(3.38, roof - (hall ? 1.65 : .85));
        for (const z of stations) {
          for (const y of [top, bottom]) box([0, y, z], [W - .36, .24, .48], m.steel);
          const panels = hall ? 8 : 4, span = W - .8;
          for (let n = 0; n < panels; n++) {
            const x0 = -span / 2 + n * span / panels, x1 = x0 + span / panels;
            beam([x0, n % 2 ? top : bottom, z], [x1, n % 2 ? bottom : top, z], .20, .28);
          }
          for (const side of [-1, 1]) box([side * (hw - .38), (top + bottom) / 2, z], [.40, top - bottom + .24, .64], m.hull);
        }
      } else if (level.index === 1 || level.index === 5) {
        // Broad pressure shoulders genuinely change the room's upper cross-section.
        const depth = Math.min(roof - 3.65, hall ? 2.4 : .70);
        const count = level.index === 1 ? 16 : 4;
        const profile: Profile = Array.from({ length: count + 1 }, (_, i) => {
          const t = i / count * 2 - 1;
          return [t * (hw - .12), roof - .12 - depth * (level.index === 1 ? 1 - Math.sqrt(Math.max(0, 1 - t * t)) : Math.abs(t) ** 3)];
        });
        for (const z of stations) band(profile, .22, level.index === 1 ? .62 : .42, z, m.steel);
        for (const side of [-1, 1]) {
          const shoulder: Profile = Array.from({ length: 7 }, (_, i) => {
            const t = .76 + .24 * i / 6;
            const y = roof - .10 - depth * (level.index === 1 ? 1 - Math.sqrt(Math.max(0, 1 - t * t)) : (t - .5) * 2);
            return [side * t * (hw - .02), y];
          });
          band(shoulder, .18, L - .04, 0, m.hull);
          box([side * hw * .76, roof - .28, 0], [.15, .28, L - .1], m.steel);
        }
      } else if (level.index === 2) {
        // Discontinuous insulation coffers: three narrow strips, visible tall voids.
        const strip = W * .15, segments = hall ? 5 : 3, length = (L - 1) / segments;
        for (const lane of [-1, 0, 1]) for (let n = 0; n < segments; n++) {
          const x = lane * W * .415, z = -L / 2 + .5 + length * (n + .5);
          const drop = Math.min(roof - 3.7, .42 + ((n * 2 + lane + 4) % 3) * (hall ? .43 : .09));
          const y = roof - drop;
          box([x, y, z], [strip, .24, length - .6], m.hull);
          for (const side of [-1, 1]) {
            box([x + side * (strip / 2 - .06), y - .08, z], [.10, .16, length - .6], m.steel);
            box([x + side * (strip / 2 - .12), (roof + y) / 2, z], [.10, roof - y, .22], m.steel);
          }
        }
      } else if (level.index === 3) {
        // Low perimeter service zones frame an open central commons, not a false lid.
        const soffitY = Math.max(3.48, roof - .95), shelf = W * .14;
        for (const side of [-1, 1]) {
          box([side * (hw - shelf / 2), soffitY, 0], [shelf, .28, L - .04]);
          box([side * (hw - shelf), (roof + soffitY) / 2, 0], [.12, roof - soffitY, L - .08], m.hull);
        }
        for (const z of stations) {
          box([0, roof - .30, z], [W - .2, .40, .44], m.hull);
          box([0, roof - .52, z], [W - .2, .07, .48], m.steel);
        }
        box([0, roof - .25, 0], [.32, .34, L - .10], m.hull);
      } else if (level.index === 4) {
        // A built-up hollow service trunk crosses the room, tied into end bulkheads.
        const ductWidth = Math.min(3.4, W * .15), ductDepth = hall ? 1.65 : .9;
        const bottom = roof - ductDepth - .16, top = roof - .12;
        box([0, bottom, 0], [ductWidth, .20, L - .08], m.hull);
        for (const side of [-1, 1]) box([side * (ductWidth / 2 - .09), (top + bottom) / 2, 0], [.18, top - bottom, L - .08], m.hull);
        for (const z of stations) {
          box([0, bottom - .13, z], [ductWidth + .4, .12, .30], m.steel);
          for (const side of [-1, 1]) box([side * (ductWidth / 2 + .10), (roof + bottom) / 2, z], [.12, roof - bottom, .30], m.steel);
          box([0, roof - .40, z], [W - .2, .40, .48], m.steel);
        }
      } else {
        // Progressively deeper transverse liners reveal the core's tall central void.
        const rings = hall ? 5 : 3;
        for (let n = 0; n < rings; n++) {
          const t = n / (rings - 1), z = (t - .5) * L * .82;
          const inset = .14 + t * Math.min(1.1, W * .035);
          const top = roof - .16 - t * Math.min(1.25, (roof - 3.8) * .4);
          const shoulderY = Math.max(3.45, top - Math.min(2.2, (roof - 3.5) * .6));
          const profile: Profile = [[-hw + .1, shoulderY], [-hw + inset + .65, top], [hw - inset - .65, top], [hw - .1, shoulderY]];
          band(profile, .22, .48, z, n % 2 ? m.steel : m.hull);
          for (const side of [-1, 1]) {
            box([side * (hw - .1), (roof + shoulderY) / 2, z], [.18, roof - shoulderY, .60], m.hull);
          }
        }
      }
      // World coordinates are baked once; holders are identity transforms.
      for (const [material, parts] of batches) {
        const g = mergeGeometries(parts, false);
        if (!g) throw new Error(`Shell batch failed: ${room.id}`);
        for (const part of parts) { part.dispose(); owned.delete(part); }
        owned.add(g); g.computeBoundingBox(); g.computeBoundingSphere();
        const mesh = new Mesh(g, material); mesh.name = `${roomRoot.name}.${material.name || material.type}`;
        mesh.castShadow = mesh.receiveShadow = true; roomRoot.add(mesh);
      }
      // Useful QA anchors and machine-readable reservations, no additional scene objects.
      roomRoot.userData = { room: room.id, ceiling: roof, concept: report.concept,
        center: world([0, roof - 1, 0]).toArray(), lowWallSkin: WALL_SKIN };
    }
  } catch (error) {
    for (const g of owned) g.dispose(); root.clear(); colliders.length = 0; throw error;
  }
  return {
    root, colliders,
    dispose() {
      if (disposed) return; disposed = true;
      root.removeFromParent(); root.clear();
      for (const g of owned) g.dispose(); owned.clear(); colliders.length = 0;
    },
  };
}
