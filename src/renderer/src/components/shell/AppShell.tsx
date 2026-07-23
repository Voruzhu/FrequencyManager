import { useEffect } from 'react';
import { PanelRight } from 'lucide-react';
import { TooltipProvider, Toaster, toast, ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../ui';
import { FM_STORAGE_WRITE_FAILED_EVENT } from '../../lib/userStorage';
import { TopBar } from './TopBar';
import { NavRail } from './NavRail';
import { Workspace } from './Workspace';
import { InspectorPanel } from './InspectorPanel';
import { StatusBar } from './StatusBar';
import { WindowHost } from './WindowHost';
import { DevPanel } from '../DevPanel';
import { ErrorBoundary } from '../ErrorBoundary';
import { useModuleStore } from '../../stores/moduleStore';
import { useSelectionStore } from '../../stores/selectionStore';
import { useGameStore } from '../../stores/gameStore';
import { useGameDataStore } from '../../stores/gameDataStore';
import { useInventoryStore } from '../../stores/inventoryStore';

/**
 * Root layout: TopBar (row 1) / [NavRail | resizable(Workspace | Inspector)] (row 2)
 * / StatusBar (row 3). Owns the one-time module refresh and app-wide providers.
 */
export function AppShell() {
    const refreshModules = useModuleStore((s) => s.refreshModules);
    const syncGame = useGameStore((s) => s.syncFromBackend);
    const loadBundle = useGameDataStore((s) => s.loadBundle);
    const { open: inspectorOpen, setOpen: setInspectorOpen } = useSelectionStore();

    useEffect(() => {
        void refreshModules();

        // syncGame() replaces the fallback `games` list (2 built-ins) with the
        // REAL backend list — which also includes any community game module
        // the user dropped into the game-modules folder. Both the bundle
        // prefetch AND the inventory-seed step below need the COMPLETE list,
        // so both wait on this same promise instead of reading
        // `useGameStore.getState().games` before it resolves (which would
        // only ever see the 2 built-ins, silently skipping prefetch/seeding
        // for a community game the user just added).
        const gamesReady = syncGame();

        // Pull each game's data bundle from the backend (game-loader). Once
        // cached, getGameData() serves backend data; until then, the embedded
        // fallback (identical shape, built-ins only) renders so there's no flash.
        const bundlesReady = gamesReady.then(() =>
            Promise.all(useGameStore.getState().games.map((g) => loadBundle(g.id))),
        );

        // Seed each game's inventory with its starter character on first open.
        // Waits for the persisted inventory to hydrate (so returning users keep
        // their collection — ensureSeeded is a no-op when data exists) AND every
        // bundle to actually land: `ensureSeeded` reads `starterCharacterId` off
        // the bundle, so seeding before it arrives would silently fall back to
        // Wuthering Waves' starter for a game whose bundle isn't cached yet.
        const invPersist = useInventoryStore.persist;
        const seed = () => { for (const g of useGameStore.getState().games) useInventoryStore.getState().ensureSeeded(g.id); };
        const hydrated = invPersist.hasHydrated()
            ? Promise.resolve()
            : new Promise<void>((resolve) => { const unsub = invPersist.onFinishHydration(() => { unsub(); resolve(); }); });
        void Promise.all([bundlesReady, hydrated]).then(seed);
    }, [refreshModules, syncGame, loadBundle]);

    // A failed disk write (disk full, permission denied) used to be reported
    // to every persisted store as success, with nothing shown to the user —
    // see `userStorage.ts`'s `setItem`, which dispatches this event instead
    // of importing a toast component directly (kept dependency-free so
    // pure-logic store tests don't need a JSX-capable test environment).
    useEffect(() => {
        const onWriteFailed = () => toast.error('Failed to save', { description: 'Your changes may not have been written to disk — check available disk space.' });
        window.addEventListener(FM_STORAGE_WRITE_FAILED_EVENT, onWriteFailed);
        return () => window.removeEventListener(FM_STORAGE_WRITE_FAILED_EVENT, onWriteFailed);
    }, []);

    return (
        <TooltipProvider delayDuration={200}>
            <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
                <TopBar />
                <div className="flex min-h-0 flex-1">
                    <NavRail />
                    <div className="min-w-0 flex-1">
                        {inspectorOpen ? (
                            <ResizablePanelGroup direction="horizontal" autoSaveId="fm-main-layout">
                                <ResizablePanel defaultSize={72} minSize={45}>
                                    <ErrorBoundary label="This screen ran into a problem">
                                        <Workspace />
                                    </ErrorBoundary>
                                </ResizablePanel>
                                <ResizableHandle withHandle />
                                <ResizablePanel defaultSize={28} minSize={18} maxSize={44}>
                                    <ErrorBoundary label="The inspector ran into a problem">
                                        <InspectorPanel />
                                    </ErrorBoundary>
                                </ResizablePanel>
                            </ResizablePanelGroup>
                        ) : (
                            <div className="flex h-full">
                                <div className="min-w-0 flex-1">
                                    <ErrorBoundary label="This screen ran into a problem">
                                        <Workspace />
                                    </ErrorBoundary>
                                </div>
                                <button
                                    onClick={() => setInspectorOpen(true)}
                                    className="flex w-9 flex-shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
                                    aria-label="Open inspector"
                                    title="Open inspector"
                                >
                                    <PanelRight className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                <StatusBar />
            </div>
            <DevPanel />
            <WindowHost />
            <Toaster />
        </TooltipProvider>
    );
}
