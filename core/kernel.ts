/**
 * @fileoverview Kernel Implementation for FrequencyManager
 * @module core/kernel
 * 
 * The Kernel is the core of the application, handling lifecycle management:
 * booting, routing, state, and inter-module communication.
 * It coordinates the event bus, module registry, module loader, and sandbox.
 * 
 * WHY: The kernel is the single source of truth for application state.
 * It ensures modules are loaded in the correct order, manages their lifecycle,
 * and provides the communication infrastructure. All modules interact with
 * the kernel through well-defined interfaces.
 * 
 * @packageDocumentation
 */

import {
    KernelInterface,
    KernelConfig,
    ModuleAPI,
    ModuleManifest,
    ModuleLoaderOptions,
    ModuleFactory,
    ModuleExports,
    ModuleHealthStatus,
    ModuleError,
    ModulePermission,
    EventBusInterface,
    ModuleRegistryInterface,
    ConfigInterface,
    LoggerInterface,
    FeatureFlagInterface,
    ModuleSandboxInterface,
    ModuleLoaderInterface,
    HealthCheckResult,
    generateId,
    generateCorrelationId,
    deepClone,
    retryWithBackoff,
} from '@shared/types';
import { EventBus } from './event-bus';
import { ModuleRegistry } from './module-registry';
import { ModuleSandbox, createSandbox, validatePermissions, PermissionSets } from './module-sandbox';
import { ConfigSystem } from './config';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

/**
 * Kernel state
 */
interface KernelState {
    status: 'initializing' | 'running' | 'shutting-down' | 'stopped';
    startTime: number;
    modulesLoaded: number;
    modulesFailed: number;
}

/**
 * Feature flag implementation
 */
class FeatureFlagManager implements FeatureFlagInterface {
    private flags: Map<string, { enabled: boolean; description: string }> = new Map();

    isEnabled(flag: string): boolean {
        return this.flags.get(flag)?.enabled ?? false;
    }

    enable(flag: string): void {
        const existing = this.flags.get(flag);
        this.flags.set(flag, { enabled: true, description: existing?.description || '' });
    }

    disable(flag: string): void {
        const existing = this.flags.get(flag);
        this.flags.set(flag, { enabled: false, description: existing?.description || '' });
    }

    getAll(): Record<string, boolean> {
        const result: Record<string, boolean> = {};
        for (const [key, value] of this.flags.entries()) {
            result[key] = value.enabled;
        }
        return result;
    }

    register(flag: string, defaultValue: boolean, description: string): void {
        if (!this.flags.has(flag)) {
            this.flags.set(flag, { enabled: defaultValue, description });
        }
    }
}

/**
 * Logger implementation with structured logging
 */
class StructuredLogger implements LoggerInterface {
    private context: Record<string, unknown> = {};
    private level: 'debug' | 'info' | 'warn' | 'error' = 'info';
    private readonly moduleName: string;

    constructor(moduleName: string = 'kernel') {
        this.moduleName = moduleName;
    }

    setLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
        this.level = level;
    }

    private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
        const levels = { debug: 0, info: 1, warn: 2, error: 3 };
        return levels[level] >= levels[this.level];
    }

    private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
        if (!this.shouldLog(level)) return;

        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            module: this.moduleName,
            message,
            ...this.context,
            ...meta,
        };

        const output = JSON.stringify(logEntry);

        switch (level) {
            case 'debug': console.debug(output); break;
            case 'info': console.info(output); break;
            case 'warn': console.warn(output); break;
            case 'error': console.error(output); break;
        }
    }

    debug(message: string, meta?: Record<string, unknown>): void {
        this.log('debug', message, meta);
    }

    info(message: string, meta?: Record<string, unknown>): void {
        this.log('info', message, meta);
    }

    warn(message: string, meta?: Record<string, unknown>): void {
        this.log('warn', message, meta);
    }

    error(message: string, meta?: Record<string, unknown>): void {
        this.log('error', message, meta);
    }

    child(context: Record<string, unknown>): LoggerInterface {
        const child = new StructuredLogger(this.moduleName);
        child.context = { ...this.context, ...context };
        child.level = this.level;
        return child;
    }
}

/**
 * Module Loader Implementation
 */
