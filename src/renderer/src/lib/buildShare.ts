import { encodeShareCode, decodeShareCode, type DecodeResult } from '@shared/shareCode';
import type { GearData, WeaponData } from '../data/gameData';
import type { CharacterEntry, BuffEntry } from '@shared/types/game-bundle';

/** A read-only snapshot of one character's loadout — enough to render a full preview, not enough (nor intended) to merge into the importer's own inventory. */
export interface BuildSharePayload {
    gameId: string;
    characterId: string;
    characterName: string;
    weaponId?: string;
    weaponName?: string;
    weaponRefine?: number;
    gear: Array<{
        name: string;
        setName: string;
        rarity: number;
        cost?: number;
        slot?: string;
        mainStat: { key: string; label: string; value: number };
        subStats: Array<{ key: string; label: string; value: number }>;
    }>;
    buffs: Array<{ name: string; source: string; stat: string; value: number; appliesTo?: string[] }>;
}

export function buildSharePayload(
    gameId: string,
    character: CharacterEntry,
    weapon: WeaponData | undefined,
    weaponRefine: number | undefined,
    gear: GearData[],
    buffs: BuffEntry[],
): BuildSharePayload {
    return {
        gameId,
        characterId: character.id,
        characterName: character.name,
        weaponId: weapon?.id,
        weaponName: weapon?.name,
        weaponRefine,
        gear: gear.map((g) => ({
            name: g.name, setName: g.setName, rarity: g.rarity, cost: g.cost, slot: g.slot,
            mainStat: g.mainStat, subStats: g.subStats,
        })),
        buffs: buffs.map((b) => ({ name: b.name, source: b.source, stat: b.stat, value: b.value, appliesTo: b.appliesTo })),
    };
}

export function encodeBuildShareCode(payload: BuildSharePayload): string {
    return encodeShareCode('build', payload);
}

export function decodeBuildShareCode(code: string): DecodeResult<BuildSharePayload> {
    return decodeShareCode<BuildSharePayload>(code, 'build');
}

/** Reconstructs comparable `GearEntry` objects from a share payload's reduced gear
 * shape — synthesized ids/kind are structural only (uniqueness for set-bonus
 * counting), never real inventory items. */
export function payloadGearToEntries(payload: BuildSharePayload, kind: 'echo' | 'artifact'): GearData[] {
    return payload.gear.map((g, i) => ({
        kind, id: `shared-${i}`, name: g.name, setName: g.setName, rarity: g.rarity, cost: g.cost, slot: g.slot,
        mainStat: g.mainStat, subStats: g.subStats,
    }));
}
