/**
 * @fileoverview Tests for `lib/ocrMapping.ts` — OCR result → GearEntry draft.
 *
 * Coverage targets:
 *   - `resolveStatKey` correctly disambiguates a flat stat from its %
 *     sibling (e.g. "ATK" vs "ATK%" -> 'atk' vs 'atkPct'), and matches
 *     percent-only stats whose catalog label has no literal '%' (e.g.
 *     "CRIT RATE%" -> catalog label "Crit Rate", percent:true -> 'critRate').
 *   - `mapScannedEchoToGearDraft` pulls WuWa's cost-locked "base" stat (fixed
 *     by cost tier, never random) out into its own `baseStat` field, then
 *     clamps the remaining genuinely-random sub-stats to the REAL per-game
 *     cap (WuWa 5, GI 4) instead of trusting the backend's generous capture.
 *   - GI slot inference: only flower/plume (unique main stat) are inferred;
 *     an ambiguous main stat (shared by sands/goblet/circlet) is left
 *     unresolved rather than guessed.
 *   - Anything the catalog has no matching entry for (e.g. Healing Bonus,
 *     a real main-stat-only option never in the sub-stat roll pool) is
 *     surfaced in `unresolved`, never fabricated. The 4 attack-type DMG
 *     Bonus sub-stats used to be a real gap here (missing from the catalog
 *     entirely) until they were added with sourced ranges.
 */
import { resolveStatKey, mapScannedEchoToGearDraft, buildGearEntryFromDraft, hasBlockingIssues, gearIdentityKey, findDuplicateSource } from '../../src/renderer/src/lib/ocrMapping';
import { WW_GEAR_CATALOG, GI_GEAR_CATALOG } from '../../shared/game-data/gear-catalogs';
import { UNKNOWN_ECHO_NAME, type ScannedEcho } from '../../shared/types/ocr';

describe('resolveStatKey', () => {
    it('disambiguates flat vs percent WuWa stats sharing the same bare label', () => {
        expect(resolveStatKey('ATK%', WW_GEAR_CATALOG.mains)).toBe('atkPct');
        expect(resolveStatKey('ATK', WW_GEAR_CATALOG.mains)).toBe('atk');
    });

    it('matches a percent-only stat whose catalog label has no literal %', () => {
        // Catalog label is "Crit Rate" (percent:true, no '%' in the text) —
        // OCR's "CRIT RATE%" (backend always appends '%' for percent stats)
        // must still resolve via the percent-flag fallback match.
        expect(resolveStatKey('CRIT RATE%', WW_GEAR_CATALOG.mains)).toBe('critRate');
    });

    it('resolves a label with a missing internal space, e.g. OCR reading "Energy Regen" as "EnergyRegen"', () => {
        // The backend's own label-extraction preserves whatever spacing OCR
        // actually produced (a real capture read "EnergyRegen", no space) —
        // this must still resolve to the same catalog key as the properly-
        // spaced "ENERGY REGEN%" would.
        expect(resolveStatKey('ENERGYREGEN%', WW_GEAR_CATALOG.subs)).toBe('energyRegen');
    });

    it('resolves specific-element DMG Bonus main stats (real screenshots show "Spectro DMG Bonus" etc, not a generic "Elemental DMG")', () => {
        // Real WW/GI screenshots show the SPECIFIC element (confirmed
        // against multiple real cost-3 echo scans this session), never a
        // generic "Elemental DMG Bonus" label — the catalog used to only
        // have one generic 'elemDmg' key, so every real scan's main stat
        // came back unresolved despite reading correctly.
        expect(resolveStatKey('SPECTRO DMG BONUS%', WW_GEAR_CATALOG.mains)).toBe('spectroDmg');
        expect(resolveStatKey('GLACIO DMG BONUS%', WW_GEAR_CATALOG.mains)).toBe('glacioDmg');
        expect(resolveStatKey('HAVOC DMG BONUS%', WW_GEAR_CATALOG.mains)).toBe('havocDmg');
        expect(resolveStatKey('PYRO DMG BONUS%', GI_GEAR_CATALOG.mains)).toBe('pyroDmg');
        expect(resolveStatKey('DENDRO DMG BONUS%', GI_GEAR_CATALOG.mains)).toBe('dendroDmg');
    });

    it('returns undefined for a stat the catalog has no entry for at all', () => {
        // Healing Bonus is a real WW main-stat option (cost-4 only) but
        // never appears in the actual sub-stat roll pool — a genuine gap,
        // unlike the 4 attack-type DMG Bonus subs which used to be missing
        // here too until they were added as a real, sourced fix.
        expect(resolveStatKey('HEALING BONUS%', WW_GEAR_CATALOG.subs)).toBeUndefined();
    });
});

