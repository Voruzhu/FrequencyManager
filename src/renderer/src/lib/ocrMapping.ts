/**
 * OCR result → gear draft mapping — pure logic shared by the Scanner's
 * confirm-and-add flow. OCR only ever produces human-readable label text
 * ("CRIT DMG", "ATK%") and a canonical set name; this resolves both against
 * the ACTIVE game's real `GearCatalog` (the same one `AddGearWindow` already
 * uses for manual entry) to find the catalog's internal stat `key`s — never
 * fabricating a value it can't resolve, just flagging it as `unresolved` so
 * the confirm UI can ask the user to pick it manually (same "don't fabricate,
 * mark uncertainty" discipline as the rest of this app's data work).
 */
import type { GearCatalog, GearEntry } from '@shared/types/game-bundle';
import { UNKNOWN_ECHO_NAME, type ScannedEcho } from '@shared/types/ocr';
import { WW_ECHO_NAME_TO_SET, WW_ECHO_AMBIGUOUS_SETS, WW_ECHO_CATALOG } from '@shared/game-data/echo-set-names';

/** Strip a trailing '%' and normalize case/whitespace for label comparison.
 * Whitespace is removed ENTIRELY (not just collapsed) — the backend's
 * multi-word label patterns tolerate OCR merging/dropping the space between
 * words (e.g. "Energy Regen" read as "EnergyRegen"), and the extracted
 * label preserves whatever spacing OCR actually produced, so "Energy Regen"
 * (catalog) and "EnergyRegen" (a real OCR read) must normalize to the SAME
 * string here to still resolve to the same catalog key. */
function stripPercent(label: string): string {
    return label.trim().replace(/%$/, '').replace(/\s+/g, '').toLowerCase();
}

/** The widest [min, max] a stat could take across all rarities — used as a
 * plausibility check when the target rarity isn't known yet (or, for WuWa,
 * where the range is universal across rarities anyway, so this IS the exact
 * range). Returns undefined if the catalog has no entry for the key. */
function rangeUnion(key: string, entries: Array<{ key: string; byRarity: Record<number, { min: number; max: number }> }>): { min: number; max: number } | undefined {
    const def = entries.find((e) => e.key === key);
    if (!def) return undefined;
    const ranges = Object.values(def.byRarity);
    if (ranges.length === 0) return undefined;
    return { min: Math.min(...ranges.map((r) => r.min)), max: Math.max(...ranges.map((r) => r.max)) };
}

/**
 * Resolve an OCR-detected stat label (e.g. "ATK%", "CRIT RATE%", "HP") to a
 * catalog entry's `key`. Some catalog stats carry '%' literally in their
 * label (ATK%/HP%/DEF%, since a flat sibling also exists); others are
 * percent-only stats whose label has no '%' at all (e.g. "Crit Rate") — so
 * this first tries to match on BOTH bare label text AND percent-ness (to
 * correctly pick "ATK%" over flat "ATK" when OCR saw a %), falling back to
 * bare-label-only if that stricter match finds nothing.
 */
export function resolveStatKey(rawType: string, entries: Array<{ key: string; label: string; percent?: boolean }>): string | undefined {
    const hadPercent = rawType.trim().endsWith('%');
    const bare = stripPercent(rawType);
    const exact = entries.find((e) => stripPercent(e.label) === bare && !!e.percent === hadPercent);
    if (exact) return exact.key;
    const loose = entries.find((e) => stripPercent(e.label) === bare);
    return loose?.key;
}

/**
 * A flagged issue with a scanned draft. `severity` is drawn directly from
 * whether auto-importing anyway would actually PRODUCE A BROKEN RECORD:
 *   - 'major': one of the echo's IDENTITY fields (which set, which slot,
 *     which main stat, which rarity) is unresolved or contradictory —
 *     `buildGearEntryFromDraft` either can't construct an entry at all
 *     (returns null) or would have to guess at a structural field that
 *     cascades into other wrong values (e.g. a misidentified rarity also
 *     wrongly scales the main/base stat). Blocks auto-import.
 *   - 'minor': everything else — an individual sub-stat that didn't resolve
 *     (dropped, the other 4-5 are still fine), a sub-stat value out of range
 *     with no correction (kept as-scanned, still a usable number), a
 *     successful decimal-point correction, an inferred cost. None of these
 *     prevent building a valid, correctly-identified `GearEntry` — just
 *     something worth a glance. Doesn't block auto-import.
 */
