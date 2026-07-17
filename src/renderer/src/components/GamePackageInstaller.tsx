import { useState } from 'react';
import { Download, CheckCircle2, RefreshCw } from 'lucide-react';
import { Input, Button, Label, toast } from './ui';
import { useSettingsStore } from '../stores/settingsStore';
import { useGameStore } from '../stores/gameStore';

interface RemotePackage {
    id: string;
    name: string;
    downloadUrl: string;
    size: number;
    alreadyInstalled: boolean;
}

const gamePackageBridge = () => (window as unknown as {
    frequencyManager?: {
        listGamePackagesFromRepo?: (repo: string) => Promise<{ releaseTag?: string; packages?: RemotePackage[]; error?: string }>;
        installGamePackage?: (id: string, downloadUrl: string) => Promise<{ installed?: boolean; needsRestart?: boolean; error?: string }>;
        restartApp?: () => Promise<void>;
    };
}).frequencyManager;

/**
 * Paste a GitHub repo ("owner/name") -> list its latest release's `.zip`
 * game-package assets -> install one with a click. Downloads straight from
 * the repo's releases, no separate manifest.json to host. Shared between
 * the first-launch "no games installed" screen and Settings — same repo
 * field as the app-update checker (`updateAppRepo`), since in practice the
 * app and its game packages are published from the same repo.
 */
export function GamePackageInstaller() {
    const { updateAppRepo, setUpdateAppRepo } = useSettingsStore();
    const [fetching, setFetching] = useState(false);
    const [installingId, setInstallingId] = useState<string | null>(null);
    const [packages, setPackages] = useState<RemotePackage[] | null>(null);
    const [needsRestart, setNeedsRestart] = useState(false);

    const fetchPackages = async () => {
        const bridge = gamePackageBridge();
        if (!bridge?.listGamePackagesFromRepo) { toast.error('Game package installer unavailable'); return; }
        if (!updateAppRepo.trim()) { toast.error('Enter a GitHub repo first (owner/name)'); return; }
        setFetching(true);
        try {
            const res = await bridge.listGamePackagesFromRepo(updateAppRepo);
            if (res.error) { toast.error('Could not list packages', { description: res.error }); return; }
            setPackages(res.packages ?? []);
            if (!res.packages || res.packages.length === 0) toast.error('No .zip game packages found on that repo\'s latest release');
        } finally {
            setFetching(false);
        }
    };

    const install = async (pkg: RemotePackage) => {
        const bridge = gamePackageBridge();
        if (!bridge?.installGamePackage) { toast.error('Game package installer unavailable'); return; }
        setInstallingId(pkg.id);
        try {
            const res = await bridge.installGamePackage(pkg.id, pkg.downloadUrl);
            if (res.error) { toast.error(`Failed to install ${pkg.name}`, { description: res.error }); return; }
            if (res.needsRestart) {
                setNeedsRestart(true);
                toast.success(`${pkg.name} downloaded — restart to apply the update`);
            } else {
                await useGameStore.getState().syncFromBackend();
                toast.success(`${pkg.name} installed`);
                setPackages((prev) => prev?.map((p) => (p.id === pkg.id ? { ...p, alreadyInstalled: true } : p)) ?? null);
            }
        } finally {
            setInstallingId(null);
        }
    };

    return (
        <div className="space-y-3">
            <div className="space-y-1.5">
                <Label htmlFor="game-pkg-repo">GitHub repo</Label>
                <div className="flex gap-2">
                    <Input id="game-pkg-repo" placeholder="owner/name" value={updateAppRepo} onChange={(e) => setUpdateAppRepo(e.target.value)} />
                    <Button variant="secondary" onClick={() => { void fetchPackages(); }} disabled={fetching}>
                        <RefreshCw className={fetching ? 'animate-spin' : ''} /> {fetching ? 'Fetching…' : 'Fetch packages'}
                    </Button>
                </div>
                <p className="text-xs text-muted-foreground">Lists the `.zip` game packages attached to that repo's latest release.</p>
            </div>

            {packages && packages.length > 0 && (
                <div className="space-y-2">
                    {packages.map((p) => (
                        <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface p-2">
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium text-foreground">{p.name}</div>
                                <div className="text-xs text-muted-foreground">{Math.round(p.size / 1024)} KB</div>
                            </div>
                            {p.alreadyInstalled ? (
                                <Button size="sm" variant="secondary" onClick={() => { void install(p); }} disabled={installingId === p.id}>
                                    <Download className={installingId === p.id ? 'animate-pulse' : ''} /> {installingId === p.id ? 'Updating…' : 'Update'}
                                </Button>
                            ) : (
                                <Button size="sm" onClick={() => { void install(p); }} disabled={installingId === p.id}>
                                    <Download className={installingId === p.id ? 'animate-pulse' : ''} /> {installingId === p.id ? 'Installing…' : 'Install'}
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {needsRestart && (
                <div className="flex items-center justify-between gap-2 rounded-md border border-primary/40 bg-primary/5 p-2">
                    <span className="flex items-center gap-1.5 text-sm text-foreground"><CheckCircle2 className="h-4 w-4 text-success" /> Update downloaded — restart to apply.</span>
                    <Button size="sm" onClick={() => { void gamePackageBridge()?.restartApp?.(); }}>Restart now</Button>
                </div>
            )}
        </div>
    );
}
