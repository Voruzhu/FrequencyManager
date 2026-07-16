import { useState, useEffect } from 'react';

interface UpdateEntry {
    gameId: string;
    gameName: string;
    localVersion: string;
    remoteVersion: string;
    updateAvailable: boolean;
    minAppVersion?: string;
    releaseNotes?: string;
    lastChecked: number;
}

interface UpdateStatus {
    lastCheck: number;
    entries: UpdateEntry[];
    checking: boolean;
    error: string | null;
}

export function UpdateCheckerPanel() {
    const [status, setStatus] = useState<UpdateStatus>({
        lastCheck: 0,
        entries: [],
        checking: false,
        error: null,
    });

    useEffect(() => {
        loadStatus();
    }, []);

    const loadStatus = async () => {
        const bridge = (window as unknown as { frequencyManager?: { getUpdateStatus?: () => Promise<UpdateStatus> } }).frequencyManager;
        if (bridge?.getUpdateStatus) {
            const data = await bridge.getUpdateStatus();
            setStatus(data);
        } else {
            // Mock data
            setStatus({
                lastCheck: Date.now() - 3600000,
                entries: [
                    { gameId: 'wuthering-waves', gameName: 'Wuthering Waves', localVersion: '1.0.0', remoteVersion: '1.1.0', updateAvailable: true, minAppVersion: '1.0.0', releaseNotes: 'New echo sets added', lastChecked: Date.now() - 3600000 },
                    { gameId: 'genshin-impact', gameName: 'Genshin Impact', localVersion: '4.5.0', remoteVersion: '4.5.0', updateAvailable: false, minAppVersion: '1.0.0', lastChecked: Date.now() - 3600000 },
                ],
                checking: false,
                error: null,
            });
        }
    };

    const checkNow = async () => {
        setStatus(s => ({ ...s, checking: true, error: null }));
        const bridge = (window as unknown as { frequencyManager?: { checkUpdates?: () => Promise<UpdateStatus> } }).frequencyManager;
        if (bridge?.checkUpdates) {
            const data = await bridge.checkUpdates();
            setStatus(data);
        } else {
            // Simulate check
            await new Promise(r => setTimeout(r, 1000));
            setStatus(s => ({ ...s, checking: false, lastCheck: Date.now() }));
        }
    };

    const formatTime = (ts: number) => {
        if (!ts) return 'Never';
        return new Date(ts).toLocaleString();
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-fg mb-1">Update Checker</h2>
                    <p className="text-muted text-sm">Check for module and game definition updates</p>
                </div>
                <button
                    onClick={checkNow}
                    disabled={status.checking}
                    className="px-4 py-2 bg-accent text-black text-black font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                    {status.checking ? 'Checking...' : 'Check Now'}
                </button>
            </div>

            <div className="bg-white/5 rounded-xl p-4 border border-white/10 flex items-center justify-between">
                <div className="text-sm text-muted">
                    Last checked: <span className="text-fg ml-2">{formatTime(status.lastCheck)}</span>
                </div>
                {status.error && (
                    <div className="text-sm text-error flex items-center gap-2">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                        {status.error}
                    </div>
                )}
            </div>

            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="text-left text-muted border-b border-white/10">
                            <th className="p-4">Game</th>
                            <th className="p-4">Local</th>
                            <th className="p-4">Remote</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Min App Version</th>
                            <th className="p-4">Last Checked</th>
                        </tr>
                    </thead>
                    <tbody>
                        {status.entries.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-muted">No games configured</td>
                            </tr>
                        ) : (
                            status.entries.map(entry => (
                                <tr key={entry.gameId} className="border-b border-white/5">
                                    <td className="p-4 font-medium text-fg">{entry.gameName}</td>
                                    <td className="p-4 text-muted font-mono">{entry.localVersion}</td>
                                    <td className="p-4 font-mono">{entry.remoteVersion}</td>
                                    <td className="p-4">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${entry.updateAvailable ? 'bg-accent/20 text-accent' : 'bg-green/20 text-green'
                                            }`}>
                                            {entry.updateAvailable ? 'Update Available' : 'Up to Date'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-muted font-mono">{entry.minAppVersion || 'N/A'}</td>
                                    <td className="p-4 text-muted text-sm">{formatTime(entry.lastChecked)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {status.entries.some(e => e.updateAvailable) && (
                <div className="bg-accent/10 border border-accent/30 rounded-xl p-4">
                    <h3 className="font-medium text-accent mb-2">Updates Available</h3>
                    <ul className="space-y-1">
                        {status.entries.filter(e => e.updateAvailable).map(entry => (
                            <li key={entry.gameId} className="text-sm text-fg">
                                <strong>{entry.gameName}</strong>: v{entry.localVersion} → v{entry.remoteVersion}
                                {entry.releaseNotes && <span className="text-muted ml-2">- {entry.releaseNotes}</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}