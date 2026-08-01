export async function runDebrisSmoke(page) {
  const result = await page.evaluate(() => {
    const game = window.game;
    game.shipDebris.update(30, null);

    const bodies = game.sector.asteroids.bodies;
    const parent = bodies.find((body) => (
      !body.destroyed && !body.hero && !body.stash && !body.solo && !body.box &&
      !body.ore && body.mesh && body.radius >= 12
    ));
    const beforeBodies = bodies.length;
    if (parent) {
      parent.hp = 1;
      game.combat.resolveHit({
        ship: null,
        asteroid: parent,
        point: parent.position.clone().add({ x: parent.radius, y: 0, z: 0 }),
        damage: 2,
        faction: 'player',
        wasMissile: false,
      });
    }
    const children = bodies.slice(beforeBodies).filter((body) => !body.destroyed);
    const destructibleChildren = children.length >= 2 && children.every((body) => (
      body.mesh && Number.isFinite(body.hp) && body.hp > 0 && body.radius < parent.radius
    ));
    const childStarts = children.map((body) => {
      const matrix = game.player.object.matrix.clone();
      body.mesh.getMatrixAt(body.index, matrix);
      return { position: body.position.clone(), matrix: matrix.toArray() };
    });
    game.sector.asteroids.update(0.5);
    const movingAndSpinning = children.length >= 2 && children.every((body, index) => {
      const matrix = game.player.object.matrix.clone();
      body.mesh.getMatrixAt(body.index, matrix);
      const current = matrix.toArray();
      const displacement = body.position.clone().sub(childStarts[index].position);
      const outward = childStarts[index].position.clone().sub(parent.position);
      const rotated = [0, 1, 2, 4, 5, 6, 8, 9, 10]
        .some((entry) => Math.abs(current[entry] - childStarts[index].matrix[entry]) > 1e-4);
      return displacement.length() > 1 && displacement.dot(outward) > 0 && rotated;
    });
    if (children[0]) {
      children[0].hp = 1;
      game.combat.resolveHit({
        ship: null,
        asteroid: children[0],
        point: children[0].position.clone().add({ x: children[0].radius, y: 0, z: 0 }),
        damage: 2,
        faction: 'player',
        wasMissile: false,
      });
    }
    const childDestroyed = children[0]?.destroyed === true;
    const noFakeRockDebris = game.shipDebris.diagnostics().activeFragments === 0;

    const sourcePool = [
      game.player,
      game.capital,
      ...game.enemies,
      ...game.turrets,
      ...game.neutrals,
    ].filter((ship) => ship?.alive);
    const sources = sourcePool.filter((ship, index) => (
      sourcePool.findIndex((candidate) => candidate.kind === ship.kind) === index
    ));
    const sourceProfiles = sources.map((ship) => {
      game.shipDebris.update(30, null);
      ship.object.updateWorldMatrix(true, true);
      const forcedVisibility = [];
      ship.object.traverse((node) => {
        if (node.userData.excludeFromDebris !== true) return;
        node.traverse((excluded) => {
          forcedVisibility.push([excluded, excluded.visible]);
          excluded.visible = true;
        });
      });
      game.shipDebris.spawn(ship.object, ship.velocity, ship.radius, game.rng);
      for (const [node, visible] of forcedVisibility) node.visible = visible;
      const audit = game.shipDebris.diagnostics();
      return { kind: ship.kind, fragments: audit.activeFragments,
        elongation: audit.maxElongation, extent: audit.maxExtent,
        extentLimit: Math.max(4, ship.radius * 2.2) };
    });
    const boundedSourceParts = sourceProfiles.length >= 2 && sourceProfiles.every((profile) => (
      profile.fragments >= 3 && profile.elongation <= 6.001 && profile.extent <= profile.extentLimit
    ));
    game.shipDebris.update(30, null);

    const source = game.player.object;
    const sourcePosition = source.position.clone();
    source.position.set(0, 30, 0);
    source.updateWorldMatrix(true, true);
    game.player.velocity.set(0, 0, 0);
    game.shipDebris.spawn(source, game.player.velocity, game.player.radius, game.rng);
    source.position.copy(sourcePosition);
    source.updateWorldMatrix(true, true);

    const startParts = game.shipDebris.group.children;
    const startY = Math.min(...startParts.map((part) => part.position.y));
    for (let frame = 0; frame < 240; frame++) game.shipDebris.update(1 / 60, { heightAt: () => 0 });
    const endParts = game.shipDebris.group.children;
    const endY = Math.min(...endParts.map((part) => part.position.y));
    const diagnostics = game.shipDebris.diagnostics();
    const actualSourceParts = diagnostics.activeFragments > 0 &&
      diagnostics.exactSourceParts === diagnostics.activeFragments &&
      endParts.every((part) => typeof part.userData.sourcePartUuid === 'string');
    game.shipDebris.update(30, null);

    return {
      parentFound: Boolean(parent),
      childCount: children.length,
      destructibleChildren,
      childDestroyed,
      movingAndSpinning,
      noFakeRockDebris,
      boundedSourceParts,
      sourceProfiles,
      actualSourceParts,
      fragmentCount: diagnostics.activeFragments,
      fell: endY < startY - 5,
      stayedAboveTerrain: endY >= 0,
    };
  });
  console.log('physical breakup debris:', JSON.stringify(result));
  return result;
}

export function collectDebrisFailures(result) {
  if (
    !result.parentFound ||
    result.childCount < 2 ||
    !result.destructibleChildren ||
    !result.childDestroyed ||
    !result.movingAndSpinning ||
    !result.noFakeRockDebris ||
    !result.boundedSourceParts ||
    !result.actualSourceParts ||
    result.fragmentCount < 3 ||
    !result.fell ||
    !result.stayedAboveTerrain
  ) return ['physical ship and asteroid breakup'];
  return [];
}
