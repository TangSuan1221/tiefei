import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {setupRig, visorEnv} from './living-alex';
import {disposeGlbScene} from './living-glb';
import type {EliasRig} from './harbor-elias-pose';

/** Retarget the existing story IK to the same Blender diver used in chapter two.
 * The old joints remain authoritative for all performance, travel and evidence.
 */
export function createHarborEliasSkin(source: EliasRig) {
  const fallback: T.Mesh[] = [];
  source.root.traverse(o => {if ((o as T.Mesh).isMesh) fallback.push(o as T.Mesh);});
  const owned: {dispose(): void}[] = [];
  let disposed = false;
  let skin: NonNullable<ReturnType<typeof setupRig>> | null = null;
  let soleDrop = 0;
  const originalRoot = new T.Quaternion(), delta = new T.Quaternion(), temp = new T.Quaternion();
  const p = new T.Vector3();
  const bindings = new Map<string, T.Object3D>([
    ['spine', source.upper], ['head', source.head],
    ...source.arms.flatMap(a => {
      const side = a.side < 0 ? 'R' : 'L';
      return [[`upper_${side}`, a.shoulder], [`fore_${side}`, a.elbow], [`hand_${side}`, a.hand]] as [string, T.Object3D][];
    }),
    ...source.legs.flatMap(a => {
      const side = a.side < 0 ? 'R' : 'L';
      return [[`thigh_${side}`, a.hip], [`shin_${side}`, a.knee], [`foot_${side}`, a.foot]] as [string, T.Object3D][];
    }),
  ]);
  const posed = new Map<string, T.Quaternion>();
  const worldDelta = new Map<string, T.Quaternion>();
  const loader = new T.TextureLoader();
  const ld = async (file: string, srgb = false) => {
    const texture = await loader.loadAsync(`/assets/deepsea/living/src/${file}`);
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = 8; texture.colorSpace = srgb ? T.SRGBColorSpace : T.NoColorSpace;
    if (disposed) texture.dispose(); else owned.push(texture);
    return texture;
  };
  source.root.userData.skinStatus = 'loading';
  const ready = Promise.all([
    new GLTFLoader().loadAsync('/assets/deepsea/living/living-diver-alex.glb'),
    ld('rough_linen_nor_gl_2k.jpg'), ld('rough_linen_rough_2k.jpg'),
    ld('fabric_leather_02_nor_gl_2k.jpg'), ld('painted_metal_shutter_rough_2k.jpg'),
    ld('rough_linen_diff_2k.jpg', true), ld('rough_linen_arm_2k.jpg'),
  ]).then(([gltf, linenNormal, linenRough, leatherNormal, metalRough, linenDiff, linenArm]) => {
    if (disposed) {disposeGlbScene(gltf.scene); return;}
    const env = visorEnv();
    const rig = setupRig(gltf.scene, undefined, {linenNormal, linenRough, leatherNormal, metalRough, linenDiff, linenArm}, env, owned);
    if (!rig) {env.dispose(); disposeGlbScene(gltf.scene); source.root.userData.skinStatus = 'fallback'; return;}
    const box = new T.Box3().setFromObject(gltf.scene);
    const height = box.max.y - box.min.y;
    const scale = 1.73 / height;
    soleDrop = Math.min(rig.bones.get('foot_L')!.getWorldPosition(p).y, rig.bones.get('foot_R')!.getWorldPosition(p).y) - box.min.y;
    gltf.scene.scale.setScalar(scale);
    gltf.scene.name = 'harbor-elias-blender-skin';
    source.root.add(gltf.scene); skin = rig;
    fallback.forEach(mesh => {mesh.visible = false;});
    source.root.userData.skinStatus = 'ready';
    update();
  }).catch(error => {if (!disposed) {source.root.userData.skinStatus = 'fallback'; console.warn('[harbor] Elias skin kept procedural fallback', error);}});

  function update() {
    if (!skin || disposed) return;
    const R = skin;
    source.root.updateWorldMatrix(true, true);
    originalRoot.copy(source.root.getWorldQuaternion(temp)).invert();
    // Parent-before-child map order is shared with the living deck rig. Blender
    // bone axes are not Euler-compatible with the procedural -Y limb chains.
    for (const [name, bone] of R.bones) {
      const parent = R.parents.get(name);
      const driver = bindings.get(name);
      const D = worldDelta.get(name) ?? new T.Quaternion();
      if (driver) D.copy(driver.getWorldQuaternion(temp)).premultiply(originalRoot);
      else if (parent) D.copy(worldDelta.get(parent)!);
      else D.identity();
      worldDelta.set(name, D);
      const Q = posed.get(name) ?? new T.Quaternion();
      Q.copy(D).multiply(R.restWorld.get(name)!); posed.set(name, Q);
      delta.copy(parent ? posed.get(parent)! : R.rootParentWorld).invert();
      bone.quaternion.copy(delta.multiply(Q));
    }
    // Keep the boot soles on the story rig's planted-foot plane during crouches
    // and walks despite the two meshes having different leg proportions.
    R.scene.position.y = 0;
    source.root.updateWorldMatrix(true, true);
    const sourceFloor = Math.min(...source.legs.map(a => source.root.worldToLocal(a.foot.getWorldPosition(p)).y)) - .095;
    const skinFloor = Math.min(...['foot_L', 'foot_R'].map(n => source.root.worldToLocal(R.bones.get(n as 'foot_L' | 'foot_R')!.getWorldPosition(p)).y)) - soleDrop * R.scene.scale.y;
    R.scene.position.y = sourceFloor - skinFloor;
    R.scene.updateWorldMatrix(false, true);
  }
  return {ready, update, dispose() {
    disposed = true;
    if (skin) {skin.scene.removeFromParent(); disposeGlbScene(skin.scene);}
    owned.forEach(resource => resource.dispose());
  }};
}