export interface UnresolvedIssue {
    message: string;
    severity: 'major' | 'minor';
}

export interface GearDraft {
    setId?: string;
    rarity?: number;
    slotId?: string;
    mainKey?: string;
    /** WuWa: the fixed cost-locked sub-stat (flat HP for cost 1, flat ATK for
     * cost 3/4 — see `GearSlot.lockedSubStat`), shown/edited separately from
     * the genuinely random `subs` since its TYPE isn't a choice. Undefined
     * when the slot has no such mechanic (GI) or that row failed to resolve. */
    baseStat?: { key: string; value: number };
    subs: Array<{ key: string; value: number }>;
    /** The specific echo entity this is (e.g. "Thundering Mephis"), when the
     * scanned name exactly matches a real, sourced entry in `WW_ECHO_CATALOG`
     * — never fabricated for a name outside that list. Undefined for GI, or
     * for a WuWa fodder/world-mob echo with no fixed identity of its own. */
    echoName?: string;
    /** When the scanned echo's name is a KNOWN ambiguous-set name (see
     * `WW_ECHO_AMBIGUOUS_SETS`), the real short list of sets it could
     * actually be — narrows `AddGearWindow`'s Set picker to just these
     * instead of the full catalog, so the user picks from a bounded, real
     * list rather than searching everything. Undefined when the set already
     * resolved, or the name isn't a known ambiguous one (freeform catalog
     * search, unchanged). */
    setOptions?: string[];
    /** OCR labels/set name that couldn't be matched to the catalog, or a
     * value that needed correcting — surfaced in the confirm UI so the user
     * knows what to double-check, instead of silently dropping or guessing
     * at the data. See `UnresolvedIssue.severity` for what blocks auto-import. */
    unresolved: UnresolvedIssue[];
}

/**
 * Map a scanned echo/artifact into a best-effort `AddGearWindow` draft.
 * Slot inference: WuWa's slots ARE cost tiers, so `echo.cost` maps directly.
 * GI's slots are physical positions (flower/plume/sands/goblet/circlet) that
 * OCR text doesn't label — only flower (unique main "HP") and plume (unique
 * main "ATK") are inferable from the main stat alone; sands/goblet/circlet
 * share possible main stats and are left for the user to pick, not guessed.
 */
