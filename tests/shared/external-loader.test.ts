import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadExternalGameBundles, validateExternalGameModule, isRegexSafe, type ExternalGameModuleFile } from '../../shared/game-data/external-loader';

function minimalModule(overrides: Partial<ExternalGameModuleFile> = {}): ExternalGameModuleFile {
    return {
        definition: {
            id: 'my-community-game',
            displayName: 'My Community Game',
            description: 'A test game',
            version: '1.0.0',
            equipment: {
                slotLabel: 'Gear', slotLabelPlural: 'Gears',
                maxSubStats: 4, maxLevel: 20,
                allowedMainStatTypes: ['ATK', 'HP', 'DEF'],
                allowedCosts: [],
            },
            character: {
                elements: ['Pyro'], weapons: ['Sword'],
                maxLevel: 90, maxAscension: 1,
                ascensionBonus: [{ atk: 0, hp: 0, def: 0 }, { atk: 0.1, hp: 0.1, def: 0.1 }],
            },
            combat: { actions: [{ id: 'basicAttack', label: 'Basic Attack', multiplier: 1.0, energy: 0, duration: 1.0 }], defaultRotationLength: 20 },
            ocr: {
                namePattern: '^([A-Z][a-z]+)', costPattern: '', mainStatPattern: '(ATK)[:\\s]+([\\d.]+)',
                subStatPattern: '(ATK)[:\\s]+([\\d.]+)', setNames: ['Test Set'],
            },
            sets: [{ name: 'Test Set', bonuses: { atkPercent: 10 } }],
            uiOptions: {
                characters: [{ value: 'hero', label: 'Hero' }],
                setNames: ['Test Set'],
                weaponTypes: ['Sword'],
                elements: ['Pyro'],
            },
            ...(overrides.definition ?? {}),
        } as ExternalGameModuleFile['definition'],
        charDB: overrides.charDB ?? [{
            id: 'hero', name: 'Hero', element: 'Pyro', weapon: 'Sword', rarity: 5,
            baseAtk: 100, baseHp: 1000, baseDef: 100, baseCritRate: 5, baseCritDmg: 50, baseEnergyRegen: 100,
        }],
        weaponDB: overrides.weaponDB ?? [{
            id: 'sword1', name: 'Test Sword', weaponType: 'Sword', rarity: 4,
            baseAtk: 40, secondaryStat: 'CRIT Rate', secondaryValue: 5,
        }],
        supplements: overrides.supplements ?? {
            gearRanges: { rarities: [4, 5], subStatsCanRepeatMain: false, slots: [], mains: [], subs: [] },
            statCatalog: [{ key: 'atk', label: 'ATK' }, { key: 'critRate', label: 'Crit Rate', percent: true }],
            enemies: [],
            buffs: { basic: [], character: [] },
            passives: [],
        },
        buildOptions: overrides.buildOptions ?? {
            defaultElement: 'Pyro', defaultWeapon: 'Sword', hasElementalMastery: false, supportsReactions: false,
            setPieces: 4, partyTeammates: 3, starterCharacterId: 'hero', sequenceLabel: 'Constellation', sequenceMax: 6,
        },
    };
}

