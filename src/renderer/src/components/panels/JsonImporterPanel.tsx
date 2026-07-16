import { useState } from 'react';

interface ExportResult {
    ok: boolean;
    data?: string;
    error?: string;
}

interface ImportResult {
    ok: boolean;
    envelope?: unknown;
    error?: string;
}

export function JsonImporterPanel() {
    const [exportData, setExportData] = useState('');
    const [importData, setImportData] = useState('');
    const [exportResult, setExportResult] = useState<ExportResult | null>(null);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);

    const handleExport = async () => {
        setExporting(true);
        setExportResult(null);
        const bridge = (window as unknown as { frequencyManager?: { exportData?: (options?: { prettyPrint?: boolean; gameOverride?: { id: string; version: string; displayName: string } }) => Promise<ExportResult> } }).frequencyManager;
        if (bridge?.exportData) {
            const result = await bridge.exportData({ prettyPrint: true });
            setExportResult(result);
            if (result.ok && result.data) {
                setExportData(result.data);
            }
        } else {
            // Mock export
            const mock = {
                schemaVersion: '1.0',
                exportedAt: new Date().toISOString(),
                exportedBy: 'FrequencyManager/1.0.0',
                game: { id: 'wuthering-waves', version: '1.0.0', displayName: 'Wuthering Waves' },
                payload: { echoes: [{ id: 1, name: 'Test Echo', mainStat: 'ATK%', subStats: ['CRIT Rate', 'CRIT DMG', 'ATK%', 'Energy Regen'] }] }
            };
            const json = JSON.stringify(mock, null, 2);
            setExportData(json);
            setExportResult({ ok: true, data: json });
        }
        setExporting(false);
    };

    const handleImport = async () => {
        if (!importData.trim()) return;
        setImporting(true);
        setImportResult(null);
        const bridge = (window as unknown as { frequencyManager?: { importData?: (json: string) => Promise<ImportResult> } }).frequencyManager;
        if (bridge?.importData) {
            const result = await bridge.importData(importData);
            setImportResult(result);
        } else {
            // Mock import
            try {
                const parsed = JSON.parse(importData);
                setImportResult({ ok: true, envelope: parsed });
            } catch {
                setImportResult({ ok: false, error: 'Invalid JSON' });
            }
        }
        setImporting(false);
    };

    const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setImportData(event.target?.result as string);
            };
            reader.readAsText(file);
        }
    };

    const downloadExport = () => {
        if (!exportData) return;
        const blob = new Blob([exportData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `frequency-manager-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="p-6 space-y-6">
            <div>
                <h2 className="text-xl font-semibold text-fg mb-1">JSON Importer</h2>
                <p className="text-muted text-sm">Export and import game data as JSON</p>
            </div>

            {/* Export Section */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10 space-y-4">
                <h3 className="font-medium text-fg">Export Data</h3>
                <div className="flex gap-3 flex-wrap">
                    <button
                        onClick={handleExport}
                        disabled={exporting}
                        className="px-4 py-2 bg-accent text-black font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                        {exporting ? 'Exporting...' : 'Export Data'}
                    </button>
                    <button
                        onClick={downloadExport}
                        disabled={!exportData}
                        className="px-4 py-2 bg-white/5 text-fg font-medium rounded-lg border border-white/10 hover:bg-white/10 disabled:opacity-50 transition-colors"
                    >
                        Download JSON
                    </button>
                </div>
                {exportResult && !exportResult.ok && (
                    <div className="text-sm text-error">Export failed: {exportResult.error}</div>
                )}
                {exportData && (
                    <div className="relative">
                        <label className="block text-sm text-muted mb-2">Exported JSON (copy or download)</label>
                        <textarea
                            value={exportData}
                            readOnly
                            className="w-full h-48 bg-black/30 border border-white/10 rounded-lg p-3 text-sm font-mono text-fg focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                        />
                        <button
                            onClick={() => navigator.clipboard.writeText(exportData)}
                            className="absolute top-8 right-2 px-2 py-1 text-xs bg-white/5 text-muted hover:text-fg rounded transition-colors"
                        >
                            Copy
                        </button>
                    </div>
                )}
            </div>

            {/* Import Section */}
            <div className="bg-white/5 rounded-xl p-6 border border-white/10 space-y-4">
                <h3 className="font-medium text-fg">Import Data</h3>
                <div className="flex gap-3 flex-wrap">
                    <label className="px-4 py-2 bg-white/5 text-fg font-medium rounded-lg border border-white/10 hover:bg-white/10 cursor-pointer transition-colors">
                        Select File
                        <input type="file" accept=".json" onChange={handleFileImport} className="hidden" />
                    </label>
                    <button
                        onClick={handleImport}
                        disabled={importing || !importData.trim()}
                        className="px-4 py-2 bg-accent text-black font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                        {importing ? 'Importing...' : 'Import JSON'}
                    </button>
                </div>
                {importResult && (
                    <div className={`text-sm ${importResult.ok ? 'text-ok' : 'text-error'}`}>
                        {importResult.ok ? 'Import successful!' : `Import failed: ${importResult.error}`}
                        {importResult.envelope && (
                            <details className="mt-2">
                                <summary className="cursor-pointer text-muted">View imported data</summary>
                                <pre className="mt-2 text-xs bg-black/30 p-3 rounded overflow-auto max-h-48">{JSON.stringify(importResult.envelope as object, null, 2)}</pre>
                            </details>
                        )}
                    </div>
                )}
                <label className="block text-sm text-muted mb-2">Or paste JSON directly:</label>
                <textarea
                    value={importData}
                    onChange={(e) => setImportData(e.target.value)}
                    placeholder='Paste JSON here...'
                    className="w-full h-48 bg-black/30 border border-white/10 rounded-lg p-3 text-sm font-mono text-fg focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
            </div>
        </div>
    );
}