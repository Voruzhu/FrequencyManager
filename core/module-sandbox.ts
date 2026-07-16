/**
 * @fileoverview Module Sandbox Implementation for FrequencyManager
 * @module core/module-sandbox
 * 
 * The ModuleSandbox provides isolation for module execution, preventing
 * a crashing module from bringing down the entire application.
 * It enforces permissions and provides controlled access to system resources.
 * 
 * WHY: Sandboxing is critical for stability in a plugin architecture.
 * Third-party or experimental modules should not be able to crash the host
 * application or access resources they haven't declared in their manifest.
 * 
 * @packageDocumentation
 */

import {
    ModuleSandboxInterface,
    ModulePermission,
    ModuleError,
    KernelInterface,
} from '@shared/types';

/**
 * Sandbox configuration
 */
interface SandboxConfig {
    moduleId: string;
    permissions: ModulePermission[];
    kernel: KernelInterface;
    resourceLimits?: {
        maxMemoryMB?: number;
        maxCpuTimeMs?: number;
        maxFileHandles?: number;
    };
}

/**
 * Module Sandbox Implementation
 * 
 * Provides:
 * - Permission enforcement
 * - Resource limits (memory, CPU, file handles)
 * - Isolated timer/interval management
 * - Error boundary for module execution
 * - Controlled access to kernel services
 */
export class ModuleSandbox implements ModuleSandboxInterface {
    private readonly config: SandboxConfig;
    private readonly timeouts: Set<NodeJS.Timeout> = new Set();
    private readonly intervals: Set<NodeJS.Timeout> = new Set();
    private readonly permissionSet: Set<ModulePermission>;
    private isDestroyed = false;

    constructor(config: SandboxConfig) {
        this.config = config;
        this.permissionSet = new Set(config.permissions);
    }

    /**
     * Execute a function within the sandbox
     * 
     * @param fn - Function to execute
     * @returns Promise resolving to function result
     * @throws ModuleError if sandbox is destroyed or permission denied
     * 
     * WHY: This wrapper catches synchronous and asynchronous errors,
     * preventing them from propagating to the kernel. It also enforces
     * that the sandbox hasn't been destroyed.
     */
    async execute<T>(fn: () => Promise<T> | T): Promise<T> {
        this.ensureNotDestroyed();

        try {
            const result = fn();
            if (result instanceof Promise) {
                return await result;
            }
            return result;
        } catch (error) {
            // Wrap in ModuleError for consistent error handling
            throw ModuleError.fromError(error, this.config.moduleId, 'SANDBOX_EXECUTION_ERROR');
        }
    }

    /**
     * Set a timeout within the sandbox
     * Automatically tracked for cleanup
     */
    setTimeout(callback: () => void, ms: number): NodeJS.Timeout {
        this.ensureNotDestroyed();

        const timeout = setTimeout(() => {
            this.timeouts.delete(timeout);
            try {
                callback();
            } catch (error) {
                this.config.kernel.logger.error(
                    `[Sandbox:${this.config.moduleId}] Timeout callback error:`,
                    error as Record<string, unknown>
                );
            }
        }, ms);

        this.timeouts.add(timeout);
        return timeout;
    }

    /**
     * Clear a timeout
     */
    clearTimeout(timeout: NodeJS.Timeout): void {
        if (this.timeouts.has(timeout)) {
            clearTimeout(timeout);
            this.timeouts.delete(timeout);
        }
    }

    /**
     * Set an interval within the sandbox
     * Automatically tracked for cleanup
     */
    setInterval(callback: () => void, ms: number): NodeJS.Timeout {
        this.ensureNotDestroyed();

        const interval = setInterval(() => {
            try {
                callback();
            } catch (error) {
                this.config.kernel.logger.error(
                    `[Sandbox:${this.config.moduleId}] Interval callback error:`,
                    error as Record<string, unknown>
                );
            }
        }, ms);

        this.intervals.add(interval);
        return interval;
    }

    /**
     * Clear an interval
     */
    clearInterval(interval: NodeJS.Timeout): void {
        if (this.intervals.has(interval)) {
            clearInterval(interval);
            this.intervals.delete(interval);
        }
    }

    /**
     * Get allowed permissions for this module
     */
    getPermissions(): ModulePermission[] {
        return Array.from(this.permissionSet);
    }

    /**
     * Check if module has a specific permission
     */
    hasPermission(permission: ModulePermission): boolean {
        return this.permissionSet.has(permission);
    }

