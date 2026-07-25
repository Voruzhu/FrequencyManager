# Web OCR preprocessing — bring it up to Electron's accuracy

## Context

FrequencyManager's OCR scanner already exists on both platforms (shipped
since v1.2.0): a "Scanner" nav item on both builds, an "Upload screenshot…"
flow on web (`ScannerScreen.tsx` → `ocrBrowser.ts` → tesseract.js's browser
worker), sharing the exact same `parseEchoData` parsing logic as Electron.

The user reported the web scan "doesn't work like it should" and supplied a
real result: scanning a genuine Wuthering Waves echo screenshot returned
`Cost 1` (real: 4), `CRIT RATE 220%` (real: 22.0%), an extra `CRIT RATE NaN`
substat, `Unknown Echo` (real: "Reminiscence - Nightmare: Adam Smasher"),
and `Equipped by Racy` (real: "Lucy"). The screenshot they attached shows why:
the full, uncropped, full-color game screen (character render, HUD, side
panel, everything) went straight into Tesseract.

Electron's OCR path never does this — `src/main/electron-main.ts` crops to
3 fixed panel regions, converts to grayscale and inverts (WW's light-text-
on-dark UI is the opposite of what Tesseract's English model was trained
on), and upscales 2.5x before OCR ever runs. `ocrBrowser.ts` skips all of
this and hands `worker.recognize()` the raw uploaded `File`.

**Goal:** port Electron's exact crop → grayscale+invert → upscale pipeline
into the browser via the Canvas 2D API, so web OCR accuracy matches
Electron's on the same screenshot.

**Non-goal (confirmed already satisfied, no work needed):** "only download
OCR assets if the user opts to scan." `getWorker()` (tesseract engine/WASM,
`eng.traineddata`) is already called lazily, only from inside
`scanImageInBrowser` — i.e. only when a scan actually starts, not on page
load or Scanner-screen mount. Nothing to change here; noted so it isn't
silently dropped as an unaddressed requirement.

## Architecture

Three pieces of Electron's pipeline are **pure math** with no Electron API
dependency — only the raw-buffer byte layout differs (Electron's
`NativeImage.toBitmap()` is BGRA; a Canvas `ImageData` buffer is always
RGBA). These get extracted into a new **`shared/ocr/imagePreprocess.ts`**,
imported by both `electron-main.ts` and `ocrBrowser.ts`, so the two
platforms can never silently drift onto different crop coordinates or a
different grayscale formula (this codebase has hit that exact "duplicated
constant drifts between platforms" bug class before — see `elemDmg` bucket
mismatches and echo sub-stat cap bugs in project memory).

```
shared/ocr/imagePreprocess.ts   (NEW — pure functions, no DOM/Electron)
  SCAN_CROP_REGIONS             (moved from electron-main.ts, unchanged)
  resolveCropRect(bounds, region) -> pixel rect
  stackLayout(sizes[])          -> composite canvas size + per-region offsets
  lumaInvert(r, g, b)           -> single inverted-grayscale byte

src/main/electron-main.ts       (MODIFIED — no behavior change)
  grayscaleAndInvert / applyCropAndUpscale now call the shared functions
  instead of hand-rolling the same fractional-crop and luma math inline

src/renderer/src/lib/ocrBrowser.ts   (MODIFIED — the actual fix)
  NEW: preprocessForOcr(file: File, scanType: string): Promise<Blob>
    1. createImageBitmap(file)
    2. resolveCropRect() each SCAN_CROP_REGIONS[scanType] entry against the
       bitmap's real width/height
    3. stackLayout() the resolved crop sizes
    4. draw each region onto one off-screen <canvas> at its computed offset
       (black-filled background, matching Electron's zero-init padding)
    5. getImageData → replace every pixel via lumaInvert() → putImageData
    6. draw that canvas scaled 2.5x onto a 2nd canvas
       (imageSmoothingQuality: 'high', matching Electron's quality: 'best')
    7. canvas.toBlob('image/png') -> Blob
  scanImageInBrowser() calls preprocessForOcr() before worker.recognize(),
  passing the Blob instead of the raw File.
```

The on-screen preview thumbnail (`URL.createObjectURL(file)` in
`ScannerScreen.tsx`) keeps using the **original** file, untouched — same
separation Electron has between "screenshot shown to the user" and "image
actually fed to OCR."

Only `scanType: 'echoes'` is reachable on web today (the only branch
`ScannerScreen.tsx`'s web upload flow calls into), matching what's
implemented on Electron — no new scan types added by this change.

## Error handling

`scanImageInBrowser` already wraps its body in try/catch and returns a
normal `{ success: false, error }` result on any exception. `preprocessForOcr`
needs no separate error handling — a `createImageBitmap` failure (corrupt
file) or a `canvas.toBlob` null result surfaces through that same existing
path as an ordinary scan-failed error, already shown in the Scanner
screen's UI.

## Testing

- **New `tests/shared/ocrImagePreprocess.test.ts`**: `resolveCropRect`,
  `stackLayout`, and `lumaInvert` are plain math over numbers/arrays — no
  DOM, no canvas, straightforward Jest unit tests.
- **Electron regression check**: `modules/ocr-scanner/tests/` (existing
  suite) must still pass unchanged after `electron-main.ts`'s refactor —
  this only changes *which function* computes the crop rect / luma value,
  not the formula itself, so Electron's OCR behavior must be bit-identical
  before/after.
- **Canvas glue in `ocrBrowser.ts`**: not unit-tested. jsdom has no real
  `<canvas>` 2D context without the native `canvas` npm package (a
  platform-specific binary dependency this project doesn't currently pull
  in, and Electron's own equivalent raster glue — `stitchVertically`,
  `grayscaleAndInvert` — has zero existing unit tests either, for the same
  reason: it's glue over a real image, not logic). Verified live instead,
  same as every other CDP/browser-driven feature this session:
  `npm run dev:web`, upload the exact screenshot the user attached, confirm
  the parsed result now reads `Cost 4`, `Crit Rate 22.0%` (not 220%), no
  stray `NaN` substat, and a resolved echo/character name — not just that
  it runs without throwing.

## Files touched

- `shared/ocr/imagePreprocess.ts` (new)
- `tests/shared/ocrImagePreprocess.test.ts` (new)
- `src/main/electron-main.ts` (refactor `grayscaleAndInvert`/`applyCropAndUpscale` to call the shared functions; local `SCAN_CROP_REGIONS` constant deleted, replaced with the import from `shared/ocr/imagePreprocess.ts`)
- `src/renderer/src/lib/ocrBrowser.ts` (new `preprocessForOcr`, wired into `scanImageInBrowser`)
