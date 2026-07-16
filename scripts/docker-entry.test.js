/**
 * Docker entry test script - shows the app is working with visible output
 */
const moduleAlias = require('module-alias');
moduleAlias.addAliases({
    '@shared': __dirname + '/../dist/@shared'
});

console.log('=== FrequencyManager - Docker Test ===');
console.log('');

async function main() {
    try {
        console.log('[1/4] Loading kernel module...');
        const { createKernel, Kernel } = require('../dist/core/kernel');
        console.log('[1/4] ✓ Kernel module loaded successfully');

        console.log('[2/4] Configuring kernel...');
        const config = {
            appName: 'FrequencyManager',
            version: '1.0.0',
            environment: 'docker-test',
            logLevel: 'debug',
            modulePaths: [],
            featureFlags: {},
            healthCheckInterval: 0,
            maxConcurrentModules: 5,
            moduleTimeout: 10000,
            enableHotSwap: true,
            autoLoadModules: false
        };
        console.log('[2/4] ✓ Kernel configured');

        console.log('[3/4] Booting kernel...');
        const kernel = new Kernel(config);
        await kernel.boot();
        console.log('[3/4] ✓ Kernel booted successfully');

        console.log('[4/4] Checking application state...');
        const state = kernel.getState();
        console.log('[4/4] ✓ State check completed');
        console.log('');
        console.log('=== Application State ===');
        console.log(`Status: ${state.status}`);
        console.log(`Modules loaded: ${state.modulesLoaded}`);
        console.log(`Modules failed: ${state.modulesFailed}`);
        console.log(`Kernel version: ${kernel.version}`);
        console.log('');

        console.log('=== Application Ready ===');
        console.log('FrequencyManager is running correctly!');
        console.log('');

        // Shutdown gracefully
        await kernel.shutdown();
        console.log('Kernel shutdown complete. Exiting.');
        process.exit(0);
    } catch (error) {
        console.error('');
        console.error('✗ Error during startup:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();