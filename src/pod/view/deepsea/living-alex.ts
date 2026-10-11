import * as T from 'three';
import type {Vec3} from '../../content/living-deck-layout';
import type {LivingMaterials} from './living-materials';
import {fbm, pixelTexture, smooth} from './living-actor-tex';
import {dampFigureIbl, disposeGlbScene, loadActorGlb, trackLivingLoad} from './living-glb';

export type AlexPose = 'idle' | 'swim' | 'gesture' | 'type' | 'film';
export interface AlexVisualState {identity?:'elias'|'keeper';position: Vec3; heading: number; visible: boolean; pose: AlexPose}

type V = [number, number, number];
const PI = Math.PI;
const faceYaw = (deg: number) => { const h = deg * PI / 180; return Math.atan2(Math.sin(h), -Math.cos(h)); };

// ================================================================ skinned diver (living-diver-alex.glb)
/**
 * Bones of the GLB rig. Poses are model-space rotations (x: pitch, + bends the spine forward / swings a
 * hanging limb backward; z: + swings a hanging limb toward the figure's left, +X) applied at each bone head
 * and composed down the hierarchy (same convention as tools/blender/living_common.Figure.chain).
 */
const BONES = ['pelvis', 'spine', 'chest', 'neck', 'head', 'clav_L', 'upper_L', 'fore_L', 'hand_L', 'clav_R', 'upper_R', 'fore_R', 'hand_R', 'thigh_L', 'shin_L', 'foot_L', 'thigh_R', 'shin_R', 'foot_R'] as const;
type Bone = typeof BONES[number];
type RigPose = Partial<Record<Bone, V>>;

function rigPose(p: AlexPose, t: number): RigPose {
  const s = Math.sin;
  const breathe = s(t * 1.1) * .015;
  switch (p) {
    case 'idle': return {
      // weight on the right leg, slight contrapposto, hands loose and a little forward, head scanning
      pelvis: [0, s(t * .25) * .04, -.03], spine: [.05 + breathe, 0, .03], chest: [.03 + breathe, s(t * .3) * .03, .01], neck: [.04, 0, 0], head: [.06 + s(t * .4) * .03, s(t * .23) * .25, 0],
      upper_L: [-.12 + s(t * .7) * .03, 0, -.24], fore_L: [-.42, 0, 0], hand_L: [-.1, 0, -.05],
      upper_R: [-.08 + s(t * .8 + 1) * .03, 0, .22], fore_R: [-.36, 0, 0], hand_R: [-.1, 0, .05],
      thigh_L: [-.16, 0, .04], shin_L: [.3, 0, 0], foot_L: [-.12, 0, 0],
      thigh_R: [-.03, 0, -.02], shin_R: [.06, 0, 0], foot_R: [-.02, 0, 0],
    };
    case 'swim': return {
      // prone, head up to see, arms folded in front of the chest (commercial divers fin with hands tucked), flutter kick
      pelvis: [1.38, 0, 0], spine: [-.06, 0, 0], chest: [-.06, 0, 0], neck: [-.45, 0, 0], head: [-.55, 0, 0],
      upper_L: [-.5, 0, -.35], fore_L: [-1.2, .2, 0], hand_L: [-.2, 0, 0],
      upper_R: [-.5, 0, .35], fore_R: [-1.2, -.2, 0], hand_R: [-.2, 0, 0],
      thigh_L: [-.08 + s(t * 4.2) * .32, 0, .05], shin_L: [.35 + Math.max(0, s(t * 4.2 + .9)) * .45, 0, 0], foot_L: [.75, 0, 0],
      thigh_R: [-.08 - s(t * 4.2) * .32, 0, -.05], shin_R: [.35 + Math.max(0, -s(t * 4.2 + .9)) * .45, 0, 0], foot_R: [.75, 0, 0],
    };
    case 'gesture': return {
      // turned toward the pipe, right arm extended pointing, left hand half raised, emphatic small jabs
      pelvis: [0, .1, 0], spine: [.04, .12, 0], chest: [0, .14, 0], neck: [0, .1, 0], head: [-.06, .16, 0],
      upper_R: [-1.42 + s(t * 2.4) * .06, .1, .32], fore_R: [-.2 + s(t * 2.4 + .5) * .08, 0, 0], hand_R: [-.15, 0, 0],
      upper_L: [-.55, 0, -.2], fore_L: [-.95, 0, 0], hand_L: [-.25, 0, 0],
      thigh_L: [-.2, 0, .06], shin_L: [.32, 0, 0], foot_L: [-.12, 0, 0],
      thigh_R: [.06, 0, -.04], shin_R: [.08, 0, 0], foot_R: [-.1, 0, 0],
    };
    case 'type': return {
      // leaning into the inner gate panel, both hands at chest height on the keypad
      spine: [.1 + breathe, 0, 0], chest: [.06, 0, 0], neck: [.12, 0, 0], head: [.28, 0, 0],
      upper_L: [-.85, 0, .1], fore_L: [-1.05 + s(t * 7) * .04, 0, 0], hand_L: [-.25, 0, 0],
      upper_R: [-.8, 0, -.08], fore_R: [-1.1 + s(t * 8 + 1) * .06, 0, 0], hand_R: [-.3, 0, 0],
      thigh_L: [-.18, 0, .05], shin_L: [.3, 0, 0], foot_L: [-.12, 0, 0],
      thigh_R: [-.05, 0, -.03], shin_R: [.12, 0, 0], foot_R: [-.06, 0, 0],
    };
    case 'film': return {
      // camera held two-handed at chest/face height, elbows in, slight crouch for stability
      spine: [.06 + breathe, 0, 0], chest: [.02, 0, 0], neck: [.05, 0, 0], head: [.1, 0, 0],
      upper_L: [-.75, 0, .28], fore_L: [-1.45, 0, 0], hand_L: [-.2, 0, .15],
      upper_R: [-.78, 0, -.3], fore_R: [-1.42, 0, 0], hand_R: [-.2, 0, -.15],
      thigh_L: [-.3, 0, .05], shin_L: [.48, 0, 0], foot_L: [-.18, 0, 0],
      thigh_R: [-.12, 0, -.03], shin_R: [.3, 0, 0], foot_R: [-.18, 0, 0],
    };
  }
}

