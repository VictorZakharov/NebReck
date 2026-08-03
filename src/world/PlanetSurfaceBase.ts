import {
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { Rng } from '../core/Rng';
import { getSurfaceTexture } from '../rendering/SurfaceTextures';
import { makeBody } from './AsteroidField';
import { PlanetInfo } from './Sector';
import { BaseKind, BaseLandmark, SurfaceStructureHost } from './PlanetSurfaceStructures';

const UP = new Vector3(0, 1, 0);

export function buildSurfaceBase(
  host: SurfaceStructureHost,
  rng: Rng,
  x: number,
  z: number,
  kind: BaseKind,
  planet: PlanetInfo,
): void {
  new SurfaceBaseBuilder(host).build(rng, x, z, kind, planet);
}

/** Builds one complete Vigil installation without owning terrain state. */
class SurfaceBaseBuilder {
  private trainingBattery: Vector3 | null = null;
  constructor(private readonly host: SurfaceStructureHost) {}

  private get group() { return this.host.group; }
  private get bodies() { return this.host.bodies; }
  private get baseLandmarks() { return this.host.baseLandmarks; }
  private get patrols() { return this.host.patrols; }
  private heightAt(x: number, z: number): number { return this.host.heightAt(x, z); }
  private registerObstacle(object: Object3D, padding?: number): void {
    this.host.registerObstacle(object, padding);
  }
  private addStash(rng: Rng, x: number, y: number, z: number): void {
    this.host.addStash(rng, x, y, z);
  }
  private addTurretPost(
    x: number,
    y: number,
    z: number,
    lookX: number,
    lookZ: number,
  ): void {
    this.host.addTurretPost(x, y, z, lookX, lookZ);
    this.trainingBattery ??= new Vector3(x, y + 2, z);
  }

  build(rng: Rng, bx: number, bz: number, kind: BaseKind, planet: PlanetInfo): void {
    this.trainingBattery = null;
    const by = this.heightAt(bx, bz);
    // Low metalness: metallic surfaces go BLACK without an env map — the
    // whole base read as a dark blob against the lit terrain.
    const baseMetal = getSurfaceTexture('metal', 2, 2);
    const wallMat = new MeshStandardMaterial({
      color: new Color(0x59626c).lerp(planet.surfaceB, 0.25),
      metalness: 0.3, roughness: 0.55, flatShading: true,
      map: baseMetal, bumpMap: baseMetal, bumpScale: 0.45,
    });
    const darkMat = new MeshStandardMaterial({
      color: 0x31373e, metalness: 0.35, roughness: 0.5, flatShading: true,
      map: baseMetal, bumpMap: baseMetal, bumpScale: 0.45,
    });
    const accentMat = new MeshStandardMaterial({
      color: 0x140505, emissive: new Color(0xff3b30), emissiveIntensity: 1.6,
    });
    const windowMat = new MeshStandardMaterial({
      color: 0x05090e, emissive: new Color(0x9fd8ff), emissiveIntensity: 1.7,
    });
    const hazardMat = new MeshStandardMaterial({
      color: 0x1a1206, emissive: new Color(0xffb347), emissiveIntensity: 1.3,
    });
    const landmark: BaseLandmark = {
      center: new Vector3(bx, by, bz), kind, trainingBattery: null,
    };
    this.baseLandmarks.push(landmark);

    const solid = (
      mesh: Mesh,
      radius: number,
      box?: { hx: number; hy: number; hz: number },
    ): void => {
      this.group.add(mesh);
      this.bodies.push(makeBody({
        position: mesh.position.clone(),
        radius,
        hp: Number.POSITIVE_INFINITY,
        solo: mesh,
        hero: true,
        box: box ?? null,
      }));
    };
    const deco = (mesh: Mesh, blocks = true): void => {
      this.group.add(mesh);
      if (blocks) this.registerObstacle(mesh);
    };

    // -- shared detail vocabulary --------------------------------------------
    const padMat = new MeshStandardMaterial({
      color: 0x4a5158, metalness: 0.12, roughness: 0.88, flatShading: true,
    });
    const apron = (r: number): void => {
      const hubRadius = r * 0.58;
      const hub = new Mesh(
        new CylinderGeometry(hubRadius, hubRadius + 2.2, 1.05, 12),
        padMat,
      );
      hub.position.set(bx, by + 0.18, bz);
      deco(hub);

      // Four short service decks give the installation a readable plan from
      // the air without the old giant circular slab/crescent silhouette.
      const deckLength = r - hubRadius + 8;
      for (let arm = 0; arm < 4; arm++) {
        const angle = arm * Math.PI * 0.5;
        const distance = hubRadius + deckLength * 0.5 - 3;
        const deck = new Mesh(
          new BoxGeometry(deckLength, 0.72, 8.5),
          padMat,
        );
        deck.position.set(
          bx + Math.cos(angle) * distance,
          by + 0.28,
          bz + Math.sin(angle) * distance,
        );
        deck.rotation.y = -angle;
        deco(deck);

        const guide = new Mesh(
          new BoxGeometry(deckLength * 0.72, 0.09, 0.34),
          hazardMat,
        );
        guide.position.copy(deck.position);
        guide.position.y += 0.43;
        guide.rotation.y = deck.rotation.y;
        deco(guide, false);
      }

      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const stud = new Mesh(new BoxGeometry(1.2, 0.5, 1.2), hazardMat);
        stud.position.set(
          bx + Math.cos(a) * (hubRadius - 1.3),
          by + 1.02,
          bz + Math.sin(a) * (hubRadius - 1.3),
        );
        deco(stud, false);
      }
    };
    const windows = (x: number, floorY: number, z: number, w: number, h: number, d: number): void => {
      const rows = h > 9 ? 2 : 1;
      const cols = Math.max(2, Math.floor(w / 4.5));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          for (const side of [1, -1]) {
            const slit = new Mesh(new BoxGeometry(2.1, 0.7, 0.12), windowMat);
            slit.position.set(
              x - w / 2 + (c + 0.5) * (w / cols),
              floorY + h * (rows === 1 ? 0.55 : 0.35 + r * 0.35),
              z + side * (d / 2 + 0.08),
            );
            deco(slit, false);
          }
        }
      }
    };
    const pipe = (
      ax: number, ay: number, az: number,
      cx: number, cy: number, cz: number, r = 0.5,
    ): void => {
      const dir = new Vector3(cx - ax, cy - ay, cz - az);
      const len = dir.length();
      const m = new Mesh(new CylinderGeometry(r, r, len, 8), darkMat);
      m.position.set((ax + cx) / 2, (ay + cy) / 2, (az + cz) / 2);
      m.quaternion.setFromUnitVectors(UP, dir.normalize());
      deco(m);
    };
    const pole = (x: number, z: number): void => {
      const y = this.heightAt(x, z);
      const mast = new Mesh(new CylinderGeometry(0.22, 0.32, 7, 6), darkMat);
      mast.position.set(x, y + 3.5, z);
      deco(mast);
      const head = new Mesh(new BoxGeometry(1.4, 0.5, 0.6), windowMat);
      head.position.set(x, y + 7.1, z);
      deco(head);
    };
    const container = (x: number, z: number): void => {
      const m = new Mesh(new BoxGeometry(5.2, 2.6, 2.6), rng.next() > 0.5 ? darkMat : wallMat);
      m.position.set(x, this.heightAt(x, z) + 1.5, z);
      m.rotation.y = rng.range(0, Math.PI);
      deco(m);
      const label = new Mesh(new BoxGeometry(0.9, 0.9, 0.08), hazardMat);
      label.position.set(x, this.heightAt(x, z) + 1.7, z + 1.36);
      label.rotation.y = m.rotation.y;
      deco(label, false);
    };
    const landingPad = (x: number, z: number): void => {
      const y = this.heightAt(x, z);
      const dx = x - bx;
      const dz = z - bz;
      const distanceFromHub = Math.hypot(dx, dz);
      if (distanceFromHub > 16) {
        const ux = dx / distanceFromHub;
        const uz = dz / distanceFromHub;
        const connectorLength = Math.max(8, distanceFromHub - 11);
        const connector = new Mesh(
          new BoxGeometry(6.4, 0.6, connectorLength),
          padMat,
        );
        connector.position.set(
          bx + ux * connectorLength * 0.5,
          this.heightAt(
            bx + ux * connectorLength * 0.5,
            bz + uz * connectorLength * 0.5,
          ) + 0.42,
          bz + uz * connectorLength * 0.5,
        );
        connector.rotation.y = Math.atan2(dx, dz);
        deco(connector);
        for (const side of [-1, 1]) {
          const rail = new Mesh(
            new BoxGeometry(0.22, 0.16, connectorLength - 1),
            hazardMat,
          );
          rail.position.copy(connector.position);
          rail.position.x += Math.cos(connector.rotation.y) * side * 2.45;
          rail.position.z -= Math.sin(connector.rotation.y) * side * 2.45;
          rail.position.y += 0.39;
          rail.rotation.y = connector.rotation.y;
          deco(rail, false);
        }
      }
      const disc = new Mesh(new CylinderGeometry(10, 11, 0.9, 8), darkMat);
      disc.position.set(x, y + 0.7, z);
      deco(disc);
      // Approach chevrons: V-pairs marching outward, pointing at the pad.
      const away = Math.atan2(z - bz, x - bx);
      for (let i = 0; i < 3; i++) {
        const d = 15 + i * 6;
        const ax2 = x + Math.cos(away) * d;
        const az2 = z + Math.sin(away) * d;
        const ay2 = this.heightAt(ax2, az2);
        for (const wing of [1, -1]) {
          const bar = new Mesh(new BoxGeometry(2.2, 0.08, 0.4), hazardMat);
          bar.position.set(
            ax2 + Math.cos(away + Math.PI / 2) * wing * 0.75,
            ay2 + 0.25,
            az2 + Math.sin(away + Math.PI / 2) * wing * 0.75,
          );
          bar.rotation.y = -away + wing * 0.55;
          deco(bar, false);
        }
      }
      const bars: [number, number, number, number][] = [
        [-2.6, 0, 1, 5.6], [2.6, 0, 1, 5.6], [0, 0, 4.4, 1],
      ];
      for (const [ox, oz, w, d] of bars) {
        const bar = new Mesh(new BoxGeometry(w, 0.15, d), windowMat);
        bar.position.set(x + ox, y + 1.25, z + oz);
        deco(bar, false);
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const lamp = new Mesh(new BoxGeometry(0.7, 0.35, 0.7), hazardMat);
        lamp.position.set(x + Math.cos(a) * 9.2, y + 1.3, z + Math.sin(a) * 9.2);
        deco(lamp, false);
      }
    };
    const pylons = (r: number): void => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.4;
        const px = bx + Math.cos(a) * r;
        const pz = bz + Math.sin(a) * r;
        const py = this.heightAt(px, pz);
        const post = new Mesh(new BoxGeometry(1.1, 4.2, 1.1), wallMat);
        post.position.set(px, py + 2.1, pz);
        deco(post);
        const tip = new Mesh(new BoxGeometry(0.7, 0.5, 0.7), accentMat);
        tip.position.set(px, py + 4.5, pz);
        deco(tip, false);
      }
    };
    // Low wall segments running pylon-to-pylon, one gap left as the gate.
    const walls = (r: number): void => {
      const n = 8;
      const chord = 2 * r * Math.sin(Math.PI / n) - 1.6;
      for (let i = 0; i < n; i++) {
        if (i === 1) continue; // gate
        const am = ((i + 0.5) / n) * Math.PI * 2 + 0.4;
        const px = bx + Math.cos(am) * r * Math.cos(Math.PI / n);
        const pz = bz + Math.sin(am) * r * Math.cos(Math.PI / n);
        const py = this.heightAt(px, pz);
        const wall = new Mesh(new BoxGeometry(chord, 2.2, 0.5), wallMat);
        wall.position.set(px, py + 1.1, pz);
        wall.rotation.y = -am + Math.PI / 2;
        deco(wall);
        const strip = new Mesh(new BoxGeometry(chord, 0.16, 0.56), hazardMat);
        strip.position.set(px, py + 2.25, pz);
        strip.rotation.y = -am + Math.PI / 2;
        deco(strip, false);
      }
    };
    const rover = (x: number, z: number, ry: number): void => {
      const y = this.heightAt(x, z);
      const g = new Group();
      const body = new Mesh(new BoxGeometry(3.2, 1.0, 1.8), wallMat);
      body.position.y = 1.05;
      g.add(body);
      const cab = new Mesh(new BoxGeometry(1.2, 0.8, 1.6), darkMat);
      cab.position.set(0.9, 1.9, 0);
      g.add(cab);
      const lamp = new Mesh(new BoxGeometry(0.1, 0.25, 1.2), hazardMat);
      lamp.position.set(1.68, 1.15, 0);
      g.add(lamp);
      for (const [wx, wz] of [[1.05, 1.0], [1.05, -1.0], [-1.05, 1.0], [-1.05, -1.0]]) {
        const wheel = new Mesh(new CylinderGeometry(0.48, 0.48, 0.36, 10), darkMat);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wx, 0.48, wz);
        g.add(wheel);
      }
      g.position.set(x, y, z);
      g.rotation.y = ry;
      this.group.add(g);
      this.registerObstacle(g);
    };
    const sign = (x: number, z: number, ry: number): void => {
      const y = this.heightAt(x, z);
      const post = new Mesh(new CylinderGeometry(0.14, 0.2, 4.2, 6), darkMat);
      post.position.set(x, y + 2.1, z);
      deco(post);
      const board = new Mesh(
        new PlaneGeometry(5.4, 2.0),
        new MeshBasicMaterial({ map: warnSignTexture(), transparent: true, side: DoubleSide, toneMapped: false }),
      );
      board.position.set(x, y + 4.6, z);
      board.rotation.y = ry;
      this.group.add(board);
      this.registerObstacle(board, 0.2);
    };

    if (kind === 'compound') {
      // Garrison compound: HQ + tall annex + low barracks, linked by pipes,
      // with a landing pad, cargo yard and rooftop clutter.
      apron(58);
      const layout: [number, number, number, number, number][] = [
        [0, 0, 26, 10, 26],
        [30, 0, 14, 16, 14],
        [-26, 0, 16, 7, 20],
      ];
      for (const [ox, oz, w, h, d] of layout) {
        const gy = this.heightAt(bx + ox, bz + oz);
        const block = new Mesh(new BoxGeometry(w, h, d), wallMat);
        // Axis-aligned so the tight AABB collider matches exactly — rooftop
        // turrets must be hittable, and their bolts must clear the roof.
        block.position.set(bx + ox, gy + h / 2 - 1, bz + oz);
        solid(block, Math.max(w, h, d) * 0.75, { hx: w / 2 + 0.5, hy: h / 2 + 0.5, hz: d / 2 + 0.5 });
        windows(bx + ox, gy - 1, bz + oz, w, h, d);
        this.addTurretPost(bx + ox, gy + h - 1, bz + oz, bx + ox, bz + oz + 200);
      }
      for (let i = 0; i < 4; i++) {
        const vent = new Mesh(
          new BoxGeometry(rng.range(2, 4), rng.range(1, 2.2), rng.range(2, 4)),
          darkMat,
        );
        vent.position.set(bx + rng.range(-9, 9), by + 9.6, bz + rng.range(-9, 9));
        deco(vent);
      }
      pipe(bx + 13, by + 3.2, bz - 2, bx + 23, by + 3.2, bz - 2, 0.55);
      pipe(bx + 13, by + 1.8, bz + 3, bx + 23, by + 1.8, bz + 3, 0.4);
      pipe(bx - 13, by + 2.6, bz, bx - 18.5, by + 2.6, bz, 0.5);
      const mastY = this.heightAt(bx + 33, bz + 4) + 15;
      const antenna = new Mesh(new CylinderGeometry(0.28, 0.42, 9, 6), darkMat);
      antenna.position.set(bx + 33, mastY + 4.5, bz + 4);
      deco(antenna);
      const blinker = new Mesh(new SphereGeometry(0.6, 8, 6), accentMat);
      blinker.position.set(bx + 33, mastY + 9.3, bz + 4);
      deco(blinker, false);
      landingPad(bx - 4, bz + 42);
      for (let i = 0; i < 4; i++) container(bx + 14 + rng.range(-4, 8), bz - 24 + rng.range(-5, 5));
      pole(bx - 22, bz + 18);
      pole(bx + 40, bz + 10);
      pole(bx + 6, bz - 27);
      pylons(52);
      walls(52);
      rover(bx - 32, bz + 24, 0.7);
      sign(bx + 14, bz + 47, -0.5);
      this.addStash(rng, bx + 8, by + 2.5, bz + 10);
    } else if (kind === 'comm') {
      // Comms array: lattice relay mast with cross-arms and a gimballed dish,
      // equipment shed, cable runs — its beacon is visible for miles.
      apron(42);
      const segRadii = [2.4, 1.7, 1.1];
      for (let s = 0; s < 3; s++) {
        const seg = new Mesh(new CylinderGeometry(segRadii[s], segRadii[s] + 0.7, 10, 8), wallMat);
        seg.position.set(bx, by + 5 + s * 10, bz);
        if (s === 0) solid(seg, 4);
        else deco(seg);
        const arm = new Mesh(new BoxGeometry(7 - s * 1.6, 0.4, 0.4), darkMat);
        arm.position.set(bx, by + 10 + s * 10, bz);
        arm.rotation.y = s * 0.7;
        deco(arm);
      }
      const platform = new Mesh(new CylinderGeometry(3.6, 4, 1, 8), darkMat);
      platform.position.set(bx, by + 20.5, bz);
      deco(platform);
      const gimbal = new Mesh(new BoxGeometry(1.4, 1.4, 1.4), darkMat);
      gimbal.position.set(bx + 2.2, by + 24, bz);
      deco(gimbal);
      const dish = new Mesh(new ConeGeometry(4.6, 2.2, 14, 1, true), wallMat);
      dish.position.set(bx + 4.4, by + 25.4, bz);
      dish.rotation.z = 1.05;
      deco(dish);
      const beacon = new Mesh(new SphereGeometry(0.9, 8, 6), accentMat);
      beacon.position.set(bx, by + 31, bz);
      deco(beacon, false);
      const shed = new Mesh(new BoxGeometry(9, 4.5, 7), wallMat);
      shed.position.set(bx + 16, this.heightAt(bx + 16, bz + 8) + 1.6, bz + 8);
      solid(shed, 8, { hx: 5, hy: 2.7, hz: 4 });
      windows(bx + 16, this.heightAt(bx + 16, bz + 8) - 0.6, bz + 8, 9, 4.5, 7);
      pipe(bx + 12, by + 1.4, bz + 6, bx + 2.5, by + 1.4, bz + 1, 0.35);
      this.addTurretPost(bx, by + 21, bz, bx + 200, bz);
      this.addTurretPost(bx + 20, this.heightAt(bx + 20, bz - 14), bz - 14, bx, bz + 200);
      landingPad(bx - 26, bz - 8);
      container(bx + 24, bz + 2);
      container(bx + 22, bz - 4);
      pole(bx - 12, bz + 14);
      pole(bx + 10, bz - 20);
      pylons(38);
      sign(bx - 8, bz - 20, 2.6);
      this.addStash(rng, bx - 10, this.heightAt(bx - 10, bz + 12) + 2.5, bz + 12);
    } else if (kind === 'depot') {
      // Fuel depot: domed silo rank under a shared manifold, pump house,
      // hazard bund walls, cargo yard — light guard, DOUBLE loot.
      apron(54);
      const topY = by + 9;
      for (let i = 0; i < 4; i++) {
        const ox = (i - 1.5) * 12;
        const gy = this.heightAt(bx + ox, bz);
        const silo = new Mesh(new CylinderGeometry(4.4, 4.4, 11, 12), wallMat);
        silo.position.set(bx + ox, gy + 4.5, bz);
        solid(silo, 5.5);
        const cap = new Mesh(new SphereGeometry(4.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), darkMat);
        cap.position.set(bx + ox, gy + 10, bz);
        deco(cap);
        const gauge = new Mesh(new BoxGeometry(0.9, 2.6, 0.15), hazardMat);
        gauge.position.set(bx + ox, gy + 5, bz + 4.5);
        deco(gauge, false);
        pipe(bx + ox, gy + 12.5, bz, bx + ox, topY + 5.4, bz, 0.4);
        if (i === 1) this.addTurretPost(bx + ox, gy + 14.5, bz, bx + ox, bz - 200);
      }
      pipe(bx - 18, topY + 5.4, bz, bx + 18, topY + 5.4, bz, 0.6);
      const pump = new Mesh(new BoxGeometry(8, 5, 6), wallMat);
      pump.position.set(bx + 30, this.heightAt(bx + 30, bz + 4) + 1.8, bz + 4);
      solid(pump, 7, { hx: 4.5, hy: 3, hz: 3.5 });
      windows(bx + 30, this.heightAt(bx + 30, bz + 4) - 0.7, bz + 4, 8, 5, 6);
      pipe(bx + 25.5, by + 2, bz + 3, bx + 19, by + 2, bz + 1, 0.5);
      for (const side of [1, -1]) {
        const bund = new Mesh(new BoxGeometry(54, 1.8, 1.2), darkMat);
        bund.position.set(bx, this.heightAt(bx, bz + side * 10) + 0.9, bz + side * 10);
        deco(bund);
        const stripe = new Mesh(new BoxGeometry(54, 0.3, 1.3), hazardMat);
        stripe.position.set(bx, this.heightAt(bx, bz + side * 10) + 1.85, bz + side * 10);
        deco(stripe, false);
      }
      for (let i = 0; i < 5; i++) container(bx - 28 + rng.range(-6, 6), bz + 20 + rng.range(-5, 5));
      landingPad(bx + 8, bz + 30);
      pole(bx - 24, bz - 12);
      pole(bx + 26, bz - 10);
      pylons(48);
      rover(bx - 30, bz + 6, 1.2);
      sign(bx + 22, bz + 24, 0.5);
      this.addStash(rng, bx - 8, this.heightAt(bx - 8, bz + 14) + 2.5, bz + 14);
      this.addStash(rng, bx + 14, this.heightAt(bx + 14, bz + 12) + 2.5, bz + 12);
    } else {
      // Fortress: buttressed keep with a lit gate and parapets, four capped
      // corner towers, four guns. The hard one.
      apron(48);
      const gy = by;
      const keep = new Mesh(new BoxGeometry(18, 14, 18), wallMat);
      keep.position.set(bx, gy + 6, bz);
      solid(keep, 16, { hx: 9.5, hy: 7.5, hz: 9.5 });
      // Parapet crenellations along the roof edges.
      for (let i = 0; i < 4; i++) {
        for (let j = -1; j <= 1; j++) {
          const cren = new Mesh(new BoxGeometry(2.2, 1.3, 1.1), darkMat);
          const off = j * 6.5;
          if (i === 0) cren.position.set(bx + off, gy + 13.6, bz - 8.6);
          else if (i === 1) cren.position.set(bx + off, gy + 13.6, bz + 8.6);
          else if (i === 2) {
            cren.position.set(bx - 8.6, gy + 13.6, bz + off);
            cren.rotation.y = Math.PI / 2;
          } else {
            cren.position.set(bx + 8.6, gy + 13.6, bz + off);
            cren.rotation.y = Math.PI / 2;
          }
          deco(cren);
        }
      }
      // Sloped corner buttresses.
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        const butt = new Mesh(new BoxGeometry(2.6, 11, 2.6), darkMat);
        butt.position.set(bx + sx * 9.6, gy + 4.2, bz + sz * 9.6);
        butt.rotation.z = sx * 0.12;
        butt.rotation.x = -sz * 0.12;
        deco(butt);
      }
      // Gate: dark inset with a hazard lintel and two red marker lights.
      const gate = new Mesh(new BoxGeometry(5.4, 6.5, 0.7), darkMat);
      gate.position.set(bx, gy + 2.4, bz + 9.1);
      deco(gate);
      const lintel = new Mesh(new BoxGeometry(6.2, 0.5, 0.8), hazardMat);
      lintel.position.set(bx, gy + 6, bz + 9.15);
      deco(lintel);
      windows(bx, gy - 1, bz, 18, 14, 18);
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        const tx = bx + sx * 17;
        const tz = bz + sz * 17;
        const ty = this.heightAt(tx, tz);
        const tower = new Mesh(new CylinderGeometry(2.6, 3.2, 13, 8), wallMat);
        tower.position.set(tx, ty + 5.5, tz);
        solid(tower, 4);
        const cap = new Mesh(new ConeGeometry(3.2, 1.6, 8), darkMat);
        cap.position.set(tx, ty + 12.3, tz);
        deco(cap);
        this.addTurretPost(tx, ty + 12, tz, bx + sx * 300, bz + sz * 300);
      }
      landingPad(bx + 34, bz - 4);
      pole(bx - 26, bz + 8);
      pole(bx + 12, bz + 26);
      pylons(44);
      walls(44);
      sign(bx - 2, bz + 30, 0.15);
      this.addStash(rng, bx, gy + 14.5, bz); // on the keep roof, inside the guns
    }

    landmark.trainingBattery = this.trainingBattery;
    // A low patrol wing circling every installation.
    const patrolRadius = rng.range(140, 200);
    this.patrols.push({
      waypoints: Array.from({ length: 4 }, (_, k) => {
        const a = (k / 4) * Math.PI * 2 + rng.range(0, 1);
        const px = bx + Math.cos(a) * patrolRadius;
        const pz = bz + Math.sin(a) * patrolRadius;
        return new Vector3(px, this.heightAt(px, pz) + 45, pz);
      }),
      size: rng.int(2, 3),
    });
  }
}

