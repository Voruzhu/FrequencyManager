import { buildSharePayload, encodeBuildShareCode, decodeBuildShareCode, payloadGearToEntries } from '../../src/renderer/src/lib/buildShare';
import type { CharacterEntry } from '../../shared/types/game-bundle';

function char(): CharacterEntry {
    return {
        kind: 'character', id: 'yelan', name: 'Yelan', element: 'Hydro', weaponType: 'Bow', rarity: 5,
        stats: { atk: 1000, hp: 10000, def: 500 },
        skills: [],
        equipped: { gearIds: [] },
    };
}

describe('buildSharePayload / encodeBuildShareCode / decodeBuildShareCode', () => {
    it('captures character, weapon, gear (by value, not id) and buffs', () => {
        const payload = buildSharePayload(
            'genshin-impact',
            char(),
            { kind: 'weapon', id: 'aqua-simulacra', name: 'Aqua Simulacra', rarity: 5, weaponType: 'Bow', baseAtk: 674, secondaryStat: 'critDmg', secondaryValue: 44.1 },
            5,
            [{ kind: 'artifact', id: 'g1', name: 'Marechaussee Hunter', setName: 'Marechaussee Hunter', rarity: 5, slot: 'flower', mainStat: { key: 'hp', label: 'HP', value: 4780 }, subStats: [{ key: 'critRate', label: 'Crit Rate', value: 6.6 }] }],
            [{ id: 'b1', name: 'Custom ATK', source: 'User', stat: 'atkPct', value: 10 }],
        );

        expect(payload).toMatchObject({
            gameId: 'genshin-impact',
            characterId: 'yelan',
            characterName: 'Yelan',
            weaponId: 'aqua-simulacra',
            weaponName: 'Aqua Simulacra',
            weaponRefine: 5,
            gear: [{ name: 'Marechaussee Hunter', setName: 'Marechaussee Hunter', rarity: 5, slot: 'flower' }],
            buffs: [{ name: 'Custom ATK', source: 'User', stat: 'atkPct', value: 10 }],
        });
        // gear/buffs must NOT carry the original owned-item id — recipient doesn't own this piece.
        expect(payload.gear[0]).not.toHaveProperty('id');
        expect(payload.buffs[0]).not.toHaveProperty('id');
    });

    it('round-trips through a code', () => {
        const payload = buildSharePayload('wuthering-waves', char(), undefined, undefined, [], []);
        const code = encodeBuildShareCode(payload);
        expect(code).toMatch(/^FMB1-/);
        expect(decodeBuildShareCode(code)).toEqual({ ok: true, payload });
    });

    it('decodeBuildShareCode rejects a targets code with a clear error', () => {
        const targetsCode = 'FMT1-' + Buffer.from(JSON.stringify({ kind: 'targets', v: 1, payload: [] })).toString('base64');
        const result = decodeBuildShareCode(targetsCode);
        expect(result).toEqual({ ok: false, error: 'This is a targets code, not a build code.' });
    });
});

describe('payloadGearToEntries', () => {
    it('reconstructs comparable GearEntry objects with synthesized (non-colliding) ids', () => {
        const payload = buildSharePayload(
            'wuthering-waves',
            { kind: 'character', id: 'lucy', name: 'Lucy', element: 'Spectro', weaponType: 'Pistols', rarity: 5, stats: { atk: 1000, hp: 10000, def: 500 }, skills: [], equipped: { gearIds: [] } },
            undefined, undefined,
            [{ kind: 'echo', id: 'own-1', name: 'Hecate', setName: 'Shadow', rarity: 5, cost: 4, mainStat: { key: 'critRate', label: 'Crit Rate', value: 22 }, subStats: [] }],
            [],
        );
        const entries = payloadGearToEntries(payload, 'echo');
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ kind: 'echo', name: 'Hecate', setName: 'Shadow', cost: 4 });
        expect(entries[0].id).not.toBe('own-1'); // never reuses the sharer's real inventory id
    });
});
