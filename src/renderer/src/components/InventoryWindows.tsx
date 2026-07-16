import { useState } from 'react';
import { Search, Plus, Trash2, ChevronsUpDown } from 'lucide-react';
import {
    Input, Button, Badge, Label, ItemIcon, DialogFooter, DialogClose,
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem, toast,
} from './ui';
import { cn } from '@/lib/utils';
import { iconSrc } from '@/lib/icons';
import { useGameStore } from '../stores/gameStore';
import { useInventoryStore, useOwnedInventory } from '../stores/inventoryStore';
import { useGameData } from '../data/gameData';
import type { GearEntry } from '@shared/types/game-bundle';
import { WW_ECHO_CATALOG } from '@shared/game-data/echo-set-names';
import type { AddGearInitial, SubDraft } from '@/lib/gearEdit';

let gearSeq = 0;
export const newGearId = (gameId: string) => `own-${gameId}-${Date.now()}-${++gearSeq}`;

// ── Add character (from the game catalog) ────────────────────────────────────

export function AddCharacterWindow({ onDone }: { onDone: () => void }) {
    const gameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(gameId);
    const owned = useOwnedInventory(gameId);
    const addCharacter = useInventoryStore((s) => s.addCharacter);
    const [q, setQ] = useState('');

    const ownedIds = new Set(owned.characters.map((c) => c.id));
    const query = q.trim().toLowerCase();
    const pool = data.characters
        .filter((c) => !ownedIds.has(c.id) && (!query || c.name.toLowerCase().includes(query)))
        .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));

    return (
        <div className="space-y-3">
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search characters…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            </div>
            <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto scrollbar-thin sm:grid-cols-4">
                {pool.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Nothing left to add.</p>}
                {pool.map((c) => (
                    <button key={c.id} onClick={() => { addCharacter(gameId, c.id); toast.success(`Added ${c.name}`); }}
                        className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-3 text-center transition-colors hover:bg-surface-2">
                        <ItemIcon kind="character" size="lg" rarity={c.rarity} src={iconSrc(gameId, c.icon)} />
                        <span className="line-clamp-1 text-sm font-medium text-foreground">{c.name}</span>
                        <span className="flex flex-wrap justify-center gap-1">
                            <Badge variant="secondary">{c.element}</Badge>
                            {c.approx && <Badge variant="outline" title="Base stats are rarity defaults — no per-character data in the game module yet">approx</Badge>}
                        </span>
                    </button>
                ))}
            </div>
            <DialogFooter><DialogClose asChild><Button onClick={onDone}>Done</Button></DialogClose></DialogFooter>
        </div>
    );
}

// ── Add weapon (from the game catalog) ───────────────────────────────────────

