import {
  BoxGeometry, BufferGeometry, CanvasTexture, ClampToEdgeWrapping, DataTexture,
  Group, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshStandardMaterial,
  PlaneGeometry, RGBAFormat, SRGBColorSpace, Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canOpenDoor, newExpeditionState } from '../../content/expedition';
import { LANDMARK_NAMES, roomAddress } from '../../content/expedition-navigation';
import type { ExpeditionEdge, ExpeditionLevel, ExpeditionRoom, ExpeditionState } from '../../content/expedition';
import type { ReferenceMaterials } from './reference-materials';

export interface ExpeditionWayfinding {
  root: Group;
  update(state: ExpeditionState): void;
  dispose(): void;
}

const SHORT_NAMES = ['接入室', '主大厅', '控制前室', '证据侧室', '环线停靠', '校验侧室', '远端观察'] as const;
const INK = '#dfd9bd', CYAN = '#83b5bb', YELLOW = '#cbb46b', BACK = '#182126';
const PAGE = 2048, TILE = 512, TILE_HEIGHT = 256, GRID = 4, ROWS = 8, PAD = 8;
// Keep the complete assembly ahead of surface-mounted ventilation grilles.
const WALL_STANDOFF = .35;
type Role = 'evidence' | 'terminal' | 'transfer' | 'return';
type Status = 'locked' | 'permit' | 'open';
type Tile = { page: number; slot: number };
type Page = { context: CanvasRenderingContext2D | null; texture: Texture; material: MeshStandardMaterial; used: number };
type Route = { role: Role; room: string; distance: number; edgeIds: string[] };
type Link = { edge: ExpeditionEdge; room: ExpeditionRoom; distance: number };

/** Runtime/map identity, never room-array position or a new content ID. */
function address(room: ExpeditionRoom): string {
  const match = /\.s([0-3])\.r([0-6])$/.exec(room.id);
  if (!match || Number(match[1]) !== room.sector) throw new Error(`Invalid expedition address: ${room.id}`);
  return roomAddress(room);
}
function shortName(room: ExpeditionRoom): string {
  return room.name.split('·').at(-1) || SHORT_NAMES[Number(/\.r([0-6])$/.exec(room.id)![1])];
}
const roleName = (role: Role) => ({ evidence: '证据', terminal: '核验终端', transfer: '区间交接', return: '返回' })[role];
const roleColor = (role: Role) => role === 'terminal' ? CYAN : role === 'transfer' ? YELLOW : INK;

