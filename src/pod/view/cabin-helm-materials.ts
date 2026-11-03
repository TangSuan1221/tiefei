import * as THREE from 'three';

/** Shared, deterministic material set. All GPU textures belong to the cabin disposer. */
export function createHelmMaterials(textures: THREE.Texture[]) {
  const size = 2048;
  let seed = 731;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const field = (frequency: number) => {
    const grid = Float32Array.from({ length: frequency * frequency }, random);
    return (u: number, v: number) => {
      const x = u * frequency, y = v * frequency;
      const ix = Math.floor(x), iy = Math.floor(y);
      const sx = x - ix, sy = y - iy;
      const tx = sx * sx * (3 - 2 * sx), ty = sy * sy * (3 - 2 * sy);
      const at = (a: number, b: number) => grid[((b + frequency) % frequency) * frequency + (a + frequency) % frequency];
      return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix, iy), at(ix + 1, iy), tx), THREE.MathUtils.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), tx), ty);
    };
  };
  const broad = field(5), stain = field(19), flake = field(113), grain = field(617);
  const canvas = () => { const c = document.createElement('canvas'); c.width = c.height = size; return c; };
  const albedo = canvas(), response = canvas(), relief = canvas();
  const a = albedo.getContext('2d')!, r = response.getContext('2d')!, h = relief.getContext('2d')!;
  const colorPixels = a.createImageData(size, size), surfacePixels = r.createImageData(size, size), heightPixels = h.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, index = (y * size + x) * 4;
    const low = broad(u, v), mid = stain(u, v), high = flake(u, v), fine = grain(u, v);
    const edge = Math.min(u, v, 1 - u, 1 - v);
    // Chips follow the perimeter and break up into irregular islands, not rectangles.
    const edgeBand = v < .04 || v > .96 ? .039 : .022;
    const chipped = edge < .0012 + Math.pow(high * .7 + mid * .3, 3) * edgeBand && low > .19;
    const rust = !chipped && edge < .012 && mid > .75 && high > .63;
    const oil = Math.max(0, mid - .56) * Math.max(0, low - .25) * 1.7;
    const value = 178 + low * 32 + mid * 12 + (fine - .5) * 18 - oil * 100;
    colorPixels.data[index] = chipped ? 170 + fine * 36 : rust ? 151 + fine * 17 : value;
    colorPixels.data[index + 1] = chipped ? 181 + fine * 36 : rust ? 143 + fine * 15 : value + 2;
    colorPixels.data[index + 2] = chipped ? 180 + fine * 36 : rust ? 129 + fine * 13 : value;
    colorPixels.data[index + 3] = 255;
    // G = roughness, B = metalness. Exposed iron reflects; paint and oxidation do not.
    surfacePixels.data[index] = 255;
    surfacePixels.data[index + 1] = chipped ? 94 + fine * 44 : rust ? 220 : 160 + mid * 48 - oil * 92;
    surfacePixels.data[index + 2] = chipped ? 244 : rust ? 38 : 68 + low * 28;
    surfacePixels.data[index + 3] = 255;
    const height = chipped ? 108 + fine * 10 : 124 + (fine - .5) * 24 + high * 7;
    heightPixels.data[index] = heightPixels.data[index + 1] = heightPixels.data[index + 2] = height;
    heightPixels.data[index + 3] = 255;
  }
  a.putImageData(colorPixels, 0, 0); r.putImageData(surfacePixels, 0, 0); h.putImageData(heightPixels, 0, 0);
  // Sparse directional hand/tool scratches, concentrated on the operator-facing edge.
  for (let i = 0; i < 1800; i++) {
    const x = random() * size, y = i < 150 ? size * (.82 + random() * .18) : random() * size;
    const length = 1 + Math.pow(random(), 2) * 48, dy = (random() - .5) * 5;
    for (const [context, color] of [[a, 'rgba(205,210,192,.5)'], [h, 'rgba(78,78,78,.42)'], [r, 'rgba(255,137,180,.65)']] as const) {
      context.strokeStyle = color; context.lineWidth = .6 + random() * .9;
      context.beginPath(); context.moveTo(x, y); context.lineTo(x + length, y + dy); context.stroke();
    }
  }
  // Thin gravity streaks and overlapping wipe arcs interrupt isotropic noise.
  for (let i = 0; i < 34; i++) {
    const x = random() * size, y = random() * size, length = 12 + random() * 120;
    a.strokeStyle = `rgba(39,44,37,${.035 + random() * .07})`; a.lineWidth = .7 + random() * 3;
    a.beginPath(); a.moveTo(x, y); a.bezierCurveTo(x + 2, y + length * .3, x - 3, y + length * .7, x - 1, y + length); a.stroke();
    r.strokeStyle = 'rgba(255,90,62,.15)'; r.lineWidth = a.lineWidth + 2;
    r.beginPath(); r.moveTo(x, y); r.lineTo(x - 1, y + length); r.stroke();
  }
  for (let i = 0; i < 16; i++) {
    const x = random() * size, y = random() * size;
    a.strokeStyle = 'rgba(220,222,203,.045)'; a.lineWidth = 4 + random() * 10;
    a.beginPath(); a.ellipse(x, y, 30 + random() * 90, 6 + random() * 20, random(), .2, 2.5); a.stroke();
  }
  const texture = (source: HTMLCanvasElement, color = false) => {
    const map = new THREE.CanvasTexture(source);
    map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.anisotropy = 8; textures.push(map); return map;
  };
  const enamelMap = texture(albedo, true), responseMap = texture(response), noise = texture(relief);
  // Local reflection capture: a cool overhead strip and subdued warm console bounce.
  // Assigned only to this model; the exterior's lighting and environment are untouched.
  const reflectionFaces = Array.from({ length: 6 }, (_, side) => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = side === 3 ? '#070b09' : '#111914'; g.fillRect(0, 0, 128, 128);
    if (side === 2 || side === 0) {
      const glow = g.createRadialGradient(48, 39, 2, 48, 39, side === 2 ? 59 : 72);
      glow.addColorStop(0, side === 2 ? '#d3dedf' : '#929a9a');
      glow.addColorStop(.42, side === 2 ? '#7b8c8e' : '#424a4b');
      glow.addColorStop(1, '#111914'); g.fillStyle = glow; g.fillRect(0, 0, 128, 128);
      if (side === 2) {
        const strip = g.createLinearGradient(0, 28, 0, 46);
        strip.addColorStop(0, 'rgba(222,232,234,0)'); strip.addColorStop(.5, 'rgba(222,232,234,.9)'); strip.addColorStop(1, 'rgba(222,232,234,0)');
        g.fillStyle = strip; g.fillRect(21, 28, 62, 18);
      }
    }
    return c;
  });
  const environment = new THREE.CubeTexture(reflectionFaces);
  environment.colorSpace = THREE.SRGBColorSpace; environment.needsUpdate = true; textures.push(environment);
  const variants = Array.from({ length: 4 }, (_, i) => [enamelMap, responseMap, noise].map(source => {
    if (!i) return source;
    const map = source.clone(); map.center.set(.5, .5); map.rotation = i === 1 ? Math.PI : 0;
    if (i >= 2) map.repeat.set(i === 2 ? -1 : 1, -1);
    map.needsUpdate = true; textures.push(map); return map;
  }));
  let materialIndex = 0;
  const painted = (color: number, edgeWear = 0) => {
    const maps = variants[materialIndex++ % variants.length];
    const material = new THREE.MeshStandardMaterial({ color, map: maps[0], roughnessMap: maps[1], metalnessMap: maps[1], metalness: 1, roughness: 1, bumpMap: maps[2], bumpScale: .00038, envMap: environment, envMapIntensity: .65 });
    // A paint chip exposes neutral metal, not a green-tinted version of the enamel.
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        #ifdef USE_METALNESSMAP
          float exposedSteel = smoothstep(0.65, 0.92, texture2D(metalnessMap, vMetalnessMapUv).b);
          vec2 helmEdge = min(vMapUv, vec2(1.0) - vMapUv);
          float edgeAbrasion = (1.0 - smoothstep(0.0, ${Math.max(.0001, .045 * edgeWear).toFixed(4)}, min(helmEdge.x, helmEdge.y))) * ${edgeWear.toFixed(4)};
          exposedSteel = max(exposedSteel, edgeAbrasion * texture2D(roughnessMap, vRoughnessMapUv).g);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.192, 0.195), exposedSteel * 0.88);
        #endif`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.36, exposedSteel);');
      shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.82, exposedSteel);');
    };
    material.customProgramCacheKey = () => `helm-exposed-steel-v2-${edgeWear}`;
    return material;
  };
  const steel = painted(0x3b443e), face = painted(0x424b44);
  const metalCanvas = canvas(), metalRoughCanvas = canvas();
  const m = metalCanvas.getContext('2d')!, mr = metalRoughCanvas.getContext('2d')!;
  m.fillStyle = '#d4dadb'; m.fillRect(0, 0, size, size); mr.fillStyle = '#9a9a9a'; mr.fillRect(0, 0, size, size);
  for (let i = 0; i < 7800; i++) {
    const x = random() * size, y = random() * size, length = 1 + random() * 42;
    m.strokeStyle = i % 4 ? 'rgba(33,44,38,.17)' : 'rgba(229,234,220,.3)'; m.lineWidth = .4 + random() * .8;
    m.beginPath(); m.moveTo(x, y); m.lineTo(x + length, y + random() * 1.7); m.stroke();
  }
  m.globalCompositeOperation = 'multiply'; m.globalAlpha = .3; m.drawImage(albedo, 0, 0); m.globalAlpha = 1; m.globalCompositeOperation = 'source-over';
  mr.globalAlpha = .55; mr.drawImage(relief, 0, 0); mr.globalAlpha = .25; mr.drawImage(albedo, 0, 0);
  const metalColor = m.getImageData(0, 0, size, size), metalResponse = mr.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, i = (y * size + x) * 4;
    const patch = THREE.MathUtils.clamp((broad(u, v) * .7 + stain(u, v) * .3 - .35) * 2.8, 0, .8);
    for (let channel = 0; channel < 3; channel++) {
      metalColor.data[i + channel] *= 1 - patch * .67;
      metalResponse.data[i + channel] = 102 + patch * 94;
    }
  }
  m.putImageData(metalColor, 0, 0); mr.putImageData(metalResponse, 0, 0);
  const metal = new THREE.MeshStandardMaterial({ color: 0xb0b6ba, map: texture(metalCanvas, true), roughnessMap: texture(metalRoughCanvas), metalness: .82, roughness: .72, bumpMap: noise, bumpScale: .00022, envMap: environment, envMapIntensity: 1.1 });
  const wornSteel = painted(0x7b827c, 1.35);
  // The hand-rest has a 42:1 aspect ratio. A square panel UV would stretch every
  // chip into a brushed horizontal line, so use a seamless strip at physical density.
  const stripMap = (source: HTMLCanvasElement, color = false, removeHorizontalEdges = false) => {
    const strip = document.createElement('canvas'); strip.width = 1024; strip.height = 1024;
    const context = strip.getContext('2d')!;
    // Discard left/right panel borders: each tile retains only top/bottom abrasion.
    context.drawImage(source, size * .08, removeHorizontalEdges ? size * .08 : 0, size * .84, removeHorizontalEdges ? size * .84 : size, 0, 0, 1024, 1024);
    const pixels = context.getImageData(0, 0, 1024, 1024);
    // Cross-fade a narrow seam against the opposite edge, preserving irregular wear.
    const copy = new Uint8ClampedArray(pixels.data);
    for (let y = 0; y < 1024; y++) for (let x = 0; x < 48; x++) {
      const blend = (1 - x / 48) * .5;
      const left = (y * 1024 + x) * 4, right = (y * 1024 + 1023 - x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        pixels.data[left + channel] = THREE.MathUtils.lerp(copy[left + channel], copy[right + channel], blend);
        pixels.data[right + channel] = THREE.MathUtils.lerp(copy[right + channel], copy[left + channel], blend);
      }
    }
    context.putImageData(pixels, 0, 0);
    const map = texture(strip, color); map.wrapS = THREE.RepeatWrapping; map.repeat.set(16, 1); return map;
  };
  const frontLip = painted(0x7b827c);
  // Calibrated locally from the lip sample, with approximate inverse-ACES response;
  // this raises the hand-rest value without throwing extra light onto the controls.
  frontLip.color.multiply(new THREE.Color().setRGB(1.645, 1.593, 1.339));
  frontLip.color.multiply(new THREE.Color().setRGB(.85, .86, .68));
  frontLip.color.multiply(new THREE.Color().setRGB(.79, .77, .68));
  frontLip.name = 'helm-front-lip-physical-scale';
  frontLip.map = stripMap(albedo, true); frontLip.roughnessMap = stripMap(response);
  frontLip.metalnessMap = frontLip.roughnessMap; frontLip.bumpMap = stripMap(relief);
  // Whole-length damage is independent of the 16 repeated microdetail tiles.
  // R: missing enamel, G: oxidation, B: broad oil film. No lighting is painted in.
  const lipDamageCanvas = document.createElement('canvas'); lipDamageCanvas.width = 2048; lipDamageCanvas.height = 128;
  const lipContext = lipDamageCanvas.getContext('2d')!, lipPixels = lipContext.createImageData(2048, 128);
  // Pixel-space, non-periodic noise keeps x/y grain physically comparable on a
  // 16:1 image. One-dimensional gates previously made literal rectangular stains.
  const stripNoise = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const hash = (a: number, b: number) => {
      let n = Math.imul(a, 374761393) + Math.imul(b, 668265263) + 731;
      n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967295;
    };
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), sx), THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx), sy);
  };
  for (let x = 0; x < 2048; x++) for (let y = 0; y < 128; y++) {
    const py = y * 1.25, index = (y * 2048 + x) * 4;
    const fine = stripNoise(x / 2.8, py / 2.8), medium = stripNoise(x / 18, py / 18);
    const depth = 2.5 + stripNoise(x / 57, py / 57) * 13 + (medium - .5) * 9;
    const island = THREE.MathUtils.smoothstep(stripNoise(x / 23 + 12, py / 23 + 7), .38, .57);
    const lower = THREE.MathUtils.smoothstep(depth - (127 - y) + (fine - .5) * 5, -.8, .8) * island;
    const upper = THREE.MathUtils.smoothstep(1.8 + (fine - .5) * 3 - y, -.8, .8) * THREE.MathUtils.smoothstep(medium, .48, .68);
    const exposed = Math.max(lower, upper);
    const vicinity = 1 - THREE.MathUtils.smoothstep((127 - y) / 128, .05, .82);
    const oxide = (1 - exposed) * THREE.MathUtils.smoothstep(stripNoise(x / 23 + 9, py / 23 + 13) * .65 + medium * .35, .54, .72) * (.18 + vicinity * .82);
    const oil = stripNoise(x / 240, py / 240) * .65 + stripNoise(x / 83 + 8, py / 83 + 5) * .35;
    lipPixels.data[index] = exposed * (150 + fine * 105);
    lipPixels.data[index + 1] = oxide * 245;
    lipPixels.data[index + 2] = 90 + oil * 130;
    lipPixels.data[index + 3] = 255;
  }
  lipContext.putImageData(lipPixels, 0, 0);
  const lipDamage = texture(lipDamageCanvas); lipDamage.name = 'helm-front-lip-unique-damage';
  const frontLipShader = frontLip.onBeforeCompile;
  frontLip.onBeforeCompile = (shader, renderer) => {
    frontLipShader(shader, renderer);
    shader.uniforms.helmLipDamage = { value: lipDamage };
    shader.vertexShader = 'varying vec2 vHelmStripUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvHelmStripUv = uv;');
    shader.fragmentShader = 'varying vec2 vHelmStripUv;\nuniform sampler2D helmLipDamage;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 stripDamage = texture2D(helmLipDamage, vHelmStripUv).rgb;
      diffuseColor.rgb *= mix(0.43, 1.36, smoothstep(0.43, 0.73, stripDamage.b));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.018, 0.025, 0.021), stripDamage.g * 0.78);
      vec3 wornIron = mix(vec3(0.075, 0.09, 0.08), vec3(0.32, 0.35, 0.325), smoothstep(0.45, 0.95, stripDamage.r));
      diffuseColor.rgb = mix(diffuseColor.rgb, wornIron, stripDamage.r * 0.9);
      exposedSteel = max(exposedSteel, stripDamage.r);
    `);
  };
  frontLip.customProgramCacheKey = () => 'helm-front-lip-strip-v2';
  // Reserved for the folded return below the skirt. It carries the same physical
  // grain/oil family, but deliberately has no macro paint-loss edge of its own.
  const frontFold = new THREE.MeshStandardMaterial({ color: frontLip.color.clone(), map: stripMap(albedo, true, true), roughness: .85, metalness: .12, bumpMap: stripMap(relief, false, true), bumpScale: .0002, envMap: environment, envMapIntensity: .5 });
  frontFold.name = 'helm-front-fold-without-repeated-edge';
  frontFold.onBeforeCompile = shader => {
    shader.uniforms.helmFoldOil = { value: lipDamage };
    shader.vertexShader = 'varying vec2 vHelmFoldUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvHelmFoldUv = uv;');
    shader.fragmentShader = 'varying vec2 vHelmFoldUv;\nuniform sampler2D helmFoldOil;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 foldOil = texture2D(helmFoldOil, vHelmFoldUv).rgb;
      diffuseColor.rgb *= mix(0.43, 1.36, smoothstep(0.43, 0.73, foldOil.b));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.03, 0.025), foldOil.g * 0.3);
    `);
  };
  frontFold.customProgramCacheKey = () => 'helm-fold-oil-no-edge-v1';
  const edgeMetal = metal.clone(); edgeMetal.roughness = .83; edgeMetal.envMapIntensity = .9;
  // Authored paint contains the final enamel value. Input colors only vary temperature;
  // multiplying it by the old dark procedural tint would apply the paint value twice.
  const authoredMaps: THREE.Texture[] = [];
  const authoredMap = new THREE.TextureLoader().load('/assets/cabin/helm/worn-enamel-albedo-v2.png', () => {
    for (const map of authoredMaps) { map.userData.loaded = true; map.userData.loadState = 'loaded'; map.needsUpdate = true; }
  }, undefined, () => {
    for (const map of authoredMaps) { map.userData.loaded = false; map.userData.loadState = 'error'; }
  });
  authoredMap.name = 'helm-authored-enamel-albedo'; authoredMap.colorSpace = THREE.SRGBColorSpace; authoredMap.anisotropy = 8;
  authoredMap.userData = { helmAuthoredAlbedo: true, loaded: false, loadState: 'loading' };
  authoredMaps.push(authoredMap); textures.push(authoredMap);
  // Two old label calls formerly preceded the main plates. Preserve their calibrated
  // left/middle/right orientations (2, 3, 0) after moving labels to legendPlate.
  let authoredIndex = 2;
  const microCanvas = document.createElement('canvas'); microCanvas.width = microCanvas.height = 512;
  const microContext = microCanvas.getContext('2d')!, microPixels = microContext.createImageData(512, 512);
  const legendCanvas = document.createElement('canvas'); legendCanvas.width = legendCanvas.height = 512;
  const legendContext = legendCanvas.getContext('2d')!, legendPixels = legendContext.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * 4, micro = 119 + random() * 18;
    microPixels.data[i] = microPixels.data[i + 1] = microPixels.data[i + 2] = micro; microPixels.data[i + 3] = 255;
    const value = 194 + stain(x / 512, y / 512) * 8 + (micro - 128) * .28;
    legendPixels.data[i] = value; legendPixels.data[i + 1] = value + 2; legendPixels.data[i + 2] = value - 4; legendPixels.data[i + 3] = 255;
  }
  microContext.putImageData(microPixels, 0, 0); legendContext.putImageData(legendPixels, 0, 0);
  const authoredMicro = texture(microCanvas); authoredMicro.wrapS = authoredMicro.wrapT = THREE.RepeatWrapping; authoredMicro.repeat.set(6, 6);
  const legendBase = texture(legendCanvas, true); legendBase.wrapS = legendBase.wrapT = THREE.RepeatWrapping;
  const legendWearCanvas = document.createElement('canvas'); legendWearCanvas.width = legendWearCanvas.height = 512;
  const legendWearContext = legendWearCanvas.getContext('2d')!, legendWearPixels = legendWearContext.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const i = (y * 512 + x) * 4;
    legendWearPixels.data[i] = stripNoise(x / 43 + 11, y / 43 + 7) * 255;
    legendWearPixels.data[i + 1] = stripNoise(x / 9 + 23, y / 9 + 31) * 255;
    legendWearPixels.data[i + 2] = 128; legendWearPixels.data[i + 3] = 255;
  }
  legendWearContext.putImageData(legendWearPixels, 0, 0);
  const legendWear = texture(legendWearCanvas); legendWear.wrapS = legendWear.wrapT = THREE.RepeatWrapping;
  const authoredPainted = (color: number, linearGain: number | [number, number, number] = .4) => {
    const index = authoredIndex++ % 4;
    const map = index ? authoredMap.clone() : authoredMap;
    if (index) {
      map.center.set(.5, .5); map.rotation = index === 1 ? Math.PI : 0;
      if (index >= 2) map.repeat.set(index === 2 ? -1 : 1, -1);
      map.userData = { ...authoredMap.userData }; authoredMaps.push(map); textures.push(map);
    }
    const tint = new THREE.Color(color), mean = (tint.r + tint.g + tint.b) / 3;
    tint.setRGB(...[tint.r, tint.g, tint.b].map(channel => THREE.MathUtils.clamp(1 + (channel / Math.max(mean, .001) - 1) * .12, .9, 1.08)) as [number, number, number]);
    // Explicit linear-light calibration keeps plate temperature and exposure separate.
    // This also lets small engraved labels retain their deliberately dark substrate.
    const gain = typeof linearGain === 'number' ? [linearGain, linearGain, linearGain] : linearGain;
    tint.r *= gain[0]; tint.g *= gain[1]; tint.b *= gain[2];
    if (index === 3) tint.multiply(new THREE.Color().setRGB(.9, .9, .78));
    if (index === 3) tint.multiply(new THREE.Color().setRGB(2.3 * .95, 2.3, 2.3 * 1.4));
    if (index === 3) tint.multiply(new THREE.Color().setRGB(1.379, 1.297, 1.403));
    if (index === 2) tint.multiplyScalar(1.25);
    const material = new THREE.MeshStandardMaterial({ color: tint, map, roughness: index === 3 ? .9 : .76, metalness: index === 3 ? 0 : .18, bumpMap: authoredMicro, bumpScale: .000085, envMap: environment, envMapIntensity: .65 });
    material.name = 'helm-authored-painted-steel';
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        vec2 authoredEdgeUv = min(vMapUv, vec2(1.0) - vMapUv);
        float authoredEdgeMask = 1.0 - smoothstep(0.012, 0.065, min(authoredEdgeUv.x, authoredEdgeUv.y));
        float authoredLuminance = dot(sampledDiffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float authoredSteel = authoredEdgeMask * smoothstep(0.08, 0.25, authoredLuminance);
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(${index === 3 ? '0.87, 0.94' : '0.63, 0.82'}, smoothstep(0.025, 0.14, authoredLuminance)), 0.38, authoredSteel);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.78, authoredSteel);');
    };
    material.customProgramCacheKey = () => `helm-authored-paint-v4-${index === 3 ? 'dielectric' : 'base'}`;
    return material;
  };
  const legendPlate = (width: number, height: number, darkPlate = false) => {
    const map = legendBase.clone(); map.repeat.set(width / .09, height / .09); map.needsUpdate = true; textures.push(map);
    const material = new THREE.MeshStandardMaterial({ color: darkPlate ? 0x3d423a : 0x51534a, map, metalness: .22, roughness: .81, bumpMap: authoredMicro, bumpScale: .00006, envMap: environment, envMapIntensity: .55 });
    material.color.multiplyScalar(.4);
    material.name = 'helm-engraved-metal-plate';
    material.onBeforeCompile = shader => {
      shader.uniforms.helmLegendWear = { value: legendWear };
      shader.vertexShader = 'varying vec2 vLegendPhysicalUv;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvLegendPhysicalUv = uv;');
      shader.fragmentShader = 'varying vec2 vLegendPhysicalUv;\nuniform sampler2D helmLegendWear;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        vec2 plateEdge = min(vLegendPhysicalUv, vec2(1.0) - vLegendPhysicalUv) * vec2(${width.toFixed(5)}, ${height.toFixed(5)});
        vec2 plateWear = texture2D(helmLegendWear, vMapUv).rg;
        float plateDistance = min(plateEdge.x, plateEdge.y);
        float plateChip = (1.0 - smoothstep(0.0003, 0.0018, plateDistance)) * smoothstep(0.44, 0.68, plateWear.r) * (0.55 + plateWear.g * 0.45);
        float plateOil = (1.0 - smoothstep(0.0006, 0.004, plateDistance)) * smoothstep(0.35, 0.68, plateWear.r) * (1.0 - plateChip);
        diffuseColor.rgb *= 1.0 - plateOil * 0.3;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.18, 0.16), plateChip * 0.78);
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.42, plateChip);');
      shader.fragmentShader = shader.fragmentShader.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.7, plateChip);');
    };
    material.customProgramCacheKey = () => `helm-legend-physical-v2-${width}-${height}`;
    return material;
  };
  const dark = new THREE.MeshStandardMaterial({ color: 0x111915, metalness: .05, roughness: .72, bumpMap: noise, bumpScale: .00014 });
  // Aged rubber has dielectric reflections on its rolled folds, rather than the
  // light-absorbing response of a recessed cavity. Keep these materials separate.
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1c251f, metalness: 0, roughness: 1, roughnessMap: noise, bumpMap: noise, bumpScale: .00008, envMap: environment, envMapIntensity: .8 });
  rubber.name = 'helm-rubber-bellows';
  const gripRubber = rubber.clone(); gripRubber.name = 'helm-hand-polished-rubber';
  gripRubber.roughness = .73; gripRubber.color.setHex(0x18221d); gripRubber.envMapIntensity = .95;
  const recess = new THREE.MeshStandardMaterial({ color: 0x050a08, roughness: .95 });
  const hazardCanvas = canvas(), hazardContext = hazardCanvas.getContext('2d')!;
  hazardContext.fillStyle = '#99894b'; hazardContext.fillRect(0, 0, size, size);
  hazardContext.fillStyle = '#242a21';
  for (let x = -size; x < size * 2; x += size / 4) {
    hazardContext.beginPath(); hazardContext.moveTo(x, 0); hazardContext.lineTo(x + size / 8, 0); hazardContext.lineTo(x + size / 8 - size, size); hazardContext.lineTo(x - size, size); hazardContext.closePath(); hazardContext.fill();
  }
  const wornHazard = hazardContext.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, i = (y * size + x) * 4;
    const low = broad(u, v), mid = stain(u, v), high = flake(u, v);
    const wear = THREE.MathUtils.clamp((low * .55 + mid * .32 + high * .13 - .30) * 2.7, 0, .94);
    const grime = low > .57 ? [43, 45, 33] : [108, 111, 91];
    for (let channel = 0; channel < 3; channel++) wornHazard.data[i + channel] = THREE.MathUtils.lerp(wornHazard.data[i + channel], grime[channel], wear);
  }
  hazardContext.putImageData(wornHazard, 0, 0);
  hazardContext.globalCompositeOperation = 'multiply'; hazardContext.drawImage(albedo, 0, 0); hazardContext.globalCompositeOperation = 'source-over';
  const hazard = new THREE.MeshStandardMaterial({ color: 0xa1a795, map: texture(hazardCanvas, true), metalness: .35, roughness: .78, bumpMap: noise, bumpScale: .0002, envMap: environment, envMapIntensity: .24 });
  return { steel, face, metal, edgeMetal, wornSteel, frontLip, frontFold, dark, rubber, gripRubber, recess, painted, authoredPainted, legendPlate, noise, hazard };
}
