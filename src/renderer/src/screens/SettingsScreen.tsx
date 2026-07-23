import { useState, useEffect } from 'react';
import { RefreshCw, Coffee } from 'lucide-react';
import {
    PageHeader, Card, CardHeader, CardTitle, CardDescription, CardContent,
    Label, Input, Switch, Button, Badge, Tabs, TabsList, TabsTrigger, TabsContent,
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
    Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
    toast,
} from '../components/ui';
import { useThemeStore } from '../stores/themeStore';
import { useModuleStore } from '../stores/moduleStore';
import { useDevStore } from '../stores/devStore';
import { useGameStore } from '../stores/gameStore';
import { useGameData } from '../data/gameData';
import { useInventoryStore, useOwnedInventory } from '../stores/inventoryStore';
import { useSettingsStore, LOGICAL_CORES } from '../stores/settingsStore';
import { gameDataCounts, exportGameData, importGameData, clearGameData, type GameDataEnvelope } from '../lib/gameDataBackup';
import { GamePackageInstaller } from '../components/GamePackageInstaller';
import { useAppVersion } from '../lib/useAppVersion';
import { newGearId } from '../components/InventoryWindows';
import { hasBlockingIssues, buildGearEntryFromDraft, gearIdentityKey } from '../lib/ocrMapping';
import { mapGoodArtifactToDraft, type GoodFile } from '../lib/goodImport';

interface AppUpdateInfo {
    repo: string;
    currentVersion: string;
    latestVersion: string | null;
    updateAvailable: boolean;
    releaseUrl?: string;
    releaseNotes?: string;
    error?: string;
}
interface GameUpdate {
    id: string;
    displayName: string;
    localVersion: string;
    remoteVersion: string;
    downloadUrl: string;
    releaseNotes?: string;
}
interface GameIncompatible {
    id: string;
    displayName: string;
    requiredAppVersion: string;
    runningAppVersion: string;
}
interface UpdateStatus {
    lastCheckAt: number | null;
    lastError: string | null;
    app: AppUpdateInfo | null;
    games: GameUpdate[];
    incompatible: GameIncompatible[];
}

const updateBridge = () => (window as unknown as {
    frequencyManager?: {
        checkUpdates?: (opts?: { manifestUrl?: string; appRepo?: string }) => Promise<UpdateStatus | null>;
        getUpdateStatus?: () => Promise<UpdateStatus | null>;
        openExternal?: (url: string) => void;
        installGamePackage?: (id: string, downloadUrl: string) => Promise<{ installed?: boolean; needsRestart?: boolean; error?: string }>;
    };
}).frequencyManager;

interface DisplayInfo { id: number; width: number; height: number; isPrimary: boolean }

const scannerBridge = () => (window as unknown as {
    frequencyManager?: { listDisplays?: () => Promise<DisplayInfo[]> };
}).frequencyManager;

const dataBridge = () => (window as unknown as {
    frequencyManager?: {
        storageGetAll?: () => Promise<Record<string, unknown>>;
        storageSet?: (key: string, value: unknown) => Promise<boolean>;
        saveJsonFile?: (name: string, content: string) => Promise<string | null>;
        openJsonFile?: () => Promise<{ path: string; content: string } | null>;
        openLogsFolder?: () => Promise<string>;
    };
}).frequencyManager;

