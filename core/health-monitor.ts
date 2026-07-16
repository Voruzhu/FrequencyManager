/**
 * @fileoverview Health Monitor - Centralized health checking for all modules
 * @module core/health-monitor
 * 
 * Provides periodic health checks, health status aggregation, and alerting
 * for the module ecosystem.
 * 
 * @packageDocumentation
 */

import { KernelInterface, ModuleHealthStatus, ModuleState } from '@shared/types';

/**
 * Health check result for a single module
 */
export interface ModuleHealthResult {
    moduleId: string;
    status: ModuleHealthStatus;
    timestamp: number;
    details?: Record<string, unknown>;
    error?: string;
}

/**
 * Aggregated system health
 */
export interface SystemHealth {
    overall: ModuleHealthStatus;
    modules: ModuleHealthResult[];
    timestamp: number;
    uptime: number;
}

/**
 * Health check configuration
 */
export interface HealthMonitorConfig {
    intervalMs: number;
    timeoutMs: number;
    degradedThreshold: number; // Number of degraded modules before system is degraded
    unhealthyThreshold: number; // Number of unhealthy modules before system is unhealthy
}

/**
 * Default health monitor configuration
 */
export const DEFAULT_HEALTH_CONFIG: HealthMonitorConfig = {
    intervalMs: 30000, // 30 seconds
    timeoutMs: 5000,   // 5 seconds
    degradedThreshold: 1,
    unhealthyThreshold: 2,
};

/**
 * Health Monitor Class
 * 
 * WHY: Centralized health monitoring allows the kernel to:
 * - Track overall system health
 * - Detect failing modules early
 * - Trigger automatic recovery (restart module)
 * - Provide health endpoints for external monitoring
 * - Alert on degraded performance
 */
export class HealthMonitor {
    private kernel: KernelInterface | null = null;
    private config: HealthMonitorConfig = DEFAULT_HEALTH_CONFIG;
    private intervalId: NodeJS.Timeout | null = null;
    private startTime: number = Date.now();
    private lastSystemHealth: SystemHealth | null = null;
    private healthHistory: SystemHealth[] = [];
    private maxHistorySize = 100;

    /**
     * Initialize the health monitor
     */
    initialize(kernel: KernelInterface, config?: Partial<HealthMonitorConfig>): void {
        this.kernel = kernel;
        this.config = { ...DEFAULT_HEALTH_CONFIG, ...config };
        this.startTime = Date.now();
        kernel.logger.info('[Health Monitor] Initialized', { config: this.config });
    }

    /**
     * Start periodic health checks
     */
    start(): void {
        if (this.intervalId) {
            return; // Already running
        }

        this.intervalId = setInterval(async () => {
            await this.performHealthCheck();
        }, this.config.intervalMs);

        this.kernel?.logger.info('[Health Monitor] Started periodic checks', {
            intervalMs: this.config.intervalMs
        });

        // Run initial check
        this.performHealthCheck();
    }

    /**
     * Stop periodic health checks
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.kernel?.logger.info('[Health Monitor] Stopped periodic checks');
        }
    }

    /**
     * Perform health check on all registered modules
     */
    async performHealthCheck(): Promise<SystemHealth> {
        if (!this.kernel) {
            throw new Error('Health monitor not initialized');
        }

        const moduleRegistry = this.kernel.moduleRegistry;
        const modules = moduleRegistry.getAll();
        const results: ModuleHealthResult[] = [];

        // Check each module with timeout
        const checkPromises = modules.map(async (module) => {
            const startTime = Date.now();

            try {
                // Create a promise that rejects after timeout
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error('Health check timeout')), this.config.timeoutMs);
                });

                const healthCheckPromise = module.healthCheck();
                const status = await Promise.race([healthCheckPromise, timeoutPromise]);

                const duration = Date.now() - startTime;

