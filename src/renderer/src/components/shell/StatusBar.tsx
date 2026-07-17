import { useModuleStore } from '../../stores/moduleStore';
import { useDevStore } from '../../stores/devStore';
import { useHealthStore } from '../../stores/healthStore';
import type { HealthStatus } from '../../types';
import { cn } from '@/lib/utils';
import { useAppVersion } from '../../lib/useAppVersion';

export function StatusBar() {
    const { modules } = useModuleStore();
    const { devMode } = useDevStore();
    const { healthChecks, lastUpdated } = useHealthStore();
    const appVersion = useAppVersion();

    const enabledCount = modules.filter((m) => m.enabled).length;
    const totalCount = modules.length;

    const unhealthy = healthChecks.filter((h: HealthStatus) => h.status === 'unhealthy').length;
    const degraded = healthChecks.filter((h: HealthStatus) => h.status === 'degraded').length;

    let dot = 'bg-success';
    let label = 'All systems operational';
    if (unhealthy > 0) {
        dot = 'bg-destructive';
        label = `${unhealthy} module${unhealthy > 1 ? 's' : ''} unhealthy`;
    } else if (degraded > 0) {
        dot = 'bg-warning';
        label = `${degraded} module${degraded > 1 ? 's' : ''} degraded`;
    } else if (healthChecks.length === 0) {
        label = 'No health data';
    }

    return (
        <footer className="flex h-7 flex-shrink-0 items-center justify-between border-t border-border bg-background px-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
                <span>Modules: <strong className="text-foreground">{enabledCount}</strong>/{totalCount} enabled</span>
                <span className="h-3 w-px bg-border" />
                <span>v{appVersion || '—'}</span>
                {lastUpdated > 0 && (
                    <>
                        <span className="h-3 w-px bg-border" />
                        <span className="opacity-70">Updated {formatTimeAgo(lastUpdated)}</span>
                    </>
                )}
            </div>
            <div className="flex items-center gap-3">
                {devMode && (
                    <span className="rounded bg-primary/15 px-2 py-0.5 font-medium text-primary">DEV MODE</span>
                )}
                <span className="flex items-center gap-1.5">
                    <span className={cn('h-2 w-2 rounded-full', dot)} />
                    <span className="text-foreground/80">{label}</span>
                </span>
            </div>
        </footer>
    );
}

function formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}
