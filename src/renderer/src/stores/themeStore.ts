import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemePreset } from '../types';
import { PRESETS, applyPreset } from '../lib/theme';

interface ThemeState {
    theme: string;
    presets: ThemePreset[];
    setTheme: (name: string) => void;
    addPreset: (preset: ThemePreset) => void;
    removePreset: (name: string) => void;
    getPreset: (name: string) => ThemePreset | undefined;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            theme: PRESETS[0].name,
            presets: PRESETS,
            setTheme: (name) => {
                const preset = get().presets.find((p) => p.name === name);
                if (preset) {
                    applyPreset(preset); // write CSS vars to the DOM immediately
                    set({ theme: name });
                }
            },
            addPreset: (preset) =>
                set((state) => ({
                    presets: [...state.presets.filter((p) => p.name !== preset.name), preset],
                })),
            removePreset: (name) =>
                set((state) => ({
                    presets: state.presets.filter((p) => p.name !== name),
                    theme: state.theme === name ? PRESETS[0].name : state.theme,
                })),
            getPreset: (name) => get().presets.find((p) => p.name === name),
        }),
        {
            name: 'fm-theme-store',
            // v2: presets carry full role sets now. Only persist the selected theme
            // NAME — presets always come from code — so an old persisted `presets`
            // array (6-color shape) can never override the new role-based presets.
            version: 2,
            partialize: (s) => ({ theme: s.theme }),
            migrate: (persisted) => ({ theme: (persisted as { theme?: string })?.theme ?? PRESETS[0].name }),
            onRehydrateStorage: () => (state) => {
                if (state) {
                    const preset = state.presets.find((p) => p.name === state.theme) ?? state.presets[0];
                    applyPreset(preset);
                }
            },
        }
    )
);
