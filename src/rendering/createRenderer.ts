import { WebGLRenderer } from 'three';
import { initialRenderPixelRatio } from './AdaptiveResolution';

/**
 * WebGL renderer tuned for the postprocessing pipeline: MSAA off (SMAA runs
 * as a post pass), stencil off, high-performance GPU hint. The initial pixel
 * budget is resolution-aware; runtime sampling can then trade detail for FPS.
 */
export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  const renderer = new WebGLRenderer({
    canvas,
    antialias: false,
    stencil: false,
    depth: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(initialRenderPixelRatio(
    window.innerWidth,
    window.innerHeight,
    window.devicePixelRatio,
  ));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  return renderer;
}