describe('mapScannedEchoToGearDraft — WuWa', () => {
    const baseEcho: ScannedEcho = {
        id: 'echo-1',
        name: 'Hecate',
        cost: 4,
        level: 25,
        mainStat: { type: 'CRIT RATE%', value: 22.0 },
        subStats: [
            { type: 'ATK', value: 150 },
            { type: 'ATK%', value: 7.9 },
            { type: 'BASIC ATTACK DMG BONUS%', value: 10.1 },
            { type: 'DEF', value: 50 },
            { type: 'CRIT RATE%', value: 7.5 },
            { type: 'HP%', value: 7.9 },
        ],
        setName: 'Void Thunder',
        equippedByCharacterName: 'Yinlin',
        confidence: 91,
        rawText: '...',
        scannedAt: Date.now(),
    };

    it('resolves set, cost-tier slot, and main stat', () => {
        const draft = mapScannedEchoToGearDraft(baseEcho, WW_GEAR_CATALOG);
        expect(draft.setId).toBe('void-thunder');
        expect(draft.slotId).toBe('c4'); // WW slots ARE cost tiers
        expect(draft.mainKey).toBe('critRate');
    });

    it('infers rarity from the deterministic base-stat value (flat ATK 150 -> 5★ for cost 4)', () => {
        const draft = mapScannedEchoToGearDraft(baseEcho, WW_GEAR_CATALOG);
        expect(draft.rarity).toBe(5);
        expect(draft.unresolved.some((u) => u.message.includes("doesn't closely match"))).toBe(false);
    });

    it('flags a base-stat value that does not closely match any known rarity as a likely misread', () => {
        const misreadEcho: ScannedEcho = {
            ...baseEcho,
            subStats: baseEcho.subStats.map((s) => (s.type === 'ATK' ? { type: 'ATK', value: 149 } : s)),
        };
        // 149 is off by only 1 from the true 5★ value (150) — should still
        // infer 5★ (closest match) without a mismatch warning, since a
        // 1-unit gap is well within rounding/OCR tolerance.
        const closeDraft = mapScannedEchoToGearDraft(misreadEcho, WW_GEAR_CATALOG);
        expect(closeDraft.rarity).toBe(5);
        expect(closeDraft.unresolved.some((u) => u.message.includes("doesn't closely match"))).toBe(false);

        const farOffEcho: ScannedEcho = {
            ...baseEcho,
            subStats: baseEcho.subStats.map((s) => (s.type === 'ATK' ? { type: 'ATK', value: 120 } : s)),
        };
        // 120 isn't close to any of 68/92/150 — a real echo's base stat
        // can't legitimately be "in between," so this should be flagged.
        const farDraft = mapScannedEchoToGearDraft(farOffEcho, WW_GEAR_CATALOG);
        expect(farDraft.unresolved.some((u) => u.message.includes("doesn't closely match"))).toBe(true);
    });

    it('pulls the cost-locked base stat (flat ATK for cost 4) out into `baseStat`, separate from the random `subs`', () => {
        const draft = mapScannedEchoToGearDraft(baseEcho, WW_GEAR_CATALOG);
        expect(draft.baseStat).toEqual({ key: 'atk', value: 150 });
        // 6 sub-stats in the OCR data, ALL resolvable (Basic Attack DMG
        // Bonus now has a real catalog entry); flat ATK is pulled out as
        // the base stat, leaving exactly 5 genuinely random ones — exactly
        // the real cap, so nothing gets trimmed.
        expect(draft.subs.length).toBe(5);
        expect(draft.subs.map((s) => s.key)).toEqual(['atkPct', 'basicAttackDmgBonus', 'def', 'critRate', 'hpPct']);
        expect(draft.unresolved.some((u) => u.message.includes('extra sub-stat'))).toBe(false);
    });

    it('flags a genuinely unmatched sub-stat (Healing Bonus, main-stat-only) as unresolved instead of dropping it silently', () => {
        const healingBonusEcho: ScannedEcho = {
            ...baseEcho,
            subStats: baseEcho.subStats.map((s) => (s.type === 'BASIC ATTACK DMG BONUS%' ? { type: 'HEALING BONUS%', value: 10.1 } : s)),
        };
        const draft = mapScannedEchoToGearDraft(healingBonusEcho, WW_GEAR_CATALOG);
        expect(draft.unresolved.some((u) => u.message.includes('HEALING BONUS'))).toBe(true);
    });

    it('actually drops and flags sub-stats beyond the real cap when there ARE more resolvable RANDOM ones than the cap allows', () => {
        const overflowEcho: ScannedEcho = {
            ...baseEcho,
            // ATK(150) is pulled out as the base stat (cost 4); the remaining
            // 6 are all genuinely random ones — one more than the real cap
            // (5) — to exercise the trim path.
            subStats: [
                { type: 'ATK', value: 150 }, { type: 'ATK%', value: 7.9 }, { type: 'DEF', value: 50 },
                { type: 'DEF%', value: 8.1 }, { type: 'HP', value: 320 }, { type: 'HP%', value: 7.9 },
                { type: 'ENERGY REGEN%', value: 10.8 },
            ],
        };
        const draft = mapScannedEchoToGearDraft(overflowEcho, WW_GEAR_CATALOG);
        expect(draft.baseStat).toEqual({ key: 'atk', value: 150 });
        expect(draft.subs.length).toBe(WW_GEAR_CATALOG.maxSubStats); // 5, not 6
        expect(draft.unresolved.some((u) => u.message.includes('extra sub-stat'))).toBe(true);
    });

    it('flags when the main stat resolves to the fixed cost-locked sub-stat and that stat is missing from the sub-stats — likely a garbled main-stat read', () => {
        const garbledMainEcho: ScannedEcho = {
            ...baseEcho,
            cost: 3, // cost-3 -> fixed sub-stat is flat ATK
            mainStat: { type: 'ATK', value: 100 }, // should be Spectro DMG Bonus etc, not ATK
            subStats: baseEcho.subStats.filter((s) => s.type !== 'ATK'), // no flat ATK present anywhere else
        };
        const draft = mapScannedEchoToGearDraft(garbledMainEcho, WW_GEAR_CATALOG);
        expect(draft.unresolved.some((u) => u.message.includes('normally the fixed base stat'))).toBe(true);
    });

    it('flags a sub-stat value outside its real range as a likely misread (real "Diurnus Knight" case: OCR dropped decimal points, "7.9%" -> "79%")', () => {
        const decimalDroppedEcho: ScannedEcho = {
            ...baseEcho,
            cost: 3,
            mainStat: { type: 'SPECTRO DMG BONUS%', value: 30.0 },
            subStats: [
                // Base stat (flat ATK, cost 3) entirely lost to OCR — a
                // separate, already-covered case; not the focus here.
                { type: 'BASIC ATTACK DMG BONUS%', value: 8.6 },
                { type: 'CRIT RATE%', value: 5 }, // real value 7.5% -> decimal dropped to "5"
                { type: 'ENERGY REGEN%', value: 10.8 },
                { type: 'ATK%', value: 79 }, // real value 7.9% -> decimal dropped to "79"
            ],
        };
        const draft = mapScannedEchoToGearDraft(decimalDroppedEcho, WW_GEAR_CATALOG);
        // Crit Rate: 5 isn't recoverable by /10 (0.5 is still out of range),
        // so it stays flagged as-is rather than auto-corrected.
        expect(draft.unresolved.some((u) => u.message.includes('Crit Rate scanned as 5') && u.message.includes('outside the valid range'))).toBe(true);
        // ATK%: 79 -> 7.9 via /10 DOES land back in the valid range (6.4-11.6)
        // — auto-corrected rather than just flagged, and the actual sub-stat
        // value in the draft reflects the corrected number.
        expect(draft.unresolved.some((u) => u.message.includes('ATK% auto-corrected from 79 to 7.9'))).toBe(true);
        expect(draft.subs.find((s) => s.key === 'atkPct')?.value).toBe(7.9);
        // Energy Regen (10.8%, real range 5.6-14.9%) is genuinely valid — must NOT be flagged.
        expect(draft.unresolved.some((u) => u.message.includes('Energy Regen scanned as'))).toBe(false);
    });

    it('flags when the fixed cost-locked sub-stat is entirely missing (not main, not a sub) — likely a dropped read', () => {
        const missingBaseStatEcho: ScannedEcho = {
            ...baseEcho,
            cost: 1, // cost-1 -> fixed sub-stat is flat HP; baseEcho has HP% but no flat HP anywhere,
            // and its main stat (Crit Rate) isn't HP either — so the fixed stat is genuinely absent.
        };
        const draft = mapScannedEchoToGearDraft(missingBaseStatEcho, WW_GEAR_CATALOG);
        expect(draft.unresolved.some((u) => u.message.includes('Expected a fixed'))).toBe(true);
    });

    it('does NOT flag a normal echo where the fixed cost-locked sub-stat is present as a regular sub-stat', () => {
        const draft = mapScannedEchoToGearDraft(baseEcho, WW_GEAR_CATALOG); // cost 4 -> ATK, present in subStats
        expect(draft.unresolved.some((u) => u.message.includes('normally the fixed base stat') || u.message.includes('Expected a fixed'))).toBe(false);
    });

    it('auto-corrects multiple dropped-decimal-point sub-stats in the same echo (real "Havoc Prism" case: "8.1%" -> "81%", "8.6%" -> "86%")', () => {
        const multiDroppedEcho: ScannedEcho = {
            ...baseEcho,
            cost: 1,
            mainStat: { type: 'ATK%', value: 18.0 },
            subStats: [
                { type: 'HP', value: 2280 }, // base stat, cost 1 -> hp, correct as-is
                { type: 'HEAVY ATTACK DMG BONUS%', value: 8.6 },
                { type: 'CRIT DMG%', value: 19.8 },
                { type: 'CRIT RATE%', value: 81 }, // real 8.1% -> decimal dropped
                { type: 'HP%', value: 86 }, // real 8.6% -> decimal dropped
                { type: 'ENERGY REGEN%', value: 10.8 },
            ],
        };
        const draft = mapScannedEchoToGearDraft(multiDroppedEcho, WW_GEAR_CATALOG);
        expect(draft.baseStat).toEqual({ key: 'hp', value: 2280 });
        expect(draft.unresolved.some((u) => u.message.includes('Crit Rate auto-corrected from 81 to 8.1'))).toBe(true);
        expect(draft.unresolved.some((u) => u.message.includes('HP% auto-corrected from 86 to 8.6'))).toBe(true);
        expect(draft.subs.find((s) => s.key === 'critRate')?.value).toBe(8.1);
        expect(draft.subs.find((s) => s.key === 'hpPct')?.value).toBe(8.6);
        expect(draft.unresolved.some((u) => u.message.includes('Energy Regen scanned as') || u.message.includes('Crit DMG scanned as'))).toBe(false);
    });

    it('infers the cost tier from the base-stat value when the literal Cost text fails to OCR (real "Diurnus Knight" case: "COST 3" misread as "€OSE 3")', () => {
        // echo.cost stays at the backend's 0 fallback when "Cost" itself
        // isn't recognized. Without the fallback, this would find no slot
        // at all, never extract the base stat, and wrongly flag ATK=100 as
        // "outside the valid range" for a random ATK sub-stat roll (30-70)
        // instead of recognizing it as the correct, deterministic cost-3
        // 5★ base-stat value.
        const costMisreadEcho: ScannedEcho = {
            id: 'echo-6', name: 'Diurnus Knight', cost: 0, level: 25,
            mainStat: { type: 'SPECTRO DMG BONUS%', value: 30.0 }, // resolves to 'spectroDmg' now that elemDmg is split per-element
            subStats: [
                { type: 'ATK', value: 100 }, // the true base stat, cost-3 5★
                { type: 'CRIT RATE%', value: 7.5 },
                { type: 'CRIT DMG%', value: 17.4 },
                { type: 'ENERGY REGEN%', value: 10.8 },
            ],
            confidence: 85, rawText: '...', scannedAt: Date.now(),
        };
        const draft = mapScannedEchoToGearDraft(costMisreadEcho, WW_GEAR_CATALOG);
        expect(draft.slotId).toBe('c3');
        expect(draft.rarity).toBe(5);
        expect(draft.baseStat).toEqual({ key: 'atk', value: 100 });
        expect(draft.unresolved.some((u) => u.message.includes("Cost couldn't be read directly") && u.message.includes('cost-3'))).toBe(true);
        // The critical regression: ATK=100 must NOT be flagged as an
        // out-of-range random roll — it's the correct base-stat value.
        expect(draft.unresolved.some((u) => u.message.startsWith('ATK scanned as'))).toBe(false);
    });
});