export function mapScannedEchoToGearDraft(echo: ScannedEcho, catalog: GearCatalog): GearDraft {
    const unresolved: UnresolvedIssue[] = [];
    const major = (message: string) => unresolved.push({ message, severity: 'major' });
    const minor = (message: string) => unresolved.push({ message, severity: 'minor' });

    // The backend substitutes UNKNOWN_ECHO_NAME when its namePattern regex
    // fails to match ANYTHING in the OCR text at all — a genuinely failed
    // read, not merely "a real name the catalog doesn't recognize" (most
    // fodder echoes are exactly that, and are completely normal/expected —
    // see the WW_ECHO_CATALOG lookup below). Flagging this explicitly (and
    // as 'major', unlike an uncatalogued-but-real name) matters because
    // nothing downstream would otherwise catch it: `buildGearEntryFromDraft`
    // already falls back to the SET name when `echoName` doesn't resolve, so
    // a scan with a totally unreadable name can otherwise still build a
    // "valid-looking" entry (right set/stats, generic name) and sail through
    // auto-import with no name at all worth trusting.
    if (!echo.name.trim() || echo.name.trim() === UNKNOWN_ECHO_NAME) {
        major('Echo name: OCR couldn\'t read it from the screenshot at all — this scan may be unreliable, please verify every field manually before adding.');
    }

    let setDef = echo.setName
        ? catalog.sets.find((s) => s.name.trim().toLowerCase() === echo.setName!.trim().toLowerCase())
        : undefined;
    // The in-game Echo Management screen only shows the set as an ICON, never
    // as text — `echo.setName` is realistically almost never populated by
    // OCR at all. Fall back to the echo's own (reliably-read) NAME: most
    // boss/unique echoes belong to exactly one set (see WW_ECHO_NAME_TO_SET's
    // header for how that list was built and why generic world-mob echoes
    // are deliberately excluded from it).
    let setInferredFromName = false;
    let setOptions: string[] | undefined;
    if (!setDef) {
        const inferredSetName = WW_ECHO_NAME_TO_SET[echo.name.trim()];
        const inferredDef = inferredSetName
            ? catalog.sets.find((s) => s.name.trim().toLowerCase() === inferredSetName.trim().toLowerCase())
            : undefined;
        if (inferredDef) {
            setDef = inferredDef;
            setInferredFromName = true;
        }
    }
    if (setInferredFromName) {
        // High-confidence (the echo name -> set relationship is fixed game
        // data, not a guess) but still worth a glance, same bar as the
        // cost-inference note below.
        minor(`Set inferred from echo name — "${echo.name}" is always part of the ${setDef!.name} set; please verify`);
    } else if (!setDef) {
        // Still unresolved — before falling back to the generic "unknown"
        // message, check whether this echo NAME is one of the ones that can
        // legitimately carry more than one set (most world-mob echoes — see
        // WW_ECHO_AMBIGUOUS_SETS' header). If so, tell the user exactly which
        // sets are actually possible instead of leaving them to search the
        // entire catalog blind — a real, bounded shortlist beats "pick
        // manually" with no further help.
        const options = WW_ECHO_AMBIGUOUS_SETS[echo.name.trim()];
        if (options && options.length > 0) {
            major(`Set: "${echo.name}" can belong to more than one set — pick one: ${options.join(', ')}`);
            setOptions = options;
        } else {
            // Unresolved either way (echo.setName absent, or present but
            // didn't match any known set) — without a set,
            // `buildGearEntryFromDraft` can't construct a valid entry at
            // all, so this always blocks, unlike most other unresolved fields.
            major(echo.setName ? `Set: ${echo.setName}` : `Set: couldn't be determined (no set text read, and "${echo.name}" isn't in the known echo-to-set list — pick it manually)`);
        }
    }

    // Identify the specific echo entity (e.g. "Thundering Mephis"), when the
    // scanned name is an exact match in the sourced catalog — never guessed
    // for a name that isn't in it (most world-mob echoes aren't, since their
    // set/cost varies by configuration rather than being fixed to the name).
    const catalogEcho = WW_ECHO_CATALOG.find((e) => e.name === echo.name.trim());
    let echoName = catalogEcho?.name;
    if (!echoName && echo.name.trim() && echo.name.trim() !== UNKNOWN_ECHO_NAME) {
        // A real, OCR-read name that just isn't one of our curated
        // WW_ECHO_CATALOG entries (most world-mob/fodder echoes, or any
        // named echo added to the game after the catalog was last updated)
        // — previously left `echoName` undefined, which meant the scanned
        // text was silently discarded: `buildGearEntryFromDraft` falls back
        // to the generic SET name below, and the confirm/add window's Echo
        // field showed nothing at all despite OCR having read real text.
        // Preserve it as freeform text instead — the Echo field accepts any
        // typed name, not just catalog matches (see AddGearWindow).
        echoName = echo.name.trim();
        minor(`Echo name "${echoName}" isn't in the known specific-echo list — kept as scanned; please verify it's spelled correctly`);
    }
    if (catalogEcho && echo.cost != null && echo.cost !== 0 && !catalogEcho.costs.includes(echo.cost)) {
        // The scanned cost doesn't match any of this echo's known cost(s) —
        // a real (rare) data inconsistency or a misread; the scanned value
        // still wins (it's what the screenshot actually showed), just flagged.
        minor(`Echo "${echoName}" is normally cost ${catalogEcho.costs.join(' or ')}, but the scan read cost ${echo.cost} — please verify`);
    }

    const mainKey = resolveStatKey(echo.mainStat.type, catalog.mains);
    if (!mainKey) major(`Main stat: ${echo.mainStat.type}`);

    // Sub-stats: resolve each label. Moved ahead of slot detection below —
    // the cost-inference fallback needs these already resolved. The backend
    // has no access to this catalog so it captures generously — the real
    // per-game limit is enforced further down, AFTER pulling out the
    // cost-locked "base" stat, since that one isn't a choice and doesn't
    // count against the random cap.
    const resolvedSubs: Array<{ key: string; value: number }> = [];
    for (const s of echo.subStats) {
        const key = resolveStatKey(s.type, catalog.subs);
        if (!key) {
            // Dropped, not blocking: the entry still builds fine with the
            // other 4-5 sub-stats intact — see the severity doc comment above.
            minor(`Sub-stat: ${s.type} — not in the catalog, dropped`);
            continue;
        }
        resolvedSubs.push({ key, value: s.value });
    }

    // WuWa: cost tier IS the slot. GI: infer only the two slots with a
    // uniquely-identifying main stat; otherwise leave for manual selection.
    let slotId: string | undefined;
    let costSlot = catalog.slots.find((s) => s.cost != null && s.cost === echo.cost);
    let costInferred = false;
    if (!costSlot) {
        // The literal "Cost" text itself can fail to OCR (e.g. "COST 3"
        // misread as "€OSE 3", leaving `echo.cost` at its 0 fallback) —
        // when that happens, the whole base-stat mechanism below would
        // silently break (no slot -> no locked key -> the base stat never
        // gets pulled out of the random sub-stat list, and gets wrongly
        // flagged as "outside the valid range" instead). Recover using the
        // SAME fact the base-stat/rarity inference above already relies on:
        // every (cost, rarity) pair has a distinct, deterministic base-stat
        // value, so a flat ATK/HP sub-stat that closely matches exactly one
        // of those 9 known numbers identifies the cost tier unambiguously,
        // independent of whether the cost text itself was readable.
        let best: { slot: typeof catalog.slots[number]; rarity: number; diff: number } | undefined;
        for (const slot of catalog.slots) {
            if (!slot.lockedSubStat || !slot.baseStatByRarity) continue;
            const candidate = resolvedSubs.find((s) => s.key === slot.lockedSubStat);
            if (!candidate) continue;
            for (const [rStr, expected] of Object.entries(slot.baseStatByRarity)) {
                const diff = Math.abs(expected - candidate.value);
                if (!best || diff < best.diff) best = { slot, rarity: Number(rStr), diff };
            }
        }
        if (best) {
            const expected = best.slot.baseStatByRarity![best.rarity];
            if (best.diff <= Math.max(2, expected * 0.05)) {
                costSlot = best.slot;
                costInferred = true;
            }
        }
    }
    if (costSlot) {
        slotId = costSlot.id;
    } else if (mainKey) {
        const uniqueSlot = catalog.slots.find((s) => s.mainStats.length === 1 && s.mainStats[0] === mainKey);
        slotId = uniqueSlot?.id;
    }
    if (costInferred) {
        // Only reaches here when the base-stat value CLOSELY matched exactly
        // one (cost, rarity) pair (see the `best.diff <=` check above) — a
        // confident inference, not a guess, so this doesn't block auto-import.
        minor(`Cost couldn't be read directly — inferred cost-${costSlot!.cost} from a matching base-stat value; please verify`);
    } else if (!slotId) {
        // Without a slot, `buildGearEntryFromDraft` can't construct an entry
        // (GI's ambiguous sands/goblet/circlet case, or WW's cost genuinely
        // unreadable and un-inferable) — always blocks, same reasoning as an
        // unresolved set.
        major('Slot: could not be determined — pick it manually');
    }

    // WuWa mechanic (confirmed by the user against real screenshots): every
    // echo shows 7 stat rows total — main stat, then a "base" stat that's
    // ALWAYS a fixed roll determined by cost tier (never random — see
    // `GearSlot.lockedSubStat`), then 5 genuinely random sub-stats. Pull the
    // base stat out of `resolvedSubs` here so it's tracked separately (shown
    // as its own field, not counted against `catalog.maxSubStats`).
    const lockedKey = costSlot?.lockedSubStat;
    let baseStat: { key: string; value: number } | undefined;
    if (lockedKey) {
        const idx = resolvedSubs.findIndex((s) => s.key === lockedKey);
        if (idx >= 0) {
            baseStat = resolvedSubs[idx];
            resolvedSubs.splice(idx, 1);
        }
    }

    const subs = resolvedSubs.slice(0, catalog.maxSubStats);
    if (resolvedSubs.length > catalog.maxSubStats) {
        // The KEPT stats are all still individually valid — this only means
        // some legitimate extra data got trimmed, not that anything's wrong.
        minor(`${resolvedSubs.length - catalog.maxSubStats} extra sub-stat(s) beyond this game's max (${catalog.maxSubStats}) were dropped`);
    }

    // If OCR garbles the true main-stat line badly enough that the backend
    // regex doesn't match it at all, parsing falls through to the next
    // matching occurrence, which is exactly this fixed base stat — silently
    // mislabeling it as the main stat while losing the real one. Catch that
    // here: if what we resolved as the main stat IS this cost's fixed
    // stat, and that stat wasn't ALSO found as its own row (i.e. this isn't
    // a legitimate second independent roll of the same type), flag it.
    if (lockedKey) {
        if (mainKey === lockedKey && !baseStat) {
            major(`Main stat resolved to ${echo.mainStat.type}, which is normally the fixed base stat for cost-${costSlot!.cost} echoes — the real main stat may have failed to read; please verify`);
        } else if (mainKey !== lockedKey && !baseStat) {
            // Every WuWa echo always carries this stat — not a roll — so its
            // total absence (not just misattributed to main, the case above)
            // means that row's read was likely dropped or garbled entirely.
            const label = catalog.subs.find((s) => s.key === lockedKey)?.label ?? lockedKey;
            major(`Expected a fixed ${label} base stat for cost-${costSlot!.cost} echoes but didn't find one — that row's read may be incomplete; please verify`);
        }
    }

    // Rarity: OCR never reads a rarity/star indicator directly, but the base
    // stat is a DETERMINISTIC function of cost + rarity (e.g. exactly 150
    // flat ATK for every 5★ cost-4 echo, never a roll — see
    // `GearSlot.baseStatByRarity`) — so a successfully-read base stat value
    // doubles as a rarity signal. Picks the closest match; flags it if the
    // scanned value isn't close to ANY known rarity's expected number (a
    // real echo's base stat can't legitimately be "close but not exact" —
    // that gap signals a misread digit rather than genuine variance).
    let rarity: number | undefined;
    if (lockedKey && baseStat && costSlot?.baseStatByRarity) {
        let closestRarity: number | undefined;
        let closestDiff = Infinity;
        for (const [rStr, expected] of Object.entries(costSlot.baseStatByRarity)) {
            const diff = Math.abs(expected - baseStat.value);
            if (diff < closestDiff) { closestDiff = diff; closestRarity = Number(rStr); }
        }
        if (closestRarity != null) {
            rarity = closestRarity;
            const expected = costSlot.baseStatByRarity[closestRarity];
            if (closestDiff > Math.max(2, expected * 0.05)) {
                major(`Scanned base stat value (${baseStat.value}) doesn't closely match any known rarity's expected value (closest: ${expected} at ${closestRarity}★) — double-check the base stat and rarity`);
            }
        }
    }

    // Plausibility check: a misread decimal point turns a real "7.9%" into
    // "79%" — the regex still matches cleanly and produces a VALID-LOOKING
    // number, so nothing earlier catches it. But every real sub-stat's roll
    // is bounded to a known range (confirmed against sourced data), and a
    // value like 79% for a stat whose real max is ~12% can't legitimately
    // occur. Recurring pattern across many real scans: Tesseract specifically
    // drops the "." character in these small stylized values (7.9 -> 79,
    // 8.1 -> 81, 8.6 -> 86) — consistent enough that when dividing by 10
    // brings an out-of-range value back into range, that's a strong signal
    // of exactly this failure, not a coincidence. Auto-correct it (rather
    // than leaving an obviously-wrong 81% in the draft for the user to fix
    // by hand every time) but still flag it, since this is an inference,
    // not a certainty — a genuinely different misread could coincidentally
    // land in-range after /10 too.
    for (const s of subs) {
        const range = rangeUnion(s.key, catalog.subs);
        if (!range || (s.value >= range.min && s.value <= range.max)) continue;
        const label = catalog.subs.find((x) => x.key === s.key)?.label ?? s.key;
        const corrected = Math.round((s.value / 10) * 10) / 10;
        if (corrected >= range.min && corrected <= range.max) {
            minor(`${label} auto-corrected from ${s.value} to ${corrected} — the scanned value was ~10x the valid range (${range.min}–${range.max}), almost certainly a dropped decimal point; please verify`);
            s.value = corrected;
        } else {
            // Kept as-scanned (not blocking) — a single suspect sub-stat
            // value doesn't stop a valid entry from being built, unlike an
            // unresolved identity field; still worth flagging for review.
            minor(`${label} scanned as ${s.value} — outside the valid range (${range.min}–${range.max}) for this stat, likely a misread (e.g. a dropped decimal point); please verify`);
        }
    }

    return {
        setId: setDef?.id,
        rarity,
        slotId,
        mainKey,
        baseStat,
        subs,
        echoName,
        setOptions,
        unresolved,
    };
}

