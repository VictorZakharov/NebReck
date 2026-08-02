import { advanceGameTime, advanceProjectileTime } from './helpers.mjs';

export async function runWorldSmoke(page) {
  const peace = await page.evaluate(() => {
    const game = window.game;
    return {
      sector: game.sectorIndex,
      enemies: game.enemies.length,
      turrets: game.turrets.length,
      capital: !!game.capital,
      neutrals: game.neutrals.length,
      flux: game.inventory.counts.flux,
      planetsClear: (() => {
        const planets = game.sector.planets;
        for (let first = 0; first < planets.length; first++) {
          for (let second = first + 1; second < planets.length; second++) {
            const firstClearance = planets[first].ring
              ? planets[first].radius * 2.2
              : planets[first].radius;
            const secondClearance = planets[second].ring
              ? planets[second].radius * 2.2
              : planets[second].radius;
            if (
              planets[first].position.distanceTo(planets[second].position) <=
              (firstClearance + secondClearance) * 1.25 + 400
            ) return false;
          }
        }
        return true;
      })(),
    };
  });
  console.log('sector 1 (must be peaceful):', JSON.stringify(peace));

  const quest = await page.evaluate(() => {
    const game = window.game;
    const neutral = game.neutrals[0];
    game.player.position.copy(neutral.position);
    game.player.position.x += 30;
    const hailed = game.hailNearestNeutral();
    const offered = !!game.pendingOffer;
    const offerTitle = game.pendingOffer?.title ?? null;
    const accepted = game.acceptOffer();
    return { hailed, offered, offerTitle, accepted, active: game.quests.active.length };
  });
  console.log('contract:', JSON.stringify(quest));

  const trade = await page.evaluate(() => {
    const game = window.game;
    game.declineOffer();
    const merchant = game.neutrals.find((neutral) => neutral.isMerchant);
    if (!merchant) return { merchant: false };
    let engineSilenced = 0;
    const originalSilence = game.audio.silenceEngine;
    game.audio.silenceEngine = function () {
      engineSilenced++;
      return originalSilence.call(this);
    };
    game.player.position.copy(merchant.position);
    game.player.position.x += 25;
    game.lootAimed = null;
    game.lootAimPoint = null;
    game.lootAimBody = null;
    game.player.faceToward(merchant.position);
    game.chaseCam.snapTo(game.player.object);
    game.chaseCam.camera.updateMatrixWorld(true);
    game.renderHudOnce();
    const merchantPrompt = document.querySelector('.interact-prompt');
    const promptAnchored = merchantPrompt?.classList.contains('world-anchored') ?? false;
    const promptText = merchantPrompt?.textContent ?? '';
    game.hailNearestNeutral();
    const docked = game.state === 'trade';
    game.inventory.add('scrap', 8);
    const fluxBefore = game.inventory.counts.flux;
    const traded = game.executeTrade('buy-flux');
    const holdRows = [...document.querySelectorAll('.loadout-left .res-line')];
    const spread = (values) => Math.max(...values) - Math.min(...values);
    const labelSpread = spread(holdRows.map((entry) =>
      entry.querySelector('.res-label').getBoundingClientRect().left
    ));
    const countSpread = spread(holdRows.map((entry) =>
      entry.querySelector('.res-count').getBoundingClientRect().right
    ));
    const rightInset = Math.min(...holdRows.map((entry) => {
      const rowRect = entry.getBoundingClientRect();
      const countRect = entry.querySelector('.res-count').getBoundingClientRect();
      return rowRect.right - countRect.right;
    }));
    const title = document.querySelector('.loadout-left h2').getBoundingClientRect();
    const subtitle = document.querySelector('.loadout-ship').getBoundingClientRect();
    const iconLayout = {
      holdSvgs: document.querySelectorAll('.loadout-left .holding-icon').length,
      offerSvgs: document.querySelectorAll('.recipe-cost .holding-icon').length,
      fluxOrbits: document.querySelectorAll('.holding-flux ellipse').length,
      labelSpread,
      countSpread,
      rightInset,
      headerDelta: Math.abs(title.left - subtitle.left),
    };
    game.audio.silenceEngine = originalSilence;
    game.closeTrade();
    return {
      merchant: true,
      docked,
      traded,
      fluxGained: game.inventory.counts.flux - fluxBefore,
      engineSilenced,
      promptAnchored,
      promptText,
      iconLayout,
    };
  });
  console.log('merchant:', JSON.stringify(trade));

  // Land, verify surface generation, caves, collision and garrison reachability.
  const planet = await page.evaluate(() => {
    const game = window.game;
    window.__smoke = {
      bodiesBefore: game.sector.asteroids.bodies.length,
      neutralsBefore: game.neutrals.length,
      marker: game.sector.asteroids.bodies.find((body) => !body.hero && !body.solo),
    };
    game.sector.asteroids.destroyRock(window.__smoke.marker);

    const planetTarget = game.sector.planets[0];
    game.lootAimed = null;
    game.lootAimPoint = null;
    game.lootAimBody = null;
    game.player.position
      .copy(planetTarget.position)
      .add({ x: 0, y: 0, z: planetTarget.radius + 500 });
    game.player.faceToward(planetTarget.position);
    game.chaseCam.snapTo(game.player.object);
    game.chaseCam.camera.updateMatrixWorld(true);
    game.renderHudOnce();
    const planetPromptElement = document.querySelector('.interact-prompt');
    const planetPrompt = {
      anchored: planetPromptElement?.classList.contains('world-anchored') ?? false,
      text: planetPromptElement?.textContent ?? '',
    };

    game.enterPlanet(0);
    const onPlanet = !!game.surface;
    game.renderHudOnce();
    const jumpTitle = document.querySelector('.hud-drive .bar-label span:first-child');
    const jumpState = document.querySelector('[data-el="jumpText"]');
    if (jumpState) jumpState.textContent = 'J · Lift off';
    const jumpLayout = {
      text: jumpState?.textContent ?? '',
      singleLine:
        !!jumpTitle &&
        !!jumpState &&
        jumpState.getBoundingClientRect().height <=
          jumpTitle.getBoundingClientRect().height + 1,
    };
    game.renderHudOnce();
    const garrison = game.enemies.length + game.turrets.length;
    const stashes = game.surface
      ? game.surface.bodies.filter((body) => body.stash).length
      : 0;
    let caveTunnels = 0;
    let surfaceLights = 0;
    game.surface?.group.traverse((object) => {
      if (object.name === 'cave-tunnel') caveTunnels++;
      if (object.isLight) surfaceLights++;
    });
    const surfaceOptimization = {
      sourceMeshes: game.surface?.staticBatchStats.sourceMeshes ?? 0,
      batches: game.surface?.staticBatchStats.batches ?? 0,
      lights: surfaceLights,
      collisionCells: game.surface?.collisionCellCount ?? 0,
      interactionBodies: game.surface?.interactionBodies.length ?? 0,
      bodies: game.surface?.bodies.length ?? 0,
    };
    const caveCentersClear = game.surface?.caveLandmarks.every((landmark) =>
      !game.surface.bodies.some((body) =>
        body.hero &&
        !body.box &&
        !body.solo &&
        body.radius > 15 &&
        body.position.distanceToSquared(landmark.center) < (body.radius + 3) ** 2
      )
    ) ?? false;
    const cavePassagesClear = game.surface?.caveLandmarks.every((landmark) => {
      for (let segment = 0; segment < landmark.route.length - 1; segment++) {
        for (let step = 0; step <= 5; step++) {
          const point = landmark.route[segment]
            .clone()
            .lerp(landmark.route[segment + 1], step / 5);
          if (point.y < game.surface.heightAt(point.x, point.z) + game.player.radius + 0.5) {
            return false;
          }
          if (game.surface.bodies.some((body) =>
            body.caveShell &&
            body.position.distanceToSquared(point) <
              (body.radius + game.player.radius + 0.15) ** 2
          )) {
            return false;
          }
        }
      }
      return true;
    }) ?? false;
    const pointBlocked = (point) => game.surface.bodies.some((body) => {
      if (body.destroyed || body.stash) return false;
      if (body.box) {
        return (
          Math.abs(point.x - body.position.x) < body.box.hx + 1.2 &&
          Math.abs(point.y - body.position.y) < body.box.hy + 1.2 &&
          Math.abs(point.z - body.position.z) < body.box.hz + 1.2
        );
      }
      return body.position.distanceToSquared(point) < (body.radius + 1.2) ** 2;
    });
    const caveGuardsClear = game.surface?.caveLandmarks.every((landmark) =>
      !pointBlocked(landmark.interiorGuard) && !pointBlocked(landmark.exteriorGuard)
    ) ?? false;
    const caveShellCount =
      game.surface?.bodies.filter((body) => body.caveShell).length ?? 0;
    const caveWallsClosed = game.surface?.caveLandmarks.every((landmark) => {
      const route = landmark.route;
      const center = route[route.length - 1];
      const previous = route[route.length - 2];
      const tangent = center.clone().sub(previous);
      tangent.y = 0;
      tangent.normalize();
      const side = tangent.clone().set(-tangent.z, 0, tangent.x);
      return [-1, 1].every((sign) => {
        for (let distance = 4; distance <= 55; distance += 1.5) {
          const probe = center.clone().addScaledVector(side, distance * sign);
          if (game.surface.bodies.some((body) =>
            body.caveShell &&
            body.position.distanceToSquared(probe) <
              (body.radius + game.player.radius) ** 2
          )) return true;
        }
        return false;
      });
    }) ?? false;
    const terrain = game.surface?.group.getObjectByName('surface-terrain');
    let terrainSurfaceError = Infinity;
    if (terrain?.geometry?.index) {
      const positions = terrain.geometry.attributes.position;
      const indices = terrain.geometry.index;
      terrainSurfaceError = 0;
      const stride = Math.max(3, Math.floor(indices.count / 60 / 3) * 3);
      for (let offset = 0; offset < indices.count; offset += stride) {
        const first = indices.getX(offset);
        const second = indices.getX(Math.min(offset + 1, indices.count - 1));
        const third = indices.getX(Math.min(offset + 2, indices.count - 1));
        const x =
          (positions.getX(first) + positions.getX(second) + positions.getX(third)) / 3;
        const y =
          (positions.getY(first) + positions.getY(second) + positions.getY(third)) / 3;
        const z =
          (positions.getZ(first) + positions.getZ(second) + positions.getZ(third)) / 3;
        terrainSurfaceError = Math.max(
          terrainSurfaceError,
          Math.abs(game.surface.heightAt(x, z) - y),
        );
      }
    }
    let malformedRockLobes = 0;
    let rockLobes = 0;
    game.surface?.group.traverse((object) => {
      if (object.name !== 'surface-rock-lobe' && object.name !== 'cave-rock-lobe') return;
      rockLobes++;
      const scales = [object.scale.x, object.scale.y, object.scale.z];
      if (Math.max(...scales) / Math.max(0.001, Math.min(...scales)) > 2.1) {
        malformedRockLobes++;
      }
    });

    const collisionProbe = { idleDamage: Infinity, impactDamage: 0 };
    const firstCave = game.surface?.caveLandmarks[0];
    const shell = firstCave && game.surface.bodies
      .filter((body) => body.caveShell && body.radius < 10)
      .sort(
        (first, second) =>
          first.position.distanceToSquared(firstCave.entry) -
          second.position.distanceToSquared(firstCave.entry),
      )[0];
    if (firstCave && shell) {
      const savedPosition = game.player.position.clone();
      const savedVelocity = game.player.velocity.clone();
      const savedHull = game.player.hull;
      const savedShield = game.player.shield;
      const inward = firstCave.entry.clone().sub(shell.position).normalize();
      const overlapDistance = shell.radius + game.player.radius - 0.2;
      const protection = () => game.player.hull + game.player.shield;

      game.player.position.copy(shell.position).addScaledVector(inward, overlapDistance);
      game.player.velocity.set(0, 0, 0);
      const idleBefore = protection();
      game.resolveShipCollisions(1 / 60);
      collisionProbe.idleDamage = idleBefore - protection();

      game.player.position.copy(shell.position).addScaledVector(inward, overlapDistance);
      game.player.velocity.copy(inward).multiplyScalar(-55);
      const impactBefore = protection();
      game.resolveShipCollisions(1 / 60);
      collisionProbe.impactDamage = impactBefore - protection();

      game.player.position.copy(savedPosition);
      game.player.velocity.copy(savedVelocity);
      game.player.hull = savedHull;
      game.player.shield = savedShield;
    }
    let minHostile = Infinity;
    for (const hostile of [...game.enemies, ...game.turrets]) {
      minHostile = Math.min(minHostile, hostile.position.distanceTo(game.player.position));
    }
    const ground = game.surface
      ? game.surface.heightAt(game.player.position.x, game.player.position.z)
      : 0;
    const onSurface =
      game.player.position.y > ground && game.player.position.y < ground + 40;
    const level =
      Math.abs(game.player.object.rotation.x) < 0.01 &&
      Math.abs(game.player.object.rotation.z) < 0.01;

    const surfaceTurretsClear = game.turrets.every((turret) =>
      game.surface.isTurretSpawnClear(turret.position)
    );
    window.__smoke.surfaceTurretHulls = game.turrets.map((turret) => turret.hull);
    game.turrets.forEach((turret, index) => {
      const spawn = game.surface.turretSpawns[index];
      const outward = spawn.lookAt.clone().sub(turret.position);
      outward.y = 0;
      if (outward.lengthSq() < 0.001) outward.set(0, 0, 1);
      outward.normalize();
      for (const lift of [7, 18]) {
        const from = turret.position.clone().addScaledVector(outward, 26);
        from.y += lift;
        game.projectiles.spawnBolt({
          position: from,
          direction: turret.position.clone().sub(from).normalize(),
          speed: 220,
          damage: 2,
          faction: 'player',
          color: game.surface.fog.color,
          boltLength: 3,
          boltWidth: 0.2,
          life: 3,
        });
      }
    });

    const firstTurret = game.turrets[0];
    window.__smoke.turretHullBefore = firstTurret.hull;
    const color = game.surface.fog.color.clone();
    for (let index = 0; index < 4; index++) {
      const from = firstTurret.position.clone();
      from.x += 28 + index;
      from.y += 26;
      from.z += 28 - index;
      game.projectiles.spawnBolt({
        position: from,
        direction: firstTurret.position.clone().sub(from).normalize(),
        speed: 220,
        damage: 8,
        faction: 'player',
        color,
        boltLength: 3,
        boltWidth: 0.2,
        life: 3,
      });
    }

    return {
      onPlanet,
      garrison,
      stashes,
      caveTunnels,
      caveCentersClear,
      cavePassagesClear,
      caveGuardsClear,
      caveShellCount,
      caveWallsClosed,
      terrainSurfaceError,
      rockLobes,
      malformedRockLobes,
      collisionProbe,
      minHostile: Math.round(minHostile),
      onSurface,
      level,
      surfaceTurretsClear,
      planetPrompt,
      jumpLayout,
      surfaceOptimization,
    };
  });
  console.log('planetfall:', JSON.stringify(planet));

  await advanceProjectileTime(page, 1);

  await page.evaluate(() => {
    const game = window.game;
    const firstTurret = game.turrets[0];
    window.__smoke.turretDamaged =
      !firstTurret.alive || firstTurret.hull < window.__smoke.turretHullBefore;
    window.__smoke.allSurfaceTurretsDamageable = game.turrets.every(
      (turret, index) =>
        !turret.alive || turret.hull < window.__smoke.surfaceTurretHulls[index],
    );
    let target = game.turrets.find((turret) => turret.alive) ?? firstTurret;
    let viewpoint = target.position.clone().add({ x: 0, y: 80, z: 0 });
    for (let index = 0; index < game.turrets.length; index++) {
      const candidate = game.turrets[index];
      if (!candidate.alive) continue;
      const spawn = game.surface.turretSpawns[index];
      const outward = spawn.lookAt.clone().sub(candidate.position);
      outward.y = 0;
      if (outward.lengthSq() < 0.001) outward.set(0, 0, 1);
      outward.normalize();
      const candidateView = candidate.position.clone().addScaledVector(outward, 120);
      candidateView.y = Math.max(
        candidate.position.y + 18,
        game.surface.heightAt(candidateView.x, candidateView.z) + game.player.radius + 6,
      );
      if (!game.combat.hasLineOfSight(candidateView, candidate.position)) continue;
      target = candidate;
      viewpoint = candidateView;
      break;
    }
    game.player.hull = game.player.hullMax;
    game.player.position.copy(viewpoint);
    game.player.velocity.set(0, 0, 0);
    game.player.faceToward(target.position);
    game.chaseCam.snapTo(game.player.object);
    game.chaseCam.camera.updateMatrixWorld(true);
  });
  await advanceGameTime(page, 1 / 60);
  const planetB = await page.evaluate(() => {
    const game = window.game;
    const lock = game.targeting.current;
    const lockDist = lock ? Math.round(lock.distance) : -1;
    const lockedNear = lock !== null && lock.distance < 250;
    const surfaceIdentity = game.surface;
    const harvested = game.surface.bodies.find(
      (body) => !body.destroyed && (body.stash || body.ore),
    );
    if (harvested) game.surface.destroyRock(harvested);
    for (const enemy of game.enemies) game.scene.remove(enemy.object);
    for (const turret of game.turrets) game.scene.remove(turret.object);
    game.enemies = [];
    game.turrets = [];
    game.exitPlanet();
    const arrivalContacts = [...game.enemies, ...game.turrets.filter(
      (turret) => !game.capitalTurrets.includes(turret),
    ), ...game.neutrals, ...(game.capital ? [game.capital] : [])];
    const arrivalMean = game.player.position.clone().set(0, 0, 0);
    for (const contact of arrivalContacts) {
      arrivalMean.add(contact.position.clone().sub(game.player.position).normalize());
    }
    const arrivalForward = arrivalMean.clone();
    game.player.forward(arrivalForward);
    const orbitFacesMajority = arrivalMean.lengthSq() < 1e-4 ||
      arrivalForward.dot(arrivalMean.normalize()) > 0.999;
    game.player.hull = game.player.hullMax;
    const persisted =
      game.sector.asteroids.bodies.length === window.__smoke.bodiesBefore &&
      window.__smoke.marker.destroyed === true &&
      game.neutrals.length === window.__smoke.neutralsBefore;
    game.enterPlanet(0);
    const revisit = {
      sameSurface: game.surface === surfaceIdentity,
      harvested: !!harvested?.destroyed,
      garrison: game.enemies.length + game.turrets.length,
    };
    game.exitPlanet();
    return {
      turretDamaged: window.__smoke.turretDamaged,
      allSurfaceTurretsDamageable: window.__smoke.allSurfaceTurretsDamageable,
      lockDist,
      lockedNear,
      backInSpace: !game.surface && game.sectorIndex === 1,
      orbitFacesMajority,
      persisted,
      revisit,
    };
  });
  console.log('planet combat:', JSON.stringify(planetB));

  const jumpStart = await page.evaluate(() => {
    const game = window.game;
    game.player.object.position.set(0, 900, 0);
    game.player.object.rotation.set(-Math.PI / 2, 0, 0);
    game.player.velocity.set(0, 0, 0);
    game.inventory.add('flux', 2);
    game.renderHudOnce();
    const heldBeforeJump = game.inventory.counts.flux;
    const jumpLabel = document.querySelector('[data-el="jumpText"]')?.textContent ?? '';
    const started = game.startJump(true);
    if (started) game.jumpSpool = 0.01;
    return {
      started,
      state: game.state,
      alive: game.player.alive,
      flux: game.inventory.counts.flux,
      fluxHud: jumpLabel.includes(`Flux 2/${heldBeforeJump}`),
      jumpLabel,
      spool: game.jumpSpool,
    };
  });
  console.log('jump start:', JSON.stringify(jumpStart));
  await advanceGameTime(page, 2 / 60);
  const postJump = await page.evaluate(() => ({
    sector: window.game.sectorIndex,
    enemies: window.game.enemies.length,
    turrets: window.game.turrets.length,
    capital: !!window.game.capital,
    ...(() => {
      const game = window.game;
      let min = Infinity;
      const hostiles = [...game.enemies, ...game.turrets];
      if (game.capital) hostiles.push(game.capital);
      for (const hostile of hostiles) {
        min = Math.min(min, hostile.position.distanceTo(game.player.position));
      }
      const incoming = game.projectiles.incomingThreat(game.player);
      const contacts = [...game.enemies, ...game.turrets.filter(
        (turret) => !game.capitalTurrets.includes(turret),
      ), ...game.neutrals, ...(game.capital ? [game.capital] : [])];
      const mean = game.player.position.clone().set(0, 0, 0);
      for (const contact of contacts) {
        mean.add(contact.position.clone().sub(game.player.position).normalize());
      }
      const facing = mean.clone();
      game.player.forward(facing);
      const caveTurretCount = game.sector.turretSpawns.length;
      const spaceTurretsClear = game.sector.turretSpawns.every((spawn, index) => {
        const turret = game.turrets[index];
        if (!turret || turret.position.distanceToSquared(spawn.position) > 0.001) return false;
        return game.sector.asteroids.bodies.every((body) =>
          body.destroyed ||
          turret.position.distanceTo(body.position) >= body.radius + turret.radius + 0.12
        );
      });
      return {
        safeDist: Math.round(min),
        entrySafe: min >= 700,
        pursuers: game.enemies.filter((enemy) => enemy.pursuingPlayer).length,
        missileWarning: incoming.locked || incoming.imminent,
        facesMajority: mean.lengthSq() < 1e-4 || facing.dot(mean.normalize()) > 0.999,
        caveTurretCount,
        spaceTurretsClear,
      };
    })(),
  }));
  console.log('sector 2 (must be hostile):', JSON.stringify(postJump));

  return { peace, quest, trade, planet, planetB, jumpStart, postJump };
}