class ModuleLoader implements ModuleLoaderInterface {
    private readonly kernel: KernelInterface;
    private readonly loadedModules: Map<string, ModuleAPI> = new Map();
    private readonly modulePaths: Map<string, string> = new Map(); // moduleId -> path

    constructor(kernel: KernelInterface) {
        this.kernel = kernel;
    }

    async load(modulePath: string): Promise<ModuleAPI> {
        // Resolve absolute path
        const absolutePath = path.resolve(modulePath);

        // Read manifest
        const manifestPath = path.join(absolutePath, 'module.manifest.json');
        if (!fs.existsSync(manifestPath)) {
            throw new ModuleError(
                'MANIFEST_NOT_FOUND',
                `Module manifest not found at ${manifestPath}`,
                path.basename(absolutePath),
                { recoverable: false }
            );
        }

        const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
        const manifest: ModuleManifest = JSON.parse(manifestContent);

        // Validate manifest
        this.validateManifest(manifest);

        // Load module entry point
        const entryPointPath = path.join(absolutePath, manifest.entryPoint);
        if (!fs.existsSync(entryPointPath)) {
            throw new ModuleError(
                'ENTRY_POINT_NOT_FOUND',
                `Module entry point not found: ${entryPointPath}`,
                manifest.name,
                { recoverable: false }
            );
        }

        // Dynamic import
        const moduleExports = await import(entryPointPath) as ModuleExports;

        if (!moduleExports.default || typeof moduleExports.default !== 'function') {
            throw new ModuleError(
                'INVALID_ENTRY_POINT',
                `Module entry point must export a default factory function`,
                manifest.name,
                { recoverable: false }
            );
        }

        const factory: ModuleFactory = moduleExports.default;

        // Create sandbox with permissions from manifest
        const sandbox = createSandbox(manifest.name, manifest.permissions, this.kernel);

        // Create loader options
        const options: ModuleLoaderOptions = {
            modulePath: absolutePath,
            kernel: this.kernel,
            permissions: manifest.permissions,
            config: this.kernel.config.getAll(),
        };

        // Create module instance
        const moduleApi = await factory(options);

        // Verify module ID matches manifest
        if (moduleApi.moduleId !== manifest.name) {
            throw new ModuleError(
                'MODULE_ID_MISMATCH',
                `Module ID mismatch: manifest says ${manifest.name}, module says ${moduleApi.moduleId}`,
                manifest.name,
                { recoverable: false }
            );
        }

        // Store module path for hot reload
        this.modulePaths.set(manifest.name, absolutePath);

        this.kernel.logger.info(`Module loaded: ${manifest.name} v${manifest.version}`);
        return moduleApi;
    }

    async unload(moduleId: string): Promise<void> {
        const module = this.loadedModules.get(moduleId);
        if (!module) {
            throw new ModuleError(
                'MODULE_NOT_LOADED',
                `Module not loaded: ${moduleId}`,
                moduleId,
                { recoverable: false }
            );
        }

        await module.shutdown();
        this.loadedModules.delete(moduleId);
        this.modulePaths.delete(moduleId);

        this.kernel.logger.info(`Module unloaded: ${moduleId}`);
    }

    async reload(moduleId: string): Promise<ModuleAPI> {
        const modulePath = this.modulePaths.get(moduleId);
        if (!modulePath) {
            throw new ModuleError(
                'MODULE_NOT_FOUND',
                `Module path not found for reload: ${moduleId}`,
                moduleId,
                { recoverable: false }
            );
        }

        // Unload first
        await this.unload(moduleId);

        // Clear require cache for hot reload
        this.clearRequireCache(modulePath);

        // Load again
        return this.load(modulePath);
    }

    getLoadedModules(): Map<string, ModuleAPI> {
        return new Map(this.loadedModules);
    }

    private validateManifest(manifest: ModuleManifest): void {
        if (!manifest.name || !manifest.version || !manifest.entryPoint) {
            throw new ModuleError(
                'INVALID_MANIFEST',
                'Manifest missing required fields: name, version, entryPoint',
                manifest.name || 'unknown',
                { recoverable: false }
            );
        }
    }

    private clearRequireCache(modulePath: string): void {
        // Clear all cached modules from this path
        for (const key of Object.keys(require.cache)) {
            if (key.startsWith(modulePath)) {
                delete require.cache[key];
            }
        }
    }
}

