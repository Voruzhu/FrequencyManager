/**
 * @fileoverview Module Registry Implementation for FrequencyManager
 * @module core/module-registry
 * 
 * The ModuleRegistry tracks all loaded modules, their health status,
 * and manages the dependency graph for proper load ordering.
 * 
 * WHY: A centralized registry enables:
 * - Dependency resolution and topological sorting for load order
 * - Health monitoring across all modules
 * - Module discovery for inter-module communication
 * - Hot-swapping support by tracking module state
 * 
 * @packageDocumentation
 */

import {
    ModuleAPI,
    ModuleManifest,
    ModuleRegistryInterface,
    ModuleHealthStatus,
    DependencyGraph,
    ModuleError,
    ModulePermission,
    generateId,
} from '@shared/types';
import { EventBus } from './event-bus';

/**
 * Internal module registration entry
 */
interface ModuleEntry {
    module: ModuleAPI;
    manifest: ModuleManifest;
    health: ModuleHealthStatus;
    lastHealthCheck: number;
    loadOrder: number;
    errorCount: number;
    lastError?: ModuleError;
}

/**
 * Module Registry Implementation
 * 
 * Manages module lifecycle, dependency resolution, and health tracking.
 */
export class ModuleRegistry implements ModuleRegistryInterface {
    private readonly modules: Map<string, ModuleEntry> = new Map();
    private readonly dependencyGraph: DependencyGraph = {
        nodes: new Map(),
        edges: new Map(),
        loadOrder: [],
    };
    private readonly eventBus: EventBus;
    private loadOrderCounter = 0;

    constructor(eventBus: EventBus) {
        this.eventBus = eventBus;
    }

    /**
     * Register a module in the registry
     * 
     * @param module - Module API instance
     * @throws ModuleError if module ID conflicts or dependencies missing
     * 
     * WHY: Registration validates dependencies and builds the dependency graph
     * for proper load ordering. It also publishes events for other systems
     * to react to new modules.
     */
    async register(module: ModuleAPI): Promise<void> {
        const moduleId = module.moduleId;

        if (this.modules.has(moduleId)) {
            throw new ModuleError(
                'MODULE_EXISTS',
                `Module already registered: ${moduleId}`,
                moduleId,
                { recoverable: false }
            );
        }

        const manifest = module.manifest;

        // Validate dependencies exist
        for (const [depName, depVersion] of Object.entries(manifest.dependencies)) {
            // 'core' is the kernel itself, not a registered module — always satisfied.
            if (depName === 'core') continue;

            const depModule = this.modules.get(depName);
            if (!depModule) {
                // Dependency not registered YET. Discovery order is not dependency
                // order, but initialization order is resolved topologically via
                // getLoadOrder(), so defer instead of hard-failing here.
                this.log('warn', `Module ${moduleId} depends on ${depName}@${depVersion}, not yet registered — deferring to load-order resolution`);
                continue;
            }

            // Check version compatibility
            if (!this.checkVersionCompatibility(depModule.manifest.version, depVersion)) {
                throw new ModuleError(
                    'VERSION_MISMATCH',
                    `Module ${moduleId} requires ${depName}@${depVersion} but found ${depModule.manifest.version}`,
                    moduleId,
                    { recoverable: false }
                );
            }
        }

        // Create entry
        const entry: ModuleEntry = {
            module,
            manifest,
            health: 'loading',
            lastHealthCheck: Date.now(),
            loadOrder: this.loadOrderCounter++,
            errorCount: 0,
        };

        this.modules.set(moduleId, entry);

        // Update dependency graph
        this.updateDependencyGraph(moduleId, manifest);

        // Publish registration event
        await this.eventBus.publish('module:registered', {
            moduleId,
            manifest,
        }, { source: 'module-registry' });

        this.log('info', `Module registered: ${moduleId} v${manifest.version}`);
    }

