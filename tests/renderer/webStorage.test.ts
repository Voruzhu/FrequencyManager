/**
 * @jest-environment jsdom
 */
import { webStorageGetAll, webStorageSet } from '../../src/renderer/src/lib/userStorage';

describe('webStorageGetAll / webStorageSet', () => {
    beforeEach(() => localStorage.clear());

    it('reads back every key localStorage holds', () => {
        localStorage.setItem('fm-build-card-prefs', '{"state":{"customImages":{}},"version":0}');
        localStorage.setItem('fm-inventory', '{"state":{"gear":[]},"version":0}');
        const all = webStorageGetAll();
        expect(all['fm-build-card-prefs']).toBe('{"state":{"customImages":{}},"version":0}');
        expect(all['fm-inventory']).toBe('{"state":{"gear":[]},"version":0}');
        expect(Object.keys(all)).toHaveLength(2);
    });

    it('round-trips a zustand-shaped string value unchanged', () => {
        const jsonString = '{"state":{"lastAccentColor":"#ff00ff"},"version":0}';
        webStorageSet('fm-build-card-prefs', jsonString);
        expect(localStorage.getItem('fm-build-card-prefs')).toBe(jsonString);
        expect(webStorageGetAll()['fm-build-card-prefs']).toBe(jsonString);
    });

    it('stringifies a non-string value (the pre-import snapshot object)', () => {
        const snapshot = { 'fm-inventory': '{"state":{}}', 'fm-loadouts': '{"state":{}}' };
        webStorageSet('__fm_pre_import_snapshot__', snapshot);
        const stored = localStorage.getItem('__fm_pre_import_snapshot__');
        expect(stored).toBe(JSON.stringify(snapshot));
        expect(JSON.parse(webStorageGetAll()['__fm_pre_import_snapshot__'])).toEqual(snapshot);
    });

    it('supports a full export -> clear -> import round trip', () => {
        webStorageSet('fm-build-card-prefs', '{"state":{"lastAccentColor":"#123456"},"version":0}');
        webStorageSet('fm-inventory', '{"state":{"gear":["a","b"]},"version":0}');
        const exported = webStorageGetAll();

        localStorage.clear();
        expect(Object.keys(webStorageGetAll())).toHaveLength(0);

        for (const [k, v] of Object.entries(exported)) webStorageSet(k, v);
        const restored = webStorageGetAll();
        expect(restored).toEqual(exported);
    });
});
