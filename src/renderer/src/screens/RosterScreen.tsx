import { useMemo, useState } from 'react';
import { ArrowUpDown, Users as UsersIcon } from 'lucide-react';
import { PageHeader, Card, CardContent, EmptyState, Table, TableHeader, TableBody, TableHead, TableRow, TableCell, ItemIcon } from '../components/ui';
import { useGameStore } from '../stores/gameStore';
import { useOwnedInventory } from '../stores/inventoryStore';
import { useLoadoutStore } from '../stores/loadoutStore';
import { useSequenceStore } from '../stores/sequenceStore';
import { useCalcStore } from '../stores/calcStore';
import { useGameData, formatCatalogValue, catalogStatLabel } from '../data/gameData';
import { iconSrc } from '@/lib/icons';
import { computeBuildStats, setBonusBuffEntries } from '../data/optimizer';
import { weaponAutoBuffs, characterAutoBuffs, constellationAutoBuffs, gearAutoBuffs } from '@/lib/selfBuffs';
import { getWeaponScaling, refineMul } from '../data/weaponScaling';
import { averageRollPct, sortRows, type RosterRow, type SortDir } from '@/lib/rosterOverview';

/**
 * Each owned character's SOLO stats — their own saved loadout + sequence, no
 * party/target/custom-buff context (there's no single "the roster's party" to
 * assume). Answers "who's actually built well", not "who deals the most damage
 * in a specific fight" — that needs a target/rotation, which this view has none of.
 */
export function RosterScreen() {
    const activeGameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(activeGameId);
    const owned = useOwnedInventory(activeGameId);
    const skillTreeInvested = useCalcStore((s) => s.skillTreeInvested);
    const echoSkillDeployed = useCalcStore((s) => s.echoSkillDeployed);
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const rows: RosterRow[] = useMemo(() => owned.characters.map((character) => {
        const loadout = useLoadoutStore.getState().getLoadout(activeGameId, character.id);
        const sequence = useSequenceStore.getState().getSequence(activeGameId, character.id);
        const weapon = data.weapons.find((w) => w.id === loadout.weaponId);
        const gear = loadout.gearIds.map((id) => owned.gear.find((g) => g.id === id)).filter(Boolean) as typeof owned.gear;
        const refineMultiplier = weapon ? refineMul(getWeaponScaling(activeGameId, weapon.id), loadout.weaponRefine ?? 1) : 1;
        const setBuffs = setBonusBuffEntries(gear, data.setBonuses, character.name);
        const buffs = [
            ...setBuffs,
            ...weaponAutoBuffs(weapon, character, gear, data.statCatalog, {}, refineMultiplier),
            ...constellationAutoBuffs(character, sequence, gear, weapon, data.statCatalog),
            ...characterAutoBuffs(character, gear, weapon, data.statCatalog, {}, skillTreeInvested),
            ...gearAutoBuffs(gear, {}, character.name, loadout.mainSlotGearId, echoSkillDeployed),
        ];
        const stats = computeBuildStats(character, gear, buffs, weapon, data.statCatalog);
        return { character, stats, avgRollPct: averageRollPct(gear, data), gearCount: gear.length };
    }), [owned.characters, owned.gear, activeGameId, data, skillTreeInvested, echoSkillDeployed]);

    const sorted = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);

    const toggleSort = (key: string) => {
        if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
        else { setSortKey(key); setSortDir('desc'); }
    };

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <PageHeader title="Roster Overview" description="Every owned character's solo stats from their own saved loadout — click a column to sort. No target/rotation assumed, so this isn't a damage ranking." />
            {owned.characters.length === 0 ? (
                <EmptyState icon={UsersIcon} title="No characters owned yet" description="Add characters in the Inventory screen first." />
            ) : (
                <Card>
                    <CardContent className="overflow-x-auto pt-4">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort('name')}>Character <ArrowUpDown className="inline h-3 w-3" /></TableHead>
                                    <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort('avgRollPct')}>Avg roll% <ArrowUpDown className="inline h-3 w-3" /></TableHead>
                                    {data.statCatalog.map((def) => (
                                        <TableHead key={def.key} className="cursor-pointer select-none text-right" onClick={() => toggleSort(def.key)}>
                                            {catalogStatLabel(def)} <ArrowUpDown className="inline h-3 w-3" />
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sorted.map((r) => (
                                    <TableRow key={r.character.id}>
                                        <TableCell className="flex items-center gap-2 whitespace-nowrap font-medium text-foreground">
                                            <ItemIcon kind="character" size="sm" rarity={r.character.rarity} src={iconSrc(activeGameId, r.character.icon)} />
                                            {r.character.name}
                                            {r.gearCount === 0 && <span className="text-xs text-muted-foreground">(no gear)</span>}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums text-muted-foreground">{r.gearCount > 0 ? `${Math.round(r.avgRollPct)}%` : '—'}</TableCell>
                                        {data.statCatalog.map((def) => (
                                            <TableCell key={def.key} className="text-right tabular-nums text-muted-foreground">{formatCatalogValue(def, r.stats[def.key] ?? 0)}</TableCell>
                                        ))}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
