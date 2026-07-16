import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { userStorage } from '../lib/userStorage';

/** Logical CPU count the renderer sees — used both as the optimizer's
 * default thread count and as the max a user can set it to (more workers
 * than cores just adds scheduling overhead, never more real throughput).
 * `navigator.hardwareConcurrency` is occasionally `0`/`undefined` on some
 * platforms; 4 is a conservative fallback that's still real parallelism. */
export const LOGICAL_CORES = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;

/** App-level preferences that aren't theming. Persisted across restarts. */
interface SettingsState {
    /** How many optimizer loadouts to display (was the calculator's "Show top N"). */
    loadoutCount: number;
    setLoadoutCount: (n: number) => void;

    /** How many Web Worker threads the loadout optimizer spreads its
     * combinatorial search across (Settings > Calculator > "Optimizer
     * threads") — trades CPU/battery use for speed on large gear pools.
     * Defaults to one less than the machine's logical core count, leaving
     * a core free for the UI thread itself. */
    optimizerThreads: number;
    setOptimizerThreads: (n: number) => void;

    /** GitHub repo "owner/name" checked for app releases. */
    updateAppRepo: string;
    setUpdateAppRepo: (v: string) => void;
    /** URL of the remote game-definitions update manifest. */
    updateManifestUrl: string;
    setUpdateManifestUrl: (v: string) => void;

    /** Global hotkey (Electron accelerator string) that captures the screen
     * and OCR-scans it, even while another app (the game) has focus. */
    scanHotkey: string;
    setScanHotkey: (v: string) => void;

    /** Manual "always capture THIS monitor" override for OCR scan capture
     * (Settings → Scanner → Capture display) — `null` means "auto" (window-
     * title matching, falling back to the primary display). Needed because
     * on a multi-monitor setup, automatic detection can fail to find the
     * game (e.g. it runs exclusive-fullscreen, which isn't always
     * enumerable as a capturable window) and the auto-fallback only tries
     * the primary display, which may not be where the game actually runs. */
    captureDisplayId: number | null;
    setCaptureDisplayId: (id: number | null) => void;
}

const DEFAULT_SCAN_HOTKEY = 'Alt+Shift+S';

/** Main process owns the actual `globalShortcut` registration (renderer-only
 * APIs can't register OS-wide hotkeys) — every change gets pushed through. */
const pushScanHotkeyToMain = (v: string) => {
    (window as unknown as { frequencyManager?: { setScanHotkey?: (accelerator: string) => void } })
        .frequencyManager?.setScanHotkey?.(v);
};

/** Main process owns the actual `desktopCapturer`/`screen` calls — every
 * change gets pushed through, same pattern as the scan hotkey above. */
const pushCaptureDisplayToMain = (id: number | null) => {
    (window as unknown as { frequencyManager?: { setCaptureDisplay?: (id: number | null) => void } })
        .frequencyManager?.setCaptureDisplay?.(id);
};

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            loadoutCount: 5,
            setLoadoutCount: (n) => set({ loadoutCount: Math.max(1, Math.min(20, Math.round(n) || 1)) }),

            optimizerThreads: Math.max(1, LOGICAL_CORES - 1),
            setOptimizerThreads: (n) => set({ optimizerThreads: Math.max(1, Math.min(LOGICAL_CORES, Math.round(n) || 1)) }),

            updateAppRepo: '',
            setUpdateAppRepo: (v) => set({ updateAppRepo: v.trim() }),
            updateManifestUrl: '',
            setUpdateManifestUrl: (v) => set({ updateManifestUrl: v.trim() }),

            scanHotkey: DEFAULT_SCAN_HOTKEY,
            setScanHotkey: (v) => {
                const next = v.trim() || DEFAULT_SCAN_HOTKEY;
                pushScanHotkeyToMain(next);
                set({ scanHotkey: next });
            },

            captureDisplayId: null,
            setCaptureDisplayId: (id) => {
                pushCaptureDisplayToMain(id);
                set({ captureDisplayId: id });
            },
        }),
        {
            name: 'fm-settings',
            storage: createJSONStorage(() => userStorage),
            // Sync main's hotkey registration to whatever was actually persisted
            // (which may differ from the DEFAULT_SCAN_HOTKEY main registers at
            // boot) as soon as this store finishes hydrating from disk.
            onRehydrateStorage: () => (state) => {
                if (state?.scanHotkey) pushScanHotkeyToMain(state.scanHotkey);
                if (state?.captureDisplayId != null) pushCaptureDisplayToMain(state.captureDisplayId);
            },
        }
    )
);
