import { useEffect, useMemo, useState } from 'react';
import { useModuleStore } from '../../stores/moduleStore';
import type { ModuleInfo, ModuleUISpec, OutputSpec } from '../../types';
import { FieldInput } from './FieldInput';
import { ModuleOutputViewer } from './ModuleOutputViewer';

interface ModulePanelWrapperProps {
    module: ModuleInfo;
}

/**
 * Unified, game-agnostic panel chrome.
 *
 * Every module — WuWa damage calc, Genshin optimizer, JSON importer,
 * game loader, update checker — renders inside this same wrapper. The
 * module only contributes:
 *   1. A `ModuleUISpec` (fields, actions, outputs)
 *   2. Backend logic invoked via `moduleStore.executeAction()`
 *
 * The wrapper renders:
 *   - Header: icon, name, version, description, enable toggle
 *   - Form section: dynamic fields from `spec.fields`
 *   - Action bar: buttons from `spec.actions`
 *   - Output section: one viewer per `spec.outputs` entry with tabs
 */
export function ModulePanelWrapper({ module }: ModulePanelWrapperProps) {
    const {
        getUISpec,
        loadUISpec,
        executeAction,
        loadOutput,
        outputs,
        running,
        enableModule,
        disableModule,
    } = useModuleStore();

    const [values, setValues] = useState<Record<string, unknown>>({});
    const [error, setError] = useState<string | null>(null);
    const [busyAction, setBusyAction] = useState<string | null>(null);
    const [activeOutputTab, setActiveOutputTab] = useState<string | null>(null);

    // Try the kernel first; fall back to renderer-side defaults.
    const spec: ModuleUISpec | null = useMemo(() => getUISpec(module.id), [getUISpec, module.id]);

    useEffect(() => {
        if (!spec) {
            void loadUISpec(module.id);
        }
    }, [spec, loadUISpec, module.id]);

    // Initialize form defaults from spec
    useEffect(() => {
        if (!spec) return;
        const initial: Record<string, unknown> = {};
        for (const field of spec.fields) {
            if (field.default !== undefined) {
                initial[field.id] = field.default;
            }
        }
        setValues((prev) => ({ ...initial, ...prev }));
    }, [spec]);

    // Pre-load any existing outputs (kernel may have cached results)
    useEffect(() => {
        if (!spec) return;
        for (const out of spec.outputs) {
            void loadOutput(module.id, out.id);
        }
        // Set first output as active tab
        if (spec.outputs.length > 0 && !activeOutputTab) {
            setActiveOutputTab(spec.outputs[0].id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [spec, module.id]);

    const isBusy = !!running[module.id];
    const moduleOutputs = outputs[module.id] ?? {};

    const handleAction = async (actionId: string) => {
        if (!spec) return;
        const action = spec.actions.find((a) => a.id === actionId);
        if (!action) return;

        // Validate required fields
        for (const fieldId of action.requiresFields ?? []) {
            const field = spec.fields.find((f) => f.id === fieldId);
            if (!field) continue;
            const v = values[fieldId];
            const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
            if (field.required && empty) {
                setError(`"${field.label}" is required.`);
                return;
            }
        }

        if (action.confirmMessage && !window.confirm(action.confirmMessage)) {
            return;
        }

        setError(null);
        setBusyAction(actionId);
        try {
            await executeAction(module.id, actionId, values);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Action failed');
        } finally {
            setBusyAction(null);
        }
    };

    const handleEnableToggle = () => {
        if (module.enabled) {
            void disableModule(module.id);
        } else {
            void enableModule(module.id);
        }
    };

    const handleCopyOutput = (outputId: string) => {
        const outputData = moduleOutputs[outputId]?.data;
        if (outputData !== undefined) {
            navigator.clipboard.writeText(JSON.stringify(outputData, null, 2));
        }
    };

    const hasAnyOutput = spec?.outputs.some(out => moduleOutputs[out.id]?.data !== undefined) ?? false;

    if (!module.enabled) {
        return (
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-md">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-muted/10 flex items-center justify-center">
                        <ModuleIcon icon={module.icon} className="w-8 h-8 text-muted" />
                    </div>
                    <h3 className="text-xl font-medium text-fg mb-2">{module.name} is disabled</h3>
                    <p className="text-muted mb-4">Enable this module from the sidebar to use it.</p>
                    <button
                        onClick={handleEnableToggle}
                        className="px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition-opacity"
                    >
                        Enable module
                    </button>
                </div>
            </div>
        );
    }

    if (!spec) {
        return (
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="flex flex-col items-center gap-3 text-muted">
                    <Spinner className="w-8 h-8" />
                    <span className="text-sm">Loading module…</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            {/* ── Header ───────────────────────────────────────────────── */}
            <header className="px-6 py-4 border-b border-muted/15 bg-bg/30 flex-shrink-0">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                        <ModuleIcon icon={module.icon} className="w-6 h-6 text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                            <h1 className="text-xl font-semibold text-fg truncate">{module.name}</h1>
                            <span className="text-xs text-muted bg-muted/10 px-2 py-0.5 rounded">v{module.version}</span>
                            {module.tags && module.tags.length > 0 && (
                                <span className="text-xs text-muted/60 bg-muted/10 px-2 py-0.5 rounded">
                                    {module.tags.join(', ')}
                                </span>
                            )}
                        </div>
                        {module.description && (
                            <p className="text-sm text-muted mt-0.5">{module.description}</p>
                        )}
                    </div>
                </div>
            </header>

            {/* ── Body ─────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-auto min-h-0">
                <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
                    {error && (
                        <div className="p-3 border border-red-500/40 bg-red-500/10 rounded-lg text-sm text-red-300 flex items-center gap-2 animate-slide-in">
                            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            {error}
                        </div>
                    )}

                    {/* FORM section */}
                    {spec.fields.length > 0 && (
                        <section>
                            <SectionHeader title="Inputs" subtitle="Configure the parameters for this module" />
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                                {spec.fields.map((field) => (
                                    <div key={field.id} className="space-y-1.5">
                                        <label className="block text-sm font-medium text-fg">
                                            {field.label}
                                            {field.required && <span className="text-red-400 ml-0.5" aria-hidden="true">*</span>}
                                        </label>
                                        <FieldInput
                                            field={field}
                                            value={values[field.id]}
                                            onChange={(v) => setValues((s) => ({ ...s, [field.id]: v }))}
                                            disabled={isBusy}
                                        />
                                        {field.description && (
                                            <p className="text-xs text-muted">{field.description}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* ACTIONS bar */}
                    {spec.actions.length > 0 && (
                        <section>
                            <SectionHeader title="Actions" />
                            <div className="flex flex-wrap gap-2 mt-3">
                                {spec.actions.map((action) => {
                                    const style = action.style ?? 'secondary';
                                    const cls = actionClassFor(style);
                                    const busy = busyAction === action.id;
                                    return (
                                        <button
                                            key={action.id}
                                            onClick={() => handleAction(action.id)}
                                            disabled={isBusy}
                                            className={cls}
                                            title={action.description}
                                            aria-busy={busy}
                                        >
                                            {busy && <Spinner className="w-4 h-4" />}
                                            {action.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* OUTPUTS with tabs */}
                    {spec.outputs.length > 0 && (
                        <section className="space-y-4">
                            <div className="flex items-center justify-between">
                                <SectionHeader title="Output" subtitle={hasAnyOutput ? "Results from the most recent action" : "Run an action to generate output"} />
                                {hasAnyOutput && (
                                    <button
                                        onClick={() => {
                                            const currentOutput = spec.outputs.find(o => o.id === activeOutputTab);
                                            if (currentOutput) handleCopyOutput(currentOutput.id);
                                        }}
                                        className="px-3 py-1.5 text-xs text-muted hover:text-fg transition-colors rounded border border-muted/20 hover:border-muted/40"
                                        aria-label="Copy output to clipboard"
                                    >
                                        <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 012-2h10a2 2 0 012 2v1m-6 7h6m0 0l-3 3m3-3l3 3" />
                                        </svg>
                                        <span className="ml-1">Copy</span>
                                    </button>
                                )}
                            </div>

                            {/* Output tabs */}
                            {spec.outputs.length > 1 && (
                                <div className="flex gap-1 border-b border-muted/10 mb-3" role="tablist">
                                    {spec.outputs.map((out) => (
                                        <button
                                            key={out.id}
                                            onClick={() => setActiveOutputTab(out.id)}
                                            role="tab"
                                            aria-selected={activeOutputTab === out.id}
                                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeOutputTab === out.id
                                                    ? 'border-accent text-accent'
                                                    : 'border-transparent text-muted hover:text-fg hover:border-muted/20'
                                                }`}
                                        >
                                            {out.label}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Active output content */}
                            {(spec.outputs.length === 1 ? spec.outputs : spec.outputs.filter(o => o.id === activeOutputTab)).map((out) => (
                                <div key={out.id}>
                                    <div className="flex items-baseline gap-2 mb-2">
                                        <h3 className="text-sm font-semibold text-fg">{out.label}</h3>
                                        {out.description && (
                                            <span className="text-xs text-muted">{out.description}</span>
                                        )}
                                    </div>
                                    <ModuleOutputViewer
                                        spec={out}
                                        data={moduleOutputs[out.id]?.data}
                                    />
                                </div>
                            ))}
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Small building blocks ────────────────────────────────────────────────
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
    return (
        <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
            {subtitle && <p className="text-xs text-muted/70 mt-0.5">{subtitle}</p>}
        </div>
    );
}

function actionClassFor(style: 'primary' | 'secondary' | 'danger' | 'ghost'): string {
    const base = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    switch (style) {
        case 'primary':
            return `${base} bg-accent text-white hover:opacity-90`;
        case 'danger':
            return `${base} bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30`;
        case 'ghost':
            return `${base} text-fg hover:bg-muted/20`;
        case 'secondary':
        default:
            return `${base} bg-muted/10 text-fg border border-muted/20 hover:bg-muted/20`;
    }
}

function Spinner({ className = 'w-3.5 h-3.5' }: { className?: string }) {
    return (
        <span className={`inline-block ${className} border-2 border-current border-t-transparent rounded-full animate-spin`} />
    );
}

/**
 * Small built-in icon set used by the panel header and sidebar. We avoid
 * pulling in a full icon library — modules can ship their own icons if
 * they need something specific.
 */
function ModuleIcon({ icon, className }: { icon?: string; className?: string }) {
    const common = 'w-full h-full';
    switch (icon) {
        case 'calculator':
            return (
                <svg className={`${className} ${common}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="4" y="3" width="16" height="18" rx="2" />
                    <path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0M8 19h2M12 19h6" strokeLinecap="round" />
                </svg>
            );
        case 'scan':
            return (
                <svg className={`${className} ${common}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" strokeLinecap="round" />
                    <rect x="7" y="7" width="10" height="10" rx="1" />
                </svg>
            );
        case 'file':
            return (
                <svg className={`${className} ${common}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
                    <path d="M14 2v6h6M8 13h8M8 17h6" strokeLinecap="round" />
                </svg>
            );
        case 'refresh':
            return (
                <svg className={`${className} ${common}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            );
        case 'gamepad':
            return (
                <svg className={`${className} ${common}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M6 8h12a4 4 0 0 1 4 4v3a4 4 0 0 1-4 4 3 3 0 0 1-2.5-1.5L13.5 16h-3l-2 1.5A3 3 0 0 1 6 19a4 4 0 0 1-4-4v-3a4 4 0 0 1 4-4z" strokeLinejoin="round" />
                    <path d="M8 11v2M7 12h2M15 12h.01M17 11h.01M17 13h.01" strokeLinecap="round" />
                </svg>
            );
        default:
            return (
                <svg className={`${className} ${common}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="3" y="3" width="18" height="18" rx="3" />
                    <path d="M9 9h6v6H9z" strokeLinejoin="round" />
                </svg>
            );
    }
}
