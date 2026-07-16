/**
 * @fileoverview Unit tests for the OCR Scanner module's game-aware parsing.
 * @module modules/ocr-scanner/tests
 *
 * Coverage targets:
 *   - `scanImage` builds its stat/name/set regexes from the ACTIVE game's real
 *     `OcrRules` (via `kernel.config.getAll().game.definition.ocr`), not a
 *     hardcoded single-game guess — verified against both WuWa- and
 *     Genshin-shaped sample OCR text.
 *   - The `%` vs no-`%` label distinction (e.g. flat ATK vs ATK%) survives
 *     parsing — this was a real bug where both collapsed to the same label.
 *   - When no active game has resolved yet, parsing falls back to WuWa-shaped
 *     default patterns rather than failing the scan outright.
 *
 * `tesseract.js` is mocked — this module's OWN parsing logic is under test,
 * not Tesseract's OCR accuracy (which is unverifiable in this environment).
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventBus } from '../../../core/event-bus';
import type {
    KernelInterface,
    LoggerInterface,
    EventBusInterface,
    ConfigInterface,
    ModuleRegistryInterface,
    FeatureFlagInterface,
} from '../../../shared/types';
// These tests exercise the REAL Wuthering Waves / Genshin Impact OCR regex
// rules (edge cases sourced from actual screenshots), not a generic fixture —
// so they import the GameDefinitions directly from their source modules
// rather than through the shared registry, which starts EMPTY at runtime
// (every game, including these two, now loads only via
// `initExternalGameModules` from a downloaded package — see
// `adapters/game-definitions/index.ts`).
import { wutheringWaves } from '../../../adapters/game-definitions/wuthering-waves/definition';
import { genshinImpact } from '../../../adapters/game-definitions/genshin-impact/definition';

// ─────────────────────────────────────────────────────────────────────────────
// tesseract.js mock — recognize() resolves with whatever SAMPLE_TEXT the test
// configures via `mockRecognizedText`, sidestepping real OCR entirely.
// ─────────────────────────────────────────────────────────────────────────────

let mockRecognizedText = '';
let mockConfidence = 85;

jest.mock('tesseract.js', () => ({
    createWorker: jest.fn(async () => ({
        setParameters: jest.fn(async () => undefined),
        recognize: jest.fn(async () => ({ data: { text: mockRecognizedText, confidence: mockConfidence } })),
        terminate: jest.fn(async () => undefined),
    })),
    PSM: { SINGLE_BLOCK: 6, SINGLE_COLUMN: 4 },
    OEM: { LSTM_ONLY: 1 },
}));

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function silentLogger(): LoggerInterface {
    return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), child: jest.fn() };
}

function fakeKernel(gameDefinition?: unknown): KernelInterface {
    const configMap: Record<string, unknown> = gameDefinition ? { game: { definition: gameDefinition } } : {};
    const config: ConfigInterface = {
        get: jest.fn(),
        set: jest.fn((key: string, value: unknown) => { configMap[key] = value; }),
        getAll: jest.fn(() => configMap),
        validate: jest.fn(() => ({ success: true, errors: [] })),
        watch: jest.fn(() => () => { /* noop */ }),
        load: jest.fn(),
        reset: jest.fn(),
    };
    return {
        eventBus: new EventBus(silentLogger()) as EventBusInterface,
        moduleRegistry: {} as ModuleRegistryInterface,
        config,
        logger: silentLogger(),
        featureFlags: {} as FeatureFlagInterface,
        version: '1.0.0',
    };
}

const TEST_IMAGE_PATH = path.join(__dirname, '__fixture.png');

