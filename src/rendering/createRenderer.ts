import { WebGLRenderer } from 'three';

/**
 * WebGL renderer tuned for the postprocessing pipeline: MSAA off (SMAA runs
 * as a post pass), stencil off, high-performance GPU hint. Pixel ratio is
 * capped at 2 so 4K displays don't tank frame rate.
 */
export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  return renderer;
}
