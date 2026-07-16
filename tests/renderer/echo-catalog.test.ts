import { WW_ECHO_NAME_TO_SET, WW_ECHO_AMBIGUOUS_SETS, WW_ECHO_COSTS, WW_ECHO_CATALOG } from '../../shared/game-data/echo-set-names';

describe('WW_ECHO_CATALOG — the Cost -> Set -> Echo picker\'s data source', () => {
    it('has an entry for every name in both the unambiguous and ambiguous set maps', () => {
        const expectedNames = new Set([...Object.keys(WW_ECHO_NAME_TO_SET), ...Object.keys(WW_ECHO_AMBIGUOUS_SETS)]);
        const catalogNames = new Set(WW_ECHO_CATALOG.map((e) => e.name));
        expect(catalogNames).toEqual(expectedNames);
    });

    it('every entry has a real name, at least one real cost, and at least one real set — nothing fabricated/empty', () => {
        for (const e of WW_ECHO_CATALOG) {
            expect(e.name.trim().length).toBeGreaterThan(0);
            expect(e.costs.length).toBeGreaterThan(0);
            expect(e.sets.length).toBeGreaterThan(0);
            for (const c of e.costs) expect([1, 3, 4]).toContain(c);
        }
    });

    it('every echo name maps to a set/cost combo consistent with its own source maps', () => {
        for (const e of WW_ECHO_CATALOG) {
            const expectedSets = WW_ECHO_NAME_TO_SET[e.name] ? [WW_ECHO_NAME_TO_SET[e.name]] : WW_ECHO_AMBIGUOUS_SETS[e.name];
            expect(e.sets).toEqual(expectedSets);
            expect(e.costs).toEqual(WW_ECHO_COSTS[e.name]);
        }
    });

    it('a known single-set, single-cost boss echo (Thundering Mephis) resolves exactly', () => {
        const entry = WW_ECHO_CATALOG.find((e) => e.name === 'Thundering Mephis');
        expect(entry).toEqual({ name: 'Thundering Mephis', costs: [4], sets: ['Void Thunder'] });
    });

    it('the two known cost-ambiguous names carry both real costs, not a guessed single value', () => {
        expect(WW_ECHO_COSTS['Flautist']).toEqual([1, 3]);
        expect(WW_ECHO_COSTS['Gulpuff']).toEqual([1, 4]);
    });
});
