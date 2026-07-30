import {
  createShipBuildContext,
  finishShipBuild,
  HullBuildResult,
} from './ShipMeshBuilder';
import {
  buildAegisHull,
  buildKestrelHull,
  buildVantaHull,
} from './PlayerShipMeshes';
import {
  buildBruteHull,
  buildCapitalHull,
  buildHaulerHull,
  buildRaiderHull,
  buildTurretHull,
} from './NpcShipMeshes';
import { ShipKind, ShipMesh } from './ShipMeshTypes';

/** Selects a hull family builder, then applies the shared nav-light/engine pass. */
export function buildShipMesh(kind: ShipKind): ShipMesh {
  const context = createShipBuildContext(kind);
  let hull: HullBuildResult;
  switch (kind) {
    case 'kestrel': hull = buildKestrelHull(context); break;
    case 'vanta': hull = buildVantaHull(context); break;
    case 'aegis': hull = buildAegisHull(context); break;
    case 'turret': hull = buildTurretHull(context); break;
    case 'hauler': hull = buildHaulerHull(context); break;
    case 'capital': hull = buildCapitalHull(context); break;
    case 'raider': hull = buildRaiderHull(context); break;
    case 'brute': hull = buildBruteHull(context); break;
  }
  return finishShipBuild(kind, context, hull);
}
