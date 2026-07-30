import {
  BlendFunction,
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { HalfFloatType, PerspectiveCamera, Scene, Vector2, WebGLRenderer } from 'three';
import { CONFIG } from '../game/Config';

/**
 * Cinematic post stack: fragment-correct solar corona, HDR bloom, subtle
 * chromatic aberration, vignette, ACES filmic tone mapping, then SMAA + grain.
 * Rendering uses half-float buffers so bloom picks up genuine HDR highlights.
 */
export class PostFx {
  readonly composer: EffectComposer;
  private readonly chromaticAberration: ChromaticAberrationEffect;
  private readonly baseAberration = new Vector2(0.0006, 0.0006);
  private aberrationBoost = 0;

  constructor(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: PerspectiveCamera,
  ) {
    this.composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
    this.composer.addPass(new RenderPass(scene, camera));

    const bloom = new BloomEffect({
      intensity: CONFIG.bloom.intensity,
      luminanceThreshold: CONFIG.bloom.luminanceThreshold,
      luminanceSmoothing: CONFIG.bloom.luminanceSmoothing,
      mipmapBlur: true,
    });

    // The star owns an additive, depth-tested extended halo. Bloom therefore
    // responds to every visible solar fragment instead of a GodRaysEffect
    // switching around one projected centre point when the disc is clipped or
    // occluded. It also removes a full-resolution framebuffer from this hot
    // path, which makes fullscreen target reallocations substantially safer.
    this.composer.addPass(new EffectPass(camera, bloom));

    this.chromaticAberration = new ChromaticAberrationEffect({
      offset: this.baseAberration.clone(),
      radialModulation: true,
      modulationOffset: 0.28,
    });
    const vignette = new VignetteEffect({ darkness: 0.52, offset: 0.28 });
    const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    this.composer.addPass(new EffectPass(camera, this.chromaticAberration, vignette, toneMapping));
    // Subtle animated film grain kills the "too clean" digital look.
    const grain = new NoiseEffect({ blendFunction: BlendFunction.COLOR_DODGE, premultiply: true });
    grain.blendMode.opacity.value = 0.055;
    this.composer.addPass(new EffectPass(camera, new SMAAEffect(), grain));

    // postprocessing 6.39.x + three r170: the composer's per-frame
    // blitDepthBuffer ends up blitting a depth texture ONTO ITSELF (GL-level
    // attachment aliasing via stale renderer internals) — GL_INVALID_OPERATION
    // console spam on every frame, and the blit never contributes anything.
    // Skipping it entirely is pixel-identical (verified by the 0.000%%
    // baseline suite, solar bloom included).
    (this.composer as unknown as { blitDepthBuffer(rt: unknown): void }).blitDepthBuffer = () => {};
  }

  /** Extra aberration during boost / heavy hits; decays back to base. */
  punchAberration(strength: number): void {
    this.aberrationBoost = Math.max(this.aberrationBoost, strength);
  }

  update(dt: number, boosting: boolean): void {
    const target = boosting ? 0.0022 : 0;
    this.aberrationBoost += (target - this.aberrationBoost) * Math.min(1, dt * 6);
    const total = this.baseAberration.x + this.aberrationBoost;
    this.chromaticAberration.offset.set(total, total);
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}
