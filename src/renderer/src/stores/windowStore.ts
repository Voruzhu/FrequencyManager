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
    openWindow: (title: string, content: ReactNode) => void;
    closeWindow: () => void;
}

export const useWindowStore = create<WindowState>((set) => ({
    open: false,
    title: '',
    content: null,
    openWindow: (title, content) => set({ open: true, title, content }),
    closeWindow: () => set({ open: false, content: null }),
}));
