import { cn } from '@/lib/utils';

/**
 * A plain div-based progress bar — no Radix dependency needed for something
 * this simple (see the barrel's "deliberately not added" note for the same
 * reasoning applied to other components). `value` is a percent (0-100);
 * omit it (or pass `undefined`) for an indeterminate state (a sliding
 * shimmer) when there's a task running but no known total yet.
 */
function Progress({ value, className, ...props }: { value?: number } & React.HTMLAttributes<HTMLDivElement>) {
    const clamped = value == null ? null : Math.max(0, Math.min(100, value));
    return (
        <div
            role="progressbar"
            aria-valuenow={clamped ?? undefined}
            aria-valuemin={0}
            aria-valuemax={100}
            className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-2', className)}
            {...props}
        >
            {clamped == null ? (
                <div className="h-full w-full animate-pulse rounded-full bg-primary/60" />
            ) : (
                <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${clamped}%` }} />
            )}
        </div>
    );
}

export { Progress };
