import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { HullBuildResult, ShipBuildContext } from './ShipMeshBuilder';

export function buildTurretHull(
  context: ShipBuildContext,
): HullBuildResult {
  const { add, hullMat, panelMat, accentMat } = context;
  let gunpoints: Vector3[];
  let enginePoints: Vector3[];
  let radius: number;
    // Stationary emplacement: armored base, swivel head, twin barrels.
    add(new Mesh(new CylinderGeometry(1.5, 1.8, 0.7, 8), panelMat), 0, -0.6, 0);
    add(new Mesh(new SphereGeometry(0.9, 12, 8), hullMat), 0, 0.1, 0);
    add(new Mesh(new BoxGeometry(1.3, 0.5, 1.1), hullMat), 0, 0.55, 0.1);
    const barrel = new CylinderGeometry(0.11, 0.13, 2.4, 8);
    add(new Mesh(barrel, panelMat), 0.4, 0.5, -1.2, Math.PI / 2);
    add(new Mesh(barrel.clone(), panelMat), -0.4, 0.5, -1.2, Math.PI / 2);
    const muzzleRing = new CylinderGeometry(0.16, 0.16, 0.2, 8);
    add(new Mesh(muzzleRing, accentMat), 0.4, 0.5, -2.3, Math.PI / 2);
    add(new Mesh(muzzleRing.clone(), accentMat), -0.4, 0.5, -2.3, Math.PI / 2);
    add(new Mesh(new BoxGeometry(0.14, 0.5, 0.14), panelMat), 0, 1.05, 0.4);
    add(new Mesh(new SphereGeometry(0.09, 8, 6), accentMat), 0, 1.35, 0.4);

    gunpoints = [new Vector3(0.4, 0.5, -2.5), new Vector3(-0.4, 0.5, -2.5)];
    enginePoints = [];
    radius = 2.4;
  return { gunpoints, enginePoints, radius };
}

export function buildHaulerHull(
  context: ShipBuildContext,
): HullBuildResult {
  const { add, hullMat, panelMat, accentMat, canopyMat } = context;
  let gunpoints: Vector3[];
  let enginePoints: Vector3[];
  let radius: number;
    // Neutral freighter: long spine stacked with cargo containers, cab up
    // front, heavy engine block aft. Big, slow, obviously not a fighter.
    add(new Mesh(new CylinderGeometry(0.5, 0.5, 13, 8), panelMat), 0, -0.4, 0.5, Math.PI / 2);
    const containerColors = [0x7a6f58, 0x5c6e78, 0x6e5a64, 0x5d7060];
    for (let i = 0; i < 4; i++) {
      const boxMat = new MeshStandardMaterial({
        color: containerColors[i], metalness: 0.35, roughness: 0.7, flatShading: true,
      });
      add(new Mesh(new BoxGeometry(2.2, 2.0, 2.6), boxMat), 0, 0.6, -3.2 + i * 2.9);
    }
    // Cab with canopy strip.
    add(new Mesh(new BoxGeometry(1.7, 1.5, 2.2), hullMat), 0, 0.3, -6.4);
    add(new Mesh(new BoxGeometry(1.4, 0.4, 0.3), canopyMat), 0, 0.75, -7.4);
    // Engine block + twin nozzles.
    add(new Mesh(new BoxGeometry(2.4, 1.8, 2.0), hullMat), 0, 0.2, 7.6);
    const hNozzle = new CylinderGeometry(0.45, 0.34, 0.4, 8);
    add(new Mesh(hNozzle, accentMat), 0.7, 0.2, 8.7, Math.PI / 2);
    add(new Mesh(hNozzle.clone(), accentMat), -0.7, 0.2, 8.7, Math.PI / 2);
    // Running-light strips, flush with the container rank.
    const runStrip = new BoxGeometry(0.1, 0.1, 11);
    add(new Mesh(runStrip, accentMat), 1.08, -0.42, 0.5);
    add(new Mesh(runStrip.clone(), accentMat), -1.08, -0.42, 0.5);

    gunpoints = [];
    enginePoints = [new Vector3(0.7, 0.2, 9.0), new Vector3(-0.7, 0.2, 9.0)];
    radius = 7.5;
  return { gunpoints, enginePoints, radius };
}

