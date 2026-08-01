export async function runPerformanceSmoke(page) {
  const result = await page.evaluate(() => {
    const policy = window.game.renderResolution;
    return {
      actual: policy.diagnostics(),
      shipBatch: window.game.player.exterior.userData.renderBatchStats,
      hd: policy.probe(1920, 1080, 1),
      fourK: policy.probe(3840, 2160, 1),
      retinaFourK: policy.probe(1920, 1080, 2),
    };
  });
  console.log('adaptive resolution:', JSON.stringify(result));
  return result;
}

export function collectPerformanceFailures(result) {
  const probes = [result.hd, result.fourK, result.retinaFourK];
  const initialBudgets = probes.every((probe) => probe.initial.bufferPixels <= 1920 * 1080 * 1.01);
  const floors = probes.every((probe) => probe.overloaded.bufferPixels >= 1280 * 720 * 0.99);
  const adapts = probes.every((probe) => (
    probe.overloaded.pixelRatio < probe.initial.pixelRatio &&
    probe.recovered.pixelRatio > probe.overloaded.pixelRatio &&
    probe.recovered.pixelRatio <= probe.initial.maxPixelRatio
  ));
  const fourKStartsAtHd = Math.abs(result.fourK.initial.bufferPixels - 1920 * 1080) < 10_000;
  const retinaStartsAtHd = Math.abs(result.retinaFourK.initial.bufferPixels - 1920 * 1080) < 10_000;
  const resizePreservesPixels = [result.fourK, result.retinaFourK].every((probe) => (
    Math.abs(probe.resized.bufferPixels - probe.initial.bufferPixels) < 10_000
  ));
  const shipIsBatched = result.shipBatch?.sourceMeshes > result.shipBatch?.renderMeshes * 2;
  if (
    !initialBudgets || !floors || !adapts || !fourKStartsAtHd ||
    !retinaStartsAtHd || !resizePreservesPixels || !shipIsBatched
  ) {
    return ['adaptive render resolution / static batching'];
  }
  return [];
}
