import { create } from 'zustand';
import type { ReactNode } from 'react';

/**
 * Generic popup-window host. Any feature can open a modal window with a title and
 * arbitrary content via `openWindow(title, <SomeComponent/>)`. A single
 * <WindowHost/> (mounted in AppShell) renders whatever is set here, so this is
 * reusable across the app — not tied to the enemy config.
 */
interface WindowState {
    open: boolean;
    title: string;
    content: ReactNode | null;
    /** Most windows are content-sized (max-w-lg); a few (wide tables,
     * side-by-side comparisons) need more horizontal room. Opt-in per call
     * so every existing `openWindow(title, content)` call site is unaffected. */
    wide: boolean;
    openWindow: (title: string, content: ReactNode, options?: { wide?: boolean }) => void;
    closeWindow: () => void;
}

export const useWindowStore = create<WindowState>((set) => ({
    open: false,
    title: '',
    content: null,
    wide: false,
    openWindow: (title, content, options) => set({ open: true, title, content, wide: options?.wide ?? false }),
    closeWindow: () => set({ open: false, content: null }),
}));
