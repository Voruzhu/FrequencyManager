import * as React from 'react';
import { Activity } from 'lucide-react';
import {
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../ui';
import { WindowControls } from './WindowControls';
import { useGameStore } from '../../stores/gameStore';

const drag = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

/**
 * Frameless top bar: app mark + wordmark (draggable), active-game selector,
 * theme switcher, and window controls. Interactive controls opt out of the drag
 * region so they stay clickable.
 */
export function TopBar() {
    const { games, activeGameId, setActiveGame } = useGameStore();

    return (
        <header
            className="flex h-11 flex-shrink-0 items-center gap-3 border-b border-border bg-background pl-3"
            style={drag}
        >
            <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground">
                    <Activity className="h-4 w-4" />
                </div>
                <span className="text-sm font-semibold tracking-tight text-foreground">FrequencyManager</span>
            </div>

            <div className="ml-auto flex items-center gap-2" style={noDrag}>
                {/* Active game (theme lives in Settings → Appearance) */}
                <Select value={activeGameId} onValueChange={setActiveGame}>
                    <SelectTrigger className="h-8 w-48 bg-surface"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        {games.map((g) => (
                            <SelectItem key={g.id} value={g.id}>{g.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <WindowControls />
        </header>
    );
}
