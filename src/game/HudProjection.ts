import { Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { TargetInfo } from '../combat/Targeting';
import { NeutralShip } from '../entities/NeutralShip';
import { Ship } from '../entities/Ship';
import { Turret } from '../entities/Turret';
import {
  HudContactMarker,
  HudFrameState,
  HudOffscreenMarker,
} from '../ui/Hud';

export interface RadarContact {
  position: Vector3;
  kind: string;
  inRange: boolean;
}

export interface HudProjectionResult {
  target: HudFrameState['target'];
  contacts: HudContactMarker[];
  offscreen: HudOffscreenMarker[];
  radarContacts: RadarContact[];
}

/**
 * Converts world-space ships/objectives into the HUD's screen brackets,
 * edge chevrons, target lead marker, radar contacts, and prompt anchors.
 */
export class HudProjector {
  private readonly projected = new Vector3();
  private readonly cameraSpace = new Vector3();
  private readonly cameraInverse = new Matrix4();
  private readonly relativeRotation = new Quaternion();
  private promptAnchorKey: object | null = null;
  private promptAnchorX = 0;
  private promptAnchorY = 0;

  project(
    camera: PerspectiveCamera,
    playerPosition: Vector3,
    target: TargetInfo | null,
    shootables: readonly Ship[],
    objectives: readonly Vector3[],
    weaponReach: number,
    width: number,
    height: number,
  ): HudProjectionResult {
    const targetState: HudFrameState['target'] = {
      visible: false,
      x: 0,
      y: 0,
      distance: 0,
      leadVisible: false,
      leadX: 0,
      leadY: 0,
    };
    if (target) {
      this.projected.copy(target.ship.position).project(camera);
      if (this.projected.z < 1) {
        targetState.visible = true;
        targetState.x = (this.projected.x * 0.5 + 0.5) * width;
        targetState.y = (-this.projected.y * 0.5 + 0.5) * height;
        targetState.distance = target.distance;
      }
      this.projected.copy(target.leadPoint).project(camera);
      if (this.projected.z < 1) {
        targetState.leadVisible = true;
        targetState.leadX = (this.projected.x * 0.5 + 0.5) * width;
        targetState.leadY = (-this.projected.y * 0.5 + 0.5) * height;
      }
    }

    const offscreen: HudOffscreenMarker[] = [];
    const contacts: HudContactMarker[] = [];
    const radarContacts: RadarContact[] = [];
    camera.updateMatrixWorld();
    this.cameraInverse.copy(camera.matrixWorld).invert();

    for (const hostile of shootables) {
      const distance = hostile.position.distanceTo(playerPosition);
      const neutral = hostile instanceof NeutralShip;
      const merchant = neutral && hostile.isMerchant;
      const kind: HudContactMarker['kind'] = merchant
        ? 'merchant'
        : neutral
          ? 'neutral'
          : hostile instanceof Turret
            ? 'turret'
            : 'ship';
      const inRange = neutral || distance <= weaponReach;
      radarContacts.push({
        position: hostile.position,
        kind: merchant ? 'merchant' : neutral ? 'neutral' : hostile.kind,
        inRange,
      });

      this.cameraSpace.copy(hostile.position).applyMatrix4(this.cameraInverse);
      const behind = this.cameraSpace.z >= 0;
      let isOffscreen = behind;
      if (!behind) {
        this.projected.copy(hostile.position).project(camera);
        isOffscreen =
          Math.abs(this.projected.x) > 1 || Math.abs(this.projected.y) > 1;
        if (!isOffscreen && hostile !== target?.ship) {
          contacts.push({
            x: (this.projected.x * 0.5 + 0.5) * width,
            y: (-this.projected.y * 0.5 + 0.5) * height,
            distance,
            kind,
            inRange,
          });
        }
      }
      if (!isOffscreen) continue;
      if (kind === 'turret' && distance > 800) continue;
      if (kind === 'neutral') continue;
      offscreen.push({
        angle: Math.atan2(this.cameraSpace.x, this.cameraSpace.y),
        distance,
        kind,
        inRange,
      });
    }

    for (const objective of objectives) {
      const distance = objective.distanceTo(playerPosition);
      radarContacts.push({ position: objective, kind: 'objective', inRange: true });
      this.cameraSpace.copy(objective).applyMatrix4(this.cameraInverse);
      const behind = this.cameraSpace.z >= 0;
      let isOffscreen = behind;
      if (!behind) {
        this.projected.copy(objective).project(camera);
        isOffscreen =
          Math.abs(this.projected.x) > 1 || Math.abs(this.projected.y) > 1;
        if (!isOffscreen) {
          contacts.push({
            x: (this.projected.x * 0.5 + 0.5) * width,
            y: (-this.projected.y * 0.5 + 0.5) * height,
            distance,
            kind: 'objective',
            inRange: true,
          });
        }
      }
      if (isOffscreen) {
        offscreen.push({
          angle: Math.atan2(this.cameraSpace.x, this.cameraSpace.y),
          distance,
          kind: 'objective',
          inRange: true,
        });
      }
    }

    return { target: targetState, contacts, offscreen, radarContacts };
  }

  projectAnchor(
    point: Vector3,
    camera: PerspectiveCamera,
    width: number,
    height: number,
    margin = 1,
  ): { x: number; y: number } | null {
    this.projected.copy(point).project(camera);
    if (
      this.projected.z < -1 ||
      this.projected.z > 1 ||
      Math.abs(this.projected.x) > margin ||
      Math.abs(this.projected.y) > margin
    ) {
      return null;
    }
    return {
      x: (this.projected.x * 0.5 + 0.5) * width,
      y: (-this.projected.y * 0.5 + 0.5) * height,
    };
  }

  /**
   * Damp a world-attached prompt in screen space. A new target snaps into
   * place immediately; ordinary camera/body motion eases between frames so
   * the label follows its vein without buzzing over individual crystals.
   */
  projectSmoothedAnchor(
    point: Vector3,
    key: object,
    camera: PerspectiveCamera,
    width: number,
    height: number,
    dt: number,
    margin = 1,
  ): { x: number; y: number } | null {
    const raw = this.projectAnchor(point, camera, width, height, margin);
    if (!raw) {
      this.resetPromptAnchor();
      return null;
    }
    if (this.promptAnchorKey !== key) {
      this.promptAnchorKey = key;
      this.promptAnchorX = raw.x;
      this.promptAnchorY = raw.y;
    } else {
      const alpha = 1 - Math.exp(-Math.max(0, dt) * 13);
      this.promptAnchorX += (raw.x - this.promptAnchorX) * alpha;
      this.promptAnchorY += (raw.y - this.promptAnchorY) * alpha;
    }
    return { x: this.promptAnchorX, y: this.promptAnchorY };
  }

  resetPromptAnchor(): void {
    this.promptAnchorKey = null;
  }

  targetRotation(camera: PerspectiveCamera, target: Ship | null): Quaternion {
    this.relativeRotation.identity();
    if (target) {
      this.relativeRotation
        .copy(camera.quaternion)
        .invert()
        .multiply(target.object.quaternion);
    }
    return this.relativeRotation;
  }
}