describe('mapScannedEchoToGearDraft — Genshin Impact', () => {
    it('clamps sub-stats to the real GI cap (4)', () => {
        const echo: ScannedEcho = {
            id: 'echo-2', name: 'Test Artifact', cost: 0,
            mainStat: { type: 'CRIT DMG%', value: 62.2 },
            subStats: [
                { type: 'ATK', value: 311 }, { type: 'CRIT RATE%', value: 3.9 },
                { type: 'ENERGY RECHARGE%', value: 6.5 }, { type: 'HP%', value: 5.8 }, { type: 'DEF%', value: 6.2 },
            ],
            setName: 'Gladiators Finale', confidence: 88, rawText: '...', scannedAt: Date.now(),
        };
        const draft = mapScannedEchoToGearDraft(echo, GI_GEAR_CATALOG);
        expect(draft.subs.length).toBe(GI_GEAR_CATALOG.maxSubStats); // 4, not 5
        expect(draft.unresolved.some((u) => u.message.includes('extra sub-stat'))).toBe(true);
    });

    it('infers flower/plume from a uniquely-identifying main stat', () => {
        const flowerEcho: ScannedEcho = {
            id: 'echo-3', name: 'Flower', cost: 0,
            mainStat: { type: 'HP', value: 4780 }, subStats: [],
            confidence: 90, rawText: '...', scannedAt: Date.now(),
        };
        expect(mapScannedEchoToGearDraft(flowerEcho, GI_GEAR_CATALOG).slotId).toBe('flower');

        const plumeEcho: ScannedEcho = {
            id: 'echo-4', name: 'Plume', cost: 0,
            mainStat: { type: 'ATK', value: 311 }, subStats: [],
            confidence: 90, rawText: '...', scannedAt: Date.now(),
        };
        expect(mapScannedEchoToGearDraft(plumeEcho, GI_GEAR_CATALOG).slotId).toBe('plume');
    });

    it('leaves the slot unresolved for an ambiguous main stat shared by sands/goblet/circlet', () => {
        const ambiguousEcho: ScannedEcho = {
            id: 'echo-5', name: 'Ambiguous', cost: 0,
            mainStat: { type: 'HP%', value: 46.6 }, subStats: [],
            confidence: 90, rawText: '...', scannedAt: Date.now(),
        };
        expect(mapScannedEchoToGearDraft(ambiguousEcho, GI_GEAR_CATALOG).slotId).toBeUndefined();
    });
});

