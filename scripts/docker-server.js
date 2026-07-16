/**
 * Docker HTTP Server with Web Dashboard UI
 * 
 * Provides a web interface to interact with the FrequencyManager app in Docker
 */
const moduleAlias = require('module-alias');
moduleAlias.addAliases({
    '@shared': __dirname + '/../dist/@shared'
});

const http = require('http');
const { Kernel } = require('../dist/core/kernel');

let kernel = null;
let kernelState = { status: 'not-started', startTime: Date.now() };

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FrequencyManager Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; }
        .container { max-width: 900px; margin: 0 auto; }
        h1 { color: #58a6ff; border-bottom: 2px solid #30363d; padding-bottom: 10px; margin-bottom: 20px; }
        h1 small { font-size: 14px; color: #8b949e; font-weight: normal; }
        .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
        .card h2 { color: #f0f6fc; font-size: 16px; margin-bottom: 15px; }
        .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
        .status-item { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 15px; text-align: center; }
        .status-item .label { color: #8b949e; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
        .status-item .value { font-size: 24px; font-weight: bold; margin-top: 5px; }
        .status-item .value.running { color: #3fb950; }
        .status-item .value.stopped { color: #f85149; }
        .status-item .value.initializing { color: #d29922; }
        .status-item .value.degraded { color: #d29922; }
        .log-entry { font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 12px; padding: 8px 12px; margin: 4px 0; border-radius: 4px; }
        .log-entry.info { background: #0d1117; border-left: 3px solid #58a6ff; }
        .log-entry.warn { background: #0d1117; border-left: 3px solid #d29922; }
        .log-entry.error { background: #0d1117; border-left: 3px solid #f85149; }
        .log-entry.debug { background: #0d1117; border-left: 3px solid #8b949e; }
        .btn { background: #238636; border: 1px solid #2ea043; color: white; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 14px; }
        .btn:hover { background: #2ea043; }
        .btn.danger { background: #da3633; border-color: #f85149; }
        .btn.danger:hover { background: #f85149; }
        .btn.secondary { background: #21262d; border-color: #30363d; }
        .btn.secondary:hover { background: #30363d; }
        .actions { display: flex; gap: 10px; flex-wrap: wrap; }
        .json-pretty { background: #0d1117; padding: 15px; border-radius: 6px; font-family: monospace; font-size: 12px; white-space: pre-wrap; overflow-x: auto; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; }
        .badge.healthy { background: #3fb95020; color: #3fb950; border: 1px solid #3fb950; }
        .badge.degraded { background: #d2992220; color: #d29922; border: 1px solid #d29922; }
        .badge.unhealthy { background: #f8514920; color: #f85149; border: 1px solid #f85149; }
        .footer { text-align: center; color: #484f58; font-size: 12px; margin-top: 20px; }
        .module-list { margin-top: 10px; }
        .module-item { display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #0d1117; border: 1px solid #30363d; border-radius: 4px; margin: 5px 0; }
        .module-item .name { font-weight: bold; }
        .module-item .version { color: #8b949e; font-size: 12px; }
        .feature-flag { display: inline-block; margin: 3px; padding: 4px 8px; background: #0d1117; border: 1px solid #30363d; border-radius: 4px; font-size: 12px; }
        .feature-flag .toggle { margin-left: 8px; cursor: pointer; text-decoration: none; }
        .feature-flag .on { color: #3fb950; }
        .feature-flag .off { color: #f85149; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        .pulse { animation: pulse 2s infinite; }
        #events { max-height: 300px; overflow-y: auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1>⚡ FrequencyManager <small>Docker Dashboard</small></h1>
        
        <div class="card">
            <h2>System Status</h2>
            <div class="status-grid" id="statusGrid">
                <div class="status-item">
                    <div class="label">Status</div>
                    <div class="value" id="statusValue">Loading...</div>
                </div>
                <div class="status-item">
                    <div class="label">Uptime</div>
                    <div class="value" id="uptimeValue">-</div>
                </div>
                <div class="status-item">
                    <div class="label">Modules</div>
                    <div class="value" id="modulesValue">-</div>
                </div>
                <div class="status-item">
                    <div class="label">Kernel Version</div>
                    <div class="value" id="versionValue">-</div>
                </div>
            </div>
        </div>

        <div class="card">
            <h2>Actions</h2>
            <div class="actions">
                <button class="btn" onclick="refreshState()">🔄 Refresh</button>
                <button class="btn" onclick="bootKernel()">🚀 Boot Kernel</button>
                <button class="btn danger" onclick="shutdownKernel()">⏹ Shutdown</button>
                <button class="btn secondary" onclick="checkHealth()">🏥 Health Check</button>
            </div>
        </div>

        <div class="card">
            <h2>Kernel State</h2>
            <pre class="json-pretty" id="kernelStateJson">{}</pre>
        </div>

        <div class="card">
            <h2>Feature Flags</h2>
            <div id="featureFlags">Loading...</div>
        </div>

        <div class="card">
            <h2>Events Log</h2>
            <div id="events">Waiting for events...</div>
        </div>

        <div class="footer">
            FrequencyManager v1.0.0 | Docker Container
        </div>
    </div>

    <script>
        let autoRefresh = setInterval(fetchState, 3000);

        async function fetchState() {
            try {
                const res = await fetch('/api/state');
                const data = await res.json();
                updateDashboard(data);
            } catch(e) {
                document.getElementById('statusValue').textContent = 'Disconnected';
                document.getElementById('statusValue').className = 'value stopped';
            }
        }

        function updateDashboard(data) {
            const sv = document.getElementById('statusValue');
            sv.textContent = data.status || 'unknown';
            sv.className = 'value ' + (data.status || 'unknown');
            
            const uptime = data.uptime ? (data.uptime / 1000).toFixed(1) + 's' : '-';
            document.getElementById('uptimeValue').textContent = uptime;
            document.getElementById('modulesValue').textContent = data.modulesLoaded ?? '-';
            document.getElementById('versionValue').textContent = data.version || '-';
            
            document.getElementById('kernelStateJson').textContent = JSON.stringify(data, null, 2);
        }

        async function bootKernel() {
            const res = await fetch('/api/boot', { method: 'POST' });
            const data = await res.json();
            updateDashboard(data);
            addEvent('info', 'Kernel boot initiated');
        }

        async function shutdownKernel() {
            const res = await fetch('/api/shutdown', { method: 'POST' });
            const data = await res.json();
            updateDashboard(data);
            addEvent('warn', 'Kernel shutting down');
        }

        async function checkHealth() {
            const res = await fetch('/api/health');
            const data = await res.json();
            document.getElementById('kernelStateJson').textContent = JSON.stringify(data, null, 2);
            addEvent(data.status === 'healthy' ? 'info' : 'warn', 'Health check: ' + data.status);
        }

        async function refreshState() {
            await fetchState();
            addEvent('debug', 'State refreshed');
        }

        function addEvent(level, message) {
            const events = document.getElementById('events');
            const entry = document.createElement('div');
            entry.className = 'log-entry ' + level;
            const time = new Date().toLocaleTimeString();
            entry.textContent = '[' + time + '] [' + level.toUpperCase() + '] ' + message;
            events.prepend(entry);
            if (events.children.length > 50) events.removeChild(events.lastChild);
        }

        // Initial fetch
        fetchState();
    </script>
</body>
</html>`;

// Create HTTP server
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Helper: JSON response
    function jsonResponse(data, status = 200) {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data, null, 2));
    }

    try {
        // Dashboard UI
        if (path === '/' || path === '/dashboard') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(DASHBOARD_HTML);
            return;
        }

        // API: Get kernel state
        if (path === '/api/state') {
            if (!kernel) {
                jsonResponse({ status: 'not-started', uptime: 0, modulesLoaded: 0, modulesFailed: 0, version: '1.0.0' });
                return;
            }
            const state = kernel.getState();
            jsonResponse({
                ...state,
                uptime: Date.now() - state.startTime,
                version: kernel.version
            });
            return;
        }

        // API: Boot kernel
        if (path === '/api/boot' && req.method === 'POST') {
            if (!kernel) {
                const config = {
                    appName: 'FrequencyManager',
                    version: '1.0.0',
                    environment: 'docker',
                    logLevel: 'info',
                    modulePaths: [],
                    featureFlags: {},
                    healthCheckInterval: 30000,
                    maxConcurrentModules: 5,
                    moduleTimeout: 10000,
                    enableHotSwap: true,
                    autoLoadModules: false
                };
                kernel = new Kernel(config);
            }
            await kernel.boot();
            const state = kernel.getState();
            jsonResponse({ ...state, uptime: Date.now() - state.startTime, version: kernel.version });
            return;
        }

        // API: Shutdown kernel
        if (path === '/api/shutdown' && req.method === 'POST') {
            if (kernel) {
                await kernel.shutdown();
                kernel = null;
            }
            jsonResponse({ status: 'stopped', message: 'Kernel shut down' });
            return;
        }

        // API: Health check
        if (path === '/api/health') {
            if (!kernel) {
                jsonResponse({ status: 'not-started', timestamp: Date.now(), checks: {} }, 503);
                return;
            }
            const health = await kernel.healthCheck();
            jsonResponse(health);
            return;
        }

        // 404
        res.writeHead(404);
        res.end('Not found');

    } catch (error) {
        jsonResponse({ error: error.message, stack: error.stack }, 500);
    }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  ⚡ FrequencyManager Dashboard`);
    console.log(`  ─────────────────────────────`);
    console.log(`  Server: http://0.0.0.0:${PORT}`);
    console.log(`  Dashboard: http://localhost:${PORT}/`);
    console.log(`  API: http://localhost:${PORT}/api/state`);
    console.log(`  Boot: POST http://localhost:${PORT}/api/boot`);
    console.log(`  Health: http://localhost:${PORT}/api/health`);
    console.log(`  ─────────────────────────────`);
    console.log(`  Press Ctrl+C to stop\n`);
});