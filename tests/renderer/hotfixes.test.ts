(global as unknown as { window: unknown }).window = {};

import { fetchHotfixes, applyHotfixes } from '../../src/renderer/src/lib/hotfixes';
import type { GameBundle } from '../../shared/types/game-bundle';

describe('fetchHotfixes', () => {
    const realFetch = global.fetch;
    afterEach(() => {
        global.fetch = realFetch;
        jest.restoreAllMocks();
    });

    it('returns the manifest\'s patches array on a successful fetch', async () => {
        const manifest = { schemaVersion: '1.0', generatedAt: '2026-08-01', patches: [{ id: 'p1', characterId: 'yunjin', stat: 'atk', value: 999, note: 'test' }] };
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => manifest } as Response);
        const result = await fetchHotfixes('genshin-impact');
        expect(result).toEqual(manifest.patches);
    });

    it('falls back to the bundled snapshot when fetch throws (e.g. offline) and no cache exists', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
        const result = await fetchHotfixes('genshin-impact');
        expect(Array.isArray(result)).toBe(true); // bundled snapshot ships empty — shape is what's under test
    });

    it('falls back to the bundled snapshot when the response is not ok', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
        const result = await fetchHotfixes('wuthering-waves');
        expect(Array.isArray(result)).toBe(true);
    });

    it('falls back to the bundled snapshot when the JSON is malformed (missing patches array)', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ patches: 'not-an-array' }) } as Response);
        const result = await fetchHotfixes('wuthering-waves');
        expect(Array.isArray(result)).toBe(true);
    });
});

describe('applyHotfixes', () => {
    function bundle(): GameBundle {
        return {
            id: 'genshin-impact',
            statCatalog: [],
            characters: [
                { kind: 'character', id: 'yunjin', name: 'Yunjin', element: 'Geo', weaponType: 'Polearm', rarity: 4, stats: { atk: 727, def: 799 }, skills: [], equipped: { gearIds: [] } },
                { kind: 'character', id: 'xianyun', name: 'Xianyun', element: 'Anemo', weaponType: 'Catalyst', rarity: 5, stats: { atk: 801 }, skills: [], equipped: { gearIds: [] } },
            ],
        } as unknown as GameBundle;
    }

    it('returns the SAME bundle reference when there are no matching patches', () => {
        const b = bundle();
        expect(applyHotfixes(b, [])).toBe(b);
        expect(applyHotfixes(b, [{ id: 'p1', characterId: 'nonexistent', stat: 'atk', value: 1, note: '' }])).toBe(b);
    });

    it('overrides only the targeted character\'s targeted stat, leaving siblings untouched', () => {
        const b = bundle();
        const patched = applyHotfixes(b, [{ id: 'p1', characterId: 'yunjin', stat: 'atk', value: 750, note: 'corrected' }]);
        expect(patched.characters.find((c) => c.id === 'yunjin')?.stats.atk).toBe(750);
        expect(patched.characters.find((c) => c.id === 'yunjin')?.stats.def).toBe(799); // untouched sibling stat
        expect(patched.characters.find((c) => c.id === 'xianyun')?.stats.atk).toBe(801); // untouched sibling character
        expect(patched.characters.find((c) => c.id === 'xianyun')).toBe(b.characters[1]); // same reference, no unnecessary clone
    });

    it('applies multiple patches targeting the same character', () => {
        const b = bundle();
        const patched = applyHotfixes(b, [
            { id: 'p1', characterId: 'yunjin', stat: 'atk', value: 750, note: '' },
            { id: 'p2', characterId: 'yunjin', stat: 'def', value: 820, note: '' },
        ]);
        const c = patched.characters.find((c) => c.id === 'yunjin');
        expect(c?.stats).toMatchObject({ atk: 750, def: 820 });
    });
});
