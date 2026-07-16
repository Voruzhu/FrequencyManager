import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    initExternalGameModules, getGameDefinition, getGameBundle, hasGameDefinition, listInstalledGames,
} from '../../adapters/game-definitions';

// Minimal but real external game module — same shape verified in external-loader.test.ts.
function moduleJson(id: string) {
    return {
        definition: {
            id, displayName: id, description: 'test', version: '1.0.0',
            equipment: { slotLabel: 'Gear', slotLabelPlural: 'Gears', maxSubStats: 4, maxLevel: 20, allowedMainStatTypes: ['ATK'], allowedCosts: [] },
            character: { elements: ['Pyro'], weapons: ['Sword'], maxLevel: 90, maxAscension: 1, ascensionBonus: [{ atk: 0, hp: 0, def: 0 }, { atk: 0.1, hp: 0.1, def: 0.1 }] },
            combat: { actions: [{ id: 'basicAttack', label: 'Basic Attack', multiplier: 1.0, energy: 0, duration: 1.0 }], defaultRotationLength: 20 },
            ocr: { namePattern: '^([A-Z][a-z]+)', costPattern: '', mainStatPattern: '(ATK)[:\\s]+([\\d.]+)', subStatPattern: '(ATK)[:\\s]+([\\d.]+)', setNames: [] },
            sets: [],
            uiOptions: { characters: [{ value: 'hero', label: 'Hero' }], setNames: [], weaponTypes: ['Sword'], elements: ['Pyro'] },
        },
        charDB: [{ id: 'hero', name: 'Hero', element: 'Pyro', weapon: 'Sword', rarity: 5, baseAtk: 100, baseHp: 1000, baseDef: 100, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100 }],
        weaponDB: [{ id: 'sword1', name: 'Test Sword', weaponType: 'Sword', rarity: 4, baseAtk: 40, secondaryStat: 'CRIT Rate', secondaryValue: 5 }],
        supplements: {
            gearRanges: { rarities: [4, 5], subStatsCanRepeatMain: false, slots: [], mains: [], subs: [] },
            statCatalog: [{ key: 'atk', label: 'ATK' }],
            enemies: [], buffs: { basic: [], character: [] }, passives: [],
        },
        buildOptions: {
            defaultElement: 'Pyro', defaultWeapon: 'Sword', hasElementalMastery: false, supportsReactions: false,
            setPieces: 4, partyTeammates: 3, starterCharacterId: 'hero', sequenceLabel: 'Constellation', sequenceMax: 6,
        },
    };
}

describe('initExternalGameModules — the app ships with zero games compiled in; every game (including the official Wuthering Waves/Genshin Impact packages) loads this way', () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-registry-test-'));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('registers a valid game module so it becomes queryable', () => {
        fs.writeFileSync(path.join(dir, 'my-game.json'), JSON.stringify(moduleJson('a-real-game')));
        const result = initExternalGameModules(dir);
        expect(result.loaded).toEqual(['a-real-game']);
        expect(result.errors).toEqual([]);

        expect(hasGameDefinition('a-real-game')).toBe(true);
        expect(getGameDefinition('a-real-game')?.displayName).toBe('a-real-game');
        expect(getGameBundle('a-real-game')?.characters).toHaveLength(1);
        expect(listInstalledGames().some((g) => g.id === 'a-real-game')).toBe(true);
    });

    it('rejects a second module whose id collides with an already-loaded one, and never overrides the first', () => {
        fs.writeFileSync(path.join(dir, 'first.json'), JSON.stringify(moduleJson('duplicate-id-game')));
        const first = initExternalGameModules(dir);
        expect(first.loaded).toEqual(['duplicate-id-game']);

        // A second directory, loaded afterward, tries to register the SAME id.
        const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-registry-test2-'));
        try {
            fs.writeFileSync(path.join(dir2, 'imposter.json'), JSON.stringify({ ...moduleJson('duplicate-id-game'), definition: { ...moduleJson('duplicate-id-game').definition, displayName: 'Imposter' } }));
            const second = initExternalGameModules(dir2);
            expect(second.loaded).toEqual([]);
            expect(second.errors).toHaveLength(1);
            expect(second.errors[0].error).toMatch(/already registered/i);

            // The FIRST registration is untouched.
            expect(getGameDefinition('duplicate-id-game')?.displayName).toBe('duplicate-id-game');
        } finally {
            fs.rmSync(dir2, { recursive: true, force: true });
        }
    });

    it('an unknown id resolves to nothing — no games are assumed to exist', () => {
        expect(hasGameDefinition('totally-made-up-game-' + Date.now())).toBe(false);
    });
});
