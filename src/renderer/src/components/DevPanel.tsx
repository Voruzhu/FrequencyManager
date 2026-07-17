import { useState } from 'react';
import { useDevStore } from '../stores/devStore';
import { useModuleStore } from '../stores/moduleStore';

export function DevPanel() {
    const { devMode, events, rpcLog, clearEvents, clearRpcLog } = useDevStore();
    const { modules, refreshModules } = useModuleStore();
    const [activeTab, setActiveTab] = useState<'events' | 'rpc' | 'modules' | 'console'>('events');
    const [consoleInput, setConsoleInput] = useState('');

    if (!devMode) return null;

    const handleConsoleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!consoleInput.trim()) return;
        // In a real app, this would send an RPC command
        // eslint-disable-next-line no-console -- intentional dev-console echo, gated by devMode
        console.log('[Dev Console]', consoleInput);
        setConsoleInput('');
    };

    return (
        <div className="fixed bottom-8 right-4 left-4 md:left-auto md:right-4 md:bottom-16 md:top-48 w-full md:w-96 h-96 md:h-auto max-h-[calc(100vh-120px)] bg-bg border border-accent/30 rounded-xl shadow-2xl overflow-hidden flex flex-col z-50">
            {/* Tab Bar */}
            <div className="flex border-b border-border bg-surface">
                {(['events', 'rpc', 'modules', 'console'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${activeTab === tab
                            ? 'bg-accent/20 text-accent border-b-2 border-accent'
                            : 'text-muted hover:text-fg'
                            }`}
                    >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-auto p-4 space-y-4">
                {activeTab === 'events' && (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-medium text-fg">Event Bus Log</h3>
                            <button onClick={clearEvents} className="text-xs text-muted hover:text-fg">Clear</button>
                        </div>
                        <div className="bg-surface-2 rounded-lg p-3 max-h-96 overflow-y-auto font-mono text-xs">
                            {events.length === 0 ? (
                                <div className="text-muted text-center py-8">No events captured</div>
                            ) : (
                                <ul className="space-y-1">
                                    {events.slice().reverse().map((event, idx) => (
                                        <li key={idx} className="border-b border-border py-1 px-2 hover:bg-surface">
                                            <div className="flex gap-2">
                                                <span className="text-muted">[{new Date(event.timestamp).toLocaleTimeString()}]</span>
                                                <span className="text-accent">{event.source}</span>
                                                <span className="text-fg">{event.type}</span>
                                            </div>
                                            <pre className="text-muted/70 mt-1 whitespace-pre-wrap">{JSON.stringify(event.payload, null, 2)}</pre>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'rpc' && (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-medium text-fg">RPC Log</h3>
                            <button onClick={clearRpcLog} className="text-xs text-muted hover:text-fg">Clear</button>
                        </div>
                        <div className="bg-surface-2 rounded-lg p-3 max-h-96 overflow-y-auto font-mono text-xs">
                            {rpcLog.length === 0 ? (
                                <div className="text-muted text-center py-8">No RPC calls</div>
                            ) : (
                                <ul className="space-y-1">
                                    {rpcLog.slice().reverse().map((entry, idx) => (
                                        <li key={idx} className="border-b border-border py-1 px-2 hover:bg-surface">
                                            {('method' in entry) ? (
                                                <>
                                                    <div className="flex gap-2">
                                                        <span className="text-muted">[{new Date().toLocaleTimeString()}]</span>
                                                        <span className="text-ok">→ Request</span>
                                                        <span className="text-fg">{entry.method}</span>
                                                        <span className="text-muted">#{entry.id}</span>
                                                    </div>
                                                    <pre className="text-muted/70 mt-1 whitespace-pre-wrap">{JSON.stringify(entry.params, null, 2)}</pre>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="flex gap-2">
                                                        <span className="text-muted">[{new Date().toLocaleTimeString()}]</span>
                                                        <span className={entry.error ? 'text-error' : 'text-ok'}>
                                                            {entry.error ? '← Error' : '← Response'}
                                                        </span>
                                                        <span className="text-muted">#{entry.id}</span>
                                                    </div>
                                                    <pre className="text-muted/70 mt-1 whitespace-pre-wrap">
                                                        {entry.error ? JSON.stringify(entry.error, null, 2) : JSON.stringify(entry.result, null, 2)}
                                                    </pre>
                                                </>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'modules' && (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-medium text-fg">Module Registry</h3>
                            <button onClick={() => { void refreshModules(); }} className="text-xs text-muted hover:text-fg">Refresh</button>
                        </div>
                        <div className="bg-surface-2 rounded-lg p-3 max-h-96 overflow-y-auto font-mono text-xs">
                            {modules.length === 0 ? (
                                <div className="text-muted text-center py-8">No modules loaded</div>
                            ) : (
                                <ul className="space-y-2">
                                    {modules.map(module => (
                                        <li key={module.id} className="border-b border-border py-2 px-2 hover:bg-surface">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <span className="font-medium text-fg">{module.name}</span>
                                                    <span className="text-muted ml-2">v{module.version}</span>
                                                    <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${module.enabled ? 'bg-ok/20 text-ok' : 'bg-error/20 text-error'
                                                        }`}>
                                                        {module.enabled ? 'enabled' : 'disabled'}
                                                    </span>
                                                </div>
                                                <span className="text-muted">id: {module.id}</span>
                                            </div>
                                            {module.description && (
                                                <div className="text-muted text-xs mt-1 ml-6">{module.description}</div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'console' && (
                    <div className="flex flex-col h-full">
                        <div className="bg-surface-2 rounded-lg p-3 flex-1 overflow-y-auto font-mono text-xs mb-4 min-h-[200px]">
                            <div className="text-muted mb-2">{'>'} Dev console ready. Type commands below.</div>
                            <div className="text-muted">{'>'} Available: help, modules, events, rpc, theme, config</div>
                        </div>
                        <form onSubmit={handleConsoleSubmit} className="flex gap-2">
                            <input
                                type="text"
                                value={consoleInput}
                                onChange={e => setConsoleInput(e.target.value)}
                                placeholder="Enter command..."
                                className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-fg focus:outline-none focus:ring-2 focus:ring-accent font-mono text-sm"
                            />
                            <button type="submit" className="px-4 py-2 bg-accent text-black font-medium rounded-lg hover:opacity-90">Run</button>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
}