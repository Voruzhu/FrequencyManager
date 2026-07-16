import { useState, useEffect } from 'react';
import { useModuleStore } from '../../stores/moduleStore';

interface GameInfo {
    id: string;
    displayName: string;
    version: string;
    description?: string;
}

export function GameLoaderPanel() {
    const [games, setGames] = useState<GameInfo[]>([]);
    const [activeGame, setActiveGame] = useState<string>('');
    const [fallbackGame, setFallbackGame] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadGames();
    }, []);

    const loadGames = async () => {
        const bridge = (window as unknown as { frequencyManager?: { getGames?: () => Promise<GameInfo[]>; getActiveGame?: () => Promise<string>; getFallbackGame?: () => Promise<string> } }).frequencyManager;
        if (bridge?.getGames) {
            const gameList = await bridge.getGames();
            setGames(gameList);
            if (bridge.getActiveGame) {
                const active = await bridge.getActiveGame();
                setActiveGame(active);
            }
            if (bridge.getFallbackGame) {
                const fallback = await bridge.getFallbackGame();
                setFallbackGame(fallback);
            }
        } else {
            // Mock data for development
            setGames([
                { id: 'wuthering-waves', displayName: 'Wuthering Waves', version: '1.0.0', description: 'Post-apocalyptic action-RPG' },
                { id: 'genshin-impact', displayName: 'Genshin Impact', version: '4.5.0', description: 'Open-world action-RPG' },
            ]);
            setActiveGame('wuthering-waves');
            setFallbackGame('wuthering-waves');
        }
        setLoading(false);
    };

    const handleActiveGameChange = async (gameId: string) => {
        const bridge = (window as unknown as { frequencyManager?: { setActiveGame?: (id: string) => Promise<void> } }).frequencyManager;
        if (bridge?.setActiveGame) {
            await bridge.setActiveGame(gameId);
            setActiveGame(gameId);
        }
    };

    const handleFallbackGameChange = async (gameId: string) => {
        const bridge = (window as unknown as { frequencyManager?: { setFallbackGame?: (id: string) => Promise<void> } }).frequencyManager;
        if (bridge?.setFallbackGame) {
            await bridge.setFallbackGame(gameId);
            setFallbackGame(gameId);
        }
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            <div>
                <h2 className="text-xl font-semibold text-fg mb-1">Game Loader</h2>
                <p className="text-muted text-sm">Select the active game and fallback game</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Active Game Selector */}
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                    <h3 className="font-medium text-fg mb-4">Active Game</h3>
                    <select
                        value={activeGame}
                        onChange={(e) => handleActiveGameChange(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                        {games.map(game => (
                            <option key={game.id} value={game.id}>
                                {game.displayName} (v{game.version})
                            </option>
                        ))}
                    </select>
                    <p className="text-sm text-muted mt-2">
                        Currently active: <strong className="text-fg">{games.find(g => g.id === activeGame)?.displayName || 'Unknown'}</strong>
                    </p>
                </div>

                {/* Fallback Game Selector */}
                <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                    <h3 className="font-medium text-fg mb-4">Fallback Game</h3>
                    <select
                        value={fallbackGame}
                        onChange={(e) => handleFallbackGameChange(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                        {games.map(game => (
                            <option key={game.id} value={game.id}>
                                {game.displayName} (v{game.version})
                            </option>
                        ))}
                    </select>
                    <p className="text-sm text-muted mt-2">
                        Fallback: <strong className="text-fg">{games.find(g => g.id === fallbackGame)?.displayName || 'Unknown'}</strong>
                    </p>
                </div>
            </div>

            {/* Game Details */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10">
                <h3 className="font-medium text-fg mb-4">Installed Games</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-muted border-b border-white/10">
                                <th className="pb-2 pr-4">Game</th>
                                <th className="pb-2 pr-4">Version</th>
                                <th className="pb-2 pr-4">Status</th>
                                <th className="pb-2">Description</th>
                            </tr>
                        </thead>
                        <tbody>
                            {games.map(game => (
                                <tr key={game.id} className="border-b border-white/5">
                                    <td className="py-3 pr-4 font-medium text-fg">{game.displayName}</td>
                                    <td className="py-3 pr-4 text-muted">{game.version}</td>
                                    <td className="py-3 pr-4">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${game.id === activeGame ? 'bg-accent/20 text-accent' :
                                                game.id === fallbackGame ? 'bg-muted/20 text-muted' :
                                                    'bg-green/20 text-green'
                                            }`}>
                                            {game.id === activeGame ? 'Active' : game.id === fallbackGame ? 'Fallback' : 'Available'}
                                        </span>
                                    </td>
                                    <td className="py-3 text-muted">{game.description}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}