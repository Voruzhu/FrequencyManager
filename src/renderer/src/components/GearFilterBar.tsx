import { Search, X, ArrowUp, ArrowDown } from 'lucide-react';
import { Input, Button, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui';
import type { GameData } from '../data/gameData';
import { type GearFilters, slotOptions, sortableStatOptions } from '@/lib/gearFilters';

/**
 * Search + filter row for a game's gear (echoes/artifacts): set, main stat,
 * sub-stat, rarity, and slot/cost — all driven by the active game's
 * `gearCatalog`, so the options are exactly what that game supports.
 */
export function GearFilterBar({
    data, filters, onChange, onReset, active,
}: {
    data: GameData;
    filters: GearFilters;
    onChange: <K extends keyof GearFilters>(key: K, value: GearFilters[K]) => void;
    onReset: () => void;
    active: boolean;
}) {
    const cat = data.gearCatalog;
    const slots = slotOptions(data);
    const sortStats = sortableStatOptions(data);

    return (
        <div className="space-y-2">
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    className="pl-8"
                    placeholder={`Search ${data.gearLabelPlural.toLowerCase()} by name or set…`}
                    value={filters.query}
                    onChange={(e) => onChange('query', e.target.value)}
                />
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Select value={filters.set} onValueChange={(v) => onChange('set', v)}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Set" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All sets</SelectItem>
                        {cat.sets.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={filters.main} onValueChange={(v) => onChange('main', v)}>
                    <SelectTrigger className="w-36"><SelectValue placeholder="Main stat" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Any main stat</SelectItem>
                        {cat.mains.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={filters.sub} onValueChange={(v) => onChange('sub', v)}>
                    <SelectTrigger className="w-36"><SelectValue placeholder="Sub-stat" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Any sub-stat</SelectItem>
                        {cat.subs.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={filters.rarity} onValueChange={(v) => onChange('rarity', v)}>
                    <SelectTrigger className="w-24"><SelectValue placeholder="Rarity" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Any★</SelectItem>
                        {cat.rarities.map((r) => <SelectItem key={r} value={String(r)}>{r}★</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={filters.slot} onValueChange={(v) => onChange('slot', v)}>
                    <SelectTrigger className="w-32"><SelectValue placeholder={cat.slots[0]?.cost != null ? 'Cost' : 'Slot'} /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{cat.slots[0]?.cost != null ? 'Any cost' : 'Any slot'}</SelectItem>
                        {slots.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={filters.sortStat} onValueChange={(v) => onChange('sortStat', v)}>
                    <SelectTrigger className="w-36"><SelectValue placeholder="Sort by" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="none">Unsorted</SelectItem>
                        {sortStats.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                    </SelectContent>
                </Select>
                {filters.sortStat !== 'none' && (
                    <Button
                        variant="secondary" size="sm"
                        onClick={() => onChange('sortDir', filters.sortDir === 'desc' ? 'asc' : 'desc')}
                        title={filters.sortDir === 'desc' ? 'Highest first — click for lowest first' : 'Lowest first — click for highest first'}
                    >
                        {filters.sortDir === 'desc' ? <ArrowDown /> : <ArrowUp />} {filters.sortDir === 'desc' ? 'Highest' : 'Lowest'}
                    </Button>
                )}
                {active && (
                    <Button variant="ghost" size="sm" onClick={onReset} className="text-muted-foreground">
                        <X /> Clear filters
                    </Button>
                )}
            </div>
        </div>
    );
}
