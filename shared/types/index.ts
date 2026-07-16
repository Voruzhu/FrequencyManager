/**
 * @fileoverview Shared type definitions for FrequencyManager
 * @module shared/types
 * 
 * This module contains all shared type definitions used across the application.
 * It provides the foundation for type-safe communication between modules,
 * the kernel, and external adapters.
 * 
 * @packageDocumentation
 */

import { EventEmitter } from 'eventemitter3';
import { ZodSchema, ZodTypeAny } from 'zod';

/**
 * Semantic versioning type
 * Follows SemVer 2.0.0 specification
 */
export interface SemVer {
    major: number;
    minor: number;
    patch: number;
    prerelease?: string;
    build?: string;
}

/**
 * Converts SemVer object to string representation
 */
export function semverToString(version: SemVer): string {
    let str = `${version.major}.${version.minor}.${version.patch}`;
    if (version.prerelease) str += `-${version.prerelease}`;
    if (version.build) str += `+${version.build}`;
    return str;
}

/**
 * Parses a SemVer string into a SemVer object
 */
export function parseSemVer(version: string): SemVer {
    const regex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
    const match = version.match(regex);
    if (!match) {
        throw new Error(`Invalid SemVer string: ${version}`);
    }
    return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        patch: parseInt(match[3], 10),
        prerelease: match[4],
        build: match[5],
    };
}

/**
 * Compares two SemVer versions
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareSemVer(a: SemVer, b: SemVer): number {
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    if (a.patch !== b.patch) return a.patch - b.patch;

    // Handle prerelease versions
    if (a.prerelease && !b.prerelease) return -1;
    if (!a.prerelease && b.prerelease) return 1;
    if (a.prerelease && b.prerelease) {
        return a.prerelease.localeCompare(b.prerelease);
    }
    return 0;
}

/**
 * Checks if a version satisfies a range (simplified)
 */
export function satisfiesSemVer(version: SemVer, range: string): boolean {
    // Simplified implementation - in production use a proper semver library
    const rangeMatch = range.match(/^([\^~<>]=?)?(\d+)\.(\d+)\.(\d+)(?:-.+)?$/);
    if (!rangeMatch) return false;

    const [, operator, major, minor, patch] = rangeMatch;
    const rangeVersion: SemVer = {
        major: parseInt(major, 10),
        minor: parseInt(minor, 10),
        patch: parseInt(patch, 10),
    };

    const cmp = compareSemVer(version, rangeVersion);

    switch (operator) {
        case '^':
            return version.major === rangeVersion.major && cmp >= 0;
        case '~':
            return version.major === rangeVersion.major &&
                version.minor === rangeVersion.minor &&
                cmp >= 0;
        case '>=':
            return cmp >= 0;
        case '<=':
            return cmp <= 0;
        case '>':
            return cmp > 0;
        case '<':
            return cmp < 0;
        case '=':
        case '':
            return cmp === 0;
        default:
            return cmp === 0;
    }
}

/**
 * Module manifest structure
 * Every module must provide this manifest at its root
 */
export interface ModuleManifest {
    /** Unique module identifier (kebab-case) */
    name: string;
    /** Human-readable module name */
    displayName: string;
    /** Module version following SemVer */
    version: string;
    /** Module description */
    description: string;
    /** Author information */
    author: string;
    /** Module entry point (relative to module root) */
    entryPoint: string;
    /** Module dependencies with version ranges */
    dependencies: Record<string, string>;
    /** Permissions required by this module */
    permissions: ModulePermission[];
    /** Module configuration schema (Zod schema as JSON) */
    configSchema?: Record<string, unknown>;
    /** Module tags for categorization */
    tags: string[];
    /** Minimum core version required */
    minCoreVersion: string;
    /** Maximum core version supported (exclusive) */
    maxCoreVersion?: string;
    /** Whether module is enabled by default */
    enabledByDefault: boolean;
    /** Module icon (optional) */
    icon?: string;
}

/**
 * Module permission types
 * Follows principle of least privilege
 */
