/**
 * @fileoverview Pure image-preprocessing math shared by the Electron OCR path
 * (`src/main/electron-main.ts`, Node `NativeImage` buffers) and the web
 * build's browser OCR path (`src/renderer/src/lib/ocrBrowser.ts`, Canvas 2D
 * `ImageData`). Both platforms need the exact same crop regions, the exact
 * same stacked-layout geometry, and the exact same grayscale+invert formula
 * to get comparable OCR accuracy — extracted here so a fix/retune in one
 * never silently fails to apply to the other (this codebase has hit that
 * "duplicated constant drifts between platforms" bug class before). Zero
 * DOM/Electron dependency by design: only numbers and arrays in, numbers
 * and arrays out. Each platform's own file still owns the actual raw-buffer
 * byte layout (Electron's `NativeImage.toBitmap()` is BGRA; a Canvas
 * `ImageData` buffer is always RGBA) and the upscale step, since both of
 * those genuinely differ per platform.
 */

/** Fractional (0-1) crop rect. Also the resolved PIXEL rect shape returned
 * by `resolveCropRect` — same four fields, different units. */
export interface CropRect { x: number; y: number; width: number; height: number }

export interface Size { width: number; height: number }

export interface StackOffset { x: number; y: number }

export interface StackedLayout { width: number; height: number; offsets: StackOffset[] }

// Fractional (0-1) crop regions per scan type, applied BEFORE upscaling. Each
// scan type maps to an ORDERED LIST of regions, stacked vertically into one
// composite image before OCR runs (see `stackLayout`).
//
// Calibrated against real 1920x1080 screenshots of the Resonator's echo-slot
// detail panel (not the Echo Management grid list): name/level/cost/icon row
// + full stat list sits at roughly x=1505-1860, y=95-490. Below that,
// "Echo Skill" (full ability description) and "Sonata Effect" render at
// VARIABLE height depending on the echo (some descriptions run several
// lines longer than others) — including that block would both feed a pile
// of irrelevant flavor text into OCR and, worse, there's no single fixed
// crop that reliably ends right after it for every echo. The "Equipped by
// <name>" row is unaffected by that variable height — it's pinned to a
// fixed footer position (~y=918-977) regardless of how long the skill text
// above it is, confirmed against four real screenshots with very different
// skill-description lengths. So: two fixed regions (top stat block, bottom
// footer row), skipping the variable middle entirely.
//
// x narrowed from 0.76 to 0.785 (confirmed against user-supplied close-up
// crops of the panel): every stat row has a small decorative bullet icon
// (a "+", or a stat-type glyph for the main stat) immediately to the left
// of its label, and the row right below Cost has a run of small button
// icons (lock/notes/etc) — neither carries any text OCR needs, and both
// were getting misread as garbage characters prefixed onto real labels
// (e.g. "HP" reading as "Fhe dt ©"). The right edge stays at the screen
// edge (1.0) since stat VALUES are right-aligned close to it — narrowing
// that side risks clipping real numbers. (A tighter 0.80/0.98/y=0.10
// variant was tried and reverted — see chat history 2026-07-12 if
// revisiting; kept here since it wasn't confirmed to actually help.)
//
// A third region (added 2026-07-13, user request) targets the Sonata-set
// filter chip in the TOP-LEFT of this same loadout screen (e.g. "Celestial
// Light ⌄") — the only place the game shows the currently-relevant Sonata
// set as plain, readable text at a FIXED position/height. The right panel's
// own "Sonata Effect" breakdown (further down, below "Echo Skill") also
// names the set, but sits in that same variable-height region already
// excluded above, so it can't be cropped reliably either — this chip is the
// dependable alternative. Once `setName` resolves from OCR text at all,
// `mapScannedEchoToGearDraft` already uses it directly ahead of any
// name-based set inference/ambiguity warning — no mapping-layer change
// needed, this region just gives that existing path something to find.
// Estimated from a single reference screenshot (2026-07-13, ~1920x1080),
// NOT yet confirmed against multiple real captures the way the two regions
// below were — unlike those, this one may need retuning after real use.
export const SCAN_CROP_REGIONS: Record<string, CropRect[]> = {
    echoes: [
        { x: 0.10, y: 0.085, width: 0.22, height: 0.06 },
        // x widened 0.785 -> 0.77 (2026-07-14, user request): the previous
        // narrowing (0.76 -> 0.785, see the history above) traded too far —
        // it was cutting into real label characters on some stat rows, not
        // just the decorative bullet icons it was meant to exclude. Right
        // edge stays anchored at 1.0 (width grows to compensate) since stat
        // VALUES are right-aligned close to the screen edge.
        { x: 0.77, y: 0.08, width: 0.23, height: 0.38 },
        { x: 0.77, y: 0.85, width: 0.23, height: 0.055 },
    ],
};

/**
 * Resolve a fractional (0-1) crop region against a real image's pixel
 * bounds. `Math.round` on every field, not just the final rect, to match
 * the Electron pipeline's original inline math exactly (rounding width/
 * height independently of x/y can shift the crop by a pixel vs rounding a
 * computed right/bottom edge instead — this must stay bit-identical to
 * Electron's own behavior since both platforms feed the same rect shape to
 * their respective crop APIs).
 */
export function resolveCropRect(bounds: Size, region: CropRect): CropRect {
    return {
        x: Math.round(bounds.width * region.x),
        y: Math.round(bounds.height * region.y),
        width: Math.round(bounds.width * region.width),
        height: Math.round(bounds.height * region.height),
    };
}

/**
 * Compute the composite canvas size and per-region top-left offset needed
 * to stack a list of (possibly differently-sized) crops vertically, top to
 * bottom — used to combine non-contiguous crop regions (e.g. a stat block
 * and a footer row, skipping variable-height content between them) into a
 * single image OCR can run on in one pass. Every region is left-aligned
 * (`x: 0`) onto a canvas as wide as the widest input; callers pad the
 * leftover horizontal space themselves (Electron: opaque-black buffer fill;
 * browser: a black-filled canvas background) since the actual pixel-fill
 * step is platform-specific, not pure math.
 */
export function stackLayout(sizes: Size[]): StackedLayout {
    const width = Math.max(...sizes.map((s) => s.width));
    const offsets: StackOffset[] = [];
    let y = 0;
    for (const size of sizes) {
        offsets.push({ x: 0, y });
        y += size.height;
    }
    return { width, height: y, offsets };
}

/**
 * Convert one RGB pixel to a single inverted-grayscale byte: light-text-on-
 * dark (WW's UI) becomes dark-text-on-light, matching what Tesseract's
 * bundled English model — trained overwhelmingly on documents with dark
 * text on a light background — expects. Not clamped/rounded here: inputs
 * are always 0-255 bytes, so the luma and its inverse are always in range,
 * and the caller's own buffer write (a `Buffer`/`Uint8Array` or a Canvas
 * `Uint8ClampedArray`) does its own standard numeric-to-byte conversion —
 * duplicating that here could only make the result diverge from Electron's
 * original inline behavior, not match it more closely.
 */
export function lumaInvert(r: number, g: number, b: number): number {
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    return 255 - luma;
}
