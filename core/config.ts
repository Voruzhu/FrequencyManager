/**
 * @fileoverview Configuration System - Centralized configuration management
 * @module core/config
 * 
 * Provides type-safe configuration management with validation, environment-specific
 * overrides, and runtime updates.
 * 
 * @packageDocumentation
 */

import { ZodSchema, ZodTypeAny } from 'zod';
import { LoggerInterface } from '@shared/types';

/**
 * Configuration change event
 */
export interface ConfigChangeEvent<T = unknown> {
    key: string;
    newValue: T;
    oldValue: T;
    timestamp: number;
}

/**
 * Configuration source priority (lower numbers override higher numbers)
 */
export enum ConfigSourcePriority {
    DEFAULT = 0,        // Default values
    FILE = 10,          // Configuration files
    ENVIRONMENT = 20,   // Environment variables
    RUNTIME = 30,       // Runtime changes
}

/**
 * Configuration source definition
 */
export interface ConfigSource {
    priority: ConfigSourcePriority;
    data: Record<string, unknown>;
    description?: string;
}

/**
 * Configuration system interface
 */
export interface ConfigInterface {
    /** Get configuration value with optional default */
    get<T>(key: string, defaultValue?: T): T;

    /** Set configuration value at runtime */
    set(key: string, value: unknown): void;

    /** Get all configuration as object */
    getAll(): Record<string, unknown>;

    /** Validate configuration against schema */
    validate(schema: ZodSchema): { success: boolean; errors: string[] };

    /** Watch for configuration changes */
    watch(key: string, callback: (newValue: unknown, oldValue: unknown) => void): () => void;

    /** Load configuration from source */
    load(source: ConfigSource): void;

    /** Reset to default configuration */
    reset(): void;
}

/**
 * Configuration System Implementation
 * 
 * WHY: Centralized configuration management allows:
 * - Type-safe configuration access
 * - Environment-specific overrides
 * - Runtime configuration updates
 * - Validation against schemas
 * - Change notifications
 */
export class ConfigSystem implements ConfigInterface {
    private values: Map<string, unknown> = new Map();
    private defaults: Map<string, unknown> = new Map();
    private watchers: Map<string, Set<(newValue: unknown, oldValue: unknown) => void>> = new Map();
    private sources: ConfigSource[] = [];
    private logger: LoggerInterface | null = null;

    constructor(private readonly schema: ZodTypeAny | null = null) { }

    /**
     * Initialize the configuration system
     */
    initialize(logger: LoggerInterface): void {
        this.logger = logger;
        this.logger.info('[Config System] Initialized');
    }

    /**
     * Get configuration value with optional default
     */
    get<T>(key: string, defaultValue?: T): T {
        const value = this.values.get(key);
        if (value !== undefined) {
            return value as T;
        }
        return defaultValue as T;
    }

    /**
     * Set configuration value at runtime
     */
    set(key: string, value: unknown): void {
        const oldValue = this.values.get(key);
        this.values.set(key, value);

        // Notify watchers
        this.notifyWatchers(key, value, oldValue);

        this.logger?.debug(`[Config System] Setting config`, { key, oldValue, newValue: value });
    }

    /**
     * Get all configuration as object
     */
    getAll(): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        for (const [key, value] of this.entries()) {
            result[key] = value;
        }
        return result;
    }

    /**
     * Validate configuration against schema
     */
    validate(schema: ZodSchema): { success: boolean; errors: string[] } {
        const configObj = this.getAll();
        const result = schema.safeParse(configObj);

        if (result.success) {
            return { success: true, errors: [] };
        } else {
            // Zod error formatting
            const errors = result.error.issues.map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`);
            return { success: false, errors };
        }
    }

    /**
     * Watch for configuration changes
     */
    watch(key: string, callback: (newValue: unknown, oldValue: unknown) => void): () => void {
        if (!this.watchers.has(key)) {
            this.watchers.set(key, new Set());
        }
        this.watchers.get(key)!.add(callback);

        // Return unsubscribe function
        return () => {
            const watchers = this.watchers.get(key);
            if (watchers) {
                watchers.delete(callback);
                if (watchers.size === 0) {
                    this.watchers.delete(key);
                }
            }
        };
    }

    /**
     * Load configuration from source
     */
    load(source: ConfigSource): void {
        // Insert source in priority order (lower numbers first)
        let inserted = false;
        for (let i = 0; i < this.sources.length; i++) {
            if (source.priority < this.sources[i].priority) {
                this.sources.splice(i, 0, source);
                inserted = true;
                break;
            }
        }
        if (!inserted) {
            this.sources.push(source);
        }

        // Apply source data (overwrites existing values)
        for (const [key, value] of Object.entries(source.data)) {
            const oldValue = this.values.get(key);
            this.values.set(key, value);
            this.notifyWatchers(key, value, oldValue);
        }

        this.logger?.info('[Config System] Loaded configuration source', {
            priority: source.priority,
            description: source.description,
            keys: Object.keys(source.data)
        });
    }

    /**
     * Reset to default configuration
     */
    reset(): void {
        this.values.clear();
        // Restore defaults
        for (const [key, value] of this.defaults) {
            this.values.set(key, value);
        }
        this.notifyAllWatchers();
        this.logger?.info('[Config System] Reset to defaults');
    }

    /**
     * Set default value for a key
     */
    setDefault(key: string, value: unknown): void {
        this.defaults.set(key, value);
        // If not already set, apply default
        if (!this.values.has(key)) {
            this.values.set(key, value);
        }
    }

    /**
     * Get all entries as iterable.
     * NOTE: must `yield*` — a bare `return` from a generator sets the return
     * value (ignored by for-of) and yields nothing, so getAll() would be empty.
     */
    *entries(): Iterable<[string, unknown]> {
        yield* this.values.entries();
    }

    /**
     * Notify watchers of a change
     */
    private notifyWatchers(key: string, newValue: unknown, oldValue: unknown): void {
        const watchers = this.watchers.get(key);
        if (watchers) {
            watchers.forEach(callback => {
                try {
                    callback(newValue, oldValue);
                } catch (error) {
                    this.logger?.error('[Config System] Error in watcher callback', {
                        key,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            });
        }
    }

    /**
     * Notify all watchers (used on reset)
     */
    private notifyAllWatchers(): void {
        for (const [key, value] of this.entries()) {
            this.notifyWatchers(key, value, undefined);
        }
    }
}

/**
 * Create a new configuration system instance
 */
export function createConfigSystem(schema: ZodTypeAny | null = null): ConfigSystem {
    return new ConfigSystem(schema);
}