import { Vector3 } from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { EventBus } from '../core/EventBus';
import { PlayerShip } from '../entities/PlayerShip';
import { ExplosionPreset, ExplosionSystem } from '../fx/ExplosionSystem';
import { ShieldFx } from '../fx/ShieldFx';
import { ChaseCamera } from '../rendering/ChaseCamera';
import { Hud } from '../ui/Hud';

export interface DamageFeedbackHost {
  readonly audio: AudioEngine;
  readonly chaseCam: ChaseCamera;
  readonly events: EventBus;
  readonly explosions: ExplosionSystem;
  readonly hud: Hud;
  readonly player: PlayerShip;
  readonly playerShield: ShieldFx;
}

export interface PlayerDamageFeedback {
  point: Vector3;
  amount: number;
  shieldAbsorbed: boolean;
  hudStrength: number;
  impactPreset?: ExplosionPreset;
  impactScale?: number;
}

const surfaceImpactPoint = new Vector3();
const surfaceImpactNormal = new Vector3();

/** Central smoke contract: only missile impacts emit a smoke cloud. */
export function showProjectileImpact(
  explosions: ExplosionSystem,
  point: Vector3,
  wasMissile: boolean,
  missileScale: number,
  energyScale: number,
  surfaceCenter?: Vector3,
  surfaceNormal?: Vector3,
): Vector3 {
  const effectPoint = surfaceCenter
    ? surfaceImpactPoint.copy(point).addScaledVector(
      surfaceNormal && surfaceNormal.lengthSq() > 1e-8
        ? surfaceImpactNormal.copy(surfaceNormal).normalize()
        : surfaceImpactNormal.copy(point).sub(surfaceCenter).normalize(),
      wasMissile ? 1.2 : 0.8,
    )
    : point;
  explosions.spawn(
    effectPoint,
    wasMissile ? missileScale : energyScale,
    wasMissile ? 'missile' : 'impact',
  );
  return effectPoint;
}

/** Keep audiovisual player-damage feedback consistent across damage sources. */
export function showPlayerDamageFeedback(
  host: DamageFeedbackHost,
  feedback: PlayerDamageFeedback,
): void {
  const shieldHeld = feedback.shieldAbsorbed && host.player.shield > 0;
  if (feedback.impactPreset) {
    host.explosions.spawn(
      feedback.point,
      feedback.impactScale ?? 0.25,
      feedback.impactPreset,
    );
  }
  if (shieldHeld) {
    host.playerShield.hit(feedback.point);
  }
  host.chaseCam.addDamageShake(feedback.amount, shieldHeld);
  host.hud.flashDamage(feedback.hudStrength);
  if (shieldHeld) host.audio.hitShield();
  else host.audio.hitHull();
  host.events.emit('player-hit', {
    amount: feedback.amount,
    shieldAbsorbed: feedback.shieldAbsorbed,
  });
}
