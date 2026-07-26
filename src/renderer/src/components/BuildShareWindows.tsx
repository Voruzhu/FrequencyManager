import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button, Badge } from './ui';
import { decodeBuildShareCode, payloadGearToEntries, type BuildSharePayload } from '@/lib/buildShare';
import { characterAutoBuffs } from '@/lib/selfBuffs';
import { formatGearStat, useGameData, formatCatalogValue, catalogStatLabel, type GearData } from '../data/gameData';
import { computeBuildStats } from '../data/optimizer';
import { useGameStore } from '../stores/gameStore';
import { useCalcStore } from '../stores/calcStore';
import { useOwnedInventory } from '../stores/inventoryStore';
import { ShareCodeWindow } from './ShareCodeWindow';

/** Shown after generating a code — copy it, paste it anywhere. */
export function ShareBuildWindow({ code }: { code: string }) {
    return <ShareCodeWindow code={code} description="Anyone can paste this into &quot;Import build code&quot; to view this build — it's read-only, nothing gets added to their inventory automatically." />;
}

function PreviewGearCard({ g }: { g: BuildSharePayload['gear'][number] }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <div className="rounded-md border border-border bg-surface text-xs">
            <button
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full flex-wrap items-center gap-1.5 p-2 text-left"
            >
                <span className="font-medium text-foreground">{g.name}</span>
                {g.name !== g.setName && <span className="text-muted-foreground">({g.setName})</span>}
                {g.cost != null ? <Badge variant="outline">Cost {g.cost}</Badge> : g.slot ? <Badge variant="outline">{g.slot}</Badge> : null}
                <Badge variant="outline">{g.rarity}★</Badge>
                <span className="ml-auto text-primary">{g.mainStat.label} {formatGearStat(g.mainStat)}</span>
                {expanded ? <ChevronUp className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />}
            </button>
            {expanded && (
                <div className="space-y-1 border-t border-border p-2 pt-1.5">
                    {g.subStats.map((s, si) => (
                        <div key={si} className="flex items-center justify-between text-muted-foreground"><span>{s.label}</span><span>{formatGearStat(s)}</span></div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Only shown when the viewer currently has the SAME character selected, in the
 * same game — comparing across different characters is meaningless. Both sides
 * use the same minimal baseline (gear + weapon + character's own unconditional
 * self-buffs only, no skill tree / constellation / party / custom buffs) so the
 * comparison is symmetric and honest about what it excludes -- it's a gear/weapon
 * comparison, not a claim about either side's real live damage numbers.
 */
function BuildComparison({ payload }: { payload: BuildSharePayload }) {
    const activeGameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(activeGameId);
    const calc = useCalcStore();
    const owned = useOwnedInventory(activeGameId);

    if (payload.gameId !== activeGameId || calc.characterId !== payload.characterId) return null;
    const character = data.characters.find((c) => c.id === calc.characterId);
    if (!character) return null;

    const myWeapon = data.weapons.find((w) => w.id === calc.equipped.weaponId);
    const myGear = calc.equipped.gearIds.map((id) => owned.gear.find((g) => g.id === id)).filter(Boolean) as GearData[];
    const myStats = computeBuildStats(character, myGear, characterAutoBuffs(character, myGear, myWeapon, data.statCatalog, {}, false), myWeapon, data.statCatalog);

    const theirWeapon = data.weapons.find((w) => w.id === payload.weaponId);
    const theirGear = payloadGearToEntries(payload, activeGameId === 'wuthering-waves' ? 'echo' : 'artifact');
    const theirStats = computeBuildStats(character, theirGear, characterAutoBuffs(character, theirGear, theirWeapon, data.statCatalog, {}, false), theirWeapon, data.statCatalog);

    return (
        <div className="space-y-1.5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vs. your current build (gear + weapon only, no skill tree/party/custom buffs)</div>
            <div className="space-y-1">
                {data.statCatalog.map((def) => {
                    const mine = myStats[def.key] ?? 0;
                    const theirs = theirStats[def.key] ?? 0;
                    const better = theirs > mine ? 'text-success' : theirs < mine ? 'text-destructive' : 'text-muted-foreground';
                    return (
                        <div key={def.key} className="flex items-center justify-between rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs">
                            <span className="text-foreground">{catalogStatLabel(def, character.element)}</span>
                            <span className="tabular-nums text-muted-foreground">{formatCatalogValue(def, mine)}</span>
                            <span className={`tabular-nums font-medium ${better}`}>{formatCatalogValue(def, theirs)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function BuildPreview({ payload }: { payload: BuildSharePayload }) {
    return (
        <div className="max-h-[70vh] space-y-3 overflow-y-auto scrollbar-thin pr-1">
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
                <div className="text-sm font-medium text-foreground">{payload.characterName}</div>
                {payload.weaponName && (
                    <div className="text-xs text-muted-foreground">{payload.weaponName}{payload.weaponRefine ? ` · R${payload.weaponRefine}` : ''}</div>
                )}
            </div>

            <BuildComparison payload={payload} />

            {payload.gear.length > 0 && (
                <div className="space-y-1.5">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gear — tap a piece for sub-stats</div>
                    {payload.gear.map((g, i) => <PreviewGearCard key={i} g={g} />)}
                </div>
            )}

            {payload.buffs.length > 0 && (
                <div className="space-y-1.5">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Active buffs</div>
                    {payload.buffs.map((b, i) => (
                        <div key={i} className="flex items-center justify-between rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs">
                            <span className="text-foreground">{b.name} <span className="text-muted-foreground">({b.source})</span></span>
                            <span className="tabular-nums text-muted-foreground">+{b.value} {b.stat}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

/** Paste box → decode → read-only preview. Never writes to the importer's inventory/calc state. */
export function ImportBuildWindow() {
    const [text, setText] = useState('');
    const [payload, setPayload] = useState<BuildSharePayload | null>(null);
    const [error, setError] = useState<string | null>(null);

    const view = () => {
        const result = decodeBuildShareCode(text);
        if (!result.ok) { setError(result.error); setPayload(null); return; }
        setError(null);
        setPayload(result.payload);
    };

    if (payload) return <BuildPreview payload={payload} />;

    return (
        <div className="space-y-3">
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste a build code here…"
                className="h-28 w-full rounded-md border border-input bg-surface p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground scrollbar-thin"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button onClick={view} disabled={!text.trim()}>View build</Button>
        </div>
    );
}
