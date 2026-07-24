# FrequencyManager — Web Build vs Electron Build

> **Audience**: future contributors (human or AI) touching `src/renderer/`, CI, or anything platform-specific. Read this before assuming a renderer change "just works" on both builds.

FrequencyManager ships as two builds from **one renderer source tree** (`src/renderer/src/`): the Electron desktop app, and a static web build hosted on GitHub Pages. There is no separate "web" copy of any component, store, or screen — the same React code runs in both. This document explains exactly where and why the two builds diverge, so a change doesn't silently break one of them.

---

## 1. Build targets

| | Electron | Web |
|---|---|---|
| Entry HTML | `src/renderer/index.html` | `src/renderer/index.web.html` |
| Vite config | `src/renderer/vite.config.ts` | `src/renderer/vite.web.config.ts` |
| Build command | `npm run build:renderer` | `npm run build:web` |
| Output dir | `dist/renderer` | `dist/web` |
| Dev server | `npm run dev` (Electron + Vite) | `npm run dev:web` (plain Vite) |

The two entry HTML files are identical except the Content-Security-Policy `<meta>` tag (see §4). Both Vite configs share the same `@`/`@shared`/`@adapters` path aliases and `base: './'` (relative asset paths — works unchanged whether loaded via Electron's local file serving or a GitHub Pages *project* site subpath like `https://<user>.github.io/<repo>/`).

`build:web` runs a post-build step (`scripts/finalize-web-build.js`) that renames `dist/web/index.web.html` → `dist/web/index.html`, because Vite's HTML build output always keeps the source file's basename — static hosts need a literal `index.html`.

## 2. Deployment

Every push of a `v*.*.*` tag triggers `.github/workflows/build-release.yml`, which runs **two independent jobs**:
- `build` — the existing Electron release (installer artifacts, GitHub Release).
- `deploy-web` — runs `npm run build:web`, then deploys `dist/web` to GitHub Pages via `actions/upload-pages-artifact` + `actions/deploy-pages`.

They share the trigger but not a dependency — a failure in one doesn't block the other. This means **the web build always tracks the same version as the latest Electron release**; there is no separate web release cadence. GitHub Pages itself was enabled once via `gh api repos/<owner>/<repo>/pages -f build_type=workflow` (source: GitHub Actions, not a branch) — this is a one-time repo setting, not something CI redoes each run.

## 3. Platform detection

`src/renderer/src/lib/platform.ts` exports `hasElectronBridge()` — the single source of truth for "are we running inside Electron." It checks for `window.frequencyManager` (the preload bridge), which is **permanently absent** in a real browser deployment (there is no main process to expose it). Every platform-specific branch in the renderer goes through this function — grep for `hasElectronBridge` before assuming a screen is Electron-only or web-only.

Do **not** gate on `typeof window !== 'undefined'` or similar — that's true in both builds. `hasElectronBridge()` is the only reliable check.

## 4. What's actually different

### 4a. Window chrome
`WindowControls.tsx` (custom minimize/maximize/close buttons for Electron's frameless window) renders `null` when `!hasElectronBridge()` — the browser supplies its own window chrome.

### 4a-2. Landing screen
The `'dashboard'` nav slot (`screens/registry.tsx`) shows a different component per platform: Electron gets `DashboardScreen` (module/health stats, recent activity — describes the desktop app's internal plugin system, meaningless on a fresh web visit). Web gets `WelcomeScreen` instead — what the app does, an explicit "your data stays in this browser" note, a link to the desktop app, and the same quick-action shortcuts. Same nav position/icon either way, so `useUIStore`'s persisted `activeScreen` needs no special handling.

### 4b. Settings screen
- The **Updates** tab (checks GitHub releases, downloads/installs updates) doesn't exist on web — there's no installer to update; a page reload always serves whatever CI last deployed. The tab and its content are both gated out entirely, not just disabled.
- The **Scanner** tab (global hotkey, capture-display/monitor picker) also doesn't exist on web — both are Electron-only concepts (`globalShortcut`, `desktopCapturer`) with no equivalent in the web build's upload-only Scanner. Gated the same way as Updates.
- **Data import/export** (Settings → Data): Electron uses native save/open dialogs over the bridge; web uses `src/renderer/src/lib/fileIO.ts`'s `downloadTextFile`/`pickTextFile` (a browser download and an `<input type="file">` picker, respectively). Same JSON shape either way.
- **"Open logs folder"**: Electron-only button (there's a real log file on disk). Web shows a note pointing at the browser DevTools console (F12) instead.

### 4c. Game data source
Electron fetches the active game's full `GameBundle` from the `game-loader` module over IPC — including any **community-installed game package** the user has added via the in-app installer. The web build has no main process, no installer, and no IPC: it *always* uses the embedded fallback bundles in `src/renderer/src/data/gameData.ts` (`EMBEDDED['wuthering-waves']` / `EMBEDDED['genshin-impact']`) — there's nothing to fall back *from*. Anything a community game package could add (a third game, a modified roster) is Electron-only.

These embedded bundles are `wutheringWavesBundle`/`genshinImpactBundle`, imported directly from `adapters/game-definitions/<game>/bundle.ts` — the **exact same, complete, pre-derived `GameBundle`** (`buildGameBundle(...)`, full 55/121-character roster, real icon paths, real OCR rules) Electron gets over IPC once a game package is installed, not a hand-written approximation. That module chain (`bundle.ts` → `characters.ts`/`weapons.ts`/`skills.ts`/etc. → `shared/game-data/derive.ts`) has zero Node/Electron dependency, so importing it directly into the renderer costs nothing and can never drift from what Electron ships. If you add a new per-game data field, it flows through automatically from the adapter source — there's no separate web copy to remember to update.

### 4c-2. Icons
`src/renderer/src/lib/icons.ts`'s `iconSrc(gameId, iconPath)` resolves per-platform:
- **Electron**: `fm-icon://<gameId>/<path>`, served by the main process's `protocol.handle`, reading from the installed game package's `icons/` folder on disk (`<userData>/game-modules/<id>/icons/`). Structurally impossible in a browser tab (scheme registration is main-process-only) — never even attempt this on web.
- **Web**: `https://cdn.jsdelivr.net/gh/Voruzhu/FrequencyManager@v<version>/adapters/game-definitions/<gameId>/<path>` — jsDelivr's GitHub-CDN feature, serving the icon file straight from this **public** repo's own `adapters/*/icons/` source folders (the same ~36MB of art that `scripts/build-game-package.js` zips for the Electron installer — nothing extra to maintain). Pinned to the release tag (`__APP_VERSION__`, injected via `vite.web.config.ts`'s `define` from `package.json` at build time — declared for TS in `src/renderer/src/vite-env.d.ts`) rather than `@main`/`@latest`, so the URL is immutable and cacheable forever by every browser and jsDelivr's own edge cache — this is the web build's entire "image caching strategy," and it needs no service worker or custom cache layer to get it. Requires the repo to stay public and `img-src` to allow `cdn.jsdelivr.net` (see §4f).

`<ItemIcon>` itself is platform-blind either way — it just renders whatever `src` it's given, or falls back to a placeholder glyph on a load error (`onError`). All the platform logic lives in `iconSrc()`.

### 4d. OCR scanner — the biggest behavioral difference

| | Electron | Web |
|---|---|---|
| Trigger | Global hotkey (live in-game capture) **or** browse for a saved screenshot | Upload a saved screenshot only |
| Capture | `desktopCapturer` (main process) | None — user-provided image file |
| Preprocessing | Crops/upscales to the relevant UI region before OCR (`processFile`) | **None** — scans the raw uploaded image as-is |
| OCR engine | tesseract.js **Node** worker, in the main process | tesseract.js **browser** worker (`src/renderer/src/lib/ocrBrowser.ts`), in the page |
| Parsing logic | `shared/ocr/parseEchoData.ts` | **Same file, same function** — no duplicated logic |
| Language data | `eng.traineddata` bundled with the app | `eng.traineddata` bundled in `src/renderer/public/tessdata/` (avoids a repeat download) |
| Engine/worker code | Bundled with the app | Fetched from tesseract.js's default CDN (`cdn.jsdelivr.net`) the first time OCR runs in a session — **requires internet access** |

Both paths call the exact same `parseEchoData(text, confidence, ocrRules)` — a regex/string-only function extracted specifically so a parsing bugfix can't apply to one platform and not the other. `OcrRules` themselves are threaded through `GameBundle.ocr` (`shared/game-data/derive.ts`'s `buildGameBundle` sets it from the real `GameDefinition.ocr`, which is how it ends up on `wutheringWavesBundle`/`genshinImpactBundle` per §4c — not a hand-duplicated copy).

**Practical consequence**: because the web path has no crop/upscale preprocessing, a full uncropped screenshot generally OCRs worse than the same shot would through Electron's pipeline. Users get better results cropping close to the gear panel before uploading. This is a known, accepted limitation, not a bug — replicating Electron's crop pipeline in the browser (canvas-based cropping against a UI layout Electron currently hardcodes) is out of scope unless someone asks for it.

Gear-scanning is still gated per-game on `GameBundle.ocrVerified` on both platforms identically (Wuthering Waves `true`, Genshin Impact `false` — grayed out as "Coming soon" until someone verifies GI's patterns against a real screenshot).

### 4e. Storage
Both builds already shared one storage layer before this work: the renderer's stores fall back to `localStorage` whenever `window.frequencyManager`'s storage bridge is absent (originally built for local dev without Electron, not for the web build specifically — but it turns out to already be exactly what the web build needs). Practical implications specific to the web build:
- **No cross-device sync, no account system.** Data lives in that browser's `localStorage` for that origin. Clearing site data wipes it. This was a deliberate scope decision (local-only, no backend) — not a stopgap.
- Export/import (§4b) is the only way to move data between devices or browsers on the web build.

### 4f. Content-Security-Policy
`index.web.html`'s CSP is **stricter** than Electron's in one way (no `fm-icon:` custom-protocol source — that protocol only exists inside Electron) and **looser** in another, specifically to make browser-side OCR work:
```
script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net;
worker-src 'self' blob:;
img-src 'self' data: blob: https://cdn.jsdelivr.net;
connect-src 'self' https://cdn.jsdelivr.net data:;
```
- `worker-src blob:` — tesseract.js spawns its worker from a same-origin `blob:` URL (the standard workaround for `new Worker()` not accepting a cross-origin script URL directly).
- `script-src https://cdn.jsdelivr.net` + `connect-src https://cdn.jsdelivr.net` — the worker's `importScripts()` call and its own internal `fetch()`s (for the WASM OCR core) both go to tesseract.js's default CDN.
- `script-src 'wasm-unsafe-eval'` — required by Chromium-based browsers to instantiate WebAssembly at all under a CSP that doesn't otherwise allow `unsafe-eval`.
- `connect-src data:` — the WASM core's Emscripten glue script embeds the actual `.wasm` binary as a base64 `data:` URI and `fetch()`s it from there instead of a second network round-trip.
- `img-src blob:` — the scanned-screenshot preview thumbnail is `URL.createObjectURL(file)`, not a `data:` URL like Electron's `readImagePreview` produces.
- `img-src https://cdn.jsdelivr.net` — character/weapon/gear icons (§4c-2), fetched from the same CDN host (a second, independent reason to trust it, not related to OCR).

If you ever see a CSP violation in the browser console for a web-only feature, it's almost always this file that needs an addition — check `index.web.html`, not `index.html`.

## 5. Known, accepted gaps (not bugs)

These are deliberate scope cuts from the original web-build design discussion, not oversights:
- No auto-update mechanism on web (a page refresh always gets the latest deploy).
- No community game-package installer on web (Electron-only, per §4c).
- No live/hotkey OCR capture on web — upload only.
- No accounts or cross-device sync — `localStorage`, per browser, per origin.
- tesseract.js's browser worker/WASM-core code is bundled into the **Electron** renderer too (both builds share one import graph — `ScannerScreen.tsx` imports `ocrBrowser.ts` unconditionally), even though the Electron path never calls it. It's small (the CDN-fetched engine itself isn't bundled) and harmless dead weight, not worth a dynamic-import split unless bundle size becomes an actual problem.

## 6. Testing a web-build change locally

```bash
npm run build:web
node scripts/finalize-web-build.js   # already run by build:web itself — no need to repeat
# serve dist/web with any static file server, e.g.:
npx --yes serve dist/web
```
Or for fast iteration without a full build: `npm run dev:web` (plain Vite dev server, no Electron). Either way, open it in a real browser (not the Electron app) — `window.frequencyManager` must be genuinely absent for `hasElectronBridge()` checks to exercise the web branch at all.
