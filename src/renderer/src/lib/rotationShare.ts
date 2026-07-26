import { encodeShareCode, decodeShareCode, type DecodeResult } from '@shared/shareCode';
import type { SavedRotation } from '../stores/rotationStore';

/** Steps/mode/waves/name only — no `id` (recipient gets a fresh one) and no `partyId`
 * (a foreign reference into the sharer's own named parties; SavedRotation already
 * tolerates this being absent, same as a rotation saved before that field existed). */
export type RotationSharePayload = Pick<SavedRotation, 'name' | 'steps' | 'mode' | 'waves'>;

export function rotationToSharePayload(r: SavedRotation): RotationSharePayload {
    return { name: r.name, steps: r.steps, mode: r.mode, waves: r.waves };
}

export function encodeRotationShareCode(r: SavedRotation): string {
    return encodeShareCode('rotation', rotationToSharePayload(r));
}

export function decodeRotationShareCode(code: string): DecodeResult<RotationSharePayload> {
    return decodeShareCode<RotationSharePayload>(code, 'rotation');
}