describe('buildGearEntryFromDraft', () => {
    it('builds a complete GearEntry from a fully-resolved clean draft — the Scanner auto-import path', () => {
        const echo: ScannedEcho = {
            id: 'echo-7', name: 'Reminiscence', cost: 4, level: 25,
            mainStat: { type: 'CRIT RATE%', value: 22.0 },
            subStats: [
                { type: 'ATK', value: 150 }, { type: 'CRIT RATE%', value: 6.3 },
                { type: 'CRIT DMG%', value: 15.0 }, { type: 'ENERGY REGEN%', value: 10.8 }, { type: 'DEF', value: 60 },
            ],
            setName: 'Void Thunder', confidence: 91, rawText: '...', scannedAt: Date.now(),
        };
        const draft = mapScannedEchoToGearDraft(echo, WW_GEAR_CATALOG);
        // "Reminiscence" alone isn't a full WW_ECHO_CATALOG match (the real
        // entry is "Reminiscence - Nightmare: Adam Smasher") — preserved as
        // the scanned name with one minor "not in the known list" note
        // rather than discarded; still auto-import-eligible (minor-only).
        expect(draft.unresolved).toEqual([
            { message: 'Echo name "Reminiscence" isn\'t in the known specific-echo list — kept as scanned; please verify it\'s spelled correctly', severity: 'minor' },
        ]);
        const gear = buildGearEntryFromDraft(draft, WW_GEAR_CATALOG, 'echo', () => 'test-id-1');
        expect(gear).toEqual({
            kind: 'echo',
            id: 'test-id-1',
            name: 'Reminiscence',
            setName: 'Void Thunder',
            rarity: 5,
            cost: 4,
            slot: undefined,
            mainStat: { key: 'critRate', label: 'Crit Rate', value: 22.0 }, // cost-4 5★ override, not the shared fallback
            subStats: [
                { key: 'atk', label: 'ATK', value: 150 }, // base stat, listed first
                { key: 'critRate', label: 'Crit Rate', value: 6.3 },
                { key: 'critDmg', label: 'Crit DMG', value: 15.0 },
                { key: 'energyRegen', label: 'Energy Regen', value: 10.8 },
                { key: 'def', label: 'DEF', value: 60 },
            ],
        });
    });

    it('returns null when rarity could not be determined at all', () => {
        const draft = mapScannedEchoToGearDraft(
            { id: 'echo-8', name: 'Unknown', cost: 4, mainStat: { type: 'CRIT RATE%', value: 22.0 }, subStats: [], confidence: 80, rawText: '...', scannedAt: Date.now() },
            WW_GEAR_CATALOG,
        );
        expect(draft.rarity).toBeUndefined(); // no base stat read at all -> no rarity signal
        expect(buildGearEntryFromDraft(draft, WW_GEAR_CATALOG, 'echo', () => 'x')).toBeNull();
    });

    it('returns null when the main stat never resolved to a catalog key', () => {
        const draft = mapScannedEchoToGearDraft(
            { id: 'echo-9', name: 'Unresolved Main', cost: 4, mainStat: { type: 'TOTALLY UNKNOWN STAT%', value: 10 }, subStats: [{ type: 'ATK', value: 150 }], confidence: 80, rawText: '...', scannedAt: Date.now() },
            WW_GEAR_CATALOG,
        );
        expect(draft.mainKey).toBeUndefined();
        expect(buildGearEntryFromDraft(draft, WW_GEAR_CATALOG, 'echo', () => 'x')).toBeNull();
    });
});

