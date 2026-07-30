import { getSurfaceTexture } from '../rendering/SurfaceTextures';
import {
  AdditiveBlending,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  RingGeometry,
  TorusGeometry,
} from 'three';

/**
 * The ship-selection backdrop: a fully procedural hangar interior wrapped
 * around the showcase pad. Deck plating with lit guide channels, rib walls
 * with pipe runs and signage, ceiling trusses with strip lights, a gantry
 * crane, prop clutter — and one open bay aperture (force-field shimmer)
 * through which the sector nebula stays visible.
 *
 * Static geometry only, built once and add/removed with the hangar screen.
 * The two PointLights change the scene light count → one material recompile
 * on entering the hangar, which hides behind the screen transition.
 */
export class HangarBay {
  readonly group = new Group();

  constructor() {
    const metal = getSurfaceTexture('metal', 3, 3);
    const steel = new MeshStandardMaterial({
      color: 0x555e6b, metalness: 0.35, roughness: 0.55, flatShading: true,
      map: metal, bumpMap: metal, bumpScale: 0.5,
    });
    const dark = new MeshStandardMaterial({
      color: 0x333a44, metalness: 0.3, roughness: 0.7, flatShading: true,
      map: metal, bumpMap: metal, bumpScale: 0.5,
    });
    const deckMat = new MeshStandardMaterial({
      color: 0x3d4550, metalness: 0.4, roughness: 0.6, flatShading: true,
      map: metal, bumpMap: metal, bumpScale: 0.5,
    });
    const glowCyan = new MeshStandardMaterial({ color: 0x06222a, emissive: new Color(0x27e8ff), emissiveIntensity: 0.85 });
    const glowAmber = new MeshStandardMaterial({ color: 0x1a1206, emissive: new Color(0xffb347), emissiveIntensity: 0.72 });
    const glowWhite = new MeshStandardMaterial({ color: 0x111318, emissive: new Color(0xdff4ff), emissiveIntensity: 0.75 });

    const add = (m: Mesh): Mesh => { this.group.add(m); return m; };
    const box = (w: number, h: number, d: number, mat: MeshStandardMaterial, x: number, y: number, z: number): Mesh => {
      const m = new Mesh(new BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      return add(m);
    };

    // ---- deck: plate grid with seams + lit guide channels --------------------
    box(56, 1, 72, deckMat, 0, -3.5, 0);
    for (let px = -2; px <= 2; px++) {
      for (let pz = -3; pz <= 3; pz++) {
        if (Math.abs(px) < 1 && Math.abs(pz) < 1) continue; // pad zone stays clean
        const plate = box(9.6, 0.18, 8.6, ((px + pz) & 1) === 0 ? dark : deckMat, px * 10.4, -2.95, pz * 9.6);
        plate.rotation.y = ((px * 3 + pz) % 2) * 0.003; // hairline seam shimmer
      }
    }
    // Guide channels from the aperture to the pad. Deck markings all sit
    // ABOVE the plate tops (y −2.86) — coplanar overlap z-fights.
    for (const gx of [-8.5, 8.5]) box(0.35, 0.08, 58, glowCyan, gx, -2.8, -4);
    for (let z = -30; z <= 18; z += 6) {
      box(0.9, 0.09, 0.35, glowAmber, -8.5, -2.79, z);
      box(0.9, 0.09, 0.35, glowAmber, 8.5, -2.79, z);
    }

    // ---- landing pad: double ring, chevrons, pad lights ----------------------
    const ring = (rIn: number, rOut: number, mat: MeshStandardMaterial, y: number): void => {
      const m = new Mesh(new RingGeometry(rIn, rOut, 48), mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      add(m);
    };
    ring(6.9, 7.25, glowCyan, -2.82);
    ring(5.6, 5.75, glowCyan, -2.83);
    const padPlate = new Mesh(new CylinderGeometry(7.6, 7.9, 0.5, 48), dark);
    padPlate.position.y = -3.2;
    add(padPlate);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const chev = box(1.3, 0.1, 0.5, glowAmber, Math.cos(a) * 8.6, -2.79, Math.sin(a) * 8.6);
      chev.rotation.y = -a;
    }

    // ---- side walls: panels, ribs, pipes, caution stripe, signage ------------
    for (const side of [1, -1]) {
      const wx = side * 27;
      box(2, 19, 72, dark, wx, 5.5, 0);
      for (let z = -30; z <= 30; z += 10) {
        box(1.4, 17, 2.2, steel, side * 25.9, 4.5, z);
        box(1.0, 0.5, 1.6, glowCyan, side * 25.8, 12.6, z); // rib head lamp
      }
      // Twin pipe runs.
      for (const [py, pr] of [[9.4, 0.34], [10.3, 0.22]] as const) {
        const pipe = new Mesh(new CylinderGeometry(pr, pr, 68, 8), steel);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(side * 25.4, py, 0);
        add(pipe);
      }
      box(0.4, 0.7, 68, glowAmber, side * 25.9, -1.2, 0); // caution stripe at deck level
    }

    // ---- signage: canvas "BAY 05" panels on RIB-FREE midspans ---------------
    // (ribs sit every 10 in z; a sign at z=12 was half-swallowed by one)
    const sign = makeSignTexture();
    for (const side of [1, -1]) {
      const backing = new Mesh(new BoxGeometry(0.25, 3, 8), dark);
      backing.position.set(side * 25.45, 7, side * 15);
      add(backing);
      const panel = new Mesh(
        new PlaneGeometry(7.5, 1.9),
        new MeshBasicMaterial({ map: sign, transparent: true, toneMapped: false }),
      );
      panel.position.set(side * 25.28, 7, side * 15);
      panel.rotation.y = side * -Math.PI / 2;
      add(panel);
    }
    // Status boards on the back wall interior face.
    const status = makeStatusTexture();
    for (const sx of [-10, 10]) {
      const board = new Mesh(
        new PlaneGeometry(6.5, 3.4),
        new MeshBasicMaterial({ map: status, transparent: true, toneMapped: false }),
      );
      board.position.set(sx, 7.5, 33.85);
      board.rotation.y = Math.PI;
      add(board);
    }
    // Blinking status pips beneath the boards.
    for (let i = 0; i < 6; i++) {
      box(0.5, 0.3, 0.12, i % 2 === 0 ? glowCyan : glowAmber, -5 + i * 2, 5.2, 33.9);
    }

    // ---- back wall (+Z): pressure door with radial frame ---------------------
    box(56, 19, 2, dark, 0, 5.5, 35);
    box(11, 13, 0.8, steel, 0, 2.5, 34.2);
    box(9.4, 11.4, 0.5, deckMat, 0, 2.3, 33.9);
    box(0.8, 11, 0.6, glowCyan, -5.2, 2.3, 33.8);
    box(0.8, 11, 0.6, glowCyan, 5.2, 2.3, 33.8);
    const doorRing = new Mesh(new TorusGeometry(3.4, 0.28, 10, 24), steel);
    doorRing.position.set(0, 3, 33.7);
    add(doorRing);
    box(1.6, 1.6, 0.5, glowAmber, 0, 3, 33.6);

    // ---- open bay aperture (-Z): truss frame + force field -------------------
    box(56, 3, 2.4, steel, 0, 13.8, -35);
    box(3, 19, 2.4, steel, -26.5, 5.5, -35);
    box(3, 19, 2.4, steel, 26.5, 5.5, -35);
    box(56, 2.2, 2.4, steel, 0, -2.6, -35);
    for (let x = -22; x <= 22; x += 5.5) {
      box(0.7, 0.4, 0.7, glowAmber, x, -1.35, -35); // sill warning studs
      box(0.7, 0.4, 0.7, glowAmber, x, 11.9, -35); // proud BELOW the truss, not inside it
    }
    // Hazard chevron strip painted along the inner sill.
    const hazardStrip = new Mesh(
      new PlaneGeometry(48, 1.8),
      new MeshBasicMaterial({ map: makeHazardTexture(), transparent: true, toneMapped: false }),
    );
    hazardStrip.rotation.x = -Math.PI / 2;
    hazardStrip.position.set(0, -2.75, -31.8);
    add(hazardStrip);
    const field = new Mesh(
      new PlaneGeometry(50, 14.4),
      new MeshBasicMaterial({
        color: 0x27e8ff, transparent: true, opacity: 0.05,
        blending: AdditiveBlending, depthWrite: false, side: DoubleSide,
      }),
    );
    field.position.set(0, 5, -34.6);
    add(field);

    // ---- ceiling: trusses, strip lights, cables, gantry crane ----------------
    box(56, 1, 72, dark, 0, 15.5, 0);
    for (let z = -28; z <= 28; z += 11) {
      box(54, 1.1, 1.7, steel, 0, 14.3, z);
      box(19, 0.22, 0.9, glowWhite, -11, 13.9, z + 5); // hanging strip fixtures
      box(19, 0.22, 0.9, glowWhite, 11, 13.9, z + 5);
    }
    const cable = new Mesh(new CylinderGeometry(0.16, 0.16, 66, 6), dark);
    cable.rotation.x = Math.PI / 2;
    cable.position.set(-18, 13.6, 0);
    add(cable);
    // Drooping cable pairs between beams — two angled segments per span.
    for (const cz of [-22, 0, 22]) {
      for (const seg of [1, -1]) {
        const drop = new Mesh(new CylinderGeometry(0.09, 0.09, 6.1, 6), dark);
        drop.position.set(14 + seg * 2.85, 12.9, cz + 5.5);
        drop.rotation.z = seg * 1.18;
        add(drop);
      }
    }
    // Deck number decal beside the pad.
    const decal = new Mesh(
      new PlaneGeometry(11, 11),
      new MeshBasicMaterial({ map: makeDeckNumberTexture(), transparent: true, toneMapped: false }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.rotation.z = 0.25;
    decal.position.set(-15.5, -2.76, 12);
    add(decal);
    // Gantry: two columns + cross beam + trolley and hook block over the pad.
    box(1.8, 18, 1.8, steel, -20, 4.5, 8);
    box(1.8, 18, 1.8, steel, 20, 4.5, 8);
    box(42, 1.4, 2.2, steel, 0, 12.9, 8);
    box(2.4, 1.1, 2.6, dark, 4, 11.9, 8);
    const hook = new Mesh(new CylinderGeometry(0.09, 0.09, 3.4, 6), dark);
    hook.position.set(4, 10, 8);
    add(hook);
    box(0.9, 0.9, 0.9, glowAmber, 4, 8.1, 8);

    // ---- prop clutter: crate stacks, drums, floodlights, hose ----------------
    const crate = (x: number, y: number, z: number, s: number, rot: number): void => {
      const c = box(s, s, s, steel, x, y, z);
      c.rotation.y = rot;
      box(s * 0.55, 0.08, s * 0.55, glowCyan, x, y + s / 2 + 0.05, z).rotation.y = rot;
    };
    crate(-17, -2.2, -14, 1.7, 0.3);
    crate(-15.2, -2.25, -12.2, 1.6, 0.9);
    crate(-16.4, -0.6, -13.4, 1.4, 0.6);
    crate(19, -2.3, 14, 1.5, 0.2);
    for (const [dx, dz] of [[-19.5, -9], [-18.6, -7.6], [17.5, 18.5]] as const) {
      const drum = new Mesh(new CylinderGeometry(0.75, 0.75, 1.7, 12), dark);
      drum.position.set(dx, -2.25, dz);
      add(drum);
      box(0.7, 0.12, 0.7, glowAmber, dx, -1.32, dz);
    }
    const hose = new Mesh(new TorusGeometry(1.1, 0.16, 8, 20), dark);
    hose.rotation.x = -Math.PI / 2;
    hose.position.set(14, -2.9, -16);
    add(hose);
    for (const [fx, fz, ry] of [[-13, 16, 2.6], [13.5, -13.5, -0.6]] as const) {
      box(0.28, 3.2, 0.28, dark, fx, -1.5, fz);
      const head = box(1.15, 0.7, 0.8, glowWhite, fx, 0.35, fz);
      head.rotation.y = ry;
      head.rotation.z = 0.25;
    }

    // ---- interior lights (pop!) — one recompile on hangar entry --------------
    // r170 physical light units: point lights need hundreds of candela.
    // Tuned DIM — a hangar at night-cycle, lit by fixtures, not floodlit.
    const key = new PointLight(0x9fd8ff, 210, 75, 1.6);
    key.position.set(0, 12, -6);
    this.group.add(key);
    const warm = new PointLight(0xffb347, 95, 45, 1.7);
    warm.position.set(-14, 5, -8);
    this.group.add(warm);
    const accent = new PointLight(0x27e8ff, 70, 40, 1.8);
    accent.position.set(16, 4, 14);
    this.group.add(accent);
    // Soft fill so walls/props at the room edges stay readable.
    this.group.add(new AmbientLight(0x9fc6d8, 0.42));
  }
}

/** Diagonal amber/black hazard stripes for the aperture sill. */
function makeHazardTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 24;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(20, 14, 4, 0.9)';
  g.fillRect(0, 0, 512, 24);
  g.fillStyle = '#ffb347';
  for (let x = -24; x < 512; x += 32) {
    g.beginPath();
    g.moveTo(x, 24);
    g.lineTo(x + 16, 0);
    g.lineTo(x + 32, 0);
    g.lineTo(x + 16, 24);
    g.closePath();
    g.fill();
  }
  const tex = new CanvasTexture(c);
  return tex;
}

/** Big painted deck numeral, worn stencil style. */
function makeDeckNumberTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(223, 244, 255, 0.16)';
  g.font = '700 190px "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('05', 128, 138);
  g.strokeStyle = 'rgba(39, 232, 255, 0.25)';
  g.lineWidth = 3;
  g.strokeRect(14, 14, 228, 228);
  return new CanvasTexture(c);
}

/** Fake systems status board: labeled bars, all comfortably green-lit. */
function makeStatusTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(5, 12, 18, 0.9)';
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = 'rgba(39, 232, 255, 0.5)';
  g.lineWidth = 4;
  g.strokeRect(6, 6, 500, 244);
  g.fillStyle = '#27e8ff';
  g.font = '600 30px "Segoe UI", sans-serif';
  g.textAlign = 'left';
  g.fillText('BAY SYSTEMS', 28, 48);
  const rows: [string, number, string][] = [
    ['FUEL', 0.82, '#35e88a'],
    ['POWER', 0.94, '#35e88a'],
    ['SHIELD GATE', 0.66, '#ffb347'],
    ['GRAV DECK', 1.0, '#35e88a'],
  ];
  rows.forEach(([label, frac, color], i) => {
    const y = 84 + i * 42;
    g.fillStyle = 'rgba(223, 244, 255, 0.75)';
    g.font = '22px "Segoe UI", sans-serif';
    g.fillText(label, 28, y + 16);
    g.fillStyle = 'rgba(255, 255, 255, 0.1)';
    g.fillRect(210, y, 270, 20);
    g.fillStyle = color;
    g.fillRect(210, y, 270 * frac, 20);
  });
  return new CanvasTexture(c);
}

/** Canvas-drawn wall signage — same procedural-texture doctrine as the MFDs. */
function makeSignTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(6, 14, 20, 0.85)';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = 'rgba(39, 232, 255, 0.55)';
  g.lineWidth = 4;
  g.strokeRect(6, 6, 500, 116);
  g.fillStyle = '#27e8ff';
  g.font = '600 62px "Segoe UI", sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText('BAY 05', 30, 66);
  g.fillStyle = '#ffb347';
  g.font = '600 30px "Segoe UI", sans-serif';
  g.fillText('HALCYON DRIFT', 262, 52);
  g.fillStyle = 'rgba(223, 244, 255, 0.75)';
  g.font = '24px "Segoe UI", sans-serif';
  g.fillText('AUTH. PERSONNEL ONLY', 262, 90);
  return new CanvasTexture(c);
}