/**
 * Kernel Implementation
 * 
 * The central coordinator for the entire application.
 */
export class Kernel implements KernelInterface {
    public readonly version = '1.0.0';
    public readonly eventBus: EventBusInterface;
    public readonly moduleRegistry: ModuleRegistryInterface;
    public readonly config: ConfigInterface;
    public readonly logger: LoggerInterface;
    public readonly featureFlags: FeatureFlagInterface;

    private readonly moduleLoader: ModuleLoader;
    private readonly state: KernelState;
    private readonly shutdownHandlers: Array<() => Promise<void>> = [];

    constructor(config: Partial<KernelConfig> = {}) {
        // Initialize core services
        const loggerInstance = new StructuredLogger('kernel');
        loggerInstance.setLevel(config.logLevel || 'info');

        this.eventBus = new EventBus(loggerInstance);
        this.moduleRegistry = new ModuleRegistry(this.eventBus as EventBus);
        this.config = new ConfigSystem(); // Use the proper ConfigSystem
        // Seed caller-supplied config (modulePaths, hotReload, …) so it applies
        // even if disk config fails to load. Disk config (loadConfiguration) is
        // loaded later during boot and overrides overlapping keys.
        if (config && Object.keys(config).length > 0) {
            this.config.load({ priority: 0, data: config as unknown as Record<string, unknown>, description: 'kernel-constructor config' });
        }
        this.featureFlags = new FeatureFlagManager();
        this.moduleLoader = new ModuleLoader(this);

        this.state = {
            status: 'initializing',
            startTime: Date.now(),
            modulesLoaded: 0,
            modulesFailed: 0,
        };

        // Register default feature flags
        this.registerDefaultFeatureFlags();

        // Set up kernel as logger for other components
        this.logger = loggerInstance;
    }

    /**
     * Boot the kernel and load all modules
     */
    async boot(): Promise<void> {
        this.logger.info('Kernel booting...', { version: this.version });
        this.state.status = 'running';

        try {
            // Load configuration
            await this.loadConfiguration();

            // Discover and load modules
            await this.discoverAndLoadModules();

            // Initialize all modules in dependency order
            await this.initializeModules();

            // Publish boot complete event
            await this.eventBus.publish('kernel:booted', {
                version: this.version,
                modulesLoaded: this.state.modulesLoaded,
                uptime: Date.now() - this.state.startTime,
            }, { source: 'kernel' });

            this.logger.info('Kernel booted successfully', {
                modulesLoaded: this.state.modulesLoaded,
                modulesFailed: this.state.modulesFailed,
            });
        } catch (error) {
            this.state.status = 'stopped';
            this.logger.error('Kernel boot failed', { error: (error as Error).message });
            throw error;
        }
    }

    /**
     * Shutdown the kernel gracefully
     */
    async shutdown(): Promise<void> {
        this.logger.info('Kernel shutting down...');
        this.state.status = 'shutting-down';

        // Run shutdown handlers
        for (const handler of this.shutdownHandlers) {
            try {
                await handler();
            } catch (error) {
                this.logger.error('Shutdown handler error', { error: (error as Error).message });
            }
        }

        // Shutdown all modules in reverse load order
        const loadOrder = this.moduleRegistry.getLoadOrder().reverse();
        for (const moduleId of loadOrder) {
            try {
                const module = this.moduleRegistry.get(moduleId);
                if (module) {
                    await module.shutdown();
                    this.logger.debug(`Module shutdown: ${moduleId}`);
                }
            } catch (error) {
                this.logger.error(`Module shutdown failed: ${moduleId}`, { error: (error as Error).message });
            }
        }

        // Shutdown event bus
        if (this.eventBus instanceof EventBus) {
            await this.eventBus.shutdown();
        }

        this.state.status = 'stopped';
        this.logger.info('Kernel shutdown complete');
    }

    /**
     * Register a shutdown handler
     */
    onShutdown(handler: () => Promise<void>): void {
        this.shutdownHandlers.push(handler);
    }

    /**
     * Get kernel state
     */
    getState(): KernelState {
        return { ...this.state };
    }