/** Procedural env (equirect) so the visor and metal fittings carry reflections: dark teal water + two soft lamps. */
export function visorEnv() {
  const W = 256, H = 128;
  const t = pixelTexture(W, (x, y) => {
    const u = x / W, v = y / H;
    let c = .05 + (1 - v) * .1;
    const blob = (cu: number, cv: number, r: number, k: number) => k * Math.exp(-(((u - cu) * 2) ** 2 + (v - cv) ** 2) / (r * r));
    c += blob(.3, .3, .07, 3) + blob(.72, .22, .05, 2) + blob(.5, .9, .3, .15);
    return [Math.min(255, c * 120), Math.min(255, c * 175), Math.min(255, c * 180), 255];
  }, true, false, H);
  t.mapping = T.EquirectangularReflectionMapping;
  return t;
}

/** Chipped paint: base colour, roughness (metal shows through chips/scratches). */
function chippedPaint(seed: number, paint: [number, number, number]) {
  const S = 256;
  const r = Array.from({length: 60}, (_, i) => [((i * 37 + seed * 11) % 97) / 97, ((i * 53 + seed * 7) % 89) / 89, ((i * 71) % 83) / 83 * PI]);
  const chip = (u: number, v: number) => {
    let c = smooth(.62, .66, fbm(u, v, 8, 4, seed));
    for (const [a, b, ang] of r) { const dx = u - a, dy = v - b; const al = dx * Math.cos(ang) + dy * Math.sin(ang), ac = -dx * Math.sin(ang) + dy * Math.cos(ang); if (Math.abs(al) < .06 && Math.abs(ac) < .0018) c = 1; }
    return c;
  };
  const C = new Float32Array(S * S), G = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const u = x / S, v = y / S; C[y * S + x] = chip(u, v); G[y * S + x] = fbm(u, v, 4, 4, seed + 9); }
  const map = pixelTexture(S, (_x, _y, i) => { const g = G[i], k = C[i]; const base = paint.map(p => p * (.75 + g * .35) * (1 - smooth(.5, .9, g) * .25)); return [base[0] * (1 - k) + 120 * k, base[1] * (1 - k) + 118 * k, base[2] * (1 - k) + 112 * k, 255]; });
  // glTF-style packing: G = roughness, B = metalness
  const orm = pixelTexture(S, (_x, _y, i) => { const k = C[i]; return [255, (.42 + G[i] * .25 - k * .12) * 255, k * 255, 255]; }, false);
  return {map, orm};
}

