import * as React from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StatTileProps extends React.HTMLAttributes<HTMLDivElement> {
    label: string;
    value: React.ReactNode;
    /** Optional secondary line (e.g. delta, unit, subtitle). */
    hint?: React.ReactNode;
    icon?: LucideIcon;
    /** Accent tone for the value + icon. */
    tone?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
}

const toneText: Record<NonNullable<StatTileProps['tone']>, string> = {
    default: 'text-foreground',
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    destructive: 'text-destructive',
};

/**
 * Compact KPI/metric tile — the core building block of the Dashboard and the
 * Calculator results grid. Numbers use tabular-nums for stable alignment.
 */
export function StatTile({ label, value, hint, icon: Icon, tone = 'default', className, ...props }: StatTileProps) {
    return (
        <div
            className={cn('rounded-lg border border-border bg-card p-4 shadow-elevation-1', className)}
            {...props}
        >
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
                {Icon && <Icon className={cn('h-4 w-4 opacity-70', toneText[tone])} />}
            </div>
            <div className={cn('mt-2 text-2xl font-semibold tabular-nums leading-tight', toneText[tone])}>
                {value}
            </div>
            {hint != null && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
    );
}
