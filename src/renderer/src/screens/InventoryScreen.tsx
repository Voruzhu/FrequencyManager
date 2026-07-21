import { useMemo, useState } from 'react';
import { Plus, X, Package, Search } from 'lucide-react';
import {
    PageHeader, Tabs, TabsList, TabsTrigger, TabsContent, ItemIcon, Badge, Button, EmptyState,
    Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../components/ui';
import { cn } from '@/lib/utils';
import { iconSrc } from '@/lib/icons';
import { useGearFilters } from '@/lib/gearFilters';
import { useGameStore } from '../stores/gameStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useWindowStore } from '../stores/windowStore';
import { useInventoryStore, useOwnedInventory } from '../stores/inventoryStore';
import { useLoadoutStore } from '../stores/loadoutStore';
import { useCalcStore } from '../stores/calcStore';
import { useGameData } from '../data/gameData';
import { AddCharacterWindow, AddWeaponWindow, AddGearWindow } from '../components/InventoryWindows';
import { GearCard } from '../components/GearCard';
import { GearFilterBar } from '../components/GearFilterBar';

export function InventoryScreen() {
    const activeGameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(activeGameId);
    const owned = useOwnedInventory(activeGameId);
    const { content, showItem } = useSelectionStore();
    const { openWindow, closeWindow } = useWindowStore();
    const { removeCharacter, removeWeapon, removeGear } = useInventoryStore();
    // Reactive to every character's loadout, to know which owned cost-4 echo (if any) is someone's "main slot" piece.
    const gameLoadouts = useLoadoutStore((s) => s.byGame[activeGameId]) ?? {};
    const isEquippedAnywhere = (gearId: string) => Object.values(gameLoadouts).some((l) => l.gearIds.includes(gearId));
    const selectedId = content?.kind === 'item' ? content.item.id : null;

    // `removeGear` already strips the id out of every OTHER character's
    // loadout (see `loadoutStore.removeGearEverywhere`), but the Calculator
    // screen keeps its own separate `calcStore.equipped` snapshot that's only
    // re-hydrated from loadoutStore when a character is (re)selected — sync
    // it directly too if the active character had this piece equipped, same
    // reasoning as `EquipScannedGearWindow`'s post-scan equip sync.
    const removeGearAndSync = (gearId: string) => {
        const calc = useCalcStore.getState();
        removeGear(activeGameId, gearId);
        if (calc.equipped.gearIds.includes(gearId)) {
            useCalcStore.setState({ equipped: { ...calc.equipped, gearIds: calc.equipped.gearIds.filter((g) => g !== gearId) } });
        }
    };

    // ── Characters: search + element/weapon/rarity filters ──
    const [charQuery, setCharQuery] = useState('');
    const [charElement, setCharElement] = useState('all');
    const [charWeapon, setCharWeapon] = useState('all');
    const [charRarity, setCharRarity] = useState('all');
    const charElements = useMemo(() => Array.from(new Set(data.characters.map((c) => c.element))).sort(), [data.characters]);
    const charWeaponTypes = useMemo(() => Array.from(new Set(data.characters.map((c) => c.weaponType))).sort(), [data.characters]);
    const charRarities = useMemo(() => Array.from(new Set(data.characters.map((c) => c.rarity))).sort((a, b) => b - a), [data.characters]);
    const filteredCharacters = useMemo(() => {
        const q = charQuery.trim().toLowerCase();
        return owned.characters.filter((c) =>
            (!q || c.name.toLowerCase().includes(q))
            && (charElement === 'all' || c.element === charElement)
            && (charWeapon === 'all' || c.weaponType === charWeapon)
            && (charRarity === 'all' || String(c.rarity) === charRarity))
            // Highest rarity first by default, alphabetical within the same rarity.
            .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
    }, [owned.characters, charQuery, charElement, charWeapon, charRarity]);
    const charFiltersActive = charQuery !== '' || charElement !== 'all' || charWeapon !== 'all' || charRarity !== 'all';
    const clearCharFilters = () => { setCharQuery(''); setCharElement('all'); setCharWeapon('all'); setCharRarity('all'); };

    // ── Weapons: search + type/rarity filters ──
    const [weaponQuery, setWeaponQuery] = useState('');
    const [weaponType, setWeaponType] = useState('all');
    const [weaponRarity, setWeaponRarity] = useState('all');
    const weaponTypes = useMemo(() => Array.from(new Set(data.weapons.map((w) => w.weaponType))).sort(), [data.weapons]);
    const weaponRarities = useMemo(() => Array.from(new Set(data.weapons.map((w) => w.rarity))).sort((a, b) => b - a), [data.weapons]);
    const filteredWeapons = useMemo(() => {
        const q = weaponQuery.trim().toLowerCase();
        return owned.weapons.filter((w) =>
            (!q || w.name.toLowerCase().includes(q))
            && (weaponType === 'all' || w.weaponType === weaponType)
            && (weaponRarity === 'all' || String(w.rarity) === weaponRarity))
            // Highest rarity first by default, alphabetical within the same rarity.
            .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
    }, [owned.weapons, weaponQuery, weaponType, weaponRarity]);
    const weaponFiltersActive = weaponQuery !== '' || weaponType !== 'all' || weaponRarity !== 'all';
    const clearWeaponFilters = () => { setWeaponQuery(''); setWeaponType('all'); setWeaponRarity('all'); };

    // ── Gear: search + set/main-stat/sub-stat/rarity/slot filters, expandable stats ──
    const gearFilters = useGearFilters(owned.gear);
    const [expandedGear, setExpandedGear] = useState<Set<string>>(new Set());
    const toggleGear = (id: string) => setExpandedGear((prev) => {
        const next = new Set(prev);
        if (next.has(id)) { next.delete(id); } else { next.add(id); }
        return next;
    });

    return (
        <div className="space-y-6 p-6">
            <PageHeader title="Inventory" description="Your collection. Add characters, weapons and gear from the game catalog; select an item to inspect it." />

            <Tabs defaultValue="characters">
                <TabsList>
                    <TabsTrigger value="characters">Characters ({owned.characters.length})</TabsTrigger>
                    <TabsTrigger value="weapons">Weapons ({owned.weapons.length})</TabsTrigger>
                    <TabsTrigger value="gear">{data.gearLabelPlural} ({owned.gear.length})</TabsTrigger>
                </TabsList>

                {/* ── Characters ── */}
                <TabsContent value="characters" className="space-y-3">
                    <Button variant="secondary" onClick={() => openWindow('Add character', <AddCharacterWindow onDone={closeWindow} />)}><Plus /> Add character</Button>
                    {owned.characters.length > 0 && (
                        <div className="space-y-2">
                            <div className="relative max-w-sm">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input className="pl-8" placeholder="Search characters…" value={charQuery} onChange={(e) => setCharQuery(e.target.value)} />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Select value={charElement} onValueChange={setCharElement}>
                                    <SelectTrigger className="w-36"><SelectValue placeholder="Element" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All elements</SelectItem>
                                        {charElements.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select value={charWeapon} onValueChange={setCharWeapon}>
                                    <SelectTrigger className="w-36"><SelectValue placeholder="Weapon" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All weapons</SelectItem>
                                        {charWeaponTypes.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select value={charRarity} onValueChange={setCharRarity}>
                                    <SelectTrigger className="w-24"><SelectValue placeholder="Rarity" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Any★</SelectItem>
                                        {charRarities.map((r) => <SelectItem key={r} value={String(r)}>{r}★</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                {charFiltersActive && (
                                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={clearCharFilters}><X /> Clear filters</Button>
                                )}
                            </div>
                        </div>
                    )}
                    {owned.characters.length === 0 ? (
                        <EmptyState icon={Package} title="No characters yet" description="Add a character from the game catalog." />
                    ) : filteredCharacters.length === 0 ? (
                        <EmptyState icon={Search} title="No matches" description="No characters match these filters." />
                    ) : (
                        <Grid>
                            {filteredCharacters.map((c) => (
                                <Tile key={c.id} active={selectedId === c.id} onClick={() => showItem(c)} onRemove={() => removeCharacter(activeGameId, c.id)}
                                    icon={<ItemIcon kind="character" size="lg" rarity={c.rarity} src={iconSrc(activeGameId, c.icon)} />}
                                    title={c.name}
                                    meta={<><Badge variant="secondary">{c.element}</Badge><Badge variant="outline">{c.weaponType}</Badge>{c.approx && <Badge variant="outline" title="Base stats are rarity defaults">approx</Badge>}</>}
                                />
                            ))}
                        </Grid>
                    )}
                </TabsContent>

                {/* ── Weapons ── */}
                <TabsContent value="weapons" className="space-y-3">
                    <Button variant="secondary" onClick={() => openWindow('Add weapon', <AddWeaponWindow onDone={closeWindow} />)}><Plus /> Add weapon</Button>
                    {owned.weapons.length > 0 && (
                        <div className="space-y-2">
                            <div className="relative max-w-sm">
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input className="pl-8" placeholder="Search weapons…" value={weaponQuery} onChange={(e) => setWeaponQuery(e.target.value)} />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Select value={weaponType} onValueChange={setWeaponType}>
                                    <SelectTrigger className="w-36"><SelectValue placeholder="Type" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All types</SelectItem>
                                        {weaponTypes.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <Select value={weaponRarity} onValueChange={setWeaponRarity}>
                                    <SelectTrigger className="w-24"><SelectValue placeholder="Rarity" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Any★</SelectItem>
                                        {weaponRarities.map((r) => <SelectItem key={r} value={String(r)}>{r}★</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                {weaponFiltersActive && (
                                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={clearWeaponFilters}><X /> Clear filters</Button>
                                )}
                            </div>
                        </div>
                    )}
                    {owned.weapons.length === 0 ? (
                        <EmptyState icon={Package} title="No weapons yet" description="Add a weapon from the game catalog." />
                    ) : filteredWeapons.length === 0 ? (
                        <EmptyState icon={Search} title="No matches" description="No weapons match these filters." />
                    ) : (
                        <Grid>
                            {filteredWeapons.map((w) => (
                                <Tile key={w.id} active={selectedId === w.id} onClick={() => showItem(w)} onRemove={() => removeWeapon(activeGameId, w.id)}
                                    icon={<ItemIcon kind="weapon" size="lg" rarity={w.rarity} src={iconSrc(activeGameId, w.icon)} />}
                                    title={w.name}
                                    meta={<><Badge variant="secondary">{w.weaponType}</Badge><Badge variant="outline">{w.rarity}★</Badge></>}
                                />
                            ))}
                        </Grid>
                    )}
                </TabsContent>

                {/* ── Gear (echoes/artifacts) ── */}
                <TabsContent value="gear" className="space-y-3">
                    <Button variant="secondary" onClick={() => openWindow(`Add ${data.gearLabel.toLowerCase()}`, <AddGearWindow onDone={closeWindow} />)}><Plus /> Add {data.gearLabel.toLowerCase()}</Button>
                    {owned.gear.length > 0 && (
                        <GearFilterBar data={data} filters={gearFilters.filters} onChange={gearFilters.set} onReset={gearFilters.reset} active={gearFilters.active} />
                    )}
                    {owned.gear.length === 0 ? (
                        <EmptyState icon={Package} title={`No ${data.gearLabelPlural.toLowerCase()} yet`} description={`Build an ${data.gearLabel.toLowerCase()} with configurable stats.`} />
                    ) : gearFilters.filtered.length === 0 ? (
                        <EmptyState icon={Search} title="No matches" description="No items match these filters." />
                    ) : (
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {gearFilters.filtered.map((g) => (
                                <GearCard
                                    key={g.id}
                                    g={g}
                                    gameId={activeGameId}
                                    highlight={selectedId === g.id}
                                    mainSlot={g.cost === 4 && isEquippedAnywhere(g.id)}
                                    expanded={expandedGear.has(g.id)}
                                    onToggleExpand={() => toggleGear(g.id)}
                                    onClick={() => showItem(g)}
                                    actions={
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeGearAndSync(g.id); }}
                                            className="flex-shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                                            aria-label="Remove from inventory" title="Remove"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    }
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}

function Grid({ children }: { children: React.ReactNode }) {
    return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{children}</div>;
}

function Tile({ icon, title, meta, active, onClick, onRemove }: {
    icon: React.ReactNode; title: string; meta: React.ReactNode; active: boolean; onClick: () => void; onRemove: () => void;
}) {
    return (
        <div className={cn(
            'group relative flex flex-col items-center gap-2 rounded-lg border bg-card p-3 text-center transition-colors',
            active ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:bg-surface-2'
        )}>
            <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                aria-label="Remove from inventory" title="Remove"
            >
                <X className="h-4 w-4" />
            </button>
            <button onClick={onClick} className="flex flex-col items-center gap-2">
                {icon}
                <span className="line-clamp-1 text-sm font-medium text-foreground">{title}</span>
                <span className="flex flex-wrap justify-center gap-1">{meta}</span>
            </button>
        </div>
    );
}