interface Rig {
  scene: T.Object3D;
  bones: Map<Bone, T.Bone>;
  parents: Map<Bone, Bone>;
  /** Rest world rotations relative to the GLB scene root, and the armature node's (root bone parent). */
  restWorld: Map<Bone, T.Quaternion>;
  rootParentWorld: T.Quaternion;
  /** Lamp lens position on the head bone, in head-bone local space. */
  lampLocal: T.Vector3;
  pelvisY: number;
}

export function setupRig(scene: T.Object3D, m: LivingMaterials | undefined, tex: Record<string, T.Texture>, env: T.Texture, owned: {dispose(): void}[]): Rig | null {
  scene.updateMatrixWorld(true);
  const bones = new Map<Bone, T.Bone>(), restWorld = new Map<Bone, T.Quaternion>();
  scene.traverse(o => { if ((o as T.Bone).isBone && (BONES as readonly string[]).includes(o.name)) bones.set(o.name as Bone, o as T.Bone); });
  if (bones.size !== BONES.length) { console.warn('[living] diver rig incomplete', bones.size); return null; }
  for (const [n, b] of bones) restWorld.set(n, b.getWorldQuaternion(new T.Quaternion()));
  const parents = new Map<Bone, Bone>();
  for (const [n, b] of bones) if (b.parent && bones.has(b.parent.name as Bone)) parents.set(n, b.parent.name as Bone);
  const pelvis = bones.get('pelvis')!;
  const rootParentWorld = pelvis.parent ? pelvis.parent.getWorldQuaternion(new T.Quaternion()) : new T.Quaternion();
  const pelvisY = pelvis.getWorldPosition(new T.Vector3()).y;

  const helmet = chippedPaint(3, [118, 92, 40]), tank = chippedPaint(8, [58, 66, 62]);
  owned.push(helmet.map, helmet.orm, tank.map, tank.orm, env);
  const uniforms = {uSuit: {value: new T.Color('#161717')}, uCanvas: {value: new T.Color('#463d2f')}, uSilt: {value: new T.Color('#5a5344')}};
  // vulcanised rubber body with canvas over-panels: real linen albedo/AO (Poly Haven CC0) modulates the tint, so
  // weave, stains and fading come from the scan rather than a flat colour; the GLB vertex colours keep the panel
  // mask (r) and wear (g)
  const suit = new T.MeshPhysicalMaterial({name: 'living.alex.suit', vertexColors: true, map: tex.linenDiff, aoMap: tex.linenArm, aoMapIntensity: 1, roughness: 1, roughnessMap: tex.linenRough, normalMap: tex.linenNormal, normalScale: new T.Vector2(1.35, 1.35)});
  suit.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSuit; uniform vec3 uCanvas; uniform vec3 uSilt;')
      .replace('#include <color_fragment>', `
  float cm = smoothstep(.42, .58, vColor.r);
  float wr = vColor.g;
  float lum = dot(diffuseColor.rgb, vec3(.299, .587, .114));
  float weave = clamp(lum * 2.8, .3, 1.8);
  vec3 base = mix(uSuit * mix(1., weave, .55), uCanvas * weave, cm);
  float mott = texture2D(map, vMapUv * .061 + .37).g * .6 + texture2D(map, vMapUv * .17 + .71).g * .4;
  base *= mix(.62, 1.12, smoothstep(.25, .75, mott));
  float silt = clamp(wr * 1.15 - .25, 0., 1.);
  diffuseColor.rgb = mix(base, uSilt * weave, silt * .75);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = min(1., mix(.66, .93, cm) * (.85 + .3 * roughnessFactor) + wr * .12);`);
  };
  suit.customProgramCacheKey = () => 'living-alex-suit';
  const rubber = (name: string, color: string, rough: number) => new T.MeshPhysicalMaterial({name, color, roughness: rough, normalMap: tex.leatherNormal, normalScale: new T.Vector2(.9, .9), envMap: env, envMapIntensity: .2});
  const mats: Record<string, T.Material> = {
    suit,
    glove: rubber('living.alex.glove', '#141515', .74),
    boot: rubber('living.alex.boot', '#1c1b1a', .78),
    rubber: rubber('living.alex.rubber', '#1d1e1f', .72),
    skin: new T.MeshStandardMaterial({name: 'living.alex.skin', color: '#4a3a32', roughness: .6}),
    metal: new T.MeshStandardMaterial({name: 'living.alex.metal', color: '#77746c', metalness: .85, roughness: .64, roughnessMap: tex.metalRough, envMap: env, envMapIntensity: .35}),
    brass: new T.MeshStandardMaterial({name: 'living.alex.brass', color: '#7a6234', metalness: .85, roughness: .6, roughnessMap: tex.metalRough, envMap: env, envMapIntensity: .35}),
    paint: new T.MeshPhysicalMaterial({name: 'living.alex.helmet', map: helmet.map, roughnessMap: helmet.orm, metalnessMap: helmet.orm, roughness: 1, metalness: 1, clearcoat: .08, clearcoatRoughness: .7, envMap: env, envMapIntensity: .35}),
    tank: new T.MeshPhysicalMaterial({name: 'living.alex.tank', map: tank.map, roughnessMap: tank.orm, metalnessMap: tank.orm, roughness: 1, metalness: 1, envMap: env, envMapIntensity: .4}),
    visor: new T.MeshPhysicalMaterial({name: 'living.alex.visor', color: '#0c1416', roughness: .03, metalness: .1, clearcoat: 1, clearcoatRoughness: .02, transparent: true, opacity: .72, envMap: env, envMapIntensity: 1.6}),
    lamp: new T.MeshStandardMaterial({name: 'living.alex.lamp', color: '#fff', emissive: '#fff0d6', emissiveIntensity: 1.4}),
    webbing: new T.MeshStandardMaterial({name: 'living.alex.webbing', color: '#4a473c', map: tex.linenDiff, roughness: .95, normalMap: tex.linenNormal, normalScale: new T.Vector2(1.3, 1.3)}),
    canvas: new T.MeshStandardMaterial({name: 'living.alex.canvas', color: '#6e604a', map: tex.linenDiff, aoMap: tex.linenArm, roughness: .95, normalMap: tex.linenNormal, normalScale: new T.Vector2(1.3, 1.3)}),
  };
  owned.push(...Object.values(mats));
  for (const k of ['suit', 'glove', 'boot', 'rubber', 'skin', 'webbing', 'canvas']) dampFigureIbl(mats[k] as T.MeshStandardMaterial, k === 'skin' ? .5 : .2);
  for (const t of [tex.linenNormal, tex.linenRough, tex.linenDiff, tex.linenArm, tex.leatherNormal]) t.repeat.set(12, 12);
  tex.metalRough.repeat.set(2, 2);
  let lampSum = new T.Vector3(), lampN = 0;
  scene.traverse(o => {
    const mesh = o as T.SkinnedMesh; if (!mesh.isMesh) return;
    const key = (mesh.material as T.Material).name.replace(/^alex_/, '');
    (mesh.material as T.Material).dispose();
    mesh.material = mats[key] ?? mats.rubber;
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    if (key === 'visor') mesh.renderOrder = 3;
    if (key === 'lamp') {
      const p = mesh.geometry.getAttribute('position'), v = new T.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (v.y > 1.55) { lampSum.add(v); lampN++; } }
    }
  });
  const lampModel = lampN ? lampSum.divideScalar(lampN) : new T.Vector3(-.13, 1.7, .12);
  const head = bones.get('head')!;
  const lampLocal = head.worldToLocal(lampModel.clone());
  return {scene, bones, parents, restWorld, rootParentWorld, lampLocal, pelvisY};
}

