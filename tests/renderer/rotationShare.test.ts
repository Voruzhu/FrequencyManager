import { rotationToSharePayload, encodeRotationShareCode, decodeRotationShareCode } from '../../src/renderer/src/lib/rotationShare';
import type { SavedRotation } from '../../src/renderer/src/stores/rotationStore';

describe('rotationToSharePayload / encodeRotationShareCode / decodeRotationShareCode', () => {
    const rotation: SavedRotation = {
        id: 'rot-1', name: 'Test Rotation', partyId: 'party-1',
        steps: [{ id: 's1', characterId: 'yelan', actionType: 'skill', skillId: 'skill', duration: 1 } as SavedRotation['steps'][number]],
        mode: 'boss', waves: [{ enemyId: 'gi-dvalin' }],
    };

    it('drops id and partyId — recipient gets a fresh id, has no access to the sharer\'s named parties', () => {
        const payload = rotationToSharePayload(rotation);
        expect(payload).not.toHaveProperty('id');
        expect(payload).not.toHaveProperty('partyId');
        expect(payload).toEqual({ name: 'Test Rotation', steps: rotation.steps, mode: 'boss', waves: rotation.waves });
    });

    it('round-trips through a code', () => {
        const code = encodeRotationShareCode(rotation);
        expect(code).toMatch(/^FMR1-/);
        expect(decodeRotationShareCode(code)).toEqual({ ok: true, payload: rotationToSharePayload(rotation) });
    });

    it('rejects a build code with a clear error', () => {
        const buildCode = 'FMB1-' + Buffer.from(JSON.stringify({ kind: 'build', v: 1, payload: {} })).toString('base64');
        expect(decodeRotationShareCode(buildCode)).toEqual({ ok: false, error: 'This is a build code, not a rotation code.' });
    });
});
