import { useMemo, useState } from 'react';
import { PageHeader, Card, CardHeader, CardTitle, CardContent, Badge, EmptyState, Button, Input, toast } from '../components/ui';
import { cn } from '@/lib/utils';
import { Target as TargetIcon, Save, FolderOpen, Trash2 } from 'lucide-react';
import { RotationBuilder } from '../components/modules/RotationBuilder';
import { useGameStore } from '../stores/gameStore';
import { useCalcStore } from '../stores/calcStore';
import { useOwnedInventory } from '../stores/inventoryStore';
import { useNamedPartyStore } from '../stores/namedPartyStore';
import { useLoadoutStore } from '../stores/loadoutStore';
import { useSequenceStore } from '../stores/sequenceStore';
import { useRotationStore, type SavedRotation } from '../stores/rotationStore';
import { useGameData } from '../data/gameData';
import { resolveNamedParty, partyEffects, enabledPartyBuffs, type PartyMemberResolved } from '@/lib/party';
import { PartyPickerWindow } from '../components/PartyWindows';
import { useWindowStore } from '../stores/windowStore';
import { weaponAutoBuffs, characterAutoBuffs, constellationAutoBuffs, gearAutoBuffs, conditionalWeaponBuffs, conditionalCharacterBuffs, conditionalConstellationBuffs, conditionalGearBuffs } from '@/lib/selfBuffs';
import { computeBuildStats, skillDamage, applyConstellationLevelBoosts, isScopedBuff, gearScopedBuffs, activeSetBonuses, type SkillContext } from '../data/optimizer';
import { getWeaponScaling, refineMul } from '../data/weaponScaling';
import type { FieldSpec, RotationStepSpec } from '../types';
import type { BuffEntry, SkillDef } from '@shared/types/game-bundle';

/** This member's own weapon-passive refine multiplier (R1 = 1) — see `weaponAutoBuffs`. */
function memberRefineMultiplier(member: PartyMemberResolved, gameId: string): number {
    return member.weapon ? refineMul(getWeaponScaling(gameId, member.weapon.id), member.weaponRefine ?? 1) : 1;
}

/** Coarse action-type bucket for the timeline card's colored badge only — the
 * actual damage calculation always looks up the real SkillDef by `skill.id`
 * directly and ignores this bucket. */
function coarseSkillType(rawType: string): 'basic' | 'skill' | 'ultimate' {
    const t = rawType.toLowerCase();
    if (t.includes('liberation') || t.includes('ultimate') || t.includes('burst')) return 'ultimate';
    if (t.includes('normal') || t.includes('basic') || t.includes('charged') || t.includes('plunge') || t.includes('aimed') || t.includes('heavy')) return 'basic';
    return 'skill';
}

/** All conditional (opt-in) self-buffs a party member could toggle on — weapon passive, character passive-talent, and unlocked Constellation/Sequence. */
function conditionalBuffCandidates(member: PartyMemberResolved, catalog: Parameters<typeof computeBuildStats>[4], gameId: string) {
    return [
        ...conditionalWeaponBuffs(member.weapon, member.character, member.gear, catalog, {}, memberRefineMultiplier(member, gameId)),
        ...conditionalCharacterBuffs(member.character, member.gear, member.weapon, catalog),
        ...conditionalConstellationBuffs(member.character, member.sequence ?? 0, member.gear, member.weapon, catalog),
        ...conditionalGearBuffs(member.gear),
    ];
}

interface StepResult {
    step: RotationStepSpec;
    index: number;
    member?: PartyMemberResolved;
    skill?: SkillDef;
    damage: number;
}

/** Best-case-by-default per-step damage: talent 10 / max stacks unless the step overrides them. Team buffs are always on; self-buffs are on only for characters with an enabled conditional toggle — same convention as the Calculator. */
function computeStepDamage(
    step: RotationStepSpec,
    member: PartyMemberResolved | undefined,
    teamBuffs: BuffEntry[],
    enabledSelfBuffs: BuffEntry[],
    critMode: SkillContext['mode'],
    enemy: SkillContext['enemy'],
    reaction: SkillContext['reaction'],
    catalog: Parameters<typeof computeBuildStats>[4],
    gameId: string,
): { skill?: SkillDef; damage: number } {
    if (!member || !step.skillId) return { damage: 0 };
    const skill = member.character.skills.find((s) => s.id === step.skillId);
    if (!skill) return { damage: 0 };

    const buffs = [
        ...teamBuffs,
        ...weaponAutoBuffs(member.weapon, member.character, member.gear, catalog, {}, memberRefineMultiplier(member, gameId)),
        ...constellationAutoBuffs(member.character, member.sequence ?? 0, member.gear, member.weapon, catalog),
        ...characterAutoBuffs(member.character, member.gear, member.weapon, catalog),
        ...gearAutoBuffs(member.gear),
        ...enabledSelfBuffs,
    ];
    const stats = computeBuildStats(member.character, member.gear, buffs, member.weapon, catalog);
    const talentLevels = applyConstellationLevelBoosts(member.character, { [skill.id]: step.talentLevel ?? 10 }, member.sequence ?? 0);
    const ctx: SkillContext = {
        mode: critMode,
        enemy,
        talentLevels,
        stacks: { [skill.id]: step.stackCount ?? skill.stackMax ?? 0 },
        reaction,
        charLevel: 90,
        scopedBuffs: [...buffs.filter(isScopedBuff), ...gearScopedBuffs(member.gear)],
    };
    return { skill, damage: skillDamage(stats, skill, ctx) };
}

