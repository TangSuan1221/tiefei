import type * as T from 'three';
import type {Vec3} from '../../content/living-deck-layout';
import type {HeroName} from './living-hero';

/** Layout space whose render group holds each hero (visibility culling follows the space). */
export const HERO_SPACE: Record<HeroName, string> = {
  'glass-blast-door': 'G', 'valve-manifold': 'V', 'security-post': 'R3', 'manager-office': 'R5', 'laundry-row': 'R1',
  'ballast-rack': 'R4', 'atrium-balcony': 'A', 'gate-f': 'A', 'cocoon-corpse': 'M',
};

/**
 * Static mirror of the Blender hero manifests (public/assets/deepsea/living/<name>.json `placement` /
 * `suggestedInstances`). The JSON stays authoritative for the runtime GLB; this copy lets the procedural
 * fallbacks, their colliders and tools/living-hero-glb-check.ts use the same frame synchronously.
 * The check fails if the two disagree.
 */
export const HERO_GLB_PLACEMENT: Record<HeroName, {position: Vec3; yawDeg: number}> = {
  'glass-blast-door': {position: [142, 0, 0], yawDeg: 0},
  'valve-manifold': {position: [142, 0, 0], yawDeg: 0},
  'security-post': {position: [76, 0, -61.5], yawDeg: 0},
  'manager-office': {position: [167, 0, 104], yawDeg: 0},
  'laundry-row': {position: [36, 0, -22], yawDeg: 0},
  'ballast-rack': {position: [115.5, 0, 32.5], yawDeg: 0},
  'atrium-balcony': {position: [155, 0, 42.3], yawDeg: 0},
  'gate-f': {position: [188, 0, 42], yawDeg: 0},
  'cocoon-corpse': {position: [170, 0, -14], yawDeg: 0},
};

/** 20 m balcony module tiles (manifest suggestedInstances): only spans with no doorway behind or below them. */
export const ATRIUM_BALCONY_TILES: readonly {wall: 'N' | 'S'; position: Vec3; yawDeg: number}[] = [
  {wall: 'N', position: [145, 0, 42.3], yawDeg: 0}, {wall: 'N', position: [165, 0, 42.3], yawDeg: 0},
  {wall: 'N', position: [145, 6, 42.3], yawDeg: 0}, {wall: 'N', position: [165, 6, 42.3], yawDeg: 0},
  {wall: 'S', position: [145, 6, 81.7], yawDeg: 180}, {wall: 'S', position: [165, 6, 81.7], yawDeg: 180},
];
export const ATRIUM_BALCONY_MODULE = {length: 20, depth: 3.2};

export type HeroPartRole = 'item' | 'photo' | 'wheel' | 'leaf' | 'tag';
export interface HeroPartSpec {
  hero: HeroName;
  /** Node name inside the GLB. */
  node: string;
  role: HeroPartRole;
  /** LIVING_ITEMS id the part stands for (interaction / photo target / uplink). */
  id?: string;
}
/**
 * Operable / movable GLB nodes. On load each is re-parented (world transform kept) into the procedural
 * object the world and the site already drive, so visibility, valve spin and gate lift apply unchanged.
 */
export const HERO_GLB_PARTS: readonly HeroPartSpec[] = [
  {hero: 'glass-blast-door', node: 'pipe-intake', role: 'item', id: 'living.pipe.intake'},
  {hero: 'valve-manifold', node: 'wheel-heat', role: 'wheel', id: 'living.valve.heat'},
  {hero: 'valve-manifold', node: 'wheel-feed', role: 'wheel', id: 'living.valve.feed'},
  {hero: 'valve-manifold', node: 'wheel-cool', role: 'wheel', id: 'living.valve.cool'},
  {hero: 'security-post', node: 'probe-case', role: 'item', id: 'living.box.probe'},
  {hero: 'laundry-row', node: 'battery-case', role: 'item', id: 'living.box.battery'},
  {hero: 'ballast-rack', node: 'ballast-crate', role: 'item', id: 'living.box.ballast'},
  // Password holder is the small opaque search target, not the imported readable clipboard.
  {hero: 'manager-office', node: 'guide-placard', role: 'photo', id: 'living.photo.guide'},
  {hero: 'manager-office', node: 'delroy-form', role: 'photo', id: 'living.photo.delroy'},
  {hero: 'gate-f', node: 'gate-leaf', role: 'leaf'},
  {hero: 'gate-f', node: 'gate-port-glass', role: 'tag', id: 'living.uplink.gate'},
];

/** Stable handles for the movable parts: the procedural driver object, which carries the GLB node once loaded. */
export type HeroPartKey = 'pipe-intake' | 'wheel-heat' | 'wheel-feed' | 'wheel-cool' | 'probe-case' | 'battery-case' | 'ballast-crate' | 'gate-leaf';

/** Hands a freshly placed hero GLB to the HeroBuild that owns the fallbacks map (set by buildHeroes). */
export interface HeroGlbAdopter { adopt(name: HeroName, scene: T.Object3D): void }
const adopters = new WeakMap<object, HeroGlbAdopter>();
export function registerHeroAdopter(fallbacks: object, a: HeroGlbAdopter) { adopters.set(fallbacks, a); }
export function heroAdopter(fallbacks: object) { return adopters.get(fallbacks); }

/** Movement contract of the movable parts (matches the Blender exports). */
export const HERO_PART_MOTION = {
  /** Valve handwheels spin about world X (the procedural wheel group's local Z): two turns over valveTurn 0..1. */
  wheel: {axis: 'x', turnsPerStroke: 2},
  /** Gate F leaf rises along +Y by this much at gateOpen = 1. */
  gateLeafTravel: 3.6,
} as const;
