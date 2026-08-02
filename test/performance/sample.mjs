/** Capture one deterministic world/display renderer sample. */
export async function sampleWorld(browser, port, profile, world) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.deviceScaleFactor,
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://localhost:${port}/?seed=99&headless=1`, {
      waitUntil: 'commit',
    });
    await page.waitForFunction(() => Boolean(window.game), undefined, { timeout: 120_000 });
    const sample = await page.evaluate(({ name, width, height, world }) => {
      const game = window.game;
      const gl = game.renderer.getContext();
      game.loop.stop();
      game.showHangar();
      game.startMission();
      if (world === 'planet') {
        game.enterPlanet(0);
        const base = game.surface.baseLandmarks[0];
        game.player.object.position.set(
          base.center.x + 110,
          base.center.y + 26,
          base.center.z + 95,
        );
        game.player.faceToward(base.center);
        game.chaseCam.snapTo(game.player.object);
      } else {
        game.inventory.add('flux', 2);
        game.startJump(true);
        game.jumpSpool = 0.0001;
        game.loop.stepManual(1 / 60);
        game.loop.stepManual(1 / 60);
        game.settleWarpFx();
      }
      for (let frame = 0; frame < 3; frame++) game.loop.stepManual(1 / 60);
      gl.finish();
      game.renderer.info.autoReset = false;
      game.renderer.info.reset();
      game.loop.stepManual(1 / 60);
      gl.finish();
      const calls = game.renderer.info.render.calls;
      const triangles = game.renderer.info.render.triangles;
      game.renderer.info.autoReset = true;
      const frames = 8;
      const frameStart = performance.now();
      for (let frame = 0; frame < frames; frame++) game.loop.stepManual(1 / 60);
      gl.finish();
      const frameMs = (performance.now() - frameStart) / frames;
      const renderFrame = game.postFx.render.bind(game.postFx);
      game.postFx.render = () => {};
      const simulationFrames = 24;
      const simulationStart = performance.now();
      for (let frame = 0; frame < simulationFrames; frame++) game.loop.stepManual(1 / 60);
      const simulationMs = (performance.now() - simulationStart) / simulationFrames;
      game.postFx.render = renderFrame;
      const renderStart = performance.now();
      for (let frame = 0; frame < frames; frame++) game.postFx.render(1 / 60);
      gl.finish();
      const renderMs = (performance.now() - renderStart) / frames;
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      let meshes = 0;
      let lights = 0;
      let surfaceMeshes = 0;
      let surfaceLights = 0;
      game.scene.traverse((object) => {
        if (object.isMesh || object.isPoints || object.isLine) meshes++;
        if (object.isLight) lights++;
      });
      game.surface?.group.traverse((object) => {
        if (object.isMesh || object.isPoints || object.isLine) surfaceMeshes++;
        if (object.isLight) surfaceLights++;
      });
      return {
        name: `${world} ${name}`,
        world,
        css: `${width}x${height}`,
        buffer: `${game.renderer.domElement.width}x${game.renderer.domElement.height}`,
        pixelRatio: game.renderer.getPixelRatio(),
        megapixels: Number((game.renderer.domElement.width *
          game.renderer.domElement.height / 1e6).toFixed(2)),
        frameMs: Number(frameMs.toFixed(2)),
        measuredFps: Number((1000 / frameMs).toFixed(1)),
        simulationMs: Number(simulationMs.toFixed(2)),
        renderMs: Number(renderMs.toFixed(2)),
        calls,
        triangles,
        meshes,
        lights,
        surfaceMeshes,
        surfaceLights,
        bodies: game.world.bodies.length,
        caveBodies: game.surface?.bodies.filter((body) => body.caveShell).length ?? 0,
        batchedMeshes: game.surface?.staticBatchStats.sourceMeshes ?? 0,
        surfaceBatches: game.surface?.staticBatchStats.batches ?? 0,
        collisionCells: game.surface?.collisionCellCount ?? 0,
        gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'masked',
      };
    }, { ...profile, world });
    return { ...sample, errors };
  } finally {
    await context.close();
  }
}