function SummaryLabel({ children, className }: { children: React.ReactNode; className?: string }) {
    return <h3 className={cn('mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)}>{children}</h3>;
}

let rotSeq = 0;
const nextRotationId = () => `rot-${Date.now()}-${++rotSeq}`;

export function RotationScreen() {
    const activeGameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(activeGameId);
    const owned = useOwnedInventory(activeGameId);
    const calc = useCalcStore();

    const [activePartyId, setActivePartyId] = useState<string | undefined>(undefined);
    const partyMemberCount = useNamedPartyStore((s) => (activePartyId ? s.byGame[activeGameId]?.[activePartyId]?.memberCharacterIds.length ?? 0 : 0));
    // Re-resolve whenever the selected party or owned gear changes. No longer
    // depends on the Calculator's active character at all — a named party has
    // no anchor slot (see `resolveNamedParty`).
    const { partyMembers, partyDisabled } = useMemo(() => {
        if (!activePartyId) return { partyMembers: [] as PartyMemberResolved[], partyDisabled: [] as string[] };
        const party = useNamedPartyStore.getState().byGame[activeGameId]?.[activePartyId];
        if (!party) return { partyMembers: [] as PartyMemberResolved[], partyDisabled: [] as string[] };
        const getLoadout = (charId: string) => useLoadoutStore.getState().getLoadout(activeGameId, charId);
        const getSequence = (charId: string) => useSequenceStore.getState().getSequence(activeGameId, charId);
        const resolved = resolveNamedParty(data, party, owned.gear, getLoadout, getSequence, calc.targetStatuses);
        return { partyMembers: resolved.members, partyDisabled: party.disabled };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePartyId, activeGameId, owned.gear, partyMemberCount, data, calc.targetStatuses]);

    const [steps, setSteps] = useState<RotationStepSpec[]>([]);

    // A step can reference a character outside the currently-selected party —
    // either no party is selected yet (full-roster picker still active) or a
    // saved rotation's steps predate the party it's now attached to. Resolve
    // them the same way `resolveNamedParty` resolves a party member: from
    // THEIR OWN persisted loadout/sequence, never a separate hand-picked build.
    const extraMembers = useMemo(() => {
        const partyIds = new Set(partyMembers.map((m) => m.character.id));
        const extraIds = [...new Set(steps.map((s) => s.characterId))].filter((id) => !partyIds.has(id));
        return extraIds.map((id): PartyMemberResolved | null => {
            const character = data.characters.find((c) => c.id === id);
            if (!character) return null;
            const loadout = useLoadoutStore.getState().getLoadout(activeGameId, id);
            const gear = loadout.gearIds.map((gid) => owned.gear.find((g) => g.id === gid)).filter(Boolean) as typeof owned.gear;
            const weapon = loadout.weaponId ? data.weapons.find((w) => w.id === loadout.weaponId) : undefined;
            const sequence = useSequenceStore.getState().getSequence(activeGameId, id);
            return { id, character, gear, setBonuses: activeSetBonuses(gear, data.setBonuses, character.name), weapon, weaponRefine: loadout.weaponRefine, sequence };
        }).filter((m): m is PartyMemberResolved => m != null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [steps, partyMembers, data, activeGameId, owned.gear]);

    const members = useMemo(() => [...partyMembers, ...extraMembers], [partyMembers, extraMembers]);
    // Team-wide effects (kit/set/weapon buffs) recomputed over the FULL rotation
    // roster, not just the configured party — an added-but-not-partied support's
    // team buff should still reach the rest of the rotation, same as it would in
    // an actual run.
    const enabledBuffs = useMemo(() => {
        const effects = partyEffects(data, members);
        return enabledPartyBuffs(effects, partyDisabled, calc.targetStatuses);
    }, [data, members, partyDisabled, calc.targetStatuses]);

    /** characterId -> enabled conditional-self-buff ids for that member (persists across steps, not per-step). */
    const [enabledSelfBuffIds, setEnabledSelfBuffIds] = useState<Record<string, string[]>>({});
    const toggleSelfBuff = (characterId: string, buffId: string) =>
        setEnabledSelfBuffIds((prev) => {
            const cur = prev[characterId] ?? [];
            const next = cur.includes(buffId) ? cur.filter((id) => id !== buffId) : [...cur, buffId];
            return { ...prev, [characterId]: next };
        });

    const savedRotations = useRotationStore((s) => s.byGame[activeGameId]);
    const savedList = useMemo(() => Object.values(savedRotations ?? {}), [savedRotations]);
    const [rotationName, setRotationName] = useState('');
    const [loadedRotationId, setLoadedRotationId] = useState<string | null>(null);

    const handleSave = () => {
        if (steps.length === 0) return;
        const name = rotationName.trim();
        if (!name) return;
        const id = loadedRotationId ?? nextRotationId();
        const rotation: SavedRotation = { id, name, partyId: activePartyId, steps, enabledSelfBuffIds };
        useRotationStore.getState().save(activeGameId, rotation);
        setLoadedRotationId(id);
        toast.success(`Saved "${name}"`);
    };
    const handleLoad = (r: SavedRotation) => {
        setSteps(r.steps);
        setEnabledSelfBuffIds(r.enabledSelfBuffIds);
        setRotationName(r.name);
        setLoadedRotationId(r.id);
        setActivePartyId(r.partyId);
    };
    const handleDelete = (r: SavedRotation) => {
        useRotationStore.getState().remove(activeGameId, r.id);
        if (loadedRotationId === r.id) {
            setLoadedRotationId(null);
        }
        toast.success(`Deleted "${r.name}"`);
    };
    const handleNewRotation = () => {
        setSteps([]);
        setEnabledSelfBuffIds({});
        setRotationName('');
        setLoadedRotationId(null);
    };

    const field: FieldSpec = useMemo(() => ({
        id: 'rotation',
        label: 'Rotation Builder',
        type: 'rotation',
        rotationConfig: {
            characters: members.map((m) => ({ id: m.character.id, label: m.character.name })),
            skills: Object.fromEntries(members.map((m) => [
                m.character.id,
                m.character.skills.map((s) => ({ id: s.id, label: s.name, type: coarseSkillType(s.type), stackMax: s.stackMax })),
            ])),
            maxRotationLength: 60,
            showEnergy: false,
        },
    }), [members]);

    const reaction: SkillContext['reaction'] = data.supportsReactions ? calc.reaction : 'none';
    const results: StepResult[] = useMemo(() => steps.map((step, index) => {
        const member = members.find((m) => m.character.id === step.characterId);
        const enabledIds = new Set(enabledSelfBuffIds[step.characterId] ?? []);
        const enabledSelfBuffs = member && enabledIds.size > 0 ? conditionalBuffCandidates(member, data.statCatalog, activeGameId).filter((b) => enabledIds.has(b.id)) : [];
        const { skill, damage } = computeStepDamage(step, member, enabledBuffs, enabledSelfBuffs, calc.critMode, calc.enemy, reaction, data.statCatalog, activeGameId);
        return { step, index, member, skill, damage };
         
    }), [steps, members, enabledBuffs, enabledSelfBuffIds, calc.critMode, calc.enemy, reaction, data.statCatalog, activeGameId]);

    const totalDamage = results.reduce((sum, r) => sum + r.damage, 0);
    const totalDuration = steps.reduce((sum, s) => sum + (s.duration || 0), 0);
    const dps = totalDuration > 0 ? totalDamage / totalDuration : 0;
    const byCharacter = useMemo(() => {
        const map = new Map<string, { name: string; damage: number }>();
        for (const r of results) {
            if (!r.member) continue;
            const cur = map.get(r.member.character.id) ?? { name: r.member.character.name, damage: 0 };
            cur.damage += r.damage;
            map.set(r.member.character.id, cur);
        }
        return [...map.values()].sort((a, b) => b.damage - a.damage);
    }, [results]);

    return (
        <div className="mx-auto max-w-5xl space-y-6 p-6">
            <PageHeader
                title="Rotation Builder"
                description="Pick a party, sequence turns, and see real damage totals."
                actions={<Button variant="secondary" onClick={() => useWindowStore.getState().openWindow('Party', <PartyPickerWindow onSelect={setActivePartyId} />)}>Party{activePartyId ? ` (${partyMembers.length}/3)` : ''}</Button>}
            />
            {!activePartyId ? (
                <EmptyState icon={TargetIcon} title="Select a party" description="Pick a saved party (or create one) to start building a rotation." />
            ) : members.length === 0 ? (
                <EmptyState icon={TargetIcon} title="No party members resolved" description="This party has no members left, or they couldn't be resolved — check it in the Party picker." />
            ) : (
                <>
                    <Card>
                        <CardContent className="p-4">
                            <RotationBuilder field={field} value={steps} onChange={setSteps} restrictToCharacterIds={activePartyId ? partyMembers.map((m) => m.character.id) : undefined} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>Saved rotations</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <Input className="max-w-xs" placeholder="Rotation name…" value={rotationName} onChange={(e) => setRotationName(e.target.value)} />
                                <Button size="sm" onClick={handleSave} disabled={steps.length === 0 || rotationName.trim().length === 0}>
                                    <Save /> {loadedRotationId ? 'Update' : 'Save'}
                                </Button>
                                {loadedRotationId && (
                                    <Button size="sm" variant="secondary" onClick={handleNewRotation}>New rotation</Button>
                                )}
                            </div>
                            {savedList.length > 0 && (
                                <div className="space-y-1.5">
                                    {savedList.map((r) => (
                                        <div key={r.id} className={cn('flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm', r.id === loadedRotationId ? 'border-primary/50 bg-primary/10' : 'border-border bg-surface')}>
                                            <span className="min-w-0 flex-1 truncate text-foreground">{r.name}</span>
                                            <span className="text-xs text-muted-foreground">{r.steps.length} step{r.steps.length === 1 ? '' : 's'}</span>
                                            <Button size="sm" variant="ghost" onClick={() => handleLoad(r)} title="Load"><FolderOpen /></Button>
                                            <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => handleDelete(r)} title="Delete"><Trash2 /></Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>Conditional self-buffs</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <p className="text-xs text-muted-foreground">Off by default, same convention as the Calculator — toggle on any that are realistically active for this rotation. Applies to every step for that character.</p>
                            {members.map((m) => {
                                const candidates = conditionalBuffCandidates(m, data.statCatalog, activeGameId);
                                if (candidates.length === 0) return null;
                                const enabled = new Set(enabledSelfBuffIds[m.character.id] ?? []);
                                return (
                                    <div key={m.id}>
                                        <SummaryLabel>{m.character.name}</SummaryLabel>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {candidates.map((b) => {
                                                const on = enabled.has(b.id);
                                                return (
                                                    <button
                                                        key={b.id}
                                                        onClick={() => toggleSelfBuff(m.character.id, b.id)}
                                                        className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${on ? 'border-primary/50 bg-primary/15 text-foreground' : 'border-dashed border-border bg-surface text-muted-foreground hover:bg-surface-2'}`}
                                                        title={(b as { label?: string }).label ?? b.name}
                                                    >
                                                        {on ? '✓ ' : '+ '}{(b as { label?: string }).label ?? b.name} +{b.value}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>

                    {steps.length > 0 && (
                        <Card>
                            <CardHeader><CardTitle>Results</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    <div className="rounded-md border border-border bg-surface px-3 py-2">
                                        <div className="text-xs text-muted-foreground">Total DMG</div>
                                        <div className="text-lg font-semibold tabular-nums text-foreground">{Math.round(totalDamage).toLocaleString()}</div>
                                    </div>
                                    <div className="rounded-md border border-border bg-surface px-3 py-2">
                                        <div className="text-xs text-muted-foreground">DPS</div>
                                        <div className="text-lg font-semibold tabular-nums text-foreground">{totalDuration > 0 ? Math.round(dps).toLocaleString() : '—'}</div>
                                    </div>
                                    <div className="rounded-md border border-border bg-surface px-3 py-2">
                                        <div className="text-xs text-muted-foreground">Duration</div>
                                        <div className="text-lg font-semibold tabular-nums text-foreground">{totalDuration.toFixed(1)}s</div>
                                    </div>
                                </div>

                                {byCharacter.length > 1 && (
                                    <div className="space-y-1.5">
                                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Per-character contribution</div>
                                        {byCharacter.map((c) => (
                                            <div key={c.name} className="flex items-center justify-between rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm">
                                                <span className="text-foreground">{c.name}</span>
                                                <span className="tabular-nums text-muted-foreground">{Math.round(c.damage).toLocaleString()} ({totalDamage > 0 ? Math.round((c.damage / totalDamage) * 100) : 0}%)</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Per-step breakdown</div>
                                    {results.map((r) => (
                                        <div key={r.index} className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm">
                                            <span className="w-6 text-center text-muted-foreground">{r.index + 1}</span>
                                            <span className="min-w-0 flex-1 truncate text-foreground">{r.member?.character.name ?? r.step.characterId}</span>
                                            <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.skill?.name ?? r.step.skillLabel ?? '—'}</span>
                                            {!r.skill && <Badge variant="outline">no damage</Badge>}
                                            <span className="w-24 flex-shrink-0 text-right tabular-nums text-foreground">{Math.round(r.damage).toLocaleString()}</span>
                                            <span className="w-12 flex-shrink-0 text-right tabular-nums text-muted-foreground">{totalDamage > 0 ? Math.round((r.damage / totalDamage) * 100) : 0}%</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
