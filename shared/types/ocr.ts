/**
 * @fileoverview OCR scan contract — shared between the `ocr-scanner` backend
 * module and the renderer (via the `ocr:scan` IPC bridge).
 * @module shared/types/ocr
 *
 * Extracted from `modules/ocr-scanner/src/index.ts` so both sides import the
 * SAME declaration instead of a hand-mirrored renderer-local copy that could
 * silently drift from the real backend shape — same rationale as
 * `shared/types/game-bundle.ts`. Self-contained (no heavy imports) so the
 * renderer can pull it in without the kernel/module dependency graph.
 */

/**
 * Sentinel `ScannedEcho.name` value the backend substitutes when its
 * `namePattern` regex fails to match ANYTHING in the OCR text at all (name
 * completely unreadable, not just an unrecognized-but-real name — e.g. a
 * common fodder echo, which is expected and fine). Shared so the mapping
 * layer (`ocrMapping.ts`) can detect this exact case and flag it as a
 * blocking issue instead of silently treating it as a real (if uncatalogued)
 * echo name.
 */
export const UNKNOWN_ECHO_NAME = 'Unknown Echo';

/** Echo/artifact data structure extracted from OCR. */
export interface ScannedEcho {
    id: string;
    name: string;
    cost: number;
    /** Displayed "+N" upgrade level. Informational only — the app models gear
     * by its current rolled stat values (which OCR already reads directly),
     * not a level+roll-table, so this isn't mapped into a saved `GearEntry`. */
    level?: number;
    mainStat: {
        type: string;
        value: number;
    };
    subStats: Array<{
        type: string;
        value: number;
    }>;
    setName?: string;
    /** Character name shown as "Equipped by X" in the game's UI, if present. */
    equippedByCharacterName?: string;
    confidence: number;
    rawText: string;
    scannedAt: number;
}

/** OCR scan request. */
export interface ScanRequest {
    imagePath: string;
    options?: {
        language?: string;
        confidenceThreshold?: number;
        preprocessing?: boolean;
    };
}

/** OCR scan result. */
export interface ScanResult {
    success: boolean;
    echo?: ScannedEcho;
    error?: string;
    confidence: number;
    processingTimeMs: number;
    /** Raw Tesseract output, present even on failure (e.g. confidence below
     * threshold) so a rejected scan can still be inspected/diagnosed instead
     * of the read being discarded outright. */
    rawText?: string;
}
