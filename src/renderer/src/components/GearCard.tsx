import { ChevronDown, ChevronUp } from 'lucide-react';
import { ItemIcon, Badge } from './ui';
import { iconSrc } from '@/lib/icons';
import { formatGearStat, gearIcon, setIconFor, echoItemIconFor, useGameData, type GearData } from '../data/gameData';

/** Main stat + sub-stats, always visible — used inside an expanded GearCard. */
export function GearStatsList({ g }: { g: GearData }) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs">
                <span className="text-muted-foreground">Main stat</span>
                <span className="font-medium text-primary">{g.mainStat.label} {formatGearStat(g.mainStat)}</span>
            </div>
            {g.subStats.length === 0 ? (
                <p className="px-0.5 text-xs text-muted-foreground">No sub-stats.</p>
            ) : (
                g.subStats.map((s, i) => (
                    <div key={i} className="flex items-center justify-between rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs">
                        <span className="text-muted-foreground">{s.label}</span>
                        <span className="font-medium text-foreground">{formatGearStat(s)}</span>
                    </div>
                ))
            )}
        </div>
    );
}

/**
 * One echo/artifact row: icon, set/main-stat summary, an expand toggle that
 * reveals full stats (main + subs), and a caller-provided action slot (e.g.
 * Equip/Unequip in the gear picker, Remove in the Inventory screen).
 */
export function GearCard({
    g, gameId, expanded, onToggleExpand, onClick, actions, highlight, mainSlot,
}: {
    g: GearData;
    gameId: string;
    expanded: boolean;
    onToggleExpand: () => void;
    /** Optional — clicking the card body (not the chevron/actions) inspects the item. */
    onClick?: () => void;
    actions?: React.ReactNode;
    /** Highlight ring, e.g. "currently equipped". */
    highlight?: boolean;
    /** WW only — true when this is the character's equipped cost-4 "main slot" echo. */
    mainSlot?: boolean;
}) {
    const data = useGameData(gameId);
    return (
        <div className={`rounded-md border ${highlight ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
            <div className="flex items-center gap-2 p-2">
                <button
                    onClick={onClick}
                    disabled={!onClick}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:cursor-default"
                    title={onClick ? 'Inspect' : undefined}
                >
                    {/* When the echo's own specific-item art is known, show it as
                        the primary icon with the Set icon as a small corner badge
                        (matches the in-game convention) — otherwise there's only
                        the Set icon to show at all, same as before. */}
                    <ItemIcon kind={g.kind} size="md" rarity={g.rarity} src={iconSrc(gameId, gearIcon(data, g))} badgeSrc={echoItemIconFor(g) ? iconSrc(gameId, setIconFor(data, g)) : undefined} />
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{g.name}</div>
                        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                            {g.name !== g.setName && <span className="truncate">{g.setName}</span>}
                            <span className="truncate">{g.mainStat.label} {formatGearStat(g.mainStat)}</span>
                            {g.cost != null ? <Badge variant="outline">Cost {g.cost}</Badge> : g.slot ? <Badge variant="outline">{g.slot}</Badge> : null}
                            {mainSlot && <Badge variant="secondary">Main Slot</Badge>}
                            <Badge variant="outline">{g.rarity}★</Badge>
                        </div>
                    </div>
                </button>
                <button
                    onClick={onToggleExpand}
                    className="flex-shrink-0 rounded p-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                    aria-label={expanded ? 'Collapse stats' : 'Expand stats'}
                    title={expanded ? 'Hide stats' : 'Show stats'}
                >
                    {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {actions}
            </div>
            {expanded && (
                <div className="border-t border-border p-2">
                    <GearStatsList g={g} />
                </div>
            )}
        </div>
    );
}
