import { useEffect, useRef, useState } from 'react';
import { ScanLine, Square, FolderOpen, Image as ImageIcon, FileSearch, AlertTriangle, Download, Trash2 } from 'lucide-react';
import {
    PageHeader, Card, CardHeader, CardTitle, CardContent, Button, Badge, EmptyState, ScrollArea,
    toast,
} from '../components/ui';
import { cn } from '@/lib/utils';
import { useWindowStore } from '../stores/windowStore';
import { useGameStore } from '../stores/gameStore';
import { useGameData } from '../data/gameData';
import { useInventoryStore, useOwnedInventory } from '../stores/inventoryStore';
import { useSettingsStore } from '../stores/settingsStore';
import { ScanTypeWindow, ConfirmScannedGearWindow } from '../components/ScanWindows';
import { newGearId } from '../components/InventoryWindows';
import { mapScannedEchoToGearDraft, buildGearEntryFromDraft, hasBlockingIssues, findDuplicateSource, type DuplicateSource } from '@/lib/ocrMapping';
import type { ScannedEcho } from '@shared/types/ocr';

/** One scanned screenshot (from either the file-picker or the global-hotkey
 * live-capture path). Failed scans are kept too (not just a toast) — OCR
 * failure is expected to be common, and seeing why without re-running is
 * more useful than losing the context. */
interface ScanHistoryEntry {
    id: string;
    imagePath: string;
    imageName: string;
    previewUrl: string | null;
    timestamp: number;
    status: 'success' | 'failed';
    echo?: ScannedEcho;
    error?: string;
    /** Raw Tesseract output, even for a rejected (e.g. low-confidence) scan
     * — lets a failure be diagnosed without needing a successful re-scan. */
    rawText?: string;
    /** True once "Auto import from latest" has committed this scan to
     * inventory — excludes it from future auto-import passes so re-clicking
     * the button is idempotent. Shown in history so it's clear which scans
     * still need manual review. */
    autoImported?: boolean;
}

type ScanImageResult =
    | { success: true; echo: ScannedEcho }
    | { success: false; error: string; rawText?: string };

type Bridge = {
    openImageDialog?: () => Promise<string | null>;
    openImagesDialog?: () => Promise<string[]>;
    processFile?: (filePath: string, scanType?: string) => Promise<string>;
    readImagePreview?: (path: string) => Promise<string | null>;
    scanImage?: (path: string) => Promise<ScanImageResult>;
    setScannerActive?: (active: boolean, scanType?: string) => void;
    on?: (event: string, handler: (payload: unknown) => void) => () => void;
};

const bridge = () => (window as unknown as { frequencyManager?: Bridge }).frequencyManager;

const fileNameOf = (p: string) => p.split(/[\\/]/).pop() ?? p;

