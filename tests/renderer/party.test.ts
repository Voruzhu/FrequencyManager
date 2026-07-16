import { activeSetName, enabledPartyBuffs, type PartyEffect } from '../../src/renderer/src/lib/party';
import type { GearEntry } from '../../shared/types/game-bundle';

const setBonuses = [
    { name: 'Void Thunder', pieces: 2, buffs: [], twoPieceBuffs: [], fullSetOnlyBuffs: [] },
    { name: 'Havoc Eclipse', pieces: 5, buffs: [], twoPieceBuffs: [], fullSetOnlyBuffs: [] },
];

let seq = 0;
function gear(overrides: Partial<GearEntry>): GearEntry {
    return {
        kind: 'echo',
        id: `g${++seq}`,
        name: 'Void Thunder',
        setName: 'Void Thunder',
        rarity: 5,
        mainStat: { key: 'atk', label: 'ATK', value: 100 },
        subStats: [],
        ...overrides,
    };
}

describe('activeSetName — real WuWa mechanic: same-identity echoes don\'t double-count toward set pieces', () => {
    it('two DIFFERENT identified echoes of the same set both count (real requirement met)', () => {
        const equipped = [
            gear({ name: 'Thundering Mephis', setName: 'Void Thunder' }),
            gear({ name: 'Aero Predator', setName: 'Void Thunder' }),
        ];
        expect(activeSetName(equipped, { setBonuses })).toBe('Void Thunder');
    });

    it('two echoes with the SAME identified name only count ONCE — set requirement not met', () => {
        const equipped = [
            gear({ name: 'Thundering Mephis', setName: 'Void Thunder' }),
            gear({ name: 'Thundering Mephis', setName: 'Void Thunder' }),
        ];
        expect(activeSetName(equipped, { setBonuses })).toBeUndefined();
    });

    it('a base echo and its "Nightmare: " variant are genuinely different identities and both count', () => {
        const equipped = [
            gear({ name: 'Thundering Mephis', setName: 'Void Thunder' }),
            gear({ name: 'Nightmare: Thundering Mephis', setName: 'Void Thunder' }),
        ];
        expect(activeSetName(equipped, { setBonuses })).toBe('Void Thunder');
    });

    it('gear with no specific identity resolved (name === setName) each still count individually, since duplicates are unconfirmed', () => {
        const equipped = [
            gear({ name: 'Void Thunder', setName: 'Void Thunder' }),
            gear({ name: 'Void Thunder', setName: 'Void Thunder' }),
        ];
        expect(activeSetName(equipped, { setBonuses })).toBe('Void Thunder');
    });

    it('a duplicate-identity pair still leaves room for OTHER distinct pieces of the same set to complete it', () => {
        // 2 copies of "Thundering Mephis" (counts once) + 1 "Aero Predator"
        // (distinct) = 2 real pieces toward the 2pc Void Thunder threshold.
        const equipped = [
            gear({ name: 'Thundering Mephis', setName: 'Void Thunder' }),
            gear({ name: 'Thundering Mephis', setName: 'Void Thunder' }),
            gear({ name: 'Aero Predator', setName: 'Void Thunder' }),
        ];
        expect(activeSetName(equipped, { setBonuses })).toBe('Void Thunder');
    });
});

describe('activeSetName — character-exclusive collab sets (e.g. Shadow of Shattered Dreams, Rebecca/Lucy-only)', () => {
    const restrictedSetBonuses = [
        { name: 'Shadow of Shattered Dreams', pieces: 1, buffs: [], twoPieceBuffs: [], fullSetOnlyBuffs: [], restrictedToCharacters: ['Rebecca', 'Lucy'] },
    ];

    it('a single equipped piece satisfies the real 1pc threshold for an eligible character', () => {
        const equipped = [gear({ name: 'Reminiscence - Nightmare: Adam Smasher', setName: 'Shadow of Shattered Dreams' })];
        expect(activeSetName(equipped, { setBonuses: restrictedSetBonuses }, 'Lucy')).toBe('Shadow of Shattered Dreams');
        expect(activeSetName(equipped, { setBonuses: restrictedSetBonuses }, 'Rebecca')).toBe('Shadow of Shattered Dreams');
    });

    it('never activates for a character outside the restricted roster, even at full piece count', () => {
        const equipped = [gear({ name: 'Reminiscence - Nightmare: Adam Smasher', setName: 'Shadow of Shattered Dreams' })];
        expect(activeSetName(equipped, { setBonuses: restrictedSetBonuses }, 'Encore')).toBeUndefined();
        expect(activeSetName(equipped, { setBonuses: restrictedSetBonuses })).toBeUndefined();
    });
});

describe('enabledPartyBuffs — requiresTargetStatus gating (real Cartethyia/Hiyuki/Phoebe S2 buffs)', () => {
    const effectWith = (requiresTargetStatus?: string[]): PartyEffect => ({
        id: 'kit-active-cb-ww-test', name: 'Test buff', source: 'Test', category: 'kit',
        buffs: [{ stat: 'elemDmg', value: 20, requiresTargetStatus }],
    });

    it('a buff with no requiresTargetStatus is unaffected by targetStatuses entirely', () => {
        const out = enabledPartyBuffs([effectWith(undefined)], [], { frazzle: false, chafe: false });
        expect(out).toHaveLength(1);
    });

    it('is included when the required status is toggled on', () => {
        const out = enabledPartyBuffs([effectWith(['chafe'])], [], { chafe: true });
        expect(out).toHaveLength(1);
    });

    it('is dropped when the required status is toggled off (Hiyuki: needs Glacio Chafe)', () => {
        const out = enabledPartyBuffs([effectWith(['chafe'])], [], { chafe: false });
        expect(out).toHaveLength(0);
    });

    it('OR-matches multiple listed statuses — any one being on is enough (Cartethyia: any Negative Status)', () => {
        const allOff = { frazzle: false, erosion: false, chafe: false, flare: false, bane: false, fusionburst: false };
        expect(enabledPartyBuffs([effectWith(['frazzle', 'erosion', 'chafe'])], [], allOff)).toHaveLength(0);
        expect(enabledPartyBuffs([effectWith(['frazzle', 'erosion', 'chafe'])], [], { ...allOff, erosion: true })).toHaveLength(1);
    });

    it('defaults a missing status key, or a missing targetStatuses map entirely, to true (assume active, same convention as the reference row)', () => {
        expect(enabledPartyBuffs([effectWith(['chafe'])], [], {})).toHaveLength(1);
        expect(enabledPartyBuffs([effectWith(['chafe'])], [])).toHaveLength(1);
    });

    it('the manual disabled-effect override still applies independently of target status', () => {
        const out = enabledPartyBuffs([effectWith(['chafe'])], ['kit-active-cb-ww-test'], { chafe: true });
        expect(out).toHaveLength(0);
    });
});
