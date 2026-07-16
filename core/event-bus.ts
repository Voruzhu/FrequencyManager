/**
 * @fileoverview Event Bus Implementation for FrequencyManager
 * @module core/event-bus
 * 
 * The EventBus is the central communication backbone for all modules.
 * It implements both pub/sub and request/response (RPC) patterns.
 * All messages are serializable for future microservice splitting.
 * 
 * WHY: Using a centralized event bus decouples modules completely.
 * Modules never import each other directly - they only communicate
 * through typed events. This enables hot-swapping, independent versioning,
 * and future migration to microservices.
 * 
 * @packageDocumentation
 */

import { EventEmitter } from 'eventemitter3';
import {
    EventMessage,
    RequestMessage,
    ResponseMessage,
    Subscription,
    SubscriptionOptions,
    EventBusInterface,
    ModuleError,
    generateId,
    generateCorrelationId,
    LoggerInterface,
} from '@shared/types';

/**
 * Internal subscription representation
 */
interface InternalSubscription<T = unknown> {
    id: string;
    type: string;
    handler: (message: EventMessage<T>) => Promise<void> | void;
    options: SubscriptionOptions;
    createdAt: number;
}

/**
 * Pending request for RPC pattern
 */
interface PendingRequest<R = unknown> {
    resolve: (value: R) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    correlationId: string;
    timestamp: number;
}

/**
 * Request handler registration
 */
interface RequestHandler<T = unknown, R = unknown> {
    type: string;
    handler: (payload: T, source: string) => Promise<R> | R;
}

/**
 * EventBus Implementation
 * 
 * Provides:
 * - Pub/Sub pattern for event broadcasting
 * - Request/Response pattern for RPC-style communication
 * - Message serialization for distributed tracing
 * - Subscription filtering and priority ordering
 * - Automatic cleanup of timed-out requests
 */
export class EventBus implements EventBusInterface {
    private readonly emitter: EventEmitter;
    private readonly subscriptions: Map<string, InternalSubscription<unknown>[]> = new Map();
    private readonly pendingRequests: Map<string, PendingRequest<unknown>> = new Map();
    private readonly requestHandlers: Map<string, RequestHandler<unknown, unknown>> = new Map();
    private readonly defaultRequestTimeout = 30000; // 30 seconds
    private readonly cleanupInterval: NodeJS.Timeout;
    private readonly logger: LoggerInterface;

    constructor(logger: LoggerInterface = console as unknown as LoggerInterface) {
        this.emitter = new EventEmitter();
        this.logger = logger;

        // Periodic cleanup of expired requests
        this.cleanupInterval = setInterval(() => this.cleanupExpiredRequests(), 60000);
        this.cleanupInterval.unref(); // Don't prevent process exit
    }

    /**
     * Publish an event to all subscribers
     * 
     * @param type - Event type/topic
     * @param payload - Event payload (must be serializable)
     * @param options - Optional source and correlation ID
     * 
     * WHY: We use correlation IDs for distributed tracing. When a request
     * triggers multiple events, they all share the same correlation ID,
     * allowing us to trace the full flow across modules.
     */
    async publish<T>(
        type: string,
        payload: T,
        options: { source?: string; correlationId?: string } = {}
    ): Promise<void> {
        const message: EventMessage<T> = {
            id: generateId('evt-'),
            type,
            source: options.source || 'kernel',
            payload,
            timestamp: Date.now(),
            correlationId: options.correlationId || generateCorrelationId(),
        };

        // Emit to type-specific subscribers
        this.emitter.emit(type, message);

        // Also emit to wildcard subscribers
        this.emitter.emit('*', message);

        this.logger.debug(`[EventBus] Published event: ${type}`, {
            eventId: message.id,
            correlationId: message.correlationId,
            source: message.source,
        });
    }

    /**
     * Subscribe to events with optional filtering and priority
     * 
     * @param type - Event type to subscribe to (use '*' for all events)
     * @param handler - Async handler function
     * @param options - Subscription options (filter, once, priority)
     * @returns Subscription handle for unsubscribing
     * 
     * WHY: Priority ordering ensures critical handlers (like security audit)
     * run before business logic handlers. Filter functions allow modules
     * to only process relevant events without manual checking.
     */
    subscribe<T>(
        type: string,
        handler: (message: EventMessage<T>) => Promise<void> | void,
        options: SubscriptionOptions = {}
    ): Subscription {
        const subscription: InternalSubscription<T> = {
            id: generateId('sub-'),
            type,
            handler,
            options: {
                filter: options.filter,
                once: options.once ?? false,
                priority: options.priority ?? 0,
            },
            createdAt: Date.now(),
        };

        // Add to subscription map
        const subs = this.subscriptions.get(type) || [];
        subs.push(subscription as InternalSubscription<unknown>);

        // Sort by priority (higher priority first)
        subs.sort((a, b) => (b.options.priority || 0) - (a.options.priority || 0));
        this.subscriptions.set(type, subs);

        // Register with emitter
        const emitterHandler = async (message: EventMessage<T>) => {
            try {
                // Apply filter if provided
                if (subscription.options.filter && !subscription.options.filter(message)) {
                    return;
                }

                await handler(message);

                // Auto-unsubscribe if 'once' option
                if (subscription.options.once) {
                    this.unsubscribe({ id: subscription.id, type, unsubscribe: () => { } });
                }
            } catch (error) {
                this.logger.error(`[EventBus] Handler error for ${type}:`, error as Record<string, unknown>);
                // Don't rethrow - one bad handler shouldn't break others
            }
        };

        this.emitter.on(type, emitterHandler);

        // Store emitter handler reference for cleanup
        (subscription as InternalSubscription & { emitterHandler: (message: EventMessage<T>) => Promise<void> }).emitterHandler = emitterHandler;

        this.logger.debug(`[EventBus] Subscribed to: ${type}`, {
            subscriptionId: subscription.id,
            priority: subscription.options.priority,
        });

        return {
            id: subscription.id,
            type,
            unsubscribe: () => this.unsubscribe({ id: subscription.id, type, unsubscribe: () => { } }),
        };
    }

