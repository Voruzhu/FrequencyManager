/**
 * @fileoverview Game UI hook - derives dynamic UI from active game definition
 * @module hooks/useGameUI
 *
 * Reads the active game definition from kernel config (via IPC) and computes
 * the category list and inventory tabs. Updates reactively when the game changes.
 */

import { useEffect, useState, useCallback } from 'react';

/** Default categories shown for all games unless hidden. */
const DEFAULT_CATEGORIES = [
    { id: 'calculator', label: 'Calculator' },
    { id: 'scanner', label: 'Scanner' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'rotation', label: 'Rotation' },
] as const;

/** Default inventory tabs per game (fallback if not specified). */
const DEFAULT_INVENTORY_TABS = {
    'wuthering-waves': [
        { id: 'characters', label: 'Characters', slot: 'characters' as const },
        { id: 'weapons', label: 'Weapons', slot: 'weapons' as const },
        { id: 'echoes', label: 'Echoes', slot: 'echoes' as const },
    ],
    'genshin-impact': [
        { id: 'characters', label: 'Characters', slot: 'characters' as const },
        { id: 'weapons', label: 'Weapons', slot: 'weapons' as const },
        { id: 'artifacts', label: 'Artifacts', slot: 'artifacts' as const },
    ],
};

interface CategoryUI {
    id: string;
    label: string;
    icon?: string;
}

interface InventoryTabUI {
    id: string;
    label: string;
    slot?: 'characters' | 'weapons' | 'echoes' | 'artifacts';
}

interface GameOptions {
    characters: Array<{ value: string; label: string }>;
    setNames: string[];
    weaponTypes: string[];
    elements: string[];
    categories?: CategoryUI[];
    hiddenCategories?: string[];
    inventoryTabs?: InventoryTabUI[];
}

interface UseGameUIResult {
    categories: CategoryUI[];
    inventoryTabs: InventoryTabUI[];
    activeCategory: string;
    setActiveCategory: (id: string) => void;
    gameOptions: GameOptions | null;
    loading: boolean;
}

declare global {
    interface Window {
        frequencyManager: {
            getGameOptions: () => Promise<GameOptions | null>;
            on: (event: string, handler: (payload: unknown) => void) => () => void;
        };
    }
}

/**
 * Hook to derive dynamic UI from the active game definition.
 * Subscribes to game changes and updates categories/inventoryTabs immediately.
 */
export function useGameUI(): UseGameUIResult {
    const [gameOptions, setGameOptions] = useState<GameOptions | null>(null);
    const [activeCategory, setActiveCategory] = useState<string>('calculator');
    const [loading, setLoading] = useState(true);

    // Compute final categories from defaults + game overrides - hidden
    const categories = gameOptions
        ? (() => {
            const extras = gameOptions.categories ?? [];
            const hidden = new Set(gameOptions.hiddenCategories ?? []);
            // Start with defaults, filter hidden
            const base = DEFAULT_CATEGORIES.filter(c => !hidden.has(c.id));
            // Add any game-defined extras (append or override by id)
            const extraMap = new Map(extras.map(e => [e.id, e]));
            const merged = base.map(c => extraMap.get(c.id) ?? c);
            // Append new categories not in defaults
            const newCats = extras.filter(e => !DEFAULT_CATEGORIES.some(d => d.id === e.id));
            return [...merged, ...newCats];
        })()
        : [...DEFAULT_CATEGORIES];

    // Compute inventory tabs
    const inventoryTabs = gameOptions
        ? (gameOptions.inventoryTabs ?? DEFAULT_INVENTORY_TABS[gameOptions.setNames[0]?.includes('Rift') ? 'wuthering-waves' : 'genshin-impact' as keyof typeof DEFAULT_INVENTORY_TABS] ?? [])
        : [];

    // Fetch game options. WHY stable deps ([]): `categories` is recomputed as a
    // new array on every render, so depending on it here would give fetchOptions
    // a new identity each render, re-run the effect below, and re-fetch forever.
    const fetchOptions = useCallback(async () => {
        try {
            // Guard the bridge: when the preload script isn't available (e.g.
            // browser/Docker preview, or a preload load failure) this must not
            // throw, or the whole UI unmounts and the window goes blank.
            const opts = (await window.frequencyManager?.getGameOptions?.()) ?? null;
            setGameOptions(opts);
        } catch {
            setGameOptions(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchOptions();

        // Subscribe to game reload events. Optional-chain the bridge so a
        // missing preload can never throw here and blank the window.
        const unsubscribe = window.frequencyManager?.on?.('game:reload-request', () => {
            fetchOptions();
        });

        return () => { unsubscribe?.(); };
    }, [fetchOptions]);

    // If the active category no longer exists after a game change, reset to the
    // first available one. Keyed on gameOptions only so it doesn't re-loop.
    useEffect(() => {
        if (!categories.some(c => c.id === activeCategory)) {
            setActiveCategory(categories[0]?.id ?? 'calculator');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameOptions]);

    return {
        categories,
        inventoryTabs,
        activeCategory,
        setActiveCategory,
        gameOptions,
        loading,
    };
}