/** True if `draft` has any 'major' issue — the bar for the Scanner's
 * "Auto import" batch action: a 'minor' issue (a dropped sub-stat, an
 * out-of-range value, an auto-corrected decimal, an inferred cost/set) still
 * produces a valid, correctly-identified entry and doesn't block it; a
 * 'major' one (an unresolved set/slot/main stat, an undetermined rarity)
 * means `buildGearEntryFromDraft` genuinely can't (or shouldn't) build an
 * entry from this draft yet. */
export function hasBlockingIssues(draft: GearDraft): boolean {
    return draft.unresolved.some((u) => u.severity === 'major');
}

/**
 * Build a complete `GearEntry` from a fully-resolved `GearDraft` — the same
 * construction logic `AddGearWindow`'s manual "Add" button uses (main-stat
 * value from the slot's `mainStatOverrides` when present, base stat from
 * `GearSlot.baseStatByRarity`, sub-stats mapped to their catalog labels),
 * factored out so the Scanner's auto-import action can commit a draft
 * straight to inventory without rendering that UI. Returns `null` if
 * anything REQUIRED is missing (set, slot, main stat, or rarity) — callers
 * should already be gating on `!hasBlockingIssues(draft)` before calling
 * this (every one of those four is now a 'major' unresolved issue, see the
 * severity doc comment above), but this guards independently as defense in
 * depth rather than trusting that invariant to always hold.
 */
