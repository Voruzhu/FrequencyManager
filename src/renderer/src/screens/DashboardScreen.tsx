import { useEffect } from 'react';
import {
    LayoutDashboard, Calculator, ScanLine, Boxes, Activity, Package, Gamepad2,
} from 'lucide-react';
import {
    PageHeader, StatTile, Card, CardHeader, CardTitle, CardContent, Button, Badge, EmptyState,
} from '../components/ui';
import { useModuleStore } from '../stores/moduleStore';
import { useHealthStore } from '../stores/healthStore';
import { useGameStore } from '../stores/gameStore';
import { useUIStore } from '../stores/uiStore';
import { GamePackageInstaller } from '../components/GamePackageInstaller';
import { useAppVersion } from '../lib/useAppVersion';

type Tone = 'success' | 'warning' | 'destructive';

export function DashboardScreen() {
    const { modules, refreshModules, outputs } = useModuleStore();
    const healthChecks = useHealthStore((s) => s.healthChecks);
    const { games, activeGameId } = useGameStore();
    const setActiveScreen = useUIStore((s) => s.setActiveScreen);
    const activeGame = games.find((g) => g.id === activeGameId);
    const appVersion = useAppVersion();

    useEffect(() => {
        if (modules.length === 0) void refreshModules();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const enabled = modules.filter((m) => m.enabled).length;
    const unhealthy = healthChecks.filter((h) => h.status === 'unhealthy').length;
    const degraded = healthChecks.filter((h) => h.status === 'degraded').length;
    const healthLabel = unhealthy ? 'Degraded' : degraded ? 'Warnings' : 'Healthy';
    const healthTone: Tone = unhealthy ? 'destructive' : degraded ? 'warning' : 'success';

    const recent = Object.entries(outputs)
        .flatMap(([mod, chans]) => Object.values(chans).map((o) => ({ mod, channel: o.channel, ts: o.timestamp })))
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 6);

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <PageHeader title="Dashboard" description="Overview of your build workspace." />

            {games.length === 0 && (
                <Card>
                    <CardContent className="p-6">
                        <EmptyState
                            icon={Gamepad2}
                            title="No game installed yet"
                            description="Paste the game-packages repo below to download and install one."
                            action={<div className="w-full max-w-md text-left"><GamePackageInstaller /></div>}
                        />
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Active Game" value={activeGame?.label ?? '—'} hint={activeGame ? `v${activeGame.version}` : undefined} icon={Gamepad2} tone="primary" />
                <StatTile label="Modules" value={`${enabled}/${modules.length}`} hint="enabled" icon={Package} />
                <StatTile label="System" value={healthLabel} icon={Activity} tone={healthTone} />
                <StatTile label="Version" value={appVersion || '—'} hint="FrequencyManager" icon={LayoutDashboard} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader><CardTitle>Active Game</CardTitle></CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                                <Gamepad2 className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <div className="font-medium text-foreground">{activeGame?.label ?? 'None'}</div>
                                <div className="truncate text-xs text-muted-foreground">{activeGame?.description}</div>
                            </div>
                            {activeGame && <Badge variant="secondary" className="ml-auto flex-shrink-0">v{activeGame.version}</Badge>}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
                    <CardContent className="grid gap-2">
                        <Button variant="secondary" className="justify-start" onClick={() => setActiveScreen('calculator')}>
                            <Calculator /> Calculate damage
                        </Button>
                        <Button variant="secondary" className="justify-start" onClick={() => setActiveScreen('scanner')}>
                            <ScanLine /> Scan a screenshot
                        </Button>
                        <Button variant="secondary" className="justify-start" onClick={() => setActiveScreen('inventory')}>
                            <Boxes /> Open inventory
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
                <CardContent>
                    {recent.length === 0 ? (
                        <EmptyState icon={Activity} title="No activity yet" description="Run a calculation or scan to see recent results here." />
                    ) : (
                        <ul className="divide-y divide-border">
                            {recent.map((r, i) => (
                                <li key={i} className="flex items-center justify-between py-2 text-sm">
                                    <span className="text-foreground">{r.mod}</span>
                                    <span className="text-xs text-muted-foreground">
                                        {r.channel} · {new Date(r.ts).toLocaleTimeString()}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
