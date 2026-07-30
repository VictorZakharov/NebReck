# Contributing to Nebula Reckoning

Thanks for helping improve the game.

## Before you start

- Search the existing issues before opening a new one.
- For a substantial feature or architectural change, open an issue first so the
  approach can be discussed before implementation.
- Keep pull requests focused. Separate unrelated fixes into separate changes.

## Local setup

Use a current Node.js LTS release, then install the locked dependency set:

```bash
npm ci
npm run dev
```

The development server is available at <http://localhost:8080>.

## Required checks

Run the checks relevant to your change before opening a pull request:

```bash
npm run typecheck
npm run test:smoke
npm run test:visual
```

Visual baselines are generated per local worktree and intentionally ignored by
Git. On a fresh clone, the first visual run creates local baselines; run the
command again to compare against them. Use `npm run test:visual:update` only for
intentional visual changes, inspect every affected image, and never commit
generated PNGs or `dist/`.

Read [docs/TESTING.md](docs/TESTING.md) for the complete test contract and
[docs/GOTCHAS.md](docs/GOTCHAS.md) before changing world generation, cameras,
AI, or rendering.

## Code and documentation

- Preserve deterministic world generation: use the project `Rng` streams, not
  `Math.random()` or wall-clock time, for render-affecting behavior.
- Keep per-frame code allocation-free where practical.
- Add a regression assertion or visual scene for every bug fix.
- Update the relevant documentation when behavior or architecture changes.

## Licensing contributions

By submitting a contribution to this repository, you agree that your
contribution is licensed under the repository's [MIT License](LICENSE).
