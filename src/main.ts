/**
 * @fileoverview Application Entry Point - FrequencyManager
 * @module src/main
 * 
 * Bootstraps the FrequencyManager kernel and starts the application.
 * This is the main entry point for both Electron and headless modes.
 * 
 * @packageDocumentation
 */

import { createKernel, Kernel, KernelConfig } from '@core/kernel';
import { StructuredLogger } from '@core/kernel';

/**
 * Application configuration
 */
interface AppConfig {
    /** Module directories to scan */
    modulePaths: string[];
    /** Enable hot module reloading (development only) */
    hotReload: boolean;
    /** Default module timeout in ms */
    moduleTimeout: number;
    /** Log level */
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    /** Feature flags */
    featureFlags: Record<string, boolean>;
}

/**
 * Default application configuration
 */
const DEFAULT_CONFIG: AppConfig = {
    modulePaths: ['./modules'],
    hotReload: process.env.NODE_ENV === 'development',
    moduleTimeout: 30000,
    logLevel: (process.env.LOG_LEVEL as AppConfig['logLevel']) || 'info',
    featureFlags: {
        'ocr-enabled': true,
        'damage-calculation': true,
        'hot-reload': process.env.NODE_ENV === 'development',
        'experimental-ui': false,
        'telemetry': false,
    },
};

/**
 * Load configuration from files and environment
 */
async function loadConfiguration(): Promise<Partial<KernelConfig>> {
    const config: Partial<KernelConfig> = {
        ...DEFAULT_CONFIG,
    };

    // Override with environment variables
    if (process.env.FREQUENCY_MANAGER_MODULE_PATHS) {
        config.modulePaths = process.env.FREQUENCY_MANAGER_MODULE_PATHS.split(',');
    }
    if (process.env.FREQUENCY_MANAGER_HOT_RELOAD) {
        config.hotReload = process.env.FREQUENCY_MANAGER_HOT_RELOAD === 'true';
    }
    if (process.env.FREQUENCY_MANAGER_LOG_LEVEL) {
        config.logLevel = process.env.FREQUENCY_MANAGER_LOG_LEVEL as KernelConfig['logLevel'];
    }

    return config;
}

/**
 * Main application entry point
 */
async function main(): Promise<void> {
    // Create a logger for the bootstrap process
    const bootstrapLogger = new StructuredLogger('bootstrap');
    bootstrapLogger.setLevel('info');

    bootstrapLogger.info('Starting FrequencyManager...', {
        version: '1.0.0',
        nodeVersion: process.version,
        platform: process.platform,
        env: process.env.NODE_ENV || 'development',
    });

    try {
        // Load configuration
        const config = await loadConfiguration();
        bootstrapLogger.info('Configuration loaded', { config });

        // Create and boot the kernel
        const kernel = await createKernel(config);

        bootstrapLogger.info('Kernel booted successfully');

        // Set up graceful shutdown handlers
        const shutdown = async (signal: string): Promise<void> => {
            bootstrapLogger.info(`Received ${signal}, shutting down gracefully...`);
            try {
                await kernel.shutdown();
                bootstrapLogger.info('Shutdown complete');
                process.exit(0);
            } catch (error) {
                bootstrapLogger.error('Shutdown failed', { error: (error as Error).message });
                process.exit(1);
            }
        };

        // Handle shutdown signals
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

        // Handle uncaught errors
        process.on('uncaughtException', (error) => {
            bootstrapLogger.error('Uncaught exception', { error: error.message, stack: error.stack });
            shutdown('uncaughtException');
        });

        process.on('unhandledRejection', (reason) => {
            bootstrapLogger.error('Unhandled rejection', { reason: String(reason) });
            shutdown('unhandledRejection');
        });

        // Keep the process alive
        bootstrapLogger.info('Application running. Press Ctrl+C to stop.');

        // For headless mode, we just keep running
        // In Electron mode, the renderer process would handle the UI

    } catch (error) {
        bootstrapLogger.error('Failed to start application', { error: (error as Error).message, stack: (error as Error).stack });
        process.exit(1);
    }
}

// Run if this is the main module
if (require.main === module) {
    main();
}

export { main, loadConfiguration, DEFAULT_CONFIG };