export function SettingsScreen() {
    const { theme, presets, setTheme } = useThemeStore();
    const { modules, enableModule, disableModule } = useModuleStore();
    const { devMode, toggleDevMode } = useDevStore();
    const { games, activeGameId, setActiveGame } = useGameStore();
    const {
        loadoutCount, setLoadoutCount,
        optimizerThreads, setOptimizerThreads,
        updateAppRepo, setUpdateAppRepo, updateManifestUrl, setUpdateManifestUrl,
        scanHotkey, setScanHotkey,
        captureDisplayId, setCaptureDisplayId,
        autoUpdateEnabled, setAutoUpdateEnabled,
    } = useSettingsStore();
    const maxOptimizerThreads = LOGICAL_CORES;

    // Updates — real, backed by the update-checker module over IPC.
    const [checking, setChecking] = useState(false);
    const [status, setStatus] = useState<UpdateStatus | null>(null);

    useEffect(() => {
        // Show the last cached result without hitting the network.
        void (async () => {
            const s = await updateBridge()?.getUpdateStatus?.();
            if (s) setStatus(s);
        })();
    }, []);

    // Connected monitors, for the "Capture display" override below.
    const [displays, setDisplays] = useState<DisplayInfo[]>([]);
    useEffect(() => {
        void (async () => {
            const list = await scannerBridge()?.listDisplays?.();
            if (list) setDisplays(list);
        })();
    }, []);

    // Install/update a game package straight from its manifest-listed downloadUrl,
    // reusing the same main-process handler the repo-based installer uses.
    const [installingGameId, setInstallingGameId] = useState<string | null>(null);
    const installGameUpdate = async (id: string, downloadUrl: string) => {
        const b = updateBridge();
        if (!b?.installGamePackage) { toast.error('Game package installer unavailable'); return; }
        setInstallingGameId(id);
        try {
            const res = await b.installGamePackage(id, downloadUrl);
            if (res.error) { toast.error(`Failed to update ${id}`, { description: res.error }); return; }
            if (res.needsRestart) toast.success('Downloaded — restart the app to apply the update.');
            else { await useGameStore.getState().syncFromBackend(); toast.success(`${id} updated`); }
        } finally {
            setInstallingGameId(null);
        }
    };

    const checkNow = async () => {
        const b = updateBridge();
        if (!b?.checkUpdates) { toast.error('Update checker unavailable'); return; }
        setChecking(true);
        try {
            const s = await b.checkUpdates({
                appRepo: updateAppRepo || undefined,
                manifestUrl: updateManifestUrl || undefined,
            });
            if (s) { setStatus(s); toast.success('Update check complete'); }
            else toast.error('Update check failed');
        } catch {
            toast.error('Update check failed');
        } finally {
            setChecking(false);
        }
    };

    // Data — real backup/restore of all durable user data (the user-data.json
    // that backs settings, saved builds, active screen, active game).
    const [exportText, setExportText] = useState('');
    const [importText, setImportText] = useState('');
    const appVersion = useAppVersion('1.0.0');

    const doExport = async () => {
        const b = dataBridge();
        const data = (await b?.storageGetAll?.()) ?? {};
        const envelope = {
            schemaVersion: '1.0',
            kind: 'frequency-manager-userdata',
            exportedAt: new Date().toISOString(),
            app: `frequency-manager@${appVersion}`,
            data,
        };
        setExportText(JSON.stringify(envelope, null, 2));
        toast.success('Exported current data');
    };
    const saveToFile = async () => {
        if (!exportText) return;
        const path = await dataBridge()?.saveJsonFile?.('frequency-manager-backup.json', exportText);
        if (path) toast.success('Saved backup file');
    };
    const loadFromFile = async () => {
        const res = await dataBridge()?.openJsonFile?.();
        if (res?.content) { setImportText(res.content); toast.success('Loaded file — review, then Import'); }
    };
    const doImport = async () => {
        let parsed: { kind?: string; data?: Record<string, unknown> };
        try { parsed = JSON.parse(importText) as { kind?: string; data?: Record<string, unknown> }; } catch { toast.error('Invalid JSON'); return; }
        if (parsed?.kind !== 'frequency-manager-userdata' || typeof parsed.data !== 'object' || !parsed.data) {
            toast.error('Not a FrequencyManager backup file'); return;
        }
        const b = dataBridge();
        if (!b?.storageSet) { toast.error('Storage unavailable'); return; }
        try {
            for (const [k, v] of Object.entries(parsed.data)) await b.storageSet(k, v);
            toast.success('Imported — reloading to apply…');
            setTimeout(() => window.location.reload(), 700);
        } catch {
            toast.error('Import failed');
        }
    };

    // Game-scoped data — export/import/cleanup for just the ACTIVE game's
    // owned inventory/loadouts/sequences/party setups/rotations. Distinct
    // from the full-app backup above (every game, plus settings/theme/etc.)
    // — for a user who wants to back up or reset just one game's data.
    const activeGameLabel = games.find((g) => g.id === activeGameId)?.label ?? activeGameId;
    const [gameExportText, setGameExportText] = useState('');
    const [gameImportText, setGameImportText] = useState('');

    const doGameExport = () => {
        const envelope = exportGameData(activeGameId, activeGameLabel, appVersion);
        setGameExportText(JSON.stringify(envelope, null, 2));
        toast.success(`Exported ${activeGameLabel} data`);
    };
    const saveGameToFile = async () => {
        if (!gameExportText) return;
        const path = await dataBridge()?.saveJsonFile?.(`${activeGameId}-backup.json`, gameExportText);
        if (path) toast.success('Saved backup file');
    };
    const loadGameFromFile = async () => {
        const res = await dataBridge()?.openJsonFile?.();
        if (res?.content) { setGameImportText(res.content); toast.success('Loaded file — review, then Import'); }
    };
    const doGameImport = () => {
        let parsed: GameDataEnvelope;
        try { parsed = JSON.parse(gameImportText) as GameDataEnvelope; } catch { toast.error('Invalid JSON'); return; }
        if (parsed?.kind !== 'frequency-manager-game-data' || typeof parsed.data !== 'object' || !parsed.data) {
            toast.error('Not a FrequencyManager game-data backup file'); return;
        }
        // Character/weapon/gear ids only resolve against THAT game's own
        // catalog — importing into a different game would silently produce
        // unresolvable references, not just "wrong" data. Block rather than
        // guess; the user can switch the active game above and retry.
        if (parsed.gameId !== activeGameId) {
            toast.error(`This backup is for ${parsed.gameLabel ?? parsed.gameId} — switch to that game above first, then import`);
            return;
        }
        importGameData(activeGameId, parsed.data);
        toast.success('Imported — reloading to apply…');
        setTimeout(() => window.location.reload(), 700);
    };
    const doGameCleanup = () => {
        const c = gameDataCounts(activeGameId);
        const total = c.characters + c.weapons + c.gear + c.loadouts + c.partySetups + c.rotations;
        if (total === 0) { toast.info(`No ${activeGameLabel} data to clean up`); return; }
        const confirmed = window.confirm(
            `Permanently delete ALL ${activeGameLabel} data?\n\n`
            + `${c.characters} character(s), ${c.weapons} weapon(s), ${c.gear} gear piece(s), `
            + `${c.loadouts} loadout(s), ${c.partySetups} party setup(s), ${c.rotations} saved rotation(s).\n\n`
            + `This cannot be undone.`,
        );
        if (!confirmed) return;
        clearGameData(activeGameId);
        toast.success(`${activeGameLabel} data cleared — reloading…`);
        setTimeout(() => window.location.reload(), 700);
    };

    // GOOD-format import (Genshin only) — brings in artifacts from any
    // third-party scanner/tool that reads or writes the community-standard
    // GOOD format (Inventory Kamera, Akasha Scanner, Genshin Optimizer,
    // SEELIE.me), since this app's own OCR scanner doesn't support Genshin.
    // Reuses the same draft → catalog-resolve → dedupe pipeline the OCR
    // scanner's "Auto import from latest" already uses (see `goodImport.ts`).
    const goodGameData = useGameData(activeGameId);
    const goodInventoryGear = useOwnedInventory(activeGameId).gear;
    const addGear = useInventoryStore((s) => s.addGear);
    const [goodImportText, setGoodImportText] = useState('');
    const loadGoodFromFile = async () => {
        const res = await dataBridge()?.openJsonFile?.();
        if (res?.content) { setGoodImportText(res.content); toast.success('Loaded file — review, then Import'); }
    };
    const doGoodImport = () => {
        let parsed: GoodFile;
        try { parsed = JSON.parse(goodImportText) as GoodFile; } catch { toast.error('Invalid JSON'); return; }
        if (!Array.isArray(parsed.artifacts) || parsed.artifacts.length === 0) {
            toast.error('No artifacts found in this file'); return;
        }
        const catalog = goodGameData.gearCatalog;
        const seenKeys = new Set(goodInventoryGear.map((g) => gearIdentityKey(g)));
        let imported = 0;
        let skippedIssues = 0;
        let skippedDuplicate = 0;
        for (const a of parsed.artifacts) {
            const draft = mapGoodArtifactToDraft(a, catalog);
            if (hasBlockingIssues(draft)) { skippedIssues++; continue; }
            const gear = buildGearEntryFromDraft(draft, catalog, 'artifact', () => newGearId(activeGameId));
            if (!gear) { skippedIssues++; continue; }
            const key = gearIdentityKey(gear);
            if (seenKeys.has(key)) { skippedDuplicate++; continue; }
            addGear(activeGameId, gear);
            seenKeys.add(key);
            imported++;
        }
        const parts: string[] = [];
        if (skippedIssues > 0) parts.push(`${skippedIssues} skipped (unrecognized set/stat)`);
        if (skippedDuplicate > 0) parts.push(`${skippedDuplicate} skipped as duplicate${skippedDuplicate === 1 ? '' : 's'}`);
        if (imported > 0) {
            toast.success(`Imported ${imported} artifact${imported === 1 ? '' : 's'}`, parts.length > 0 ? { description: parts.join(', ') } : undefined);
            setGoodImportText('');
        } else {
            toast.info('Nothing imported', parts.length > 0 ? { description: parts.join(', ') } : undefined);
        }
    };

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-6">
            <PageHeader title="Settings" description="Appearance, game, modules, updates and data." />

            <Tabs defaultValue="appearance">
                <TabsList className="flex-wrap">
                    <TabsTrigger value="appearance">Appearance</TabsTrigger>
                    <TabsTrigger value="game">Game</TabsTrigger>
                    <TabsTrigger value="calculator">Calculator</TabsTrigger>
                    <TabsTrigger value="scanner">Scanner</TabsTrigger>
                    <TabsTrigger value="modules">Modules</TabsTrigger>
                    <TabsTrigger value="updates">Updates</TabsTrigger>
                    <TabsTrigger value="data">Data</TabsTrigger>
                    <TabsTrigger value="developer">Developer</TabsTrigger>
                    <TabsTrigger value="about">About</TabsTrigger>
                </TabsList>

                {/* ── Appearance ── */}
                <TabsContent value="appearance" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Theme</CardTitle>
                            <CardDescription>Applies instantly across the app.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="max-w-xs space-y-1.5">
                                <Label>Preset</Label>
                                <Select value={theme} onValueChange={setTheme}>
                                    <SelectTrigger><SelectValue placeholder="Select theme" /></SelectTrigger>
                                    <SelectContent>
                                        {presets.map((p) => <SelectItem key={p.name} value={p.name}>{p.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {presets.map((p) => {
                                    const active = p.name === theme;
                                    return (
                                        <button
                                            key={p.name}
                                            onClick={() => setTheme(p.name)}
                                            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${active ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-surface-2'}`}
                                        >
                                            <span className="flex gap-1">
                                                <span className="h-4 w-4 rounded-sm border border-border" style={{ background: `rgb(${p.roles.background})` }} />
                                                <span className="h-4 w-4 rounded-sm border border-border" style={{ background: `rgb(${p.roles.primary})` }} />
                                                <span className="h-4 w-4 rounded-sm border border-border" style={{ background: `rgb(${p.roles.surface})` }} />
                                            </span>
                                            {p.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── Game ── */}
                <TabsContent value="game" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Active game</CardTitle>
                            <CardDescription>Which game's data and vocabulary the app uses.</CardDescription>
                        </CardHeader>
                        <CardContent className="max-w-xs space-y-1.5">
                            <Label>Game</Label>
                            <Select value={activeGameId} onValueChange={setActiveGame}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {games.map((g) => <SelectItem key={g.id} value={g.id}>{g.label} (v{g.version})</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── Calculator ── */}
                <TabsContent value="calculator" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Optimizer</CardTitle>
                            <CardDescription>How the Damage Calculator presents optimization results.</CardDescription>
                        </CardHeader>
                        <CardContent className="max-w-xs space-y-1.5">
                            <Label>Loadouts to display</Label>
                            <Input type="number" min={1} max={20} value={loadoutCount} onChange={(e) => setLoadoutCount(Number(e.target.value))} />
                            <p className="text-xs text-muted-foreground">Number of top loadouts the optimizer lists (1–20).</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Performance</CardTitle>
                            <CardDescription>The optimizer searches every possible gear combination — a large collection can mean a lot of computation.</CardDescription>
                        </CardHeader>
                        <CardContent className="max-w-xs space-y-1.5">
                            <Label>Optimizer threads</Label>
                            <Input type="number" min={1} max={maxOptimizerThreads} value={optimizerThreads} onChange={(e) => setOptimizerThreads(Number(e.target.value))} />
                            <p className="text-xs text-muted-foreground">How many CPU threads the optimizer uses at once (1–{maxOptimizerThreads}). More is faster but uses more CPU/battery; fewer leaves your machine more responsive while it runs.</p>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── Scanner ── */}
                <TabsContent value="scanner" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Global scan hotkey</CardTitle>
                            <CardDescription>Press this anywhere — even while the game has focus — to capture the screen and OCR-scan it.</CardDescription>
                        </CardHeader>
                        <CardContent className="max-w-xs space-y-1.5">
                            <Label>Hotkey</Label>
                            <Input
                                value={scanHotkey}
                                onChange={(e) => setScanHotkey(e.target.value)}
                                placeholder="Alt+Shift+S"
                            />
                            <p className="text-xs text-muted-foreground">Electron accelerator format, e.g. "Alt+Shift+S" or "CommandOrControl+Shift+O". Avoid keys the game itself already uses.</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Capture display</CardTitle>
                            <CardDescription>
                                By default, a scan finds the game's window automatically. On a
                                multi-monitor setup where that doesn't work — some games can't be
                                found this way while running exclusive-fullscreen — pick the
                                monitor the game is on here to always capture it directly instead.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="max-w-xs space-y-1.5">
                            <Label>Monitor</Label>
                            <Select
                                value={captureDisplayId == null ? 'auto' : String(captureDisplayId)}
                                onValueChange={(v) => setCaptureDisplayId(v === 'auto' ? null : Number(v))}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="auto">Auto (recommended)</SelectItem>
                                    {displays.map((d) => (
                                        <SelectItem key={d.id} value={String(d.id)}>
                                            {d.width}×{d.height}{d.isPrimary ? ' (Primary)' : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                {displays.length <= 1
                                    ? 'Only one monitor detected — this only matters with more than one.'
                                    : 'If scans keep failing to find the game, set this to the monitor it\'s actually running on.'}
                            </p>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── Modules ── */}
                <TabsContent value="modules" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Modules</CardTitle>
                            <CardDescription>Enable or disable feature modules.</CardDescription>
                        </CardHeader>
                        <CardContent className="divide-y divide-border">
                            {modules.length === 0 && <p className="py-2 text-sm text-muted-foreground">No modules loaded.</p>}
                            {modules.map((m) => (
                                <div key={m.id} className="flex items-center justify-between py-3">
                                    <div>
                                        <div className="text-sm font-medium text-foreground">{m.name}</div>
                                        {m.description && <div className="text-xs text-muted-foreground">{m.description}</div>}
                                    </div>
                                    <Switch checked={m.enabled} onCheckedChange={(v) => { void (v ? enableModule(m.id) : disableModule(m.id)); }} />
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── Updates ── */}
                <TabsContent value="updates" className="space-y-4">
                    {/* Sources */}
                    <Card>
                        <CardHeader className="flex-row items-center justify-between">
                            <div>
                                <CardTitle>Updates</CardTitle>
                                <CardDescription>
                                    {status?.lastCheckAt
                                        ? `Last checked ${new Date(status.lastCheckAt).toLocaleString()}`
                                        : 'Not checked yet'}
                                </CardDescription>
                            </div>
                            <Button size="sm" variant="secondary" onClick={() => { void checkNow(); }} disabled={checking}>
                                <RefreshCw className={checking ? 'animate-spin' : ''} /> {checking ? 'Checking…' : 'Check now'}
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="upd-repo">App GitHub repo</Label>
                                    <Input
                                        id="upd-repo"
                                        placeholder="owner/name"
                                        value={updateAppRepo}
                                        onChange={(e) => setUpdateAppRepo(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">Checked against GitHub releases for a newer app version.</p>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="upd-manifest">Game-definitions manifest URL</Label>
                                    <Input
                                        id="upd-manifest"
                                        placeholder="https://…/manifest.json"
                                        value={updateManifestUrl}
                                        onChange={(e) => setUpdateManifestUrl(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">JSON listing available game-module updates.</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Install game packages straight from the repo above */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Install game packages</CardTitle>
                            <CardDescription>Downloads `.zip` game packages from the App GitHub repo's latest release.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <GamePackageInstaller />
                        </CardContent>
                    </Card>

                    {/* App release */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Application</CardTitle>
                            <CardDescription>The FrequencyManager desktop app itself.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <Label htmlFor="auto-update">Check for updates automatically</Label>
                                    <p className="text-xs text-muted-foreground">Downloads a new app version in the background on launch; installs on next restart.</p>
                                </div>
                                <Switch id="auto-update" checked={autoUpdateEnabled} onCheckedChange={setAutoUpdateEnabled} />
                            </div>
                            {!status?.app ? (
                                <p className="text-sm text-muted-foreground">
                                    {updateAppRepo ? 'Run a check to see the latest release.' : 'Set your GitHub repo above, then check.'}
                                </p>
                            ) : status.app.error ? (
                                <p className="text-sm text-destructive">Check failed: {status.app.error}</p>
                            ) : (
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm">
                                        <div className="text-foreground">
                                            Current <span className="font-mono">{status.app.currentVersion}</span>
                                            {' → '}Latest <span className="font-mono">{status.app.latestVersion ?? '—'}</span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">{status.app.repo}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant={status.app.updateAvailable ? 'default' : 'success'}>
                                            {status.app.updateAvailable ? 'Update available' : 'Up to date'}
                                        </Badge>
                                        {status.app.updateAvailable && status.app.releaseUrl && (
                                            <Button size="sm" onClick={() => updateBridge()?.openExternal?.(status.app!.releaseUrl!)}>
                                                View release
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Game-definition updates */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Game-definition updates</CardTitle>
                            <CardDescription>Data packages for each supported game.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!status ? (
                                <p className="text-sm text-muted-foreground">Run a check to see available game-module updates.</p>
                            ) : status.games.length === 0 && status.incompatible.length === 0 ? (
                                <p className="text-sm text-muted-foreground">All installed game modules are up to date.</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Game</TableHead>
                                            <TableHead>Local</TableHead>
                                            <TableHead>Remote</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {status.games.map((u) => (
                                            <TableRow key={u.id}>
                                                <TableCell className="font-medium text-foreground">{u.displayName}</TableCell>
                                                <TableCell className="font-mono text-muted-foreground">{u.localVersion}</TableCell>
                                                <TableCell className="font-mono">{u.remoteVersion}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="default">Update available</Badge>
                                                        <Button
                                                            size="sm"
                                                            variant="secondary"
                                                            disabled={installingGameId === u.id}
                                                            onClick={() => { void installGameUpdate(u.id, u.downloadUrl); }}
                                                        >
                                                            {installingGameId === u.id ? 'Installing…' : 'Update'}
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {status.incompatible.map((u) => (
                                            <TableRow key={u.id}>
                                                <TableCell className="font-medium text-foreground">{u.displayName}</TableCell>
                                                <TableCell className="font-mono text-muted-foreground" colSpan={2}>
                                                    needs app ≥ {u.requiredAppVersion} (running {u.runningAppVersion})
                                                </TableCell>
                                                <TableCell><Badge variant="destructive">App too old</Badge></TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── Data ── */}
                <TabsContent value="data" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>{activeGameLabel} data</CardTitle>
                            <CardDescription>Back up, restore, or reset just your {activeGameLabel} characters, weapons, gear, loadouts, party setups and rotations — leaves other games and your app settings untouched.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                <Button onClick={doGameExport}>Export {activeGameLabel} data</Button>
                                {gameExportText && (
                                    <>
                                        <Button variant="secondary" onClick={() => { void saveGameToFile(); }}>Save to file…</Button>
                                        <Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(gameExportText); toast.success('Copied'); }}>Copy</Button>
                                    </>
                                )}
                            </div>
                            {gameExportText && (
                                <textarea readOnly value={gameExportText} className="h-32 w-full rounded-md border border-input bg-surface p-3 font-mono text-xs text-foreground scrollbar-thin" />
                            )}
                            <div className="space-y-2 border-t border-border pt-3">
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="secondary" onClick={() => { void loadGameFromFile(); }}>Load from file…</Button>
                                </div>
                                <textarea
                                    value={gameImportText}
                                    onChange={(e) => setGameImportText(e.target.value)}
                                    placeholder={`Paste a ${activeGameLabel} backup here…`}
                                    className="h-28 w-full rounded-md border border-input bg-surface p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground scrollbar-thin"
                                />
                                <Button onClick={doGameImport} disabled={!gameImportText.trim()}>Import &amp; reload</Button>
                            </div>
                            <div className="border-t border-border pt-3">
                                <Button variant="destructive" onClick={doGameCleanup}>Clean up {activeGameLabel} data…</Button>
                                <p className="mt-1.5 text-xs text-muted-foreground">Permanently deletes all owned characters, weapons, gear, loadouts, party setups and saved rotations for {activeGameLabel}. Export a backup first if you're not sure.</p>
                            </div>
                        </CardContent>
                    </Card>
                    {activeGameId === 'genshin-impact' && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Import from third-party scanner</CardTitle>
                                <CardDescription>
                                    Bring in artifacts from any tool that exports the GOOD format
                                    (Genshin Open Object Description) — Inventory Kamera, Akasha
                                    Scanner, Genshin Optimizer, and others all read/write it. This
                                    app's own OCR scanner doesn't support Genshin, so this is the
                                    recommended way to get your Genshin gear in.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex flex-wrap gap-2">
                                    <Button variant="secondary" onClick={() => { void loadGoodFromFile(); }}>Load GOOD file…</Button>
                                </div>
                                <textarea
                                    value={goodImportText}
                                    onChange={(e) => setGoodImportText(e.target.value)}
                                    placeholder="Paste GOOD-format JSON here…"
                                    className="h-28 w-full rounded-md border border-input bg-surface p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground scrollbar-thin"
                                />
                                <Button onClick={doGoodImport} disabled={!goodImportText.trim()}>Import artifacts</Button>
                                <p className="text-xs text-muted-foreground">
                                    Artifacts are added to inventory unequipped — equip them from
                                    the Inventory tab. Already-owned duplicates and unrecognized
                                    sets/stats are skipped, not guessed at.
                                </p>
                            </CardContent>
                        </Card>
                    )}
                    <Card>
                        <CardHeader>
                            <CardTitle>Export everything</CardTitle>
                            <CardDescription>Back up all your settings, saved builds and preferences (every game) as a portable JSON file.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                <Button onClick={() => { void doExport(); }}>Export current data</Button>
                                {exportText && (
                                    <>
                                        <Button variant="secondary" onClick={() => { void saveToFile(); }}>Save to file…</Button>
                                        <Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(exportText); toast.success('Copied'); }}>Copy</Button>
                                    </>
                                )}
                            </div>
                            {exportText && (
                                <textarea readOnly value={exportText} className="h-40 w-full rounded-md border border-input bg-surface p-3 font-mono text-xs text-foreground scrollbar-thin" />
                            )}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Import everything</CardTitle>
                            <CardDescription>Restore from a full backup file or pasted JSON. This overwrites your current data and reloads the app.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                                <Button variant="secondary" onClick={() => { void loadFromFile(); }}>Load from file…</Button>
                            </div>
                            <textarea
                                value={importText}
                                onChange={(e) => setImportText(e.target.value)}
                                placeholder="Paste a FrequencyManager backup here…"
                                className="h-40 w-full rounded-md border border-input bg-surface p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground scrollbar-thin"
                            />
                            <Button onClick={() => { void doImport(); }} disabled={!importText.trim()}>Import &amp; reload</Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── Developer ── */}
                <TabsContent value="developer" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Developer mode</CardTitle>
                            <CardDescription>Shows the dev panel with event/RPC logs.</CardDescription>
                        </CardHeader>
                        <CardContent className="flex items-center justify-between">
                            <Label htmlFor="devmode">Enable developer mode</Label>
                            <Switch id="devmode" checked={devMode} onCheckedChange={toggleDevMode} />
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── About ── */}
                <TabsContent value="about" className="space-y-4">
                    <Card>
                        <CardHeader><CardTitle>FrequencyManager</CardTitle></CardHeader>
                        <CardContent className="space-y-1 text-sm text-muted-foreground">
                            <p className="font-medium text-foreground">Version {appVersion}</p>
                            <p>Multi-game build optimizer for gacha RPGs.</p>
                            <p className="pt-2 text-xs opacity-70">Built with Electron · React · shadcn/ui · Tailwind</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Support the project</CardTitle>
                            <CardDescription>FrequencyManager is free and made in spare time. If it's useful to you, a coffee helps keep it going.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="secondary" onClick={() => updateBridge()?.openExternal?.('https://buymeacoffee.com/voruzhu')}>
                                <Coffee className="w-4 h-4 mr-2" />
                                Buy me a coffee
                            </Button>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Troubleshooting</CardTitle>
                            <CardDescription>
                                If something isn't working right (a scan not finding the game,
                                icons not showing, etc.), the log file has details that help
                                pin down why — open it here to check or share it.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Button variant="secondary" onClick={() => { void dataBridge()?.openLogsFolder?.(); }}>Open logs folder</Button>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