    /**
     * Unsubscribe from events
     */
    unsubscribe(subscription: Subscription): void {
        const subs = this.subscriptions.get(subscription.type);
        if (!subs) return;

        const index = subs.findIndex(s => s.id === subscription.id);
        if (index === -1) return;

        const [removed] = subs.splice(index, 1);

        // Remove from emitter
        const emitterHandler = (removed as InternalSubscription & { emitterHandler: (...args: unknown[]) => void }).emitterHandler;
        if (emitterHandler) {
            this.emitter.off(subscription.type, emitterHandler);
        }

        if (subs.length === 0) {
            this.subscriptions.delete(subscription.type);
        }

        this.logger.debug(`[EventBus] Unsubscribed from: ${subscription.type}`, {
            subscriptionId: subscription.id,
        });
    }

    /**
     * Send a request and wait for response (RPC pattern)
     * 
     * @param target - Target module ID
     * @param type - Request type
     * @param payload - Request payload
     * @param timeout - Optional timeout in ms
     * @returns Response payload
     * 
     * WHY: RPC pattern allows synchronous-style communication while
     * maintaining loose coupling. The target module registers a handler
     * for the request type and responds directly.
     */
    async request<T, R>(
        target: string,
        type: string,
        payload: T,
        timeout = this.defaultRequestTimeout
    ): Promise<R> {
        const correlationId = generateCorrelationId();
        const requestId = generateId('req-');

        const requestMessage: RequestMessage<T> = {
            id: requestId,
            type,
            source: 'kernel',
            target,
            payload,
            timestamp: Date.now(),
            correlationId,
            responseType: `${type}:response`,
            timeout,
        };

        // Create promise that resolves when response arrives
        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                this.pendingRequests.delete(correlationId);
                reject(new ModuleError(
                    'REQUEST_TIMEOUT',
                    `Request to ${target}:${type} timed out after ${timeout}ms`,
                    target,
                    { recoverable: true }
                ));
            }, timeout);

            const pending: PendingRequest<unknown> = {
                resolve: resolve as (value: unknown) => void,
                reject,
                timeout: timeoutHandle,
                correlationId,
                timestamp: Date.now(),
            };

            this.pendingRequests.set(correlationId, pending as PendingRequest<unknown>);

            // Publish for any observers/subscribers, THEN dispatch to the
            // registered request handler so the pending promise resolves.
            // Without this dispatch, request() would only publish and hang until
            // timeout (there is no other production caller of handleRequest).
            this.publish(type, payload, { source: 'kernel', correlationId });
            void this.handleRequest(requestMessage);
        });
    }

    /**
     * Register a request handler for RPC pattern
     * 
     * @param type - Request type to handle
     * @param handler - Handler function that returns response
     * 
     * WHY: Modules register handlers for specific request types.
     * Only one handler per type is allowed (last registration wins).
     * This prevents ambiguous routing.
     */
    onRequest<T, R>(
        type: string,
        handler: (payload: T, source: string) => Promise<R> | R
    ): void {
        this.requestHandlers.set(type, { type, handler: handler as (payload: unknown, source: string) => Promise<unknown> | unknown });
        this.logger.debug(`[EventBus] Registered request handler: ${type}`);
    }

    /**
     * Remove a request handler
     */
    offRequest(type: string): void {
        this.requestHandlers.delete(type);
        this.logger.debug(`[EventBus] Removed request handler: ${type}`);
    }

    /**
     * Handle incoming request (called by kernel when routing requests)
     */
    async handleRequest(message: RequestMessage): Promise<void> {
        const handler = this.requestHandlers.get(message.type);
        if (!handler) {
            // No handler registered - send error response
            await this.sendResponse(message, {
                success: false,
                error: new ModuleError(
                    'NO_HANDLER',
                    `No handler registered for request type: ${message.type}`,
                    message.target || 'unknown',
                    { recoverable: false }
                ),
            });
            return;
        }

        try {
            const result = await handler.handler(message.payload, message.source);
            await this.sendResponse(message, { success: true, payload: result });
        } catch (error) {
            await this.sendResponse(message, {
                success: false,
                error: ModuleError.fromError(error, message.target || 'unknown'),
            });
        }
    }

    /**
     * Send response for a request
     */
    private async sendResponse<T>(
        request: RequestMessage,
        response: { success: boolean; payload?: T; error?: ModuleError }
    ): Promise<void> {
        const responseMessage: ResponseMessage<T> = {
            id: generateId('res-'),
            type: request.responseType,
            source: request.target || 'kernel',
            target: request.source,
            payload: response.payload as T,
            timestamp: Date.now(),
            correlationId: request.correlationId,
            requestId: request.id,
            success: response.success,
            error: response.error,
        };

        // Resolve pending request
        const correlationId = request.correlationId ?? '';
        const pending = this.pendingRequests.get(correlationId);
        if (pending) {
            clearTimeout(pending.timeout);
            this.pendingRequests.delete(correlationId);

            if (response.success) {
                pending.resolve(response.payload as T);
            } else {
                pending.reject(response.error || new ModuleError('UNKNOWN', 'Request failed', request.target || 'unknown'));
            }
        }

        // Also publish as event for any listeners
        this.emitter.emit(request.responseType, responseMessage);
    }

    /**
     * Clean up expired pending requests
     */
    private cleanupExpiredRequests(): void {
        const now = Date.now();
        for (const [correlationId, pending] of this.pendingRequests.entries()) {
            // Requests older than 2x default timeout are considered stale
            if (now - pending.timestamp > this.defaultRequestTimeout * 2) {
                clearTimeout(pending.timeout);
                pending.reject(new ModuleError(
                    'REQUEST_STALE',
                    'Request cleaned up as stale',
                    'kernel',
                    { recoverable: false }
                ));
                this.pendingRequests.delete(correlationId);
                this.logger.warn(`[EventBus] Cleaned up stale request: ${correlationId}`);
            }
        }
    }

    /**
     * Get subscription count for monitoring
     */
    getSubscriptionCount(type?: string): number {
        if (type) {
            return this.subscriptions.get(type)?.length || 0;
        }
        let count = 0;
        for (const subs of this.subscriptions.values()) {
            count += subs.length;
        }
        return count;
    }

    /**
     * Get pending request count for monitoring
     */
    getPendingRequestCount(): number {
        return this.pendingRequests.size;
    }

    /**
     * Shutdown the event bus
     */
    async shutdown(): Promise<void> {
        clearInterval(this.cleanupInterval);

        // Reject all pending requests
        for (const pending of this.pendingRequests.values()) {
            clearTimeout(pending.timeout);
            pending.reject(new ModuleError('SHUTDOWN', 'Event bus shutting down', 'kernel'));
        }
        this.pendingRequests.clear();

        // Remove all listeners
        this.emitter.removeAllListeners();
        this.subscriptions.clear();
        this.requestHandlers.clear();

        this.logger.info('[EventBus] Shutdown complete');
    }
}

