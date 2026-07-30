import {
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import { buildShipMesh } from '../entities/ShipMesh';
import { PLAYER_SHIPS } from '../game/Ships';

let cache: Record<string, string> | null = null;

/**
 * Renders each playable hull once into an offscreen WebGL canvas and returns
 * data-URL portraits for the hangar cards. Three-point studio lighting (warm
 * key, cool rim) so the silhouettes read instantly. Cached for the session.
 */
export function getShipThumbnails(): Record<string, string> {
  if (cache) return cache;

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(320, 180);

  const scene = new Scene();
  scene.add(new AmbientLight(0x92a4c0, 1.5));
  const key = new DirectionalLight(0xfff0dd, 2.8);
  key.position.set(4, 6, 3);
  scene.add(key);
  const rim = new DirectionalLight(0x27e8ff, 1.6);
  rim.position.set(-3, -1.5, -5);
  scene.add(rim);

  const camera = new PerspectiveCamera(35, 320 / 180, 0.1, 100);

  cache = {};
  for (const def of PLAYER_SHIPS) {
    const mesh = buildShipMesh(def.kind);
    scene.add(mesh.group);
    const d = mesh.radius * 2.9;
    camera.position.set(d * 0.8, d * 0.45, d * 0.85);
    camera.lookAt(0, 0, 0.2);
    renderer.render(scene, camera);
    cache[def.id] = renderer.domElement.toDataURL('image/png');
    scene.remove(mesh.group);
  }

  renderer.dispose();
  return cache;
}
