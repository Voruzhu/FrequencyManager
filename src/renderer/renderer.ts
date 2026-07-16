/**
 * @fileoverview Renderer Bootstrap Script
 * @module src/renderer/renderer
 *
 * Runs in the Electron renderer process. Has NO Node access — every
 * privileged operation must go through `window.frequencyManager`, which is
 * injected by `src/preload/preload.ts` via `contextBridge`.
 *
 * Responsibilities:
 *   1. Verify the preload bridge is present (sanity check).
 *   2. Wire UI controls to bridge methods.
 *   3. Render module list + health status reactively.
 *   4. Subscribe to kernel events for live updates.
 *
 * @packageDocumentation
 *
 * NOTE: Type augmentations for `window.frequencyManager` live in
 * `src/renderer/global.d.ts` so they apply globally without conflicting with
 * the built-in `Window` interface declared by the DOM lib.
 */
import type { ModuleInfo } from './global';

const statusEl = document.getElementById('status') as HTMLDivElement | null;
const modulesEl = document.getElementById('modules') as HTMLUListElement | null;
const refreshBtn = document.getElementById('refresh-btn') as HTMLButtonElement | null;
const healthBtn = document.getElementById('health-btn') as HTMLButtonElement | null;

/**
 * WHY this guard exists:
 *   In dev mode we sometimes load this script directly in a plain browser
 *   (e.g. for visual testing). We want a clear, visible error instead of a
 *   silent crash with `Cannot read properties of undefined`.
 */
function assertBridge(): void {
    if (!window.frequencyManager) {
        throw new Error(
            'Preload bridge missing. Did you forget contextIsolation settings in electron-main.ts?',
        );
    }
}

assertBridge();

function setStatus(text: string, kind: 'ok' | 'error' | 'neutral' = 'neutral'): void {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.remove('ok', 'error');
    if (kind === 'ok') statusEl.classList.add('ok');
    if (kind === 'error') statusEl.classList.add('error');
}

function renderModules(modules: ModuleInfo[]): void {
    if (!modulesEl) return;
    modulesEl.innerHTML = '';
    if (modules.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No modules loaded.';
        modulesEl.appendChild(li);
        return;
    }
    for (const m of modules) {
        const li = document.createElement('li');
        const name = document.createElement('span');
        name.textContent = `${m.name} (${m.id})`;
        const meta = document.createElement('span');
        meta.textContent = `v${m.version} · ${m.health}`;
        li.appendChild(name);
        li.appendChild(meta);
        modulesEl.appendChild(li);
    }
}

async function refreshModules(): Promise<void> {
    setStatus('Loading modules…');
    try {
        const modules = await window.frequencyManager.listModules();
        renderModules(modules);
        setStatus(`Loaded ${modules.length} module(s).`, 'ok');
    } catch (error) {
        setStatus(`Failed to load modules: ${(error as Error).message}`, 'error');
    }
}

async function checkHealth(): Promise<void> {
    setStatus('Checking health…');
    try {
        const health = await window.frequencyManager.health();
        setStatus(
            `Kernel ${health.status}${health.error ? ` — ${health.error}` : ''}`,
            health.status === 'healthy' ? 'ok' : 'error',
        );
    } catch (error) {
        setStatus(`Health check failed: ${(error as Error).message}`, 'error');
    }
}

refreshBtn?.addEventListener('click', () => {
    void refreshModules();
});

healthBtn?.addEventListener('click', () => {
    void checkHealth();
});

window.addEventListener('DOMContentLoaded', () => {
    void refreshModules();
});