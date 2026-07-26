/**
 * @fileoverview Compact, versioned share codes for pasting a build or an
 * optimization target config between users — pure JSON+base64, no server
 * round-trip, no account system. Each kind gets its own short prefix (e.g.
 * `FMB1-`) so a wrong-kind or corrupted paste fails with a clear message
 * instead of a cryptic parse error.
 * @module shared/shareCode
 */

const KIND_PREFIXES = {
    build: 'FMB',
    targets: 'FMT',
    rotation: 'FMR',
} as const;

export type ShareCodeKind = keyof typeof KIND_PREFIXES;

interface ShareCodeEnvelope<T> {
    kind: ShareCodeKind;
    v: number;
    payload: T;
}

function toBase64(json: string): string {
    return btoa(unescape(encodeURIComponent(json)));
}

function fromBase64(b64: string): string {
    return decodeURIComponent(escape(atob(b64)));
}

export function encodeShareCode<T>(kind: ShareCodeKind, payload: T, version = 1): string {
    const envelope: ShareCodeEnvelope<T> = { kind, v: version, payload };
    return `${KIND_PREFIXES[kind]}${version}-${toBase64(JSON.stringify(envelope))}`;
}

export type DecodeResult<T> = { ok: true; payload: T } | { ok: false; error: string };

export function decodeShareCode<T>(code: string, expectedKind: ShareCodeKind): DecodeResult<T> {
    const trimmed = code.trim();
    const prefix = KIND_PREFIXES[expectedKind];
    const match = trimmed.match(/^([A-Z]+)(\d+)-(.+)$/s);
    if (!match) return { ok: false, error: 'That doesn\'t look like a share code.' };
    const [, foundPrefix, , b64] = match;
    if (foundPrefix !== prefix) {
        const otherKind = (Object.entries(KIND_PREFIXES).find(([, p]) => p === foundPrefix)?.[0] as ShareCodeKind | undefined);
        return { ok: false, error: otherKind ? `This is a ${otherKind} code, not a ${expectedKind} code.` : 'Unrecognized code type.' };
    }
    try {
        const envelope = JSON.parse(fromBase64(b64)) as ShareCodeEnvelope<T>;
        if (envelope.kind !== expectedKind) return { ok: false, error: `This is a ${envelope.kind} code, not a ${expectedKind} code.` };
        return { ok: true, payload: envelope.payload };
    } catch {
        return { ok: false, error: 'Could not read this code — it may be corrupted or incomplete.' };
    }
}
