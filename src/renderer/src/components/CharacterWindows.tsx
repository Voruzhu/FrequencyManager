import { useMemo, useState } from 'react';
import { Search, X, Zap, Star, Hexagon, Lock, Minus, Plus, type LucideIcon } from 'lucide-react';
import {
    Input, Button, Badge, Switch, ItemIcon, DialogFooter, DialogClose,
    Tooltip, TooltipTrigger, TooltipContent,
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from './ui';
import { cn } from '@/lib/utils';
import { useGameStore } from '../stores/gameStore';
import { useCalcStore, DEFAULT_SKILL_LEVEL, MAX_SKILL_LEVEL } from '../stores/calcStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useWindowStore } from '../stores/windowStore';
import { useOwnedInventory } from '../stores/inventoryStore';
import { iconSrc } from '@/lib/icons';
import { useGameData, getPassives, getSequenceLabel, describePassiveSlot, SEQUENCE_MAX } from '../data/gameData';
import { groupSkillsForTalents } from '../data/talentGroups';
import { isSkillTreeBuff } from '@/lib/selfBuffs';

/** Small placeholder art tile for talents/passives/sequence nodes. */
function IconSlot({ icon: Icon, active = true, className }: { icon: LucideIcon; active?: boolean; className?: string }) {
    return (
        <div className={cn('relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border', active ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-surface-2 text-muted-foreground', className)}>
            <Icon className="h-5 w-5" />
            {!active && (
                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background">
                    <Lock className="h-2.5 w-2.5 text-muted-foreground" />
                </span>
            )}
        </div>
    );
}

// ── Character picker window ──────────────────────────────────────────────────

export function CharacterPickerWindow() {
    const gameId = useGameStore((s) => s.activeGameId);
    const owned = useOwnedInventory(gameId);
    const { characterId, pickCharacter } = useCalcStore();
    const showItem = useSelectionStore((s) => s.showItem);
    const closeWindow = useWindowStore((s) => s.closeWindow);
    const [q, setQ] = useState('');

    const query = q.trim().toLowerCase();
    const roster = owned.characters;
    const filtered = query ? roster.filter((c) => c.name.toLowerCase().includes(query)) : roster;

    const pick = (id: string) => {
        const c = roster.find((x) => x.id === id);
        if (!c) return;
        pickCharacter(c);
        showItem(c);
        closeWindow();
    };

    return (
        <div className="space-y-3">
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search characters…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            </div>
            <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto scrollbar-thin sm:grid-cols-4">
                {filtered.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">No characters match “{q}”.</p>}
                {filtered.map((c) => (
                    <button key={c.id} onClick={() => pick(c.id)}
                        className={cn('flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-colors', c.id === characterId ? 'border-primary ring-1 ring-primary/40' : 'border-border bg-card hover:bg-surface-2')}>
                        <ItemIcon kind="character" size="lg" rarity={c.rarity} src={iconSrc(gameId, c.icon)} />
                        <span className="line-clamp-1 text-sm font-medium text-foreground">{c.name}</span>
                        <Badge variant="secondary">{c.element}</Badge>
                    </button>
                ))}
            </div>
        </div>
    );
}

// ── Rotation Builder's "Add Character" picker — full game roster, not just owned/party ──

/** Full-roster character picker for the Rotation Builder: unlike `CharacterPickerWindow`
 * (which picks the Calculator's single active character from your OWNED roster),
 * this adds a step for ANY character in the game — including ones you haven't
 * built yet — so `onPick` just returns an id, it doesn't touch `calcStore`. */
export function RotationCharacterPickerWindow({ onPick }: { onPick: (characterId: string) => void }) {
    const gameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(gameId);
    const closeWindow = useWindowStore((s) => s.closeWindow);
    const [q, setQ] = useState('');
    const [element, setElement] = useState('all');
    const [weapon, setWeapon] = useState('all');
    const [rarity, setRarity] = useState('all');

    const elements = useMemo(() => Array.from(new Set(data.characters.map((c) => c.element))).sort(), [data.characters]);
    const weaponTypes = useMemo(() => Array.from(new Set(data.characters.map((c) => c.weaponType))).sort(), [data.characters]);
    const rarities = useMemo(() => Array.from(new Set(data.characters.map((c) => c.rarity))).sort((a, b) => b - a), [data.characters]);

    const query = q.trim().toLowerCase();
    const filtered = data.characters.filter((c) =>
        (!query || c.name.toLowerCase().includes(query))
        && (element === 'all' || c.element === element)
        && (weapon === 'all' || c.weaponType === weapon)
        && (rarity === 'all' || String(c.rarity) === rarity))
        // Highest rarity first by default, alphabetical within the same rarity.
        .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
    const filtersActive = q !== '' || element !== 'all' || weapon !== 'all' || rarity !== 'all';
    const clearFilters = () => { setQ(''); setElement('all'); setWeapon('all'); setRarity('all'); };

    const pick = (id: string) => {
        onPick(id);
        closeWindow();
    };

    return (
        <div className="space-y-3">
            <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search characters…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Select value={element} onValueChange={setElement}>
                    <SelectTrigger className="w-36"><SelectValue placeholder="Element" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All elements</SelectItem>
                        {elements.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={weapon} onValueChange={setWeapon}>
                    <SelectTrigger className="w-36"><SelectValue placeholder="Weapon" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All weapons</SelectItem>
                        {weaponTypes.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={rarity} onValueChange={setRarity}>
                    <SelectTrigger className="w-24"><SelectValue placeholder="Rarity" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Any★</SelectItem>
                        {rarities.map((r) => <SelectItem key={r} value={String(r)}>{r}★</SelectItem>)}
                    </SelectContent>
                </Select>
                {filtersActive && (
                    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={clearFilters}><X /> Clear filters</Button>
                )}
            </div>
            <div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto scrollbar-thin sm:grid-cols-4">
                {filtered.length === 0 && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">No characters match.</p>}
                {filtered.map((c) => (
                    <button key={c.id} onClick={() => pick(c.id)}
                        className="flex flex-col items-center gap-1.5 rounded-lg border border-border bg-card p-3 text-center transition-colors hover:bg-surface-2">
                        <ItemIcon kind="character" size="lg" rarity={c.rarity} src={iconSrc(gameId, c.icon)} />
                        <span className="line-clamp-1 text-sm font-medium text-foreground">{c.name}</span>
                        <Badge variant="secondary">{c.element}</Badge>
                    </button>
                ))}
            </div>
        </div>
    );
}

// ── Talents window ────────────────────────────────────────────────────────────

export function TalentsWindow() {
    const gameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(gameId);
    const { characterId, skillLevels, passives, sequence, setSkillLevel, togglePassive, setSequence, skillTreeInvested, setSkillTreeInvested } = useCalcStore();
    const character = data.characters.find((c) => c.id === characterId);

    if (!character) return <p className="text-sm text-muted-foreground">Pick a character in the Damage Calculator first.</p>;

    const passiveList = getPassives(gameId);
    const seqLabel = getSequenceLabel(gameId);

    return (
        <div className="max-h-[70vh] space-y-5 overflow-y-auto scrollbar-thin pr-1">
            {/* Skill levels — basic-attack variants (e.g. Basic + Heavy Attack, or
                Normal/Charged/Plunging/Aimed Shot) level together as ONE talent,
                matching how the game itself groups them. Hover a row for the
                full description of everything it covers. */}
            <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Skill levels</h3>
                {groupSkillsForTalents(gameId, character.skills).map((row) => {
                    const lvl = skillLevels[row.memberIds[0]] ?? DEFAULT_SKILL_LEVEL;
                    const setLvl = (n: number) => row.memberIds.forEach((id) => setSkillLevel(id, n));
                    // Mixed-type groups (e.g. Normal Attack's Normal+Charged+Plunge) read fine as
                    // types; same-type groups (e.g. 2+ Elemental Skill damage instances) are more
                    // useful shown by their real names than a repeated "Skill + Skill + Skill".
                    const sameType = row.members.length > 1 && new Set(row.members.map((m) => m.type)).size === 1;
                    const subtitle = row.members.length === 1 ? row.members[0].type : sameType ? row.members.map((m) => m.name).join(' + ') : row.members.map((m) => m.type).join(' + ');
                    const anyApprox = row.members.some((m) => m.approx);
                    // GI Constellation 3/5's "+3 to this skill's level, max 15" — shown
                    // so the effective level (what the Calculator actually uses) is
                    // visible, not just the manually-trained slider value.
                    const bonus = (character.constellations ?? [])
                        .filter((n) => n.boostsSkillId && row.memberIds.includes(n.boostsSkillId) && sequence >= n.level)
                        .length * 3;
                    const effectiveLvl = Math.min(15, lvl + bonus);
                    return (
                        <Tooltip key={row.id} delayDuration={200}>
                            <TooltipTrigger asChild>
                                <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-2">
                                    <IconSlot icon={Zap} />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium text-foreground">{row.label}</div>
                                        <div className="truncate text-xs text-muted-foreground">{subtitle}{anyApprox ? ' · generic' : ''}</div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => setLvl(lvl - 1)} aria-label="Lower"><Minus /></Button>
                                        <span className="w-16 text-center text-sm tabular-nums text-foreground">
                                            Lv {lvl}{bonus > 0 && <span className="text-primary"> (+{bonus})</span>}
                                        </span>
                                        <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => setLvl(lvl + 1)} aria-label="Raise"><Plus /></Button>
                                    </div>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs space-y-1.5">
                                {row.members.map((m) => (
                                    <p key={m.id}><span className="font-medium text-foreground">{m.name}</span> — {m.description}</p>
                                ))}
                                {bonus > 0 && <p className="text-primary">Effective level {effectiveLvl} — trained {lvl} + {bonus} from {seqLabel}.</p>}
                            </TooltipContent>
                        </Tooltip>
                    );
                })}
                <p className="text-[11px] text-muted-foreground">Max Lv {MAX_SKILL_LEVEL} trained (talent books). {seqLabel} 3/5 can push a specific skill further, shown as "(+3)" — applied automatically in the Calculator. Skills that level together (e.g. Basic + Heavy Attack) share one row; each is still a separate optimization target.</p>
            </section>

            {/* Passives */}
            <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Passive skills</h3>
                {passiveList.map((p, i) => {
                    const on = passives[p.id] ?? false;
                    // The generic slot label ("Inherent Skill I", "1st Ascension Passive")
                    // is the same for every character — swap in this character's own
                    // tagged self-buff text when we have it (see `describePassiveSlot`).
                    const description = describePassiveSlot(gameId, character, i) ?? p.description;
                    return (
                        <Tooltip key={p.id} delayDuration={200}>
                            <TooltipTrigger asChild>
                                <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-2">
                                    <IconSlot icon={Star} active={on} />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium text-foreground">{p.name}</div>
                                        <div className="truncate text-xs text-muted-foreground">{description}</div>
                                    </div>
                                    <Switch checked={on} onCheckedChange={() => togglePassive(p.id)} />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-xs">{description}</TooltipContent>
                        </Tooltip>
                    );
                })}
            </section>

            {/* WW's Skill Tree stat nodes (ATK%/Crit Rate/etc — a fixed "fully
                invested" amount) — one master switch instead of per-stat chips,
                on by default since a serious build reaches this anyway. */}
            {character.selfBuffs?.some(isSkillTreeBuff) && (
                <section>
                    <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-2">
                        <IconSlot icon={Star} active={skillTreeInvested} />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-foreground">Skill Tree bonuses</div>
                            <div className="truncate text-xs text-muted-foreground">
                                {character.selfBuffs.filter(isSkillTreeBuff).map((sb) => sb.label.replace(/^Skill Tree:\s*/, '').replace(/\s*\(fully invested\)\s*$/, '')).join(', ')}
                            </div>
                        </div>
                        <Switch checked={skillTreeInvested} onCheckedChange={setSkillTreeInvested} />
                    </div>
                </section>
            )}

            {/* Sequences / Constellations */}
            <section className="space-y-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{seqLabel}</h3>
                    <span className="text-xs text-muted-foreground">{sequence} / {SEQUENCE_MAX}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {Array.from({ length: SEQUENCE_MAX }, (_, idx) => idx + 1).map((i) => {
                        const on = i <= sequence;
                        const node = character.constellations?.find((c) => c.level === i);
                        return (
                            <Tooltip key={i} delayDuration={200}>
                                <TooltipTrigger asChild>
                                    <button onClick={() => setSequence(sequence === i ? i - 1 : i)} className="flex flex-col items-center gap-1">
                                        <IconSlot icon={Hexagon} active={on} />
                                        <span className="text-[10px] text-muted-foreground">{i}</span>
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs space-y-1">
                                    <p className="font-medium text-foreground">{seqLabel} {i}{node ? ` — ${node.name}` : ''}</p>
                                    <p className="text-muted-foreground whitespace-pre-line">{node?.description ?? 'Effect details for this level haven’t been added yet.'}</p>
                                </TooltipContent>
                            </Tooltip>
                        );
                    })}
                </div>
                <p className="text-[11px] text-muted-foreground">Click a node to set the {seqLabel.toLowerCase()} level; click the current one to lower it. Text is flavor/effect reference only — not applied to the damage calculation.</p>
            </section>

            <DialogFooter>
                <DialogClose asChild><Button>Done</Button></DialogClose>
            </DialogFooter>
        </div>
    );
}