    /**
     * Get health check for the entire system
     */
    async healthCheck(): Promise<HealthCheckResult> {
        const checks: Record<string, { status: 'pass' | 'fail' | 'warn'; message?: string }> = {};

        // Check kernel status
        checks.kernel = {
            status: this.state.status === 'running' ? 'pass' : 'fail',
            message: `Kernel status: ${this.state.status}`,
        };

        // Check modules
        let healthyModules = 0;
        let degradedModules = 0;
        let unhealthyModules = 0;

        for (const module of this.moduleRegistry.getAll()) {
            const health = await module.healthCheck();
            checks[`module:${module.moduleId}`] = {
                status: health === 'healthy' ? 'pass' : health === 'degraded' ? 'warn' : 'fail',
                message: `Module health: ${health}`,
            };

            if (health === 'healthy') healthyModules++;
            else if (health === 'degraded') degradedModules++;
            else unhealthyModules++;
        }

        checks.modules = {
            status: unhealthyModules > 0 ? 'fail' : degradedModules > 0 ? 'warn' : 'pass',
            message: `${healthyModules} healthy, ${degradedModules} degraded, ${unhealthyModules} unhealthy`,
        };

        return {
            status: unhealthyModules > 0 ? 'unhealthy' : degradedModules > 0 ? 'degraded' : 'healthy',
            timestamp: Date.now(),
            uptime: Date.now() - this.state.startTime,
            checks,
            metadata: {
                version: this.version,
                modulesLoaded: this.state.modulesLoaded,
                modulesFailed: this.state.modulesFailed,
            },
        };
    }

    /**
     * Load configuration from files
     */
    private async loadConfiguration(): Promise<void> {
        // Try candidate config locations so this works in dev AND when packaged
        // (where process.cwd() is the launch dir). Order: explicit override →
        // packaged extraResources (resources/config) → repo root (relative to
        // dist/core) → cwd.
        const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;
        const candidates = [
            process.env.FM_CONFIG_DIR,
            resourcesPath ? path.join(resourcesPath, 'config') : undefined,
            path.join(__dirname, '..', '..', 'config'),
            path.join(process.cwd(), 'config'),
        ].filter((d): d is string => typeof d === 'string');
        const configDir = candidates.find((d) => fs.existsSync(d)) ?? path.join(process.cwd(), 'config');

        if (fs.existsSync(configDir)) {
            const files = fs.readdirSync(configDir);

            // Load base config first
            for (const file of files.sort()) {
                if (file === 'default.json' || file === 'default.yaml' || file === 'default.yml') {
                    this.config.load({
                        priority: 0, // DEFAULT
                        data: this.loadConfigFile(path.join(configDir, file)),
                        description: `Default config: ${file}`
                    });
                }
            }

            // Load environment-specific config
            const env = process.env.NODE_ENV || 'development';
            for (const file of files.sort()) {
                if (file === `${env}.json` || file === `${env}.yaml` || file === `${env}.yml`) {
                    this.config.load({
                        priority: 20, // ENVIRONMENT
                        data: this.loadConfigFile(path.join(configDir, file)),
                        description: `Environment config (${env}): ${file}`
                    });
                }
            }

            // Load local overrides (continues...)
        }
    }

