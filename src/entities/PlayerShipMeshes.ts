import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Mesh,
  SphereGeometry,
  Vector3,
} from 'three';
import {
  HullBuildResult,
  ShipBuildContext,
  taperedCanopyGeometry,
  wingGeometry,
} from './ShipMeshBuilder';

export function buildKestrelHull(
  context: ShipBuildContext,
): HullBuildResult {
  const { add, hullMat, panelMat, accentMat, canopyMat, darkMat, trimMat, hullSmooth, panelSmooth } = context;
  let gunpoints: Vector3[];
  let enginePoints: Vector3[];
  let radius: number;
    // Sleek interceptor: ROUND needle fuselage, swept wings, twin engines.
    add(new Mesh(new CylinderGeometry(0.42, 0.62, 4.6, 24), hullSmooth), 0, 0, -0.2, Math.PI / 2);
    add(new Mesh(new ConeGeometry(0.42, 2.2, 24), hullSmooth), 0, 0, -3.6, -Math.PI / 2);
    add(new Mesh(new BoxGeometry(0.7, 0.42, 1.5), canopyMat), 0, 0.42, -1.1);
    // Swept tapered wings — airfoil silhouette, not slabs.
    const wingGeo = wingGeometry(3.1, 1.5, 0.42, 0.16);
    add(new Mesh(wingGeo, panelMat), 1.9, -0.05, 0.75, 0, 0.42, -0.06);
    const wingL = wingGeo.clone();
    wingL.scale(-1, 1, 1);
    wingL.computeVertexNormals();
    add(new Mesh(wingL, panelMat), -1.9, -0.05, 0.75, 0, -0.42, 0.06);
    // Wingtip accent strips — sized to the TAPERED tip chord, on the tip.
    const stripGeo = new BoxGeometry(0.16, 0.12, 0.68);
    add(new Mesh(stripGeo, accentMat), 3.36, -0.14, 0.4, 0, 0.42, 0);
    add(new Mesh(stripGeo.clone(), accentMat), -3.36, -0.14, 0.4, 0, -0.42, 0);
    // Tail fins — tapered blades.
    const kFin = wingGeometry(1.2, 1.0, 0.35, 0.09);
    add(new Mesh(kFin, panelMat), 0.45, 0.6, 1.6, 0.25, 0, Math.PI / 2 - 0.3);
    add(new Mesh(kFin.clone(), panelMat), -0.45, 0.6, 1.6, 0.25, 0, Math.PI / 2 + 0.3);
    // Twin engine nacelles + emissive nozzles.
    const nacelleGeo = new CylinderGeometry(0.3, 0.36, 1.7, 20);
    add(new Mesh(nacelleGeo, hullSmooth), 0.72, -0.12, 1.5, Math.PI / 2);
    add(new Mesh(nacelleGeo.clone(), hullSmooth), -0.72, -0.12, 1.5, Math.PI / 2);
    const nozzleGeo = new CylinderGeometry(0.26, 0.2, 0.24, 16);
    add(new Mesh(nozzleGeo, accentMat), 0.72, -0.12, 2.4, Math.PI / 2);
    add(new Mesh(nozzleGeo.clone(), accentMat), -0.72, -0.12, 2.4, Math.PI / 2);
    // Underslung gun barrels in pod housings that reach back to the wings.
    const gunGeo = new CylinderGeometry(0.06, 0.06, 1.4, 12);
    add(new Mesh(gunGeo, panelSmooth), 1.0, -0.22, -1.6, Math.PI / 2);
    add(new Mesh(gunGeo.clone(), panelSmooth), -1.0, -0.22, -1.6, Math.PI / 2);
    const kGunPod = new BoxGeometry(0.18, 0.18, 1.9);
    add(new Mesh(kGunPod, panelMat), 1.0, -0.22, -0.3);
    add(new Mesh(kGunPod.clone(), panelMat), -1.0, -0.22, -0.3);
    // -- fancy pass: layered plating, trim, sensors, RCS, belly pod ----------
    add(new Mesh(new BoxGeometry(0.34, 0.18, 3.4), panelMat), 0, 0.32, 0.2); // dorsal spine
    add(new Mesh(new BoxGeometry(0.74, 0.1, 0.14), trimMat), 0, 0.46, -1.9); // canopy frames
    add(new Mesh(new BoxGeometry(0.74, 0.1, 0.14), trimMat), 0, 0.46, -0.32);
    add(new Mesh(new CylinderGeometry(0.028, 0.028, 0.9, 5), panelMat), 0, 0, -5.0, Math.PI / 2); // nose probe
    add(new Mesh(new CylinderGeometry(0.09, 0.09, 0.07, 14), accentMat), 0, 0, -4.6, Math.PI / 2);
    add(new Mesh(new BoxGeometry(0.5, 0.18, 1.2), darkMat), 0, -0.44, -1.2); // chin intake
    const kStripe = new BoxGeometry(0.05, 0.08, 2.6);
    add(new Mesh(kStripe, accentMat), 0.56, 0.12, -0.5); // fuselage racing stripes
    add(new Mesh(kStripe.clone(), accentMat), -0.56, 0.12, -0.5);
    // Layered upper wing plates: tapered like the wing so they stay INSIDE
    // the planform instead of overhanging the swept edges.
    const kOverlay = wingGeometry(1.7, 0.8, 0.5, 0.07);
    add(new Mesh(kOverlay, hullMat), 1.45, -0.02, 0.68, 0, 0.42, -0.06);
    const kOverlayL = kOverlay.clone();
    kOverlayL.scale(-1, 1, 1);
    kOverlayL.computeVertexNormals();
    add(new Mesh(kOverlayL, hullMat), -1.45, -0.02, 0.68, 0, -0.42, 0.06);
    const kFairing = new BoxGeometry(0.7, 0.18, 1.8); // wing-root fairings
    add(new Mesh(kFairing, hullMat), 0.55, -0.05, 0.75);
    add(new Mesh(kFairing.clone(), hullMat), -0.55, -0.05, 0.75);
    // Lit leading edges — true world LE angle is ~0.20 rad (the taper's
    // rearward tip pull FLATTENS the edge relative to the 0.42 wing yaw).
    const kEdge = new BoxGeometry(2.7, 0.05, 0.1);
    add(new Mesh(kEdge, accentMat), 1.76, -0.06, 0.4, 0, 0.2, -0.06);
    add(new Mesh(kEdge.clone(), accentMat), -1.76, -0.06, 0.4, 0, -0.2, 0.06);
    add(new Mesh(new BoxGeometry(0.06, 0.05, 3.6), accentMat), 0, 0.43, 0.1); // dorsal centerline
    const kWinglet = new BoxGeometry(0.06, 0.5, 0.62); // winglets ON the true tips
    add(new Mesh(kWinglet, panelMat), 3.4, 0.06, 0.38, 0, 0.42, 0);
    add(new Mesh(kWinglet.clone(), panelMat), -3.4, 0.06, 0.38, 0, -0.42, 0);
    const kPylon = new BoxGeometry(0.55, 0.14, 1.2); // engine pylons
    add(new Mesh(kPylon, panelMat), 0.45, -0.02, 1.45);
    add(new Mesh(kPylon.clone(), panelMat), -0.45, -0.02, 1.45);
    const kRcs = new BoxGeometry(0.09, 0.09, 0.09); // RCS thruster nubs
    for (const [rx, ry, rz] of [[0.3, 0.28, -3.0], [-0.3, 0.28, -3.0], [0.44, 0.34, 1.9], [-0.44, 0.34, 1.9]]) {
      add(new Mesh(kRcs.clone(), trimMat), rx, ry, rz);
    }
    add(new Mesh(new CylinderGeometry(0.16, 0.16, 1.1, 14), panelSmooth), 0, -0.52, 0.7, Math.PI / 2); // belly pod
    add(new Mesh(new SphereGeometry(0.16, 14, 10), panelSmooth), 0, -0.52, 0.12);

    gunpoints = [new Vector3(1.0, -0.22, -2.4), new Vector3(-1.0, -0.22, -2.4)];
    enginePoints = [new Vector3(0.72, -0.12, 2.6), new Vector3(-0.72, -0.12, 2.6)];
    radius = 2.2;
  return { gunpoints, enginePoints, radius };
}

