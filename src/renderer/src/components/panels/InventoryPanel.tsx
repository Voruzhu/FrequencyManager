import { useState } from 'react';
import { useGameUI } from '../../hooks/useGameUI';

/**
 * InventoryPanel — content slot for the "inventory" category.
 *
 * Renders game-driven sub-tabs (characters, weapons, echoes, artifacts)
 * based on the active game inventoryTabs definition from useGameUI.
 */
export function InventoryPanel() {
    const { inventoryTabs } = useGameUI();
    const [activeTab, setActiveTab] = useState<string>(inventoryTabs[0]?.id ?? 'characters');

    const tabs = inventoryTabs.length > 0 ? inventoryTabs : [
        { id: 'characters', label: 'Characters', slot: 'characters' as const },
        { id: 'weapons', label: 'Weapons', slot: 'weapons' as const },
        { id: 'echoes', label: 'Echoes', slot: 'echoes' as const },
    ];

    const activeItem = tabs.find(t => t.id === activeTab);

    return (
        <div className="flex-1 w-full h-full flex flex-col">
            {/* Sub-tab header */}
            <div className="flex items-center gap-1 p-2 border-b border-white/[0.08] bg-white/[0.02]">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 border
                            ${activeTab === tab.id
                                ? 'bg-accent/15 text-accent border-accent/30 shadow-[0_0_12px_rgba(59,130,246,0.15)]'
                                : 'text-muted/70 border-transparent hover:text-fg hover:bg-white/[0.04]'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 p-6 overflow-auto">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                        <span className="text-3xl">🎒</span>
                    </div>
                    <h3 className="text-lg font-semibold text-fg">Inventory — {activeItem?.label ?? 'Items'}</h3>
                    <p className="text-sm text-muted max-w-md mx-auto">
                        Manage your {activeItem?.label?.toLowerCase() ?? 'items'} here. This panel will show your game data once connected.
                    </p>
                </div>
            </div>
        </div>
    );
}
