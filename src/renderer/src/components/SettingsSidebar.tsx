import { useState, useEffect, useRef } from 'react';
import { useThemeStore } from '../stores/themeStore';
import { useDevStore } from '../stores/devStore';
import { useModuleStore } from '../stores/moduleStore';

/**
 * Right-side settings sidebar.
 * Now persists as a layout element instead of an overlay.
 * Includes a resizable handle and settings for themes, dev mode, and modules.
 */
export function SettingsSidebar() {
    const { theme, setTheme, presets } = useThemeStore();
    const { devMode, toggleDevMode } = useDevStore();
    const { modules, enableModule, disableModule } = useModuleStore();

    const [width, setWidth] = useState(localStorage.getItem('fm-sidebar-width')
        ? parseInt(localStorage.getItem('fm-sidebar-width')!)
        : 384);

    const isResizing = useRef(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth >= 300 && newWidth <= 600) {
                setWidth(newWidth);
                localStorage.setItem('fm-sidebar-width', newWidth.toString());
            }
        };

        const handleMouseUp = () => {
            isResizing.current = false;
            document.body.style.cursor = 'default';
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    return (
        <aside
            className="h-full bg-bg border-l border-white/10 flex flex-col relative transition-all duration-300 ease-in-out"
            style={{ width: `${width}px` }}
        >
            {/* Resize Handle */}
            <div
                className="absolute left-0 top-0 w-1 h-full cursor-col-resize hover:bg-accent/50 transition-colors z-10"
                onMouseDown={() => {
                    isResizing.current = true;
                    document.body.style.cursor = 'col-resize';
                }}
            />

            {/* Header */}
            <header className="p-4 border-b border-white/10 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-fg">Settings</h2>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Appearance Section */}
                <section className="space-y-3 animate-slide-in">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Appearance</h3>
                    <label className="block">
                        <span className="block text-sm font-medium text-fg mb-1.5">Theme</span>
                        <select
                            value={theme}
                            onChange={(e) => setTheme(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent transition-all"
                        >
                            {presets.map(p => (
                                <option key={p.name} value={p.name}>{p.label}</option>
                            ))}
                        </select>
                    </label>
                </section>

                {/* Developer Section */}
                <section className="space-y-3 animate-slide-in" style={{ animationDelay: '100ms' }}>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Developer</h3>
                    <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm font-medium text-fg">Developer Mode</span>
                        <button
                            role="switch"
                            aria-checked={devMode}
                            onClick={toggleDevMode}
                            className={`relative inline-block w-10 h-6 rounded-full transition-colors ${devMode ? 'bg-accent' : 'bg-muted/30'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${devMode ? 'translate-x-4' : ''}`} />
                        </button>
                    </label>
                    <p className="text-xs text-muted">Shows dev panel, extra logging, and hidden features.</p>
                </section>

                {/* Modules Section */}
                <section className="space-y-3 animate-slide-in" style={{ animationDelay: '200ms' }}>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Modules</h3>
                    <div className="space-y-2">
                        {modules.map(module => (
                            <label key={module.id} className="flex items-center justify-between cursor-pointer p-2 rounded-lg hover:bg-white/5 transition-colors">
                                <div className="flex items-center gap-2">
                                    <ModuleIcon icon={module.icon} className="w-5 h-5 text-muted" />
                                    <span className="text-sm text-fg">{module.name}</span>
                                </div>
                                <button
                                    role="switch"
                                    aria-checked={module.enabled}
                                    onClick={() => module.enabled ? disableModule(module.id) : enableModule(module.id)}
                                    className={`relative inline-block w-10 h-6 rounded-full transition-colors ${module.enabled ? 'bg-accent' : 'bg-muted/30'}`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${module.enabled ? 'translate-x-4' : ''}`} />
                                </button>
                            </label>
                        ))}
                    </div>
                </section>

                {/* Updates Section */}
                <section className="space-y-3 animate-slide-in" style={{ animationDelay: '300ms' }}>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Updates</h3>
                    <div className="space-y-2">
                        <label className="flex items-center justify-between cursor-pointer">
                            <span className="text-sm font-medium text-fg">Auto-check on startup</span>
                            <button
                                role="switch"
                                aria-checked={true}
                                className="relative inline-block w-10 h-6 rounded-full bg-accent"
                            >
                                <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow translate-x-4" />
                            </button>
                        </label>
                        <button className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-fg hover:bg-white/10 transition-colors text-left">
                            Check for updates now
                        </button>
                    </div>
                </section>

                {/* About Section */}
                <section className="space-y-3 animate-slide-in" style={{ animationDelay: '400ms' }}>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">About</h3>
                    <div className="space-y-1 text-sm text-muted bg-white/5 p-3 rounded-lg border border-white/10">
                        <p className="font-medium text-fg">FrequencyManager v1.0.0</p>
                        <p>Modular plugin architecture for game data management</p>
                        <p className="pt-2 opacity-60">Built with Electron + React + TypeScript</p>
                    </div>
                </section>
            </div>
        </aside>
    );
}

function ModuleIcon({ icon, className }: { icon?: string; className?: string }) {
    const common = 'w-full h-full';
    switch (icon) {
        case 'calculator':
            return (
                <svg className={`${className} ${common}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="4" y="3" width="16" height="18" rx="2" />
                    <path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0M8 19h2M12 19h6" strokeLinecap="round" />
                </svg>
            );
        case 'scan':
            return (
                <svg className={`${className} ${common}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" strokeLinecap="round" />
                    <rect x="7" y="7" width="10" height="10" rx="1" />
                </svg>
            );
        case 'file':
            return (
                <svg className={`${className} ${common}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
                    <path d="M14 2v6h6M8 13h8M8 17h6" strokeLinecap="round" />
                </svg>
            );
        case 'refresh':
            return (
                <svg className={`${className} ${common}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            );
        case 'gamepad':
            return (
                <svg className={`${className} ${common}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M6 8h12a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4 3 3 0 0 1-2.5-1.5L13.5 16h-3l-2 1.5A3 3 0 0 1 6 19a4 4 0 0 1-4-4v-3a4 4 0 0 1 4-4z" strokeLinejoin="round" />
                    <path d="M8 11v2M7 12h2M15 12h.01M17 11h.01M17 13h.01" strokeLinecap="round" />
                </svg>
            );
        default:
            return (
                <svg className={`${className} ${common}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <path d="M9 9h6v6H9z" strokeLinejoin="round" />
                </svg>
            );
    }
}