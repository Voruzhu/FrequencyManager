import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DevToolsEvent, RPCRequest, RPCResponse } from '../types';

interface DevState {
    devMode: boolean;
    events: DevToolsEvent[];
    rpcLog: (RPCRequest | RPCResponse)[];
    toggleDevMode: () => void;
    addEvent: (event: DevToolsEvent) => void;
    addRpcRequest: (req: RPCRequest) => void;
    addRpcResponse: (res: RPCResponse) => void;
    clearEvents: () => void;
    clearRpcLog: () => void;
}

export const useDevStore = create<DevState>()(
    persist(
        (set) => ({
            devMode: false,
            events: [],
            rpcLog: [],
            toggleDevMode: () => set(state => ({ devMode: !state.devMode })),
            addEvent: (event) => set(state => ({
                events: [...state.events.slice(-999), event],
            })),
            addRpcRequest: (req) => set(state => ({
                rpcLog: [...state.rpcLog.slice(-499), req],
            })),
            addRpcResponse: (res) => set(state => ({
                rpcLog: [...state.rpcLog.slice(-499), res],
            })),
            clearEvents: () => set({ events: [] }),
            clearRpcLog: () => set({ rpcLog: [] }),
        }),
        { name: 'fm-dev-store', partialize: state => ({ devMode: state.devMode }) }
    )
);