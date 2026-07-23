/**
 * Searchable enemy/boss picker + defensive-stat Configure dialog — shared by
 * the Damage Calculator's Inspector ("Target Enemy" panel, bound to the
 * global `useCalcStore().enemy`) and the Rotation Builder (bound to a single
 * `WaveConfig` entry's resolved enemy, independent per wave/rotation).
 * Parameterized by `value`/`onChange` rather than reading a specific store
 * directly, so each caller supplies its own state.
 */
import { useState } from 'react';
import { Search, Target as TargetIcon } from 'lucide-react';
import { Badge, Button, Input, Label, ItemIcon, DialogFooter, DialogClose } from './ui';
import { cn } from '@/lib/utils';
import { iconSrc } from '@/lib/icons';
import { useWindowStore } from '../stores/windowStore';
import { getEnemies, DUMMY, type Enemy } from '../data/enemies';

export function EnemyPicker({ gameId, value, onChange }: { gameId: string; value: Enemy; onChange: (e: Enemy) => void }) {
    const openWindow = useWindowStore((s) => s.openWindow);
    const [query, setQuery] = useState('');
    const enemies = getEnemies(gameId);
    const q = query.trim().toLowerCase();
    const filtered = q ? enemies.filter((e) => e.name.toLowerCase().includes(q)) : enemies;

    return (
        <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Damage results are calculated against this target's DEF and RES.</p>
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search enemies…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {/* This popup window (`WindowHost`/`DialogContent`) has no height
             * cap of its own — without one here, a ~40-entry boss list just
             * grows the whole popup to fill the screen instead of scrolling.
             * `70vh` leaves room for the dialog header + search input above. */}
            <div className="max-h-[70vh] space-y-1.5 overflow-y-auto scrollbar-thin pr-1">
                {filtered.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No enemies match “{query}”.</p>}
                {filtered.map((e) => {
                    const active = e.id === value.id;
                    const isDummy = e.id === 'dummy';
                    // For the selected row, reflect any custom-configured values.
                    const disp = active ? value : e;
                    const overrides = Object.entries(e.resByElement ?? {}) as Array<[string, number]>;
                    return (
                        <div key={e.id} className={cn('flex items-center gap-2 rounded-md border p-2 transition-colors', active ? 'border-primary bg-primary/5' : 'border-border bg-surface')}>
                            <button onClick={() => onChange(e)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                {isDummy ? (
                                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground">
                                        <TargetIcon className="h-5 w-5" />
                                    </div>
                                ) : (
                                    <ItemIcon kind="enemy" size="sm" src={iconSrc(gameId, e.icon)} className="bg-destructive/15 text-destructive" />
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium text-foreground">{disp.name}</div>
                                    <div className="truncate text-xs text-muted-foreground">
                                        Lv{disp.level} · {disp.def} DEF · {disp.res}% RES
                                        {overrides.length > 0 && ` · ${overrides.map(([el, v]) => `${el} ${v}%`).join(', ')}`}
                                    </div>
                                </div>
                            </button>
                            {active && (
                                <div className="flex flex-shrink-0 items-center gap-1.5">
                                    <Button size="sm" variant="secondary" onClick={() => openWindow('Configure enemy', <EnemyConfig gameId={gameId} value={value} onChange={onChange} />)}>Configure</Button>
                                    <Badge variant="secondary">Selected</Badge>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function EnemyConfig({ gameId, value, onChange }: { gameId: string; value: Enemy; onChange: (e: Enemy) => void }) {
    const closeWindow = useWindowStore((s) => s.closeWindow);
    const [level, setLevel] = useState(value.level);
    const [def, setDef] = useState(value.def);
    const [res, setRes] = useState(value.res);

    // The catalog preset for the current enemy (dummy → 0/0/0).
    const preset = getEnemies(gameId).find((e) => e.id === value.id) ?? DUMMY;
    // Real per-element RES overrides — read-only here since the "RES %"
    // field above only edits the flat fallback value used for any element
    // WITHOUT its own override; showing these makes clear the actual RES
    // applied against a specific attacking element may differ from that
    // flat number.
    const resOverrides = Object.entries(preset.resByElement ?? {}) as Array<[string, number]>;

    const apply = () => {
        onChange({ ...value, level: Number(level) || 0, def: Number(def) || 0, res: Number(res) || 0 });
        closeWindow();
    };
    const revert = () => {
        setLevel(preset.level); setDef(preset.def); setRes(preset.res);
        onChange({ ...value, level: preset.level, def: preset.def, res: preset.res });
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Custom defenses for <span className="text-foreground">{value.name}</span>. Set to 0 for a bare training dummy (raw damage).
            </p>
            <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                    <Label>Level</Label>
                    <Input type="number" value={level} onChange={(e) => setLevel(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                    <Label>DEF</Label>
                    <Input type="number" value={def} onChange={(e) => setDef(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                    <Label>RES %</Label>
                    <Input type="number" value={res} onChange={(e) => setRes(Number(e.target.value))} />
                </div>
            </div>
            {resOverrides.length > 0 && (
                <div className="space-y-1.5 rounded-md border border-border bg-surface p-2.5">
                    <p className="text-xs text-muted-foreground">
                        This target has real per-element RES that differs from the flat value above — the calculator uses these against a matching attack, and the flat RES % only for every other element:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {resOverrides.map(([el, v]) => <Badge key={el} variant="outline">{el} {v}%</Badge>)}
                    </div>
                </div>
            )}
            <DialogFooter>
                <Button variant="ghost" onClick={revert}>Revert to default</Button>
                <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
                <Button onClick={apply}>Apply</Button>
            </DialogFooter>
        </div>
    );
}
