import { useMemo, useState } from 'react';
import type { GearEntry, GameBundle } from '@shared/types/game-bundle';

/** Filter state shared by the Inventory gear tab and the Inspector's gear picker. */
export interface GearFilters {
    query: string;
    set: string;    // 'all' or a set name
    main: string;   // 'all' or a stat key
    sub: string;    // 'all' or a stat key
    rarity: string; // 'all' or a rarity number as string
    slot: string;   // 'all' or cost-as-string (WuWa) / slot id (GI)
    /** 'none' or a stat key to sort by — a piece's main stat value if it
     * matches, else its matching sub-stat's value, else excluded from the
     * sort entirely (see `sortGear`). */
    sortStat: string;
    sortDir: 'asc' | 'desc';
}

export const DEFAULT_GEAR_FILTERS: GearFilters = { query: '', set: 'all', main: 'all', sub: 'all', rarity: 'all', slot: 'all', sortStat: 'none', sortDir: 'desc' };

/** The slot/cost filter value for a piece of gear — matches the option values below. */
function slotValue(g: Pick<GearEntry, 'cost' | 'slot'>): string {
    return g.cost != null ? String(g.cost) : (g.slot ?? '');
}

export function filterGear(gear: GearEntry[], f: GearFilters): GearEntry[] {
    const q = f.query.trim().toLowerCase();
    return gear.filter((g) => {
        if (q && !g.name.toLowerCase().includes(q) && !g.setName.toLowerCase().includes(q)) return false;
        if (f.set !== 'all' && g.setName !== f.set) return false;
        if (f.main !== 'all' && g.mainStat.key !== f.main) return false;
        if (f.sub !== 'all' && !g.subStats.some((s) => s.key === f.sub)) return false;
        if (f.rarity !== 'all' && String(g.rarity) !== f.rarity) return false;
        if (f.slot !== 'all' && slotValue(g) !== f.slot) return false;
        return true;
    });
}

/** A piece's value for `statKey` — its main stat if that's a match, else its
 * matching sub-stat, else `undefined` (this stat doesn't roll on this piece
 * at all, e.g. sorting by Crit DMG when this piece's subs are all flat ATK). */
function statValueOn(g: Pick<GearEntry, 'mainStat' | 'subStats'>, statKey: string): number | undefined {
    if (g.mainStat.key === statKey) return g.mainStat.value;
    return g.subStats.find((s) => s.key === statKey)?.value;
}

/** Sorts by `sortStat`'s value (see `statValueOn`) — pieces that don't carry
 * the stat at all sort to the end regardless of direction, since they're not
 * really comparable on it, not "worth zero". A no-op (stable, input order
 * preserved) when `sortStat` is `'none'`. */
export function sortGear(gear: GearEntry[], f: Pick<GearFilters, 'sortStat' | 'sortDir'>): GearEntry[] {
    if (f.sortStat === 'none') return gear;
    const dir = f.sortDir === 'asc' ? 1 : -1;
    return [...gear].sort((a, b) => {
        const va = statValueOn(a, f.sortStat);
        const vb = statValueOn(b, f.sortStat);
        if (va == null && vb == null) return 0;
        if (va == null) return 1;  // no such stat — always last
        if (vb == null) return -1;
        return (va - vb) * dir;
    });
}

/** Slot/cost dropdown options, labeled per the game's convention. */
export function slotOptions(data: Pick<GameBundle, 'gearCatalog'>): Array<{ value: string; label: string }> {
    return data.gearCatalog.slots.map((s) => ({ value: s.cost != null ? String(s.cost) : s.id, label: s.label }));
}

/** Every stat a piece of gear could carry (main OR sub), deduped by key —
 * the option list for the "Sort by" dropdown. */
export function sortableStatOptions(data: Pick<GameBundle, 'gearCatalog'>): Array<{ key: string; label: string }> {
    const byKey = new Map<string, string>();
    for (const s of [...data.gearCatalog.mains, ...data.gearCatalog.subs]) if (!byKey.has(s.key)) byKey.set(s.key, s.label);
    return [...byKey.entries()].map(([key, label]) => ({ key, label }));
}

/** Manages GearFilters state + derives the filtered+sorted list for a game bundle's gear catalog. */
export function useGearFilters(gear: GearEntry[]) {
    const [filters, setFilters] = useState<GearFilters>(DEFAULT_GEAR_FILTERS);
    const filtered = useMemo(() => sortGear(filterGear(gear, filters), filters), [gear, filters]);
    const set = <K extends keyof GearFilters>(key: K, value: GearFilters[K]) =>
        setFilters((f) => ({ ...f, [key]: value }));
    const reset = () => setFilters(DEFAULT_GEAR_FILTERS);
    const active = filters.query !== '' || filters.set !== 'all' || filters.main !== 'all'
        || filters.sub !== 'all' || filters.rarity !== 'all' || filters.slot !== 'all' || filters.sortStat !== 'none';
    return { filters, set, reset, active, filtered };
}