export function buildCapitalHull(
  context: ShipBuildContext,
): HullBuildResult {
  const { add, hullMat, panelMat, accentMat, canopyMat } = context;
  let gunpoints: Vector3[];
  let enginePoints: Vector3[];
  let radius: number;
    // Vigil capital ship: layered armored hull ~55 units long — stepped
    // decks, lit window rows, sponson gun batteries, twin-tier command tower.
    // Turret batteries mount on the dorsal deck (CapitalShip.turretMounts).
    const windowMat = new MeshStandardMaterial({
      color: 0x050810, emissive: new Color(0x9fd8ff), emissiveIntensity: 1.1,
    });
    // Hull segments, stepped.
    add(new Mesh(new BoxGeometry(10, 6, 26), hullMat), 0, 0, 2);
    add(new Mesh(new BoxGeometry(8.4, 5, 14), hullMat), 0, 0.2, -16);
    add(new Mesh(new ConeGeometry(4, 10, 4), hullMat), 0, 0.4, -27, -Math.PI / 2, Math.PI / 4);
    // Forward prongs framing the prow.
    add(new Mesh(new BoxGeometry(1.3, 1.3, 9), panelMat), 3.2, 1.2, -26, 0, -0.08, 0);
    add(new Mesh(new BoxGeometry(1.3, 1.3, 9), panelMat), -3.2, 1.2, -26, 0, 0.08, 0);
    // Dorsal deck plates (stepped armor).
    const deckPlate = new BoxGeometry(7.2, 0.7, 4.2);
    for (let i = 0; i < 5; i++) {
      add(new Mesh(deckPlate.clone(), panelMat), 0, 3.15, -10 + i * 5.4);
    }
    // Ventral keel + fin.
    add(new Mesh(new BoxGeometry(4, 3, 28), panelMat), 0, -3.6, 1);
    add(new Mesh(new BoxGeometry(0.8, 4, 8), panelMat), 0, -5.4, 12);
    // Side sponsons with visible gun batteries.
    for (const side of [1, -1]) {
      add(new Mesh(new BoxGeometry(3, 3.4, 18), panelMat), side * 6, -0.4, 2);
      const barrel = new CylinderGeometry(0.32, 0.38, 7, 6);
      for (let i = 0; i < 3; i++) {
        add(new Mesh(barrel.clone(), panelMat), side * 7.2, 0.6, -4 + i * 6, Math.PI / 2);
      }
      // Window rows: two lit strips of portholes down each flank.
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < 9; i++) {
          add(
            new Mesh(new BoxGeometry(0.18, 0.55, 1.1), windowMat),
            side * 5.06, 1.4 - row * 1.6, -9 + i * 2.7,
          );
        }
      }
      // Red warning strip above the windows.
      add(new Mesh(new BoxGeometry(0.25, 0.25, 24), accentMat), side * 5.15, 2.5, 0);
    }
    // Command tower: two tiers, bridge strip, antenna masts.
    add(new Mesh(new BoxGeometry(4.4, 3.2, 8), hullMat), 0, 4.8, 8);
    add(new Mesh(new BoxGeometry(3, 2.6, 5), hullMat), 0, 7.6, 9.5);
    add(new Mesh(new BoxGeometry(2.6, 0.6, 0.4), canopyMat), 0, 8.2, 6.9);
    add(new Mesh(new CylinderGeometry(0.09, 0.14, 5, 5), panelMat), 1, 11, 11);
    add(new Mesh(new CylinderGeometry(0.09, 0.14, 3.6, 5), panelMat), -1.1, 10.4, 10);
    add(new Mesh(new SphereGeometry(0.22, 6, 5), accentMat), 1, 13.5, 11);
    // Engine block + three drives (burner discs come from the greeble pass).
    add(new Mesh(new BoxGeometry(9, 5.4, 6), panelMat), 0, 0, 18);
    const cNozzle = new CylinderGeometry(1.5, 1.2, 1.6, 10);
    for (const x of [-3, 0, 3]) {
      add(new Mesh(cNozzle.clone(), accentMat), x, 0, 21.6, Math.PI / 2); // reach the burner discs
    }
    // Dorsal spine light-strip between the deck plates.
    add(new Mesh(new BoxGeometry(0.3, 0.2, 24), accentMat), 0, 3.6, 0);

    gunpoints = [];
    enginePoints = [new Vector3(-3, 0, 22.2), new Vector3(0, 0, 22.2), new Vector3(3, 0, 22.2)];
    radius = 24;
  return { gunpoints, enginePoints, radius };
}

