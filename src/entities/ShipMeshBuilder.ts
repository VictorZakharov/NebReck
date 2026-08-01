import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { getGlowTexture } from '../fx/textures';
import { getSurfaceTexture } from '../rendering/SurfaceTextures';
import { batchStaticMeshes } from '../rendering/StaticMeshBatching';
import {
  NAV_LIGHTS,
  ShipKind,
  ShipHitBox,
  ShipMesh,
  ShipStyle,
  STYLES,
} from './ShipMeshTypes';

export interface HullBuildResult {
  gunpoints: Vector3[];
  enginePoints: Vector3[];
  radius: number;
  hitBoxes?: ShipHitBox[];
}

export interface ShipBuildContext {
  style: ShipStyle;
  group: Group;
  add(mesh: Mesh, x: number, y: number, z: number, rx?: number, ry?: number, rz?: number): Mesh;
  hullMat: MeshStandardMaterial;
  panelMat: MeshStandardMaterial;
  accentMat: MeshStandardMaterial;
  canopyMat: MeshStandardMaterial;
  darkMat: MeshStandardMaterial;
  trimMat: MeshStandardMaterial;
  hullSmooth: MeshStandardMaterial;
  panelSmooth: MeshStandardMaterial;
  trimSmooth: MeshStandardMaterial;
}

export function createShipBuildContext(kind: ShipKind): ShipBuildContext {
  const style = STYLES[kind];
  const plating = getSurfaceTexture('hull', 2, 2);
  const hullMat = new MeshStandardMaterial({
    color: style.hull, metalness: 0.62, roughness: 0.34, flatShading: true,
    map: plating, bumpMap: plating, bumpScale: 0.35,
  });
  const panelMat = new MeshStandardMaterial({
    color: style.panel, metalness: 0.55, roughness: 0.5, flatShading: true,
    map: plating, bumpMap: plating, bumpScale: 0.35,
  });
  const accentMat = new MeshStandardMaterial({
    color: 0x111111, emissive: new Color(style.accent), emissiveIntensity: 2.2,
    metalness: 0.3, roughness: 0.4,
  });
  const canopyMat = new MeshStandardMaterial({
    color: 0x0a0f14, emissive: new Color(style.canopy), emissiveIntensity: 0.7,
    metalness: 0.9, roughness: 0.12,
  });
  const darkMat = new MeshStandardMaterial({ color: 0x0c0f13, roughness: 0.9 });
  const trimMat = new MeshStandardMaterial({
    color: 0xd6dde6, metalness: 0.75, roughness: 0.25, flatShading: true,
  });
  const hullSmooth = new MeshStandardMaterial({
    color: style.hull, metalness: 0.62, roughness: 0.34,
    map: plating, bumpMap: plating, bumpScale: 0.35,
  });
  const panelSmooth = new MeshStandardMaterial({
    color: style.panel, metalness: 0.55, roughness: 0.5,
    map: plating, bumpMap: plating, bumpScale: 0.35,
  });
  const trimSmooth = new MeshStandardMaterial({
    color: 0xd6dde6, metalness: 0.75, roughness: 0.25,
  });

  const group = new Group();
  const add = (
    mesh: Mesh,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ): Mesh => {
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    group.add(mesh);
    return mesh;
  };

  return {
    style,
    group,
    add,
    hullMat,
    panelMat,
    accentMat,
    canopyMat,
    darkMat,
    trimMat,
    hullSmooth,
    panelSmooth,
    trimSmooth,
  };
}

/**
 * Aerodynamic wing/fin: root at the -x end, chord and thickness TAPER toward
 * the tip, leading edge pulled into a sweep — reads as an airfoil, not a slab.
 */
export function wingGeometry(
  length: number,
  rootChord: number,
  tipChordFrac: number,
  thickness: number,
): BoxGeometry {
  const geo = new BoxGeometry(length, thickness, rootChord, 6, 1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getX(i) + length / 2) / length; // 0 root → 1 tip
    const chord = 1 + (tipChordFrac - 1) * t;
    pos.setZ(i, pos.getZ(i) * chord + rootChord * 0.18 * t); // taper + sweep back
    pos.setY(i, pos.getY(i) * (1 - 0.5 * t)); // thin toward the tip
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Procedural ship construction from primitives — no external assets. Ships
 * face -Z (three.js forward). Returns muzzle/engine anchor points so combat
 * and FX systems don't guess at geometry.
 */
/** Smooth teardrop canopy: narrow at the nose, fuller toward the pilot, with
 * its lower half embedded into the fuselage instead of sitting as a box. */
export function taperedCanopyGeometry(width: number, height: number, length: number): SphereGeometry {
  const geo = new SphereGeometry(1, 24, 12);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const foreToAft = (z + 1) * 0.5;
    const taper = 0.68 + foreToAft * 0.32;
    pos.setXYZ(
      i,
      pos.getX(i) * width * 0.5 * taper,
      pos.getY(i) * height * 0.5,
      z * length * 0.5,
    );
  }
  geo.computeVertexNormals();
  return geo;
}

