# Contributing to Nebula Reckoning

Thanks for helping improve the game.

## Before you start

- Search the existing issues before opening a new one.
- For a substantial feature or architectural change, open an issue first so the
  approach can be discussed before implementation.
- Keep pull requests focused. Separate unrelated fixes into separate changes.

## Local setup

Use Node.js 24 (the repository `.nvmrc` pins the major), then install the
locked dependency set:

```bash
npm ci
npm run dev
```

The development server is available at <http://localhost:8080>.

## Required checks

Run the checks relevant to your change before opening a pull request:

```bash
npm run test:architecture
npm run typecheck
npm run test:performance
npm run test:smoke
npm run test:visual
```

Visual baselines are generated per local worktree and intentionally ignored by
Git. On a fresh clone, the first visual run creates local baselines; run the
command again to compare against them. Use `npm run test:visual:update` only for
intentional visual changes, inspect every affected image, and never commit
generated PNGs or `dist/`.

`test:performance` reports comparable production-renderer diagnostics without a
machine-specific timing threshold, and enforces the deterministic hostile scene's
330-draw-call structural budget. Include its before/after framebuffer workload,
draw calls, and timing table when a pull request changes rendering performance.

Read [docs/TESTING.md](docs/TESTING.md) for the complete test contract and
[docs/GOTCHAS.md](docs/GOTCHAS.md) before changing world generation, cameras,
AI, or rendering.

Pull requests run the same typecheck/build/smoke gate in GitHub Actions.
Branches in this repository also receive a GitHub Pages preview; a bot posts the
URL on the PR and removes the preview when the PR closes. Fork pull requests do
not receive deployment credentials.

## Code and documentation

- Preserve deterministic world generation: use the project `Rng` streams, not
  `Math.random()` or wall-clock time, for render-affecting behavior.
- Keep per-frame code allocation-free where practical.
- Add a regression assertion or visual scene for every bug fix.
- Guided-course changes must extend the focused interactive tutorial smoke modules;
  a staged overlay screenshot alone does not prove an objective is completable.
  Visible results remain held until the next prompted gameplay action (or a named
  scripted transition), and control gates cover physical and virtual input with
  matching mobile highlights. Chevrons must stage a playable lesson, not a preview;
  taught controls arm immediately and deliberate actions may cancel narration, while
  passive scripted effects wait for it; Enter may mirror only an offered transition.
  desktop chevron clicks must work through the locked software cursor without
  firing. Focus loss must not mount another screen; Escape may mount only the
  tutorial-aware pause menu, whose Resume preserves the course and whose explicit
  Exit Tutorial action performs normal training teardown.
- Put new visual staging in the focused module under `src/game/test-scenes/`;
  keep `TestScenes.ts` as the small name-to-stage dispatcher.
- Update the relevant documentation when behavior or architecture changes.

## Licensing contributions

By submitting a contribution to this repository, you agree that your
contribution is licensed under the repository's [MIT License](LICENSE).