export type ModulePermission =
    | 'fs:read'
    | 'fs:write'
    | 'fs:delete'
    | 'network:request'
    | 'network:listen'
    | 'system:clipboard'
    | 'system:notifications'
    | 'system:shortcuts'
    | 'ocr:scan'
    | 'ocr:train'
    | 'data:echoes:read'
    | 'data:echoes:write'
    | 'data:characters:read'
    | 'data:characters:write'
    | 'calculation:damage'
    | 'ui:render'
    | 'ui:overlay';

/**
 * Module health status
 */
export type ModuleHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unloaded' | 'loading';

/**
 * Module state interface
 * Each module has isolated state managed by the kernel
 */
export interface ModuleState {
    /** Module identifier */
    moduleId: string;
    /** Current health status */
    health: ModuleHealthStatus;
    /** Last error if any */
    lastError?: ModuleError;
    /** Module uptime in milliseconds */
    uptime: number;
    /** Module-specific state data */
    data: Record<string, unknown>;
    /** Last health check timestamp */
    lastHealthCheck: number;
    /** Load timestamp */
    loadedAt: number;
}

/**
 * Module lifecycle events
 */
export type ModuleLifecycleEvent =
    | 'beforeLoad'
    | 'load'
    | 'afterLoad'
    | 'beforeUnload'
    | 'unload'
    | 'afterUnload'
    | 'beforeEnable'
    | 'enable'
    | 'afterEnable'
    | 'beforeDisable'
    | 'disable'
    | 'afterDisable'
    | 'error'
    | 'healthCheck';

/**
 * Module error class for typed error handling
 */
export class ModuleError extends Error {
    public readonly code: string;
    public readonly moduleId: string;
    public readonly timestamp: number;
    public readonly recoverable: boolean;
    public readonly originalError?: Error;

    constructor(
        code: string,
        message: string,
        moduleId: string,
        options: { recoverable?: boolean; originalError?: Error } = {}
    ) {
        super(message);
        this.name = 'ModuleError';
        this.code = code;
        this.moduleId = moduleId;
        this.timestamp = Date.now();
        this.recoverable = options.recoverable ?? true;
        this.originalError = options.originalError;

        // Maintains proper stack trace in V8 environments
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ModuleError);
        }
    }

    /**
     * Creates a ModuleError from an unknown error
     */
    static fromError(error: unknown, moduleId: string, code = 'UNKNOWN_ERROR'): ModuleError {
        if (error instanceof ModuleError) return error;
        if (error instanceof Error) {
            return new ModuleError(code, error.message, moduleId, {
                originalError: error,
                recoverable: true
            });
        }
        return new ModuleError(code, String(error), moduleId, { recoverable: true });
    }

    /**
     * Serializes error for logging/transport
     */
    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            moduleId: this.moduleId,
            timestamp: this.timestamp,
            recoverable: this.recoverable,
            stack: this.stack,
            originalError: this.originalError?.message,
        };
    }
}

/**
 * Event bus message types
 * All messages must be serializable for future microservice splitting
 */
export interface EventMessage<T = unknown> {
    /** Unique message ID for tracing */
    id: string;
    /** Event type/topic */
    type: string;
    /** Source module ID */
    source: string;
    /** Target module ID (for directed messages) */
    target?: string;
    /** Message payload */
    payload: T;
    /** Timestamp in milliseconds */
    timestamp: number;
    /** Correlation ID for request/response tracing */
    correlationId?: string;
    /** Message metadata */
    meta?: Record<string, unknown>;
}

/**
 * Request message for RPC-style communication
 */
export interface RequestMessage<T = unknown, R = unknown> extends EventMessage<T> {
    /** Expected response type */
    responseType: string;
    /** Request timeout in ms */
    timeout: number;
}

/**
 * Response message for RPC-style communication
 */
export interface ResponseMessage<R = unknown> extends EventMessage<R> {
    /** Original request ID */
    requestId: string;
    /** Whether request succeeded */
    success: boolean;
    /** Error if request failed */
    error?: ModuleError;
}