export function ScannerScreen() {
    const [results, setResults] = useState<ScanHistoryEntry[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);
    const gameId = useGameStore((s) => s.activeGameId);
    const data = useGameData(gameId);
    const addGear = useInventoryStore((s) => s.addGear);
    const scanHotkey = useSettingsStore((s) => s.scanHotkey);
    const inventoryGear = useOwnedInventory(gameId).gear;

    // `results` is newest-first (new scans prepend) — so "earlier scans" for
    // the entry at `index` are everything AFTER it in the array. Only scans
    // that are successful, not already imported, and not themselves blocked
    // are worth comparing against (an imported scan's stats already live in
    // `inventoryGear`; a blocked scan can't build a comparable GearEntry).
    const duplicateSourceFor = (index: number): DuplicateSource | undefined => {
        const r = results[index];
        if (r.status !== 'success' || !r.echo || r.autoImported) return undefined;
        const draft = mapScannedEchoToGearDraft(r.echo, data.gearCatalog);
        if (hasBlockingIssues(draft)) return undefined;
        const earlierGear = results
            .slice(index + 1)
            .filter((e) => e.status === 'success' && e.echo && !e.autoImported)
            .map((e) => {
                const d = mapScannedEchoToGearDraft(e.echo!, data.gearCatalog);
                return hasBlockingIssues(d) ? null : buildGearEntryFromDraft(d, data.gearCatalog, data.gearKind, () => 'dup-check');
            })
            .filter((g): g is NonNullable<typeof g> => g != null);
        return findDuplicateSource(draft, data.gearCatalog, data.gearKind, inventoryGear, earlierGear);
    };

    const selected = results.find((r) => r.id === selectedId) ?? null;
    const selectedIndex = results.findIndex((r) => r.id === selectedId);
    const selectedDuplicateSource = selectedIndex >= 0 ? duplicateSourceFor(selectedIndex) : undefined;

    // Armed state: the ONLY thing that makes the global hotkey do anything.
    // Picking a scan type in the Scan popup arms it (main process is told via
    // `setScannerActive`); each hotkey press while armed runs one capture+
    // scan, repeatable as many times as the user wants ("continuous scans");
    // Stop disarms it, after which the hotkey is a no-op again. Renderer and
    // main both track this independently (main owns the actual gate on the
    // hotkey callback; the renderer's copy only drives this screen's UI) —
    // kept in sync by always pushing on every change, and main resets to
    // disarmed on boot so a stale "armed" flag can never survive a restart.
    const [scannerActive, setScannerActiveState] = useState(false);
    const activateScanner = (scanType: string) => {
        setScannerActiveState(true);
        bridge()?.setScannerActive?.(true, scanType);
    };
    // Force main's armed flag to match this screen's freshly-mounted
    // "inactive" state — covers the edge case of a renderer reload (not a
    // full app restart) leaving main with a stale armed flag from before.
    useEffect(() => { bridge()?.setScannerActive?.(false); }, []);

    // Cancellation token: bumped by `deactivateScanner()` (and by the
    // hotkey/manual flows when a NEW scan starts) so an in-flight scan's
    // eventual result can be told apart from "still current" — this is a
    // SOFT cancel (the underlying OCR call keeps running to completion in
    // the background, its result is just discarded on arrival) rather than
    // a true abort; Tesseract has no clean mid-recognize cancellation API,
    // and scans on the already-cropped panel are fast enough that this is
    // unnoticeable.
    const scanTokenRef = useRef(0);
    const deactivateScanner = () => {
        scanTokenRef.current++;
        setScanning(false);
        setScannerActiveState(false);
        bridge()?.setScannerActive?.(false);
        toast.info('Scanner deactivated');
    };

    /** "Auto import from latest" button: batch-processes every successful
     * scan in history that hasn't already been auto-imported. Eligibility
     * is loose by design (user's spec) — a 'minor' issue (an auto-corrected
     * decimal point, a confidently-inferred cost) still imports; only a
     * 'major' one (an unresolved name, an out-of-bounds value with no
     * correction) blocks it, same bar as `hasBlockingIssues`. Skips the
     * per-item equip-prompt follow-up during a batch run — stacking several
     * of those windows at once would be more confusing than helpful, so a
     * scan naming an equipped owner is left to be equipped manually. */
    const autoImportFromLatest = () => {
        const eligible = results.filter((r) => r.status === 'success' && r.echo && !r.autoImported);
        if (eligible.length === 0) {
            toast.info('Nothing to import', { description: 'No new scans since the last auto-import.' });
            return;
        }
        const importedIds = new Set<string>();
        let skipped = 0;
        for (const r of eligible) {
            const draft = mapScannedEchoToGearDraft(r.echo!, data.gearCatalog);
            if (hasBlockingIssues(draft)) { skipped++; continue; }
            const gear = buildGearEntryFromDraft(draft, data.gearCatalog, data.gearKind, () => newGearId(gameId));
            if (!gear) { skipped++; continue; }
            addGear(gameId, gear);
            importedIds.add(r.id);
        }
        if (importedIds.size > 0) {
            setResults((rs) => rs.map((r) => (importedIds.has(r.id) ? { ...r, autoImported: true } : r)));
            toast.success(`Imported ${importedIds.size} echo${importedIds.size === 1 ? '' : 's'}`, skipped > 0 ? { description: `${skipped} skipped — needs manual review` } : undefined);
        } else {
            toast.info('Nothing imported', { description: `${skipped} scan${skipped === 1 ? '' : 's'} need manual review` });
        }
    };

    /** Used by the "Browse…" file-picker path — the only local capture
     * source left; live capture only ever happens via the hotkey now (its
     * own handler below, since its capture+scan already happened in the
     * main process before this would ever run). `token` is this call's
     * cancellation token — checked after every await so a Stop click
     * mid-flight discards the eventual result instead of surprising the
     * user with a scan they thought they cancelled. `silent` is unused by
     * this path today but kept for parity with the hotkey handler's calls
     * into the same result-recording shape. */
    const runScanFlow = async (imagePath: string, token: number, silent = false) => {
        const b = bridge();
        const id = `scan-${Date.now()}`;
        const imageName = fileNameOf(imagePath);
        const previewUrl = b?.readImagePreview ? await b.readImagePreview(imagePath) : null;
        if (scanTokenRef.current !== token) return; // stopped while reading the preview

        if (!b?.scanImage) {
            setResults((rs) => [{ id, imagePath, imageName, previewUrl, timestamp: Date.now(), status: 'failed', error: 'OCR bridge unavailable' }, ...rs]);
            setSelectedId(id);
            if (!silent) toast.error('Scan failed', { description: 'OCR bridge unavailable' });
            return;
        }
        const result = await b.scanImage(imagePath);
        if (scanTokenRef.current !== token) return; // stopped while OCR was running
        if (result.success) {
            setResults((rs) => [{ id, imagePath, imageName, previewUrl, timestamp: Date.now(), status: 'success', echo: result.echo }, ...rs]);
            setSelectedId(id);
            if (!silent) toast.success('Scan complete', { description: result.echo.setName ? `${result.echo.setName} detected` : 'Echo detected' });
        } else {
            setResults((rs) => [{ id, imagePath, imageName, previewUrl, timestamp: Date.now(), status: 'failed', error: result.error, rawText: result.rawText }, ...rs]);
            setSelectedId(id);
            if (!silent) toast.error('Scan failed', { description: result.error });
        }
    };

    // A hotkey-triggered scan can happen while this window isn't focused (the
    // whole point — press it while the game has focus, no window switch).
    // Main already ran the capture+scan itself (no duplicate scanImage call
    // here) and pushes `ocr:hotkey-scan-started` right before it begins (so
    // Stop is enabled immediately) then `ocr:hotkey-scan-result` with the
    // outcome. `myToken` captures this scan's generation at "started" time —
    // if it no longer matches `scanTokenRef.current` by the time "result"
    // arrives, the user hit Stop in between and the result is discarded.
    useEffect(() => {
        const b = bridge();
        if (!b?.on) return;
        let myToken = 0;
        const unsubStart = b.on('ocr:hotkey-scan-started', () => {
            myToken = ++scanTokenRef.current;
            setScanning(true);
        });
        const unsubResult = b.on('ocr:hotkey-scan-result', (payload) => {
            if (scanTokenRef.current !== myToken) return; // stopped before this arrived
            setScanning(false);
            const p = payload as { success: boolean; imagePath?: string; result?: { echo: ScannedEcho }; error?: string; rawText?: string };
            const id = `scan-${Date.now()}`;
            const imagePath = p.imagePath ?? 'screen-capture.png';
            const imageName = fileNameOf(imagePath);
            void (async () => {
                const previewUrl = p.imagePath && b.readImagePreview ? await b.readImagePreview(p.imagePath) : null;
                if (scanTokenRef.current !== myToken) return; // stopped while reading the preview
                if (p.success && p.result?.echo) {
                    setResults((rs) => [{ id, imagePath, imageName, previewUrl, timestamp: Date.now(), status: 'success', echo: p.result!.echo }, ...rs]);
                    toast.success('Hotkey scan complete', { description: p.result.echo.setName ? `${p.result.echo.setName} detected` : 'Echo detected' });
                } else {
                    setResults((rs) => [{ id, imagePath, imageName, previewUrl, timestamp: Date.now(), status: 'failed', error: p.error ?? 'Unknown OCR error', rawText: p.rawText }, ...rs]);
                    toast.error('Hotkey scan failed', { description: p.error });
                }
                setSelectedId(id);
            })();
        });
        return () => { unsubStart(); unsubResult(); };
    }, []);

    const browseAndScan = async () => {
        const b = bridge();
        if (!b?.openImagesDialog) {
            toast.error('OCR bridge unavailable', { description: 'This build is missing the desktop scan bridge.' });
            return;
        }
        const imagePaths = await b.openImagesDialog();
        if (imagePaths.length === 0) return; // cancelled
        const token = ++scanTokenRef.current;
        setScanning(true);
        // One at a time, not Promise.all — each scan reuses the same worker
        // pipeline a live capture does, and doing them sequentially means
        // history fills in as each one finishes instead of all at once.
        for (const imagePath of imagePaths) {
            if (scanTokenRef.current !== token) break; // stopped mid-batch
            // Run through the same crop+upscale pipeline a live capture gets —
            // a browsed screenshot (e.g. a full-screen shot saved earlier) has
            // the exact same UI-noise problem raw OCR would hit on a fresh
            // capture, so this can't skip that processing.
            const processedPath = b.processFile ? await b.processFile(imagePath, 'echoes') : imagePath;
            if (scanTokenRef.current !== token) break; // stopped while preprocessing
            await runScanFlow(processedPath, token, imagePaths.length > 1);
        }
        if (scanTokenRef.current === token) {
            setScanning(false);
            if (imagePaths.length > 1) toast.success(`Scanned ${imagePaths.length} images`);
        }
    };

    const deleteEntry = (id: string) => {
        setResults((rs) => rs.filter((r) => r.id !== id));
        setSelectedId((cur) => (cur === id ? null : cur));
    };

    const hasEligibleForImport = results.some((r) => r.status === 'success' && !r.autoImported);

    const fmt = (ts: number) => new Date(ts).toLocaleString();
    // `type` already carries a trailing '%' when the stat is a percentage (see
    // the backend's label-with-percent fix) — split it back into "Label value%".
    const fmtStat = (type: string, value: number) => {
        const isPercent = type.endsWith('%');
        return `${isPercent ? type.slice(0, -1) : type} ${value}${isPercent ? '%' : ''}`;
    };

    return (
        <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 p-6">
            <PageHeader
                title="OCR Scanner"
                description="Extract gear stats from game screenshots — arm the scanner, then press the global hotkey (set in Settings) anytime without switching away from the game, or scan a saved screenshot."
                actions={
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={autoImportFromLatest} disabled={!hasEligibleForImport}>
                            <Download /> Auto import from latest
                        </Button>
                        <Button variant="secondary" onClick={() => { void browseAndScan(); }} disabled={scanning}><FolderOpen /> Browse…</Button>
                        <Button
                            onClick={() => useWindowStore.getState().openWindow('Scan', <ScanTypeWindow onPickEchoes={() => activateScanner('echoes')} />)}
                            disabled={scannerActive || scanning}
                        >
                            <ScanLine /> {scannerActive ? 'Active' : 'Scan'}
                        </Button>
                        <Button variant="secondary" onClick={deactivateScanner} disabled={!scannerActive}>
                            <Square /> Stop
                        </Button>
                    </div>
                }
            />

            {scannerActive && (
                <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm text-primary">
                    <ScanLine className="h-4 w-4 flex-shrink-0" />
                    <span>
                        Scanner active{scanHotkey ? ` — press ${scanHotkey} in-game to take a scan` : ''}. Repeat as many times as you want; press Stop when you're done.
                        {scanning && ' Scanning now…'}
                    </span>
                </div>
            )}

            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3">
                {/* History */}
                <Card className="flex min-h-0 flex-col lg:col-span-1">
                    <CardHeader className="flex-row items-center justify-between">
                        <CardTitle>Scan history</CardTitle>
                        <Badge variant="muted">{results.length}</Badge>
                    </CardHeader>
                    <CardContent className="min-h-0 flex-1 p-0">
                        {results.length === 0 ? (
                            <div className="p-4"><EmptyState icon={FileSearch} title="No scans yet" description="Press Scan to arm the scanner, then use the global hotkey in-game — or Browse for a saved screenshot." /></div>
                        ) : (
                            <ScrollArea className="h-full">
                                <ul className="p-2">
                                    {results.map((r, index) => {
                                        // For anything not yet auto-imported, check the SAME condition
                                        // "Auto import from latest" gates on — so the list shows, at a
                                        // glance, which entries actually NEED a manual look (a major
                                        // issue) versus which are just waiting for the next auto-import
                                        // click (no issue, will succeed automatically).
                                        const blocked = r.status === 'success' && r.echo && !r.autoImported
                                            && hasBlockingIssues(mapScannedEchoToGearDraft(r.echo, data.gearCatalog));
                                        const duplicateSource = blocked ? undefined : duplicateSourceFor(index);
                                        const statusLabel = r.status === 'failed' ? 'failed'
                                            : r.autoImported ? 'auto-imported'
                                                : blocked ? 'needs review'
                                                    : duplicateSource === 'inventory' ? 'already owned'
                                                        : duplicateSource === 'scan' ? 'duplicate scan'
                                                            : 'ready to import';
                                        return (
                                            <li key={r.id} className="group flex items-center gap-1">
                                                <button
                                                    onClick={() => setSelectedId(r.id)}
                                                    className={cn('flex min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-left transition-colors', selectedId === r.id ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-surface-2')}
                                                >
                                                    {r.status === 'failed' && <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-destructive" />}
                                                    {(blocked || duplicateSource) && <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-warning" />}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate text-sm font-medium text-foreground">{r.status === 'success' ? (r.echo?.setName ?? r.echo?.name ?? r.imageName) : r.imageName}</div>
                                                        <div className={cn('truncate text-xs', (blocked || duplicateSource) ? 'text-warning' : 'text-muted-foreground')}>{fmt(r.timestamp)} · {statusLabel}</div>
                                                    </div>
                                                </button>
                                                <button
                                                    onClick={() => deleteEntry(r.id)}
                                                    title="Delete"
                                                    className="flex-shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </ScrollArea>
                        )}
                    </CardContent>
                </Card>

                {/* Detail */}
                <Card className="flex min-h-0 flex-col lg:col-span-2">
                    <CardHeader><CardTitle>{selected ? selected.imageName : 'Details'}</CardTitle></CardHeader>
                    <CardContent className="min-h-0 flex-1 overflow-auto scrollbar-thin">
                        {!selected ? (
                            <EmptyState icon={ImageIcon} title="Select a scan" description="Pick a scan from the history to inspect its parsed stats." />
                        ) : (
                            <div className="space-y-4">
                                {selected.previewUrl && (
                                    <img src={selected.previewUrl} alt={selected.imageName} className="max-h-64 w-full rounded-md border border-border object-contain" />
                                )}

                                {selected.status === 'failed' ? (
                                    <div className="space-y-2">
                                        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                                            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                                            <span>{selected.error}</span>
                                        </div>
                                        {selected.rawText && (
                                            <details className="rounded-md border border-border bg-surface p-2.5">
                                                <summary className="cursor-pointer text-xs text-muted-foreground">Raw OCR text (even a rejected scan can be inspected)</summary>
                                                <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-foreground">{selected.rawText}</pre>
                                            </details>
                                        )}
                                    </div>
                                ) : selected.echo && (
                                    <div className="space-y-3">
                                        <div className="rounded-md border border-border bg-surface p-3">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium text-foreground">{selected.echo.name}{selected.echo.level != null ? ` +${selected.echo.level}` : ''}</span>
                                                <div className="flex gap-1">
                                                    {selected.autoImported && <Badge variant="secondary">Auto-imported</Badge>}
                                                    {!selected.autoImported && hasBlockingIssues(mapScannedEchoToGearDraft(selected.echo, data.gearCatalog)) && (
                                                        <Badge variant="warning">Needs review</Badge>
                                                    )}
                                                    {selectedDuplicateSource === 'inventory' && <Badge variant="warning">Already owned</Badge>}
                                                    {selectedDuplicateSource === 'scan' && <Badge variant="warning">Duplicate scan</Badge>}
                                                    {selected.echo.cost > 0 && <Badge variant="secondary">Cost {selected.echo.cost}</Badge>}
                                                </div>
                                            </div>
                                            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                                                <div>Main: <span className="text-foreground">{fmtStat(selected.echo.mainStat.type, selected.echo.mainStat.value)}</span></div>
                                                {selected.echo.setName && <div className="text-primary">Set: {selected.echo.setName}</div>}
                                                {selected.echo.equippedByCharacterName && <div>Equipped by: <span className="text-foreground">{selected.echo.equippedByCharacterName}</span></div>}
                                                <div>Confidence: <span className="text-foreground">{Math.round(selected.echo.confidence)}%</span></div>
                                            </div>
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {selected.echo.subStats.map((s, si) => <Badge key={si} variant="outline">{fmtStat(s.type, s.value)}</Badge>)}
                                            </div>
                                        </div>
                                        {selected.autoImported ? (
                                            <p className="text-xs text-muted-foreground">Already added to inventory via Auto import from latest.</p>
                                        ) : (
                                            <Button
                                                onClick={() => useWindowStore.getState().openWindow(
                                                    'Confirm scanned gear',
                                                    <ConfirmScannedGearWindow echo={selected.echo!} previewUrl={selected.previewUrl} onDone={() => useWindowStore.getState().closeWindow()} />,
                                                )}
                                            >
                                                Add to inventory
                                            </Button>
                                        )}
                                    </div>
                                )}

                                {selected.echo?.rawText && (
                                    <details className="rounded-md border border-border bg-surface p-3">
                                        <summary className="cursor-pointer text-sm text-muted-foreground">Raw OCR text</summary>
                                        <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-foreground">{selected.echo.rawText}</pre>
                                    </details>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