export interface AlexVisual {
  root: T.Group;
  /** Always-visible holder for the helmet lamp (keeps the scene light count constant). */
  lights: T.Group;
  update(s: AlexVisualState, time: number, dt: number): void;
  dispose(): void;
}

// ================================================================ procedural fallback (used only if the GLB is missing)
type Joint = 'pitch' | 'torso' | 'head' | 'lShX' | 'lShZ' | 'lEl' | 'rShX' | 'rShZ' | 'rEl' | 'lHip' | 'lKnee' | 'rHip' | 'rKnee';
type Pose = Record<Joint, number>;
const BASE: Pose = {pitch: 0, torso: .06, head: 0, lShX: -.15, lShZ: .22, lEl: -.35, rShX: -.12, rShZ: -.2, rEl: -.4, lHip: -.18, lKnee: .4, rHip: -.08, rKnee: .3};
function poseAt(p: AlexPose, t: number): Pose {
  const s = Math.sin, o = {...BASE};
  switch (p) {
    case 'idle': o.torso += s(t * .9) * .03; o.lShX += s(t * .7) * .06; o.rShX += s(t * .8 + 1) * .06; break;
    case 'swim': o.pitch = 1.22; o.torso = 0; o.head = -.9; o.lShX = .25; o.rShX = .25; o.lEl = -.15; o.rEl = -.15; o.lHip = -.05 + s(t * 4.6) * .38; o.rHip = -.05 - s(t * 4.6) * .38; break;
    case 'gesture': o.rShX = -1.45; o.rShZ = -.1; o.rEl = -.2; o.lShX = -.6; o.lEl = -.9; break;
    case 'type': o.torso = .2; o.head = .3; o.lShX = -1.05; o.rShX = -1.0; o.lEl = -.95; o.rEl = -.9; break;
    case 'film': o.rShX = -1.35; o.rShZ = -.42; o.rEl = -1.75; o.lShX = -1.15; o.lShZ = .55; o.lEl = -1.7; break;
  }
  return o;
}

