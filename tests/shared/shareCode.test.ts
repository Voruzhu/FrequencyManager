import { encodeShareCode, decodeShareCode } from '../../shared/shareCode';

describe('encodeShareCode / decodeShareCode', () => {
    it('round-trips a payload through encode then decode', () => {
        const payload = { characterId: 'yelan', weaponId: 'aqua-simulacra' };
        const code = encodeShareCode('build', payload);
        const result = decodeShareCode<typeof payload>(code, 'build');
        expect(result).toEqual({ ok: true, payload });
    });

    it('prefixes the code by kind so build and targets codes are visibly distinct', () => {
        expect(encodeShareCode('build', {})).toMatch(/^FMB1-/);
        expect(encodeShareCode('targets', {})).toMatch(/^FMT1-/);
    });

    it('rejects a code decoded against the wrong kind, naming the actual kind', () => {
        const code = encodeShareCode('build', { characterId: 'yelan' });
        const result = decodeShareCode(code, 'targets');
        expect(result).toEqual({ ok: false, error: 'This is a build code, not a targets code.' });
    });

    it('rejects garbage input instead of throwing', () => {
        expect(decodeShareCode('not a real code', 'build')).toEqual({ ok: false, error: 'That doesn\'t look like a share code.' });
        expect(decodeShareCode('FMB1-!!!not-base64!!!', 'build').ok).toBe(false);
    });

    it('handles unicode payload content (character/set names with non-ASCII text)', () => {
        const payload = { label: '雷电将军 · 100%' };
        const code = encodeShareCode('build', payload);
        expect(decodeShareCode<typeof payload>(code, 'build')).toEqual({ ok: true, payload });
    });
});
