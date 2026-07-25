import { targetsToSharePayload, encodeTargetsShareCode, decodeTargetsShareCode } from '../../src/renderer/src/lib/targetShare';
import type { Target } from '../../src/renderer/src/data/optimizer';

describe('targetsToSharePayload / encodeTargetsShareCode / decodeTargetsShareCode', () => {
    const targets: Target[] = [
        { id: 't1', kind: 'stat', key: 'critRate', label: 'Crit Rate', mode: 'max' },
        { id: 't2', kind: 'stat', key: 'energyRegen', label: 'Energy Regen', mode: 'min', min: 200 },
    ];

    it('strips the original per-user target id — a shared config carries no owner-specific state', () => {
        const payload = targetsToSharePayload(targets);
        expect(payload).toEqual([
            { kind: 'stat', key: 'critRate', label: 'Crit Rate', mode: 'max', min: undefined },
            { kind: 'stat', key: 'energyRegen', label: 'Energy Regen', mode: 'min', min: 200 },
        ]);
        expect(payload.every((t) => !('id' in t))).toBe(true);
    });

    it('round-trips through a code', () => {
        const code = encodeTargetsShareCode(targets);
        expect(code).toMatch(/^FMT1-/);
        expect(decodeTargetsShareCode(code)).toEqual({ ok: true, payload: targetsToSharePayload(targets) });
    });

    it('rejects a build code with a clear error', () => {
        const buildCode = 'FMB1-' + Buffer.from(JSON.stringify({ kind: 'build', v: 1, payload: {} })).toString('base64');
        expect(decodeTargetsShareCode(buildCode)).toEqual({ ok: false, error: 'This is a build code, not a targets code.' });
    });
});