describe('hasBlockingIssues — Scanner "Auto import from latest" eligibility bar', () => {
    it('returns false for a draft with only minor issues (successful decimal-point auto-corrections)', () => {
        const multiDroppedEcho: ScannedEcho = {
            id: 'echo-10', name: 'Test', cost: 1, level: 25,
            mainStat: { type: 'ATK%', value: 18.0 },
            subStats: [
                { type: 'HP', value: 2280 }, // base stat, cost 1 -> hp, correct as-is
                { type: 'HEAVY ATTACK DMG BONUS%', value: 8.6 },
                { type: 'CRIT DMG%', value: 19.8 },
                { type: 'CRIT RATE%', value: 81 }, // real 8.1% -> decimal dropped, auto-corrects
                { type: 'HP%', value: 86 }, // real 8.6% -> decimal dropped, auto-corrects
                { type: 'ENERGY REGEN%', value: 10.8 },
            ],
            setName: 'Void Thunder', confidence: 90, rawText: '...', scannedAt: Date.now(),
        };
        const draft = mapScannedEchoToGearDraft(multiDroppedEcho, WW_GEAR_CATALOG);
        expect(draft.unresolved.length).toBeGreaterThan(0); // the auto-correct notes are still recorded...
        expect(hasBlockingIssues(draft)).toBe(false); // ...but none of them block import
    });

    it('returns false for a draft with only minor issues (unresolved sub-stat name, out-of-range value with no correction) — these no longer block, only warn', () => {
        const messyButBuildableEcho: ScannedEcho = {
            id: 'echo-12', name: 'Test', cost: 4, level: 25,
            mainStat: { type: 'CRIT RATE%', value: 22.0 },
            subStats: [
                { type: 'ATK', value: 150 }, // base stat
                { type: 'HEALING BONUS%', value: 10.1 }, // unresolved sub-stat name -> dropped, minor
                { type: 'CRIT RATE%', value: 5 }, // out of range (real range ~4-7.5%), no /10 correction lands in range -> minor
                { type: 'ENERGY REGEN%', value: 10.8 },
            ],
            setName: 'Void Thunder', confidence: 88, rawText: '...', scannedAt: Date.now(),
        };
        const draft = mapScannedEchoToGearDraft(messyButBuildableEcho, WW_GEAR_CATALOG);
        expect(draft.unresolved.length).toBeGreaterThan(0);
        expect(hasBlockingIssues(draft)).toBe(false);
        // Still builds a valid entry despite the warnings.
        expect(buildGearEntryFromDraft(draft, WW_GEAR_CATALOG, 'echo', () => 'x')).not.toBeNull();
    });

    it('returns true for a draft with any major issue (an unresolved set — no set text read, and the echo name is not in the known echo-to-set list)', () => {
        const unresolvedSetEcho: ScannedEcho = {
            id: 'echo-11', name: 'Totally Unknown Echo', cost: 4, level: 25,
            mainStat: { type: 'CRIT RATE%', value: 22.0 },
            subStats: [
                { type: 'ATK', value: 150 }, { type: 'DEF', value: 50 },
                { type: 'CRIT RATE%', value: 7.5 }, { type: 'HP%', value: 7.9 },
            ],
            confidence: 91, rawText: '...', scannedAt: Date.now(),
        };
        const draft = mapScannedEchoToGearDraft(unresolvedSetEcho, WW_GEAR_CATALOG);
        expect(draft.setId).toBeUndefined();
        expect(hasBlockingIssues(draft)).toBe(true);
    });

    it('blocks auto-import when the echo name is completely unreadable (the backend\'s UNKNOWN_ECHO_NAME sentinel) — distinct from an uncatalogued-but-real name, which does NOT block on its own', () => {
        const unreadableNameEcho: ScannedEcho = {
            id: 'echo-12', name: UNKNOWN_ECHO_NAME, cost: 4, level: 25,
            setName: 'Void Thunder', // set text WAS read fine — only the name failed
            mainStat: { type: 'CRIT RATE%', value: 22.0 },
            subStats: [
                { type: 'ATK', value: 150 }, { type: 'DEF', value: 50 },
                { type: 'CRIT RATE%', value: 7.5 }, { type: 'HP%', value: 7.9 },
            ],
            confidence: 91, rawText: '...', scannedAt: Date.now(),
        };
        const draft = mapScannedEchoToGearDraft(unreadableNameEcho, WW_GEAR_CATALOG);
        // The set DID resolve — without the explicit name check, this draft
        // would otherwise have zero blocking issues (buildGearEntryFromDraft
        // falls back to the set name and would happily build a "valid"
        // entry with no real name behind it).
        expect(draft.setId).toBeDefined();
        expect(hasBlockingIssues(draft)).toBe(true);
        expect(draft.unresolved.some((u) => u.severity === 'major' && /couldn.t read it/i.test(u.message))).toBe(true);
    });
});

