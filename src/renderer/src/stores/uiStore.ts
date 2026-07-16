import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { userStorage } from '../lib/userStorage';

/**
 * Single source of truth for which screen the shell is showing. Previously the
 * active category lived in two independent `useGameUI` instances (App + ContentArea),
 * so they could disagree. The NavRail and Workspace both read/write this store.
 * The active screen is persisted so the app reopens where you left off.
 */
interface UIState {
    activeScreen: string;
    setActiveScreen: (id: string) => void;
}

export const useUIStore = create<UIState>()(
    persist(
        (set) => ({
            activeScreen: 'dashboard',
            setActiveScreen: (id) => set({ activeScreen: id }),
        }),
        { name: 'fm-ui', storage: createJSONStorage(() => userStorage) }
    )
);