export function buildVantaHull(
  context: ShipBuildContext,
): HullBuildResult {
  const { add, hullMat, panelMat, accentMat, canopyMat, darkMat, hullSmooth, panelSmooth, trimSmooth } = context;
  let gunpoints: Vector3[];
  let enginePoints: Vector3[];
  let radius: number;
    // Scout: long ROUND needle fuselage, forward-swept wings, one big engine.
    add(new Mesh(new CylinderGeometry(0.34, 0.5, 5.2, 24), hullSmooth), 0, 0, -0.3, Math.PI / 2);
    add(new Mesh(new ConeGeometry(0.34, 2.6, 24), hullSmooth), 0, 0, -4.2, -Math.PI / 2);
    add(new Mesh(new BoxGeometry(0.56, 0.36, 1.3), canopyMat), 0, 0.36, -1.6);
    const fwing = wingGeometry(2.7, 1.2, 0.4, 0.13); // tapered airfoil
    add(new Mesh(fwing, panelMat), 1.45, 0, 0.2, 0, -0.5, -0.05); // roots reach the hull
    const fwingL = fwing.clone();
    fwingL.scale(-1, 1, 1);
    fwingL.computeVertexNormals();
    add(new Mesh(fwingL, panelMat), -1.45, 0, 0.2, 0, 0.5, 0.05);
    const vFairing = new BoxGeometry(0.55, 0.16, 1.5); // wing-root fairings
    add(new Mesh(vFairing, hullMat), 0.4, 0, 0.25);
    add(new Mesh(vFairing.clone(), hullMat), -0.4, 0, 0.25);
    const ftip = new BoxGeometry(0.14, 0.1, 0.52); // ON the tapered tip (z ≈ +1.0)
    add(new Mesh(ftip, accentMat), 2.5, 0, 1.0, 0, -0.5, 0);
    add(new Mesh(ftip.clone(), accentMat), -2.5, 0, 1.0, 0, 0.5, 0);
    add(new Mesh(wingGeometry(1.0, 0.9, 0.35, 0.08), panelMat), 0, 0.55, 1.7, 0.3, 0, Math.PI / 2);
    add(new Mesh(new CylinderGeometry(0.42, 0.5, 1.5, 20), hullSmooth), 0, 0, 1.9, Math.PI / 2);
    add(new Mesh(new CylinderGeometry(0.38, 0.28, 0.26, 16), accentMat), 0, 0, 2.75, Math.PI / 2);
    const vGun = new CylinderGeometry(0.05, 0.05, 1.2, 12);
    add(new Mesh(vGun, panelSmooth), 0.42, -0.16, -2.2, Math.PI / 2);
    add(new Mesh(vGun.clone(), panelSmooth), -0.42, -0.16, -2.2, Math.PI / 2);
    // -- fancy pass: canards, sensor suite, hull ribs, blades, skids ---------
    const vCanard = wingGeometry(1.1, 0.5, 0.45, 0.08);
    add(new Mesh(vCanard, panelMat), 0.85, 0.12, -2.7, 0, -0.35, 0.08);
    const vCanardL = vCanard.clone();
    vCanardL.scale(-1, 1, 1);
    vCanardL.computeVertexNormals();
    add(new Mesh(vCanardL, panelMat), -0.85, 0.12, -2.7, 0, 0.35, -0.08);
    const vCanTip = new BoxGeometry(0.34, 0.07, 0.1); // on the TAPERED canard tip
    add(new Mesh(vCanTip, accentMat), 1.28, 0.12, -2.47, 0, -0.35, 0);
    add(new Mesh(vCanTip.clone(), accentMat), -1.28, 0.12, -2.47, 0, 0.35, 0);
    add(new Mesh(new SphereGeometry(0.17, 16, 12), panelSmooth), 0, 0.42, 0.55); // sensor dome
    add(new Mesh(new CylinderGeometry(0.015, 0.022, 1.2, 4), panelMat), 0.08, 0.9, 0.6); // antenna array, rooted in the dome
    add(new Mesh(new CylinderGeometry(0.015, 0.022, 0.8, 4), panelMat), -0.1, 0.75, 0.52);
    add(new Mesh(new SphereGeometry(0.04, 6, 5), accentMat), 0.08, 1.53, 0.6);
    for (const rz of [-2.5, -1.1, 0.5]) { // hull rib rings
      add(new Mesh(new CylinderGeometry(0.46, 0.46, 0.07, 24), trimSmooth), 0, 0, rz, Math.PI / 2);
    }
    const vBlade = new BoxGeometry(0.05, 0.66, 0.5); // wingtip blades, ON the true tip
    add(new Mesh(vBlade, panelMat), 2.48, 0.12, 1.0, 0, -0.5, 0);
    add(new Mesh(vBlade.clone(), panelMat), -2.48, 0.12, 1.0, 0, 0.5, 0);
    const vScoop = new BoxGeometry(0.12, 0.22, 1.1); // flank intake scoops
    add(new Mesh(vScoop, darkMat), 0.46, 0.12, 1.15);
    add(new Mesh(vScoop.clone(), darkMat), -0.46, 0.12, 1.15);
    const vFin = wingGeometry(0.7, 0.7, 0.4, 0.06); // angled tapered tail fins
    add(new Mesh(vFin, panelMat), 0.26, 0.42, 1.95, 0.3, 0, Math.PI / 2 - 0.5);
    add(new Mesh(vFin.clone(), panelMat), -0.26, 0.42, 1.95, 0.3, 0, Math.PI / 2 + 0.5);
    const vSkid = new BoxGeometry(0.08, 0.07, 2.2); // belly skid rails
    add(new Mesh(vSkid, panelMat), 0.3, -0.44, 0.2);
    add(new Mesh(vSkid.clone(), panelMat), -0.3, -0.44, 0.2);
    const vEdge = new BoxGeometry(2.3, 0.04, 0.09); // lit edges, following the sweep
    add(new Mesh(vEdge, accentMat), 1.58, 0.02, -0.03, 0, -0.71, -0.05);
    add(new Mesh(vEdge.clone(), accentMat), -1.58, 0.02, -0.03, 0, 0.71, 0.05);
    add(new Mesh(new BoxGeometry(0.05, 0.06, 2.2), accentMat), 0, 0.47, 1.0); // dorsal stripe
    add(new Mesh(new CylinderGeometry(0.56, 0.56, 0.09, 24), trimSmooth), 0, 0, 2.3, Math.PI / 2); // engine collar

    gunpoints = [new Vector3(0.42, -0.16, -2.9), new Vector3(-0.42, -0.16, -2.9)];
    enginePoints = [new Vector3(0, 0, 3.0)];
    radius = 1.9;
  return { gunpoints, enginePoints, radius };
}