/**
 * Subscription options for event bus
 */
export interface SubscriptionOptions {
    /** Filter function for messages */
    filter?: (message: EventMessage) => boolean;
    /** Whether to receive only once */
    once?: boolean;
    /** Priority for ordered delivery */
    priority?: number;
}

/**
 * Module public API surface
 * Defines what a module exports for other modules to use
 */
export interface ModuleAPI {
    /** Module identifier */
    readonly moduleId: string;
    /** Module manifest */
    readonly manifest: ModuleManifest;
    /** Module health status */
    readonly health: ModuleHealthStatus;
    /** Initialize the module */
    initialize(kernel: KernelInterface): Promise<void>;
    /** Shutdown the module gracefully */
    shutdown(): Promise<void>;
    /** Handle configuration updates */
    configure(config: Record<string, unknown>): Promise<void>;
    /** Perform health check */
    healthCheck(): Promise<ModuleHealthStatus>;
    /** Get module state for debugging */
    getState(): ModuleState;
}

/**
 * Kernel interface exposed to modules
 * Provides controlled access to kernel functionality
 */
export interface KernelInterface {
    /** Event bus for inter-module communication */
    readonly eventBus: EventBusInterface;
    /** Module registry for discovering other modules */
    readonly moduleRegistry: ModuleRegistryInterface;
    /** Configuration system */
    readonly config: ConfigInterface;
    /** Logger instance */
    readonly logger: LoggerInterface;
    /** Feature flag system */
    readonly featureFlags: FeatureFlagInterface;
    /** Get current kernel version */
    readonly version: string;
}

/**
 * Event bus interface for module communication
 */
export interface EventBusInterface {
    /** Publish an event to all subscribers */
    publish<T>(type: string, payload: T, options?: { source?: string; correlationId?: string }): Promise<void>;
    /** Subscribe to events */
    subscribe<T>(type: string, handler: (message: EventMessage<T>) => Promise<void> | void, options?: SubscriptionOptions): Subscription;
    /** Unsubscribe from events */
    unsubscribe(subscription: Subscription): void;
    /** Send a request and wait for response (RPC) */
    request<T, R>(target: string, type: string, payload: T, timeout?: number): Promise<R>;
    /** Register a request handler */
    onRequest<T, R>(type: string, handler: (payload: T, source: string) => Promise<R> | R): void;
    /** Remove a request handler */
    offRequest(type: string): void;
}

/**
 * Subscription handle for event bus
 */
export interface Subscription {
    /** Unique subscription ID */
    id: string;
    /** Event type */
    type: string;
    /** Unsubscribe function */
    unsubscribe: () => void;
}

/**
 * Module registry interface
 */
export interface ModuleRegistryInterface {
    /** Register a module */
    register(module: ModuleAPI): Promise<void>;
    /** Unregister a module */
    unregister(moduleId: string): Promise<void>;
    /** Get module by ID */
    get(moduleId: string): ModuleAPI | undefined;
    /** Get all registered modules */
    getAll(): ModuleAPI[];
    /** Get modules by tag */
    getByTag(tag: string): ModuleAPI[];
    /** Check if module is registered */
    has(moduleId: string): boolean;
    /** Get module health status */
    getHealth(moduleId: string): ModuleHealthStatus | undefined;
    /** Get dependency graph */
    getDependencyGraph(): DependencyGraph;
    /** Get topologically sorted load order */
    getLoadOrder(): string[];
    /** Update module health status */
    setHealth(moduleId: string, health: ModuleHealthStatus, error?: ModuleError): void;
}

/**
 * Dependency graph for module resolution
 */
export interface DependencyGraph {
    /** Nodes in the graph */
    nodes: Map<string, ModuleManifest>;
    /** Edges representing dependencies */
    edges: Map<string, Set<string>>;
    /** Topologically sorted load order */
    loadOrder: string[];
}

/**
 * Configuration interface
 */