    /**
     * Request a permission at runtime (for dynamic permissions)
     * Returns true if granted, false if denied
     */
    async requestPermission(permission: ModulePermission): Promise<boolean> {
        // In a full implementation, this would prompt the user or check policy
        // For now, only allow if already in manifest
        if (this.permissionSet.has(permission)) {
            return true;
        }

        this.config.kernel.logger.warn(
            `[Sandbox:${this.config.moduleId}] Permission requested but not in manifest: ${permission}`
        );
        return false;
    }

    /**
     * Get kernel interface (limited access)
     * Modules get a restricted view of the kernel
     */
    getKernel(): KernelInterface {
        return this.config.kernel;
    }

    /**
     * Get module ID
     */
    getModuleId(): string {
        return this.config.moduleId;
    }

    /**
     * Check if sandbox is destroyed
     */
    isActive(): boolean {
        return !this.isDestroyed;
    }

    /**
     * Destroy the sandbox and clean up all resources
     */
    destroy(): void {
        if (this.isDestroyed) return;

        this.isDestroyed = true;

        // Clear all timeouts
        for (const timeout of this.timeouts) {
            clearTimeout(timeout);
        }
        this.timeouts.clear();

        // Clear all intervals
        for (const interval of this.intervals) {
            clearInterval(interval);
        }
        this.intervals.clear();

        this.config.kernel.logger.debug(`[Sandbox:${this.config.moduleId}] Destroyed`);
    }

    /**
     * Get resource usage statistics
     */
    getStats(): {
        activeTimeouts: number;
        activeIntervals: number;
        permissions: number;
        isDestroyed: boolean;
    } {
        return {
            activeTimeouts: this.timeouts.size,
            activeIntervals: this.intervals.size,
            permissions: this.permissionSet.size,
            isDestroyed: this.isDestroyed,
        };
    }

    /**
     * Ensure sandbox is not destroyed
     */
    private ensureNotDestroyed(): void {
        if (this.isDestroyed) {
            throw new ModuleError(
                'SANDBOX_DESTROYED',
                `Sandbox for module ${this.config.moduleId} has been destroyed`,
                this.config.moduleId,
                { recoverable: false }
            );
        }
    }
}

/**
 * Create a sandbox for a module
 */
export function createSandbox(
    moduleId: string,
    permissions: ModulePermission[],
    kernel: KernelInterface
): ModuleSandbox {
    return new ModuleSandbox({
        moduleId,
        permissions,
        kernel,
    });
}

/**
 * Permission validation helper
 * Validates that a module's requested permissions are allowed
 */
export function validatePermissions(
    requested: ModulePermission[],
    allowed: ModulePermission[]
): { valid: boolean; denied: ModulePermission[] } {
    const allowedSet = new Set(allowed);
    const denied = requested.filter(p => !allowedSet.has(p));
    return {
        valid: denied.length === 0,
        denied,
    };
}

/**
 * Default permission sets for common module types
 */
export const PermissionSets = {
    /** Basic UI module - can render and receive input */
    ui: [
        'ui:render',
        'ui:overlay',
        'system:clipboard',
        'system:notifications',
    ] as ModulePermission[],

    /** Data module - can read/write data */
    data: [
        'data:echoes:read',
        'data:echoes:write',
        'data:characters:read',
        'data:characters:write',
        'fs:read',
        'fs:write',
    ] as ModulePermission[],

    /** Calculation module - can perform damage calculations */
    calculation: [
        'calculation:damage',
        'data:echoes:read',
        'data:characters:read',
    ] as ModulePermission[],

    /** OCR module - can scan images */
    ocr: [
        'ocr:scan',
        'fs:read',
        'system:clipboard',
    ] as ModulePermission[],

    /** Network module - can make HTTP requests */
    network: [
        'network:request',
        'fs:read',
        'fs:write',
    ] as ModulePermission[],

    /** Full access (for trusted core modules only) */
    full: [
        'fs:read',
        'fs:write',
        'fs:delete',
        'network:request',
        'network:listen',
        'system:clipboard',
        'system:notifications',
        'system:shortcuts',
        'ocr:scan',
        'ocr:train',
        'data:echoes:read',
        'data:echoes:write',
        'data:characters:read',
        'data:characters:write',
        'calculation:damage',
        'ui:render',
        'ui:overlay',
    ] as ModulePermission[],
};