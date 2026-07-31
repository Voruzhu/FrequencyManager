(global as unknown as { window: unknown }).window = {};

import { fetchCharacterArtUrl } from '../../src/renderer/src/lib/characterArt';

describe('fetchCharacterArtUrl', () => {
    const realFetch = global.fetch;
    afterEach(() => {
        global.fetch = realFetch;
        jest.restoreAllMocks();
    });

    it('returns the resolved CDN URL on a successful lookup for a real mapped character', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ query: { pages: { '123': { imageinfo: [{ url: 'https://static.wikia.nocookie.net/x.png' }] } } } }),
        } as Response);
        const url = await fetchCharacterArtUrl('jinhsi');
        expect(url).toBe('https://static.wikia.nocookie.net/x.png');
    });

    it('returns undefined for a character with no wiki-art mapping, without ever fetching', async () => {
        global.fetch = jest.fn();
        const url = await fetchCharacterArtUrl('some-unmapped-id');
        expect(url).toBeUndefined();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns undefined (never throws) when the fetch fails', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
        const url = await fetchCharacterArtUrl('kaeya');
        expect(url).toBeUndefined();
    });

    it('returns undefined when the response is not ok', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false } as Response);
        const url = await fetchCharacterArtUrl('lisa');
        expect(url).toBeUndefined();
    });

    it('returns undefined when the API responds but the file is missing (no imageinfo)', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ query: { pages: { '-1': { missing: '' } } } }),
        } as Response);
        const url = await fetchCharacterArtUrl('barbara');
        expect(url).toBeUndefined();
    });

    it('caches a successful result — a second call for the same id does not fetch again', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ query: { pages: { '123': { imageinfo: [{ url: 'https://static.wikia.nocookie.net/x.png' }] } } } }),
        } as Response);
        await fetchCharacterArtUrl('jiyan');
        await fetchCharacterArtUrl('jiyan');
        expect(global.fetch).toHaveBeenCalledTimes(1);
    });
});
