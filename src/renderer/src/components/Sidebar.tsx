import { useState } from 'react';

interface SidebarProps {
    modules: Array<{ id: string; name: string; enabled: boolean; hasUI?: boolean; tags?: string[] }>;
    activeModuleId: string | null;
    onSelectModule: (id: string | null) => void;
}

export function Sidebar({ modules, activeModuleId, onSelectModule }: SidebarProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

    // Filter modules by search query
    const filteredModules = modules.filter(module =>
        module.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        module.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        module.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    // Group modules by tag/category
    const groupedModules = filteredModules.reduce((acc, module) => {
        const group = module.tags?.[0] || 'Other';
        if (!acc[group]) acc[group] = [];
        acc[group].push(module);
        return acc;
    }, {} as Record<string, typeof filteredModules>);

    const toggleGroup = (groupName: string) => {
        setExpandedGroups(prev => ({
            ...prev,
            [groupName]: !prev[groupName],
        }));
    };

    // Default all groups to expanded if not set
    Object.keys(groupedModules).forEach(group => {
        if (expandedGroups[group] === undefined) {
            setExpandedGroups(prev => ({ ...prev, [group]: true }));
        }
    });

    return (
        <aside className="w-64 border-r border-white/10 bg-bg/30 backdrop-blur-xl flex flex-col">
            <div className="p-4 border-b border-white/10">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-xs font-bold text-muted uppercase tracking-widest">
                        Modules
                    </h2>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/5 text-muted/60 border border-white/10">
                        {filteredModules.length} / {modules.length}
                    </span>
                </div>
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-muted/40 group-focus-within:text-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        placeholder="Search modules..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-black/20 border border-white/10 rounded-xl text-sm text-fg placeholder-muted/40 focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/20 transition-all"
                        aria-label="Search modules"
                    />
                </div>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-6">
                {/* Quick Access Section */}
                <div>
                    <h3 className="px-2 mb-2 text-[10px] font-bold text-muted/50 uppercase tracking-widest">
                        Quick Access
                    </h3>
                    <div className="grid gap-1">
                        <button
                            onClick={() => onSelectModule(null)}
                            className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all flex items-center gap-3 ${activeModuleId === null
                                ? 'bg-accent/20 text-accent border border-accent/30'
                                : 'text-fg/70 hover:bg-white/5 hover:text-fg'
                                }`}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                            </svg>
                            <span className="font-medium">Dashboard</span>
                        </button>
                    </div>
                </div>

                {/* Grouped Modules */}
                <div>
                    {Object.keys(groupedModules).length === 0 ? (
                        <div className="text-center text-muted/60 text-xs py-8 px-4">
                            No modules found matching your search
                        </div>
                    ) : (
                        <ul className="space-y-4">
                            {Object.entries(groupedModules).map(([groupName, groupModules]) => {
                                const isExpanded = expandedGroups[groupName] !== false;
                                return (
                                    <li key={groupName} className="group/group">
                                        <button
                                            onClick={() => toggleGroup(groupName)}
                                            className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-bold text-muted/60 uppercase tracking-wider hover:text-muted transition-colors rounded-lg"
                                        >
                                            <span className="flex items-center gap-2">
                                                <span className="w-1 h-1 rounded-full bg-muted/40" />
                                                {groupName}
                                            </span>
                                            <svg
                                                className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                            </svg>
                                        </button>
                                        {isExpanded && (
                                            <ul className="space-y-1 mt-1 ml-1 border-l-2 border-white/5 pl-3">
                                                {groupModules.map(module => (
                                                    <li key={module.id}>
                                                        <button
                                                            onClick={() => onSelectModule(module.id)}
                                                            className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-all group/item ${activeModuleId === module.id
                                                                ? 'bg-accent/10 text-accent ring-1 ring-accent/30'
                                                                : 'text-fg/60 hover:bg-white/5 hover:text-fg'
                                                                }`}
                                                            disabled={!module.enabled}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <span className={`font-medium transition-colors ${activeModuleId === module.id ? 'text-accent' : 'group-hover/item:text-fg'}`}>
                                                                    {module.name}
                                                                </span>
                                                                {module.enabled ? (
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-ok shadow-[0_0_8px_rgba(74,222,128,0.4)]" />
                                                                ) : (
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-muted/30" />
                                                                )}
                                                            </div>
                                                            {!module.enabled && (
                                                                <div className="text-[10px] text-muted/40 mt-1 italic">Disabled</div>
                                                            )}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>
            </nav>
        </aside>
    );
}