    private loadConfigFile(filePath: string): Record<string, unknown> {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const ext = path.extname(filePath).toLowerCase();

            if (ext === '.json') {
                return JSON.parse(content);
            } else if (ext === '.yaml' || ext === '.yml') {
                return yaml.parse(content);
            } else {
                throw new Error(`Unsupported config format: ${ext}`);
            }
        } catch (error) {
            this.logger.error(`Failed to load config from ${filePath}`, { error: (error as Error).message });
            return {};
        }
    }

    /**
     * Apply environment variable overrides to config
     */
    private applyEnvOverrides(): void {
        for (const [key, value] of Object.entries(process.env)) {
            if (key.startsWith('FREQUENCY_MANAGER_') && value !== undefined) {
                const configKey = key.replace('FREQUENCY_MANAGER_', '').toLowerCase().replace(/_/g, '.');
                try {
                    // Try to parse as JSON
                    this.config.set(configKey, JSON.parse(value));
                } catch {
                    // Use as string
                    this.config.set(configKey, value);
                }
            }
        }
    }

    /**
     * Discover and load modules from module paths
     */
    private async discoverAndLoadModules(): Promise<void> {
        const modulePaths = this.config.get<string[]>('modulePaths') ?? ['./modules'];
        // Compiled modules live under the dist tree (this file is dist/core/kernel.js),
        // so resolve relative module paths against dist — NOT process.cwd(), which is
        // the launch directory in a packaged app and holds no compiled modules.
        const distRoot = path.join(__dirname, '..');

        for (const modulePath of modulePaths) {
            const absolutePath = path.isAbsolute(modulePath) ? modulePath : path.join(distRoot, modulePath);

            if (!fs.existsSync(absolutePath)) {
                this.logger.warn(`Module path does not exist: ${absolutePath}`);
                continue;
            }

            const entries = fs.readdirSync(absolutePath, { withFileTypes: true });

            for (const entry of entries) {
                if (!entry.isDirectory()) continue;

                const moduleDir = path.join(absolutePath, entry.name);
                const manifestPath = path.join(moduleDir, 'module.manifest.json');

                if (!fs.existsSync(manifestPath)) continue;

                try {
                    const module = await this.moduleLoader.load(moduleDir);
                    await this.moduleRegistry.register(module);
                    this.state.modulesLoaded++;
                } catch (error) {
                    this.state.modulesFailed++;
                    this.logger.error(`Failed to load module ${entry.name}`, {
                        error: (error as Error).message
                    });

                    // Continue loading other modules
                }
            }
        }
    }

    /**
     * Initialize all modules in dependency order
     */
    private async initializeModules(): Promise<void> {
        const loadOrder = this.moduleRegistry.getLoadOrder();

        for (const moduleId of loadOrder) {
            const module = this.moduleRegistry.get(moduleId);
            if (!module) continue;

            try {
                this.moduleRegistry.setHealth(moduleId, 'loading');
                await module.initialize(this);
                this.moduleRegistry.setHealth(moduleId, 'healthy');
                this.logger.debug(`Module initialized: ${moduleId}`);
            } catch (error) {
                const moduleError = ModuleError.fromError(error, moduleId, 'MODULE_INIT_FAILED');
                this.moduleRegistry.setHealth(moduleId, 'unhealthy', moduleError);
                this.logger.error(`Module initialization failed: ${moduleId}`, {
                    error: moduleError.message
                });
            }
        }
    }

    /**
     * Register default feature flags
     */
    private registerDefaultFeatureFlags(): void {
        this.featureFlags.register('ocr-enabled', true, 'Enable OCR scanning functionality');
        this.featureFlags.register('damage-calculation', true, 'Enable damage calculation engine');
        this.featureFlags.register('hot-reload', true, 'Enable hot module reloading');
        this.featureFlags.register('experimental-ui', false, 'Enable experimental UI features');
        this.featureFlags.register('telemetry', false, 'Enable anonymous usage telemetry');
    }

    /**
     * Load a module dynamically at runtime
     */
    async loadModule(modulePath: string): Promise<ModuleAPI> {
        const module = await this.moduleLoader.load(modulePath);
        await this.moduleRegistry.register(module);
        await module.initialize(this);
        this.moduleRegistry.setHealth(module.moduleId, 'healthy');
        this.state.modulesLoaded++;
        return module;
    }

    /**
     * Unload a module at runtime
     */
    async unloadModule(moduleId: string): Promise<void> {
        const module = this.moduleRegistry.get(moduleId);
        if (!module) {
            throw new ModuleError('MODULE_NOT_FOUND', `Module not found: ${moduleId}`, moduleId);
        }

        await module.shutdown();
        await this.moduleRegistry.unregister(moduleId);
        await this.moduleLoader.unload(moduleId);
        this.state.modulesLoaded--;
    }

    /**
     * Reload a module (hot swap)
     */
    async reloadModule(moduleId: string): Promise<ModuleAPI> {
        const module = await this.moduleLoader.reload(moduleId);
        await this.moduleRegistry.unregister(moduleId);
        await this.moduleRegistry.register(module);
        await module.initialize(this);
        this.moduleRegistry.setHealth(moduleId, 'healthy');
        return module;
    }
}

/**
 * Create and configure a kernel instance
 */
export async function createKernel(config?: Partial<KernelConfig>): Promise<Kernel> {
    const kernel = new Kernel(config);
    await kernel.boot();
    return kernel;
}

export { KernelConfig, KernelState, StructuredLogger };
