import { encodeShareCode, decodeShareCode, type DecodeResult } from '@shared/shareCode';
import type { Target } from '../data/optimizer';

/** Pure stat/skill thresholds only — no character or gear-set reference, so it's reusable across any character in the same game. */
export type TargetSharePayload = Array<Pick<Target, 'kind' | 'key' | 'label' | 'mode' | 'min'>>;

export function targetsToSharePayload(targets: Target[]): TargetSharePayload {
    return targets.map((t) => ({ kind: t.kind, key: t.key, label: t.label, mode: t.mode, min: t.min }));
}

export function encodeTargetsShareCode(targets: Target[]): string {
    return encodeShareCode('targets', targetsToSharePayload(targets));
}

export function decodeTargetsShareCode(code: string): DecodeResult<TargetSharePayload> {
    return decodeShareCode<TargetSharePayload>(code, 'targets');
}
