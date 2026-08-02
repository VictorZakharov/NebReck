import { Camera, Vector3 } from 'three';

const projected = new Vector3();
const cameraSpace = new Vector3();

/** Projects a narrated lesson objective into a clamped screen-space marker. */
export class TutorialWaypoint {
  constructor(
    private readonly root: HTMLElement,
    private readonly label: HTMLElement,
  ) {}

  set(point: Vector3 | null, camera: Camera | null, text = 'Objective'): void {
    if (!point || !camera) {
      this.root.classList.remove('show');
      return;
    }
    cameraSpace.copy(point).applyMatrix4(camera.matrixWorldInverse);
    projected.copy(point).project(camera);
    if (cameraSpace.z > 0) {
      projected.x *= -1;
      projected.y *= -1;
    }
    const marginX = Math.min(90, window.innerWidth * 0.16);
    const marginY = Math.min(90, window.innerHeight * 0.16);
    const rawX = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const rawY = (-projected.y * 0.5 + 0.5) * window.innerHeight;
    const x = Math.max(marginX, Math.min(window.innerWidth - marginX, rawX));
    const y = Math.max(marginY, Math.min(window.innerHeight - marginY, rawY));
    const edge = Math.abs(x - rawX) > 1 || Math.abs(y - rawY) > 1 || cameraSpace.z > 0;
    this.root.style.left = `${x}px`;
    this.root.style.top = `${y}px`;
    this.root.classList.add('show');
    this.root.classList.toggle('edge', edge);
    this.label.textContent = `${text} // ${Math.round(point.distanceTo(camera.position))} m`;
  }
}
