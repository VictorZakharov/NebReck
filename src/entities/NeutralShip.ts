import { Color, Matrix4, Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { Ship } from './Ship';

const toWp = new Vector3();
const fwd = new Vector3();
const targetQuat = new Quaternion();
const lookMat = new Matrix4();
const zero = new Vector3();
const up = new Vector3(0, 1, 0);
const sideHint = new Vector3(1, 0, 0);

const CRUISE_SPEED = 24;
const TURN_RATE = 0.5;

/**
 * Neutral cargo hauler trundling a fixed trade route through the sector.
 * Ignores the fighting entirely; it can be shot (piracy has loot, and
 * consequences in the comms), but it never shoots back.
 */
export class NeutralShip extends Ship {
  private waypointIndex = 0;

  constructor(
    private readonly waypoints: Vector3[],
    /** Merchants trade instead of offering contracts, and paint gold. */
    readonly isMerchant = false,
  ) {
    super('hauler', 90, 0, 0, 999);
    this.throttle = 0.6;
    if (isMerchant) {
      // Gold livery + green trade beacon: unmistakable at a glance.
      this.exterior.traverse((obj) => {
        if (obj.userData.renderBatchSource) return;
        const material = (obj as Mesh).material as MeshStandardMaterial | undefined;
        if (material && material.color) {
          material.color.lerp(new Color(0xd8a33a), 0.45);
        }
      });
      const beacon = new Mesh(
        new SphereGeometry(0.5, 10, 8),
        new MeshStandardMaterial({
          color: 0x03140a, emissive: new Color(0x8aff9f), emissiveIntensity: 3.2,
        }),
      );
      beacon.position.set(0, 2.3, -6.4);
      this.exterior.add(beacon);
    }
  }

  update(dt: number): void {
    if (!this.alive) return;
    const wp = this.waypoints[this.waypointIndex];
    toWp.copy(wp).sub(this.position);
    if (toWp.lengthSq() < 40 * 40) {
      this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
    }
    toWp.normalize();
    const hint = Math.abs(toWp.y) > 0.85 ? sideHint : up;
    targetQuat.setFromRotationMatrix(lookMat.lookAt(zero, toWp, hint));
    this.object.quaternion.rotateTowards(targetQuat, TURN_RATE * dt);

    this.forward(fwd);
    this.velocity.lerp(fwd.multiplyScalar(CRUISE_SPEED), 1 - Math.exp(-0.8 * dt));
    this.position.addScaledVector(this.velocity, dt);
    this.updateCommon(dt);
  }
}