describe('mapScannedEchoToGearDraft — set inferred from echo name (set icon has no OCR text)', () => {
    it('resolves the set from a known boss echo name when echo.setName was never read', () => {
        const noSetNameEcho: ScannedEcho = {
            id: 'echo-13', name: 'Thundering Mephis', cost: 4, level: 25,
            mainStat: { type: 'CRIT RATE%', value: 22.0 },
            subStats: [
                { type: 'ATK', value: 150 }, { type: 'DEF', value: 50 },
                { type: 'CRIT RATE%', value: 7.5 }, { type: 'HP%', value: 7.9 }, { type: 'ENERGY REGEN%', value: 10.8 },
            ],
            confidence: 91, rawText: '...', scannedAt: Date.now(),
        };
        const draft = mapScannedEchoToGearDraft(noSetNameEcho, WW_GEAR_CATALOG);
        expect(draft.setId).toBe('void-thunder');
        expect(draft.unresolved.some((u) => u.message.includes('Set inferred from echo name') && u.severity === 'minor')).toBe(true);
        expect(hasBlockingIssues(draft)).toBe(false);
        // Real, sourced echo identity — used to pre-fill AddGearWindow's Echo picker.
        expect(draft.echoName).toBe('Thundering Mephis');
    });

    it('flags (but does not discard) a scanned cost that disagrees with the catalog\'s known cost for that echo name', () => {
        const wrongCostEcho: ScannedEcho = {
            id: 'echo-15', name: 'Thundering Mephis', cost: 1, level: 25,
            mainStat: { type: 'CRIT RATE%', value: 22.0 },
            subStats: [{ type: 'ATK', value: 150 }],
            confidence: 91, rawText: '...', scannedAt: Date.now(),
        };
        const draft = mapScannedEchoToGearDraft(wrongCostEcho, WW_GEAR_CATALOG);
        expect(draft.echoName).toBe('Thundering Mephis');
        const costMsg = draft.unresolved.find((u) => u.message.includes('Thundering Mephis') && u.message.includes('cost'));
        expect(costMsg?.severity).toBe('minor');
    });

    it('preserves the raw scanned name (flagged, not discarded) for a generic world-mob echo name not in the sourced catalog', () => {
        // Previously left `echoName` undefined here, silently dropping a
        // perfectly real OCR read just because WW_ECHO_CATALOG (a curated
        // subset, not exhaustive) doesn't happen to list it — the confirm
        // window's Echo field then showed nothing at all despite OCR having
        // read real text. Now kept as freeform text instead.
        const unknownEcho: ScannedEcho = {
            id: 'echo-16', name: 'Definitely Not A Real Echo Name', cost: 1,
            mainStat: { type: 'ATK%', value: 18.0 }, subStats: [],
            confidence: 85, rawText: '...', scannedAt: Date.now(),
        };
        const draft = mapScannedEchoToGearDraft(unknownEcho, WW_GEAR_CATALOG);
        expect(draft.echoName).toBe('Definitely Not A Real Echo Name');
        // This fixture also has no `setName` and an unrecognized name, so it
        // separately (and correctly) raises a MAJOR "Set: couldn't be
        // determined" issue — unrelated to the name-preservation being
        // tested here. Find the specific echo-name note among both.
        const msg = draft.unresolved.find((u) => u.message.includes('specific-echo list'));
        expect(msg?.severity).toBe('minor');
    });

    it('does NOT guess a set for an echo name that can legitimately carry more than one set, but DOES warn with the real short list of options', () => {
        // "Havoc Prism" is a real generic world-mob echo that can be
        // configured to any of 3 different sonata sets in-game — its name
        // alone can't identify which one THIS copy is, so it must stay
        // unresolved rather than guessed (same "don't fabricate" bar as
        // every other unresolved field) — but since the real candidate list
        // is known data (WW_ECHO_AMBIGUOUS_SETS), the warning should name
        // those 3 sets rather than just saying "unknown, pick manually".
        const ambiguousNameEcho: ScannedEcho = {
            id: 'echo-14', name: 'Havoc Prism', cost: 1,
            mainStat: { type: 'ATK%', value: 18.0 }, subStats: [],
            confidence: 85, rawText: '...', scannedAt: Date.now(),
        };
        const draft = mapScannedEchoToGearDraft(ambiguousNameEcho, WW_GEAR_CATALOG);
        expect(draft.setId).toBeUndefined();
        expect(hasBlockingIssues(draft)).toBe(true);
        const setMsg = draft.unresolved.find((u) => u.message.startsWith('Set:'));
        expect(setMsg?.message).toContain('Havoc Prism');
        expect(setMsg?.message).toContain('Void Thunder');
        expect(setMsg?.message).toContain('Celestial Light');
        expect(setMsg?.message).toContain('Havoc Eclipse');
        // The real candidate list is also returned structurally (not just in
        // the message text) — AddGearWindow uses this to narrow its Set
        // picker to exactly these 3, instead of offering the full catalog.
        expect(draft.setOptions).toEqual(['Void Thunder', 'Celestial Light', 'Havoc Eclipse']);
    });

    it('leaves setOptions undefined when the set resolved normally (no picker restriction needed)', () => {
        const resolvedEcho: ScannedEcho = {
            id: 'echo-17', name: 'Thundering Mephis', cost: 4,
            mainStat: { type: 'CRIT RATE%', value: 22.0 }, subStats: [],
            confidence: 91, rawText: '...', scannedAt: Date.now(),
        };
        const draft = mapScannedEchoToGearDraft(resolvedEcho, WW_GEAR_CATALOG);
        expect(draft.setId).toBe('void-thunder');
        expect(draft.setOptions).toBeUndefined();
    });
});

