import { useMemo, useState } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui';
import { useNamedLoadoutStore } from '../stores/namedLoadoutStore';
import type { CharacterLoadout } from '../stores/loadoutStore';
import { catalogStatLabel, formatCatalogValue, type CharacterData, type GameData } from '../data/gameData';
import type { LoadoutScore } from '../screens/CalculatorScreen';
import { resolveAltLoadout, KEEP_CURRENT } from '../lib/compareBuilds';

/** Side-by-side "current build vs a hypothetical alternate" comparison for one
 * character — swap the weapon and/or swap in a saved loadout's gear, see the
 * resulting stat and per-skill damage deltas. Reuses the SAME scoring engine
 * (`computeForLoadout`, passed down from CalculatorScreen) "Calculate current"
 * and the Optimizer already use — this never disagrees with those numbers. */
export function CompareBuildsWindow({
    character, data, gameId, currentLoadout, computeFor,
}: {
    character: CharacterData;
    data: GameData;
    gameId: string;
    currentLoadout: CharacterLoadout;
    computeFor: (loadout: CharacterLoadout) => LoadoutScore | null;
}) {
    const [altWeaponId, setAltWeaponId] = useState(KEEP_CURRENT);
    const [altLoadoutId, setAltLoadoutId] = useState(KEEP_CURRENT);
    const weaponOptions = data.weapons.filter((w) => w.weaponType === character.weaponType);
    const savedLoadouts = useNamedLoadoutStore((s) => s.byGame[gameId]);
    const savedList = Object.values(savedLoadouts ?? {}).filter((l) => l.characterId === character.id);

    const altLoadout: CharacterLoadout = useMemo(
        () => resolveAltLoadout(currentLoadout, altWeaponId, altLoadoutId === KEEP_CURRENT ? undefined : savedList.find((l) => l.id === altLoadoutId)?.loadout),
        [altLoadoutId, altWeaponId, currentLoadout, savedList],
    );

    const current = useMemo(() => computeFor(currentLoadout), [computeFor, currentLoadout]);
    const alt = useMemo(() => computeFor(altLoadout), [computeFor, altLoadout]);

    const statRows = data.statCatalog.map((def) => ({
        label: catalogStatLabel(def, character.element),
        format: (v: number) => formatCatalogValue(def, v),
        cur: current?.stats[def.key] ?? 0,
        alt: alt?.stats[def.key] ?? 0,
    }));
    const skillRows = character.skills.map((s) => ({
        label: s.name,
        format: (v: number) => Math.round(v).toLocaleString(),
        cur: current?.skillDamage[s.id] ?? 0,
        alt: alt?.skillDamage[s.id] ?? 0,
    }));

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Alternate weapon</label>
                    <Select value={altWeaponId} onValueChange={setAltWeaponId}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={KEEP_CURRENT}>Keep current</SelectItem>
                            {weaponOptions.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Alternate gear (saved loadout)</label>
                    <Select value={altLoadoutId} onValueChange={setAltLoadoutId}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={KEEP_CURRENT}>Keep current</SelectItem>
                            {savedList.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {savedList.length === 0 && <p className="text-[11px] text-muted-foreground">No saved loadouts for {character.name} yet — save one from the Loadouts window to compare full gear sets.</p>}
                </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border bg-surface text-xs text-muted-foreground">
                            <th className="px-2.5 py-1.5 text-left font-medium">Stat</th>
                            <th className="px-2.5 py-1.5 text-right font-medium">Current</th>
                            <th className="px-2.5 py-1.5 text-right font-medium">Alternate</th>
                            <th className="px-2.5 py-1.5 text-right font-medium">Δ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[...statRows, ...skillRows].map((row, i) => {
                            const delta = row.alt - row.cur;
                            const deltaColor = delta > 0 ? 'text-green-500' : delta < 0 ? 'text-red-500' : 'text-muted-foreground';
                            return (
                                <tr key={i} className="border-b border-border/50 last:border-0">
                                    <td className="px-2.5 py-1.5 text-foreground">{row.label}</td>
                                    <td className="px-2.5 py-1.5 text-right tabular-nums text-foreground">{row.format(row.cur)}</td>
                                    <td className="px-2.5 py-1.5 text-right tabular-nums text-foreground">{row.format(row.alt)}</td>
                                    <td className={`px-2.5 py-1.5 text-right tabular-nums ${deltaColor}`}>{delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${row.format(delta)}`}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
