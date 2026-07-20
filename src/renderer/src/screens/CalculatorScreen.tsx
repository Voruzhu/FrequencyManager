import { useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Wand2, Target as TargetIcon, CheckCircle2, XCircle, Sparkles, Skull, Users, Star, Layers, Calculator as CalculatorIcon, Search, ChevronsUpDown } from 'lucide-react';
import {
    PageHeader, Card, CardHeader, CardTitle, CardContent, Button, Input, Label, Badge,
    ItemIcon, EmptyState, Progress, Switch,
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
    toast,
} from '../components/ui';
import { cn } from '@/lib/utils';
import { iconSrc } from '@/lib/icons';
import { useGameStore } from '../stores/gameStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useCalcStore, DEFAULT_SKILL_LEVEL } from '../stores/calcStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useWindowStore } from '../stores/windowStore';
import { useOwnedInventory } from '../stores/inventoryStore';
import { usePartyStore } from '../stores/partyStore';
import { useLoadoutStore } from '../stores/loadoutStore';
import { useSequenceStore } from '../stores/sequenceStore';
import { resolveParty } from '@/lib/party';
import { weaponAutoBuffs, characterAutoBuffs, constellationAutoBuffs, gearAutoBuffs, gearBuffId, resolveSelfScaleOff, selfBuffId, passiveBuffId, constBuffId, isSkillTreeBuff, stripAutoSkillTreeBuffs, resolveConditionalValue } from '@/lib/selfBuffs';
import { CharacterPickerWindow, TalentsWindow } from '../components/CharacterWindows';
import type { getGameData} from '../data/gameData';
import { useGameData, gearIcon, setIconFor, echoItemIconFor, gearSelfBuffs, statLabel, formatCatalogValue, catalogStatLabel, type CharacterData, type GearData, type GameData } from '../data/gameData';
import { computeBuildStats, applyConstellationLevelBoosts, effectiveSkillMultiplier, computeBaseLoadouts, targetRanges, scoreAndRank, activeSetBonuses, setBonusBuffEntries, isScopedBuff, gearScopedBuffs, withScopedDmgTotals, CRIT_MODE_LABEL, REACTION_LABEL, type Loadout, type Target, type CritMode, type ReactionType } from '../data/optimizer';
import { runOptimizerPool } from '@/lib/optimizerPool';
import { getWeaponScaling, refineMul, hasRefinement } from '../data/weaponScaling';

const CRIT_MODES: CritMode[] = ['average', 'always', 'none'];
const REACTIONS: ReactionType[] = ['none', 'vape-1.5', 'vape-2', 'melt-1.5', 'melt-2', 'aggravate', 'spread'];

let tseq = 0;
const nextId = () => `t${++tseq}`;

