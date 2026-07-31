// iconSrc() (used internally by characterCardArtSrc) references the
// build-time global __APP_VERSION__ (normally injected by vite.web.config.ts)
// on its jsDelivr-CDN branch — define it here so the real function runs
// end-to-end instead of mocking iconSrc away.
(global as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = '9.9.9';

import { characterCardArtSrc } from '../../src/renderer/src/lib/characterArt';

describe('characterCardArtSrc', () => {
    it('resolves a real mapped character to a loadable jsDelivr URL (no Electron bridge in this test env)', () => {
        const url = characterCardArtSrc('wuthering-waves', 'jinhsi');
        expect(url).toContain('icons/characters-card/jinhsi');
        expect(url).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/gh\/.+@v9\.9\.9\/adapters\/game-definitions\/wuthering-waves\//);
    });

    it('resolves a real GI character too', () => {
        const url = characterCardArtSrc('genshin-impact', 'hu_tao');
        expect(url).toContain('icons/characters-card/hu_tao');
    });

    it('returns undefined for a character with no bundled card art', () => {
        expect(characterCardArtSrc('wuthering-waves', 'some-unmapped-id')).toBeUndefined();
    });
});
