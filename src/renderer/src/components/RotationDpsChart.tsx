import { useMemo } from 'react';
import { cumulativeDamageSeries } from '@/lib/rotationDpsChart';

const WIDTH = 600;
const HEIGHT = 140;
const PADDING = 8;

/** Hand-rolled cumulative-damage line chart — no charting dependency needed at rotation-step scale. */
export function RotationDpsChart({ elapsed, results }: { elapsed: number[]; results: Array<{ damage: number }> }) {
    const points = useMemo(() => cumulativeDamageSeries(elapsed, results), [elapsed, results]);
    if (points.length <= 1) return null;

    const maxT = Math.max(1, ...points.map((p) => p.t));
    const maxY = Math.max(1, ...points.map((p) => p.cumulative));
    const x = (t: number) => PADDING + (t / maxT) * (WIDTH - PADDING * 2);
    const y = (v: number) => HEIGHT - PADDING - (v / maxY) * (HEIGHT - PADDING * 2);
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.cumulative).toFixed(1)}`).join(' ');
    const last = points[points.length - 1];
    const areaPath = `${linePath} L ${x(last.t).toFixed(1)} ${HEIGHT - PADDING} L ${x(0).toFixed(1)} ${HEIGHT - PADDING} Z`;

    return (
        <div className="space-y-1.5">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Damage over time</div>
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="h-32 w-full rounded-md border border-border bg-surface">
                <path d={areaPath} className="fill-primary/10" />
                <path d={linePath} className="fill-none stroke-primary" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                {points.slice(1).map((p, i) => (
                    <circle key={i} cx={x(p.t)} cy={y(p.cumulative)} r={2.5} className="fill-primary" />
                ))}
            </svg>
            <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>0s</span>
                <span>{maxT.toFixed(1)}s</span>
            </div>
        </div>
    );
}