                results.push({
                    moduleId: module.moduleId,
                    status,
                    timestamp: Date.now(),
                    details: { checkDurationMs: duration },
                });
            } catch (error) {
                const duration = Date.now() - startTime;
                results.push({
                    moduleId: module.moduleId,
                    status: 'unhealthy',
                    timestamp: Date.now(),
                    details: { checkDurationMs: duration },
                    error: (error as Error).message,
                });

                this.kernel?.logger.warn('[Health Monitor] Module health check failed', {
                    moduleId: module.moduleId,
                    error: (error as Error).message,
                });
            }
        });

        await Promise.all(checkPromises);

        // Determine overall system health
        const overall = this.calculateOverallHealth(results);

        const systemHealth: SystemHealth = {
            overall,
            modules: results,
            timestamp: Date.now(),
            uptime: Date.now() - this.startTime,
        };

        // Store in history
        this.healthHistory.push(systemHealth);
        if (this.healthHistory.length > this.maxHistorySize) {
            this.healthHistory.shift();
        }

        this.lastSystemHealth = systemHealth;

        // Log health status changes
        this.logHealthChanges(systemHealth);

        // Publish health event
        await this.kernel.eventBus.publish('system:health-check', systemHealth, {
            source: 'health-monitor',
        });

        return systemHealth;
    }

    /**
     * Calculate overall system health from module results
     */
    private calculateOverallHealth(results: ModuleHealthResult[]): ModuleHealthStatus {
        const unhealthyCount = results.filter(r => r.status === 'unhealthy').length;
        const degradedCount = results.filter(r => r.status === 'degraded').length;

        if (unhealthyCount >= this.config.unhealthyThreshold) {
            return 'unhealthy';
        }
        if (unhealthyCount > 0 || degradedCount >= this.config.degradedThreshold) {
            return 'degraded';
        }
        return 'healthy';
    }

    /**
     * Log health status changes
     */
    private logHealthChanges(current: SystemHealth): void {
        if (!this.lastSystemHealth) return;

        const prevOverall = this.lastSystemHealth.overall;
        const currOverall = current.overall;

        if (prevOverall !== currOverall) {
            this.kernel?.logger.warn('[Health Monitor] System health changed', {
                from: prevOverall,
                to: currOverall,
                timestamp: current.timestamp,
            });
        }

        // Check individual module changes
        for (const currModule of current.modules) {
            const prevModule = this.lastSystemHealth.modules.find(m => m.moduleId === currModule.moduleId);
            if (prevModule && prevModule.status !== currModule.status) {
                this.kernel?.logger.warn('[Health Monitor] Module health changed', {
                    moduleId: currModule.moduleId,
                    from: prevModule.status,
                    to: currModule.status,
                    error: currModule.error,
                });
            }
        }
    }

    /**
     * Get last known system health
     */
    getLastHealth(): SystemHealth | null {
        return this.lastSystemHealth;
    }

    /**
     * Get health history
     */
    getHealthHistory(): SystemHealth[] {
        return [...this.healthHistory];
    }

    /**
     * Get health summary for a specific module
     */
    getModuleHealthHistory(moduleId: string): ModuleHealthResult[] {
        return this.healthHistory
            .map(h => h.modules.find(m => m.moduleId === moduleId))
            .filter((m): m is ModuleHealthResult => m !== undefined);
    }

    /**
     * Force a health check on a specific module
     */
    async checkModule(moduleId: string): Promise<ModuleHealthResult | null> {
        if (!this.kernel) {
            throw new Error('Health monitor not initialized');
        }

        const module = this.kernel.moduleRegistry.get(moduleId);
        if (!module) {
            return null;
        }

        const startTime = Date.now();
        try {
            const status = await module.healthCheck();
            return {
                moduleId,
                status,
                timestamp: Date.now(),
                details: { checkDurationMs: Date.now() - startTime },
            };
        } catch (error) {
            return {
                moduleId,
                status: 'unhealthy',
                timestamp: Date.now(),
                details: { checkDurationMs: Date.now() - startTime },
                error: (error as Error).message,
            };
        }
    }

    /**
     * Shutdown the health monitor
     */
    shutdown(): void {
        this.stop();
        this.healthHistory = [];
        this.lastSystemHealth = null;
        this.kernel?.logger.info('[Health Monitor] Shutdown');
    }
}

/**
 * Singleton instance
 */
export const healthMonitor = new HealthMonitor();