async function loadModule(kernel: KernelInterface) {
    const { default: factory } = await import('../src');
    const mod = await factory({
        modulePath: path.join(__dirname, '..'),
        kernel,
        permissions: [],
        config: {},
    });
    await mod.initialize(kernel);
    return mod as unknown as { scanImage: (p: string, o?: unknown) => Promise<{ success: boolean; echo?: { name: string; cost: number; level?: number; mainStat: { type: string; value: number }; subStats: Array<{ type: string; value: number }>; setName?: string; equippedByCharacterName?: string }; error?: string }> };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('OCR Scanner module — game-aware parsing', () => {
    beforeAll(() => {
        // recognize() never actually reads the file's bytes (mocked), but
        // scanImage() does check fs.existsSync(imagePath) first — needs a real file.
        fs.writeFileSync(TEST_IMAGE_PATH, 'fixture');
    });
    afterAll(() => {
        fs.rmSync(TEST_IMAGE_PATH, { force: true });
    });
    afterEach(() => {
        jest.clearAllMocks();
    });

    it('parses a WuWa-shaped screenshot using WuWa OCR rules, including the %-label fix', async () => {
        mockRecognizedText = 'Void Thunder\nCost: 4\nCRIT Rate: 22.0%\nATK: 18.0%\nCRIT DMG: 10.5%\nHP: 320';
        const kernel = fakeKernel(wutheringWaves);
        const mod = await loadModule(kernel);

        const result = await mod.scanImage(TEST_IMAGE_PATH);

        expect(result.success).toBe(true);
        expect(result.echo?.mainStat).toEqual({ type: 'CRIT RATE%', value: 22.0 });
        expect(result.echo?.setName).toBe('Void Thunder');
        // ATK% (percent) must NOT collapse to plain "ATK" (flat) — the bug fix.
        const atk = result.echo?.subStats.find((s) => s.type.startsWith('ATK'));
        expect(atk?.type).toBe('ATK%');
        const hp = result.echo?.subStats.find((s) => s.type.startsWith('HP'));
        expect(hp?.type).toBe('HP'); // flat HP, no trailing %
        expect(hp?.value).toBe(320);
    });

    it('tolerates a long (>12 char) garbage run between a stat label and its value (real "Havoc Prism" screenshot)', async () => {
        // Real capture had "Crit. Rate" followed by 15 garbage characters
        // (likely two short adjacent rows bleeding together) before the
        // actual value — the original 12-char gap bound couldn't match
        // this at all, silently dropping the whole stat.
        mockRecognizedText = 'Havoc Prism +25\nCost: 1\nATK: 18.0%\nHP: 2280\n'
            + 'Heavy Attack DMG Bonus: 8.6%\nCrit DMG: 19.8%\nCrit. Rate BE Raw Ap. Ai 8.6%\nEnergy Regen: 10.8%';
        const kernel = fakeKernel(wutheringWaves);
        const mod = await loadModule(kernel);

        const result = await mod.scanImage(TEST_IMAGE_PATH);

        expect(result.success).toBe(true);
        const critRate = result.echo?.subStats.find((s) => s.type.startsWith('CRIT RATE'));
        expect(critRate).toBeDefined();
        expect(critRate?.value).toBe(8.6);
    });

    it('tolerates a merged/missing space inside a multi-word stat label (real "Havoc Prism" screenshot: "EnergyRegen")', async () => {
        // Real capture rendered "Energy Regen" with no space at all between
        // the two words — the label pattern required a literal space there,
        // so this line didn't match anything and the whole stat was lost.
        mockRecognizedText = 'Havoc Prism +25\nCost: 1\nATK: 18.0%\nHP: 2280\n'
            + 'Heavy Attack DMG Bonus: 8.6%\nCrit DMG: 19.8%\nCrit. Rate: 8.1%\nEnergyRegen: 10.8%';
        const kernel = fakeKernel(wutheringWaves);
        const mod = await loadModule(kernel);

        const result = await mod.scanImage(TEST_IMAGE_PATH);

        expect(result.success).toBe(true);
        // The backend's own `type` preserves whatever spacing OCR actually
        // produced (here, none) — space-insensitive re-matching against the
        // real game catalog happens downstream in ocrMapping.ts's
        // `resolveStatKey`/`stripPercent`, covered by its own test.
        const energyRegen = result.echo?.subStats.find((s) => s.type.replace(/\s+/g, '') === 'ENERGYREGEN%');
        expect(energyRegen).toBeDefined();
        expect(energyRegen?.value).toBe(10.8);
    });

    it('matches "Crit. Rate" / "Crit. DMG" with a literal period (real game rendering), normalizing to the period-free canonical label', async () => {
        // The original pattern only matched "CRIT Rate" (no period) — real WW
        // screenshots render "Crit. Rate"/"Crit. DMG" WITH a period, so this
        // substat was silently dropped entirely (regex never matched at all,
        // not a mis-parse). Reported by the user against a real screenshot.
        mockRecognizedText = 'Bell-Borne Geochelone\nCost: 4\nDEF: 41.8%\nHeavy Attack DMG Bonus: 9.4%\nCrit. Rate: 6.3%\nATK: 8.6%\nBasic Attack DMG Bonus: 7.9%';
        const kernel = fakeKernel(wutheringWaves);
        const mod = await loadModule(kernel);

        const result = await mod.scanImage(TEST_IMAGE_PATH);

        expect(result.success).toBe(true);
        const critRate = result.echo?.subStats.find((s) => s.type.startsWith('CRIT RATE'));
        expect(critRate).toBeDefined();
        // Normalized WITHOUT the period, so it matches the catalog's "Crit Rate" label.
        expect(critRate?.type).toBe('CRIT RATE%');
        expect(critRate?.value).toBe(6.3);
    });

    it('parses a Genshin-shaped screenshot using GI OCR rules (different stat vocabulary + no cost)', async () => {
        mockRecognizedText = 'Gladiators Finale: CRIT DMG: 62.2% ATK: 311 Energy Recharge: 6.5% CRIT Rate: 3.9%';
        const kernel = fakeKernel(genshinImpact);
        const mod = await loadModule(kernel);

        const result = await mod.scanImage(TEST_IMAGE_PATH);

        expect(result.success).toBe(true);
        expect(result.echo?.mainStat).toEqual({ type: 'CRIT DMG%', value: 62.2 });
        expect(result.echo?.setName).toBe('Gladiators Finale');
        expect(result.echo?.cost).toBe(0); // GI's costPattern is '' — no cost concept
        const flatAtk = result.echo?.subStats.find((s) => s.type === 'ATK');
        expect(flatAtk?.value).toBe(311);
        const er = result.echo?.subStats.find((s) => s.type.startsWith('ENERGY'));
        expect(er?.type).toBe('ENERGY RECHARGE%');
    });

    it('parses level and equipped-by from a real WuWa Echo Management screenshot layout, including a DMG-Bonus substat', async () => {
        // Based on the real "Hecate" echo screenshot (2026-07 session): name +
        // level, cost, main stat, 6 sub-stats including an attack-type DMG
        // Bonus (previously unmatched by the stat vocabulary), equipped-by.
        mockRecognizedText = 'Hecate +25\nCost: 4\n'
            + 'CRIT Rate: 22.0%\n'
            + 'ATK: 150\nATK: 7.9%\nBasic Attack DMG Bonus: 10.1%\nDEF: 50\nCRIT Rate: 7.5%\nHP: 7.9%\n'
            + 'Equipped by Yinlin';
        const kernel = fakeKernel(wutheringWaves);
        const mod = await loadModule(kernel);

        const result = await mod.scanImage(TEST_IMAGE_PATH);

        expect(result.success).toBe(true);
        expect(result.echo?.level).toBe(25);
        expect(result.echo?.equippedByCharacterName).toBe('Yinlin');
        expect(result.echo?.mainStat).toEqual({ type: 'CRIT RATE%', value: 22.0 });
        const dmgBonus = result.echo?.subStats.find((s) => s.type.startsWith('BASIC ATTACK DMG BONUS'));
        expect(dmgBonus?.type).toBe('BASIC ATTACK DMG BONUS%');
        expect(dmgBonus?.value).toBe(10.1);
        // 6 real sub-stats (ATK flat, ATK%, DMG Bonus%, DEF flat, CRIT Rate%, HP%)
        // must all survive the raised capture cap (previously hardcoded to 4).
        expect(result.echo?.subStats.length).toBe(6);
    });

    it('strips the "Phantom: " skin-indicator prefix from a scanned echo name (real "Phantom: Lightcrusher" screenshot)', async () => {
        // When a cosmetic skin is equipped on an echo, the game prefixes its
        // display name with "Phantom: " (2026-07 session, confirmed against a
        // real screenshot) — a skin indicator, not part of the echo's real
        // identity. Left unstripped, `echo.name` would come out as just
        // "Phantom" (the regex has no way to extend past the colon), losing
        // the real name entirely and breaking the name -> set lookup.
        mockRecognizedText = 'Phantom: Lightcrusher +25\nCost: 3\n'
            + 'Spectro DMG Bonus: 30.0%\n'
            + 'ATK: 100\nCRIT Rate: 10.5%\nATK: 9.4%\nEnergy Regen: 6.8%\nCRIT DMG: 16.2%\nHP: 510\n';
        const kernel = fakeKernel(wutheringWaves);
        const mod = await loadModule(kernel);

        const result = await mod.scanImage(TEST_IMAGE_PATH);

        expect(result.success).toBe(true);
        expect(result.echo?.name).toBe('Lightcrusher');
    });

    it('captures a "Main: Sub" compound echo name in full — including a "Nightmare: " variant, which was silently unreachable before this fix', async () => {
        // A 2026-07-13 completeness pass found the name regex had NEVER
        // actually captured past a colon at all — every catalog entry keyed
        // 'Nightmare: X' (and later, compound boss-part drops like "Chop
        // Chop: Headless") was silently unreachable by a real scan; a
        // "Nightmare: Thundering Mephis" screenshot would have scanned as
        // just "Nightmare", failing to resolve to anything.
        mockRecognizedText = 'Nightmare: Thundering Mephis +25\nCost: 4\n'
            + 'CRIT Rate: 22.0%\nATK: 150\nCRIT DMG: 16.2%\n';
        const kernel = fakeKernel(wutheringWaves);
        const mod = await loadModule(kernel);

        const result = await mod.scanImage(TEST_IMAGE_PATH);

        expect(result.success).toBe(true);
        expect(result.echo?.name).toBe('Nightmare: Thundering Mephis');
    });

    it('captures a 2-level compound name in either separator order (colon-then-hyphen AND hyphen-then-colon)', async () => {
        // "Reminiscence: Threnodian - Leviathan" goes colon-then-hyphen;
        // "Reminiscence - Nightmare: Adam Smasher" (confirmed real by the
        // user) goes the OPPOSITE order, hyphen-then-colon — the regex
        // treats each compound level independently rather than hardcoding
        // one specific separator order.
        mockRecognizedText = 'Reminiscence - Nightmare: Adam Smasher +25\nCost: 4\n'
            + 'CRIT Rate: 22.0%\nATK: 150\nCRIT DMG: 16.2%\n';
        const kernel = fakeKernel(wutheringWaves);
        const mod = await loadModule(kernel);

        const result = await mod.scanImage(TEST_IMAGE_PATH);

        expect(result.success).toBe(true);
        expect(result.echo?.name).toBe('Reminiscence - Nightmare: Adam Smasher');
    });

    it('captures a real echo name containing a lowercase "of"/"the" linking word in full, not truncated at the lowercase word', async () => {
        // A 2026-07-12 completeness pass found several real echo names use a
        // lowercase connector between two Title-Case words ("Lady of the
        // Sea", "Fallacy of No Return", "Rage Against the Statue") — checked
        // against every name in the live game data, "of"/"the" are the only
        // two. Left unhandled, capture stopped dead at the lowercase word
        // (e.g. "Lady of the Sea" -> just "Lady"), silently breaking the
        // name -> set/cost lookup for these echoes even though they were
        // already in the sourced catalog.
        mockRecognizedText = 'Lady of the Sea +25\nCost: 4\n'
            + 'CRIT Rate: 22.0%\nATK: 150\nCRIT DMG: 16.2%\n';
        const kernel = fakeKernel(wutheringWaves);
        const mod = await loadModule(kernel);

        const result = await mod.scanImage(TEST_IMAGE_PATH);

        expect(result.success).toBe(true);
        expect(result.echo?.name).toBe('Lady of the Sea');
    });

    it('tolerates OCR-garbled connector glyphs between a stat label and its value (real "Diurnus Knight" screenshot)', async () => {
        // Real capture had a decorative UI glyph between "Spectro DMG Bonus"
        // and its value misread as "~~", which the original `[:\s]+`
        // separator couldn't match at all — silently dropping the true main
        // stat AND wrongly promoting the next matching stat (flat ATK) to
        // "main stat" instead (parsing takes the first successful match).
        mockRecognizedText = 'Diurnus Knight +25\nCOST 3\n'
            + 'Spectro DMG Bonus ~~ 30.0%\nATK 100\nBasic Attack DMG Bonus 8.6%\nCrit. Rate 7.5%\nCrit. DMG 17.4%\nEnergy Regen 10.8%';
        const kernel = fakeKernel(wutheringWaves);
        const mod = await loadModule(kernel);

        const result = await mod.scanImage(TEST_IMAGE_PATH);

        expect(result.success).toBe(true);
        expect(result.echo?.cost).toBe(3);
        expect(result.echo?.mainStat).toEqual({ type: 'SPECTRO DMG BONUS%', value: 30.0 });
        // Flat ATK must land as a SUB-stat, not get wrongly promoted to main.
        const flatAtk = result.echo?.subStats.find((s) => s.type === 'ATK');
        expect(flatAtk?.value).toBe(100);
    });

    it('captures the real echo name, not the Sonata-set filter chip text above it (real "Bell-Borne Geochelone" screenshot)', async () => {
        // Reported 2026-07-16: the set-filter chip crop region (added
        // 2026-07-13) puts its own text directly BEFORE the echo name in the
        // raw OCR blob, e.g. "<Set name><icon junk><echo name> +<level>" —
        // here "RejuvenatingGlow" (OCR dropped the space) then a garbled
        // dropdown-arrow glyph ("¥") then the real name. The old `^`-anchored
        // pattern greedily grabbed the SET name (or set+junk) instead of the
        // real echo name.
        mockRecognizedText = 'RejuvenatingGlow ¥ Bell-Borne Geochelone +25 COST 4 '
            + 'Healing Bonus 26.4% ATK 150 ATK 6.4% Heavy Attack DMG Bonus 8.6% DEF 12.8% ATK 40 Basic Attack DMG Bonus 10.1%';
        const kernel = fakeKernel(wutheringWaves);
        const mod = await loadModule(kernel);

        const result = await mod.scanImage(TEST_IMAGE_PATH);

        expect(result.success).toBe(true);
        expect(result.echo?.name).toBe('Bell-Borne Geochelone');
        // The set-filter chip's OWN text ("Rejuvenating Glow") is genuinely
        // useful data (this echo can belong to more than one set, so this
        // is the one piece of OCR text that can disambiguate it) — but the
        // dropped space means a literal substring match against the known
        // set-name list ("Rejuvenating Glow", with a space) fails outright.
        expect(result.echo?.setName).toBe('Rejuvenating Glow');
    });

    it('captures the real echo name past a 2-letter OCR-garbled icon that fake-matches a Title-Case word (real "Lampylumen Myriad" screenshot: "Ag")', async () => {
        // "Freezing Frost Ag Lampylumen Myriad +0" — "Ag" is a garbled icon
        // glyph that happens to satisfy a naive Title-Case word match,
        // chaining onto the set name ("Freezing Frost Ag") and swallowing
        // the real name whole. Real echo/set name words are always 3+
        // letters, so NAME_WORD now requires 2+ lowercase letters (not 1+).
        mockRecognizedText = 'Freezing Frost Ag Lampylumen Myriad +0 COST 4 ATK 30 CRIT Rate 4.4%';
        const kernel = fakeKernel(wutheringWaves);
        const mod = await loadModule(kernel);

        const result = await mod.scanImage(TEST_IMAGE_PATH);

        expect(result.success).toBe(true);
        expect(result.echo?.name).toBe('Lampylumen Myriad');
    });

    it('captures the real echo name past the set-filter chip AND strips the "Phantom: " skin prefix in the same scan (real "Thundering Mephis" screenshot)', async () => {
        // "Void Thunder Y Phantom: Thundering Mephis +25" — combines both
        // fixes: skip past the set name + single-letter junk ("Y"), then
        // still correctly strip the unrelated "Phantom: " skin prefix.
        mockRecognizedText = 'Void Thunder Y Phantom: Thundering Mephis +25 COST 4 CRIT DMG 44.0% ATK 150';
        const kernel = fakeKernel(wutheringWaves);
        const mod = await loadModule(kernel);

        const result = await mod.scanImage(TEST_IMAGE_PATH);

        expect(result.success).toBe(true);
        expect(result.echo?.name).toBe('Thundering Mephis');
    });

    it('falls back to WuWa-shaped default patterns when no active game has resolved yet', async () => {
        mockRecognizedText = 'Molten Rift\nCost: 3\nATK: 40.0%\nHP: 500';
        const kernel = fakeKernel(undefined); // no game.definition in config at all
        const mod = await loadModule(kernel);

        const result = await mod.scanImage(TEST_IMAGE_PATH);

        expect(result.success).toBe(true);
        expect(result.echo?.setName).toBe('Molten Rift');
        expect(result.echo?.mainStat.type).toBe('ATK%');
        expect(kernel.logger.warn).toHaveBeenCalled();
    });
});
