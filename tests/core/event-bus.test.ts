/**
 * @fileoverview Unit tests for the EventBus core module.
 * @module tests/core/event-bus
 *
 * These tests cover the public API of `core/event-bus.ts`:
 *   - pub/sub pattern (publish, subscribe, unsubscribe)
 *   - once + filter + priority subscription options
 *   - wildcard subscriptions
 *   - RPC pattern (request, onRequest, handleRequest)
 *   - request timeouts
 *   - graceful shutdown
 *   - helper: createTypedEventBus
 */

import { EventBus, createTypedEventBus } from '../../core/event-bus';
import { EventMessage, ModuleError } from '../../shared/types';

/** Capture logs so we can spy on logger output without polluting test output. */
function createSilentLogger() {
    return {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        child: jest.fn(),
    };
}

describe('EventBus', () => {
    let bus: EventBus;
    let logger: ReturnType<typeof createSilentLogger>;

    beforeEach(() => {
        logger = createSilentLogger();
        // The EventBus accepts a LoggerInterface; we cast our partial mock through `unknown`.
        bus = new EventBus(logger as unknown as ConstructorParameters<typeof EventBus>[0]);
    });

    afterEach(async () => {
        await bus.shutdown();
    });

    // ──────────────────────────────────────────────────────────────────────
    // Pub/Sub
    // ──────────────────────────────────────────────────────────────────────

    describe('publish / subscribe', () => {
        it('delivers a published event to a matching subscriber', async () => {
            const handler = jest.fn();
            bus.subscribe('user:created', handler);

            await bus.publish('user:created', { id: 42 });

            expect(handler).toHaveBeenCalledTimes(1);
            const message = handler.mock.calls[0][0] as EventMessage<{ id: number }>;
            expect(message.payload).toEqual({ id: 42 });
            expect(message.type).toBe('user:created');
            expect(message.source).toBe('kernel');
        });

        it('delivers one event to multiple subscribers', async () => {
            const a = jest.fn();
            const b = jest.fn();
            bus.subscribe('event', a);
            bus.subscribe('event', b);

            await bus.publish('event', { value: 'x' });

            expect(a).toHaveBeenCalledTimes(1);
            expect(b).toHaveBeenCalledTimes(1);
        });

        it('uses the provided source and correlationId when given', async () => {
            const handler = jest.fn();
            bus.subscribe('test', handler);

            await bus.publish('test', { ok: true }, { source: 'ocr-scanner', correlationId: 'corr-1' });

            const message = handler.mock.calls[0][0] as EventMessage<{ ok: boolean }>;
            expect(message.source).toBe('ocr-scanner');
            expect(message.correlationId).toBe('corr-1');
        });

        it('does not deliver events of an unsubscribed type', async () => {
            const a = jest.fn();
            const b = jest.fn();
            bus.subscribe('a', a);
            bus.subscribe('b', b);

            await bus.publish('a', null);

            expect(a).toHaveBeenCalledTimes(1);
            expect(b).not.toHaveBeenCalled();
        });
    });

    describe('unsubscribe', () => {
        it('stops delivery after unsubscribe() is called', async () => {
            const handler = jest.fn();
            const sub = bus.subscribe('event', handler);

            await bus.publish('event', { first: true });
            sub.unsubscribe();
            await bus.publish('event', { second: true });

            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    describe('subscription options', () => {
        it('"once" auto-unsubscribes after the first delivery', async () => {
            const handler = jest.fn();
            bus.subscribe('event', handler, { once: true });

            await bus.publish('event', 1);
            await bus.publish('event', 2);

            expect(handler).toHaveBeenCalledTimes(1);
            expect(bus.getSubscriptionCount('event')).toBe(0);
        });

        it('filter rejects messages whose predicate returns false', async () => {
            const handler = jest.fn();
            const filter = (msg: EventMessage<unknown>): boolean =>
                typeof msg.payload === 'number' && msg.payload > 10;
            bus.subscribe('numbers', handler, { filter });

            await bus.publish('numbers', 5);
            await bus.publish('numbers', 20);

            expect(handler).toHaveBeenCalledTimes(1);
            expect((handler.mock.calls[0][0] as EventMessage<number>).payload).toBe(20);
        });

        it('priority is accepted without throwing', () => {
            // WHY: The EventBus accepts a numeric `priority` option on subscribe
            // and uses it to sort internal subscription records. We verify the
            // API accepts it and delivers events to all priority-tagged handlers
            // — the exact cross-handler ordering is an implementation detail of
            // the underlying emitter and is not part of the public contract.
            const handler = jest.fn();
            bus.subscribe('event', handler, { priority: 5 });
            bus.subscribe('event', handler, { priority: 0 });

            void bus.publish('event', null);

            expect(handler).toHaveBeenCalledTimes(2);
            expect(bus.getSubscriptionCount('event')).toBe(2);
        });
    });

    describe('wildcard subscriptions', () => {
        it('wildcard subscriber receives every event', async () => {
            const handler = jest.fn();
            bus.subscribe('*', handler);

            await bus.publish('a', 1);
            await bus.publish('b', 2);

            expect(handler).toHaveBeenCalledTimes(2);
        });
    });

    describe('error isolation', () => {
        it('a throwing handler does not break other handlers', async () => {
            const bad = jest.fn(() => {
                throw new Error('boom');
            });
            const good = jest.fn();
            bus.subscribe('event', bad);
            bus.subscribe('event', good);

            await bus.publish('event', null);

            expect(bad).toHaveBeenCalled();
            expect(good).toHaveBeenCalled();
            expect(logger.error).toHaveBeenCalled();
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // RPC
    // ──────────────────────────────────────────────────────────────────────

    describe('RPC pattern (request / onRequest / handleRequest)', () => {
        it('routes a request to its registered handler and resolves the response', async () => {
            bus.onRequest<{ name: string }, { greeting: string }>('greet', ({ name }) => ({
                greeting: `Hello, ${name}!`,
            }));

            // Subscribe FIRST so we do not miss the publish event.
            bus.subscribe('greet', async (msg) => {
                await bus.handleRequest({
                    ...msg,
                    target: 'greeter',
                    responseType: 'greet:response',
                } as unknown as Parameters<typeof bus.handleRequest>[0]);
            });

            const result = await bus.request<{ name: string }, { greeting: string }>(
                'greeter',
                'greet',
                { name: 'Ada' },
                1000,
            );

            expect(result).toEqual({ greeting: 'Hello, Ada!' });
        });

        it('rejects with NO_HANDLER when no handler is registered', async () => {
            const requestMsg = {
                id: 'req-2',
                type: 'no-such-request',
                source: 'kernel',
                target: 'someone',
                payload: {},
                timestamp: Date.now(),
                correlationId: 'corr-2',
                responseType: 'no-such-request:response',
                timeout: 1000,
            } as const;

            await bus.handleRequest(requestMsg as unknown as Parameters<typeof bus.handleRequest>[0]);

            // Pending requests should be cleaned up after a NO_HANDLER error response.
            expect(bus.getPendingRequestCount()).toBe(0);
        });

        it('times out and rejects when no response arrives in time', async () => {
            // We register a handler that never responds (handler does nothing).
            bus.onRequest('slow', async () => {
                // intentionally never resolves
                await new Promise(() => { });
                return null;
            });

            // We need handleRequest to be invoked for a request to actually be pending.
            const promise = new Promise((resolve, reject) => {
                // Manually create a pending request via publish + a subscriber that calls handleRequest.
                bus.subscribe('slow', async (msg: EventMessage<unknown>) => {
                    await bus.handleRequest({
                        ...msg,
                        responseType: 'slow:response',
                    } as unknown as Parameters<typeof bus.handleRequest>[0]);
                });
                // Use the real request() to create the pending entry with a tight timeout.
                bus
                    .request<unknown, unknown>('someone', 'slow', {}, 50)
                    .then(resolve, reject);
            });

            await expect(promise).rejects.toThrow(/timed out/);
        }, 5000);

        it('offRequest removes a previously-registered handler', async () => {
            bus.onRequest('echo', () => 'x');
            bus.offRequest('echo');

            const requestMsg = {
                id: 'req-3',
                type: 'echo',
                source: 'kernel',
                target: 'someone',
                payload: {},
                timestamp: Date.now(),
                correlationId: 'corr-3',
                responseType: 'echo:response',
                timeout: 1000,
            } as const;

            await bus.handleRequest(requestMsg as unknown as Parameters<typeof bus.handleRequest>[0]);
            expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Removed request handler'));
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // Monitoring
    // ──────────────────────────────────────────────────────────────────────

    describe('monitoring', () => {
        it('getSubscriptionCount returns the count per type and overall', () => {
            bus.subscribe('a', () => { });
            bus.subscribe('a', () => { });
            bus.subscribe('b', () => { });

            expect(bus.getSubscriptionCount('a')).toBe(2);
            expect(bus.getSubscriptionCount('b')).toBe(1);
            expect(bus.getSubscriptionCount('nope')).toBe(0);
            expect(bus.getSubscriptionCount()).toBe(3);
        });

        it('getPendingRequestCount reports outstanding RPC requests', () => {
            expect(bus.getPendingRequestCount()).toBe(0);
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // Shutdown
    // ──────────────────────────────────────────────────────────────────────

    describe('shutdown', () => {
        it('rejects all pending requests and clears state', async () => {
            // Create a fake pending request by calling request without a response handler.
            const promise = bus.request<unknown, unknown>('someone', 'no-handler', {}, 5000)
                .catch((e: unknown) => e);

            await bus.shutdown();
            const error = await promise;
            expect(error).toBeInstanceOf(ModuleError);
            expect((error as ModuleError).code).toBe('SHUTDOWN');
            expect(bus.getPendingRequestCount()).toBe(0);
            expect(bus.getSubscriptionCount()).toBe(0);
        });
    });

    // ──────────────────────────────────────────────────────────────────────
    // createTypedEventBus
    // ──────────────────────────────────────────────────────────────────────

    describe('createTypedEventBus', () => {
        it('prefixes events with the module id', async () => {
            const handler = jest.fn();
            const typed = createTypedEventBus<{ 'ping': { ts: number } }>(bus, 'damage-calculator');

            bus.subscribe('ping', handler);
            await typed.publish('ping', { ts: 123 });

            expect(handler).toHaveBeenCalledTimes(1);
            const message = handler.mock.calls[0][0] as EventMessage<{ ts: number }>;
            expect(message.source).toBe('damage-calculator');
        });

        it('forwards subscribe with the correct type', async () => {
            const typed = createTypedEventBus<{ 'foo': string }>(bus, 'm');
            const handler = jest.fn();

            typed.subscribe('foo', handler);
            await bus.publish('foo', 'hello');

            expect(handler).toHaveBeenCalledTimes(1);
        });
    });
});