/** Searchable dropdown for picking an optimization target key (skill or stat) — a closed list, but long enough on some characters' full skill roster to need a filter. Mirrors `InventoryWindows.tsx`'s `SetCombobox` pattern. */
function KeyLabelCombobox({ options, value, onChange }: { options: Array<{ key: string; label: string }>; value: string; onChange: (key: string) => void }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const selected = options.find((o) => o.key === value);
    const q = query.trim().toLowerCase();
    const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

    return (
        <div className="relative w-44">
            {open ? (
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        className="pl-8"
                        placeholder="Search…"
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
                    <span className="truncate">{selected?.label ?? 'Select…'}</span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </button>
            )}
            {open && (
                <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto scrollbar-thin rounded-md border border-border bg-popover p-1 shadow-elevation-2">
                    {filtered.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">No matches for “{query}”.</p>}
                    {filtered.map((o) => (
                        <button
                            key={o.key}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { onChange(o.key); setOpen(false); setQuery(''); }}
                            className={cn('flex w-full items-center rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2', o.key === value ? 'text-primary' : 'text-foreground')}
                        >
                            {o.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

const TARGET_STATUSES: Array<{ id: string; label: string }> = [
    { id: 'frazzle', label: 'Frazzle' },
    { id: 'erosion', label: 'Erosion' },
    { id: 'chafe', label: 'Chafe' },
    { id: 'flare', label: 'Flare' },
    { id: 'bane', label: 'Bane' },
    { id: 'fusionburst', label: 'Fusion Burst' },
];

/**
 * Toggle row for which reaction/Negative-Status debuffs are currently on
 * the enemy. Live-gates every team buff carrying a matching
 * `requiresTargetStatus` (e.g. Cartethyia's/Hiyuki's/Phoebe's S2 Outro
 * amps) via `resolveParty`/`enabledPartyBuffs` — toggling one of these off
 * actually drops the buff from the calc, not just a visual reminder.
 */
function TargetStatusRow() {
    const { targetStatuses, toggleTargetStatus } = useCalcStore();
    return (
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1">
            <span className="text-xs text-muted-foreground">Target has:</span>
            {TARGET_STATUSES.map((s) => {
                const on = targetStatuses[s.id] ?? false;
                return (
                    <button
                        key={s.id}
                        onClick={() => toggleTargetStatus(s.id)}
                        className={`rounded border px-1.5 py-0.5 text-xs transition-colors ${on ? 'border-destructive/60 bg-destructive/15 text-foreground' : 'border-dashed border-border bg-surface text-muted-foreground hover:bg-surface-2'}`}
                        title={`Toggle whether the enemy currently has ${s.label} — gates any buff that depends on it`}
                    >
                        {s.label}
                    </button>
                );
            })}
        </div>
    );
}

/** Stack-count stepper for a conditional self-buff with `stacksMax` — mirrors the skill-level stack stepper's look/feel. Updates the live buff value too, if it's currently toggled on. */
function BuffStackStepper({ id, max, buffStacks, setBuffStacks, perStack, on, updateBuffValue }: { id: string; max: number; buffStacks: Record<string, number>; setBuffStacks: (id: string, stacks: number, max: number) => void; perStack: number; on: boolean; updateBuffValue: (id: string, value: number) => void }) {
    const stacks = buffStacks[id] ?? max;
    const change = (next: number) => {
        setBuffStacks(id, next, max);
        if (on) updateBuffValue(id, perStack * Math.max(0, Math.min(max, next)));
    };
    return (
        <span className="flex items-center gap-1" title={`Stacks this buff scales with — defaults to max (${max}), the same "assume best-case" convention used for skill-level stacks.`}>
            <button onClick={() => change(stacks - 1)} className="flex h-5 w-5 items-center justify-center rounded border border-border text-xs text-muted-foreground hover:bg-surface-2" aria-label="Decrease stacks">−</button>
            <span className="w-10 text-center text-xs tabular-nums text-foreground">{stacks}/{max}</span>
            <button onClick={() => change(stacks + 1)} className="flex h-5 w-5 items-center justify-center rounded border border-border text-xs text-muted-foreground hover:bg-surface-2" aria-label="Increase stacks">+</button>
        </span>
    );
}

export function CalculatorScreen() {
    const activeGameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(activeGameId);
    const owned = useOwnedInventory(activeGameId);
    const { showEnemy, showParty, showSetBonus } = useSelectionStore();
    const openWindow = useWindowStore((s) => s.openWindow);
    const loadoutCount = useSettingsStore((s) => s.loadoutCount);
    const optimizerThreads = useSettingsStore((s) => s.optimizerThreads);

    const calc = useCalcStore();
    const character = data.characters.find((c) => c.id === calc.characterId) ?? null;
    const partyTeammateCount = usePartyStore((s) => (character ? s.byGame[activeGameId]?.[character.id]?.teammates.length ?? 0 : 0));

    const skillOpts = useMemo(() => character?.skills.map((s) => ({ key: s.id, label: s.name })) ?? [], [character]);
    // Targetable stats come straight from the game module's stat catalog.
    const statOpts = useMemo(
        () => data.statCatalog.map((s) => ({ key: s.key, label: catalogStatLabel(s, character?.element) })),
        [data.statCatalog, character?.element],
    );
    const optsFor = (kind: 'stat' | 'skill') => (kind === 'skill' ? skillOpts : statOpts);

    // Wall-clock start of the current optimize() run, for the progress bar's
    // ETA estimate (rate = combos done / elapsed so far). A ref, not state —
    // it's read only inside the progress render below, never needs its own
    // re-render trigger.
    const optimizeStartRef = useRef<number>(0);

    // Everything both `run` (search over a gear pool) and `calculateCurrent`
    // (score the single already-equipped combo) need: targets, crit mode,
    // enemy, and every buff source (party, set bonus, weapon/kit/constellation
    // self buffs) — built identically either way, so "calculate current" sees
    // exactly the same assumptions the optimizer would have used.
    const buildConfig = (character: CharacterData) => {
        const weapon = data.weapons.find((w) => w.id === calc.equipped.weaponId);
        const refineMultiplier = weapon ? refineMul(getWeaponScaling(activeGameId, weapon.id), calc.equipped.weaponRefine ?? 1) : 1;
        // Reactions are a Genshin-only mechanic — never apply one for a game
        // that doesn't support them, even if calc.reaction is stale.
        const reaction = data.supportsReactions ? calc.reaction : 'none';
        // Merge in the enabled buffs deployed from the character's party setup.
        const equippedGear = calc.equipped.gearIds.map((id) => owned.gear.find((g) => g.id === id)).filter(Boolean) as GearData[];
        const party = usePartyStore.getState().getParty(activeGameId, character.id);
        const getLoadout = (charId: string) => useLoadoutStore.getState().getLoadout(activeGameId, charId);
        const getSequence = (charId: string) => useSequenceStore.getState().getSequence(activeGameId, charId);
        const partyBuffs = resolveParty(data, party, character, equippedGear, calc.equipped.weaponId, owned.gear, getLoadout, calc.sequence, getSequence, calc.targetStatuses).enabledBuffs;
        // GI Constellation 3/5's "+3 to a skill's level, max 15" — a no-op for WW /
        // characters with no identified boost target.
        const talentLevels = applyConstellationLevelBoosts(character, calc.skillLevels, calc.sequence);
        // Set-bonus buffs are NOT computed here — `computeBaseLoadouts` derives
        // them PER CANDIDATE COMBO from that combo's own REAL gear (via
        // `setBonuses` below), same as it already does for per-attack-type
        // gear sub-stats. This used to assume `calc.requiredSets` (the Set
        // Bonus picker's "search for these sets" hint) was fully active any
        // time it was set — which could silently mismatch what a build's
        // gear ACTUALLY qualifies for (e.g. a 1pc/1pc/3pc split reported as if
        // it were 2pc/2pc), or silently count NOTHING when the picker was
        // left empty even though the real equipped gear clears a 2pc/5pc
        // threshold on its own. `requiredSets` still restricts the search
        // POOL below (only search gear from these sets) — it just no longer
        // fakes the resulting bonus.
        const config = { targets: calc.targets, buffs: [...stripAutoSkillTreeBuffs(calc.buffs, character, calc.skillTreeInvested), ...partyBuffs, ...weaponAutoBuffs(weapon, character, equippedGear, data.statCatalog, {}, refineMultiplier), ...constellationAutoBuffs(character, calc.sequence, equippedGear, weapon, data.statCatalog), ...characterAutoBuffs(character, equippedGear, weapon, data.statCatalog, {}, calc.skillTreeInvested)], critMode: calc.critMode, enemy: calc.enemy, weapon, catalog: data.statCatalog, topN: loadoutCount, talentLevels, stacks: calc.skillStacks, reaction, charLevel: 90, maxTotalCost: data.gearCatalog.maxTotalCost, setBonuses: data.setBonuses };
        return { config, equippedGear };
    };

    const run = async () => {
        if (!character) return;
        if (owned.gear.length === 0) {
            toast.error('No gear to optimize', { description: `Add ${data.gearLabelPlural.toLowerCase()} in the Inventory screen first.` });
            return;
        }
        // The ENTIRE rest of this function is wrapped in try/catch/finally —
        // previously only the backend-RPC attempt below had one, so any
        // exception anywhere else (building `config`, or most notably
        // `Math.max(...vals)` overflowing past V8's spread-argument limit on
        // a large gear pool inside the local optimizer — see
        // `targetRanges`'s doc comment in `shared/calc/optimizer.ts`) became
        // a silent unhandled promise rejection: the button spun, time
        // passed, and nothing ever appeared — no error, no results, no clue
        // why. `setOptimizeProgress` is the very first statement inside the
        // try so the progress bar/disabled button reflect reality from the
        // moment anything could conceivably throw.
        optimizeStartRef.current = Date.now();
        calc.setOptimizeProgress({ done: 0, total: 0 });
        try {
            // A user-declared set-bonus requirement (the Optimization card's
            // "Set bonus" picker) narrows the candidate pool to just those
            // sets' pieces — the optimizer otherwise has no notion of set
            // membership at all, so without this it can (and often does)
            // recommend 5 great individually-rolled pieces from 5 different
            // sets, activating NO set bonus whatsoever, even though a real
            // 5pc/4pc effect is frequently a build's single biggest damage
            // source. Scoring itself doesn't need this requirement repeated
            // anywhere else — `computeBaseLoadouts` derives each candidate
            // combo's OWN real set-bonus buffs directly from its gear (see
            // `config.setBonuses` in `buildConfig`), same as it does for
            // per-attack-type gear sub-stats.
            let optimizePool = owned.gear;
            if (calc.requiredSets.length > 0) {
                optimizePool = owned.gear.filter((g) => calc.requiredSets.includes(g.setName));
                if (optimizePool.length === 0) {
                    toast.error('No gear in the required set(s)', { description: `You have no ${data.gearLabelPlural.toLowerCase()} from ${calc.requiredSets.join(' or ')} — add some, or clear the Set bonus selection.` });
                    return;
                }
            }
            // "Only unequipped" (Optimization card toggle): exclude gear
            // currently equipped on any OTHER character — gear equipped on
            // THIS character stays eligible, since it's already theirs and
            // re-selecting it isn't taking it from anyone else's build.
            if (calc.onlyUnequipped) {
                const gameLoadouts = useLoadoutStore.getState().byGame[activeGameId] ?? {};
                const equippedElsewhere = new Set<string>();
                for (const [charId, loadout] of Object.entries(gameLoadouts)) {
                    if (charId === character.id) continue;
                    for (const id of loadout.gearIds) equippedElsewhere.add(id);
                }
                optimizePool = optimizePool.filter((g) => !equippedElsewhere.has(g.id));
                if (optimizePool.length === 0) {
                    toast.error(`No unequipped ${data.gearLabelPlural.toLowerCase()} available`, { description: `Every ${data.gearLabelPlural.toLowerCase()} that matched is currently equipped on another character — free some up, or turn off "Only unequipped."` });
                    return;
                }
            }
            const { config } = buildConfig(character);

            // Optimize over the player's OWNED gear (or the set-narrowed
            // slice above). Prefer the backend engine (source of truth, but
            // no progress feedback — a single request/response IPC call);
            // fall back to the identical client-side optimizer, parallelized
            // across the configured thread count with live progress.
            let res: Loadout[] | null = null;
            let source: 'backend' | 'local' = 'local';
            try {
                const bridge = (window as unknown as { frequencyManager?: { optimizeBuild?: (p: unknown) => Promise<{ ok: boolean; loadouts: Loadout[] } | null> } }).frequencyManager;
                const out = await bridge?.optimizeBuild?.({ character, pool: optimizePool, config });
                if (out?.ok && Array.isArray(out.loadouts)) { res = out.loadouts; source = 'backend'; }
            } catch {
                /* fall through to local */
            }
            if (!res) {
                res = await runOptimizerPool(character, optimizePool, config, optimizerThreads, (p) => calc.setOptimizeProgress(p));
            }

            calc.setResults(res);
            if (res.length === 0 && config.maxTotalCost != null) {
                toast.error('No loadout stays within the cost budget', { description: `None of your ${data.gearLabelPlural.toLowerCase()} combinations total ${config.maxTotalCost} cost or less — add lower-cost pieces, or clear the Set bonus selection if one is active.` });
            } else {
                toast.success(`Computed ${res.length} loadout${res.length === 1 ? '' : 's'}`, {
                    description: `${source === 'backend' ? 'Backend engine · ' : ''}${calc.requiredSets.length > 0 ? `Restricted to ${calc.requiredSets.join(' + ')} · ` : ''}${res[0]?.meets ? 'Top build meets all minimums' : 'No build meets every minimum — closest shown'}`,
                });
            }
        } catch (err) {
            toast.error('Optimization failed', { description: err instanceof Error ? err.message : 'An unexpected error occurred.' });
        } finally {
            calc.setOptimizeProgress(null);
        }
    };

    // Scores ONLY the gear currently equipped on this character — no search,
    // no gear pool — against the same targets/buffs `run()` would use. Lets
    // the user see "what does my current build actually do" without having
    // to run a full optimization (and without the result silently being
    // replaced by some other combo the search happened to prefer).
    const calculateCurrent = () => {
        if (!character) return;
        try {
            const { config, equippedGear } = buildConfig(character);
            const base = computeBaseLoadouts(character, [equippedGear], config);
            const ranges = targetRanges(base, config.targets.filter((t) => t.mode === 'max'));
            const res = scoreAndRank(base, ranges, 1);
            calc.setResults(res);
            toast.success('Calculated current loadout', {
                description: res[0]?.meets ? 'Meets all minimums' : `Misses: ${res[0]?.failed.join(', ')}`,
            });
        } catch (err) {
            toast.error('Calculation failed', { description: err instanceof Error ? err.message : 'An unexpected error occurred.' });
        }
    };

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <PageHeader
                title="Damage Calculator"
                description="Pick a character, set targets to maximize or hit, and optimize the best gear loadout."
                actions={
                    <Button variant="secondary" onClick={() => openWindow('Select character', <CharacterPickerWindow />)}>
                        <Users /> {character ? character.name : 'Select character'}
                    </Button>
                }
            />

            {!character ? (
                <EmptyState icon={TargetIcon} title="Select a character to begin" description="Choose a character above to view its skills and stats and optimize a loadout." />
            ) : (
                <>
                    <CharacterSummary c={character} data={data} />

                    {/* Targets */}
                    <Card>
                        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
                            <CardTitle>Optimization</CardTitle>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button variant="secondary" size="sm" onClick={showParty}><Users /> Party{partyTeammateCount > 0 ? ` (${partyTeammateCount})` : ''}</Button>
                                <Button variant="secondary" size="sm" onClick={showEnemy}><Skull /> Enemy: {calc.enemy.name}</Button>
                                {activeGameId === 'wuthering-waves' && <TargetStatusRow />}
                                <Button variant="secondary" size="sm" onClick={showSetBonus}>
                                    <Layers /> {calc.requiredSets.length > 0 ? `Set: ${calc.requiredSets.join(' + ')}` : 'Set bonus'}
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className={cn('grid gap-3', data.supportsReactions ? 'sm:grid-cols-2' : 'max-w-xs')}>
                                <div className="space-y-1.5">
                                    <Label>Damage assumption</Label>
                                    <Select value={calc.critMode} onValueChange={(v) => calc.setCritMode(v as CritMode)}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>{CRIT_MODES.map((m) => <SelectItem key={m} value={m}>{CRIT_MODE_LABEL[m]}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                {/* Elemental reactions are a Genshin-only mechanic — WuWa has no equivalent. */}
                                {data.supportsReactions && (
                                    <div className="space-y-1.5">
                                        <Label>Elemental reaction</Label>
                                        <Select value={calc.reaction} onValueChange={(v) => calc.setReaction(v as ReactionType)}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>{REACTIONS.map((r) => <SelectItem key={r} value={r}>{REACTION_LABEL[r]}</SelectItem>)}</SelectContent>
                                        </Select>
                                        <p className="text-[11px] text-muted-foreground">Amplifying (vape/melt) scales with EM; aggravate/spread add EM-based flat damage.</p>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label>Targets</Label>
                                {calc.targets.length === 0 && (
                                    <p className="text-xs text-muted-foreground">Add targets — set some to <span className="text-foreground">Maximize</span> (the optimizer balances all of them) and others to a <span className="text-foreground">Minimum</span> threshold like “Energy Regen ≥ 200”.</p>
                                )}
                                {calc.targets.map((t) => (
                                    <div key={t.id} className="flex flex-wrap items-center gap-2">
                                        <Select value={t.mode} onValueChange={(m) => calc.updateTarget(t.id, { mode: m as Target['mode'] })}>
                                            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                                            <SelectContent><SelectItem value="max">Maximize</SelectItem><SelectItem value="min">Minimum</SelectItem></SelectContent>
                                        </Select>
                                        <Select value={t.kind} onValueChange={(k) => { const kind = k as 'stat' | 'skill'; const first = optsFor(kind)[0]; calc.updateTarget(t.id, { kind, key: first.key, label: first.label }); }}>
                                            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                                            <SelectContent><SelectItem value="stat">Stat</SelectItem><SelectItem value="skill">Skill</SelectItem></SelectContent>
                                        </Select>
                                        <KeyLabelCombobox
                                            options={optsFor(t.kind)}
                                            value={t.key}
                                            onChange={(key) => calc.updateTarget(t.id, { key, label: optsFor(t.kind).find((o) => o.key === key)?.label ?? key })}
                                        />
                                        {t.mode === 'min' && (
                                            <>
                                                <span className="text-sm text-muted-foreground">≥</span>
                                                <Input className="w-28" type="number" value={t.min ?? 0} onChange={(e) => calc.updateTarget(t.id, { min: Number(e.target.value) })} />
                                            </>
                                        )}
                                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" onClick={() => calc.removeTarget(t.id)} aria-label="Remove target"><Trash2 /></Button>
                                    </div>
                                ))}
                                <Button variant="secondary" className="w-full" onClick={() => {
                                    const firstSkill = character.skills[0];
                                    calc.addTarget({ id: nextId(), kind: 'skill', key: firstSkill.id, label: firstSkill.name, mode: 'max' });
                                }}><Plus /> Add target</Button>
                            </div>

                            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2">
                                <div>
                                    <Label htmlFor="only-unequipped">Only unequipped {data.gearLabelPlural.toLowerCase()}</Label>
                                    <p className="text-xs text-muted-foreground">Excludes anything currently equipped on another character — {data.gearLabelPlural.toLowerCase()} equipped on {character.name} stay eligible.</p>
                                </div>
                                <Switch id="only-unequipped" checked={calc.onlyUnequipped} onCheckedChange={calc.setOnlyUnequipped} />
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button className="flex-1" onClick={() => { void run(); }} disabled={calc.optimizeProgress !== null}>
                                    <Wand2 /> {calc.optimizeProgress !== null ? 'Optimizing…' : 'Optimize loadouts'}
                                </Button>
                                <Button className="flex-1" variant="secondary" onClick={calculateCurrent} disabled={calc.optimizeProgress !== null} title="Score only the gear currently equipped on this character — no search.">
                                    <CalculatorIcon /> Calculate current loadout
                                </Button>
                            </div>
                            {calc.optimizeProgress !== null && <OptimizeProgressBar progress={calc.optimizeProgress} startedAt={optimizeStartRef.current} />}
                        </CardContent>
                    </Card>

                    {/* Results */}
                    {calc.results && (
                        <Card>
                            <CardHeader><CardTitle>Best loadouts</CardTitle></CardHeader>
                            <CardContent className="space-y-3">
                                {calc.results.map((lo, i) => <LoadoutRow key={lo.id} rank={i + 1} loadout={lo} targets={calc.targets} character={character} data={data} />)}
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}

function CharacterSummary({ c, data }: { c: CharacterData; data: ReturnType<typeof getGameData> }) {
    const activeGameId = useGameStore((s) => s.activeGameId);
    const owned = useOwnedInventory(activeGameId);
    const { equipped, buffs, sequence, skillLevels, skillStacks, setSkillStacks, buffStacks, setBuffStacks, removeBuff, addBuff, updateBuffValue, hasBuff, targetStatuses, skillTreeInvested } = useCalcStore();
    const { showItem, showGearPicker, showWeaponPicker, showBuffs } = useSelectionStore();
    const openWindow = useWindowStore((s) => s.openWindow);
    const weapon = data.weapons.find((w) => w.id === equipped.weaponId);
    const gear = equipped.gearIds.map((id) => owned.gear.find((g) => g.id === id)).filter(Boolean) as GearData[];
    const weaponRefine = equipped.weaponRefine ?? 1;
    const refineMultiplier = weapon ? refineMul(getWeaponScaling(activeGameId, weapon.id), weaponRefine) : 1;
    // Team/kit effects (incl. Outro buffs) — same toggle-on/off model as Party
    // Setup's "Deployed effects" list, surfaced here too so you don't have to
    // open a separate window to see or flip them.
    const party = usePartyStore((s) => s.byGame[activeGameId]?.[c.id]) ?? { teammates: [], disabled: [] };
    const getLoadout = (charId: string) => useLoadoutStore.getState().getLoadout(activeGameId, charId);
    const getSequence = (charId: string) => useSequenceStore.getState().getSequence(activeGameId, charId);
    const { effects: partyEffectsList, enabledBuffs: partyBuffs } = resolveParty(data, party, c, gear, equipped.weaponId, owned.gear, getLoadout, sequence, getSequence, targetStatuses);
    // Live final stats — recomputed whenever gear / buffs / weapon change,
    // covering exactly the stats the active game module declares. Includes
    // set-bonus buffs derived from THIS character's real equipped gear (same
    // `activeSetBonuses`-based mechanism `computeBaseLoadouts` uses for the
    // actual damage calc — see `setBonusBuffEntries`), so this preview never
    // silently disagrees with the real "calculate current" numbers below.
    const setBuffs = setBonusBuffEntries(gear, data.setBonuses, c.name);
    const allStatBuffs = [...stripAutoSkillTreeBuffs(buffs, c, skillTreeInvested), ...partyBuffs, ...setBuffs, ...weaponAutoBuffs(weapon, c, gear, data.statCatalog, {}, refineMultiplier), ...constellationAutoBuffs(c, sequence, gear, weapon, data.statCatalog), ...characterAutoBuffs(c, gear, weapon, data.statCatalog, {}, skillTreeInvested), ...gearAutoBuffs(gear, {}, c.name)];
    const stats = computeBuildStats(c, gear, allStatBuffs, weapon, data.statCatalog);
    // Basic/Heavy/Skill/Liberation DMG Bonus totals (see `withScopedDmgTotals`) —
    // same reasoning as the set-bonus buffs above, keeps this preview honest.
    withScopedDmgTotals(stats, [...allStatBuffs.filter(isScopedBuff), ...gearScopedBuffs(gear)]);

    return (
        <Card>
            <CardContent className="space-y-4 pt-4">
                <div className="flex flex-wrap items-center gap-3">
                    <button onClick={() => showItem(c)} className="flex items-center gap-3 rounded-md p-1 -m-1 text-left transition-colors hover:bg-surface-2" title="Inspect character">
                        <ItemIcon kind="character" size="lg" rarity={c.rarity} src={iconSrc(activeGameId, c.icon)} />
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">{c.name}</h2>
                            <div className="mt-1 flex gap-1"><Badge variant="secondary">{c.element}</Badge><Badge variant="outline">{c.weaponType}</Badge><Badge variant="outline">{c.rarity}★</Badge></div>
                        </div>
                    </button>
                    <Button variant="secondary" size="sm" className="ml-auto" onClick={() => openWindow('Talents', <TalentsWindow />)}>
                        <Star /> Talents
                    </Button>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                    <div>
                        <SummaryLabel>Stats <span className="ml-1 font-normal normal-case text-muted-foreground/70">(with gear + buffs)</span></SummaryLabel>
                        <div className="grid grid-cols-2 gap-1.5">
                            {data.statCatalog.map((def) => {
                                const v = stats[def.key] ?? 0;
                                return (
                                    <div key={def.key} className="flex items-center justify-between rounded-md border border-border bg-surface px-2.5 py-1.5">
                                        <span className="text-xs text-muted-foreground">{catalogStatLabel(def, c.element)}</span>
                                        <span className="text-xs font-medium tabular-nums text-foreground">{formatCatalogValue(def, v)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div>
                        <SummaryLabel>Skills</SummaryLabel>
                        <div className="space-y-1.5">
                            {c.skills.map((s) => {
                                const level = skillLevels[s.id] ?? DEFAULT_SKILL_LEVEL;
                                const stacks = s.stackMax != null ? (skillStacks[s.id] ?? s.stackMax) : undefined;
                                const mult = effectiveSkillMultiplier(s, level, stacks);
                                return (
                                    <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5">
                                        <span className="min-w-0 truncate text-sm text-foreground">{s.name}</span>
                                        <span className="flex flex-shrink-0 items-center gap-2">
                                            <Badge variant="secondary">{s.type}</Badge>
                                            {s.scaling && s.scaling !== 'atk' && <Badge variant="outline" title={`Scales off ${s.scaling.toUpperCase()}`}>{s.scaling.toUpperCase()}</Badge>}
                                            {s.approx && <Badge variant="outline" title="Generic value — no precise data authored for this character yet">generic</Badge>}
                                            {s.stackMax != null && (
                                                <span className="flex items-center gap-1" title={`Stacks this skill's damage scales with — defaults to max (${s.stackMax}), the same "assume best-case" convention used for buffs.`}>
                                                    <button
                                                        onClick={() => setSkillStacks(s.id, (stacks ?? 0) - 1, s.stackMax!)}
                                                        className="flex h-5 w-5 items-center justify-center rounded border border-border text-xs text-muted-foreground hover:bg-surface-2"
                                                        aria-label={`Decrease ${s.name} stacks`}
                                                    >−</button>
                                                    <span className="w-10 text-center text-xs tabular-nums text-foreground">{stacks}/{s.stackMax}</span>
                                                    <button
                                                        onClick={() => setSkillStacks(s.id, (stacks ?? 0) + 1, s.stackMax!)}
                                                        className="flex h-5 w-5 items-center justify-center rounded border border-border text-xs text-muted-foreground hover:bg-surface-2"
                                                        aria-label={`Increase ${s.name} stacks`}
                                                    >+</button>
                                                </span>
                                            )}
                                            <span className="text-xs text-primary">×{mult.toFixed(1)}</span>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                    <div className="space-y-3">
                        <div>
                            <SummaryLabel>Equipped</SummaryLabel>
                            <div className="flex flex-wrap items-stretch gap-2">
                                <button onClick={showWeaponPicker} title={weapon ? `Change weapon (${weapon.name})` : 'Equip weapon'} className="flex items-center gap-2 rounded-md border border-border bg-surface p-2 transition-colors hover:bg-surface-2">
                                    <ItemIcon kind="weapon" size="md" rarity={weapon?.rarity ?? 4} src={iconSrc(activeGameId, weapon?.icon)} />
                                    <span className="max-w-24 truncate text-xs text-foreground">{weapon?.name ?? 'Weapon'}</span>
                                </button>
                                <button onClick={showGearPicker} title="Change gear" className="flex flex-1 flex-wrap items-center gap-2 rounded-md border border-dashed border-border p-2 transition-colors hover:bg-surface-2">
                                    {gear.map((g) => g && <ItemIcon key={g.id} kind={g.kind} size="md" rarity={g.rarity} title={g.name} src={iconSrc(activeGameId, gearIcon(data, g))} badgeSrc={echoItemIconFor(g) ? iconSrc(activeGameId, setIconFor(data, g)) : undefined} />)}
                                    {gear.length === 0 && <span className="text-xs text-muted-foreground">Equip gear</span>}
                                </button>
                            </div>
                            {weapon && hasRefinement(getWeaponScaling(activeGameId, weapon.id)) && (
                                <div className="mt-2 flex items-center gap-1">
                                    {[1, 2, 3, 4, 5].map((r) => (
                                        <button key={r} onClick={() => useCalcStore.getState().setWeaponRefine(r)}
                                            className={cn('flex-1 rounded-md border py-1 text-xs font-medium transition-colors', weaponRefine === r ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-surface text-muted-foreground hover:bg-surface-2')}>
                                            R{r}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {weapon?.selfBuffs && weapon.selfBuffs.length > 0 && (
                            <div>
                                <SummaryLabel>Weapon passive <span className="ml-1 font-normal normal-case text-muted-foreground/70">(R{weaponRefine})</span></SummaryLabel>
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {/* Unconditional passives (from the game's addProps) — always applied. */}
                                    {weapon.selfBuffs.map((sb, i) => ({ sb, i })).filter(({ sb }) => sb.conditional === false).map(({ sb, i }) => (
                                        <span key={`auto-${i}`} className="rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-foreground" title="Always active (unconditional passive)">
                                            {sb.label} +{Math.round(sb.value * refineMultiplier * 10) / 10}
                                        </span>
                                    ))}
                                    {/* Conditional passives — opt-in toggles. `appliesTo` scopes the buff to specific attack types. */}
                                    {weapon.selfBuffs.map((sb, i) => ({ sb, i })).filter(({ sb }) => sb.conditional !== false).map(({ sb, i }) => {
                                        const id = selfBuffId(weapon.id, sb, i);
                                        const on = hasBuff(id);
                                        const scaleOffValue = sb.scaleOff ? resolveSelfScaleOff(c, gear, weapon, sb.scaleOff, data.statCatalog) : 0;
                                        const value = resolveConditionalValue(sb, id, buffStacks, scaleOffValue, refineMultiplier);
                                        return (
                                            <span key={id} className="inline-flex items-center gap-1">
                                                <button
                                                    onClick={() => (on ? removeBuff(id) : addBuff({ id, name: `${weapon.name} passive`, source: weapon.name, stat: sb.stat, value, ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}) }))}
                                                    className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${on ? 'border-primary/50 bg-primary/15 text-foreground' : 'border-dashed border-border bg-surface text-muted-foreground hover:bg-surface-2'}`}
                                                    title={weapon.passive ?? 'Conditional — toggle if active'}
                                                >
                                                    {on ? '✓ ' : '+ '}{sb.label} +{value}
                                                </button>
                                                {sb.stacksMax != null && (
                                                    <BuffStackStepper id={id} max={sb.stacksMax} buffStacks={buffStacks} setBuffStacks={setBuffStacks} perStack={sb.value * refineMultiplier} on={on} updateBuffValue={updateBuffValue} />
                                                )}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {partyEffectsList.length > 0 && (
                            <div>
                                <SummaryLabel>Team effects <span className="ml-1 font-normal normal-case text-muted-foreground/70">(incl. Outro)</span></SummaryLabel>
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {partyEffectsList.map((e) => {
                                        const on = !party.disabled.includes(e.id);
                                        return (
                                            <button
                                                key={e.id}
                                                onClick={() => usePartyStore.getState().toggleEffect(activeGameId, c.id, e.id)}
                                                className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${on ? 'border-primary/50 bg-primary/15 text-foreground' : 'border-dashed border-border bg-surface text-muted-foreground hover:bg-surface-2'}`}
                                                title={e.description ?? `${e.source} — toggle if active`}
                                            >
                                                {on ? '✓ ' : '+ '}{e.name} ({e.source})
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {(() => {
                            const gearWithBuffs = gear.filter((g) => gearSelfBuffs(g).some((sb) => sb.conditional !== false));
                            if (gearWithBuffs.length === 0) return null;
                            return (
                                <div>
                                    <SummaryLabel>Echo passives</SummaryLabel>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {gearWithBuffs.flatMap((g) =>
                                            gearSelfBuffs(g)
                                                .map((sb, i) => ({ sb, i }))
                                                .filter(({ sb }) => sb.conditional !== false)
                                                .map(({ sb, i }) => {
                                                    const id = gearBuffId(g.id, sb, i);
                                                    const on = hasBuff(id);
                                                    const value = resolveConditionalValue(sb, id, buffStacks, 0);
                                                    return (
                                                        <button
                                                            key={id}
                                                            onClick={() => (on ? removeBuff(id) : addBuff({ id, name: `${g.name} (Echo Skill)`, source: g.name, stat: sb.stat, value, ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}) }))}
                                                            className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${on ? 'border-primary/50 bg-primary/15 text-foreground' : 'border-dashed border-border bg-surface text-muted-foreground hover:bg-surface-2'}`}
                                                            title={`${g.name} — conditional, toggle if its Echo Skill was just used`}
                                                        >
                                                            {on ? '✓ ' : '+ '}{sb.label} +{value}
                                                        </button>
                                                    );
                                                }),
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                        {c.selfBuffs && c.selfBuffs.some((sb) => sb.conditional !== false && !isSkillTreeBuff(sb)) && (
                            <div>
                                <SummaryLabel>Passive talent</SummaryLabel>
                                <div className="mt-1 flex flex-wrap gap-1">
                                    {/* Conditional passive-talent self-buffs — opt-in toggles (unconditional ones auto-apply via characterAutoBuffs, no chip needed).
                                        Skill Tree buffs are excluded here — they're gated by the single master toggle in the Talents window instead of per-stat chips. */}
                                    {c.selfBuffs.map((sb, i) => ({ sb, i })).filter(({ sb }) => sb.conditional !== false && !isSkillTreeBuff(sb)).map(({ sb, i }) => {
                                        const id = passiveBuffId(c.id, sb, i);
                                        const on = hasBuff(id);
                                        const scaleOffValue = sb.scaleOff ? resolveSelfScaleOff(c, gear, weapon, sb.scaleOff, data.statCatalog) : 0;
                                        const value = resolveConditionalValue(sb, id, buffStacks, scaleOffValue);
                                        return (
                                            <span key={id} className="inline-flex items-center gap-1">
                                                <button
                                                    onClick={() => (on ? removeBuff(id) : addBuff({ id, name: `${c.name} passive`, source: c.name, stat: sb.stat, value, ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}) }))}
                                                    className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${on ? 'border-primary/50 bg-primary/15 text-foreground' : 'border-dashed border-border bg-surface text-muted-foreground hover:bg-surface-2'}`}
                                                    title={sb.label + ' — conditional, toggle if active'}
                                                >
                                                    {on ? '✓ ' : '+ '}{sb.label} +{value}
                                                </button>
                                                {sb.stacksMax != null && (
                                                    <BuffStackStepper id={id} max={sb.stacksMax} buffStacks={buffStacks} setBuffStacks={setBuffStacks} perStack={sb.value} on={on} updateBuffValue={updateBuffValue} />
                                                )}
                                            </span>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {(() => {
                            const seqLabel = data.sequenceLabel;
                            const conditionalNodes = (c.constellations ?? []).filter((n) => sequence >= n.level && (n.selfBuffs ?? []).some((sb) => sb.conditional !== false));
                            if (conditionalNodes.length === 0) return null;
                            return (
                                <div>
                                    <SummaryLabel>{seqLabel} effects</SummaryLabel>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {conditionalNodes.flatMap((node) =>
                                            (node.selfBuffs ?? [])
                                                .map((sb, i) => ({ sb, i }))
                                                .filter(({ sb }) => sb.conditional !== false)
                                                .map(({ sb, i }) => {
                                                    const id = constBuffId(c.id, node.level, sb, i);
                                                    const on = hasBuff(id);
                                                    const scaleOffValue = sb.scaleOff ? resolveSelfScaleOff(c, gear, weapon, sb.scaleOff, data.statCatalog) : 0;
                                                    const value = resolveConditionalValue(sb, id, buffStacks, scaleOffValue);
                                                    return (
                                                        <span key={id} className="inline-flex items-center gap-1">
                                                            <button
                                                                onClick={() => (on ? removeBuff(id) : addBuff({ id, name: `${node.name} (L${node.level})`, source: c.name, stat: sb.stat, value, ...(sb.appliesTo ? { appliesTo: sb.appliesTo } : {}) }))}
                                                                className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${on ? 'border-primary/50 bg-primary/15 text-foreground' : 'border-dashed border-border bg-surface text-muted-foreground hover:bg-surface-2'}`}
                                                                title={`${seqLabel} ${node.level} · ${node.name} — conditional, toggle if active`}
                                                            >
                                                                {on ? '✓ ' : '+ '}{sb.label} +{value}
                                                            </button>
                                                            {sb.stacksMax != null && (
                                                                <BuffStackStepper id={id} max={sb.stacksMax} buffStacks={buffStacks} setBuffStacks={setBuffStacks} perStack={sb.value} on={on} updateBuffValue={updateBuffValue} />
                                                            )}
                                                        </span>
                                                    );
                                                }),
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                        <div>
                            <Button variant="secondary" className="w-full" onClick={showBuffs}><Sparkles /> Custom Buffs{buffs.length > 0 ? ` (${buffs.length})` : ''}</Button>
                            {buffs.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {buffs.map((b) => (
                                        <button key={b.id} onClick={() => removeBuff(b.id)} className="group inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-xs text-foreground" title="Remove buff">
                                            {b.name} <span className="text-primary">+{b.value} {statLabel(b.stat)}</span>
                                            <XCircle className="h-3 w-3 text-muted-foreground group-hover:text-destructive" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function LoadoutRow({ rank, loadout, targets, character, data }: { rank: number; loadout: Loadout; targets: Target[]; character: CharacterData; data: GameData }) {
    const activeGameId = useGameStore((s) => s.activeGameId);
    const equipLoadout = useCalcStore((s) => s.equipLoadout);
    const showItem = useSelectionStore((s) => s.showItem);

    const targetStatKeys = new Set(targets.filter((t) => t.kind === 'stat').map((t) => t.key));
    const skillTargets = targets.filter((t) => t.kind === 'skill');
    // EVERY set tier (not just one — a 2pc+2pc split activates two
    // simultaneously) THIS combo's own real pieces actually activate — not
    // necessarily one of `calc.requiredSets` even when a set-bonus
    // requirement was declared (the pool was narrowed to those sets, but a
    // combo can still land short of any single set's own piece threshold,
    // e.g. a 3+2 split with neither side reaching 5pc/4pc). Showing it
    // directly, per result, is more honest than assuming the requirement
    // was actually satisfied.
    const active = activeSetBonuses(loadout.gear, data.setBonuses, character.name);
    const totalCost = loadout.gear.reduce((sum, g) => sum + (g.cost ?? 0), 0);

    const equip = () => {
        equipLoadout(loadout.gear.map((g) => g.id));
        toast.success('Equipped loadout to character');
    };

    return (
        <div className={cn('rounded-lg border p-3', loadout.meets ? 'border-success/40 bg-success/5' : 'border-border bg-surface')}>
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-2 text-sm font-semibold text-foreground">#{rank}</div>
                <div className="flex items-center gap-1.5">
                    {loadout.meets ? <CheckCircle2 className="h-4 w-4 text-success" /> : <XCircle className="h-4 w-4 text-warning" />}
                    <span className="text-xs text-muted-foreground">{loadout.meets ? 'Meets minimums' : `Misses: ${loadout.failed.join(', ')}`}</span>
                </div>
                {active.length > 0
                    ? active.map((sb) => <Badge key={sb.name} variant="secondary">{sb.name} ({sb.tier === 'full' ? 'full' : '2pc'})</Badge>)
                    : <Badge variant="outline">No set active</Badge>}
                {data.gearCatalog.maxTotalCost != null && <Badge variant="outline">Cost {totalCost}/{data.gearCatalog.maxTotalCost}</Badge>}
                <Button size="sm" className="ml-auto" onClick={equip}>Equip to character</Button>
            </div>

            {/* Gear — click to inspect */}
            <div className="mt-3 flex flex-wrap gap-2">
                {loadout.gear.map((g) => (
                    <button key={g.id} onClick={() => showItem(g)} title={`Inspect ${g.name}`}
                        className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1 transition-colors hover:bg-surface-2">
                        <ItemIcon kind={g.kind} size="sm" rarity={g.rarity} src={iconSrc(activeGameId, gearIcon(data, g))} badgeSrc={echoItemIconFor(g) ? iconSrc(activeGameId, setIconFor(data, g)) : undefined} />
                        <div className="text-left text-xs">
                            <div className="font-medium text-foreground">{g.name}</div>
                            <div className="text-muted-foreground">{g.mainStat.label}</div>
                        </div>
                    </button>
                ))}
            </div>

            {/* All stats (per the game module's catalog) — optimization targets highlighted */}
            <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {data.statCatalog.map((def) => {
                    const v = loadout.stats[def.key] ?? 0;
                    const isTarget = targetStatKeys.has(def.key);
                    return (
                        <div key={def.key} className={cn('rounded-md border px-2.5 py-1.5', isTarget ? 'border-primary/60 bg-primary/10' : 'border-border bg-background')}>
                            <div className={cn('text-[10px] uppercase tracking-wide', isTarget ? 'text-primary' : 'text-muted-foreground')}>{catalogStatLabel(def, character.element)}</div>
                            <div className={cn('text-sm font-medium tabular-nums', isTarget ? 'text-primary' : 'text-foreground')}>{formatCatalogValue(def, v)}</div>
                        </div>
                    );
                })}
            </div>

            {/* Skill-damage targets (highlighted) */}
            {skillTargets.length > 0 && (
                <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {skillTargets.map((t) => {
                        const name = character.skills.find((s) => s.id === t.key)?.name ?? t.label;
                        const v = loadout.skillDamage[t.key] ?? 0;
                        return (
                            <div key={t.id} className="rounded-md border border-primary/60 bg-primary/10 px-2.5 py-1.5">
                                <div className="truncate text-[10px] uppercase tracking-wide text-primary">{name}</div>
                                <div className="text-sm font-medium tabular-nums text-primary">{v.toLocaleString()}</div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function SummaryLabel({ children, className }: { children: React.ReactNode; className?: string }) {
    return <h3 className={cn('mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)}>{children}</h3>;
}

/** ETA + percent, from combos done/total so far and how long that took —
 * simple rate projection (remaining = (total - done) / (done / elapsed)),
 * not a fixed animation, so it stays honest if a machine's actual speed
 * doesn't match a generic estimate. Indeterminate (no percent, no ETA) until
 * the first worker reports its slice size — `total` starts at 0 both before
 * any worker has checked in and briefly during the backend-RPC attempt,
 * which has no progress feedback at all. */
function OptimizeProgressBar({ progress, startedAt }: { progress: { done: number; total: number }; startedAt: number }) {
    const { done, total } = progress;
    const percent = total > 0 ? (done / total) * 100 : undefined;
    const elapsedSec = (Date.now() - startedAt) / 1000;
    const etaLabel = (() => {
        if (total === 0 || done === 0 || elapsedSec < 0.5) return null;
        const rate = done / elapsedSec; // combos/sec
        const remainingSec = Math.max(0, (total - done) / rate);
        if (remainingSec < 1) return 'finishing…';
        return remainingSec < 60 ? `~${Math.ceil(remainingSec)}s remaining` : `~${Math.ceil(remainingSec / 60)}m remaining`;
    })();

    return (
        <div className="space-y-1.5">
            <Progress value={percent} />
            <p className="text-xs text-muted-foreground">
                {total > 0 ? `${done.toLocaleString()} / ${total.toLocaleString()} combinations` : 'Starting…'}
                {etaLabel ? ` · ${etaLabel}` : ''}
            </p>
        </div>
    );
}
