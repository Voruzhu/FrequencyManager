/**
 * @fileoverview Feature Flags System - Toggle features at runtime
 * @module core/feature-flags
 * 
 * Provides a system for enabling/disabling features without redeployment.
 * Features can be configured via configuration, environment variables, or runtime API.
 * 
 * @packageDocumentation
 */

import { FeatureFlagInterface } from '@shared/types';

/**
 * Feature Flags Implementation
 * 
 * WHY: Allows toggling features on/off without redeploying the application.
 * This enables:
 * - Gradual feature rollouts
 * - A/B testing
 * - Quick hotfixes by disabling problematic features
 * - Safe experimentation in production
 */
export class FeatureFlagSystem implements FeatureFlagInterface {
    private flags: Map<string, { enabled: boolean; description: string }> = new Map();

    /**
     * Check if a feature flag is enabled
     * @param flag The feature flag name
     * @returns True if the feature is enabled
     */
    isEnabled(flag: string): boolean {
        return this.flags.get(flag)?.enabled ?? false;
    }

    /**
     * Enable a feature flag
     * @param flag The feature flag name
     */
    enable(flag: string): void {
        const existing = this.flags.get(flag);
        this.flags.set(flag, { enabled: true, description: existing?.description || '' });
    }

    /**
     * Disable a feature flag
     * @param flag The feature flag name
     */
    disable(flag: string): void {
        const existing = this.flags.get(flag);
        this.flags.set(flag, { enabled: false, description: existing?.description || '' });
    }

    /**
     * Get all feature flags and their status
     * @returns Object mapping flag names to enabled status
     */
    getAll(): Record<string, boolean> {
        const result: Record<string, boolean> = {};
        for (const [key, value] of this.flags.entries()) {
            result[key] = value.enabled;
        }
        return result;
    }

    /**
     * Register a feature flag with a default value
     * @param flag The feature flag name
     * @param defaultValue Whether the feature should be enabled by default
     * @param description Description of what the feature does
     */
    register(flag: string, defaultValue: boolean, description: string): void {
        if (!this.flags.has(flag)) {
            this.flags.set(flag, { enabled: defaultValue, description });
        }
    }

    /**
     * Load feature flags from configuration
     * @param configFlags Object containing feature flag configurations
     */
    loadFromConfig(configFlags: Record<string, boolean | { enabled: boolean; description: string }>): void {
        for (const [flag, value] of Object.entries(configFlags)) {
            if (typeof value === 'boolean') {
                this.flags.set(flag, { enabled: value, description: '' });
            } else {
                this.flags.set(flag, { enabled: value.enabled, description: value.description || '' });
            }
        }
    }
}

/**
 * Export a singleton instance for convenience
 */
export const featureFlagSystem = new FeatureFlagSystem();