/**
 * Create a typed event bus for a specific module
 * Provides type-safe publish/subscribe for module-specific events
 */
export function createTypedEventBus<TEvents extends Record<string, unknown>>(
    eventBus: EventBus,
    moduleId: string
): {
    publish: <K extends keyof TEvents>(type: K, payload: TEvents[K]) => Promise<void>;
    subscribe: <K extends keyof TEvents>(
        type: K,
        handler: (payload: TEvents[K], message: EventMessage<TEvents[K]>) => Promise<void> | void,
        options?: SubscriptionOptions
    ) => Subscription;
    request: <K extends keyof TEvents, R>(
        target: string,
        type: K,
        payload: TEvents[K],
        timeout?: number
    ) => Promise<R>;
    onRequest: <K extends keyof TEvents, R>(
        type: K,
        handler: (payload: TEvents[K], source: string) => Promise<R> | R
    ) => void;
} {
    return {
        publish: async <K extends keyof TEvents>(type: K, payload: TEvents[K]) => {
            await eventBus.publish(type as string, payload, { source: moduleId });
        },
        subscribe: <K extends keyof TEvents>(
            type: K,
            handler: (payload: TEvents[K], message: EventMessage<TEvents[K]>) => Promise<void> | void,
            options?: SubscriptionOptions
        ) => {
            return eventBus.subscribe(type as string, (message) => handler(message.payload as TEvents[K], message as EventMessage<TEvents[K]>), options);
        },
        request: async <K extends keyof TEvents, R>(
            target: string,
            type: K,
            payload: TEvents[K],
            timeout?: number
        ) => {
            return eventBus.request<TEvents[K], R>(target, type as string, payload, timeout);
        },
        onRequest: <K extends keyof TEvents, R>(
            type: K,
            handler: (payload: TEvents[K], source: string) => Promise<R> | R
        ) => {
            eventBus.onRequest(type as string, handler);
        },
    };
}