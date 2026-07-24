import * as React from 'react';
import { Minus, Square, X } from 'lucide-react';
import { hasElectronBridge } from '@/lib/platform';

/**
 * Frameless-window min/max/close controls. Electron-only — a browser tab
 * already has its own window chrome, so this renders nothing at all in the
 * web build rather than showing controls that'd no-op.
 */
function invokeWindow(method: string): void {
    const api = (window as unknown as { frequencyManager?: Record<string, undefined | (() => void)> }).frequencyManager;
    const fn = api?.[method];
    if (typeof fn === 'function') fn();
}

const btn = 'inline-flex h-8 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground';

export function WindowControls() {
    if (!hasElectronBridge()) return null;
    return (
        <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button aria-label="Minimize" className={btn} onClick={() => invokeWindow('windowMinimize')}>
                <Minus className="h-4 w-4" />
            </button>
            <button aria-label="Maximize" className={btn} onClick={() => invokeWindow('windowMaximize')}>
                <Square className="h-3 w-3" />
            </button>
            <button aria-label="Close" className={`${btn} hover:bg-destructive hover:text-destructive-foreground`} onClick={() => invokeWindow('windowClose')}>
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
