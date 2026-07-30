(global as unknown as { window: unknown }).window = {};

import { fetchEndgamePresets } from '../../src/renderer/src/lib/endgamePresets';

describe('fetchEndgamePresets', () => {
    const realFetch = global.fetch;
    afterEach(() => {
        global.fetch = realFetch;
        jest.restoreAllMocks();
    });

    it('returns the manifest\'s presets array on a successful fetch', async () => {
        const manifest = { schemaVersion: '1.0', generatedAt: '2026-08-01', presets: [{ id: 'test-1', category: 'trounce-domain', displayName: 'Test Boss', waves: [{ enemyId: 'dummy' }] }] };
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => manifest } as Response);
        const result = await fetchEndgamePresets('genshin-impact');
        expect(result).toEqual(manifest.presets);
    });

    it('falls back to the bundled snapshot when fetch throws (e.g. offline) and no cache exists', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
        const result = await fetchEndgamePresets('genshin-impact');
        expect(Array.isArray(result)).toBe(true); // bundled snapshot is currently an empty array (Task 2 scope) — shape is what's under test, not content
    });

    it('falls back to the bundled snapshot when the response is not ok', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) } as Response);
        const result = await fetchEndgamePresets('wuthering-waves');
        expect(Array.isArray(result)).toBe(true);
    });

    it('falls back to the bundled snapshot when the JSON is malformed (missing schemaVersion)', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ presets: 'not-an-array' }) } as Response);
        const result = await fetchEndgamePresets('wuthering-waves');
        expect(Array.isArray(result)).toBe(true);
    });
});
