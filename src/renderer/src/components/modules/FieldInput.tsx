import { useEffect } from 'react';
import type { FieldSpec, RotationStepSpec } from '../../types';
import { RotationBuilder } from './RotationBuilder';
import { useModuleStore } from '../../stores/moduleStore';

interface FieldInputProps {
    field: FieldSpec;
    value: unknown;
    onChange: (value: unknown) => void;
    disabled?: boolean;
}

/**
 * Renders a single input for any `FieldSpec`. This is the game-agnostic
 * form control layer — modules describe WHAT to ask for, this component
 * decides HOW to render it.
 *
 * When `field.source === 'state'` and `field.statePath` is provided, the
 * input is two-way bound to the shared state store: external writes to
 * that path propagate here, and local edits propagate back. Validation
 * is enforced via `field.gameRule` (clamping).
 */
export function FieldInput({ field, value, onChange, disabled }: FieldInputProps) {
    const shared = useModuleStore((s) => s.shared);

    // State binding: keep value in sync with shared state when sourced
    useEffect(() => {
        if (field.source !== 'state' || !field.statePath) return;
        const stored = shared.get(field.statePath);
        if (stored !== undefined && stored !== value) {
            onChange(stored);
        }
        const unsub = shared.subscribe(field.statePath, (v) => {
            if (v !== value) onChange(v);
        });
        return unsub;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [field.statePath, field.source]);
    const baseInputClasses = 'w-full px-3 py-2 bg-bg border border-muted/20 rounded-lg text-fg placeholder-muted/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

    switch (field.type) {
        case 'text':
            return (
                <input
                    type="text"
                    className={baseInputClasses}
                    placeholder={field.placeholder}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                />
            );

        case 'number':
            return (
                <input
                    type="number"
                    className={baseInputClasses}
                    placeholder={field.placeholder}
                    value={value !== undefined && value !== null ? String(value) : ''}
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    onChange={(e) => {
                        const v = e.target.value;
                        onChange(v === '' ? null : Number(v));
                    }}
                    disabled={disabled}
                />
            );

        case 'boolean':
            return (
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <span
                        role="switch"
                        aria-checked={!!value}
                        className={`relative inline-block w-10 h-6 rounded-full transition-colors ${value ? 'bg-accent' : 'bg-muted/30'}`}
                        onClick={() => !disabled && onChange(!value)}
                    >
                        <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-4' : ''}`}
                        />
                    </span>
                    <span className="text-sm text-fg">{value ? 'Enabled' : 'Disabled'}</span>
                </label>
            );

        case 'select':
            return (
                <select
                    className={baseInputClasses}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                >
                    <option value="" disabled>Select…</option>
                    {(field.options ?? []).map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            );

        case 'multiselect':
            return (
                <div className="flex flex-wrap gap-2">
                    {(field.options ?? []).map((opt) => {
                        const arr = Array.isArray(value) ? (value as string[]) : [];
                        const selected = arr.includes(opt.value);
                        return (
                            <button
                                type="button"
                                key={opt.value}
                                onClick={() => {
                                    const next = selected
                                        ? arr.filter((v) => v !== opt.value)
                                        : [...arr, opt.value];
                                    onChange(next);
                                }}
                                className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${selected
                                    ? 'bg-accent/20 border-accent text-accent'
                                    : 'bg-bg border-muted/20 text-muted hover:border-muted/40'
                                    }`}
                                disabled={disabled}
                            >
                                {opt.label}
                            </button>
                        );
                    })}
                </div>
            );

        case 'file':
        case 'image':
            return (
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        className={baseInputClasses}
                        placeholder={field.placeholder ?? 'No file selected'}
                        value={typeof value === 'string' ? value : ''}
                        readOnly
                    />
                    <button
                        type="button"
                        onClick={async () => {
                            const bridge = (window as unknown as { frequencyManager?: { openImageDialog?: () => Promise<string | null> } }).frequencyManager;
                            const path = bridge?.openImageDialog ? await bridge.openImageDialog() : null;
                            if (path) onChange(path);
                        }}
                        className="px-3 py-2 bg-muted/10 border border-muted/20 rounded-lg text-fg text-sm hover:bg-muted/20 transition-colors"
                        disabled={disabled}
                    >
                        Browse
                    </button>
                </div>
            );

        case 'rotation':
            return (
                <RotationBuilder
                    field={field}
                    value={value as RotationStepSpec[]}
                    onChange={onChange}
                    disabled={disabled}
                />
            );

        default:
            return (
                <input
                    type="text"
                    className={baseInputClasses}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                />
            );
    }
}
