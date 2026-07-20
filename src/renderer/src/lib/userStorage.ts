import type { StateStorage } from 'zustand/middleware';

/**
 * A zustand `StateStorage` backed by the main-process FileStorage (a JSON file
 * under userData, exposed via `storage:*` IPC). WHY not localStorage: durable
 * user data (saved builds, settings, later inventory + scan history) belongs in
 * ONE file we own — it survives restarts, sits outside the renderer origin, and
 * makes the upcoming JSON export/import trivial (it's just that file). Falls
 * back to localStorage when the bridge is unavailable (dev-in-browser).
 */
// `typeof window === 'undefined'` guard: this module only ever actually RUNS
// in the renderer (where `window` always exists) — the guard exists purely so
// a persisted store's mutating actions don't crash the process (an unhandled
// promise rejection from a synchronous ReferenceError) when unit-tested under
// this project's `testEnvironment: 'node'` jest config, which has no `window`.
const bridge = () => (typeof window === 'undefined' ? undefined : (window as unknown as {
    frequencyManager?: {
        storageGet?: <T = unknown>(key: string, fallback?: T) => Promise<T>;
        storageSet?: (key: string, value: unknown) => Promise<boolean>;
        storageDelete?: (key: string) => Promise<boolean>;
    };
}).frequencyManager);

export const userStorage: StateStorage = {
    getItem: async (name) => {
        const b = bridge();
        if (b?.storageGet) {
            const v = await b.storageGet<string | undefined>(name);
            return v ?? null;
        }
        try { return localStorage.getItem(name); } catch { return null; }
    },
    setItem: async (name, value) => {
        const b = bridge();
        if (b?.storageSet) { await b.storageSet(name, value); return; }
        try { localStorage.setItem(name, value); } catch { /* no-op */ }
    },
    removeItem: async (name) => {
        const b = bridge();
        if (b?.storageDelete) { await b.storageDelete(name); return; }
        try { localStorage.removeItem(name); } catch { /* no-op */ }
    },
};