export function AddWeaponWindow({ onDone }: { onDone: () => void }) {
    const gameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(gameId);
    const owned = useOwnedInventory(gameId);
    const addWeapon = useInventoryStore((s) => s.addWeapon);
    const [q, setQ] = useState('');
    const [type, setType] = useState('all');
    const [rarity, setRarity] = useState('all');

    // Filter options derived from the game's own weapon roster.
    const types = Array.from(new Set(data.weapons.map((w) => w.weaponType))).sort();
    const rarities = Array.from(new Set(data.weapons.map((w) => w.rarity))).sort((a, b) => b - a);

    const ownedIds = new Set(owned.weapons.map((w) => w.id));
    const query = q.trim().toLowerCase();
    const pool = data.weapons
        .filter((w) =>
            !ownedIds.has(w.id) &&
            (!query || w.name.toLowerCase().includes(query)) &&
            (type === 'all' || w.weaponType === type) &&
            (rarity === 'all' || w.rarity === Number(rarity)),
        )
        .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[9rem] flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input className="pl-8" placeholder="Search weapons…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
                </div>
                <Select value={type} onValueChange={setType}>
                    <SelectTrigger className="w-36"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={rarity} onValueChange={setRarity}>
                    <SelectTrigger className="w-28"><SelectValue placeholder="Rarity" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All ★</SelectItem>
                        {rarities.map((r) => <SelectItem key={r} value={String(r)}>{r}★</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
            <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto scrollbar-thin sm:grid-cols-3">
                {pool.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">No weapons match these filters.</p>}
                {pool.map((w) => (
                    <button key={w.id} onClick={() => { addWeapon(gameId, w.id); toast.success(`Added ${w.name}`); }}
                        className="flex items-center gap-2 rounded-lg border border-border bg-card p-2 text-left transition-colors hover:bg-surface-2">
                        <ItemIcon kind="weapon" size="md" rarity={w.rarity} src={iconSrc(gameId, w.icon)} />
                        <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-foreground">{w.name}</div>
                            <div className="text-xs text-muted-foreground">{w.weaponType} · {w.rarity}★</div>
                        </div>
                    </button>
                ))}
            </div>
            <DialogFooter><DialogClose asChild><Button onClick={onDone}>Done</Button></DialogClose></DialogFooter>
        </div>
    );
}

// ── Searchable set picker (typeahead combobox) ───────────────────────────────

/** A Select-styled trigger that opens a type-to-filter list of sets. */
function SetCombobox({ sets, value, onChange }: { sets: Array<{ id: string; name: string }>; value: string; onChange: (id: string) => void }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const selected = sets.find((s) => s.id === value);
    const q = query.trim().toLowerCase();
    const filtered = q ? sets.filter((s) => s.name.toLowerCase().includes(q)) : sets;

    return (
        <div className="relative">
            {open ? (
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        className="pl-8"
                        placeholder="Search sets…"
                        value={query}
                        autoFocus
                        onChange={(e) => setQuery(e.target.value)}
                        onBlur={() => setTimeout(() => { setOpen(false); setQuery(''); }, 120)}
                    />
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => { setOpen(true); setQuery(''); }}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                    <span className="truncate">{selected?.name ?? 'Select set…'}</span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </button>
            )}
            {open && (
                <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto scrollbar-thin rounded-md border border-border bg-popover p-1 shadow-elevation-2">
                    {filtered.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">No sets match “{query}”.</p>}
                    {filtered.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            // Preventing default on mousedown keeps the input focused so its
                            // onBlur doesn't close the list before this click registers.
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { onChange(s.id); setOpen(false); setQuery(''); }}
                            className={cn('flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2', s.id === value ? 'text-primary' : 'text-foreground')}
                        >
                            {s.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Free-text echo-identity field with catalog suggestions. Unlike
 * `SetCombobox` (a closed list — every real Set is known), the specific echo
 * NAME space isn't exhaustively cataloged (`WW_ECHO_CATALOG` is a curated
 * subset), so typed text is kept as the value even when it doesn't match any
 * suggestion — lets an OCR-scanned name that isn't in our catalog (or a name
 * the user just knows) survive instead of being silently unselectable.
 */
function EchoNameCombobox({ options, value, onChange }: { options: Array<{ name: string }>; value: string; onChange: (name: string) => void }) {
    const [open, setOpen] = useState(false);
    const q = value.trim().toLowerCase();
    const filtered = q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;

    return (
        <div className="relative">
            <Input
                placeholder="Type or pick a specific echo (optional)"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 120)}
            />
            {open && filtered.length > 0 && (
                <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto scrollbar-thin rounded-md border border-border bg-popover p-1 shadow-elevation-2">
                    {filtered.map((o) => (
                        <button
                            key={o.name}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { onChange(o.name); setOpen(false); }}
                            className={cn('flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2', o.name === value ? 'text-primary' : 'text-foreground')}
                        >
                            {o.name}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Add echo/artifact (the stat builder) ─────────────────────────────────────

export function AddGearWindow({ onDone, initial, editingId, onGearAdded }: { onDone: () => void; initial?: AddGearInitial; editingId?: string; onGearAdded?: (gear: GearEntry) => void }) {
    const gameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(gameId);
    const cat = data.gearCatalog;
    const addGear = useInventoryStore((s) => s.addGear);
    const updateGear = useInventoryStore((s) => s.updateGear);

    // Unlike the other fields below, an unresolved SET doesn't default to
    // "the first catalog entry" — that silently produces a real-looking but
    // WRONG set (e.g. a scanned echo whose icon-only set field OCR couldn't
    // read would previously land on whatever happened to be first in the
    // catalog, saved as if it were correct, with nothing prompting the user
    // to notice). Only a brand-new manual add (no `initial` at all) gets the
    // convenience default; an `initial` draft with a genuinely unresolved
    // `setId` (e.g. from a scan) leaves the combobox blank so `canAdd` stays
    // false until the user makes an explicit choice.
    const [setId, setSetId] = useState(initial ? (initial.setId ?? '') : (cat.sets[0]?.id ?? ''));
    const [rarity, setRarity] = useState<number>(initial?.rarity ?? cat.rarities[cat.rarities.length - 1]);
    const [slotId, setSlotId] = useState(initial?.slotId ?? cat.slots[0]?.id ?? '');
    const slot = cat.slots.find((s) => s.id === slotId) ?? cat.slots[0];
    // Which specific echo entity this is (e.g. "Thundering Mephis"), from the
    // real, sourced `WW_ECHO_CATALOG` — WuWa echoes only, always optional.
    // Reset whenever Cost or Set changes so a stale name (from a combination
    // it no longer matches) is never silently kept — see `changeSlot`/
    // `changeSet` below.
    const [echoName, setEchoName] = useState(initial?.echoName ?? '');
    // When a scan identified this echo's name as one that can only carry a
    // known short list of sets (`WW_ECHO_AMBIGUOUS_SETS`), narrow the picker
    // to exactly those instead of the full catalog — a bounded real choice
    // beats searching all 34 sets for the ~3 that are actually possible.
    const selectableSets = initial?.setOptions
        ? cat.sets.filter((s) => initial.setOptions!.includes(s.name))
        : cat.sets;
    const setDef = cat.sets.find((s) => s.id === setId);
    // Before a Set is chosen (the OCR ambiguous-set case: the scan already
    // knows exactly which echo this is, but not yet which of its several
    // real sets THIS copy is configured as), still show/pre-select the
    // already-identified echo instead of an empty "pick a set first" list —
    // the identity is certain even when the set isn't. Once a Set IS chosen,
    // filter by it as before.
    const echoOptions = data.gearKind === 'echo'
        ? WW_ECHO_CATALOG.filter((e) =>
            (slot?.cost == null || e.costs.includes(slot.cost)) &&
            (setDef ? e.sets.includes(setDef.name) : e.name === echoName),
        )
        : [];
    // Only clear a known echo name when the new Cost/Set combo genuinely no
    // longer matches it — e.g. after the OCR flow pre-fills "Havoc Prism"
    // with no set chosen yet, picking one of its own real candidate sets
    // (from `selectableSets`) shouldn't wipe the identity right back out.
    const clearEchoNameIfInvalid = (newSetName: string | undefined, newCost: number | undefined) => {
        setEchoName((prev) => {
            if (!prev) return prev;
            const entry = WW_ECHO_CATALOG.find((e) => e.name === prev);
            // A freeform name (not a catalog match — e.g. typed by hand, or
            // preserved from an OCR read the catalog doesn't cover) has no
            // Cost/Set constraint to violate in the first place; only a
            // catalog-confirmed identity gets cleared when it no longer fits.
            if (!entry) return prev;
            const stillValid = (newCost == null || entry.costs.includes(newCost))
                && (!newSetName || entry.sets.includes(newSetName));
            return stillValid ? prev : '';
        });
    };
    const changeSet = (id: string) => {
        setSetId(id);
        clearEchoNameIfInvalid(cat.sets.find((s) => s.id === id)?.name, slot?.cost);
    };
    const allowedMains = cat.mains.filter((m) => slot.mainStats.includes(m.key));
    const [mainKey, setMainKey] = useState(initial?.mainKey ?? allowedMains[0]?.key ?? '');
    const [subs, setSubs] = useState<SubDraft[]>(initial?.subs ?? []);

    // Keep main valid when the slot changes.
    const effectiveMainKey = allowedMains.some((m) => m.key === mainKey) ? mainKey : (allowedMains[0]?.key ?? '');
    const mainDef = cat.mains.find((m) => m.key === effectiveMainKey);
    // WuWa: the same stat's main-stat value differs by cost tier (e.g. 5★
    // ATK% is 18% at cost 1 but 33% at cost 4) — the slot's own override
    // takes precedence over the shared `mains[].byRarity` table.
    const mainValue = (slot.mainStatOverrides?.[effectiveMainKey]?.[rarity] ?? mainDef?.byRarity[rarity] ?? 0);

    // Base stat: WuWa's every-echo-has-one fixed stat whose TYPE and VALUE
    // are BOTH derived from the slot (cost tier) + rarity, never user-chosen
    // — real echo base-stat values are deterministic (e.g. every 5★ cost-4
    // echo has exactly 150 flat ATK), not a roll like the other 5 sub-stats,
    // so this is auto-computed the same way Main Stat's "(auto-maxed)" value
    // is, not an editable field.
    const currentBaseKey = slot.lockedSubStat;
    const currentBaseDef = currentBaseKey ? cat.subs.find((s) => s.key === currentBaseKey) : undefined;
    const baseStatValue = currentBaseKey ? (slot.baseStatByRarity?.[rarity] ?? 0) : 0;

    // In WuWa a sub-stat may repeat the main stat; in GI it may not.
    const canRepeatMain = cat.subStatsCanRepeatMain;
    const subRange = (key: string) => cat.subs.find((s) => s.key === key)?.byRarity[rarity];
    const pickedSubKeys = new Set(subs.map((s) => s.key));
    const subAllowed = (key: string) => (canRepeatMain || key !== effectiveMainKey);
    const availableSubs = cat.subs.filter((s) => !pickedSubKeys.has(s.key) && subAllowed(s.key) && s.byRarity[rarity]);

    const changeSlot = (id: string) => {
        setSlotId(id);
        const nextSlot = cat.slots.find((s) => s.id === id);
        clearEchoNameIfInvalid(setDef?.name, nextSlot?.cost);
        const nextMains = cat.mains.filter((m) => nextSlot?.mainStats.includes(m.key));
        const nextMain = nextMains[0]?.key ?? '';
        setMainKey(nextMain);
        if (!canRepeatMain) setSubs((prev) => prev.filter((s) => s.key !== nextMain));
        // Base stat needs no reset here — it's fully derived (slot + rarity).
    };
    const changeMain = (key: string) => { setMainKey(key); if (!canRepeatMain) setSubs((prev) => prev.filter((s) => s.key !== key)); };
    const changeRarity = (r: number) => {
        setRarity(r);
        // Re-clamp existing subs to the new rarity's range.
        setSubs((prev) => prev.map((s) => {
            const rg = cat.subs.find((x) => x.key === s.key)?.byRarity[r];
            return rg ? { ...s, value: Math.min(Math.max(s.value, rg.min), rg.max) } : s;
        }));
        // Base stat needs no reset here — it's fully derived (slot + rarity).
    };
    const addSub = () => {
        const next = availableSubs[0];
        if (!next) return;
        setSubs((prev) => [...prev, { key: next.key, value: next.byRarity[rarity]?.max ?? 0 }]);
    };
    const setSubKey = (idx: number, key: string) => {
        const rg = subRange(key);
        setSubs((prev) => prev.map((s, i) => (i === idx ? { key, value: rg?.max ?? 0 } : s)));
    };
    const setSubValue = (idx: number, raw: number) => {
        setSubs((prev) => prev.map((s, i) => {
            if (i !== idx) return s;
            const rg = subRange(s.key);
            const v = rg ? Math.min(Math.max(raw, rg.min), rg.max) : raw;
            return { ...s, value: Math.round(v * 10) / 10 };
        }));
    };
    const removeSub = (idx: number) => setSubs((prev) => prev.filter((_, i) => i !== idx));

    const canAdd = !!setId && !!mainDef;
    const build = () => {
        const setDef = cat.sets.find((s) => s.id === setId);
        if (!setDef || !mainDef) return;
        const gear: GearEntry = {
            kind: data.gearKind,
            id: editingId ?? newGearId(gameId),
            name: echoName || setDef.name,
            setName: setDef.name,
            rarity,
            cost: slot.cost,
            slot: slot.cost == null ? slot.id : undefined,
            mainStat: { key: mainDef.key, label: mainDef.label, value: mainValue },
            // Base stat (if this slot has one) comes first, matching the
            // real game's display order — main, base, then random sub-stats.
            subStats: [
                ...(currentBaseDef ? [{ key: currentBaseDef.key, label: currentBaseDef.label, value: baseStatValue }] : []),
                ...subs
                    .filter((s) => canRepeatMain || s.key !== effectiveMainKey)
                    .map((s) => {
                        const d = cat.subs.find((x) => x.key === s.key)!;
                        return { key: s.key, label: d.label, value: s.value };
                    }),
            ],
        };
        if (editingId) {
            updateGear(gameId, gear);
            toast.success(`Updated ${echoName || setDef.name} ${data.gearLabel.toLowerCase()}`);
        } else {
            addGear(gameId, gear);
            toast.success(`Added ${echoName || setDef.name} ${data.gearLabel.toLowerCase()}`);
        }
        onGearAdded?.(gear);
        onDone();
    };

    const fmt = (percent: boolean | undefined, v: number) => (percent ? `${v}%` : `${v}`);

    return (
        <div className="max-h-[72vh] space-y-4 overflow-y-auto scrollbar-thin pr-1">
            <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                    <Label>{slot.cost != null ? 'Cost' : 'Slot'}</Label>
                    <Select value={slotId} onValueChange={changeSlot}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{cat.slots.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label>Set</Label>
                    <SetCombobox sets={selectableSets} value={setId} onChange={changeSet} />
                </div>
                <div className="space-y-1.5">
                    <Label>Rarity</Label>
                    <Select value={String(rarity)} onValueChange={(v) => changeRarity(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{cat.rarities.map((r) => <SelectItem key={r} value={String(r)}>{r}★</SelectItem>)}</SelectContent>
                    </Select>
                </div>
            </div>

            {/* Echo identity — WuWa only, optional: which specific real echo
                this is, filtered to the sourced catalog entries that match the
                Cost + Set already chosen above. */}
            {data.gearKind === 'echo' && (
                <div className="space-y-1.5">
                    <Label>Echo <span className="font-normal text-muted-foreground">(optional — which specific echo)</span></Label>
                    <EchoNameCombobox options={echoOptions} value={echoName} onChange={setEchoName} />
                </div>
            )}

            {/* Main stat — type chosen, value auto-maxed for the rarity */}
            <div className="space-y-1.5">
                <Label>Main stat <span className="font-normal text-muted-foreground">(auto-maxed)</span></Label>
                <div className="flex items-center gap-2">
                    <Select value={effectiveMainKey} onValueChange={changeMain}>
                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{allowedMains.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="w-24 rounded-md border border-border bg-surface px-3 py-2 text-right text-sm font-medium tabular-nums text-foreground">
                        {fmt(mainDef?.percent, mainValue)}
                    </div>
                </div>
            </div>

            {/* Base stat — WuWa only: type AND value both fixed by cost tier + rarity */}
            {currentBaseDef && (
                <div className="space-y-1.5">
                    <Label>Base stat <span className="font-normal text-muted-foreground">(fixed by cost + rarity)</span></Label>
                    <div className="flex items-center gap-2">
                        <div className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground">{currentBaseDef.label}</div>
                        <div className="w-24 rounded-md border border-border bg-surface px-3 py-2 text-right text-sm font-medium tabular-nums text-foreground">
                            {fmt(currentBaseDef.percent, baseStatValue)}
                        </div>
                    </div>
                </div>
            )}

            {/* Sub stats — each bounded by its per-rarity min/max */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label>Sub-stats <span className="font-normal text-muted-foreground">({subs.length}/{cat.maxSubStats})</span></Label>
                    <Button size="sm" variant="secondary" onClick={addSub} disabled={subs.length >= cat.maxSubStats || availableSubs.length === 0}>
                        <Plus /> Add sub-stat
                    </Button>
                </div>
                {subs.length === 0 && <p className="text-xs text-muted-foreground">Add sub-stats and tune each within its allowed range.</p>}
                {subs.map((s, idx) => {
                    const rg = subRange(s.key);
                    const def = cat.subs.find((x) => x.key === s.key);
                    const others = cat.subs.filter((x) => x.byRarity[rarity] && (x.key === s.key || (!pickedSubKeys.has(x.key) && subAllowed(x.key))));
                    return (
                        <div key={idx} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface p-2">
                            <Select value={s.key} onValueChange={(k) => setSubKey(idx, k)}>
                                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                                <SelectContent>{others.map((o) => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}</SelectContent>
                            </Select>
                            <input
                                type="range"
                                min={rg?.min ?? 0} max={rg?.max ?? 0} step={0.1}
                                value={s.value}
                                onChange={(e) => setSubValue(idx, Number(e.target.value))}
                                className="h-2 flex-1 accent-primary"
                            />
                            <Input
                                type="number" className="w-24" value={s.value}
                                min={rg?.min} max={rg?.max} step={0.1}
                                onChange={(e) => setSubValue(idx, Number(e.target.value))}
                            />
                            <span className="w-16 text-right text-[11px] text-muted-foreground">
                                {rg ? `${fmt(def?.percent, rg.min)}–${fmt(def?.percent, rg.max)}` : ''}
                            </span>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeSub(idx)} aria-label="Remove"><Trash2 /></Button>
                        </div>
                    );
                })}
            </div>

            <DialogFooter>
                <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
                <Button onClick={build} disabled={!canAdd}>{editingId ? 'Save changes' : `Add ${data.gearLabel.toLowerCase()}`}</Button>
            </DialogFooter>
        </div>
    );
}
