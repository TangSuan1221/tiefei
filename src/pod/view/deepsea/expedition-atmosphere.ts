import { MathUtils, PerspectiveCamera, SpotLight, Vector2 } from 'three';
import { createAtmosphere } from './living-atmosphere';
import {createLegacyExpeditionAtmosphere} from './legacy-expedition-atmosphere';

/**
 * The harbor uses the same four world-space sediment layers as the living deck.
 * Translation/rotation creates genuine near-field parallax; no screen-space rain,
 * artificial forward velocity or colliders are added. Panacea is not fluorescent silt.
 */
export function createExpeditionAtmosphere(harbor=false) {
  if(!harbor)return createLegacyExpeditionAtmosphere();
  const atmosphere = createAtmosphere();
  const {root, optics} = atmosphere;
  root.name = 'harbor-layered-suspended-sediment';
  optics.uSlime.value = 0;
  optics.uSigma.value = .042;
  const viewport = new Vector2();
  // The feed resolution and camera zoom change independently of the browser size.
  // Match physical particle coverage to the actual active render target each draw.
  root.traverse(object => {
    if (!object.name.startsWith('living-snow-')) return;
    object.onBeforeRender = (renderer, _scene, camera) => {
      const target = renderer.getRenderTarget();
      const height = target ? target.height : renderer.getDrawingBufferSize(viewport).y;
      optics.uFocalPx.value = .5 * height / Math.tan(MathUtils.degToRad((camera as PerspectiveCamera).fov) / 2);
    };
  });
  return {
    root,
    update(time: number, camera: PerspectiveCamera, lamp: SpotLight) {
      atmosphere.update(time, camera.position);
      optics.uLampPos.value.copy(lamp.position);
      optics.uLampDir.value.subVectors(lamp.target.position, lamp.position).normalize();
      optics.uLampCone.value.set(Math.cos(lamp.angle), Math.cos(lamp.angle * (1 - lamp.penumbra)));
      optics.uLampColor.value.copy(lamp.color);
      // Live illumination boosts surface exposure. The sediment must not inherit
      // that entire gain or it blooms into a white veil over evidence and signs.
      optics.uLampPower.value = Math.min(lamp.intensity, 180);
    },
    dispose() { atmosphere.dispose(); root.removeFromParent(); },
  };
}
