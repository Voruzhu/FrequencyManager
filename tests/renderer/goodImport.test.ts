/**
 * @fileoverview Tests for `lib/goodImport.ts` — GOOD-format artifact → GearDraft.
 *
 * Coverage targets:
 *   - A real GOOD artifact record (PascalCase setKey, GOOD's trailing-
 *     underscore percent-stat convention) maps to a complete, buildable
 *     GearDraft with no unresolved issues.
 *   - Set-name matching works purely via normalization (no per-set table) —
 *     multi-word PascalCase set keys still resolve.
 *   - An unrecognized set/slot/main-stat is flagged 'major' (blocks import),
 *     not fabricated.
 *   - A sub-leveled artifact (level < max) is flagged 'minor' (does not block).
 *   - The two catalog stats added alongside this feature (physicalDmg goblet,
 *     healingBonus circlet) resolve correctly, since GOOD data routinely
 *     includes both.
 */
import { mapGoodArtifactToDraft, type GoodArtifact } from '../../src/renderer/src/lib/goodImport';
import { buildGearEntryFromDraft, hasBlockingIssues } from '../../src/renderer/src/lib/ocrMapping';
import { GI_GEAR_CATALOG } from '../../shared/game-data/gear-catalogs';

const baseArtifact: GoodArtifact = {
    setKey: 'GladiatorsFinale',
    slotKey: 'sands',
    level: 20,
    rarity: 5,
    mainStatKey: 'atk_',
    location: 'Albedo',
    lock: true,
    substats: [
        { key: 'critRate_', value: 7.8 },
        { key: 'critDMG_', value: 12.4 },
        { key: 'hp_', value: 5.8 },
        { key: 'enerRech_', value: 6.5 },
    ],
};

describe('mapGoodArtifactToDraft', () => {
    it('maps a real GOOD artifact with no unresolved issues', () => {
        const draft = mapGoodArtifactToDraft(baseArtifact, GI_GEAR_CATALOG);
        expect(hasBlockingIssues(draft)).toBe(false);
        expect(draft.setId).toBe('gladiators-finale');
        expect(draft.slotId).toBe('sands');
        expect(draft.mainKey).toBe('atkPct');
        expect(draft.subs).toEqual([
            { key: 'critRate', value: 7.8 },
            { key: 'critDmg', value: 12.4 },
            { key: 'hpPct', value: 5.8 },
            { key: 'energyRegen', value: 6.5 },
        ]);
    });

    it('builds a complete GearEntry from the resolved draft', () => {
        const draft = mapGoodArtifactToDraft(baseArtifact, GI_GEAR_CATALOG);
        const gear = buildGearEntryFromDraft(draft, GI_GEAR_CATALOG, 'artifact', () => 'test-id');
        expect(gear).not.toBeNull();
        expect(gear!.setName).toBe('Gladiators Finale');
        expect(gear!.slot).toBe('sands');
        expect(gear!.mainStat.key).toBe('atkPct');
        expect(gear!.subStats).toHaveLength(4);
    });

    it('matches a multi-word PascalCase set key via normalization alone', () => {
        const draft = mapGoodArtifactToDraft({ ...baseArtifact, setKey: 'NighttimeWhispersInTheEchoingWoods' }, GI_GEAR_CATALOG);
        expect(draft.setId).toBe('nighttime-whispers-in-the-echoing-woods');
        expect(draft.unresolved.some((u) => u.message.includes('Set'))).toBe(false);
    });

    it('flags an unrecognized set as a blocking (major) issue instead of guessing', () => {
        const draft = mapGoodArtifactToDraft({ ...baseArtifact, setKey: 'TotallyMadeUpSet' }, GI_GEAR_CATALOG);
        expect(hasBlockingIssues(draft)).toBe(true);
        expect(draft.setId).toBeUndefined();
    });

    it('flags an unrecognized slot as blocking', () => {
        const draft = mapGoodArtifactToDraft({ ...baseArtifact, slotKey: 'ring' }, GI_GEAR_CATALOG);
        expect(hasBlockingIssues(draft)).toBe(true);
    });

    it('flags a sub-max-level artifact as a non-blocking (minor) note', () => {
        const draft = mapGoodArtifactToDraft({ ...baseArtifact, level: 12 }, GI_GEAR_CATALOG);
        expect(hasBlockingIssues(draft)).toBe(false);
        expect(draft.unresolved.some((u) => u.severity === 'minor' && u.message.includes('Level 12/20'))).toBe(true);
    });

    it('flags a non-numeric rarity as blocking instead of silently falling through to a 0-value main stat', () => {
        const draft = mapGoodArtifactToDraft({ ...baseArtifact, rarity: Number.NaN }, GI_GEAR_CATALOG);
        expect(hasBlockingIssues(draft)).toBe(true);
        expect(draft.rarity).toBeUndefined();
    });

    it('flags a rarity outside the catalog\'s known values as blocking', () => {
        const draft = mapGoodArtifactToDraft({ ...baseArtifact, rarity: 3 }, GI_GEAR_CATALOG);
        expect(hasBlockingIssues(draft)).toBe(true);
        expect(draft.rarity).toBeUndefined();
    });

    it('drops a non-numeric sub-stat value without blocking the rest', () => {
        const draft = mapGoodArtifactToDraft({ ...baseArtifact, substats: [{ key: 'critRate_', value: Number.NaN }, { key: 'critDMG_', value: 12.4 }] }, GI_GEAR_CATALOG);
        expect(hasBlockingIssues(draft)).toBe(false);
        expect(draft.subs).toEqual([{ key: 'critDmg', value: 12.4 }]);
        expect(draft.unresolved.some((u) => u.severity === 'minor' && u.message.includes('non-numeric value'))).toBe(true);
    });

    it('resolves the physicalDmg goblet main stat added alongside this feature', () => {
        const draft = mapGoodArtifactToDraft({ ...baseArtifact, slotKey: 'goblet', mainStatKey: 'physical_dmg_' }, GI_GEAR_CATALOG);
        expect(hasBlockingIssues(draft)).toBe(false);
        expect(draft.mainKey).toBe('physicalDmg');
    });

    it('resolves the healingBonus circlet main stat added alongside this feature', () => {
        const draft = mapGoodArtifactToDraft({ ...baseArtifact, slotKey: 'circlet', mainStatKey: 'heal_' }, GI_GEAR_CATALOG);
        expect(hasBlockingIssues(draft)).toBe(false);
        expect(draft.mainKey).toBe('healingBonus');
    });

    it('drops an unrecognized sub-stat without blocking the rest', () => {
        const draft = mapGoodArtifactToDraft({ ...baseArtifact, substats: [{ key: 'someMadeUpStat', value: 1 }, { key: 'critRate_', value: 7.8 }] }, GI_GEAR_CATALOG);
        expect(hasBlockingIssues(draft)).toBe(false);
        expect(draft.subs).toEqual([{ key: 'critRate', value: 7.8 }]);
        expect(draft.unresolved.some((u) => u.severity === 'minor' && u.message.includes('someMadeUpStat'))).toBe(true);
    });
});