function proceduralAlex(m: LivingMaterials, owned: (T.Material | T.BufferGeometry | T.Texture)[]) {
  const suit = new T.MeshStandardMaterial({roughness: .88, color: '#2a2f33'});
  const paint = new T.MeshPhysicalMaterial({color: '#9a7a2c', roughness: .45, metalness: .3, clearcoat: .5});
  const visor = new T.MeshPhysicalMaterial({color: '#0b1214', roughness: .05, metalness: .6, clearcoat: 1});
  owned.push(suit, paint, visor);
  const sphere = new T.SphereGeometry(1, 18, 12), cyl = new T.CylinderGeometry(1, 1, 1, 14, 1); owned.push(sphere, cyl);
  const add = (parent: T.Object3D, g: T.BufferGeometry, mat: T.Material, p: V, s: V) => { const o = new T.Mesh(g, mat); o.position.set(...p); o.scale.set(...s); o.castShadow = true; parent.add(o); return o; };
  const limb = (parent: T.Object3D, len: number, r0: number, r1: number, mat: T.Material) => { const g = new T.CylinderGeometry(r1, r0, len, 14, 1); g.translate(0, -len / 2, 0); owned.push(g); const o = new T.Mesh(g, mat); o.castShadow = true; parent.add(o); return o; };
  const joint = (parent: T.Object3D, p: V) => { const j = new T.Group(); j.position.set(...p); parent.add(j); return j; };
  const g = new T.Group(); g.name = 'living-alex-procedural';
  const body = joint(g, [0, 0, 0]), torso = joint(body, [0, .05, 0]);
  add(body, sphere, suit, [0, 0, -.02], [.2, .14, .15]);
  add(torso, sphere, suit, [0, .3, -.02], [.22, .32, .16]);
  add(torso, cyl, m.chrome, [0, .3, -.24], [.08, .5, .08]);
  const head = joint(torso, [0, .6, .01]);
  add(head, sphere, paint, [0, .17, .02], [.16, .18, .17]);
  add(head, sphere, visor, [0, .18, .13], [.12, .1, .06]);
  const arms: {sh: T.Group; el: T.Group}[] = [];
  for (const s of [-1, 1]) {
    const sh = joint(torso, [s * .22, .52, 0]); sh.rotation.order = 'ZXY';
    limb(sh, .3, .07, .065, suit); const el = joint(sh, [0, -.3, 0]); limb(el, .28, .06, .05, suit); arms.push({sh, el});
  }
  const legs: {hip: T.Group; knee: T.Group}[] = [];
  for (const s of [-1, 1]) { const hip = joint(body, [s * .11, -.02, -.02]); limb(hip, .42, .09, .075, suit); const knee = joint(hip, [0, -.42, 0]); limb(knee, .42, .065, .05, suit); legs.push({hip, knee}); }
  const cur: Pose = {...BASE};
  return {
    group: g, head,
    pose(p: AlexPose, time: number, k: number) {
      const want = poseAt(p, time);
      for (const j of Object.keys(cur) as Joint[]) cur[j] += (want[j] - cur[j]) * k;
      body.rotation.x = cur.pitch; torso.rotation.x = cur.torso; head.rotation.x = cur.head;
      arms[0].sh.rotation.set(cur.lShX, 0, cur.lShZ); arms[0].el.rotation.x = cur.lEl;
      arms[1].sh.rotation.set(cur.rShX, 0, cur.rShZ); arms[1].el.rotation.x = cur.rEl;
      legs[0].hip.rotation.x = cur.lHip; legs[0].knee.rotation.x = cur.lKnee;
      legs[1].hip.rotation.x = cur.rHip; legs[1].knee.rotation.x = cur.rKnee;
    },
  };
}

