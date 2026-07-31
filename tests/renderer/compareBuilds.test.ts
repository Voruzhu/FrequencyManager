import { resolveAltLoadout, KEEP_CURRENT } from '../../src/renderer/src/lib/compareBuilds';
import type { CharacterLoadout } from '../../src/renderer/src/stores/loadoutStore';

const current: CharacterLoadout = { weaponId: 'w1', weaponRefine: 3, gearIds: ['g1', 'g2'] };

describe('resolveAltLoadout', () => {
    it('returns the current loadout unchanged when both alternates are "keep current"', () => {
        expect(resolveAltLoadout(current, KEEP_CURRENT, undefined)).toBe(current);
    });

    it('swaps in a saved loadout\'s gear when picked, keeping its own weapon', () => {
        const saved: CharacterLoadout = { weaponId: 'w2', weaponRefine: 1, gearIds: ['g9'] };
        expect(resolveAltLoadout(current, KEEP_CURRENT, saved)).toBe(saved);
    });

    it('overrides just the weapon (resetting refine to R1) when a saved loadout has the SAME weapon already equipped, gear untouched', () => {
        const result = resolveAltLoadout(current, 'w3', undefined);
        expect(result).toMatchObject({ weaponId: 'w3', weaponRefine: 1, gearIds: ['g1', 'g2'] });
    });

    it('does NOT reset refine when the "alternate" weapon is actually the same weapon already on the base loadout', () => {
        expect(resolveAltLoadout(current, 'w1', undefined)).toBe(current);
    });

    it('combines a saved loadout\'s gear with an explicit weapon override on top', () => {
        const saved: CharacterLoadout = { weaponId: 'w2', weaponRefine: 5, gearIds: ['g9'] };
        const result = resolveAltLoadout(current, 'w3', saved);
        expect(result).toMatchObject({ weaponId: 'w3', weaponRefine: 1, gearIds: ['g9'] });
    });
});
