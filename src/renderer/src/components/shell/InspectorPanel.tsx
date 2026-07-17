import { useState } from 'react';
import { PanelRight, MousePointerSquareDashed, ArrowLeft, AlertTriangle, Plus, X, Search, Skull, Star, Target as TargetIcon, Users } from 'lucide-react';
import {
    Badge, Button, Input, Label, ItemIcon, EmptyState, Separator, ScrollArea, DialogFooter, DialogClose, Switch,
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../ui';
import { cn } from '@/lib/utils';
import { iconSrc } from '@/lib/icons';
import { useGearFilters } from '@/lib/gearFilters';
import { resolveParty, scopeLabel } from '@/lib/party';
import { useSelectionStore, type SelectedItem } from '../../stores/selectionStore';
import { useCalcStore } from '../../stores/calcStore';
import { useGameStore } from '../../stores/gameStore';
import { useWindowStore } from '../../stores/windowStore';
import { useOwnedInventory } from '../../stores/inventoryStore';
import { usePartyStore } from '../../stores/partyStore';
import { useLoadoutStore } from '../../stores/loadoutStore';
import { useSequenceStore } from '../../stores/sequenceStore';
import type { getGameData} from '../../data/gameData';
import { useGameData, gearIcon, setIconFor, echoItemIconFor, statLabel, formatCatalogValue, catalogStatLabel, getSequenceLabel, SEQUENCE_MAX, type CharacterData, type WeaponData, type GearData } from '../../data/gameData';
import { getBuffs } from '../../data/buffs';
import { computeBuildStats, elemKey, activeSetBonuses } from '../../data/optimizer';
import { getEnemies, DUMMY } from '../../data/enemies';
import { getWeaponScaling, atkAtLevel, secAtLevel, refineMul, hasRefinement } from '../../data/weaponScaling';
import { TalentsWindow } from '../CharacterWindows';
import { GearCard, GearStatsList } from '../GearCard';
import { GearFilterBar } from '../GearFilterBar';
import { AddGearWindow } from '../InventoryWindows';
import { gearToInitial } from '@/lib/gearEdit';

export function InspectorPanel() {
    const { content, setOpen } = useSelectionStore();
    const calcCharId = useCalcStore((s) => s.characterId);
    const activeGameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(activeGameId);
    const calcChar = data.characters.find((c) => c.id === calcCharId) ?? null;

    const title = content?.kind === 'gear-picker' ? `Equip ${data.gearLabel}`
        : content?.kind === 'weapon-picker' ? 'Equip weapon'
            : content?.kind === 'buffs' ? 'Custom buffs'
                : content?.kind === 'enemy' ? 'Target enemy'
                    : content?.kind === 'party' ? 'Party setup'
                        : content?.kind === 'set-bonus' ? 'Set bonus'
                            : 'Inspector';
    const isPicker = content != null && content.kind !== 'item';

    return (
        <aside className="flex h-full min-h-0 flex-col border-l border-border bg-background">
            <header className="flex h-10 flex-shrink-0 items-center justify-between border-b border-border px-3">
                <div className="flex items-center gap-1.5">
                    {isPicker && calcChar && (
                        <button onClick={() => useSelectionStore.getState().showItem(calcChar)} className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground" aria-label="Back">
                            <ArrowLeft className="h-4 w-4" />
                        </button>
                    )}
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
                </div>
                <button onClick={() => setOpen(false)} className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground" aria-label="Collapse inspector">
                    <PanelRight className="h-4 w-4" />
                </button>
            </header>

            <ScrollArea className="min-h-0 flex-1">
                <div className="p-4">
                    {!content && (
                        <EmptyState icon={MousePointerSquareDashed} title="Nothing selected" description="Select a character, weapon or gear to inspect it here." />
                    )}
                    {content?.kind === 'item' && <ItemView item={content.item} />}
                    {content?.kind === 'gear-picker' && <GearPicker data={data} />}
                    {content?.kind === 'weapon-picker' && <WeaponPicker data={data} />}
                    {content?.kind === 'buffs' && <BuffPicker gameId={activeGameId} />}
                    {content?.kind === 'enemy' && <EnemyPicker gameId={activeGameId} />}
                    {content?.kind === 'party' && <PartySetup data={data} character={calcChar} />}
                    {content?.kind === 'set-bonus' && <SetBonusPicker data={data} character={calcChar} />}
                </div>
            </ScrollArea>
        </aside>
    );
}

// ── Item detail ─────────────────────────────────────────────────────────────

function ItemView({ item }: { item: SelectedItem }) {
    if (item.kind === 'character') return <CharacterView c={item} />;
    if (item.kind === 'weapon') return <WeaponView key={item.id} w={item} />;
    return <GearView g={item} />;
}

function Header({ kind, name, rarity, meta, src, badgeSrc }: { kind: 'character' | 'weapon' | 'echo' | 'artifact'; name: string; rarity: number; meta: string; src?: string; badgeSrc?: string }) {
    return (
        <div className="flex items-center gap-3">
            <ItemIcon kind={kind} size="lg" rarity={rarity} src={src} badgeSrc={badgeSrc} />
            <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-foreground">{name}</h2>
                <p className="text-xs text-muted-foreground">{meta}</p>
            </div>
        </div>
    );
}

function CharacterView({ c }: { c: CharacterData }) {
    const activeGameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(activeGameId);
    const { characterId, buffs, pickCharacter } = useCalcStore();
    const { showWeaponPicker, showGearPicker, showParty } = useSelectionStore();
    const openWindow = useWindowStore((s) => s.openWindow);
    const owned = useOwnedInventory(activeGameId);
    const isCalcChar = characterId === c.id;
    // Read from loadoutStore (reactive) — the single source of truth for what a
    // character has equipped. calcStore.equipped mirrors this for whichever
    // character is currently picked (kept in sync on every equip mutation), so
    // this is correct for the active character AND any other one you're just
    // inspecting, and genuinely updates live instead of reading `c.equipped` (a
    // static bundle snapshot that's never mutated after load).
    const eq = useLoadoutStore((s) => s.byGame[activeGameId]?.[c.id]) ?? { gearIds: [] };
    // Clicking to equip a weapon/gear (or edit the party) on ANY character adopts
    // it as the working build character first — this is what makes the buttons work
    // no matter which character (or game) you're currently inspecting.
    const openWeaponPicker = () => { if (!isCalcChar) pickCharacter(c); showWeaponPicker(); };
    const openGearPicker = () => { if (!isCalcChar) pickCharacter(c); showGearPicker(); };
    const openParty = () => { if (!isCalcChar) pickCharacter(c); showParty(); };
    const openTalents = () => { if (!isCalcChar) pickCharacter(c); openWindow('Talents', <TalentsWindow />); };
    const weapon = data.weapons.find((w) => w.id === eq.weaponId);
    // Calc-character gear are OWNED instances; a non-calc sheet may reference
    // catalog sample gear — resolve against both.
    const findGear = (id: string) => owned.gear.find((g) => g.id === id) ?? data.gear.find((g) => g.id === id);
    const gear = eq.gearIds.map(findGear).filter(Boolean) as GearData[];
    // Stats follow the game module's catalog; the calculator character shows
    // its LIVE build (gear + buffs + weapon), others show their sheet build.
    const stats = computeBuildStats(c, gear, isCalcChar ? buffs : [], weapon, data.statCatalog);

    return (
        <div className="space-y-4">
            <Header kind="character" name={c.name} rarity={c.rarity} meta={`${c.element} · ${c.weaponType} · ${c.rarity}★`} src={iconSrc(activeGameId, c.icon)} />
            <section>
                <SectionLabel>Stats{isCalcChar && <span className="ml-1 font-normal normal-case text-muted-foreground/70">(with gear + buffs)</span>}</SectionLabel>
                <div className="grid grid-cols-2 gap-1.5">
                    {data.statCatalog.map((def) => (
                        <Stat key={def.key} label={catalogStatLabel(def, c.element)} value={formatCatalogValue(def, stats[def.key] ?? 0)} />
                    ))}
                </div>
            </section>
            <section>
                <SectionLabel>Equipped</SectionLabel>
                <div className="space-y-2">
                    <button
                        onClick={openWeaponPicker}
                        className="flex w-full items-center gap-2 rounded-md border border-border bg-surface p-2 text-left transition-colors hover:bg-surface-2"
                        title="Change weapon"
                    >
                        <ItemIcon kind="weapon" size="md" rarity={weapon?.rarity ?? 4} src={iconSrc(activeGameId, weapon?.icon)} />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-foreground">{weapon?.name ?? 'No weapon'}</div>
                            {weapon && <div className="text-xs text-muted-foreground">{weapon.weaponType} · {weapon.baseAtk} ATK</div>}
                        </div>
                        <span className="text-xs text-primary">Change</span>
                    </button>
                    <button
                        onClick={openGearPicker}
                        className="flex w-full flex-wrap items-center gap-2 rounded-md border border-dashed border-border p-2 transition-colors hover:bg-surface-2"
                        title="Change gear"
                    >
                        {gear.map((g) => <ItemIcon key={g.id} kind={g.kind} size="sm" rarity={g.rarity} src={iconSrc(activeGameId, gearIcon(data, g))} badgeSrc={echoItemIconFor(g) ? iconSrc(activeGameId, setIconFor(data, g)) : undefined} />)}
                        {gear.length === 0 && <span className="text-xs text-muted-foreground">Click to equip gear</span>}
                    </button>
                </div>
            </section>
            <section>
                <SectionLabel>Skills <span className="ml-1 font-normal normal-case text-muted-foreground/70">({c.skills.length})</span></SectionLabel>
                <div className="space-y-1.5">
                    {c.skills.map((s) => (
                        <div key={s.id} className="rounded-md border border-border bg-surface p-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-1">
                                <span className="text-sm font-medium text-foreground">{s.name}</span>
                                <span className="flex items-center gap-1.5">
                                    <Badge variant="secondary">{s.type}</Badge>
                                    <Badge variant="outline" title="Stat this skill scales off">{(s.scaling ?? 'atk').toUpperCase()}-scaling</Badge>
                                    {s.approx && <Badge variant="outline" title="Generic value — no precise data authored for this character yet">generic</Badge>}
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
                            <p className="mt-1 text-xs text-primary">Multiplier ×{s.multiplier.toFixed(1)}</p>
                        </div>
                    ))}
                </div>
            </section>
            <div className="space-y-2">
                <Button variant="secondary" className="w-full" onClick={openParty}>
                    <Users /> Edit Party
                </Button>
                <Button variant="secondary" className="w-full" onClick={openTalents}>
                    <Star /> Talents
                </Button>
            </div>
        </div>
    );
}

function WeaponView({ w }: { w: WeaponData }) {
    const activeGameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(activeGameId);
    const showItem = useSelectionStore((s) => s.showItem);
    const [query, setQuery] = useState('');
    const [level, setLevel] = useState(90);
    // This weapon's refinement is a REAL, persisted setting only when it's the
    // one actually equipped on the active calc character (via calcStore, mirrored
    // into loadoutStore) — that's the only case where a rank has anywhere to live.
    // Inspecting any other weapon (e.g. browsing Inventory) is preview-only: local
    // state, always starting at R1 (the component remounts per-weapon via `key`
    // in `ItemView`, so this never leaks the last-inspected weapon's rank).
    const calcCharId = useCalcStore((s) => s.characterId);
    const calcEquipped = useCalcStore((s) => s.equipped);
    const isEquippedOnCalcChar = !!calcCharId && calcEquipped.weaponId === w.id;
    const [localRefine, setLocalRefine] = useState(1);
    const refine = isEquippedOnCalcChar ? (calcEquipped.weaponRefine ?? 1) : localRefine;
    const setRefine = isEquippedOnCalcChar ? (r: number) => useCalcStore.getState().setWeaponRefine(r) : setLocalRefine;

    const sc = getWeaponScaling(activeGameId, w.id);
    const baseAtk = atkAtLevel(sc, w.baseAtk, level);
    const secVal = secAtLevel(sc, w.secondaryValue, level);
    const rMul = refineMul(sc, refine);
    const canRefine = hasRefinement(sc);
    // Elemental Mastery secondaries are flat; everything else is a percentage.
    const secIsFlat = /mastery/i.test(w.secondaryStat);

    const q = query.trim().toLowerCase();
    const matches = q ? data.weapons.filter((x) => x.id !== w.id && x.name.toLowerCase().includes(q)).sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name)).slice(0, 8) : [];

    return (
        <div className="space-y-4">
            <Header kind="weapon" name={w.name} rarity={w.rarity} meta={`${w.weaponType} · ${w.rarity}★`} src={iconSrc(activeGameId, w.icon)} />

            {/* Search to inspect a different weapon */}
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder="Inspect another weapon…" value={query} onChange={(e) => setQuery(e.target.value)} />
                {matches.length > 0 && (
                    <div className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto scrollbar-thin rounded-md border border-border bg-popover p-1 shadow-elevation-2">
                        {matches.map((m) => (
                            <button key={m.id} onClick={() => { showItem(m); setQuery(''); }}
                                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-surface-2">
                                <ItemIcon kind="weapon" size="sm" rarity={m.rarity} src={iconSrc(activeGameId, m.icon)} />
                                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{m.name}</span>
                                <span className="text-xs text-muted-foreground">{m.weaponType}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <Separator />

            {/* Level + refinement configuration */}
            {sc ? (
                <section className="space-y-3">
                    <div>
                        <div className="mb-1 flex items-center justify-between">
                            <SectionLabel className="mb-0">Level</SectionLabel>
                            <span className="text-xs font-medium tabular-nums text-foreground">Lv {level}</span>
                        </div>
                        <input type="range" min={1} max={90} step={1} value={level} onChange={(e) => setLevel(Number(e.target.value))} className="h-2 w-full accent-primary" />
                        <div className="mt-1 flex flex-wrap gap-1">
                            {[1, 20, 40, 60, 80, 90].map((lv) => (
                                <button key={lv} onClick={() => setLevel(lv)}
                                    className={cn('rounded border px-1.5 py-0.5 text-[11px] transition-colors', level === lv ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-surface text-muted-foreground hover:bg-surface-2')}>
                                    {lv}
                                </button>
                            ))}
                        </div>
                    </div>
                    {canRefine && (
                        <div>
                            <SectionLabel>Refinement</SectionLabel>
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((r) => (
                                    <button key={r} onClick={() => setRefine(r)}
                                        className={cn('flex-1 rounded-md border py-1 text-xs font-medium transition-colors', refine === r ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-surface text-muted-foreground hover:bg-surface-2')}>
                                        R{r}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            ) : (
                <p className="text-xs text-muted-foreground">Showing Lv 90 stats — per-level scaling isn't available for this weapon.</p>
            )}

            <div className="grid grid-cols-2 gap-1.5">
                <Stat label="Base ATK" value={String(baseAtk)} />
                <Stat label={w.secondaryStat} value={secIsFlat ? String(secVal) : `${secVal}%`} />
            </div>

            {/* Passive self-buffs (scaled to the selected refinement) */}
            {w.selfBuffs && w.selfBuffs.length > 0 && (
                <section>
                    <SectionLabel>Passive{canRefine && <span className="ml-1 font-normal normal-case text-muted-foreground/70">(R{refine})</span>}</SectionLabel>
                    <div className="flex flex-wrap gap-1">
                        {w.selfBuffs.map((sb, i) => {
                            const val = Math.round(sb.value * rMul * 10) / 10;
                            const unconditional = sb.conditional === false;
                            return (
                                <span key={i}
                                    className={cn('rounded-md border px-2 py-0.5 text-xs', unconditional ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-dashed border-border bg-surface text-muted-foreground')}
                                    title={unconditional ? 'Always active' : 'Conditional — triggered in combat'}>
                                    {sb.label} +{val}
                                </span>
                            );
                        })}
                    </div>
                </section>
            )}
            {/* Stat conversions (e.g. ATK from % of Max HP / EM) — always-on. */}
            {w.conversions && w.conversions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {w.conversions.map((cv, i) => (
                        <span key={i} className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-foreground" title="Always active (stat conversion)">
                            {cv.label ?? `${statLabel(cv.to)} from ${cv.pct}% ${statLabel(cv.from)}`}
                        </span>
                    ))}
                </div>
            )}
            {w.passive && <p className="text-xs leading-relaxed text-muted-foreground">{w.passive}</p>}
        </div>
    );
}

function GearView({ g }: { g: GearData }) {
    const activeGameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(activeGameId);
    const owned = useOwnedInventory(activeGameId);
    // `g` is a snapshot captured when this item was selected — re-resolve it
    // live by id so editing it (Edit gear -> Save changes) reflects here
    // immediately, instead of showing stale values until the user reselects.
    // Falls back to the snapshot for unowned catalog sample gear.
    const live = owned.gear.find((x) => x.id === g.id) ?? g;
    const { openWindow, closeWindow } = useWindowStore();
    const meta = live.cost != null ? `Cost ${live.cost} · ${live.rarity}★` : `${live.slot ?? ''} · ${live.rarity}★`;
    const edit = () => openWindow(
        `Edit ${data.gearLabel.toLowerCase()}`,
        <AddGearWindow initial={gearToInitial(live, data.gearCatalog)} editingId={live.id} onDone={closeWindow} />,
    );
    return (
        <div className="space-y-4">
            <Header kind={live.kind} name={live.name} rarity={live.rarity} meta={meta} src={iconSrc(activeGameId, gearIcon(data, live))} badgeSrc={echoItemIconFor(live) ? iconSrc(activeGameId, setIconFor(data, live)) : undefined} />
            <div className="rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs">
                <span className="text-muted-foreground">Set: </span><span className="text-primary">{live.setName}</span>
            </div>
            <GearStatsList g={live} />
            <Button variant="secondary" className="w-full" onClick={edit}>Edit {data.gearLabel.toLowerCase()}</Button>
        </div>
    );
}

// ── Gear picker ─────────────────────────────────────────────────────────────

function GearPicker({ data }: { data: ReturnType<typeof getGameData> }) {
    const activeGameId = useGameStore((s) => s.activeGameId);
    const owned = useOwnedInventory(activeGameId);
    const { equipped, characterId, equipGear, unequipGear } = useCalcStore();
    const { filters, set, reset, active, filtered } = useGearFilters(owned.gear);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const openWindow = useWindowStore((s) => s.openWindow);
    // Reactive to every character's loadout, to spot gear already worn elsewhere.
    const gameLoadouts = useLoadoutStore((s) => s.byGame[activeGameId]) ?? {};
    const toggle = (id: string) => setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) { next.delete(id); } else { next.add(id); }
        return next;
    });
    // Characters (other than the active one) whose OWN loadout already includes this gear id.
    const ownersOf = (gearId: string) =>
        Object.entries(gameLoadouts)
            .filter(([cid, l]) => cid !== characterId && l.gearIds.includes(gearId))
            .map(([cid]) => data.characters.find((c) => c.id === cid))
            .filter(Boolean) as CharacterData[];

    if (owned.gear.length === 0) return <EmptyState icon={AlertTriangle} title={`No ${data.gearLabelPlural.toLowerCase()} owned`} description={`Add ${data.gearLabelPlural.toLowerCase()} in the Inventory screen first.`} />;

    // Already-equipped-on-this-character pieces first, so switching one out
    // is a glance away instead of a scroll through the whole collection —
    // everything else keeps its existing (filtered/sorted) relative order.
    const ordered = [...filtered].sort((a, b) => Number(equipped.gearIds.includes(b.id)) - Number(equipped.gearIds.includes(a.id)));

    return (
        <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
                Tap to equip onto <span className="text-foreground">{data.characters.find((c) => c.id === characterId)?.name ?? 'character'}</span>. Up to {data.maxGear}.
            </p>
            <GearFilterBar data={data} filters={filters} onChange={set} onReset={reset} active={active} />
            <div className="space-y-2">
                {ordered.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No {data.gearLabelPlural.toLowerCase()} match these filters.</p>}
                {ordered.map((g) => {
                    const here = equipped.gearIds.includes(g.id);
                    const owners = here ? [] : ownersOf(g.id);
                    return (
                        <GearCard
                            key={g.id}
                            g={g}
                            gameId={activeGameId}
                            highlight={here}
                            expanded={expanded.has(g.id)}
                            onToggleExpand={() => toggle(g.id)}
                            actions={
                                here ? (
                                    <Button size="sm" variant="secondary" onClick={() => unequipGear(g.id)}>Unequip</Button>
                                ) : owners.length > 0 ? (
                                    <Button
                                        size="sm" variant="outline" className="border-warning/40 text-warning hover:bg-warning/10"
                                        onClick={() => openWindow('Already equipped', <AlreadyEquippedWindow g={g} gameId={activeGameId} owners={owners} onEquip={() => equipGear(g.id)} />)}
                                    >
                                        <AlertTriangle className="h-3.5 w-3.5" /> Already equipped
                                    </Button>
                                ) : (
                                    <Button size="sm" variant="default" onClick={() => equipGear(g.id)}>Equip</Button>
                                )
                            }
                        />
                    );
                })}
            </div>
        </div>
    );
}

/** Popup for a gear piece another character already has equipped — purely informational; Equip proceeds unchanged. */
function AlreadyEquippedWindow({ g, gameId, owners, onEquip }: { g: GearData; gameId: string; owners: CharacterData[]; onEquip: () => void }) {
    const closeWindow = useWindowStore((s) => s.closeWindow);
    const data = useGameData(gameId);
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <ItemIcon kind={g.kind} size="md" rarity={g.rarity} src={iconSrc(gameId, gearIcon(data, g))} badgeSrc={echoItemIconFor(g) ? iconSrc(gameId, setIconFor(data, g)) : undefined} />
                <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{g.name}</div>
                    <div className="text-xs text-muted-foreground">{g.setName}</div>
                </div>
            </div>
            <p className="text-sm text-muted-foreground">
                Already equipped by:
            </p>
            <div className="space-y-1.5">
                {owners.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 rounded-md border border-border bg-surface p-2">
                        <ItemIcon kind="character" size="sm" rarity={c.rarity} src={iconSrc(gameId, c.icon)} />
                        <span className="truncate text-sm text-foreground">{c.name}</span>
                    </div>
                ))}
            </div>
            <DialogFooter>
                <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
                <Button onClick={() => { onEquip(); closeWindow(); }}>Equip anyway</Button>
            </DialogFooter>
        </div>
    );
}

// ── Weapon picker ───────────────────────────────────────────────────────────

function WeaponPicker({ data }: { data: ReturnType<typeof getGameData> }) {
    const activeGameId = useGameStore((s) => s.activeGameId);
    const owned = useOwnedInventory(activeGameId);
    const { characterId, equipped, equipWeapon } = useCalcStore();
    const [query, setQuery] = useState('');
    const character = data.characters.find((c) => c.id === characterId);
    if (!character) return <EmptyState icon={AlertTriangle} title="No character" description="Pick a character in the Damage Calculator first." />;

    const q = query.trim().toLowerCase();
    // Highest rarity first by default, alphabetical within the same rarity.
    const typeWeapons = owned.weapons.filter((w) => w.weaponType === character.weaponType).sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
    const weapons = q ? typeWeapons.filter((w) => w.name.toLowerCase().includes(q)) : typeWeapons;
    return (
        <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Your {character.weaponType} weapons for <span className="text-foreground">{character.name}</span>.</p>
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder={`Search ${character.weaponType} weapons…`} value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {typeWeapons.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No owned {character.weaponType} weapons — add one in the Inventory screen.</p>}
            {typeWeapons.length > 0 && weapons.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No weapons match “{query}”.</p>}
            {weapons.map((w) => {
                const on = equipped.weaponId === w.id;
                return (
                    <div key={w.id} className={cn('flex items-center gap-2 rounded-md border p-2', on ? 'border-primary bg-primary/5' : 'border-border bg-surface')}>
                        <ItemIcon kind="weapon" size="md" rarity={w.rarity} src={iconSrc(activeGameId, w.icon)} />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-foreground">{w.name}</div>
                            <div className="truncate text-xs text-muted-foreground">{w.baseAtk} ATK · {w.secondaryValue}% {w.secondaryStat}</div>
                        </div>
                        <Button size="sm" variant={on ? 'secondary' : 'default'} onClick={() => equipWeapon(w.id)}>{on ? 'Equipped' : 'Equip'}</Button>
                    </div>
                );
            })}
        </div>
    );
}

// ── Buff picker ─────────────────────────────────────────────────────────────

function BuffPicker({ gameId }: { gameId: string }) {
    const { buffs: active, addBuff, removeBuff, updateBuffValue } = useCalcStore();
    const { basic, character } = getBuffs(gameId);
    const [pending, setPending] = useState<Record<string, number>>({});
    const [query, setQuery] = useState('');
    const activeOf = (id: string) => active.find((b) => b.id === id);

    const q = query.trim().toLowerCase();
    const match = (b: { name: string; source?: string; stat: string }) =>
        !q || b.name.toLowerCase().includes(q) || (b.source ?? '').toLowerCase().includes(q) || statLabel(b.stat).toLowerCase().includes(q);
    const characterF = character.filter(match);
    const basicF = basic.filter(match);

    return (
        <div className="space-y-4">
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search buffs…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            {q && characterF.length === 0 && basicF.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">No buffs match “{query}”.</p>
            )}
            {/* Character buffs — fixed values */}
            <section className={characterF.length === 0 ? 'hidden' : undefined}>
                <SectionLabel>From characters</SectionLabel>
                <div className="space-y-2">
                    {character.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No character buffs.</p>
                    ) : characterF.map((b) => {
                        const on = !!activeOf(b.id);
                        return (
                            <div key={b.id} className={cn('flex items-center gap-2 rounded-md border p-2', on ? 'border-primary bg-primary/5' : 'border-border bg-surface')}>
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium text-foreground">{b.name}</div>
                                    <div className="text-xs text-muted-foreground">{b.source} · +{b.value} {statLabel(b.stat)}</div>
                                </div>
                                <Button size="sm" variant={on ? 'secondary' : 'default'} onClick={() => (on ? removeBuff(b.id) : addBuff(b))}>{on ? 'Remove' : 'Add'}</Button>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Basic buffs — user-configurable value */}
            <section className={basicF.length === 0 ? 'hidden' : undefined}>
                <SectionLabel>Basic buffs</SectionLabel>
                <p className="mb-2 text-xs text-muted-foreground">Set your own value, then Add.</p>
                <div className="space-y-2">
                    {basicF.map((b) => {
                        const ab = activeOf(b.id);
                        const on = !!ab;
                        const value = on ? ab.value : (pending[b.id] ?? b.value);
                        const setValue = (v: number) => (on ? updateBuffValue(b.id, v) : setPending((p) => ({ ...p, [b.id]: v })));
                        return (
                            <div key={b.id} className={cn('flex items-center gap-2 rounded-md border p-2', on ? 'border-primary bg-primary/5' : 'border-border bg-surface')}>
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-medium text-foreground">{b.name}</div>
                                    <div className="text-xs text-muted-foreground">{statLabel(b.stat)}</div>
                                </div>
                                <Input type="number" className="h-8 w-20" value={value} onChange={(e) => setValue(Number(e.target.value))} />
                                <Button size="sm" variant={on ? 'secondary' : 'default'} onClick={() => (on ? removeBuff(b.id) : addBuff({ ...b, value }))}>{on ? 'Remove' : 'Add'}</Button>
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}

// ── Enemy picker ────────────────────────────────────────────────────────────

function EnemyPicker({ gameId }: { gameId: string }) {
    const { enemy, setEnemy } = useCalcStore();
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
            <div className="space-y-1.5">
                {filtered.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No enemies match “{query}”.</p>}
                {filtered.map((e) => {
                    const active = e.id === enemy.id;
                    const isDummy = e.id === 'dummy';
                    // For the selected row, reflect any custom-configured values.
                    const disp = active ? enemy : e;
                    return (
                        <div key={e.id} className={cn('flex items-center gap-2 rounded-md border p-2 transition-colors', active ? 'border-primary bg-primary/5' : 'border-border bg-surface')}>
                            <button onClick={() => setEnemy(e)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                <div className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md', isDummy ? 'bg-surface-2 text-muted-foreground' : 'bg-destructive/15 text-destructive')}>
                                    {isDummy ? <TargetIcon className="h-5 w-5" /> : <Skull className="h-5 w-5" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium text-foreground">{disp.name}</div>
                                    <div className="text-xs text-muted-foreground">Lv{disp.level} · {disp.def} DEF · {disp.res}% RES</div>
                                </div>
                            </button>
                            {active && (
                                <div className="flex flex-shrink-0 items-center gap-1.5">
                                    <Button size="sm" variant="secondary" onClick={() => openWindow('Configure enemy', <EnemyConfig />)}>Configure</Button>
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

/**
 * Lets the user declare which Sonata/Artifact sets they want the optimizer
 * to build toward — narrows the search POOL to just these sets' pieces (see
 * `run()` in `CalculatorScreen.tsx`); the resulting bonus itself is derived
 * from each candidate combo's own real gear (`activeSetBonuses` in the
 * shared engine), not assumed from this selection. Empty selection (the
 * default) keeps the old, unconstrained free-search behavior.
 *
 * How many sets can be selected at once depends on each set's OWN piece
 * threshold, not a flat count: a normal set needs at least 2 pieces for any
 * bonus, so two of those already use up 4 of the 5 slots. But a real
 * 1pc-threshold set (WW's Shadow of Shattered Dreams, Lucy/Rebecca-only)
 * only costs 1 slot, leaving room for two more 2pc sets — 1+2+2 = 5, a
 * genuinely valid and often-optimal split for those two characters. Tracked
 * via `minPiecesFor`/`usedBudget` below rather than a hardcoded "2 sets max".
 */
function SetBonusPicker({ data, character }: { data: ReturnType<typeof getGameData>; character: CharacterData | null }) {
    const { requiredSets, setRequiredSets } = useCalcStore();
    const [query, setQuery] = useState('');
    const q = query.trim().toLowerCase();
    const filtered = q ? data.setBonuses.filter((s) => s.name.toLowerCase().includes(q)) : data.setBonuses;
    // The real minimum piece cost to get ANY bonus from a set — 1 for a real
    // 1pc-threshold set, 2 for any normal 2pc/5pc-tier set (a single piece of
    // those grants nothing).
    const minPiecesFor = (sb: { pieces: number }) => Math.min(sb.pieces, 2);
    const usedBudget = requiredSets.reduce((sum, name) => {
        const sb = data.setBonuses.find((s) => s.name === name);
        return sum + (sb ? minPiecesFor(sb) : 2);
    }, 0);
    const ownElemKey = character ? elemKey(character.element) : null;

    // A set's per-attack-element DMG buff (e.g. Sierra Gale's Aero DMG) only
    // ever benefits a character who actually deals that element — a
    // mismatched one (Lucy, Spectro, running an Aero set) gets none of it,
    // even though the set's OTHER stats (ATK%, Crit Rate, etc.) still apply
    // normally. Detected by stat key shape: any `<element>Dmg` key that
    // isn't the generic `elemDmg` slot and isn't the character's own.
    const hasMismatchedElementDmg = (buffs: Array<{ stat: string }>) =>
        !!ownElemKey && buffs.some((b) => b.stat.endsWith('Dmg') && b.stat !== 'elemDmg' && b.stat !== ownElemKey);

    // Character-exclusive collab sets (e.g. Shadow of Shattered Dreams,
    // Rebecca/Lucy-only) never activate for anyone else, and unlike an
    // off-element mismatch there's no other stat left to gain — selecting
    // one for an ineligible character would narrow the optimizer's search
    // to gear that provides ZERO real benefit, so this is disabled outright
    // rather than just warned about.
    const restrictedOut = (sb: (typeof data.setBonuses)[number]) =>
        !!sb.restrictedToCharacters && !!character && !sb.restrictedToCharacters.includes(character.name);

    const toggle = (name: string) => {
        setRequiredSets(requiredSets.includes(name) ? requiredSets.filter((s) => s !== name) : [...requiredSets, name]);
    };

    return (
        <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
                Tell the optimizer which set(s) you want active — it narrows the search to gear from these sets; the bonus actually counted always matches what your build's real piece counts earn. Pick 1 normal set to search toward its full 5pc, or 2 to split 2pc + 2pc. A 1pc-threshold set (like Shadow of Shattered Dreams) only costs 1 slot, so it can join alongside two 2pc sets. Leave empty to search freely, with no set assumed.
            </p>
            {requiredSets.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    {requiredSets.map((s) => (
                        <Badge key={s} variant="secondary" className="gap-1">
                            {s}
                            <button onClick={() => toggle(s)} className="ml-0.5 text-muted-foreground hover:text-foreground" aria-label={`Remove ${s}`}><X className="h-3 w-3" /></button>
                        </Badge>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => setRequiredSets([])}>Clear</Button>
                </div>
            )}
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search sets…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="space-y-1.5">
                {filtered.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No sets match “{query}”.</p>}
                {filtered.map((sb) => {
                    const active = requiredSets.includes(sb.name);
                    const restricted = restrictedOut(sb);
                    const disabled = !active && (restricted || usedBudget + minPiecesFor(sb) > 5);
                    return (
                        <button
                            key={sb.name}
                            onClick={() => toggle(sb.name)}
                            disabled={disabled}
                            className={cn(
                                'flex w-full flex-col gap-1 rounded-md border p-2 text-left transition-colors',
                                active ? 'border-primary bg-primary/5' : disabled ? 'cursor-not-allowed border-border bg-surface opacity-50' : 'border-border bg-surface hover:bg-surface-2',
                            )}
                        >
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-foreground">{sb.name}</span>
                                <Badge variant="outline">{sb.pieces}pc</Badge>
                            </div>
                            {sb.twoPieceBuffs.length > 0 && (
                                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">2pc</span>
                                    {sb.twoPieceBuffs.map((b, i) => (
                                        <span key={i} className="text-[11px] text-muted-foreground">
                                            {b.label ?? statLabel(b.stat)} +{b.value}{scopeLabel(b.appliesTo) ? ` (${scopeLabel(b.appliesTo)})` : ''}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {sb.fullSetOnlyBuffs.length > 0 && (
                                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">{sb.pieces}pc</span>
                                    {sb.fullSetOnlyBuffs.map((b, i) => (
                                        <span key={i} className="text-[11px] text-muted-foreground">
                                            {b.label ?? statLabel(b.stat)} +{b.value}{scopeLabel(b.appliesTo) ? ` (${scopeLabel(b.appliesTo)})` : ''}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {(hasMismatchedElementDmg(sb.twoPieceBuffs) || hasMismatchedElementDmg(sb.fullSetOnlyBuffs)) && character && (
                                <div className="flex items-center gap-1 text-[11px] text-warning">
                                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                                    <span>This set's elemental DMG bonus doesn't match {character.name}'s {character.element} — only its other stats would help.</span>
                                </div>
                            )}
                            {restricted && character && (
                                <div className="flex items-center gap-1 text-[11px] text-warning">
                                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                                    <span>Only works for {sb.restrictedToCharacters!.join(' / ')} — {character.name} can't use this set.</span>
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

/** Window content: custom defensive values for the currently selected enemy (e.g. the dummy). */
function EnemyConfig() {
    const { enemy, setEnemy } = useCalcStore();
    const gameId = useGameStore((s) => s.activeGameId);
    const closeWindow = useWindowStore((s) => s.closeWindow);
    const [level, setLevel] = useState(enemy.level);
    const [def, setDef] = useState(enemy.def);
    const [res, setRes] = useState(enemy.res);

    // The catalog preset for the current enemy (dummy → 0/0/0).
    const preset = getEnemies(gameId).find((e) => e.id === enemy.id) ?? DUMMY;

    const apply = () => {
        setEnemy({ ...enemy, level: Number(level) || 0, def: Number(def) || 0, res: Number(res) || 0 });
        closeWindow();
    };
    const revert = () => {
        setLevel(preset.level); setDef(preset.def); setRes(preset.res);
        setEnemy({ ...enemy, level: preset.level, def: preset.def, res: preset.res });
    };

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Custom defenses for <span className="text-foreground">{enemy.name}</span>. Set to 0 for a bare training dummy (raw damage).
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
            <DialogFooter>
                <Button variant="ghost" onClick={revert}>Revert to default</Button>
                <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
                <Button onClick={apply}>Apply</Button>
            </DialogFooter>
        </div>
    );
}

// ── Party setup ─────────────────────────────────────────────────────────────

function PartySetup({ data, character }: { data: ReturnType<typeof getGameData>; character: CharacterData | null }) {
    const activeGameId = useGameStore((s) => s.activeGameId);
    const owned = useOwnedInventory(activeGameId);
    const equipped = useCalcStore((s) => s.equipped);
    const sequence = useCalcStore((s) => s.sequence);
    const party = usePartyStore((s) => (character ? s.byGame[activeGameId]?.[character.id] : undefined)) ?? { teammates: [], disabled: [] };
    const { addTeammate, removeTeammate, setTeammateCharacter, toggleEffect } = usePartyStore();
    // Reactive to ANY character's loadout — a teammate always shows what that
    // character actually has equipped (same source the Inspector equip flow writes to).
    const gameLoadouts = useLoadoutStore((s) => s.byGame[activeGameId]) ?? {};
    // Reactive to ANY character's Constellation/Sequence level — same shape as
    // gameLoadouts, so a teammate's own unlocked level (and its team buffs, e.g.
    // Bennett's C6 Pyro infusion) show up live without needing this panel closed/reopened.
    const gameSequences = useSequenceStore((s) => s.byGame[activeGameId]) ?? {};
    const { showItem } = useSelectionStore();

    if (!character) return <EmptyState icon={Users} title="No character" description="Pick a character in the Damage Calculator first." />;

    const equippedGear = equipped.gearIds.map((id) => owned.gear.find((g) => g.id === id)).filter(Boolean) as GearData[];
    const getLoadout = (charId: string) => useLoadoutStore.getState().getLoadout(activeGameId, charId);
    const getSequence = (charId: string) => gameSequences[charId] ?? 0;
    const { effects } = resolveParty(data, party, character, equippedGear, equipped.weaponId, owned.gear, getLoadout, sequence, getSequence);
    const seqLabel = getSequenceLabel(activeGameId);
    const disabledSet = new Set(party.disabled);
    const usedIds = new Set([character.id, ...party.teammates.map((t) => t.characterId)]);
    const addable = owned.characters.filter((c) => !usedIds.has(c.id));
    // Every set tier this equipped gear activates (not just one — a
    // 2pc+2pc split activates two simultaneously), joined for display.
    const activeSetLabel = (gear: GearData[], name: string | undefined) => {
        const bonuses = activeSetBonuses(gear, data.setBonuses, name);
        return bonuses.length > 0 ? bonuses.map((b) => `${b.name}${b.tier === 'twoPiece' ? ' (2pc)' : ''}`).join(' + ') : undefined;
    };
    const activeSet = activeSetLabel(equippedGear, character.name);
    const catLabel: Record<PartyEffectCat, string> = { kit: 'Kit', set: 'Set', weapon: 'Weapon' };

    const doAdd = () => { if (addable[0]) addTeammate(activeGameId, character.id, addable[0].id, data.partyTeammates); };

    return (
        <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
                Buffs deployed here apply to <span className="text-foreground">{character.name}</span>'s optimization and rotation. Toggle each on or off.
            </p>

            <section>
                <SectionLabel>Team <span className="ml-1 font-normal normal-case text-muted-foreground/70">({party.teammates.length + 1}/{data.partyTeammates + 1})</span></SectionLabel>
                <p className="mb-2 text-[11px] text-muted-foreground">
                    Each teammate carries whatever weapon/gear THAT character has equipped — inspect them to change it.
                </p>
                <div className="space-y-2">
                    {/* Active character */}
                    <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-2">
                        <ItemIcon kind="character" size="sm" rarity={character.rarity} src={iconSrc(activeGameId, character.icon)} />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-foreground">{character.name}</div>
                            <div className="truncate text-xs text-muted-foreground">Active · {activeSet ?? 'no set bonus'}</div>
                        </div>
                        <span className="flex-shrink-0 text-xs font-medium tabular-nums text-foreground">{Math.round(computeBuildStats(character, equippedGear, [], data.weapons.find((w) => w.id === equipped.weaponId), data.statCatalog).atk ?? 0)} ATK</span>
                        <Badge variant="secondary">You</Badge>
                    </div>

                    {/* Teammates — each shows ITS OWN equipped loadout + computed stats (no manual override). */}
                    {party.teammates.map((t) => {
                        const tc = data.characters.find((c) => c.id === t.characterId);
                        const loadout = gameLoadouts[t.characterId] ?? { gearIds: [] };
                        const tGear = loadout.gearIds.map((gid) => owned.gear.find((g) => g.id === gid)).filter(Boolean) as GearData[];
                        const tWeapon = loadout.weaponId ? data.weapons.find((w) => w.id === loadout.weaponId) : undefined;
                        const tSetName = activeSetLabel(tGear, tc?.name);
                        const tStats = tc ? computeBuildStats(tc, tGear, [], tWeapon, data.statCatalog) : null;
                        return (
                            <div key={t.id} className="space-y-2 rounded-md border border-border bg-surface p-2">
                                <div className="flex items-center gap-2">
                                    <ItemIcon kind="character" size="sm" rarity={tc?.rarity ?? 4} src={iconSrc(activeGameId, tc?.icon)} />
                                    <Select value={t.characterId} onValueChange={(v) => setTeammateCharacter(activeGameId, character.id, t.id, v)}>
                                        <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {owned.characters.map((c) => <SelectItem key={c.id} value={c.id} disabled={c.id !== t.characterId && usedIds.has(c.id)}>{c.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Select value={String(getSequence(t.characterId))} onValueChange={(v) => useSequenceStore.getState().setSequence(activeGameId, t.characterId, Number(v))}>
                                        <SelectTrigger className="h-8 w-16 flex-shrink-0" title={`${tc?.name ?? 'This character'}'s own ${seqLabel} level — deploys their own unlocked ${seqLabel} team buffs (e.g. Bennett's C6) here in Party Setup, same as inspecting them directly.`}>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Array.from({ length: SEQUENCE_MAX + 1 }, (_, i) => i).map((i) => <SelectItem key={i} value={String(i)}>{seqLabel[0]}{i}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeTeammate(activeGameId, character.id, t.id)} aria-label="Remove teammate"><X /></Button>
                                </div>
                                {tc && (
                                    <button
                                        onClick={() => showItem(tc)}
                                        className="flex w-full items-center justify-between gap-2 rounded-md border border-dashed border-border bg-surface-2 px-2 py-1.5 text-left transition-colors hover:bg-card"
                                        title={`Inspect ${tc.name} to equip their own weapon/gear`}
                                    >
                                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                                            {tWeapon ? tWeapon.name : 'No weapon'} · {tSetName ?? 'no set bonus'}
                                        </span>
                                        {tStats && <span className="flex-shrink-0 text-xs font-medium tabular-nums text-foreground">{Math.round(tStats.atk ?? 0)} ATK</span>}
                                    </button>
                                )}
                            </div>
                        );
                    })}

                    <Button variant="secondary" className="w-full" onClick={doAdd} disabled={party.teammates.length >= data.partyTeammates || addable.length === 0}>
                        <Plus /> Add teammate
                    </Button>
                    {addable.length === 0 && party.teammates.length < data.partyTeammates && (
                        <p className="text-[11px] text-muted-foreground">Own more characters (Inventory) to add teammates.</p>
                    )}
                </div>
            </section>

            <section>
                <SectionLabel>Deployed effects</SectionLabel>
                {effects.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No deployable buffs yet — give a teammate (or your own build) a set with a team bonus, or add a character whose kit provides a buff.</p>
                ) : (
                    <div className="space-y-1.5">
                        {effects.map((e) => {
                            const on = !disabledSet.has(e.id);
                            return (
                                <div key={e.id} className="flex items-center gap-2 rounded-md border border-border bg-surface p-2" title={e.description ?? 'Assumed active — toggle off if this build can’t realistically maintain the trigger (stacks, field, etc.)'}>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="truncate text-sm font-medium text-foreground">{e.name}</span>
                                            <Badge variant="outline">{catLabel[e.category]}</Badge>
                                        </div>
                                        <div className="truncate text-xs text-muted-foreground">{e.source} · {e.buffs.map((b) => { const sc = scopeLabel(b.appliesTo); return sc ? `+${b.value}% ${sc} DMG` : `+${b.value} ${statLabel(b.stat)}`; }).join(', ')}</div>
                                    </div>
                                    <Switch checked={on} onCheckedChange={() => toggleEffect(activeGameId, character.id, e.id)} />
                                </div>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}

type PartyEffectCat = 'kit' | 'set' | 'weapon';

// ── shared bits ─────────────────────────────────────────────────────────────

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
    return <h3 className={cn('mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)}>{children}</h3>;
}
function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between rounded-md border border-border bg-surface px-2.5 py-1.5">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-xs font-medium tabular-nums text-foreground">{value}</span>
        </div>
    );
}