describe('isRegexSafe', () => {
    it('accepts an ordinary pattern', () => {
        expect(isRegexSafe('^([A-Z][a-z]+)')).toBe(true);
    });

    it('rejects nested-quantifier catastrophic-backtracking shapes', () => {
        expect(isRegexSafe('(a+)+$')).toBe(false);
        expect(isRegexSafe('(a*)*$')).toBe(false);
        expect(isRegexSafe('([a-z]+)+$')).toBe(false);
    });

    it('rejects the same nested-quantifier shape wrapped in a named capture group (regression: bypassed the old check entirely)', () => {
        expect(isRegexSafe('(?<x>a+)+$')).toBe(false);
    });

    it('rejects the same nested-quantifier shape wrapped in a lookaround (regression: bypassed the old check entirely)', () => {
        expect(isRegexSafe('(?=a+)+$')).toBe(false);
        expect(isRegexSafe('(?!a+)+$')).toBe(false);
        expect(isRegexSafe('(?<=a+)+$')).toBe(false);
        expect(isRegexSafe('(?<!a+)+$')).toBe(false);
    });

    it('does NOT flag a safe compound group that merely ends in a quantifier (regression: WuWa\'s real namePattern, which handles names like "Xiangli Yao"/"Rover: Spectro")', () => {
        // A REQUIRED leading punctuation character before the repeated letters
        // means each iteration's start is unambiguous — not the classic
        // same-content-overlap shape (a+)+ is dangerous for.
        expect(isRegexSafe("(?:['-][a-zA-Z]+)*")).toBe(true);
        expect(isRegexSafe('^(?:Phantom\\s*:?\\s*)?([A-Z][a-z]+(?:[\'-][a-zA-Z]+)*(?:\\s+[A-Z][a-z]+)*)')).toBe(true);
    });

    it('rejects a pattern over the length cap', () => {
        expect(isRegexSafe('a'.repeat(600))).toBe(false);
    });

    it('rejects a pattern that fails to compile', () => {
        expect(isRegexSafe('(unclosed')).toBe(false);
    });
});

describe('validateExternalGameModule', () => {
    it('accepts a well-formed module', () => {
        const result = validateExternalGameModule(minimalModule());
        expect(result.ok).toBe(true);
    });

    it('rejects a module missing a required scalar field', () => {
        const bad = minimalModule();
        // @ts-expect-error intentionally malformed for the test
        delete bad.charDB[0].baseAtk;
        const result = validateExternalGameModule(bad);
        expect(result.ok).toBe(false);
    });

    it('rejects a non-object payload', () => {
        expect(validateExternalGameModule('not an object').ok).toBe(false);
        expect(validateExternalGameModule(null).ok).toBe(false);
    });
});