export interface ConfigInterface {
    /** Get configuration value */
    get<T>(key: string, defaultValue?: T): T;
    /** Set configuration value */
    set(key: string, value: unknown): void;
    /** Get all configuration */
    getAll(): Record<string, unknown>;
    /** Validate configuration against schema */
    validate(schema: ZodSchema): { success: boolean; errors: string[] };
    /** Watch for configuration changes */
    watch(key: string, callback: (newValue: unknown, oldValue: unknown) => void): () => void;
    /** Load configuration from source */
    load(source: { priority: number; data: Record<string, unknown>; description?: string }): void;
    /** Reset to default configuration */
    reset(): void;
}

/**
 * Logger interface for structured logging
 */
export interface LoggerInterface {
    /** Log debug message */
    debug(message: string, meta?: Record<string, unknown>): void;
    /** Log info message */
    info(message: string, meta?: Record<string, unknown>): void;
    /** Log warning message */
    warn(message: string, meta?: Record<string, unknown>): void;
    /** Log error message */
    error(message: string, meta?: Record<string, unknown>): void;
    /** Create child logger with additional context */
    child(context: Record<string, unknown>): LoggerInterface;
}

/**
 * Feature flag interface
 */
export interface FeatureFlagInterface {
    /** Check if feature is enabled */
    isEnabled(flag: string): boolean;
    /** Enable a feature flag */
    enable(flag: string): void;
    /** Disable a feature flag */
    disable(flag: string): void;
    /** Get all feature flags */
    getAll(): Record<string, boolean>;
    /** Register a feature flag with default value */
    register(flag: string, defaultValue: boolean, description: string): void;
}

/**
 * Module sandbox interface
 * Provides isolation for module execution
 */
export interface ModuleSandboxInterface {
    /** Execute code in sandbox */
    execute<T>(fn: () => Promise<T> | T): Promise<T>;
    /** Set timeout for sandbox operations */
    setTimeout(callback: () => void, ms: number): NodeJS.Timeout;
    /** Clear timeout */
    clearTimeout(timeout: NodeJS.Timeout): void;
    /** Set interval for sandbox operations */
    setInterval(callback: () => void, ms: number): NodeJS.Timeout;
    /** Clear interval */
    clearInterval(interval: NodeJS.Timeout): void;
    /** Get allowed permissions for this module */
    getPermissions(): ModulePermission[];
    /** Check if module has permission */
    hasPermission(permission: ModulePermission): boolean;
}

/**
 * Module loader interface
 */
export interface ModuleLoaderInterface {
    /** Load a module from path */
    load(modulePath: string): Promise<ModuleAPI>;
    /** Unload a module */
    unload(moduleId: string): Promise<void>;
    /** Reload a module (hot swap) */
    reload(moduleId: string): Promise<ModuleAPI>;
    /** Get loaded modules */
    getLoadedModules(): Map<string, ModuleAPI>;
}

/**
 * Migration interface for version upgrades
 */
export interface MigrationInterface {
    /** Register a migration */
    register(fromVersion: string, toVersion: string, migration: MigrationFn): void;
    /** Run migrations for a module */
    run(moduleId: string, currentVersion: string, targetVersion: string): Promise<void>;
    /** Get pending migrations */
    getPending(currentVersion: string, targetVersion: string): MigrationFn[];
}

/**
 * Migration function type
 */
export type MigrationFn = (data: Record<string, unknown>) => Promise<Record<string, unknown>>;

/**
 * Adapter interface for external services
 * Allows swapping providers without changing module code
 */
export interface AdapterInterface<TConfig = unknown, TClient = unknown> {
    /** Adapter unique identifier */
    readonly id: string;
    /** Adapter human-readable name */
    readonly name: string;
    /** Adapter version */
    readonly version: string;
    /** Initialize adapter with configuration */
    initialize(config: TConfig): Promise<TClient>;
    /** Get the underlying client */
    getClient(): TClient | null;
    /** Check if adapter is healthy */
    healthCheck(): Promise<boolean>;
    /** Shutdown adapter */
    shutdown(): Promise<void>;
}

