import type { GearEntry, GearCatalog } from '@shared/types/game-bundle';

export interface SubDraft { key: string; value: number }

/** Pre-fill for `AddGearWindow` — e.g. from a scanned echo's best-effort
 * resolved draft (`lib/ocrMapping.ts`). Most fields left unresolved fall back
 * to the same default the manual-entry flow already uses; `setId` is the
 * exception — an unresolved set is left genuinely blank rather than silently
 * defaulted, see the comment where it's read in `AddGearWindow`. */
export interface AddGearInitial {
    setId?: string;
    rarity?: number;
    slotId?: string;
    mainKey?: string;
    subs?: SubDraft[];
    /** The specific echo entity (e.g. "Thundering Mephis"), when known — see
     * `WW_ECHO_CATALOG`. */
    echoName?: string;
    /** Narrows the Set picker to exactly these set names (a known
     * ambiguous-set echo's real candidate list) instead of the full catalog
     * — see `GearDraft.setOptions`. */
    setOptions?: string[];
}

/** Reverse-maps an already-owned `GearEntry` back into an `AddGearWindow`
 * draft, for the Inventory screen's "Edit" flow — same field shape the OCR
 * confirm flow already pre-fills from, just derived from a saved entry
 * instead of a scan. The locked base stat (WuWa's cost-tier-fixed sub —
 * always first in `subStats` when the slot has one) is excluded from `subs`
 * since it isn't user-editable, it's re-derived from slot + rarity same as
 * a fresh add. */
export function gearToInitial(g: GearEntry, cat: GearCatalog): AddGearInitial {
    const setId = cat.sets.find((s) => s.name === g.setName)?.id;
    const slot = cat.slots.find((s) => (s.cost != null ? s.cost === g.cost : s.id === g.slot));
    const lockedKey = slot?.lockedSubStat;
    const subStats = lockedKey && g.subStats[0]?.key === lockedKey ? g.subStats.slice(1) : g.subStats;
    return {
        setId,
        rarity: g.rarity,
        slotId: slot?.id,
        mainKey: g.mainStat.key,
        subs: subStats.map((s) => ({ key: s.key, value: s.value })),
        echoName: g.name !== g.setName ? g.name : undefined,
    };
}
