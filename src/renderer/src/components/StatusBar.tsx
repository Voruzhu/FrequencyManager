import { useModuleStore } from '../stores/moduleStore';
import { useDevStore } from '../stores/devStore';
import { useHealthStore } from '../stores/healthStore';
import type { HealthStatus } from '../types';

export function StatusBar() {
    const { modules } = useModuleStore();
    const { devMode } = useDevStore();
    const { healthChecks, lastUpdated } = useHealthStore();

    const enabledCount = modules.filter(m => m.enabled).length;
    const totalCount = modules.length;

    // Calculate overall health
    const unhealthyCount = healthChecks.filter((h: HealthStatus) => h.status === 'unhealthy').length;
    const degradedCount = healthChecks.filter((h: HealthStatus) => h.status === 'degraded').length;
    const healthyCount = healthChecks.filter((h: HealthStatus) => h.status === 'healthy').length;

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let statusColor = 'bg-ok';
    let statusLabel = 'All systems operational';

    if (unhealthyCount > 0) {
        overallStatus = 'unhealthy';
        statusColor = 'bg-error';
        statusLabel = `${unhealthyCount} module${unhealthyCount > 1 ? 's' : ''} unhealthy`;
    } else if (degradedCount > 0) {
        overallStatus = 'degraded';
        statusColor = 'bg-yellow-500';
        statusLabel = `${degradedCount} module${degradedCount > 1 ? 's' : ''} degraded`;
    } else if (healthyCount > 0) {
        statusLabel = 'All systems operational';
    } else {
        statusLabel = 'No health data';
    }

    return (
        <footer className="h-8 px-4 flex items-center justify-between border-t border-white/10 bg-bg/80 backdrop-blur-sm text-xs text-muted">
            <div className="flex items-center gap-4">
                <span>Modules: <strong className="text-fg">{enabledCount}</strong> / {totalCount} enabled</span>
                <span className="w-px h-4 bg-white/10" />
                <span>Version 1.0.0</span>
                {lastUpdated > 0 && (
                    <span className="w-px h-4 bg-white/10" />
                )}
                {lastUpdated > 0 && (
                    <span className="text-muted/60">
                        Updated {formatTimeAgo(lastUpdated)}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-3">
                {devMode && (
                    <span className="px-2 py-0.5 bg-accent/20 text-accent rounded text-xs font-medium">DEV MODE</span>
                )}
                <span className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${statusColor} animate-pulse`} />
                    <span className="text-fg/80">{statusLabel}</span>
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