/**
 * Circuit breaker state
 */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
    /** Number of failures before opening circuit */
    failureThreshold: number;
    /** Time in ms before attempting to close circuit */
    resetTimeout: number;
    /** Number of successes in half-open state before closing */
    successThreshold: number;
    /** Timeout for requests in ms */
    timeout: number;
}

/**
 * Circuit breaker interface
 */
export interface CircuitBreakerInterface {
    /** Execute operation with circuit breaker protection */
    execute<T>(operation: () => Promise<T>): Promise<T>;
    /** Get current circuit state */
    getState(): CircuitBreakerState;
    /** Manually reset circuit */
    reset(): void;
    /** Get circuit statistics */
    getStats(): CircuitBreakerStats;
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
    state: CircuitBreakerState;
    failures: number;
    successes: number;
    lastFailure?: number;
    lastSuccess?: number;
    nextAttempt?: number;
}

/**
 * Cache interface with TTL support
 */
export interface CacheInterface<T = unknown> {
    /** Get value from cache */
    get(key: string): T | undefined;
    /** Set value in cache with TTL */
    set(key: string, value: T, ttlMs?: number): void;
    /** Delete value from cache */
    delete(key: string): boolean;
    /** Clear all cache */
    clear(): void;
    /** Get cache statistics */
    getStats(): CacheStats;
}

/**
 * Cache statistics
 */
export interface CacheStats {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
    status: ModuleHealthStatus;
    timestamp: number;
    uptime: number;
    checks: Record<string, { status: 'pass' | 'fail' | 'warn'; message?: string }>;
    metadata?: Record<string, unknown>;
}

/**
 * Kernel configuration
 */
export interface KernelConfig {
    /** Application name */
    appName: string;
    /** Application version */
    version: string;
    /** Module directories to scan */
    modulePaths: string[];
    /** Enable hot module reloading */
    hotReload: boolean;
    /** Default module timeout */
    moduleTimeout: number;
    /** Log level */
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    /** Feature flags */
    featureFlags: Record<string, boolean>;
    /** Circuit breaker defaults */
    circuitBreaker: CircuitBreakerConfig;
    /** Cache defaults */
    cache: { defaultTTL: number; maxSize: number };
}

/**
 * Module loader options
 */
export interface ModuleLoaderOptions {
    /** Module directory path */
    modulePath: string;
    /** Kernel instance */
    kernel: KernelInterface;
    /** Sandbox permissions */
    permissions: ModulePermission[];
    /** Module configuration */
    config: Record<string, unknown>;
}

/**
 * Module factory function type
 * Each module must export a default factory function
 */
export type ModuleFactory = (options: ModuleLoaderOptions) => Promise<ModuleAPI>;

/**
 * Module entry point exports
 */
export interface ModuleExports {
    /** Module manifest */
    manifest: ModuleManifest;
    /** Module factory function */
    default: ModuleFactory;
    /** Named exports for module API */
    [key: string]: unknown;
}

/**
 * Correlation ID generator for distributed tracing
 */
export function generateCorrelationId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Unique ID generator
 */
export function generateId(prefix = ''): string {
    return `${prefix}${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Deep clone utility
 */
export function deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout | null = null;
    return (...args: Parameters<T>) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
    fn: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle = false;
    return (...args: Parameters<T>) => {
        if (!inThrottle) {
            fn(...args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    options: {
        maxRetries: number;
        baseDelay: number;
        maxDelay: number;
        backoffFactor: number;
        retryableErrors?: string[];
    }
): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // Check if error is retryable
            if (options.retryableErrors && options.retryableErrors.length > 0) {
                const isRetryable = options.retryableErrors.some(code =>
                    error instanceof ModuleError && error.code === code
                );
                if (!isRetryable) throw lastError;
            }

            if (attempt === options.maxRetries) throw lastError;

            const delay = Math.min(
                options.baseDelay * Math.pow(options.backoffFactor, attempt),
                options.maxDelay
            );

            // Add jitter
            const jitter = delay * 0.1 * Math.random();
            await new Promise(resolve => setTimeout(resolve, delay + jitter));
        }
    }

    throw lastError!;
}