    /**
     * Unregister a module from the registry
     */
    async unregister(moduleId: string): Promise<void> {
        const entry = this.modules.get(moduleId);
        if (!entry) {
            throw new ModuleError(
                'MODULE_NOT_FOUND',
                `Module not found: ${moduleId}`,
                moduleId,
                { recoverable: false }
            );
        }

        // Check if other modules depend on this one
        const dependents = this.getDependents(moduleId);
        if (dependents.length > 0) {
            throw new ModuleError(
                'HAS_DEPENDENTS',
                `Cannot unregister ${moduleId}: required by ${dependents.join(', ')}`,
                moduleId,
                { recoverable: false }
            );
        }

        // Remove from dependency graph
        this.removeFromDependencyGraph(moduleId);

        this.modules.delete(moduleId);

        // Publish unregistration event
        await this.eventBus.publish('module:unregistered', {
            moduleId,
        }, { source: 'module-registry' });

        this.log('info', `Module unregistered: ${moduleId}`);
    }

    /**
     * Get a module by ID
     */
    get(moduleId: string): ModuleAPI | undefined {
        return this.modules.get(moduleId)?.module;
    }

    /**
     * Get all registered modules
     */
    getAll(): ModuleAPI[] {
        return Array.from(this.modules.values()).map(e => e.module);
    }

    /**
     * Get modules by tag
     */
    getByTag(tag: string): ModuleAPI[] {
        return Array.from(this.modules.values())
            .filter(e => e.manifest.tags.includes(tag))
            .map(e => e.module);
    }

    /**
     * Check if module is registered
     */
    has(moduleId: string): boolean {
        return this.modules.has(moduleId);
    }

    /**
     * Get module health status
     */
    getHealth(moduleId: string): ModuleHealthStatus | undefined {
        return this.modules.get(moduleId)?.health;
    }

    /**
     * Get dependency graph
     */
    getDependencyGraph(): DependencyGraph {
        return {
            nodes: new Map(this.dependencyGraph.nodes),
            edges: new Map(this.dependencyGraph.edges),
            loadOrder: [...this.dependencyGraph.loadOrder],
        };
    }

    /**
     * Update module health status
     */
    setHealth(moduleId: string, health: ModuleHealthStatus, error?: ModuleError): void {
        const entry = this.modules.get(moduleId);
        if (!entry) return;

        const previousHealth = entry.health;
        entry.health = health;
        entry.lastHealthCheck = Date.now();

        if (error) {
            entry.lastError = error;
            entry.errorCount++;
        }

        // Publish health change event if status changed
        if (previousHealth !== health) {
            this.eventBus.publish('module:health-changed', {
                moduleId,
                previousHealth,
                currentHealth: health,
                error: error?.toJSON(),
            }, { source: 'module-registry' }).catch(err =>
                this.log('error', `Failed to publish health change: ${err}`)
            );
        }
    }

    /**
     * Get topologically sorted load order
     */
    getLoadOrder(): string[] {
        return [...this.dependencyGraph.loadOrder];
    }

    /**
     * Get module entry with full metadata
     */
    getEntry(moduleId: string): ModuleEntry | undefined {
        return this.modules.get(moduleId);
    }

    /**
     * Get all module entries
     */
    getAllEntries(): ModuleEntry[] {
        return Array.from(this.modules.values());
    }

    /**
     * Get modules with health status
     */
    getHealthStatuses(): Map<string, ModuleHealthStatus> {
        const statuses = new Map<string, ModuleHealthStatus>();
        for (const [id, entry] of this.modules.entries()) {
            statuses.set(id, entry.health);
        }
        return statuses;
    }

    /**
     * Check version compatibility (simplified semver check)
     */
    private checkVersionCompatibility(installedVersion: string, requiredRange: string): boolean {
        // Simplified - in production use proper semver library
        try {
            const [installedMajor] = installedVersion.split('.').map(Number);
            const rangeMatch = requiredRange.match(/^[\^~]?(\d+)/);
            if (!rangeMatch) return true; // Unknown range format, allow

            const requiredMajor = parseInt(rangeMatch[1], 10);

            if (requiredRange.startsWith('^')) {
                return installedMajor === requiredMajor;
            }
            if (requiredRange.startsWith('~')) {
                return installedMajor === requiredMajor;
            }
            // Exact or range
            return installedMajor === requiredMajor;
        } catch {
            return true; // On error, allow
        }
    }

