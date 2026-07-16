import type { OutputSpec } from '../../types';

interface ModuleOutputViewerProps {
    spec: OutputSpec;
    data: unknown;
}

/**
 * Renders a single output channel. The format is decided by `spec.kind` so
 * a module only needs to declare its output type — the renderer handles
 * the presentation. Modules remain game-agnostic; outputs are pure data.
 */
export function ModuleOutputViewer({ spec, data }: ModuleOutputViewerProps) {
    if (data === null || data === undefined) {
        return (
            <div className="p-4 border border-dashed border-muted/20 rounded-lg text-center text-muted text-sm">
                No data yet — run an action to populate this output.
            </div>
        );
    }

    switch (spec.kind) {
        case 'stat': {
            return <StatView data={data as Record<string, unknown>} />;
        }
        case 'table': {
            return <TableView data={data as Record<string, unknown> | Array<Record<string, unknown>>} />;
        }
        case 'list': {
            return <ListView data={data as Array<unknown> | Record<string, unknown>} />;
        }
        case 'chart': {
            return (
                <div className="p-4 border border-muted/20 rounded-lg text-muted text-sm">
                    Chart visualization for {spec.label} (data: {JSON.stringify(data).slice(0, 80)}…)
                </div>
            );
        }
        case 'json': {
            return <JsonView data={data} />;
        }
        case 'image': {
            const url = typeof data === 'string' ? data : '';
            return (
                <div className="p-2 border border-muted/20 rounded-lg bg-muted/5">
                    {url ? (
                        <img src={url} alt={spec.label} className="max-w-full h-auto rounded" />
                    ) : (
                        <div className="text-muted text-sm p-4">No image</div>
                    )}
                </div>
            );
        }
        default:
            return <JsonView data={data} />;
    }
}

// ─── Stat tile grid ────────────────────────────────────────────────────────
function StatView({ data }: { data: Record<string, unknown> }) {
    const entries = Object.entries(data).filter(([, v]) => v !== null && v !== undefined);
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {entries.map(([key, value]) => {
                const isNumber = typeof value === 'number';
                return (
                    <div key={key} className="p-3 border border-muted/20 rounded-lg bg-bg/40">
                        <div className="text-xs text-muted uppercase tracking-wider mb-1">{humanize(key)}</div>
                        <div className={`text-lg font-semibold ${isNumber ? 'text-accent' : 'text-fg'}`}>
                            {isNumber ? formatNumber(value as number) : String(value)}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Generic table renderer ────────────────────────────────────────────────
function TableView({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
    const rows: Array<Record<string, unknown>> = Array.isArray(data) ? data : [data];
    if (rows.length === 0) {
        return <div className="text-muted text-sm">No rows</div>;
    }
    const columns = Object.keys(rows[0]);
    return (
        <div className="overflow-x-auto border border-muted/20 rounded-lg">
            <table className="w-full text-sm">
                <thead className="bg-muted/10 text-muted">
                    <tr>
                        {columns.map((c) => (
                            <th key={c} className="text-left px-3 py-2 font-medium uppercase text-xs tracking-wider">
                                {humanize(c)}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i} className="border-t border-muted/10 hover:bg-muted/5">
                            {columns.map((c) => (
                                <td key={c} className="px-3 py-2 text-fg">
                                    {formatCell(row[c])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ─── List renderer ─────────────────────────────────────────────────────────
function ListView({ data }: { data: Array<unknown> | Record<string, unknown> }) {
    if (Array.isArray(data)) {
        if (data.length === 0) return <div className="text-muted text-sm">Empty</div>;
        return (
            <ul className="space-y-1.5">
                {data.map((item, i) => (
                    <li key={i} className="px-3 py-2 bg-muted/5 border border-muted/10 rounded-md text-sm text-fg">
                        {formatCell(item)}
                    </li>
                ))}
            </ul>
        );
    }
    // Dict-shaped list (e.g. errors per row)
    return (
        <ul className="space-y-1.5">
            {Object.entries(data).map(([k, v]) => (
                <li key={k} className="px-3 py-2 bg-muted/5 border border-muted/10 rounded-md text-sm">
                    <span className="text-muted">{humanize(k)}:</span>{' '}
                    <span className="text-fg">{formatCell(v)}</span>
                </li>
            ))}
        </ul>
    );
}

// ─── JSON fallback ─────────────────────────────────────────────────────────
function JsonView({ data }: { data: unknown }) {
    return (
        <pre className="p-3 bg-muted/5 border border-muted/20 rounded-lg text-xs text-fg overflow-x-auto">
            {JSON.stringify(data, null, 2)}
        </pre>
    );
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function humanize(key: string): string {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (s) => s.toUpperCase())
        .replace(/_/g, ' ')
        .trim();
}

function formatNumber(n: number): string {
    if (!Number.isFinite(n)) return String(n);
    if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
    if (Number.isInteger(n)) return n.toLocaleString();
    return n.toFixed(2);
}

function formatCell(v: unknown): string {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') return formatNumber(v);
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
}