import type { CharacterLoadout } from '../stores/loadoutStore';

export const KEEP_CURRENT = '__keep_current__';

/** Resolves the "alternate" loadout for CompareBuildsWindow: start from a saved
 * loadout's gear (or the current one, if none picked), then layer an explicit
 * weapon override on top if one was picked. Pure so it's testable without React. */
export function resolveAltLoadout(
    current: CharacterLoadout,
    altWeaponId: string,
    altSavedLoadout: CharacterLoadout | undefined,
): CharacterLoadout {
    const base = altSavedLoadout ?? current;
    if (altWeaponId === KEEP_CURRENT) return base;
    // Swapping to a different weapon than whatever `base` carries — refinement
    // is unknown for a weapon the character doesn't currently have equipped,
    // so default to R1 (same "unset means R1" convention as `weaponRefine`
    // everywhere else — see CharacterLoadout's own doc comment).
    return altWeaponId === base.weaponId ? base : { ...base, weaponId: altWeaponId, weaponRefine: 1 };
}