let warnTex: CanvasTexture | null = null;

/** Canvas-drawn "restricted zone" signage — cached, fully procedural. */
function warnSignTexture(): CanvasTexture {
  if (warnTex) return warnTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(10, 6, 6, 0.92)';
  g.fillRect(0, 0, 512, 192);
  g.strokeStyle = '#ff3b30';
  g.lineWidth = 6;
  g.strokeRect(8, 8, 496, 176);
  // Hazard-striped top band.
  for (let x = 16; x < 496; x += 40) {
    g.fillStyle = (x / 40) % 2 < 1 ? '#ff3b30' : '#1a0c08';
    g.beginPath();
    g.moveTo(x, 16);
    g.lineTo(Math.min(496, x + 24), 16);
    g.lineTo(Math.min(496, x + 8), 40);
    g.lineTo(Math.max(16, x - 16), 40);
    g.closePath();
    g.fill();
  }
  g.fillStyle = '#ff3b30';
  g.font = '700 44px "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.fillText('VIGIL RESTRICTED ZONE', 256, 96);
  g.fillStyle = 'rgba(255, 179, 71, 0.9)';
  g.font = '600 26px "Segoe UI", sans-serif';
  g.fillText('LETHAL FORCE AUTHORIZED', 256, 150);
  warnTex = new CanvasTexture(c);
  return warnTex;
}
