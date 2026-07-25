import { useState } from 'react';
import { Button } from './ui';
import { useCalcStore } from '../stores/calcStore';
import { decodeTargetsShareCode, type TargetSharePayload } from '@/lib/targetShare';
import { useWindowStore } from '../stores/windowStore';

let tseq = 0;
const nextId = () => `it${++tseq}`;

/** Paste box → decode → replace the current character's target list (confirm first if they already have targets set). */
export function ImportTargetsWindow() {
    const [text, setText] = useState('');
    const [payload, setPayload] = useState<TargetSharePayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const targets = useCalcStore((s) => s.targets);
    const setTargets = useCalcStore((s) => s.setTargets);
    const closeWindow = useWindowStore((s) => s.closeWindow);

    const decode = () => {
        const result = decodeTargetsShareCode(text);
        if (!result.ok) { setError(result.error); setPayload(null); return; }
        setError(null);
        setPayload(result.payload);
    };

    const apply = () => {
        if (!payload) return;
        setTargets(payload.map((t) => ({ ...t, id: nextId() })));
        closeWindow();
    };

    if (payload) {
        return (
            <div className="space-y-3">
                {targets.length > 0 && (
                    <p className="text-sm text-warning">This replaces your current {targets.length} target{targets.length === 1 ? '' : 's'} for this character.</p>
                )}
                <div className="space-y-1.5">
                    {payload.map((t, i) => (
                        <div key={i} className="flex items-center justify-between rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm">
                            <span className="text-foreground">{t.mode === 'max' ? 'Maximize' : 'Minimum'} {t.label}</span>
                            {t.mode === 'min' && <span className="tabular-nums text-muted-foreground">≥ {t.min ?? 0}</span>}
                        </div>
                    ))}
                </div>
                <Button onClick={apply}>Apply {payload.length} target{payload.length === 1 ? '' : 's'}</Button>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste a target config code here…"
                className="h-28 w-full rounded-md border border-input bg-surface p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground scrollbar-thin"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button onClick={decode} disabled={!text.trim()}>Preview targets</Button>
        </div>
    );
}