describe('gearIdentityKey / findDuplicateSource', () => {
    const baseEcho: ScannedEcho = {
        id: 'echo-1',
        name: 'Hecate',
        cost: 4,
        level: 25,
        mainStat: { type: 'CRIT RATE%', value: 22.0 },
        subStats: [
            { type: 'ATK', value: 150 },
            { type: 'ATK%', value: 7.9 },
            { type: 'BASIC ATTACK DMG BONUS%', value: 10.1 },
            { type: 'DEF', value: 50 },
            { type: 'CRIT RATE%', value: 7.5 },
            { type: 'HP%', value: 7.9 },
        ],
        setName: 'Void Thunder',
        equippedByCharacterName: 'Yinlin',
        confidence: 91,
        rawText: '...',
        scannedAt: Date.now(),
    };

    function buildEntry(echo: ScannedEcho) {
        const draft = mapScannedEchoToGearDraft(echo, WW_GEAR_CATALOG);
        const entry = buildGearEntryFromDraft(draft, WW_GEAR_CATALOG, 'echo', () => 'test-id');
        if (!entry) throw new Error('expected a buildable entry in this fixture');
        return entry;
    }

    it('gearIdentityKey ignores name — two echoes with the same stats but different names produce the same key', () => {
        const a = buildEntry(baseEcho);
        const b = buildEntry({ ...baseEcho, name: 'A Different Fodder Echo' });
        expect(gearIdentityKey(a)).toBe(gearIdentityKey(b));
    });

    it('gearIdentityKey differs when a single sub-stat value differs', () => {
        const a = buildEntry(baseEcho);
        const b = buildEntry({
            ...baseEcho,
            subStats: baseEcho.subStats.map((s) => (s.type === 'CRIT RATE%' && s.value === 7.5 ? { ...s, value: 8.6 } : s)),
        });
        expect(gearIdentityKey(a)).not.toBe(gearIdentityKey(b));
    });

    it('findDuplicateSource returns undefined when nothing matches', () => {
        const draft = mapScannedEchoToGearDraft(baseEcho, WW_GEAR_CATALOG);
        expect(findDuplicateSource(draft, WW_GEAR_CATALOG, 'echo', [], [])).toBeUndefined();
    });

    it('findDuplicateSource returns "inventory" when an inventory entry has an identical identity key', () => {
        const draft = mapScannedEchoToGearDraft(baseEcho, WW_GEAR_CATALOG);
        const inventoryEntry = buildEntry(baseEcho);
        expect(findDuplicateSource(draft, WW_GEAR_CATALOG, 'echo', [inventoryEntry], [])).toBe('inventory');
    });

    it('findDuplicateSource returns "scan" when an earlier scan has an identical identity key and inventory does not', () => {
        const draft = mapScannedEchoToGearDraft(baseEcho, WW_GEAR_CATALOG);
        const earlierScanEntry = buildEntry(baseEcho);
        expect(findDuplicateSource(draft, WW_GEAR_CATALOG, 'echo', [], [earlierScanEntry])).toBe('scan');
    });

    it('findDuplicateSource prefers "inventory" over "scan" when both match', () => {
        const draft = mapScannedEchoToGearDraft(baseEcho, WW_GEAR_CATALOG);
        const match = buildEntry(baseEcho);
        expect(findDuplicateSource(draft, WW_GEAR_CATALOG, 'echo', [match], [match])).toBe('inventory');
    });

    it('findDuplicateSource returns undefined for a draft with blocking issues (no set resolved)', () => {
        const unresolvableEcho: ScannedEcho = { ...baseEcho, name: 'Totally Unknown Fodder Name', setName: undefined };
        const draft = mapScannedEchoToGearDraft(unresolvableEcho, WW_GEAR_CATALOG);
        expect(hasBlockingIssues(draft)).toBe(true);
        const inventoryEntry = buildEntry(baseEcho);
        expect(findDuplicateSource(draft, WW_GEAR_CATALOG, 'echo', [inventoryEntry], [])).toBeUndefined();
    });

    it('a different roll of the same set/slot/main is NOT a duplicate', () => {
        const draft = mapScannedEchoToGearDraft(baseEcho, WW_GEAR_CATALOG);
        const differentRollEcho: ScannedEcho = {
            ...baseEcho,
            subStats: baseEcho.subStats.map((s) => (s.type === 'ATK%' ? { ...s, value: 6.4 } : s)),
        };
        const differentRollEntry = buildEntry(differentRollEcho);
        expect(findDuplicateSource(draft, WW_GEAR_CATALOG, 'echo', [differentRollEntry], [])).toBeUndefined();
    });
});
