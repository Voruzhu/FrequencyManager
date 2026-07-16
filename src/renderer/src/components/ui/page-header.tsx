import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
    title: string;
    description?: React.ReactNode;
    /** Right-aligned actions (buttons, selects). */
    actions?: React.ReactNode;
}

/** Standard screen header: title + description on the left, actions on the right. */
export function PageHeader({ title, description, actions, className, ...props }: PageHeaderProps) {
    return (
        <div
            className={cn(
                'flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4',
                className
            )}
            {...props}
        >
            <div className="min-w-0 space-y-1">
                <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
        </div>
    );
}
