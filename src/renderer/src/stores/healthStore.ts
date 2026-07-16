import { create } from 'zustand';
import type { HealthStatus } from '../types';

interface HealthState {
    healthChecks: HealthStatus[];
    lastUpdated: number;
    setHealthCheck: (check: HealthStatus) => void;
    removeHealthCheck: (module: string) => void;
    clearHealthChecks: () => void;
}

export const useHealthStore = create<HealthState>((set) => ({
    healthChecks: [],
    lastUpdated: 0,
    setHealthCheck: (check) => set((state) => ({
        healthChecks: [
            ...state.healthChecks.filter(h => h.module !== check.module),
            check,
        ],
        lastUpdated: Date.now(),
    })),
    removeHealthCheck: (module) => set((state) => ({
        healthChecks: state.healthChecks.filter(h => h.module !== module),
        lastUpdated: Date.now(),
    })),
    clearHealthChecks: () => set({
        healthChecks: [],
        lastUpdated: 0,
    }),
}));