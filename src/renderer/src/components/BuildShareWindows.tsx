import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button, Badge } from './ui';
import { decodeBuildShareCode, type BuildSharePayload } from '@/lib/buildShare';
import { formatGearStat } from '../data/gameData';
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

function BuildPreview({ payload }: { payload: BuildSharePayload }) {
    return (
        <div className="max-h-[70vh] space-y-3 overflow-y-auto scrollbar-thin pr-1">
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5">
                <div className="text-sm font-medium text-foreground">{payload.characterName}</div>
                {payload.weaponName && (
                    <div className="text-xs text-muted-foreground">{payload.weaponName}{payload.weaponRefine ? ` · R${payload.weaponRefine}` : ''}</div>
                )}
            </div>

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
