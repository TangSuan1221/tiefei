import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {rng} from './living-build';
import {addRim, fbm, field, greyTexture, normalTexture, pixelTexture, smooth, taperedTube} from './living-actor-tex';
import {disposeGlbScene, loadActorGlb} from './living-glb';

const PI = Math.PI;
/** Cocoon-local heights: the root sits 3 cm above the M floor (y −3), the ceiling grid is at y 0.6. */
const CEIL = 3.57;
/** Shell centre in cocoon-local space (cocoon-corpse.json `shell-centre`, hero frame shifted by the root). */
const SC = new T.Vector3(.27, .43, .23);

export interface CocoonBuild {
  /** Cocoon-local frame: floor at y 0, ceiling at y 3.6; place at the cocoon mark on the M floor. */
  root: T.Group;
  update(time: number): void;
  dispose(): void;
}

/**
 * Amber cocoon around an earlier dead resident (M corridor). The Blender actor (cocoon-corpse.glb,
 * tools/blender/build-living-cocoon-corpse.py) is a seated figure hugging its knees, head down, inside a
 * body-following translucent shell 3–6 cm thick: head, shoulder, back and knees read as a dark silhouette
 * through the resin. No face, hair, tag or clothing: the identity stays unknown.
 * Gel strands leave the top of the shell and end on the ceiling grid in flattened gel pads with a smear on
 * the tiles; others slump from the base onto the floor. The floor carries a contact shadow, a wet seep and a
 * glossy pool. The medium here is inert (nothing moves toward anyone).
 */