export function buildAegisHull(
  context: ShipBuildContext,
): HullBuildResult {
  const { add, hullMat, panelMat, accentMat, canopyMat, darkMat, hullSmooth, panelSmooth, trimSmooth } = context;
  let gunpoints: Vector3[];
  let enginePoints: Vector3[];
  let radius: number;
    // Gunship: flattened elliptical fuselage + streamlined nose — heavy but
    // AERODYNAMIC, not a flying brick.
    const aHull = add(new Mesh(new CylinderGeometry(1.15, 1.25, 4.8, 28), hullSmooth), 0, 0, 0, Math.PI / 2);
    aHull.scale.set(0.95, 1, 0.48); // a TRUE ellipse cross-section at 28 segs
    const aNose = add(new Mesh(new ConeGeometry(1.05, 2.2, 28), hullSmooth), 0, 0, -3.2, -Math.PI / 2);
    aNose.scale.set(0.95, 1, 0.48);
    add(new Mesh(taperedCanopyGeometry(1.0, 0.62, 1.8), canopyMat), 0, 0.52, -1.45);
    // Side booms: flattened cylinders with nose cones.
    for (const side of [1, -1]) {
      const boom = add(new Mesh(new CylinderGeometry(0.42, 0.48, 3.6, 20), panelSmooth), side * 1.7, -0.1, 0.6, Math.PI / 2);
      boom.scale.set(1, 1, 0.8);
      const bNose = add(new Mesh(new ConeGeometry(0.42, 1.1, 20), panelSmooth), side * 1.7, -0.1, -1.7, -Math.PI / 2);
      bNose.scale.set(1, 1, 0.8);
    }
    const boomBridge = new BoxGeometry(0.6, 0.42, 3.0); // weld booms to the hull
    add(new Mesh(boomBridge, hullMat), 1.15, -0.1, 0.55);
    add(new Mesh(boomBridge.clone(), hullMat), -1.15, -0.1, 0.55);
    const aWing = wingGeometry(1.8, 1.6, 0.5, 0.16); // tapered outboard wings
    add(new Mesh(aWing, panelMat), 2.8, 0.1, 0.9, 0, 0.18, -0.1);
    const aWingL = aWing.clone();
    aWingL.scale(-1, 1, 1);
    aWingL.computeVertexNormals();
    add(new Mesh(aWingL, panelMat), -2.8, 0.1, 0.9, 0, -0.18, 0.1);
    add(new Mesh(wingGeometry(1.4, 1.2, 0.35, 0.12), panelMat), 0, 1.0, 1.6, 0.22, 0, Math.PI / 2);
    const aNozzle = new CylinderGeometry(0.34, 0.26, 0.28, 16);
    add(new Mesh(aNozzle, accentMat), 1.7, -0.1, 2.55, Math.PI / 2);
    add(new Mesh(aNozzle.clone(), accentMat), -1.7, -0.1, 2.55, Math.PI / 2);
    add(new Mesh(new CylinderGeometry(0.4, 0.3, 0.3, 16), accentMat), 0, 0, 2.42, Math.PI / 2);
    const aGun = new CylinderGeometry(0.09, 0.09, 1.7, 12);
    add(new Mesh(aGun, panelSmooth), 0.85, -0.32, -2.6, Math.PI / 2);
    add(new Mesh(aGun.clone(), panelSmooth), -0.85, -0.32, -2.6, Math.PI / 2);
    // -- fancy pass: stacked armor, missile pods, drums, twin fins, keel -----
    add(new Mesh(new BoxGeometry(1.7, 0.18, 3.6), panelMat), 0, 0.56, 0.3); // dorsal armor slab
    add(new Mesh(new BoxGeometry(1.2, 0.14, 2.6), hullMat), 0, 0.72, 0.5); // second layer
    const aCheek = new BoxGeometry(0.2, 0.6, 2.4); // cheek armor, embedded in the round boom
    add(new Mesh(aCheek, hullMat), 2.05, -0.1, 0.2);
    add(new Mesh(aCheek.clone(), hullMat), -2.05, -0.1, 0.2);
    const aCheekStripe = new BoxGeometry(0.06, 0.14, 2.0);
    add(new Mesh(aCheekStripe, accentMat), 2.17, -0.02, 0.2);
    add(new Mesh(aCheekStripe.clone(), accentMat), -2.17, -0.02, 0.2);
    for (const side of [1, -1]) { // wing missile pods with launch tubes
      add(new Mesh(new BoxGeometry(0.8, 0.5, 1.6), panelMat), side * 2.8, -0.22, 0.75, 0, side * 0.18, 0);
      add(new Mesh(new BoxGeometry(0.16, 0.3, 1.2), panelMat), side * 2.8, 0.0, 0.8, 0, side * 0.18, 0); // pylon into the wing
      // Tubes rotate WITH the pod — flat placement left them hanging off
      // the yawed front face.
      const podYaw = side * 0.18;
      // Rows centered INSIDE the pod face (pod spans y −0.47..0.03) — the
      // lower row used to dangle below the housing.
      for (const [tx, ty] of [[-0.18, 0.04], [0.18, 0.04], [-0.18, -0.14], [0.18, -0.14]]) {
        const wx = side * 2.8 + tx * Math.cos(podYaw) + -0.78 * Math.sin(podYaw);
        const wz = 0.75 + (-tx * Math.sin(podYaw) + -0.78 * Math.cos(podYaw));
        add(
          new Mesh(new CylinderGeometry(0.08, 0.08, 0.2, 6), darkMat),
          wx, -0.22 + ty, wz, Math.PI / 2, podYaw,
        );
      }
    }
    add(new Mesh(new BoxGeometry(0.9, 0.1, 0.16), accentMat), 0, -0.5, -2.3); // chin sensor bar
    const aFin = wingGeometry(0.9, 1.0, 0.4, 0.09); // twin tapered tail fins
    add(new Mesh(aFin, panelMat), 0.82, 0.82, 1.75, 0.22, 0, Math.PI / 2 - 0.28);
    add(new Mesh(aFin.clone(), panelMat), -0.82, 0.82, 1.75, 0.22, 0, Math.PI / 2 + 0.28);
    const aDrum = new CylinderGeometry(0.26, 0.26, 0.8, 16); // ammo drums aft of canopy
    add(new Mesh(aDrum, trimSmooth), 0.55, 0.62, 0.55, Math.PI / 2);
    add(new Mesh(aDrum.clone(), trimSmooth), -0.55, 0.62, 0.55, Math.PI / 2);
    add(new Mesh(new BoxGeometry(1.2, 0.16, 3.2), panelMat), 0, -0.56, 0.4); // keel plate

    gunpoints = [new Vector3(0.85, -0.32, -3.5), new Vector3(-0.85, -0.32, -3.5)];
    enginePoints = [
      new Vector3(1.7, -0.1, 2.8),
      new Vector3(-1.7, -0.1, 2.8),
      new Vector3(0, 0, 2.75),
    ];
    radius = 3.0;
  return { gunpoints, enginePoints, radius };
}