export function finishShipBuild(
  kind: ShipKind,
  context: ShipBuildContext,
  result: HullBuildResult,
): ShipMesh {
  const { group, add, style, panelMat, accentMat } = context;
  let { gunpoints, enginePoints, radius } = result;
  // The scout is genuinely SMALLER in the world (and harder to hit) — cards
  // normalize by radius, so hangar portraits stay comparable.
  if (kind === 'vanta') {
    const k = 0.78;
    group.scale.setScalar(k);
    for (const p of gunpoints) p.multiplyScalar(k);
    for (const p of enginePoints) p.multiplyScalar(k);
    radius *= k;
  }

  // ---- greeble pass: the details that make hulls read as machines ----------

  // Wingtip nav lights (port red / starboard green — a real-aviation touch).
  const navPos = NAV_LIGHTS[kind];
  if (navPos) {
    const navGeo = new SphereGeometry(0.09, 8, 6);
    const port = new Mesh(navGeo, new MeshStandardMaterial({
      color: 0x110000, emissive: new Color(0xff2222), emissiveIntensity: 3,
    }));
    port.position.set(-navPos[0], navPos[1], navPos[2]);
    group.add(port);
    const starboard = new Mesh(navGeo.clone(), new MeshStandardMaterial({
      color: 0x001100, emissive: new Color(0x33ff55), emissiveIntensity: 3,
    }));
    starboard.position.set(navPos[0], navPos[1], navPos[2]);
    group.add(starboard);
  }

  if (kind === 'kestrel' || kind === 'vanta' || kind === 'aegis') {
    // Comms antenna with a lit tip.
    const mastX = kind === 'aegis' ? 0.5 : 0.2;
    add(new Mesh(new CylinderGeometry(0.02, 0.03, 0.9, 5), panelMat), mastX, 0.85, 1.1);
    if (kind !== 'aegis') {
      add(new Mesh(new SphereGeometry(0.045, 6, 5), accentMat), mastX, 1.3, 1.1);
    }
    // Dorsal panel plates along the spine.
    const plateGeo = new BoxGeometry(0.5, 0.04, 0.7);
    const plateMat = new MeshStandardMaterial({
      color: style.panel, metalness: 0.7, roughness: 0.3, flatShading: true,
    });
    for (let i = 0; i < 3; i++) {
      add(new Mesh(plateGeo.clone(), plateMat), (i - 1) * 0.28, kind === 'aegis' ? 0.48 : 0.28, 0.2 + i * 0.55);
    }
    // Intake slots on the flanks.
    const intakeGeo = new BoxGeometry(0.06, 0.14, 0.9);
    const intakeMat = new MeshStandardMaterial({ color: 0x0c0f13, roughness: 0.9 });
    const flankX = kind === 'aegis' ? 1.05 : 0.5;
    add(new Mesh(intakeGeo, intakeMat), flankX, 0.05, 0.3);
    add(new Mesh(intakeGeo.clone(), intakeMat), -flankX, 0.05, 0.3);
  }

  // Engine nozzles get a hot inner disc (HDR — blooms into a real burner).
  const discMat = new MeshStandardMaterial({
    color: 0x000000, emissive: new Color(style.engine), emissiveIntensity: 4.5,
  });
  for (const p of enginePoints) {
    const disc = new Mesh(new CylinderGeometry(0.2, 0.2, 0.05, 18), discMat);
    disc.position.set(p.x, p.y, p.z - 0.12);
    disc.rotation.x = Math.PI / 2;
    group.add(disc);
  }

  // Engine glow sprites at each nozzle.
  const engineGlows: Sprite[] = [];
  for (const p of enginePoints) {
    const sprite = new Sprite(
      new SpriteMaterial({
        map: getGlowTexture(),
        color: style.engine,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.8,
      }),
    );
    sprite.scale.setScalar(1.6);
    sprite.position.copy(p);
    group.add(sprite);
    engineGlows.push(sprite);
  }

  batchStaticMeshes(group);

  return {
    group,
    gunpoints,
    enginePoints,
    engineGlows,
    radius,
    hitBoxes: result.hitBoxes ?? [],
  };
}