export function buildCocoon(): CocoonBuild {
  const owned: {dispose(): void}[] = [];
  const root = new T.Group(); root.name = 'living-cocoon-corpse';
  const r = rng(41);

  // ---------------------------------------------------------------- shell + body materials
  const S = 256;
  const hShell = field(S, (u, v) => fbm(u, v, 8, 5, 3) * .6 + Math.pow(fbm(u, v, 24, 2, 9), 3) * .6);
  const shellNormal = normalTexture(hShell, S, 7);
  const shellRough = greyTexture(hShell, S, v => .55 + v * .45);
  const shell = new T.MeshPhysicalMaterial({
    name: 'living.cocoon.shell', color: '#d2c49c', roughness: .4, roughnessMap: shellRough, metalness: 0,
    normalMap: shellNormal, normalScale: new T.Vector2(.55, .55),
    transmission: 1, thickness: .05, ior: 1.36, attenuationColor: new T.Color('#9c6a24'), attenuationDistance: .11,
    clearcoat: .12, clearcoatRoughness: .5, specularIntensity: .14, emissive: '#000000',
  });
  // Per-vertex resin data from the GLB (COLOR_0 → `resin`): x = local shell thickness, y = settled silt.
  // Optical path = thickness / |n·v|, so thin flanks stay clear while thick folds and grazing edges go
  // dark amber (Beer–Lambert through attenuationColor); thicker resin also blurs the refraction, and silt
  // crusts are opaque, matte and grey.
  {
    const prev = shell.onBeforeCompile;
    shell.onBeforeCompile = (sh, rr) => {
      prev?.call(shell, sh, rr);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 resin;\nvarying vec2 vResin;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvResin = resin;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vResin;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(.30, .28, .23), vResin.y * .85);')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + vResin.x * .12 + vResin.y * .55, 0., 1.);')
        .replace('material.transmission = transmission;', 'material.transmission = transmission * (1. - vResin.y * .9);')
        .replace('material.thickness = thickness;', 'material.thickness = thickness * mix(.25, 3.4, vResin.x) / max(abs(dot(normal, normalize(vViewPosition))), .3);')
        .replace('n, v, material.roughness, material.diffuseContribution', 'n, v, .05 + vResin.x * .38 + vResin.y * .4, material.diffuseContribution');
    };
    const key = shell.customProgramCacheKey.bind(shell);
    shell.customProgramCacheKey = () => `${key()}|resin-v1`;
  }
  /** Moves glTF COLOR_0 into the `resin` attribute (constant mid thickness when the GLB has none). */
  const bindResin = (g: T.BufferGeometry) => {
    const c = g.getAttribute('color'), n = g.getAttribute('position').count, a = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { a[i * 2] = c ? c.getX(i) : .45; a[i * 2 + 1] = c ? c.getY(i) : 0; }
    g.setAttribute('resin', new T.BufferAttribute(a, 2)); if (c) g.deleteAttribute('color');
  };
  // thin edges glow faintly (light scattering through the resin rim): the only self-light on the cocoon
  const shellRim = addRim(shell, '#a8782c', 3.6, .12);
  // the figure: dull, waterlogged and dark enough to read as a silhouette, lit just enough to show form
  const body = new T.MeshStandardMaterial({name: 'living.cocoon.body', color: '#2b2119', roughness: .78, emissive: '#000000'});
  const poolMat = new T.MeshPhysicalMaterial({
    name: 'living.cocoon.pool', color: '#3e3416', roughness: .16, metalness: 0, clearcoat: .6, clearcoatRoughness: .16,
    transmission: .3, thickness: .02, ior: 1.36, attenuationColor: new T.Color('#5a4416'), attenuationDistance: .08, specularIntensity: .5,
    normalMap: shellNormal, normalScale: new T.Vector2(.25, .25), transparent: true, opacity: .92,
  });
  owned.push(shellNormal, shellRough, shell, body, poolMat);

  const shellGroup = new T.Group(); root.add(shellGroup);
  // fallback (until/unless the GLB arrives): lumpy rounded shell over a dark curled mass
  const fallback = new T.Group(); shellGroup.add(fallback);
  {
    const g = new T.SphereGeometry(1, 40, 28), pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); const n = 1 + .07 * Math.sin(x * 9 + z * 5) * Math.cos(y * 7 + z * 3); pos.setXYZ(i, x * n, y * n, z * n); }
    g.computeVertexNormals(); bindResin(g); owned.push(g);
    const o = new T.Mesh(g, shell); o.scale.set(.4, .44, .42); o.position.copy(SC); fallback.add(o);
    const b = new T.Mesh(new T.SphereGeometry(1, 16, 12), body); b.scale.set(.3, .36, .3); b.position.copy(SC); owned.push(b.geometry); fallback.add(b);
  }
  let glbScene: T.Object3D | null = null;
  void loadActorGlb('cocoon-corpse.glb').then(gltf => {
    if (!gltf) return;
    glbScene = gltf.scene;
    // the GLB is authored in the hero frame (floor y −3); the root already sits on the floor
    glbScene.position.y = 2.97;
    glbScene.traverse(o => {
      const m = o as T.Mesh; if (!m.isMesh) return;
      (m.material as T.Material).dispose();
      if (m.name.includes('shell')) { bindResin(m.geometry); m.material = shell; m.renderOrder = 2; m.castShadow = true; m.receiveShadow = false; }
      else if (m.name.includes('pool')) { m.material = poolMat; m.renderOrder = 1; m.castShadow = false; m.receiveShadow = true; }
      else { m.material = body; m.castShadow = false; m.receiveShadow = true; }
    });
    shellGroup.add(glbScene); fallback.visible = false;
  });

  // ---------------------------------------------------------------- bubbles trapped in the resin (tiny glints, emissive only on these)
  {
    const g = new T.SphereGeometry(1, 8, 6); owned.push(g);
    const mat = new T.MeshPhysicalMaterial({color: '#f2d9a0', roughness: .05, transmission: .6, thickness: .01, emissive: '#c88a30', emissiveIntensity: .12, transparent: true, opacity: .7});
    owned.push(mat);
    const N = 50, im = new T.InstancedMesh(g, mat, N), mtx = new T.Matrix4(), q = new T.Quaternion();
    for (let i = 0; i < N; i++) {
      const a = r() * PI * 2, e = (r() - .3) * 1.2;
      const p = new T.Vector3(SC.x + Math.cos(a) * Math.cos(e) * .33, SC.y + Math.sin(e) * .38, SC.z + Math.sin(a) * Math.cos(e) * .33);
      const s = .003 + Math.pow(r(), 3) * .008;
      im.setMatrixAt(i, mtx.compose(p, q, new T.Vector3(s, s, s)));
    }
    im.renderOrder = 3; root.add(im);
  }

  // ---------------------------------------------------------------- gel strands: shell top → ceiling grid (with pads), base → floor
  const fibreMat = new T.MeshPhysicalMaterial({name: 'living.cocoon.fibre', color: '#3a2c16', roughness: .5, metalness: 0, transmission: .35, thickness: .006,
    attenuationColor: new T.Color('#6a4818'), attenuationDistance: .03, clearcoat: .15, clearcoatRoughness: .5, specularIntensity: .25});
  owned.push(fibreMat);
  const ceilingAnchors: T.Vector3[] = [];
  {
    const tubes: T.BufferGeometry[] = [];
    const bead = (p: T.Vector3, s: number) => { const g = new T.SphereGeometry(1, 8, 6); g.scale(s, s * 1.6, s); g.translate(p.x, p.y - s * .5, p.z); tubes.push(g.deleteAttribute('uv')); };
    /** Hanging fibre between unequal heights: the lowest point of the sag sits nearer the lower end. */
    const hang = (a: T.Vector3, b: T.Vector3, drop: number, drift: number) => {
      const pts: T.Vector3[] = [], side = new T.Vector3(r() - .5, 0, r() - .5).normalize().multiplyScalar(drift);
      for (let i = 0; i <= 20; i++) {
        const t = i / 20, w = Math.sin(Math.pow(t, .72) * PI);
        const p = a.clone().lerp(b, t); p.y -= w * drop; p.addScaledVector(side, w); pts.push(p);
      }
      return new T.CatmullRomCurve3(pts, false, 'centripetal');
    };
    // Traction fibres: bundles of hair-thin strands that leave the upper shell, fan apart and hang in long
    // arcs to glue pads on the ceiling grid, well off to the side (never a plumb line over the body, never in
    // the probe or pod sightlines). Each strand sags by its own amount; a few have parted and hang loose.
    const bundles: [number, number, number, number, number][] = [
      // shell offset dx, dz, ceiling offset ox, oz, strands
      [-.1, -.08, -.9, -2.6, 6], [.12, -.03, 2.6, -.7, 5], [-.02, .1, -1.9, 1.2, 4],
    ];
    for (const [dx, dz, ox, oz, n] of bundles) {
      const a0 = new T.Vector3(SC.x + dx, SC.y + .3, SC.z + dz);
      const b0 = new T.Vector3(a0.x + ox, CEIL - .012, a0.z + oz);
      for (let k = 0; k < n; k++) {
        const a = a0.clone().add(new T.Vector3((r() - .5) * .14, (r() - .5) * .05, (r() - .5) * .14));
        const b = b0.clone().add(new T.Vector3((r() - .5) * .5, 0, (r() - .5) * .5));
        const drop = .7 + r() * .7, c = hang(a, b, drop, .04 + r() * .12);
        if (k === n - 1 || r() < .12) {
          // parted strand: the ceiling half hangs down from its pad, the shell half lies back over the resin
          const cut = .45 + r() * .2, hi: T.Vector3[] = [], lo: T.Vector3[] = [];
          const top = c.getPointAt(cut), free = top.clone().add(new T.Vector3((r() - .5) * .06, -(.25 + r() * .3), (r() - .5) * .06));
          hi.push(free, free.clone().lerp(top, .55).add(new T.Vector3(0, .02, 0)));
          for (let i = 0; i <= 10; i++) hi.push(c.getPointAt(cut + (1 - cut) * i / 10));
          tubes.push(taperedTube(new T.CatmullRomCurve3(hi), 28, .0012, .0022, 4));
          for (let i = 0; i <= 6; i++) lo.push(c.getPointAt(cut * .35 * i / 6));
          tubes.push(taperedTube(new T.CatmullRomCurve3(lo), 10, .0026, .0012, 4));
          continue;
        }
        tubes.push(taperedTube(c, 48, .0022 + r() * .0008, .0011 + r() * .0006, 4));
        if (r() < .4) bead(c.getPointAt(.35 + r() * .3), .003 + r() * .003);
      }
      // glue pad where the bundle meets the ceiling grid
      const pad = new T.SphereGeometry(1, 14, 6, 0, PI * 2, PI / 2, PI / 2); pad.scale(.16 + r() * .05, .02, .14 + r() * .05); pad.rotateX(PI); pad.translate(b0.x, CEIL, b0.z);
      tubes.push(pad.deleteAttribute('uv'));
      ceilingAnchors.push(b0);
    }
    // floor slumps: short, flat tongues of gel run off the base into the pool (no tubes: they read as legs)
    const slumps: T.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const ang = i / 6 * PI * 2 + r() * .6, a = new T.Vector3(SC.x + Math.cos(ang) * .3, .06 + r() * .05, SC.z + Math.sin(ang) * .3);
      const dir = new T.Vector3(Math.cos(ang), 0, Math.sin(ang)), len = .14 + r() * .18;
      const pts: T.Vector3[] = [a];
      for (let k = 1; k <= 5; k++) { const t = k / 5; const p = a.clone().addScaledVector(dir, len * t); p.y = Math.max(.008, a.y * (1 - t) ** 2); pts.push(p); }
      const lobe = taperedTube(new T.CatmullRomCurve3(pts), 16, .045 + r() * .02, .02, 8);
      const c = new T.Vector3(); lobe.computeBoundingBox(); lobe.boundingBox!.getCenter(c);
      lobe.translate(0, -c.y, 0); lobe.scale(1, .22, 1); lobe.translate(0, c.y * .22, 0);
      slumps.push(lobe);
    }
    {
      const sg = mergeGeometries(slumps.map(t => t.index ? t.toNonIndexed() : t), false)!; slumps.forEach(t => t.dispose()); sg.computeVertexNormals(); owned.push(sg);
      const sm = new T.Mesh(sg, poolMat); sm.renderOrder = 1; sm.receiveShadow = true; root.add(sm);
    }
    const g = mergeGeometries(tubes.map(t => t.index ? t.toNonIndexed() : t).map(t => { for (const k of Object.keys(t.attributes)) if (k !== 'position' && k !== 'normal') t.deleteAttribute(k); return t; }), false)!;
    tubes.forEach(t => t.dispose()); owned.push(g);
    const fibres = new T.Mesh(g, fibreMat); fibres.castShadow = true; fibres.renderOrder = 3; root.add(fibres);
  }

  // ---------------------------------------------------------------- decals: floor contact shadow + seep + drag smear, ceiling smears at the pads
  const decal = (w: number, h: number, map: T.Texture, mat: Partial<T.MeshPhysicalMaterialParameters>, at: [number, number, number], rotY = 0, order = 1, ceiling = false) => {
    const g = new T.PlaneGeometry(w, h); g.rotateX(ceiling ? PI / 2 : -PI / 2); owned.push(g);
    const m = new T.MeshPhysicalMaterial({transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 - order, polygonOffsetUnits: -2 - order, alphaMap: map, ...mat});
    owned.push(m);
    const o = new T.Mesh(g, m); o.position.set(...at); o.rotation.y = rotY; o.receiveShadow = true; o.renderOrder = order; root.add(o); return o;
  };
  const D = 256;
  const contact = pixelTexture(D, (x, y) => {
    const u = x / D - .5, v = y / D - .5; const d = Math.hypot(u / .5, v / .42);
    const a = (1 - smooth(.3, 1, d)) * (.75 + fbm(x / D, y / D, 5, 3, 4) * .25);
    const g = a * 255; return [g, g, g, 255];
  }, false, false);
  owned.push(contact);
  decal(1.5, 1.3, contact, {color: '#000000', roughness: 1, opacity: 1}, [SC.x, .004, SC.z], 0, 1);
  const seepH = field(D, (u, v) => fbm(u, v, 5, 5, 12));
  const seep = pixelTexture(D, (x, y, i) => {
    const u = x / D - .5, v = y / D - .5; const d = Math.hypot(u / .5, v / .42) + (seepH[i] - .5) * .55;
    const g = (1 - smooth(.55, .7, d)) * 255; return [g, g, g, 255];
  }, false, false);
  const seepN = normalTexture(seepH, D, 3, false);
  owned.push(seep, seepN);
  decal(2.8, 2.3, seep, {color: '#2e2410', roughness: .06, clearcoat: 1, clearcoatRoughness: .05, opacity: .75, normalMap: seepN, normalScale: new T.Vector2(.3, .3)}, [SC.x, .006, SC.z], .3, 2);
  // drag smear: streaked, wet, fading toward the east-wall pipes (+x)
  const W = 512, H = 96;
  const streak = pixelTexture(W, (x, y) => {
    const u = x / W, v = y / H; const band = Math.sin(v * PI); const s = fbm(u * .25, v, 4, 4, 21);
    const lanes = .55 + .45 * Math.sin(v * 38 + fbm(u, v, 3, 2, 7) * 6);
    const a = band * (1 - smooth(.35, 1, u)) * smooth(0, .05, u) * smooth(.25, .6, s * lanes + band * .3);
    const g = Math.min(255, a * 300); return [g, g, g, 255];
  }, false, false, H);
  owned.push(streak);
  decal(3.4, .9, streak, {color: '#1e1408', roughness: .1, clearcoat: 1, clearcoatRoughness: .08, opacity: 1}, [2.1, .008, .35], -.25, 3);
  // gel smears on the ceiling tiles round each pad (so the ropes visibly end on something)
  const smear = pixelTexture(128, (x, y) => {
    const u = x / 128 - .5, v = y / 128 - .5; const d = Math.hypot(u, v) * 2 + (fbm(x / 128, y / 128, 6, 4, 33) - .5) * .7;
    const g = (1 - smooth(.45, .8, d)) * 255; return [g, g, g, 255];
  }, false, false);
  owned.push(smear);
  for (const a of ceilingAnchors) decal(.55 + r() * .3, .45 + r() * .3, smear, {color: '#3d3014', roughness: .08, clearcoat: 1, clearcoatRoughness: .06, opacity: .9}, [a.x, CEIL - .004, a.z], r() * PI, 4, true);

  return {
    root,
    update(time) {
      // the resin settles very slightly (not alive): rim shimmer only
      shellRim.uRim.value = .12 + Math.sin(time * .4) * .015;
    },
    dispose() { if (glbScene) disposeGlbScene(glbScene); owned.forEach(o => o.dispose()); },
  };
}
