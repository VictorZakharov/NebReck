import { Color, Group, Matrix4, PointLight, Vector3 } from 'three';

interface LightAnchor {
  readonly position: Vector3;
  readonly color: Color;
  readonly intensity: number;
  readonly distance: number;
  readonly decay: number;
}

const viewerLocal = new Vector3();

/**
 * Keep a fixed, small light budget while preserving cave-local illumination.
 * Three.js evaluates every visible point light in every standard-material
 * fragment, even when its attenuation reaches zero. Reusing the two anchors
 * with the most influence near the camera avoids compiling planet shaders
 * with a dozen point-light loops.
 */
export class SurfaceLocalLights {
  readonly sourceCount: number;
  private readonly anchors: LightAnchor[] = [];
  private readonly lights: PointLight[] = [];
  private readonly worldToLocal = new Matrix4();

  constructor(root: Group, maxLights = 2) {
    root.updateWorldMatrix(true, true);
    this.worldToLocal.copy(root.matrixWorld).invert();
    const sources: PointLight[] = [];
    root.traverse((object) => {
      if (object instanceof PointLight) sources.push(object);
    });
    this.sourceCount = sources.length;
    for (const source of sources) {
      const position = source.getWorldPosition(new Vector3()).applyMatrix4(this.worldToLocal);
      this.anchors.push({
        position,
        color: source.color.clone(),
        intensity: source.intensity,
        distance: source.distance,
        decay: source.decay,
      });
      source.removeFromParent();
    }
    const count = Math.min(maxLights, this.anchors.length);
    for (let index = 0; index < count; index++) {
      const light = new PointLight(0xffffff, 0, 1, 2);
      light.name = 'surface-local-light';
      light.castShadow = false;
      this.lights.push(light);
      root.add(light);
    }
  }

  update(viewerWorld: Vector3): void {
    viewerLocal.copy(viewerWorld).applyMatrix4(this.worldToLocal);
    let first = -1;
    let second = -1;
    let firstScore = 0;
    let secondScore = 0;
    for (let index = 0; index < this.anchors.length; index++) {
      const anchor = this.anchors[index];
      const distance = viewerLocal.distanceTo(anchor.position);
      // Select by camera proximity even just outside the attenuation radius:
      // the illuminated wall can still be visible through a cave entrance.
      const score = anchor.intensity / Math.max(1, distance * distance);
      if (score > firstScore) {
        second = first;
        secondScore = firstScore;
        first = index;
        firstScore = score;
      } else if (score > secondScore) {
        second = index;
        secondScore = score;
      }
    }
    this.apply(this.lights[0], first);
    this.apply(this.lights[1], second);
  }

  get activeCount(): number {
    let count = 0;
    for (const light of this.lights) {
      if (light.intensity > 0) count++;
    }
    return count;
  }

  private apply(light: PointLight | undefined, anchorIndex: number): void {
    if (!light) return;
    if (anchorIndex < 0) {
      light.intensity = 0;
      return;
    }
    const anchor = this.anchors[anchorIndex];
    light.position.copy(anchor.position);
    light.color.copy(anchor.color);
    light.intensity = anchor.intensity;
    light.distance = anchor.distance;
    light.decay = anchor.decay;
  }
}