describe('loadExternalGameBundles', () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-game-modules-'));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('returns empty (never throws) for a directory that does not exist', () => {
        const result = loadExternalGameBundles(path.join(dir, 'does-not-exist'));
        expect(result.loaded).toEqual([]);
        expect(result.errors).toEqual([]);
    });

    it('loads a valid module into a real GameBundle', () => {
        fs.writeFileSync(path.join(dir, 'my-game.json'), JSON.stringify(minimalModule()));
        const result = loadExternalGameBundles(dir);
        expect(result.errors).toEqual([]);
        expect(result.loaded).toHaveLength(1);
        expect(result.loaded[0].definition.id).toBe('my-community-game');
        expect(result.loaded[0].bundle.characters).toHaveLength(1);
        expect(result.loaded[0].bundle.characters[0].name).toBe('Hero');
        expect(result.loaded[0].sourceFile).toBe('my-game.json');
    });

    it('reports invalid JSON as a per-file error without throwing', () => {
        fs.writeFileSync(path.join(dir, 'broken.json'), '{ not valid json');
        const result = loadExternalGameBundles(dir);
        expect(result.loaded).toEqual([]);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].file).toBe('broken.json');
    });

    it('reports a schema violation as a per-file error', () => {
        fs.writeFileSync(path.join(dir, 'bad-schema.json'), JSON.stringify({ definition: {} }));
        const result = loadExternalGameBundles(dir);
        expect(result.loaded).toEqual([]);
        expect(result.errors).toHaveLength(1);
    });

    it('rejects a module whose OCR pattern is an unsafe catastrophic-backtracking regex', () => {
        const mod = minimalModule();
        mod.definition.ocr.namePattern = '(a+)+$';
        fs.writeFileSync(path.join(dir, 'unsafe.json'), JSON.stringify(mod));
        const result = loadExternalGameBundles(dir);
        expect(result.loaded).toEqual([]);
        expect(result.errors[0].error).toMatch(/unsafe/i);
    });

    it('one broken file does not block another valid file in the same directory', () => {
        fs.writeFileSync(path.join(dir, 'broken.json'), '{ not valid json');
        fs.writeFileSync(path.join(dir, 'good.json'), JSON.stringify(minimalModule()));
        const result = loadExternalGameBundles(dir);
        expect(result.loaded).toHaveLength(1);
        expect(result.errors).toHaveLength(1);
    });

    it('ignores non-JSON files in the directory', () => {
        fs.writeFileSync(path.join(dir, 'readme.txt'), 'not a game module');
        const result = loadExternalGameBundles(dir);
        expect(result.loaded).toEqual([]);
        expect(result.errors).toEqual([]);
    });

    describe('packaged subdirectories (official-style, JSON + icons/ folder)', () => {
        it('loads a module from a subdirectory and records its icons/ folder path', () => {
            const pkgDir = path.join(dir, 'my-official-game');
            fs.mkdirSync(path.join(pkgDir, 'icons'), { recursive: true });
            fs.writeFileSync(path.join(pkgDir, 'icons', 'hero.png'), 'fake-png-bytes');
            const mod = minimalModule({ definition: { id: 'my-official-game' } as ExternalGameModuleFile['definition'] });
            fs.writeFileSync(path.join(pkgDir, 'module.json'), JSON.stringify(mod));

            const result = loadExternalGameBundles(dir);
            expect(result.errors).toEqual([]);
            expect(result.loaded).toHaveLength(1);
            expect(result.loaded[0].definition.id).toBe('my-official-game');
            expect(result.loaded[0].sourceFile).toBe('my-official-game/module.json');
            expect(result.loaded[0].iconsDir).toBe(path.join(pkgDir, 'icons'));
        });

        it('loads a subdirectory module with no icons/ folder just fine (iconsDir left undefined)', () => {
            const pkgDir = path.join(dir, 'no-icons-package');
            fs.mkdirSync(pkgDir, { recursive: true });
            const mod = minimalModule({ definition: { id: 'no-icons-package' } as ExternalGameModuleFile['definition'] });
            fs.writeFileSync(path.join(pkgDir, 'module.json'), JSON.stringify(mod));

            const result = loadExternalGameBundles(dir);
            expect(result.errors).toEqual([]);
            expect(result.loaded).toHaveLength(1);
            expect(result.loaded[0].iconsDir).toBeUndefined();
        });

        it('errors (does not crash) when a subdirectory contains more than one JSON file', () => {
            const pkgDir = path.join(dir, 'ambiguous-package');
            fs.mkdirSync(pkgDir, { recursive: true });
            fs.writeFileSync(path.join(pkgDir, 'a.json'), JSON.stringify(minimalModule()));
            fs.writeFileSync(path.join(pkgDir, 'b.json'), JSON.stringify(minimalModule()));

            const result = loadExternalGameBundles(dir);
            expect(result.loaded).toEqual([]);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].error).toMatch(/exactly one/i);
        });

        it('silently skips a subdirectory with no JSON file at all (not a game package)', () => {
            const unrelatedDir = path.join(dir, 'not-a-game-package');
            fs.mkdirSync(unrelatedDir, { recursive: true });
            fs.writeFileSync(path.join(unrelatedDir, 'notes.txt'), 'unrelated folder');

            const result = loadExternalGameBundles(dir);
            expect(result.loaded).toEqual([]);
            expect(result.errors).toEqual([]);
        });

        it('loose files and packaged subdirectories coexist in the same game-modules directory', () => {
            fs.writeFileSync(path.join(dir, 'loose.json'), JSON.stringify(minimalModule({ definition: { id: 'loose-game' } as ExternalGameModuleFile['definition'] })));
            const pkgDir = path.join(dir, 'packaged-game');
            fs.mkdirSync(path.join(pkgDir, 'icons'), { recursive: true });
            fs.writeFileSync(path.join(pkgDir, 'module.json'), JSON.stringify(minimalModule({ definition: { id: 'packaged-game' } as ExternalGameModuleFile['definition'] })));

            const result = loadExternalGameBundles(dir);
            expect(result.errors).toEqual([]);
            const ids = result.loaded.map((g) => g.definition.id).sort();
            expect(ids).toEqual(['loose-game', 'packaged-game']);
            const packaged = result.loaded.find((g) => g.definition.id === 'packaged-game');
            expect(packaged?.iconsDir).toBeDefined();
            const loose = result.loaded.find((g) => g.definition.id === 'loose-game');
            expect(loose?.iconsDir).toBeUndefined();
        });
    });
});
