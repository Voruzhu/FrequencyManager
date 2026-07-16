import { useState, useEffect } from 'react';

interface EchoInput {
    id: string;
    name: string;
    mainStat: string;
    mainStatValue: number;
    subStats: Array<{ stat: string; value: number }>;
    level: number;
    cost: number;
    setName?: string;
}

interface CalculationResult {
    totalAtk: number;
    totalCritRate: number;
    totalCritDmg: number;
    totalEnergyRegen: number;
    totalHp: number;
    totalDef: number;
    estimatedDps: number;
    breakdown: Record<string, number>;
}

export function DamageCalculatorPanel() {
    const [echoes, setEchoes] = useState<EchoInput[]>([
        { id: '1', name: 'Molten Rift', mainStat: 'ATK%', mainStatValue: 43.2, subStats: [{ stat: 'CRIT Rate', value: 7.8 }, { stat: 'CRIT DMG', value: 15.6 }, { stat: 'Energy Regen', value: 5.2 }, { stat: 'ATK%', value: 4.8 }], level: 25, cost: 4, setName: 'Molten Rift' },
        { id: '2', name: 'Thundering Mephis', mainStat: 'CRIT DMG', mainStatValue: 38.4, subStats: [{ stat: 'ATK%', value: 9.6 }, { stat: 'CRIT Rate', value: 6.5 }, { stat: 'Energy Regen', value: 4.1 }, { stat: 'HP%', value: 5.3 }], level: 25, cost: 4, setName: 'Thundering Mephis' },
        { id: '3', name: 'Void Thunder', mainStat: 'CRIT Rate', mainStatValue: 33.6, subStats: [{ stat: 'CRIT DMG', value: 12.4 }, { stat: 'ATK%', value: 8.2 }, { stat: 'Energy Regen', value: 3.8 }, { stat: 'DEF%', value: 4.5 }], level: 25, cost: 4, setName: 'Void Thunder' },
        { id: '4', name: 'Impermanence Heron', mainStat: 'Energy Regen', mainStatValue: 28.8, subStats: [{ stat: 'ATK%', value: 7.1 }, { stat: 'CRIT Rate', value: 5.9 }, { stat: 'CRIT DMG', value: 11.2 }, { stat: 'HP%', value: 6.1 }], level: 25, cost: 3, setName: 'Impermanence Heron' },
        { id: '5', name: 'Crownless', mainStat: 'HP%', mainStatValue: 43.2, subStats: [{ stat: 'ATK%', value: 6.8 }, { stat: 'CRIT DMG', value: 9.8 }, { stat: 'Energy Regen', value: 4.3 }, { stat: 'DEF%', value: 5.7 }], level: 25, cost: 3, setName: 'Crownless' },
    ]);
    const [baseAtk, setBaseAtk] = useState(800);
    const [baseCritRate, setBaseCritRate] = useState(5);
    const [baseCritDmg, setBaseCritDmg] = useState(50);
    const [baseEnergyRegen, setBaseEnergyRegen] = useState(100);
    const [baseHp, setBaseHp] = useState(12000);
    const [baseDef, setBaseDef] = useState(600);
    const [result, setResult] = useState<CalculationResult | null>(null);
    const [calculating, setCalculating] = useState(false);

    const calculate = () => {
        setCalculating(true);
        // Simulate calculation
        setTimeout(() => {
            let totalAtk = baseAtk;
            let totalCritRate = baseCritRate;
            let totalCritDmg = baseCritDmg;
            let totalEnergyRegen = baseEnergyRegen;
            let totalHp = baseHp;
            let totalDef = baseDef;

            const breakdown: Record<string, number> = {};

            echoes.forEach(echo => {
                // Main stat
                switch (echo.mainStat) {
                    case 'ATK%':
                        totalAtk += baseAtk * (echo.mainStatValue / 100);
                        breakdown[`${echo.name} Main ATK%`] = baseAtk * (echo.mainStatValue / 100);
                        break;
                    case 'CRIT Rate':
                        totalCritRate += echo.mainStatValue;
                        breakdown[`${echo.name} Main CRIT Rate`] = echo.mainStatValue;
                        break;
                    case 'CRIT DMG':
                        totalCritDmg += echo.mainStatValue;
                        breakdown[`${echo.name} Main CRIT DMG`] = echo.mainStatValue;
                        break;
                    case 'Energy Regen':
                        totalEnergyRegen += echo.mainStatValue;
                        breakdown[`${echo.name} Main Energy Regen`] = echo.mainStatValue;
                        break;
                    case 'HP%':
                        totalHp += baseHp * (echo.mainStatValue / 100);
                        breakdown[`${echo.name} Main HP%`] = baseHp * (echo.mainStatValue / 100);
                        break;
                    case 'DEF%':
                        totalDef += baseDef * (echo.mainStatValue / 100);
                        breakdown[`${echo.name} Main DEF%`] = baseDef * (echo.mainStatValue / 100);
                        break;
                }

                // Sub stats
                echo.subStats.forEach(sub => {
                    switch (sub.stat) {
                        case 'ATK%':
                            totalAtk += baseAtk * (sub.value / 100);
                            breakdown[`${echo.name} Sub ATK%`] = (breakdown[`${echo.name} Sub ATK%`] || 0) + baseAtk * (sub.value / 100);
                            break;
                        case 'CRIT Rate':
                            totalCritRate += sub.value;
                            breakdown[`${echo.name} Sub CRIT Rate`] = (breakdown[`${echo.name} Sub CRIT Rate`] || 0) + sub.value;
                            break;
                        case 'CRIT DMG':
                            totalCritDmg += sub.value;
                            breakdown[`${echo.name} Sub CRIT DMG`] = (breakdown[`${echo.name} Sub CRIT DMG`] || 0) + sub.value;
                            break;
                        case 'Energy Regen':
                            totalEnergyRegen += sub.value;
                            breakdown[`${echo.name} Sub Energy Regen`] = (breakdown[`${echo.name} Sub Energy Regen`] || 0) + sub.value;
                            break;
                        case 'HP%':
                            totalHp += baseHp * (sub.value / 100);
                            breakdown[`${echo.name} Sub HP%`] = (breakdown[`${echo.name} Sub HP%`] || 0) + baseHp * (sub.value / 100);
                            break;
                        case 'DEF%':
                            totalDef += baseDef * (sub.value / 100);
                            breakdown[`${echo.name} Sub DEF%`] = (breakdown[`${echo.name} Sub DEF%`] || 0) + baseDef * (sub.value / 100);
                            break;
                    }
                });
            });

            // Cap crit rate at 100%
            const effectiveCritRate = Math.min(totalCritRate, 100);

            // Simple DPS estimation: ATK * (1 + CRIT Rate * CRIT DMG)
            const estimatedDps = totalAtk * (1 + (effectiveCritRate / 100) * (totalCritDmg / 100));

            setResult({
                totalAtk: Math.round(totalAtk),
                totalCritRate: Math.round(effectiveCritRate * 10) / 10,
                totalCritDmg: Math.round(totalCritDmg * 10) / 10,
                totalEnergyRegen: Math.round(totalEnergyRegen * 10) / 10,
                totalHp: Math.round(totalHp),
                totalDef: Math.round(totalDef),
                estimatedDps: Math.round(estimatedDps),
                breakdown,
            });
            setCalculating(false);
        }, 100);
    };

    useEffect(() => {
        calculate();
    }, [echoes, baseAtk, baseCritRate, baseCritDmg, baseEnergyRegen, baseHp, baseDef]);

    const updateEcho = (id: string, field: keyof EchoInput, value: unknown) => {
        setEchoes(echoes.map(e => e.id === id ? { ...e, [field]: value } : e));
    };

    const addEcho = () => {
        const newEcho: EchoInput = {
            id: String(Date.now()),
            name: 'New Echo',
            mainStat: 'ATK%',
            mainStatValue: 0,
            subStats: [{ stat: 'CRIT Rate', value: 0 }, { stat: 'CRIT DMG', value: 0 }, { stat: 'Energy Regen', value: 0 }, { stat: 'ATK%', value: 0 }],
            level: 1,
            cost: 1,
        };
        setEchoes([...echoes, newEcho]);
    };

    const removeEcho = (id: string) => {
        setEchoes(echoes.filter(e => e.id !== id));
    };

    const statOptions = ['ATK%', 'CRIT Rate', 'CRIT DMG', 'Energy Regen', 'HP%', 'DEF%'];

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-fg mb-1">Damage Calculator</h2>
                    <p className="text-muted text-sm">Calculate estimated DPS from echo stats</p>
                </div>
                <button
                    onClick={addEcho}
                    className="px-4 py-2 bg-white/5 text-fg font-medium rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
                >
                    + Add Echo
                </button>
            </div>

            {/* Base Stats */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                <h3 className="font-medium text-fg mb-4">Base Character Stats</h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
                    <div>
                        <label className="block text-xs text-muted mb-1">Base ATK</label>
                        <input type="number" value={baseAtk} onChange={e => setBaseAtk(Number(e.target.value))} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-fg focus:outline-none focus:ring-2 focus:ring-accent" />
                    </div>
                    <div>
                        <label className="block text-xs text-muted mb-1">Base CRIT Rate %</label>
                        <input type="number" step="0.1" value={baseCritRate} onChange={e => setBaseCritRate(Number(e.target.value))} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-fg focus:outline-none focus:ring-2 focus:ring-accent" />
                    </div>
                    <div>
                        <label className="block text-xs text-muted mb-1">Base CRIT DMG %</label>
                        <input type="number" step="0.1" value={baseCritDmg} onChange={e => setBaseCritDmg(Number(e.target.value))} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-fg focus:outline-none focus:ring-2 focus:ring-accent" />
                    </div>
                    <div>
                        <label className="block text-xs text-muted mb-1">Base Energy Regen %</label>
                        <input type="number" step="0.1" value={baseEnergyRegen} onChange={e => setBaseEnergyRegen(Number(e.target.value))} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-fg focus:outline-none focus:ring-2 focus:ring-accent" />
                    </div>
                    <div>
                        <label className="block text-xs text-muted mb-1">Base HP</label>
                        <input type="number" value={baseHp} onChange={e => setBaseHp(Number(e.target.value))} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-fg focus:outline-none focus:ring-2 focus:ring-accent" />
                    </div>
                    <div>
                        <label className="block text-xs text-muted mb-1">Base DEF</label>
                        <input type="number" value={baseDef} onChange={e => setBaseDef(Number(e.target.value))} className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-fg focus:outline-none focus:ring-2 focus:ring-accent" />
                    </div>
                </div>
            </div>

            {/* Echoes */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10 space-y-4">
                <h3 className="font-medium text-fg mb-4">Echoes (5 slots)</h3>
                <div className="space-y-4">
                    {echoes.map((echo, idx) => (
                        <div key={echo.id} className="bg-black/30 rounded-lg p-4 border border-white/10 space-y-3">
                            <div className="flex items-center justify-between">
                                <input
                                    type="text"
                                    value={echo.name}
                                    onChange={e => updateEcho(echo.id, 'name', e.target.value)}
                                    className="w-40 bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                                <select
                                    value={echo.mainStat}
                                    onChange={e => updateEcho(echo.id, 'mainStat', e.target.value)}
                                    className="w-36 bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                                >
                                    {statOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={echo.mainStatValue}
                                    onChange={e => updateEcho(echo.id, 'mainStatValue', Number(e.target.value))}
                                    className="w-24 bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                                <button
                                    onClick={() => removeEcho(echo.id)}
                                    className="text-error hover:text-error/70 text-sm"
                                >
                                    Remove
                                </button>
                            </div>
                            <div className="grid gap-2 md:grid-cols-4">
                                {echo.subStats.map((sub, si) => (
                                    <div key={si} className="flex gap-2">
                                        <select
                                            value={sub.stat}
                                            onChange={e => {
                                                const newSubs = [...echo.subStats];
                                                newSubs[si] = { ...newSubs[si], stat: e.target.value };
                                                updateEcho(echo.id, 'subStats', newSubs);
                                            }}
                                            className="w-32 bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                                        >
                                            {statOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={sub.value}
                                            onChange={e => {
                                                const newSubs = [...echo.subStats];
                                                newSubs[si] = { ...newSubs[si], value: Number(e.target.value) };
                                                updateEcho(echo.id, 'subStats', newSubs);
                                            }}
                                            className="w-24 bg-black/50 border border-white/10 rounded px-2 py-1 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Results */}
            {result && (
                <div className="bg-white/5 rounded-xl p-6 border border-white/10 space-y-4">
                    <h3 className="font-medium text-fg mb-4">Calculation Results</h3>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="bg-black/30 rounded-lg p-4 border border-white/10">
                            <div className="text-2xl font-bold text-accent">{result.totalAtk.toLocaleString()}</div>
                            <div className="text-sm text-muted">Total ATK</div>
                        </div>
                        <div className="bg-black/30 rounded-lg p-4 border border-white/10">
                            <div className="text-2xl font-bold text-accent">{result.totalCritRate}%</div>
                            <div className="text-sm text-muted">CRIT Rate</div>
                        </div>
                        <div className="bg-black/30 rounded-lg p-4 border border-white/10">
                            <div className="text-2xl font-bold text-accent">{result.totalCritDmg}%</div>
                            <div className="text-sm text-muted">CRIT DMG</div>
                        </div>
                        <div className="bg-black/30 rounded-lg p-4 border border-white/10">
                            <div className="text-2xl font-bold text-accent">{result.estimatedDps.toLocaleString()}</div>
                            <div className="text-sm text-muted">Est. DPS</div>
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="bg-black/30 rounded-lg p-4 border border-white/10">
                            <div className="text-xl font-bold text-ok">{result.totalEnergyRegen}%</div>
                            <div className="text-sm text-muted">Energy Regen</div>
                        </div>
                        <div className="bg-black/30 rounded-lg p-4 border border-white/10">
                            <div className="text-xl font-bold text-ok">{result.totalHp.toLocaleString()}</div>
                            <div className="text-sm text-muted">Total HP</div>
                        </div>
                        <div className="bg-black/30 rounded-lg p-4 border border-white/10">
                            <div className="text-xl font-bold text-ok">{result.totalDef.toLocaleString()}</div>
                            <div className="text-sm text-muted">Total DEF</div>
                        </div>
                    </div>

                    <details className="border-t border-white/10 pt-4">
                        <summary className="cursor-pointer text-sm text-muted">Stat Breakdown</summary>
                        <div className="mt-4 grid gap-2 md:grid-cols-2 max-h-64 overflow-y-auto">
                            {Object.entries(result.breakdown).map(([key, value]) => (
                                <div key={key} className="flex justify-between text-sm py-1 border-b border-white/5">
                                    <span className="text-muted">{key}</span>
                                    <span className="text-fg font-mono">{value >= 1 ? value.toLocaleString() : value.toFixed(1)}</span>
                                </div>
                            ))}
                        </div>
                    </details>
                </div>
            )}
        </div>
    );
}