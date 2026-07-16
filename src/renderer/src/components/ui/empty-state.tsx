import * as React from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
    icon?: LucideIcon;
    title: string;
    description?: React.ReactNode;
    /** Optional action node (e.g. a Button). */
    action?: React.ReactNode;
}

/** Consistent empty/placeholder state used across screens. */
export function EmptyState({ icon: Icon, title, description, action, className, ...props }: EmptyStateProps) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-10 text-center',
                className
            )}
            {...props}
        >
            {Icon && (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-surface-2">
                    <Icon className="h-6 w-6 text-muted-foreground" />
                </div>
            )}
            <div className="space-y-1">
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                {description && (
                    <p className="mx-auto max-w-sm text-xs text-muted-foreground">{description}</p>
                )}
            </div>
            {action}
        </div>
    );
}