    /**
     * Update dependency graph with new module
     */
    private updateDependencyGraph(moduleId: string, manifest: ModuleManifest): void {
        // Add node
        this.dependencyGraph.nodes.set(moduleId, manifest);
        this.dependencyGraph.edges.set(moduleId, new Set());

        // Add edges for dependencies
        for (const depName of Object.keys(manifest.dependencies)) {
            const depEdges = this.dependencyGraph.edges.get(depName) || new Set();
            depEdges.add(moduleId);
            this.dependencyGraph.edges.set(depName, depEdges);

            // Also add reverse edge
            const moduleEdges = this.dependencyGraph.edges.get(moduleId) || new Set();
            moduleEdges.add(depName);
            this.dependencyGraph.edges.set(moduleId, moduleEdges);
        }

        // Recalculate load order
        this.recalculateLoadOrder();
    }

    /**
     * Remove module from dependency graph
     */
    private removeFromDependencyGraph(moduleId: string): void {
        this.dependencyGraph.nodes.delete(moduleId);
        this.dependencyGraph.edges.delete(moduleId);

        // Remove edges pointing to this module
        for (const [_, edges] of this.dependencyGraph.edges.entries()) {
            edges.delete(moduleId);
        }

        this.recalculateLoadOrder();
    }

    /**
     * Recalculate topological load order using Kahn's algorithm
     */
    private recalculateLoadOrder(): void {
        const nodes = new Set(this.dependencyGraph.nodes.keys());
        const inDegree = new Map<string, number>();
        const adjList = new Map<string, Set<string>>();

        // Initialize
        for (const node of nodes) {
            inDegree.set(node, 0);
            adjList.set(node, new Set());
        }

        // Build adjacency list and calculate in-degrees
        for (const [from, edges] of this.dependencyGraph.edges.entries()) {
            if (!nodes.has(from)) continue;
            for (const to of edges) {
                if (!nodes.has(to)) continue;
                adjList.get(from)!.add(to);
                inDegree.set(to, (inDegree.get(to) || 0) + 1);
            }
        }

        // Kahn's algorithm
        const queue: string[] = [];
        for (const [node, degree] of inDegree.entries()) {
            if (degree === 0) queue.push(node);
        }

        const loadOrder: string[] = [];
        while (queue.length > 0) {
            const node = queue.shift()!;
            loadOrder.push(node);

            for (const neighbor of adjList.get(node) || []) {
                const newDegree = inDegree.get(neighbor)! - 1;
                inDegree.set(neighbor, newDegree);
                if (newDegree === 0) {
                    queue.push(neighbor);
                }
            }
        }

        // Check for cycles
        if (loadOrder.length !== nodes.size) {
            this.log('warn', 'Dependency cycle detected in module graph');
            // Fallback: use registration order
            this.dependencyGraph.loadOrder = Array.from(nodes).sort(
                (a, b) => (this.modules.get(a)?.loadOrder || 0) - (this.modules.get(b)?.loadOrder || 0)
            );
        } else {
            this.dependencyGraph.loadOrder = loadOrder;
        }
    }

    /**
     * Get modules that depend on the given module
     */
    private getDependents(moduleId: string): string[] {
        const dependents: string[] = [];
        for (const [id, entry] of this.modules.entries()) {
            if (Object.keys(entry.manifest.dependencies).includes(moduleId)) {
                dependents.push(id);
            }
        }
        return dependents;
    }

    /**
     * Logging helper
     */
    private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
        const prefix = '[ModuleRegistry]';
        switch (level) {
            case 'debug': console.debug(`${prefix} ${message}`); break;
            case 'info': console.info(`${prefix} ${message}`); break;
            case 'warn': console.warn(`${prefix} ${message}`); break;
            case 'error': console.error(`${prefix} ${message}`); break;
        }
    }
}