/** Geometric symbols avoid dependence on installed icon fonts or color perception. */
function pictogram(c: CanvasRenderingContext2D, role: Role, x: number, y: number, size = 25) {
  c.save(); c.translate(x, y); c.strokeStyle = roleColor(role); c.lineWidth = 4;
  c.beginPath();
  if (role === 'evidence') {
    c.moveTo(0, -size / 2); c.lineTo(size / 2, 0); c.lineTo(0, size / 2); c.lineTo(-size / 2, 0); c.closePath();
  } else if (role === 'terminal') {
    c.rect(-size / 2, -size / 2, size, size * .7);
    c.moveTo(0, size * .2); c.lineTo(0, size / 2); c.moveTo(-size * .35, size / 2); c.lineTo(size * .35, size / 2);
  } else if (role === 'transfer') {
    for (const dx of [-7, 7]) { c.moveTo(dx - 6, -size / 2); c.lineTo(dx + 6, 0); c.lineTo(dx - 6, size / 2); }
  } else {
    c.moveTo(size / 2, -size / 3); c.lineTo(-size / 2, -size / 3); c.lineTo(-size / 2, size / 3);
    c.moveTo(-size / 2 - 6, size / 3 - 7); c.lineTo(-size / 2, size / 3); c.lineTo(-size / 2 + 6, size / 3 - 7);
  }
  c.stroke(); c.restore();
}
function lettering(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color = INK, maxWidth = 450) {
  c.fillStyle = color; c.font = `600 ${size}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
  c.fillText(text, x, y, maxWidth);
}

/** Decorative only: no colliders, progression writes, gate opening or new paths.
 * World convention follows expedition-world: floor -2m, ceiling +4m.
 * Atlas tiles are 512×256 with gutters; four shared atlas materials for current
 * levels, plus borrowed steel and a lamp material. Static paint/frames are batched.
 * Only changed door-state UVs are rewritten; canvases are never redrawn per frame.
 * Headless import/construction is supported; text awaits browser construction.
 */
export function createExpeditionWayfinding(level: ExpeditionLevel, m: ReferenceMaterials): ExpeditionWayfinding {
  const rooms = new Map(level.rooms.map(r => [r.id, r]));
  const adjacency = new Map<string, Link[]>(level.rooms.map(r => [r.id, []]));
  for (const room of level.rooms) address(room);
  for (const edge of level.edges) {
    const a = rooms.get(edge.from), b = rooms.get(edge.to);
    if (!a || !b || edge.width <= 0 || !Number.isFinite(edge.width) ||
      ![a.x, a.z, b.x, b.z].every(Number.isFinite) ||
      (Math.abs(a.x - b.x) > 1e-5 && Math.abs(a.z - b.z) > 1e-5)) {
      throw new Error(`Unsupported wayfinding corridor: ${edge.id}`);
    }
    const distance = Math.hypot(a.x - b.x, a.z - b.z);
    if (!distance) throw new Error(`Zero-length corridor: ${edge.id}`);
    adjacency.get(a.id)!.push({ edge, room: b, distance });
    adjacency.get(b.id)!.push({ edge, room: a, distance });
  }
  const root = new Group(); root.name = `expedition-wayfinding.${level.id}`;
  root.userData.landmark = LANDMARK_NAMES[level.index] ?? level.name;
  root.userData.legend = '菱形：证据 / 屏幕：终端 / 双箭头：交接 / 回折箭头：返回';
  const pages: Page[] = [], cache = new Map<string, Tile>();
  const geometries = new Set<BufferGeometry>(), batches = new Map<MeshStandardMaterial, BufferGeometry[]>();
  const fixtureMaterial = new MeshStandardMaterial({ color: '#88aeb1', roughness: .68,
    emissive: '#779fa8', emissiveIntensity: .22 });
  fixtureMaterial.name = 'wayfinding.recessed-lamp';
  const statuses: { edge: ExpeditionEdge; offset: number; status?: Status; metadata: Group }[] = [];
  const statusPieces: BufferGeometry[] = [];
  let disposed = false;

  function newPage(): Page {
    let context: CanvasRenderingContext2D | null = null;
    let texture: Texture;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = PAGE;
      context = canvas.getContext('2d');
      texture = context ? new CanvasTexture(canvas) : new DataTexture(new Uint8Array([223, 217, 189, 255]), 1, 1, RGBAFormat);
    } else texture = new DataTexture(new Uint8Array([223, 217, 189, 255]), 1, 1, RGBAFormat);
    texture.colorSpace = SRGBColorSpace; texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
    texture.magFilter = LinearFilter; texture.minFilter = LinearMipmapLinearFilter;
    texture.generateMipmaps = true; texture.anisotropy = 4; texture.needsUpdate = true;
    texture.name = `wayfinding.atlas.${pages.length}`;
    // Black board reflects very little; the same map masks a faint lettering glow.
    const material = new MeshStandardMaterial({
      map: texture, color: '#ffffff', roughness: .78, metalness: 0,
      emissiveMap: texture, emissive: '#ffffff', emissiveIntensity: .035,
      alphaTest: .4, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    material.name = `wayfinding.print.${pages.length}`;
    const page = { context, texture, material, used: 0 }; pages.push(page); return page;
  }
  function tile(key: string, draw: (c: CanvasRenderingContext2D) => void): Tile {
    const old = cache.get(key); if (old) return old;
    const last = pages.at(-1);
    const page = last && last.used < GRID * ROWS ? last : newPage();
    const slot = page.used++, result = { page: pages.length - 1, slot };
    const c = page.context;
    if (c) {
      c.save(); c.translate((slot % GRID) * TILE, Math.floor(slot / GRID) * TILE_HEIGHT);
      c.scale(1, TILE_HEIGHT / TILE);
      c.beginPath(); c.rect(PAD, PAD, TILE - 2 * PAD, TILE - 2 * PAD); c.clip();
      draw(c); c.restore(); page.texture.needsUpdate = true;
    }
    cache.set(key, result); return result;
  }
  function setUV(g: BufferGeometry, t: Tile, offset = 0, count = g.getAttribute('uv').count) {
    const uv = g.getAttribute('uv');
    const x = (t.slot % GRID) * TILE + PAD, y = Math.floor(t.slot / GRID) * TILE_HEIGHT + PAD / 2;
    // Non-indexed PlaneGeometry vertex order; resetting from corners prevents drift.
    const corners = [[0, 1], [0, 0], [1, 1], [0, 0], [1, 0], [1, 1]];
    for (let i = 0; i < count; i++) {
      const [u, v] = corners[i % 6];
      uv.setXY(offset + i, (x + u * (TILE - PAD * 2)) / PAGE,
        1 - (y + (1 - v) * (TILE_HEIGHT - PAD)) / PAGE);
    }
  }
  function plane(t: Tile, width: number, height: number): BufferGeometry {
    const indexed = new PlaneGeometry(width, height), g = indexed.toNonIndexed(); indexed.dispose(); setUV(g, t); return g;
  }
  function add(g: BufferGeometry, material: MeshStandardMaterial, parent: Group) {
    // These holders have not been rendered yet. updateMatrixWorld on a child alone
    // leaves ancestor matrices stale, collapsing wall plates into the spawn lanes.
    parent.updateWorldMatrix(true, false); g.applyMatrix4(parent.matrixWorld);
    const flat = g.index ? g.toNonIndexed() : g; if (flat !== g) g.dispose();
    const list = batches.get(material) ?? []; list.push(flat); batches.set(material, list);
  }
  function panel(c: CanvasRenderingContext2D) {
    c.fillStyle = BACK; c.fillRect(0, 0, TILE, TILE);
    c.strokeStyle = '#79847d'; c.lineWidth = 2; c.strokeRect(18, 18, 476, 476);
    // Fasteners and edge wear stay outside the useful lettering field.
    for (const x of [25, 487]) for (const y of [25, 487]) {
      c.fillStyle = '#606c69'; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#242d2e'; c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x + 3, y); c.stroke();
    }
    c.strokeStyle = '#414b48'; c.lineWidth = 1;
    for (let i = 0; i < 13; i++) {
      const y = 43 + i * 33; c.beginPath(); c.moveTo(19, y); c.lineTo(22 + (i % 4) * 2, y - 4); c.stroke();
    }
  }
  const stateTiles = Object.fromEntries((['locked', 'permit', 'open'] as const).map(status => [status, tile(`state.${status}`, c => {
    // Counter the wide physical plaque's aspect ratio for undistorted lettering.
    c.fillStyle = BACK; c.fillRect(0, 0, TILE, TILE); c.scale(1, 3);
    c.strokeStyle = status === 'locked' ? YELLOW : INK; c.lineWidth = 5;
    c.beginPath();
    if (status === 'locked') {
      // A square with a cross, a hollow circle, and a check are distinct in grayscale.
      c.rect(26, 34, 50, 50); c.moveTo(32, 40); c.lineTo(70, 78); c.moveTo(70, 40); c.lineTo(32, 78);
    } else if (status === 'permit') c.arc(51, 59, 25, 0, Math.PI * 2);
    else { c.moveTo(26, 57); c.lineTo(45, 77); c.lineTo(80, 37); }
    c.stroke();
    lettering(c, status === 'locked' ? '锁闭' : status === 'permit' ? '许可就绪' : '已开门', 106, 78, 48, INK, 370);
    lettering(c, status === 'locked' ? '先核验 · 禁止通行' : status === 'permit' ? '仍需操作开门' : '确认门叶已让开', 28, 136, 32, INK, 450);
  })])) as Record<Status, Tile>;

  // Dijkstra stays inside this sector; transfers target its actual bridge endpoint.
  // Thus an evidence/terminal hint never silently routes through a locked other sector.
  function route(from: ExpeditionRoom, target: ExpeditionRoom): { distance: number; edges: string[] } | undefined {
    const distances = new Map<string, number>([[from.id, 0]]), paths = new Map<string, string[]>([[from.id, []]]);
    const pending = new Set(level.rooms.filter(r => r.sector === from.sector).map(r => r.id));
    while (pending.size) {
      let id: string | undefined, best = Infinity;
      for (const candidate of pending) if ((distances.get(candidate) ?? Infinity) < best) { id = candidate; best = distances.get(candidate)!; }
      if (!id) break;
      if (id === target.id) return { distance: best, edges: paths.get(id)! };
      pending.delete(id);
      for (const link of adjacency.get(id)!) {
        if (!pending.has(link.room.id)) continue;
        const next = best + link.distance;
        if (next < (distances.get(link.room.id) ?? Infinity)) {
          distances.set(link.room.id, next); paths.set(link.room.id, [...paths.get(id)!, link.edge.id]);
        }
      }
    }
    return undefined;
  }
  const roomRoutes = new Map<string, Route[]>();
  for (const room of level.rooms) {
    const hints: Route[] = [];
    const stage = level.stages.find(s => rooms.get(level.items.find(i => i.id === s.terminal)?.room ?? '')?.sector === room.sector);
    for (const id of [...(stage?.objectives ?? []), ...(stage ? [stage.terminal] : [])]) {
      const item = level.items.find(i => i.id === id); if (!item) continue;
      const target = rooms.get(item.room)!; if (target.id === room.id) continue;
      const path = route(room, target); if (!path) continue;
      hints.push({ role: item.kind === 'terminal' ? 'terminal' : 'evidence', room: target.id, distance: path.distance, edgeIds: path.edges });
    }
    const nextStage = stage ? level.stages[level.stages.indexOf(stage) + 1] : undefined;
    const nextSector = rooms.get(level.items.find(i => i.id === nextStage?.terminal)?.room ?? '')?.sector;
    const transfers: Route[] = [];
    for (const source of level.rooms.filter(r => r.sector === room.sector)) {
      for (const link of adjacency.get(source.id)!) {
        if (nextSector === undefined || link.room.sector !== nextSector) continue;
        const path = route(room, source); if (!path) continue;
        transfers.push({ role: 'transfer', room: link.room.id, distance: path.distance + link.distance,
          edgeIds: [...path.edges, link.edge.id] });
      }
    }
    if (transfers.length) hints.push(transfers.sort((a, b) => a.distance - b.distance)[0]);
    else if (!nextStage) {
      const target = rooms.get(level.exitRoom), path = target && route(room, target);
      if (target && path) hints.push({ role: 'transfer', room: target.id, distance: path.distance, edgeIds: path.edges });
    }
    roomRoutes.set(room.id, hints);
  }

  for (const from of level.rooms) for (const link of adjacency.get(from.id)!) {
    const to = link.room, edge = link.edge;
    const dx = Math.sign(to.x - from.x), dz = Math.sign(to.z - from.z);
    const half = dx ? from.width / 2 : from.depth / 2;
    const x = from.x + dx * (half - WALL_STANDOFF), z = from.z + dz * (half - WALL_STANDOFF);
    const yaw = Math.atan2(-dx, -dz); // Printed front (+Z) faces INTO the source room.
    const hints = roomRoutes.get(from.id)!.filter(r => r.edgeIds[0] === edge.id);
    const returning = to.sector < from.sector;
    const primary: Role = returning ? 'return' : to.sector > from.sector ? 'transfer' : hints[0]?.role ?? 'return';
    // Pick the less crowded jamb. Local +X is the viewer's right; the printed
    // arrow always points BACK toward the real mouth, not along a compass axis.
    const offset = edge.width / 2 + .92;
    const jambClearance = (side: number) => {
      const bx = x - dz * offset * side, bz = z + dx * offset * side;
      return Math.min(Infinity, ...level.items.filter(i => i.room === from.id)
        .map(i => Math.hypot(bx - from.x - i.x, bz - from.z - i.z)));
    };
    const boardSide = jambClearance(-1) > jambClearance(1) ? -1 : 1;
    const entranceArrow = boardSide > 0 ? '←' : '→';
    const metadata = new Group(); metadata.name = `wayfinding.${edge.id}.from.${from.id}`;
    metadata.userData = {
      from: from.id, to: to.id, destination: to.id, address: address(to), roomAddress: address(to), edgeId: edge.id,
      direction: [dx, dz], routes: hints, distanceMeters: link.distance,
      boardSide, entranceArrow, arrowLocal: [-boardSide, 0, 0],
      distanceBasis: 'room-center to room-center along existing corridors',
    };
    metadata.position.set(x, 1.15, z); metadata.rotation.y = yaw; root.add(metadata);
    // Beside the entrance, flush with the room wall, not blocking its travel volume.
    const board = new Group(); board.position.x = offset * boardSide; metadata.add(board);
    const t = tile(`board.${from.id}.${edge.id}`, c => {
      panel(c);
      lettering(c, `${entranceArrow} ${address(to)}`, 34, 79, 64);
      lettering(c, shortName(to), 34, 137, 40);
      lettering(c, `${boardSide > 0 ? '左侧门入' : '右侧门入'} · 约 ${Math.round(link.distance)} m`, 34, 183, 29, roleColor(primary));
      c.strokeStyle = '#59635e'; c.lineWidth = 2; c.beginPath(); c.moveTo(34, 204); c.lineTo(478, 204); c.stroke();
      if (!hints.length) {
        pictogram(c, 'return', 52, 245); lettering(c, '连接通道 / 回程见下', 79, 256, 30);
      }
      hints.slice(0, 4).forEach((hint, n) => {
        const y = 246 + n * 42; pictogram(c, hint.role, 52, y - 8);
        lettering(c, `${roleName(hint.role)} ${address(rooms.get(hint.room)!)} · ${Math.round(hint.distance)}m`, 80, y, 29, roleColor(hint.role), 398);
      });
      lettering(c, `回程：${address(from)} ${shortName(from)}`, 34, 444, 27);
      lettering(c, '中心距估算 · 门禁状态见下牌', 34, 478, 23, '#a4aaa0');
    });
    add(new BoxGeometry(1.68, 1.68, .07), m.steel, board);
    for (const side of [-1, 1]) {
      const bracket = new Group(); bracket.position.set(side * .69, 0, -WALL_STANDOFF / 2); board.add(bracket);
      add(new BoxGeometry(.07, 1.35, WALL_STANDOFF), m.steel, bracket);
    }
    const face = new Group(); face.position.z = .041; board.add(face);
    add(plane(t, 1.59, 1.59), pages[t.page].material, face);
    const hood = new Group(); hood.position.set(0, .88, .045); board.add(hood);
    add(new BoxGeometry(1.12, .075, .16), m.steel, hood);
    const lampFace = new Group(); lampFace.position.set(0, -.047, .035); hood.add(lampFace);
    add(new BoxGeometry(.91, .018, .055), fixtureMaterial, lampFace);
    // Smaller status plaque below the main board. All statuses share ONE draw call.
    const statusFrame = new Group(); statusFrame.position.set(0, -1.17, 0); board.add(statusFrame);
    add(new BoxGeometry(1.68, .59, .07), m.steel, statusFrame);
    const statusFace = new Group(); statusFace.position.z = .041; statusFrame.add(statusFace); statusFace.updateWorldMatrix(true, false);
    const sg = plane(stateTiles.locked, 1.59, .53); sg.applyMatrix4(statusFace.matrixWorld);
    statuses.push({ edge, offset: statusPieces.length * 6, metadata }); statusPieces.push(sg);

    const floorTile = tile(`floor.${to.id}.${primary}`, c => {
      // Transparent interruptions make these painted stencils, not luminous carpet.
      c.strokeStyle = roleColor(primary); c.lineWidth = 14;
      for (const y of [82, 153, 224]) { c.beginPath(); c.moveTo(132, y + 35); c.lineTo(256, y - 30); c.lineTo(380, y + 35); c.stroke(); }
      lettering(c, address(to), 116, 342, 76, roleColor(primary), 290);
      pictogram(c, primary, 110, 395, 33); lettering(c, shortName(to), 146, 409, 40, roleColor(primary), 314);
      lettering(c, '门禁以门牌为准', 97, 473, 31, INK, 330);
    });
    const floor = new Group(); floor.position.set(x - dx * 2.6, -1.983, z - dz * 2.6); floor.rotation.y = yaw; root.add(floor);
    floor.name = `wayfinding.floor.${edge.id}.from.${from.id}`;
    floor.userData = { from: from.id, to: to.id, roomAddress: address(to), edgeId: edge.id, direction: [dx, dz], role: primary };
    const paint = new Group(); paint.rotation.x = -Math.PI / 2; floor.add(paint);
    add(plane(floorTile, 1.45, 1.45), pages[floorTile.page].material, paint);
    // Transform holders are inexpensive and preserve inspectable route metadata.
  }

  // One arrival legend per level. Names are visual anchors, never new room/content IDs.
  const start = rooms.get(level.startRoom)!;
  const spawnYaw = (level as ExpeditionLevel & { spawnYaw?: number }).spawnYaw;
  const initialLink = adjacency.get(start.id)![0];
  const initialYaw = Number.isFinite(spawnYaw) ? spawnYaw! : initialLink
    ? Math.atan2(start.x - initialLink.room.x, start.z - initialLink.room.z) : 0;
  const walls = [
    { name: '-X', dx: -1, dz: 0 }, { name: '+X', dx: 1, dz: 0 },
    { name: '-Z', dx: 0, dz: -1 }, { name: '+Z', dx: 0, dz: 1 },
  ].map(wall => {
    const half = wall.dx ? start.width / 2 : start.depth / 2;
    const x = start.x + wall.dx * (half - WALL_STANDOFF);
    const z = start.z + wall.dz * (half - WALL_STANDOFF);
    const doorway = adjacency.get(start.id)!.some(link =>
      Math.sign(link.room.x - start.x) === wall.dx && Math.sign(link.room.z - start.z) === wall.dz);
    const nearItem = level.items.some(i => i.room === start.id && Math.hypot(x - start.x - i.x, z - start.z - i.z) < 2.4);
    return { ...wall, x, z, doorway, nearItem,
      // Prefer a free wall visible in the initial view; no preferred world axis.
      score: -Math.sin(initialYaw) * wall.dx - Math.cos(initialYaw) * wall.dz };
  }).sort((a, b) => b.score - a.score);
  const freeWall = walls.find(w => !w.doorway && !w.nearItem);
  // If every wall is occupied, a shallow directory header clears the runtime's
  // highest player sphere (3.03m). It never hangs into an interaction/door lane.
  const mount = freeWall ?? walls.find(w => w.doorway) ?? walls[0];
  const header = !freeWall;
  const legendWidth = header ? 2.4 : 1.9, legendHeight = header ? .62 : 1.9;
  const legendY = header ? 3.48 : 1.1;
  const legend = tile('legend', c => {
    if (header) {
      c.fillStyle = BACK; c.fillRect(0, 0, TILE, TILE);
      c.scale(1, legendWidth / legendHeight);
      lettering(c, `航段 ${level.index + 1} · ${LANDMARK_NAMES[level.index] ?? level.name}`, 24, 44, 30, INK, 464);
      lettering(c, '◇ 取证  /  核验  /  许可开门', 24, 94, 27, INK, 464);
      return;
    }
    panel(c); lettering(c, `航段 ${String(level.index + 1).padStart(2, '0')}`, 34, 75, 38);
    lettering(c, LANDMARK_NAMES[level.index] ?? level.name, 34, 137, 49);
    lettering(c, 'A–D 区 / 01–07 室', 34, 193, 34);
    (['evidence', 'terminal', 'transfer', 'return'] as const).forEach((role, i) => {
      pictogram(c, role, 56, 245 + i * 48); lettering(c, roleName(role), 94, 256 + i * 48, 34, roleColor(role));
    });
    lettering(c, '先取证 → 核验 → 许可开门', 34, 473, 30);
  });
  // Wall midpoints avoid story corners. The complete reserved patch is published
  // for prop workers; its location follows current topology and actual item sites.
  const legendBoard = new Group();
  legendBoard.name = 'wayfinding.entry-legend';
  legendBoard.position.set(mount.x, legendY, mount.z);
  const wallX = mount.x + mount.dx * WALL_STANDOFF, wallZ = mount.z + mount.dz * WALL_STANDOFF;
  const patchHalf = legendWidth / 2 + .25;
  legendBoard.userData = {
    room: start.id, wall: mount.name, wallOffset: WALL_STANDOFF, mounting: header ? 'header' : 'wall',
    reservedBounds: {
      min: [mount.dx ? Math.min(wallX, wallX - mount.dx * .6) : wallX - patchHalf,
        legendY - legendHeight / 2 - .08, mount.dz ? Math.min(wallZ, wallZ - mount.dz * .6) : wallZ - patchHalf],
      max: [mount.dx ? Math.max(wallX, wallX - mount.dx * .6) : wallX + patchHalf,
        legendY + legendHeight / 2 + .08, mount.dz ? Math.max(wallZ, wallZ - mount.dz * .6) : wallZ + patchHalf],
    },
  };
  legendBoard.rotation.y = Math.atan2(-mount.dx, -mount.dz); root.add(legendBoard);
  add(new BoxGeometry(legendWidth, legendHeight, .07), m.steel, legendBoard);
  for (const side of [-1, 1]) {
    const bracket = new Group(); bracket.position.set(side * (legendWidth / 2 - .16), 0, -WALL_STANDOFF / 2); legendBoard.add(bracket);
    add(new BoxGeometry(.07, legendHeight - .2, WALL_STANDOFF), m.steel, bracket);
  }
  const legendFace = new Group(); legendFace.position.z = .041; legendBoard.add(legendFace);
  add(plane(legend, legendWidth - .1, legendHeight - .1), pages[legend.page].material, legendFace);

  function merge(parts: BufferGeometry[]): BufferGeometry {
    const g = mergeGeometries(parts, false); for (const part of parts) part.dispose();
    if (!g) throw new Error('Could not batch expedition wayfinding');
    g.computeBoundingBox(); g.computeBoundingSphere(); geometries.add(g); return g;
  }
  for (const [material, parts] of batches) {
    const mesh = new Mesh(merge(parts), material); mesh.name = `wayfinding.static.${material.name}`;
    mesh.receiveShadow = true; root.add(mesh);
  }
  batches.clear();
  const statusGeometry = statusPieces.length ? merge(statusPieces) : undefined;
  if (statusGeometry) {
    const mesh = new Mesh(statusGeometry, pages[stateTiles.locked.page].material);
    mesh.name = 'wayfinding.door-status'; mesh.receiveShadow = true; root.add(mesh);
  }
  root.userData.textAvailable = pages.every(p => p.context !== null);
  root.userData.atlasPages = pages.length;
  function update(state: ExpeditionState) {
    if (disposed) return;
    const valid = state.version === 1 && state.levelId === level.id;
    let changed = false;
    for (const entry of statuses) {
      const allowed = valid && canOpenDoor(level, state, entry.edge.id);
      // A stale opened ID without the required permit must never advertise passage.
      const status: Status = !allowed ? 'locked' : state.opened.includes(entry.edge.id) ? 'open' : 'permit';
      if (status === entry.status) continue;
      entry.status = status; entry.metadata.userData.status = status;
      if (statusGeometry) setUV(statusGeometry, stateTiles[status], entry.offset, 6);
      changed = true;
    }
    if (changed && statusGeometry) statusGeometry.getAttribute('uv').needsUpdate = true;
  }
  update(newExpeditionState(level));
  return {
    root, update,
    dispose() {
      if (disposed) return; disposed = true;
      root.removeFromParent(); root.clear();
      for (const g of geometries) g.dispose(); geometries.clear();
      for (const page of pages) { page.material.dispose(); page.texture.dispose(); }
      fixtureMaterial.dispose();
      pages.length = 0; cache.clear(); statuses.length = 0;
    },
  };
}
