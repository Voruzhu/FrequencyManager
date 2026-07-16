import { Tooltip, TooltipTrigger, TooltipContent } from '../ui';
import { cn } from '@/lib/utils';
import { SCREENS, type ScreenDef } from '../../screens/registry';
import { useUIStore } from '../../stores/uiStore';
import { useGameUI } from '../../hooks/useGameUI';

function RailButton({ screen, active, onClick }: { screen: ScreenDef; active: boolean; onClick: () => void }) {
    const Icon = screen.icon;
    return (
        <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
                <button
                    onClick={onClick}
                    aria-label={screen.label}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                        'relative flex h-11 w-11 items-center justify-center rounded-md transition-colors',
                        active
                            ? 'bg-primary/15 text-primary'
                            : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                    )}
                >
                    {active && <span className="absolute left-0 h-5 w-0.5 rounded-r bg-primary" />}
                    <Icon className="h-5 w-5" />
                </button>
            </TooltipTrigger>
            <TooltipContent side="right">{screen.label}</TooltipContent>
        </Tooltip>
    );
}

/**
 * Slim icon rail. Dashboard is always shown; game-driven category screens are
 * filtered by the active game's categories (from useGameUI); Settings sits at
 * the bottom. Active screen is owned by uiStore (single source of truth).
 */
export function NavRail() {
    const { activeScreen, setActiveScreen } = useUIStore();
    const { categories } = useGameUI();
    const categoryIds = new Set(categories.map((c) => c.id));

    const primary = SCREENS.filter(
        (s) => s.section === 'primary' && (!s.category || categoryIds.has(s.category))
    );
    const system = SCREENS.filter((s) => s.section === 'system');

    return (
        <nav className="flex w-14 flex-shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-2">
            {primary.map((s) => (
                <RailButton key={s.id} screen={s} active={activeScreen === s.id} onClick={() => setActiveScreen(s.id)} />
            ))}
            <div className="flex-1" />
            {system.map((s) => (
                <RailButton key={s.id} screen={s} active={activeScreen === s.id} onClick={() => setActiveScreen(s.id)} />
            ))}
        </nav>
    );
}