export function buildGearEntryFromDraft(
    draft: GearDraft,
    catalog: GearCatalog,
    gearKind: 'echo' | 'artifact',
    newId: () => string,
): GearEntry | null {
    if (draft.rarity == null) return null;
    const setDef = catalog.sets.find((s) => s.id === draft.setId);
    const slot = catalog.slots.find((s) => s.id === draft.slotId);
    const mainDef = draft.mainKey ? catalog.mains.find((m) => m.key === draft.mainKey) : undefined;
    if (!setDef || !slot || !mainDef) return null;

    const mainValue = slot.mainStatOverrides?.[mainDef.key]?.[draft.rarity] ?? mainDef.byRarity[draft.rarity] ?? 0;

    const baseEntry = draft.baseStat
        ? (() => {
            const def = catalog.subs.find((s) => s.key === draft.baseStat!.key);
            return def ? { key: def.key, label: def.label, value: draft.baseStat.value } : undefined;
        })()
        : undefined;

    const subEntries = draft.subs
        .map((s) => {
            const def = catalog.subs.find((x) => x.key === s.key);
            return def ? { key: def.key, label: def.label, value: s.value } : undefined;
        })
        .filter((s): s is { key: string; label: string; value: number } => !!s);

    return {
        kind: gearKind,
        id: newId(),
        name: draft.echoName || setDef.name,
        setName: setDef.name,
        rarity: draft.rarity,
        cost: slot.cost,
        slot: slot.cost == null ? slot.id : undefined,
        mainStat: { key: mainDef.key, label: mainDef.label, value: mainValue },
        subStats: [...(baseEntry ? [baseEntry] : []), ...subEntries],
    };
}
