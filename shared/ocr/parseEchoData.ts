/**
 * @fileoverview Pure OCR-text → ScannedEcho parsing — shared by the Electron
 * OCR module (`modules/ocr-scanner`, Node/Tesseract-worker-backed) and the
 * web build's browser-side OCR path (`src/renderer/src/lib/ocrBrowser.ts`,
 * tesseract.js's browser worker). Extracted here specifically so this logic
 * has exactly ONE implementation used by both — a regex/string bugfix in one
 * would otherwise silently not apply to the other. Zero Node dependency by
 * design (no `fs`/`path`/Electron imports) — only string/regex operations
 * plus `generateId` (pure `Date.now()`/`Math.random()`, no Node API).
 */
import { generateId } from '@shared/types';
import { UNKNOWN_ECHO_NAME, type ScannedEcho } from '@shared/types/ocr';
import type { OcrRules } from '@shared/types/game-definition';

/** Fallback OCR rules used only when the active game hasn't resolved yet
 * (a boot-order race with game-loader on Electron, or — on the web build —
 * simply because there's no kernel/game-loader concept there at all, so the
 * browser OCR path always uses whatever real `OcrRules` the active game's
 * bundle carries, falling back to this only if that's somehow missing too).
 * Mirrors WuWa's real `OCR_PATTERNS` so behavior degrades gracefully instead
 * of failing the scan outright. */
const STAT_VALUE_GAP = '[^\\d\\n]{1,20}'; // kept in sync with WW/GI definitions' bound
// Kept in sync with WW's real OCR_PATTERNS.namePattern — strips an optional
// "Phantom: " skin-indicator prefix, tolerates an apostrophe/inner hyphen
// within a name word, a lowercase "of"/"the" linking word between two
// Title-Case words, and up to two "Main: Sub" / "Main - Sub" compound-name
// suffixes in either order (see that file's comment).
// {2,} so a 2-letter OCR misread of the set-filter chip's icon row can't
// chain onto the echo name — see the real WW definition.ts's NAME_WORD
// comment (kept in sync with this one).
const NAME_WORD = "[A-Z][a-z]{2,}(?:['\\u2019-][a-zA-Z]+)*";
const NAME_CONNECTOR = '(?:of|the)';
const NAME_PART = `${NAME_WORD}(?:\\s+(?:${NAME_CONNECTOR}\\s+)*${NAME_WORD})*`;
const COMPOUND_SEP = `(?:\\s*[:-]\\s*${NAME_PART})`;
// Not `^`-anchored — see the real WW definition.ts's OCR_PATTERNS.namePattern
// comment (kept in sync with this one) for why: the set-filter chip's text
// precedes the real echo name in the raw OCR output, so the match instead
// requires the name to sit immediately before "+<level>".
export const FALLBACK_OCR_RULES: OcrRules = {
    namePattern: `(?:Phantom\\s*:?\\s*)?(${NAME_PART}${COMPOUND_SEP}{0,2})(?=\\s*\\+\\d)`,
    costPattern: `Cost${STAT_VALUE_GAP}(\\d+)`,
    mainStatPattern: `(ATK|DEF|HP|CRIT\\s*Rate|CRIT\\s*DMG|Energy\\s*Regen|Healing\\s*Bonus|Effect\\s*Hit\\s*Rate|Effect\\s*RES)${STAT_VALUE_GAP}([\\d.]+)%?`,
    subStatPattern: `(ATK|DEF|HP|CRIT\\s*Rate|CRIT\\s*DMG|Energy\\s*Regen|Healing\\s*Bonus|Effect\\s*Hit\\s*Rate|Effect\\s*RES)${STAT_VALUE_GAP}([\\d.]+)%?`,
    // FIXED 2026-07-16 — this list had drifted out of sync with the real
    // `OCR_PATTERNS.setNames` in adapters/game-definitions/wuthering-waves/
    // definition.ts: it still only had the original 16 sets, missing the 18
    // added 2026-07-12 (including "Sound of True Name"). This module can't
    // import the adapter (layering: this is generic, game-specific data
    // lives above it), so keep this literal list manually in sync with that
    // file's array.
    setNames: [
        'Freezing Frost', 'Molten Rift', 'Void Thunder', 'Sierra Gale', 'Celestial Light',
        'Havoc Eclipse', 'Moonlit Clouds', 'Rejuvenating Glow', 'Lingering Tunes', 'Frosty Resolve',
        'Empyrean Anthem', 'Midnight Veil', 'Eternal Radiance', 'Tidebreaking Courage',
        'Gusts of Welkin', 'Windward Pilgrimage',
        'Chromatic Foam', 'Crown of Valor', 'Dream of the Lost', "Flamewing's Shadow",
        'Flaming Clawprint', 'Halo of Starry Radiance', "Heart of Evil's Purge", 'Lamp of Nether Road',
        'Law of Harmony', 'Pact of Neonlight Leap', 'Reel of Spliced Memories', 'Rite of Gilded Revelation',
        'Shadow of Shattered Dreams', 'Song of Feathered Trace', 'Sound of True Name',
        'Thread of Severed Fate', 'Trailblazing Star', 'Wishes of Quiet Snowfall',
    ],
    levelPattern: '\\+(\\d+)',
    equippedByPattern: 'Equipped by ([A-Za-z][A-Za-z\\s]*)',
};

