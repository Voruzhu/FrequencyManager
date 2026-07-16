import { Gamepad2 } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useGameStore } from '../../stores/gameStore';
import { SCREENS } from '../../screens/registry';
import { EmptyState } from '../ui';
import { GamePackageInstaller } from '../GamePackageInstaller';
import { cn } from '@/lib/utils';

/**
 * Shown instead of a game-scoped screen (Calculator/Scanner/Inventory/Rotation)
 * when `games` (the REAL backend-synced list, see `gameStore.syncFromBackend`)
 * is genuinely empty — a fresh install before any game module has been added,
 * or every previously-installed one was removed. Dashboard and Settings stay
 * reachable either way; only the screens that need real game data are gated.
 */
function NoGamesInstalled() {
    return (
        <div className="flex h-full items-center justify-center p-6">
            <EmptyState
                icon={Gamepad2}
                title="No game installed yet"
                description="Paste the game-packages repo below to download and install one."
                action={<div className="w-full max-w-md text-left"><GamePackageInstaller /></div>}
            />
        </div>
    );
}

/**
 * Renders the active screen. All screens stay MOUNTED (inactive ones hidden) so
 * that switching categories preserves each screen's state — the previous
 * behaviour remounted the active screen and wiped its inputs.
 */
export function Workspace() {
    const activeScreen = useUIStore((s) => s.activeScreen);
    const noGamesInstalled = useGameStore((s) => s.games.length === 0);

    return (
        <main className="h-full w-full overflow-y-auto scrollbar-thin bg-background">
            {SCREENS.map((s) => {
                const Screen = s.component;
                const active = s.id === activeScreen;
                const gateThisScreen = !!s.category && noGamesInstalled;
                return (
                    <div key={s.id} className={cn(active ? 'animate-fade-in' : 'hidden')}>
                        {gateThisScreen ? <NoGamesInstalled /> : <Screen />}
                    </div>
                );
            })}
        </main>
    );
}