export function buildRaiderHull(
  context: ShipBuildContext,
): HullBuildResult {
  const { add, hullMat, panelMat, accentMat, canopyMat } = context;
  let gunpoints: Vector3[];
  let enginePoints: Vector3[];
  let radius: number;
    // Angular dart: aggressive forward-swept blades.
    add(new Mesh(new ConeGeometry(0.55, 3.4, 4), hullMat), 0, 0, -1.2, -Math.PI / 2, Math.PI / 4);
    add(new Mesh(new BoxGeometry(1.1, 0.55, 2.2), panelMat), 0, 0, 0.9);
    add(new Mesh(new BoxGeometry(0.5, 0.3, 0.9), canopyMat), 0, 0.4, -0.3);
    const bladeGeo = new BoxGeometry(2.6, 0.08, 1.1);
    add(new Mesh(bladeGeo, panelMat), 1.5, 0, 0.4, 0, -0.5, 0.15);
    add(new Mesh(bladeGeo.clone(), panelMat), -1.5, 0, 0.4, 0, 0.5, -0.15);
    const tipGeo = new BoxGeometry(0.2, 0.14, 0.8); // ON the swept, TILTED blade tips
    add(new Mesh(tipGeo, accentMat), 2.5, 0.17, 0.95, 0, -0.5, 0.15);
    add(new Mesh(tipGeo.clone(), accentMat), -2.5, 0.17, 0.95, 0, 0.5, -0.15);
    add(new Mesh(new CylinderGeometry(0.34, 0.42, 0.9, 8), hullMat), 0, 0, 2.2, Math.PI / 2);
    add(new Mesh(new CylinderGeometry(0.3, 0.22, 0.22, 8), accentMat), 0, 0, 2.7, Math.PI / 2);

    gunpoints = [new Vector3(0, -0.25, -3.0)];
    enginePoints = [new Vector3(0, 0, 2.9)];
    radius = 2.0;
  return { gunpoints, enginePoints, radius };
}

export function buildBruteHull(
  context: ShipBuildContext,
): HullBuildResult {
  const { add, hullMat, panelMat, accentMat, canopyMat } = context;
  let gunpoints: Vector3[];
  let enginePoints: Vector3[];
  let radius: number;
    // Brute: heavy twin-hull gunship.
    add(new Mesh(new BoxGeometry(2.4, 1.0, 4.2), hullMat), 0, 0, 0);
    add(new Mesh(new ConeGeometry(0.8, 1.8, 4), hullMat), 0, 0, -2.9, -Math.PI / 2, Math.PI / 4);
    add(new Mesh(new BoxGeometry(0.9, 0.5, 1.4), canopyMat), 0, 0.7, -1.2);
    const podGeo = new CylinderGeometry(0.55, 0.62, 3.4, 8);
    add(new Mesh(podGeo, panelMat), 1.8, -0.2, 0.4, Math.PI / 2);
    add(new Mesh(podGeo.clone(), panelMat), -1.8, -0.2, 0.4, Math.PI / 2);
    const bruteNozzle = new CylinderGeometry(0.5, 0.38, 0.3, 8);
    add(new Mesh(bruteNozzle, accentMat), 1.8, -0.2, 2.2, Math.PI / 2);
    add(new Mesh(bruteNozzle.clone(), accentMat), -1.8, -0.2, 2.2, Math.PI / 2);
    add(new Mesh(new BoxGeometry(0.14, 1.6, 1.3), panelMat), 0, 1.0, 1.4, 0.2, 0, 0);
    const gunGeo = new CylinderGeometry(0.1, 0.1, 1.8, 6);
    add(new Mesh(gunGeo, accentMat), 1.8, -0.2, -1.9, Math.PI / 2);
    add(new Mesh(gunGeo.clone(), accentMat), -1.8, -0.2, -1.9, Math.PI / 2);

    gunpoints = [new Vector3(1.8, -0.2, -2.9), new Vector3(-1.8, -0.2, -2.9)];
    enginePoints = [new Vector3(1.8, -0.2, 2.5), new Vector3(-1.8, -0.2, 2.5)];
    radius = 3.2;
  return { gunpoints, enginePoints, radius };
}
