import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { Rng } from '../core/Rng';
import { buildShipMesh } from '../entities/ShipMesh';
import { AsteroidBody, makeBody } from './AsteroidField';

/**
 * A derelict hulk drifting dark — a battle someone else lost. Unmarked on
 * sensors: wrecks are found by eye. The prize is the BLACKBOX floating in the
 * debris: crack it (15 hp) for a mixed salvage burst.
 */
export class WreckSite {
  readonly group = new Group();
  readonly center: Vector3;

  constructor(
    rng: Rng,
    center: Vector3,
    kind: 'hauler' | 'raider' | 'brute',
    bodies: AsteroidBody[],
  ) {
    this.center = center.clone();
    this.group.position.copy(center);

    // The hulk: a standard hull, killed — darkened, no emissives, no engines.
    const hulk = buildShipMesh(kind);
    hulk.group.traverse((obj) => {
      const mesh = obj as Mesh;
      const material = mesh.material as MeshStandardMaterial | undefined;
      if (material && material.color) {
        material.color.multiplyScalar(0.55); // scorched, but still legible
        if ('emissiveIntensity' in material) material.emissiveIntensity = 0;
      }
    });
    for (const glow of hulk.engineGlows) glow.visible = false;
    hulk.group.rotation.set(rng.range(0, 6.28), rng.range(0, 6.28), rng.range(-0.9, 0.9));
    hulk.group.scale.setScalar(kind === 'hauler' ? 1 : 1.6);
    this.group.add(hulk.group);

    bodies.push(makeBody({
      position: center.clone(),
      radius: hulk.radius * (kind === 'hauler' ? 1.05 : 1.7),
      hp: Number.POSITIVE_INFINITY, // dead metal, but still a wall
      solo: hulk.group,
      hero: true,
    }));

    // The blackbox: small, dark, one blinking-red beacon seam.
    const box = new Group();
    const bodyMat = new MeshStandardMaterial({
      color: 0x23272c, metalness: 0.7, roughness: 0.4, flatShading: true,
    });
    const seamMat = new MeshStandardMaterial({
      color: 0x140000, emissive: new Color(0xff2a1a), emissiveIntensity: 2.4,
    });
    const shell = new Mesh(new BoxGeometry(1.7, 1.1, 1.2), bodyMat);
    box.add(shell);
    const seam = new Mesh(new BoxGeometry(1.8, 0.14, 0.3), seamMat);
    box.add(seam);
    const [ox, oy, oz] = rng.unitSphere();
    box.position.set(ox, oy, oz).multiplyScalar(hulk.radius * rng.range(1.6, 2.2));
    box.rotation.set(rng.range(0, 6), rng.range(0, 6), rng.range(0, 6));
    this.group.add(box);

    bodies.push(makeBody({
      position: box.position.clone().add(center),
      radius: 2.2,
      hp: 15,
      solo: box,
      stash: true,
    }));
  }
}
