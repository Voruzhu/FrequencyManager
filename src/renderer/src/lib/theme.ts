/**
 * @fileoverview Runtime theming for the renderer.
 *
 * WHY: The theme presets used to be a no-op — switching a theme only persisted a
 * name and never wrote anything to the DOM. This module is the missing applier:
 * each preset is a full set of color ROLES expressed as space-separated RGB
 * channels ("R G B"), and `applyPreset` writes them as CSS custom properties on
 * <html> so every `rgb(var(--role) / <alpha>)` Tailwind color updates live.
 *
 * Presets are data (not precompiled CSS) so user-defined presets can be added at
 * runtime via the theme store.
 */

import type { ThemePreset, ThemeRole } from '../types';

/** Canonical list of color roles a preset must define. */
export const ROLE_KEYS: ThemeRole[] = [
    'background', 'foreground', 'surface', 'surface-2',
    'card', 'card-foreground', 'popover', 'popover-foreground',
    'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
    'muted', 'muted-foreground', 'border', 'input', 'ring',
    'destructive', 'destructive-foreground',
    'success', 'success-foreground', 'warning', 'warning-foreground',
];

/** Built-in presets. Channel strings are space-separated RGB, e.g. "15 17 21". */
export const PRESETS: ThemePreset[] = [
    {
        name: 'midnight',
        label: 'Midnight',
        appearance: 'dark',
        roles: {
            background: '15 17 21', foreground: '230 232 235',
            surface: '23 26 33', 'surface-2': '31 36 45',
            card: '23 26 33', 'card-foreground': '230 232 235',
            popover: '31 36 45', 'popover-foreground': '230 232 235',
            primary: '59 130 246', 'primary-foreground': '255 255 255',
            secondary: '40 46 57', 'secondary-foreground': '226 232 240',
            muted: '40 46 57', 'muted-foreground': '148 163 184',
            border: '42 48 60', input: '42 48 60', ring: '59 130 246',
            destructive: '239 68 68', 'destructive-foreground': '255 255 255',
            success: '34 197 94', 'success-foreground': '255 255 255',
            warning: '234 179 8', 'warning-foreground': '20 20 20',
        },
    },
    {
        name: 'neon',
        label: 'Neon',
        appearance: 'dark',
        roles: {
            background: '10 10 15', foreground: '240 240 240',
            surface: '18 18 27', 'surface-2': '26 26 38',
            card: '18 18 27', 'card-foreground': '240 240 240',
            popover: '26 26 38', 'popover-foreground': '240 240 240',
            primary: '192 38 211', 'primary-foreground': '255 255 255',
            secondary: '34 34 48', 'secondary-foreground': '230 230 240',
            muted: '34 34 48', 'muted-foreground': '150 150 180',
            border: '44 44 62', input: '44 44 62', ring: '217 70 239',
            destructive: '255 51 102', 'destructive-foreground': '255 255 255',
            success: '0 200 130', 'success-foreground': '10 10 15',
            warning: '245 200 50', 'warning-foreground': '20 20 20',
        },
    },
    {
        name: 'light',
        label: 'Light',
        appearance: 'light',
        roles: {
            background: '248 249 250', foreground: '26 26 46',
            surface: '255 255 255', 'surface-2': '241 243 245',
            card: '255 255 255', 'card-foreground': '26 26 46',
            popover: '255 255 255', 'popover-foreground': '26 26 46',
            primary: '37 99 235', 'primary-foreground': '255 255 255',
            secondary: '241 243 245', 'secondary-foreground': '26 26 46',
            muted: '241 243 245', 'muted-foreground': '100 116 139',
            border: '226 232 240', input: '214 220 228', ring: '37 99 235',
            destructive: '220 38 38', 'destructive-foreground': '255 255 255',
            success: '22 163 74', 'success-foreground': '255 255 255',
            warning: '217 119 6', 'warning-foreground': '255 255 255',
        },
    },
    {
        name: 'amber',
        label: 'Amber',
        appearance: 'dark',
        roles: {
            background: '28 24 18', foreground: '254 243 199',
            surface: '38 32 23', 'surface-2': '48 40 29',
            card: '38 32 23', 'card-foreground': '254 243 199',
            popover: '48 40 29', 'popover-foreground': '254 243 199',
            primary: '245 158 11', 'primary-foreground': '30 20 5',
            secondary: '56 47 34', 'secondary-foreground': '254 243 199',
            muted: '56 47 34', 'muted-foreground': '168 146 111',
            border: '66 56 40', input: '66 56 40', ring: '245 158 11',
            destructive: '239 68 68', 'destructive-foreground': '255 255 255',
            success: '34 197 94', 'success-foreground': '20 20 20',
            warning: '234 179 8', 'warning-foreground': '20 20 20',
        },
    },
];

/** Look up a preset by name. */
export function getPreset(name: string): ThemePreset | undefined {
    return PRESETS.find((p) => p.name === name);
}

/**
 * Write a preset's roles to <html> as CSS custom properties, toggle the `dark`
 * class + native color-scheme, and stamp `data-theme` for debugging.
 */
export function applyPreset(preset: ThemePreset): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    for (const role of ROLE_KEYS) {
        const value = preset.roles[role];
        if (value) root.style.setProperty(`--${role}`, value);
    }
    root.style.setProperty('--radius', preset.radius ?? '0.375rem');
    root.classList.toggle('dark', preset.appearance !== 'light');
    root.style.colorScheme = preset.appearance;
    root.setAttribute('data-theme', preset.name);
}

const STORAGE_KEY = 'fm-theme-store';

/**
 * Apply the persisted theme BEFORE React renders, to avoid a flash of the
 * default theme (FOUC). Called at the top of main.tsx. Reads the zustand-persist
 * blob directly ({ state: { theme }, version }); falls back to the first preset.
 */
export function initThemeFromStorage(): void {
    let name = PRESETS[0].name;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as { state?: { theme?: string }; theme?: string };
            name = parsed?.state?.theme ?? parsed?.theme ?? name;
        }
    } catch {
        /* ignore malformed storage; fall back to default */
    }
    applyPreset(getPreset(name) ?? PRESETS[0]);
}