export function createAlex(m: LivingMaterials): AlexVisual {
  const owned: (T.Material | T.BufferGeometry | T.Texture)[] = [];
  const root = new T.Group(); root.name = 'living-alex'; root.userData.photoId = 'alex';
  const fallback = proceduralAlex(m, owned); root.add(fallback.group);

  // handheld underwater camera (placed between the hands in the film pose)
  const camera = new T.Group(); camera.name = 'living-alex-camera'; root.add(camera); camera.visible = false;
  {
    const housing = new T.MeshPhysicalMaterial({color: '#202326', roughness: .35, metalness: .4, clearcoat: .6});
    const glass = new T.MeshPhysicalMaterial({color: '#0a0f12', roughness: .02, metalness: .2, clearcoat: 1});
    owned.push(housing, glass);
    const geo: T.BufferGeometry[] = [new T.BoxGeometry(.2, .13, .14), new T.CylinderGeometry(.045, .05, .07, 20), new T.CylinderGeometry(.04, .04, .005, 20), new T.CylinderGeometry(.012, .012, .22, 8)];
    owned.push(...geo);
    const b = new T.Mesh(geo[0], housing); camera.add(b);
    const l = new T.Mesh(geo[1], housing); l.rotation.x = PI / 2; l.position.z = .1; camera.add(l);
    const g = new T.Mesh(geo[2], glass); g.rotation.x = PI / 2; g.position.z = .136; camera.add(g);
    for (const s of [-1, 1]) { const h = new T.Mesh(geo[3], housing); h.position.set(s * .12, -.02, 0); camera.add(h); }
  }
  const tally = new T.Mesh(new T.BoxGeometry(.015, .015, .008), new T.MeshStandardMaterial({color: '#200', emissive: '#ff2a1a', emissiveIntensity: 3}));
  owned.push(tally.geometry, tally.material as T.Material); tally.position.set(.07, .05, .07); camera.add(tally);

  // helmet lamp (always in the scene graph; intensity 0 when Alex is hidden)
  const lights = new T.Group(); lights.name = 'living-alex-lights';
  const spot = new T.SpotLight('#ffe9c4', 0, 13, .48, .55, 1.6);
  const target = new T.Object3D(); lights.add(spot, target); spot.target = target;

  let rig: Rig | null = null;
  let identityApplied='',identityRig:Rig|null=null;
  const identityColors=new Map<T.Material,T.Color>();
  const env = visorEnv();
  const loader = new T.TextureLoader();
  const ld = (f: string, srgb = false) => loader.loadAsync(`/assets/deepsea/living/src/${f}`).then(t => { t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; t.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace; owned.push(t); return t; });
  trackLivingLoad(Promise.all([
    loadActorGlb('living-diver-alex.glb'),
    // Poly Haven CC0 scans (shared with the Blender hero pipeline): canvas weave, rubber grain, scratched metal
    ld('rough_linen_nor_gl_2k.jpg'), ld('rough_linen_rough_2k.jpg'), ld('fabric_leather_02_nor_gl_2k.jpg'), ld('painted_metal_shutter_rough_2k.jpg'),
    ld('rough_linen_diff_2k.jpg', true), ld('rough_linen_arm_2k.jpg'),
  ]).then(([gltf, linenNormal, linenRough, leatherNormal, metalRough, linenDiff, linenArm]) => {
    if (!gltf) return;
    const r = setupRig(gltf.scene, m, {linenNormal, linenRough, leatherNormal, metalRough, linenDiff, linenArm}, env, owned);
    if (!r) { disposeGlbScene(gltf.scene); return; }
    rig = r; fresh = true;
    r.scene.position.y = -r.pelvisY;   // root origin = pelvis (state positions are pelvis height above the floor)
    root.add(r.scene); fallback.group.visible = false;
  }).catch(e => console.warn('[living] diver setup failed', e)));

  let pose: AlexPose = 'idle', blend = 1;
  /** Snap straight to the pose on the first visible frame (and when the rig arrives) instead of easing out of the bind pose. */
  let fresh = true;
  const cur = new Map<Bone, T.Vector3>(BONES.map(b => [b, new T.Vector3()]));
  const acc = new Map<Bone, T.Quaternion>(), posed = new Map<Bone, T.Quaternion>();
  const qa = new T.Quaternion(), eul = new T.Euler(), w = new T.Vector3(), w2 = new T.Vector3(), fwd = new T.Vector3();
  const applyRig = (time: number, k: number) => {
    const R = rig!, want = rigPose(pose, time);
    for (const b of BONES) { const v = cur.get(b)!, t = want[b]; v.x += ((t?.[0] ?? 0) - v.x) * k; v.y += ((t?.[1] ?? 0) - v.y) * k; v.z += ((t?.[2] ?? 0) - v.z) * k; }
    // BONES is parent-before-child; world delta D_b = D_parent 路 E_b, posed world Q_b = D_b 路 Rest_b
    for (const b of BONES) {
      const p = R.parents.get(b) ?? null, v = cur.get(b)!;
      const D = (acc.get(b) ?? acc.set(b, new T.Quaternion()).get(b)!).setFromEuler(eul.set(v.x, v.y, v.z, 'YXZ'));
      if (p) D.premultiply(acc.get(p)!);
      const Q = (posed.get(b) ?? posed.set(b, new T.Quaternion()).get(b)!).copy(D).multiply(R.restWorld.get(b)!);
      R.bones.get(b)!.quaternion.copy(qa.copy(p ? posed.get(p)! : R.rootParentWorld).invert().multiply(Q));
    }
  };

  return {
    root, lights,
    update(s, time, dt) {
      root.visible = s.visible;
      const identity=s.identity??'elias';
      if(identityApplied!==identity||identityRig!==rig){root.userData.character=identity;root.traverse(o=>{const mesh=o as T.Mesh;if(!mesh.isMesh)return;for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]){const m=mat as T.MeshStandardMaterial;if(!m.color||!['living.alex.helmet','living.alex.suit'].includes(m.name))continue;if(!identityColors.has(m))identityColors.set(m,m.color.clone());m.color.copy(identityColors.get(m)!);if(identity==='keeper')m.color.set(m.name.endsWith('helmet')?'#dadaca':'#29494b');}});identityApplied=identity;identityRig=rig;}
      if (!s.visible) { spot.intensity = 0; fresh = true; return; }
      root.position.set(...s.position);
      root.rotation.y = faceYaw(s.heading);
      if (s.pose !== pose) { pose = s.pose; blend = fresh ? 1 : 0; }
      blend = Math.min(1, blend + dt * 1.6);
      const k = fresh ? 1 : 1 - Math.exp(-dt * (2 + blend * 6));
      fresh = false;
      root.position.y += Math.sin(time * .8) * .02 * (pose === 'swim' ? 1 : .4);
      if (rig) applyRig(time, k); else fallback.pose(pose, time, k);
      root.updateMatrixWorld(true);
      // helmet lamp rides the head bone; aims along the head's facing (model +Z turned by the head's pose delta)
      fwd.set(0, -.15, 1).normalize();
      if (rig) {
        w.copy(rig.lampLocal); rig.bones.get('head')!.localToWorld(w);
        fwd.applyQuaternion(acc.get('head')!).applyQuaternion(root.getWorldQuaternion(qa));
      } else {
        fallback.head.localToWorld(w.set(.12, .3, .15));
        fwd.applyQuaternion(fallback.head.getWorldQuaternion(qa));
      }
      spot.position.copy(w);
      target.position.copy(w).addScaledVector(fwd, 3);
      spot.intensity = 20;
      // camera prop between the hands, facing where the head faces
      camera.visible = pose === 'film';
      if (camera.visible && rig) {
        rig.bones.get('hand_L')!.getWorldPosition(w); rig.bones.get('hand_R')!.getWorldPosition(w2);
        w.add(w2).multiplyScalar(.5); root.worldToLocal(w);
        camera.position.copy(w).add(fwd.set(0, -.02, .07).applyQuaternion(acc.get('head')!));
        camera.quaternion.copy(acc.get('head')!);
      }
      (tally.material as T.MeshStandardMaterial).emissiveIntensity = pose === 'film' && Math.sin(time * 4) > 0 ? 3 : .2;
    },
    dispose() { if (rig) disposeGlbScene(rig.scene); owned.forEach(o => o.dispose()); env.dispose(); },
  };
}
