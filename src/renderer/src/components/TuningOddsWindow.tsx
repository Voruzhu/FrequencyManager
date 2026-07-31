import { useState } from 'react';
import { Button } from './ui';
import { formatGearStat, type GearData, type GameData } from '../data/gameData';
import { tuningOdds, simulateTuning } from '@shared/calc/substatTuning';

/** Wuthering Waves ONLY — real Tuning odds for one of this echo's substats
 * (see substatTuning.ts for the sourced mechanic + why Genshin isn't here).
 * `data.gearCatalog.subs` gives the real min/max range this stat can roll at
 * this piece's rarity — same lookup `gearEfficiency` already uses. */
export function TuningOddsWindow({ gear, data }: { gear: GearData; data: GameData }) {
    const tunable = gear.subStats
        .map((s) => ({ s, range: data.gearCatalog.subs.find((c) => c.key === s.key)?.byRarity[gear.rarity] }))
        .filter((x): x is { s: GearData['subStats'][number]; range: { min: number; max: number } } => !!x.range);
    const [statIndex, setStatIndex] = useState(0);
    const [simResults, setSimResults] = useState<number[] | null>(null);

    if (tunable.length === 0) {
        return <p className="text-sm text-muted-foreground">This piece has no sub-stats to tune yet.</p>;
    }

    const { s: sub, range } = tunable[Math.min(statIndex, tunable.length - 1)];
    const odds = tuningOdds(sub.value, range.min, range.max, sub.key);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
                {tunable.map(({ s }, i) => (
                    <button
                        key={s.key}
                        onClick={() => { setStatIndex(i); setSimResults(null); }}
                        className={`rounded-md border px-2 py-1 text-xs transition-colors ${i === statIndex ? 'border-primary/50 bg-primary/15 text-foreground' : 'border-border bg-surface text-muted-foreground hover:bg-surface-2'}`}
                    >
                        {s.label}
                    </button>
                ))}
            </div>

            <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                    Currently grade {odds.currentIndex + 1} of {odds.grades.length} — {formatGearStat(sub)}
                </p>
                <div className="flex flex-wrap gap-1">
                    {odds.grades.map((g, i) => (
                        <span
                            key={i}
                            className={`rounded-md border px-1.5 py-0.5 text-[11px] tabular-nums ${i === odds.currentIndex ? 'border-primary bg-primary/20 font-medium text-foreground' : 'border-border bg-surface text-muted-foreground'}`}
                        >
                            {sub.key === 'critRate' || sub.key === 'critDmg' || sub.key.endsWith('Pct') || sub.key.endsWith('Dmg') || sub.key === 'energyRegen' ? `${g}%` : g}
                        </span>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border border-border bg-surface p-2">
                    <div className="text-lg font-semibold tabular-nums text-foreground">{Math.round(odds.probUpgrade * 100)}%</div>
                    <div className="text-[11px] text-muted-foreground">chance to upgrade</div>
                </div>
                <div className="rounded-md border border-border bg-surface p-2">
                    <div className="text-lg font-semibold tabular-nums text-foreground">{Math.round(odds.probMax * 100)}%</div>
                    <div className="text-[11px] text-muted-foreground">chance to hit max</div>
                </div>
                <div className="rounded-md border border-border bg-surface p-2">
                    <div className="text-lg font-semibold tabular-nums text-foreground">{odds.expectedValue.toFixed(1)}</div>
                    <div className="text-[11px] text-muted-foreground">avg. reroll result</div>
                </div>
            </div>

            <Button variant="secondary" size="sm" onClick={() => setSimResults(simulateTuning(odds.grades, 20))}>
                Simulate 20 Tuners
            </Button>
            {simResults && (
                <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                        {simResults.filter((v) => v > sub.value).length} of 20 would have upgraded this substat; best result: {Math.max(...simResults)}
                    </p>
                    <div className="flex flex-wrap gap-1">
                        {simResults.map((v, i) => (
                            <span key={i} className={`rounded border px-1 py-0.5 text-[10px] tabular-nums ${v > sub.value ? 'border-success/50 bg-success/10 text-success' : 'border-border bg-surface text-muted-foreground'}`}>
                                {v}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            <p className="text-[11px] text-muted-foreground">Real, disclosed odds — each Tuner use draws uniformly from this stat's {odds.grades.length} possible grades. Genshin artifacts aren't covered: no reliable official substat weight table has been found for that game's mechanic.</p>
        </div>
    );
}
