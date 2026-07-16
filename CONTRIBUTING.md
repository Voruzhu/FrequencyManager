# Contributing to FrequencyManager

Thanks for your interest in contributing! This guide walks you through the
development setup, how to add a new module, how to add a new game, and the
conventions we follow.

---

## 🛠️ Development Setup

1. **Install Node.js ≥ 20.x** and **npm ≥ 10.x**.
2. Clone the repo:
   ```bash
   git clone https://github.com/Voruzhu/FrequencyManager.git
   cd FrequencyManager
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the app in development mode:
   ```bash
   npm run dev
   ```
   The app ships with **no game data built in** (see [Adding a New
   Game](#-adding-a-new-game) below) — a fresh clone shows a "No game
   installed yet" screen until you build and install at least one package:
   ```bash
   npm run build:main            # compiles adapters/game-definitions/*/bundle.ts to dist/
   npm run package:games          # packages both official games into dist/game-packages/*.zip
   ```
   Then extract `dist/game-packages/wuthering-waves.zip` (and/or
   `genshin-impact.zip`) into `%APPDATA%\frequency-manager\game-modules\` and
   restart `npm run dev`.

### Useful Commands

| Command                | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `npm run dev`          | Run Electron with hot reload                       |
| `npm run typecheck`    | Type-check both `src/` and `tests/`                |
| `npm run typecheck:src`| Type-check only `src/`                             |
| `npm run typecheck:test`| Type-check only `tests/`                          |
| `npm run lint`         | ESLint over `src/`                                 |
| `npm run lint:fix`     | ESLint with `--fix`                                |
| `npm run format`       | Prettier over `src/**`                             |
| `npm test`             | Run all Jest tests                                 |
| `npm run test:watch`   | Re-run tests on file change                        |
| `npm run test:coverage`| Run tests + emit coverage report                   |
| `npm run build`        | Production installer                               |

---

## 📁 Project Structure

```
FrequencyManager/
├── shared/types/                ← shared TypeScript types
│   ├── index.ts                 ← kernel + module contracts
│   └── game-definition.ts       ← GameDefinition contract
├── adapters/
│   └── game-definitions/        ← game-specific packages live here
│       ├── index.ts             ←   registry (id → GameDefinition)
│       ├── wuthering-waves/     ←   WU data + OCR regexes + sets
│       └── genshin-impact/      ←   GI data + OCR regexes + sets
├── modules/                     ← feature modules
│   ├── ocr-scanner/             ← screenshot OCR (game-agnostic, reads GameDefinition.ocr)
│   ├── damage-calculator/       ← DPS calculator + optimizer (game-agnostic)
│   ├── game-loader/             ← resolves activeGame, injects GameDefinition
│   ├── json-importer/           ← generic JSON export/import
│   └── update-checker/          ← game-definition auto-update
├── core/                        ← kernel subsystems (event-bus, registry, sandbox, etc.)
├── config/
│   └── default.json             ← app config (includes `game.activeGame`, `updates.*`)
├── src/                         ← Electron entry: main, preload, renderer (React UI)
├── scripts/                     ← build helpers + one-off data-import/curation tools
├── tests/                       ← jest tests (core/, modules/, shared/, renderer)
├── docs/                        ← design system docs, UI contract, DOCKER.md, etc.
├── Dockerfile                   ← multi-stage build (builder, production, dev, test)
└── docker-compose.yml           ← dashboard, dev, test services
```

---

## 📦 Building the Installer

The app is distributed as a **standalone NSIS installer** for Windows, built
with `electron-builder`. It installs per-user by default, creates Desktop and
Start Menu shortcuts, includes an uninstaller, and supports auto-updates via
`electron-updater`.

```bash
npm run build
```

The installer is output to `dist/installer/FrequencyManager Setup <version>.exe`.
Only the NSIS installer is produced — the portable executable target was
removed to keep distribution simple and consistent with auto-update
requirements.

### Publishing a release

Tag the release, build the installer, then attach it to a GitHub Release:

```bash
git tag -a vX.Y.Z -m "FrequencyManager vX.Y.Z"
git push origin vX.Y.Z
npm run build
gh release create vX.Y.Z "dist/installer/FrequencyManager Setup X.Y.Z.exe" --title "FrequencyManager vX.Y.Z" --notes "..."
```

---

## 🐳 Docker

```bash
docker compose up dashboard     # build + run the production dashboard
docker compose run --rm test    # one-shot typecheck + jest
docker compose up dev           # development with source mounted
```

See [docs/DOCKER.md](./docs/DOCKER.md) for details.

---

## 🧩 Adding a New Module

Modules live under `modules/<module-name>/`. To scaffold a new one:

```bash
mkdir -p modules/my-feature/src modules/my-feature/tests
```

### 1. Add `module.manifest.json`

```json
{
    "name": "my-feature",
    "displayName": "My Feature",
    "version": "0.1.0",
    "entryPoint": "./src/index.ts",
    "dependencies": {
        "core": "^1.0.0",
        "game-loader": "^1.0.0"
    },
    "permissions": [
        "fs:read",
        "fs:write"
    ],
    "configSchema": {
        "type": "object",
        "properties": {
            "enabled": { "type": "boolean", "default": true }
        }
    },
    "tags": ["feature", "example"],
    "minCoreVersion": "1.0.0",
    "enabledByDefault": true,
    "icon": "feature"
}
```

### 2. Add `src/manifest.ts`

A typed manifest object. Mirror the JSON above in TypeScript so the kernel
gets type safety on the manifest fields:

```ts
import type { ModuleManifest } from '@shared/types';

export const manifest: ModuleManifest = {
    name: 'my-feature',
    displayName: 'My Feature',
    version: '0.1.0',
    entryPoint: './src/index.ts',
    dependencies: { core: '^1.0.0' },
    permissions: ['fs:read', 'fs:write'],
    configSchema: {
        type: 'object',
        properties: { enabled: { type: 'boolean', default: true } },
    },
    tags: ['feature', 'example'],
    minCoreVersion: '1.0.0',
    enabledByDefault: true,
    icon: 'feature',
};
```

### 3. Add `src/index.ts`

```ts
import {
    ModuleAPI,
    ModuleManifest,
    ModuleLoaderOptions,
    ModuleFactory,
    ModuleHealthStatus,
    ModuleState,
    KernelInterface,
} from '@shared/types';
import { manifest } from './manifest';

export { manifest } from './manifest';

class MyFeatureModule implements ModuleAPI {
    public readonly moduleId = 'my-feature';
    public readonly manifest: ModuleManifest = manifest;
    public health: ModuleHealthStatus = 'unloaded';

    private kernel: KernelInterface | null = null;

    async initialize(kernel: KernelInterface): Promise<void> {
        this.kernel = kernel;
        // subscribe to events, register RPCs, etc.
        kernel.eventBus.subscribe('some:event', async (msg) => {
            kernel.logger.info('received', msg.payload);
        });
        this.health = 'healthy';
    }

    async configure(_c: Record<string, unknown>): Promise<void> { /* ... */ }
    async shutdown(): Promise<void> { this.health = 'unloaded'; }
    async healthCheck(): Promise<ModuleHealthStatus> { return this.health; }
    getState(): ModuleState {
        return {
            moduleId: this.moduleId,
            health: this.health,
            uptime: 0,
            data: {},
            lastHealthCheck: Date.now(),
            loadedAt: Date.now(),
        };
    }
}