/**
 * Parse echo/artifact data from OCR text, using the ACTIVE GAME's real
 * stat-label/set-name rules (`OcrRules`) — not a hardcoded single-game
 * guess, so both WuWa and Genshin screenshots parse against their own real
 * vocabulary. Returns `null` on a genuinely unparseable input rather than
 * throwing.
 */
export function parseEchoData(text: string, confidence: number, ocr: OcrRules): ScannedEcho | null {
    try {
        // Clean up text
        const cleanText = text.replace(/\s+/g, ' ').trim();

        // Extract equipment name (usually at the top). Case-sensitive on
        // purpose — the pattern's whole job is spotting capitalized words.
        const nameMatch = cleanText.match(new RegExp(ocr.namePattern));
        const name = nameMatch ? nameMatch[1] : UNKNOWN_ECHO_NAME;

        // Extract cost (WuWa only — GI's costPattern is '', meaning "no cost
        // concept for this game," so skip building an empty regex entirely).
        let cost = 0;
        if (ocr.costPattern) {
            const costMatch = cleanText.match(new RegExp(ocr.costPattern, 'i'));
            cost = costMatch ? parseInt(costMatch[1], 10) : 0;
        }

        // A stat's FULL match (not just its capture groups) carries the
        // trailing '%' when present — e.g. flat ATK vs ATK% are genuinely
        // different catalog stats, and `OcrRules.mainStatPattern`/
        // `subStatPattern` only capture the bare label, leaving '%?' outside
        // any group. Append it here so downstream mapping can tell them apart.
        // Normalize OCR spelling variants (e.g. "Crit. Rate" with a period)
        // to the canonical form BEFORE returning — downstream mapping
        // matches this `type` against the catalog's own label text, which
        // never has a period, so leaving one in here would silently break
        // that match even though the value was extracted correctly.
        const labelWithPercent = (fullMatch: string, label: string) => {
            const normalized = label.replace(/\./g, '').replace(/\s+/g, ' ').trim().toUpperCase();
            return fullMatch.trim().endsWith('%') ? `${normalized}%` : normalized;
        };

        // Extract main stat
        const mainStatMatch = cleanText.match(new RegExp(ocr.mainStatPattern, 'i'));
        const mainStat = mainStatMatch ? {
            type: labelWithPercent(mainStatMatch[0], mainStatMatch[1]),
            value: parseFloat(mainStatMatch[2]),
        } : { type: 'UNKNOWN', value: 0 };

        // Extract sub stats (same pattern, scanned globally; skip only the
        // exact occurrence that became the main stat, by MATCH POSITION —
        // not by stat type. A real echo can carry the same stat as BOTH
        // its main AND a sub-stat (e.g. Crit Rate main 22% + Crit Rate
        // sub 7.5% is a completely normal roll); filtering by type alone
        // would silently drop that second, genuine data point.
        const subStats: Array<{ type: string; value: number }> = [];
        const subStatRegex = new RegExp(ocr.subStatPattern, 'gi');
        let match;
        let skippedMainOccurrence = false;
        while ((match = subStatRegex.exec(cleanText)) !== null) {
            if (!skippedMainOccurrence && mainStatMatch && match.index === mainStatMatch.index) {
                skippedMainOccurrence = true;
                continue;
            }
            const type = labelWithPercent(match[0], match[1]);
            subStats.push({ type, value: parseFloat(match[2]) });
        }

        // Extract set name — first of the active game's real canonical
        // set names that appears in the OCR text. The set-filter chip
        // (crop region added 2026-07-13) sometimes has its space(s)
        // dropped by OCR ("RejuvenatingGlow" for "Rejuvenating Glow") —
        // matched per-name with each internal space loosened to `\s*`
        // so that still counts as a hit. Returns the known CANONICAL
        // name (not whatever raw substring matched), so a space-dropped
        // read still compares equal downstream against the real catalog
        // set name.
        let setName: string | undefined;
        for (const known of ocr.setNames) {
            const flexible = known.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s*');
            if (new RegExp(flexible, 'i').test(cleanText)) { setName = known; break; }
        }

        // Level ("+N") and "Equipped by X" — both optional; skip cleanly
        // when the active game's OcrRules doesn't define a pattern for them.
        const levelMatch = ocr.levelPattern ? cleanText.match(new RegExp(ocr.levelPattern)) : null;
        const level = levelMatch ? parseInt(levelMatch[1], 10) : undefined;
        const equippedByMatch = ocr.equippedByPattern ? cleanText.match(new RegExp(ocr.equippedByPattern, 'i')) : null;
        const equippedByCharacterName = equippedByMatch ? equippedByMatch[1].trim() : undefined;

        return {
            id: generateId('echo-'),
            name,
            cost,
            level,
            mainStat,
            // The real per-game cap (5 for WuWa, 4 for GI) lives in the
            // renderer's GearCatalog, which this shared function has no
            // access to — capture generously here and let the mapping
            // step (which DOES have the real catalog) do the real trim,
            // rather than guessing a single cross-game number and risking
            // silently dropping real data.
            subStats: subStats.slice(0, 8),
            setName,
            equippedByCharacterName,
            confidence,
            rawText: cleanText,
            scannedAt: Date.now(),
        };
    } catch {
        return null;
    }
}
