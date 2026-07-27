import { SCAN_CROP_REGIONS, resolveCropRect, stackLayout, lumaInvert } from '../../shared/ocr/imagePreprocess';

describe('SCAN_CROP_REGIONS — exact numbers moved from electron-main.ts', () => {
    it('echoes has the 3 calibrated regions unchanged (top stat block, right stat panel, footer row)', () => {
        expect(SCAN_CROP_REGIONS.echoes).toEqual([
            { x: 0.10, y: 0.085, width: 0.22, height: 0.06 },
            { x: 0.77, y: 0.08, width: 0.23, height: 0.38 },
            { x: 0.77, y: 0.85, width: 0.23, height: 0.055 },
        ]);
    });

    it('terminal-check has one region targeting the top-left "Terminal" title text', () => {
        expect(SCAN_CROP_REGIONS['terminal-check']).toEqual([
            { x: 0.04, y: 0.02, width: 0.18, height: 0.08 },
        ]);
    });
});

describe('resolveCropRect', () => {
    it('scales a fractional region against real 1920x1080 bounds, rounding each field independently', () => {
        const bounds = { width: 1920, height: 1080 };
        const region = { x: 0.10, y: 0.085, width: 0.22, height: 0.06 };
        expect(resolveCropRect(bounds, region)).toEqual({ x: 192, y: 92, width: 422, height: 65 });
    });

    it('rounds x/y and width/height as INDEPENDENT fields, not via a right/bottom edge — a rect can legitimately extend past bounds width', () => {
        // x = round(3 * 0.5) = round(1.5) = 2; width = round(3 * 0.5) = 2 -> right edge (4) exceeds bounds.width (3).
        // Deriving width from (right edge - x) instead would have produced width = 1 here — this pins the real formula.
        const bounds = { width: 3, height: 1 };
        const region = { x: 0.5, y: 0, width: 0.5, height: 1 };
        expect(resolveCropRect(bounds, region)).toEqual({ x: 2, y: 0, width: 2, height: 1 });
    });

    it('resolves the real 2nd echoes region (right stat panel) against 1920x1080', () => {
        const bounds = { width: 1920, height: 1080 };
        expect(resolveCropRect(bounds, SCAN_CROP_REGIONS.echoes[1])).toEqual({ x: 1478, y: 86, width: 442, height: 410 });
    });
});

describe('stackLayout', () => {
    it('stacks same-width regions with zero horizontal offset and accumulating vertical offsets', () => {
        const layout = stackLayout([{ width: 100, height: 50 }, { width: 100, height: 30 }]);
        expect(layout).toEqual({ width: 100, height: 80, offsets: [{ x: 0, y: 0 }, { x: 0, y: 50 }] });
    });

    it('uses the WIDEST region as the composite width when inputs differ (left-aligned, not centered)', () => {
        const layout = stackLayout([{ width: 120, height: 20 }, { width: 80, height: 40 }]);
        expect(layout).toEqual({ width: 120, height: 60, offsets: [{ x: 0, y: 0 }, { x: 0, y: 20 }] });
    });

    it('a single region is a no-op stack: its own size, offset at the origin', () => {
        const layout = stackLayout([{ width: 64, height: 48 }]);
        expect(layout).toEqual({ width: 64, height: 48, offsets: [{ x: 0, y: 0 }] });
    });

    it('stacks all 3 real echoes crop sizes (1920x1080) the same way the OCR pipeline does', () => {
        const bounds = { width: 1920, height: 1080 };
        const sizes = SCAN_CROP_REGIONS.echoes.map((region) => resolveCropRect(bounds, region));
        const layout = stackLayout(sizes);
        expect(layout.width).toBe(Math.max(sizes[0].width, sizes[1].width, sizes[2].width));
        expect(layout.height).toBe(sizes[0].height + sizes[1].height + sizes[2].height);
        expect(layout.offsets).toEqual([
            { x: 0, y: 0 },
            { x: 0, y: sizes[0].height },
            { x: 0, y: sizes[0].height + sizes[1].height },
        ]);
    });
});

describe('lumaInvert', () => {
    it('inverts white to black', () => {
        expect(lumaInvert(255, 255, 255)).toBe(0);
    });

    it('inverts black to white', () => {
        expect(lumaInvert(0, 0, 0)).toBe(255);
    });

    it('inverts mid-gray to (approximately) mid-gray, since the channel weights sum to 1', () => {
        expect(lumaInvert(128, 128, 128)).toBeCloseTo(127, 10);
    });

    it('weights green the heaviest and blue the lightest, matching the 0.299/0.587/0.114 formula', () => {
        expect(lumaInvert(255, 0, 0)).toBeCloseTo(255 - 0.299 * 255, 10);
        expect(lumaInvert(0, 255, 0)).toBeCloseTo(255 - 0.587 * 255, 10);
        expect(lumaInvert(0, 0, 255)).toBeCloseTo(255 - 0.114 * 255, 10);
    });
});