const factory: ModuleFactory = async (_options: ModuleLoaderOptions): Promise<ModuleAPI> => {
    return new MyFeatureModule();
};

export default factory;
```

### 4. Add `PROCESS.md`

A short Markdown doc explaining your module's data flow in plain English.
What events does it emit? What does it consume? What's the RPC surface?
Other readers (humans + AI) will thank you.

### 5. Add tests

Aim for at least:
- one happy-path test
- one error-case test
- one contract test (publish / subscribe contract against the EventBus)

### 6. Module Naming

- Use **kebab-case** for module ids (`json-importer`, not `JsonImporter`).
- Event types you publish should be prefixed with your module id, e.g.
  `json-importer:exported`.

---

## 🎮 Adding a New Game

The app ships with **zero games compiled in** — there is no in-tree
registration step anymore. A game module is 100% plain data (a
`GameDefinition` + character/weapon rosters — no functions), so every game,
including the official Wuthering Waves and Genshin Impact packages, loads the
same way at runtime: drop a file into `%APPDATA%\frequency-manager\game-modules\`
and restart. Full format guide: [docs/GAME_MODULES.md](./docs/GAME_MODULES.md).

You don't need a sandbox, factory, kernel hooks, or a PR to add a game at
all — author the JSON directly per that guide and share it however you like.

### Contributing a game to this repo (optional)

If you'd like your game maintained alongside Wuthering Waves/Genshin Impact
— getting the same in-repo review, generated-icon tooling, and update-channel
support — author it as TypeScript under `adapters/game-definitions/<game-id>/`
instead of hand-writing JSON, mirroring the existing two games' layout
(`definition.ts`, `characters.ts`, `weapons.ts`, `bundle.ts` exporting a
`<gameId>ModuleInput` object). `scripts/build-game-package.js` compiles
whichever `bundle.ts` you point it at and reshapes it into the same
downloadable `.zip` format any community package uses — see that script and
`adapters/game-definitions/wuthering-waves/bundle.ts` for the exact shape
expected. Open a PR; there's no separate "built-in games list" to register it
in.

---

## 🌿 Branching & PRs

1. Branch off `main`: `git checkout -b feat/my-feature`.
2. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   `feat(ocr): add screenshot pre-processing`.
3. Before opening a PR make sure:
   - `npm run typecheck` passes
   - `npm run lint` passes
   - `npm test` passes
   - New code has tests
4. Open a PR against `main`. Fill in the PR template.
5. At least one approving review is required before merge.

---

## ✍️ Coding Style

- TypeScript strict mode is on. Do not weaken it.
- Use `import type` for type-only imports.
- Comments must explain **why**, not what. Future readers can read code; they
  cannot read your mind.
- Public functions must have JSDoc with `@param`, `@returns`, `@throws`, and
  an example if non-trivial.
- Errors must be `ModuleError` subclasses with a string `code`.
- Game-specific code is **only allowed** in `adapters/game-definitions/`.
  Modules in `modules/` must read from `kernel.config.get('game.definition')`.

---

## 🐛 Reporting Bugs

Open an issue using the **Bug Report** template. Include:

- Steps to reproduce
- Expected behaviour
- Actual behaviour
- OS, Node version, app version (`Help → About`)
- Relevant log lines (use `correlationId` if available)

---

## 💡 Requesting Features

Open an issue using the **Feature Request** template. Describe:

- The problem you are trying to solve
- Your proposed solution
- Alternatives you considered
- Willingness to contribute a PR

---

## 🔒 Security Issues

**Do not** file public issues for security problems. Contact the Developer(s)
instead. We aim to acknowledge within 48 hours.

---

## 📜 License

By contributing, you agree that your contributions will be licensed under the
project's [MIT license](./LICENSE).