import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { Button, Badge } from './ui';

type AutoScanStep = 'focus' | 'detect-terminal' | 'esc' | 'character-menu' | 'click-icon' | 'sample-complete' | 'aborted';
type AutoScanStatus = 'running' | 'done' | 'error';
interface ProgressEvent { step: AutoScanStep; status: AutoScanStatus; message?: string }

const STEP_LABELS: Record<AutoScanStep, string> = {
    focus: 'Switching to Wuthering Waves',
    'detect-terminal': 'Checking you\'re on the Terminal menu',
    esc: 'Pressing Escape',
    'character-menu': 'Opening Character menu (C)',
    'click-icon': 'Opening the target section',
    'sample-complete': 'Done',
    aborted: 'Stopped',
};

type Bridge = {
    startAutoScanSample?: () => Promise<boolean>;
    on?: (event: string, handler: (payload: unknown) => void) => () => void;
};
const bridge = () => (window as unknown as { frequencyManager?: Bridge }).frequencyManager;

/** Instructions + Start button + live step-by-step status for the auto-scan
 * "first sample" — this only covers navigation (Terminal -> Character menu ->
 * target icon), not yet the per-echo capture+OCR loop. Windows/Electron only. */
export function AutoScanEchoesWindow() {
    const [running, setRunning] = useState(false);
    const [log, setLog] = useState<ProgressEvent[]>([]);
    const unsubRef = useRef<(() => void) | null>(null);

    useEffect(() => () => unsubRef.current?.(), []);

    const start = () => {
        setLog([]);
        setRunning(true);
        unsubRef.current?.();
        unsubRef.current = bridge()?.on?.('autoscan:progress', (payload) => {
            const event = payload as ProgressEvent;
            setLog((prev) => [...prev, event]);
            if (event.status !== 'running') {
                // Only 'sample-complete' or an error ends the sequence — every
                // other 'done' is an intermediate step, not the finish line.
                if (event.step === 'sample-complete' || event.status === 'error') {
                    setRunning(false);
                }
            }
        }) ?? null;
        void bridge()?.startAutoScanSample?.();
    };

    return (
        <div className="space-y-3">
            <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning">
                <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <div>
                        Before starting: in Wuthering Waves, press <span className="font-medium">Escape</span> until
                        you're on the <span className="font-medium">Terminal</span> menu (or already be there).
                        Once started, this switches focus to the game and sends it keystrokes/clicks automatically —
                        <span className="font-medium"> Alt+Tab away at any time to stop it immediately.</span>
                    </div>
                </div>
            </div>

            <p className="text-xs text-muted-foreground">
                This first pass only covers navigation (Terminal → Character menu → target section) — not yet the
                full per-echo scan loop.
            </p>

            <Button onClick={start} disabled={running} className="w-full">
                {running ? <><Loader2 className="animate-spin" /> Running…</> : 'Start'}
            </Button>

            {log.length > 0 && (
                <div className="space-y-1.5">
                    {log.map((e, i) => (
                        <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs">
                            {e.status === 'running' && <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-muted-foreground" />}
                            {e.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-success" />}
                            {e.status === 'error' && <XCircle className="h-3.5 w-3.5 flex-shrink-0 text-destructive" />}
                            <div className="min-w-0 flex-1">
                                <div className="text-foreground">{STEP_LABELS[e.step]}</div>
                                {e.message && <div className="text-muted-foreground">{e.message}</div>}
                            </div>
                            {e.status === 'error' && <Badge variant="destructive">Stopped</Badge>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
