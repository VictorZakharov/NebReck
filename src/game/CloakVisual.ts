import {
  AdditiveBlending,
  BackSide,
  Group,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { PlayerShip } from '../entities/PlayerShip';

type CloakableMaterial = {
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
  needsUpdate: boolean;
  __cloakBase?: number;
  __cloakTransparent?: boolean;
  __cloakDepthWrite?: boolean;
};

/**
 * Owns the Predator-style hull ghosting and refractive rim shell. Keeping the
 * render-resource lifecycle here makes cloak transitions idempotent even when
 * the player mesh is replaced during planetfall or a new sortie.
 */
export class CloakVisual {
  private shell: Group | null = null;
  private phase = 0;
  private wasCloaked = false;
  readonly materialState = { rim: null as MeshBasicMaterial | null };

  get rimMaterial(): MeshBasicMaterial | null {
    return this.materialState.rim;
  }

  set(player: PlayerShip, cloaked: boolean): void {
    if (cloaked) {
      this.removeShell(player);
      this.restoreMaterials(player);
      this.applyGhostMaterials(player);
      player.glowDim = 0.12;

      const rim = new MeshBasicMaterial({
        color: 0x9fdcff,
        transparent: true,
        opacity: 0.2,
        blending: AdditiveBlending,
        side: BackSide,
        depthWrite: false,
      });
      this.materialState.rim = rim;
      const shell = new Group();
      player.exterior.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh || mesh.userData.renderBatchSource) return;
        const shellPart = new Mesh(mesh.geometry, rim);
        shellPart.position.copy(mesh.position);
        shellPart.rotation.copy(mesh.rotation);
        shellPart.scale.copy(mesh.scale).multiplyScalar(1.065);
        shell.add(shellPart);
      });
      this.shell = shell;
      player.exterior.add(shell);
      this.phase = 0;
    } else {
      this.restoreMaterials(player);
      player.glowDim = 1;
      this.removeShell(player);
    }
    this.wasCloaked = cloaked;
  }

  /**
   * Reconciles device state with render state and advances the shimmer.
   * Device state is authoritative, so a lost shell is rebuilt automatically.
   */
  sync(player: PlayerShip, cloaked: boolean, dt: number): void {
    if (!cloaked && (this.wasCloaked || this.shell)) this.set(player, false);
    if (cloaked && (!this.shell || !this.materialState.rim)) this.set(player, true);
    this.wasCloaked = cloaked;
    if (!cloaked) return;

    this.phase += dt;
    const rim = this.materialState.rim;
    if (!rim) return;
    rim.opacity = 0.14 + 0.1 * (0.5 + 0.5 * Math.sin(this.phase * 2.2));
    rim.color.setHSL(0.62 + 0.09 * Math.sin(this.phase * 1.7), 0.9, 0.7);
  }

  private applyGhostMaterials(player: PlayerShip): void {
    player.exterior.traverse((object) => {
      if (object.userData.renderBatchSource) return;
      if ((object as { isSprite?: boolean }).isSprite) return;
      const material = (object as { material?: CloakableMaterial }).material;
      if (!material || !('opacity' in material)) return;
      if (material.__cloakBase === undefined) {
        material.__cloakBase = material.opacity;
        material.__cloakTransparent = material.transparent;
        material.__cloakDepthWrite = material.depthWrite;
      }
      material.transparent = true;
      material.depthWrite = false;
      material.opacity = 0.045;
      material.needsUpdate = true;
    });
  }

  private restoreMaterials(player: PlayerShip): void {
    player.exterior.traverse((object) => {
      if (object.userData.renderBatchSource) return;
      const material = (object as { material?: CloakableMaterial }).material;
      if (!material || material.__cloakBase === undefined) return;
      material.opacity = material.__cloakBase;
      material.depthWrite = material.__cloakDepthWrite ?? true;
      material.transparent =
        material.__cloakTransparent ?? material.__cloakBase < 1;
      material.needsUpdate = true;
      delete material.__cloakBase;
      delete material.__cloakTransparent;
      delete material.__cloakDepthWrite;
    });
  }

  private removeShell(player: PlayerShip): void {
    if (this.shell) {
      player.exterior.remove(this.shell);
      this.shell = null;
    }
    this.materialState.rim?.dispose();
    this.materialState.rim = null;
  }
}
