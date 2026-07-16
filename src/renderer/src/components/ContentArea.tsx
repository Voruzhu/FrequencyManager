import { useMemo } from 'react';
import { useGameUI } from '../hooks/useGameUI';
import { ModulePanelWrapper } from './modules/ModulePanelWrapper';
import { useModuleStore } from '../stores/moduleStore';

/* ─── Panels imported for direct slots ─────────────────────────────────── */
import { DamageCalculatorPanel } from './panels/DamageCalculatorPanel';
import { InventoryPanel } from './panels/InventoryPanel';

/** Simple guard that makes the given component accept the shared props. */
type PanelComponent = React.ComponentType;

/** Maps each dynamic category to its default content panel. */
const CATEGORY_PANELS: Record<string, PanelComponent> = {
    calculator: DamageCalculatorPanel,
    inventory: InventoryPanel,
};

/* ─── Content Area ─────────────────────────────────────────────────────── */

interface ContentAreaProps {
    activeModuleId?: string | null;
}

/**
 * ContentArea is the heart of the triple-column layout.
 *
 * It receives the active category from `useGameUI` and renders the correct
 * panel for that category:
 *   • calculator  → DamageCalculatorPanel
 *   • inventory   → InventoryPanel (with game-driven sub-tabs)
 *
 * If a module is explicitly selected (via legacy module sidebar) the
 * generic `ModulePanelWrapper` is used instead, preserving backward
 * compatibility.
 */
export function ContentArea({ activeModuleId }: ContentAreaProps) {
    const { activeCategory, loading } = useGameUI();
    const { modules } = useModuleStore();

    /* ── Derive the active panel ─────────────────────────────────────── */
    const Panel = useMemo(() => {
        return CATEGORY_PANELS[activeCategory] ?? null;
    }, [activeCategory]);

    /* ── Loading state ──────────────────────────────────────────────── */
    if (loading) {
        return (
            <main className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-12 h-12 mx-auto rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
                    <p className="text-sm text-muted">Loading game data…</p>
                </div>
            </main>
        );
    }

    /* ── Legacy: explicit module selection takes priority ────────────── */
    if (activeModuleId) {
        const module = modules.find((m) => m.id === activeModuleId);
        if (module) {
            return (
                <main className="flex-1 flex flex-col overflow-hidden">
                    <ModulePanelWrapper module={module} />
                </main>
            );
        }
    }

    /* ── Category-based content slots ───────────────────────────────── */
    if (Panel) {
        return (
            <main className="flex-1 flex flex-col overflow-hidden">
                <Panel />
            </main>
        );
    }

    /* ── Fallback / empty state ─────────────────────────────────────── */
    return (
        <main className="flex-1 flex items-center justify-center p-8">
            <div className="text-center space-y-4">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                    <span className="text-4xl opacity-30">🔧</span>
                </div>
                <h3 className="text-xl font-semibold text-fg">Not yet implemented</h3>
                <p className="text-sm text-muted max-w-xs mx-auto">
                    The <span className="text-accent font-medium">{activeCategory}</span> panel is under construction.
                </p>
            </div>
        </main>
    );
}

/* Re-export inventoryTabs shape so App.tsx can pass it down if needed */
export type { ContentAreaProps };
