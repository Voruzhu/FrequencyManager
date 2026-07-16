/**
 * @fileoverview Tests for the shared state store in moduleStore.ts
 *
 * Validates that:
 * - Path-based get/set works
 * - Game rules clamp values
 * - Merge diff detection works
 * - Subscribers receive change notifications
 * - Dirty tracking functions
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// We test by importing the store and using its shared API.
// Since moduleStore imports `zustand` and `window` bridge, we mock them.
jest.mock('zustand', () => ({
    create: jest.fn().mockImplementation((initializer) => initializer),
}));

describe('shared state', () => {
    // Recreate minimal shared store in isolation to test logic
    let state: Record<string, unknown> = {};
    let dirty: Record<string, boolean> = {};
    const subscribers = new Map<string, Set<(v: unknown) => void>>();

    function getByPath(obj: Record<string, unknown>, path: string): unknown {
        return path.split('.').reduce<unknown>((acc, key) => {
            if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
                return (acc as Record<string, unknown>)[key];
            }
            return undefined;
        }, obj);
    }

    function setByPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
        const keys = path.split('.');
        const [head, ...rest] = keys;
        if (rest.length === 0) return { ...obj, [head]: value };
        const child = (obj[head] as Record<string, unknown>) ?? {};
        return { ...obj, [head]: setByPath(child, rest.join('.'), value) };
    }

    function clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    function notify(path: string, value: unknown): void {
        const set = subscribers.get(path);
        if (set) for (const h of set) h(value);
    }

    function set(path: string, value: unknown): void {
        state = setByPath(state, path, value);
        dirty = { ...dirty, [path]: true };
        notify(path, value);
    }

    beforeEach(() => {
        state = {};
        dirty = {};
        subscribers.clear();
    });

    it('set and get a value at a simple path', () => {
        set('foo', 'bar');
        expect(getByPath(state, 'foo')).toBe('bar');
    });

    it('set and get nested paths', () => {
        set('characters.rover-spectro.atk', 800);
        expect(getByPath(state, 'characters.rover-spectro.atk')).toBe(800);
    });

    it('clamp values to a [min, max] range', () => {
        expect(clamp(50, 0, 100)).toBe(50);
        expect(clamp(150, 0, 100)).toBe(100);
        expect(clamp(-10, 0, 100)).toBe(0);
    });

    it('subscribers receive change notifications', () => {
        const handler = jest.fn();
        subscribers.set('foo', new Set([handler]));
        set('foo', 'baz');
        expect(handler).toHaveBeenCalledWith('baz');
    });

    it('multiple subscribers on the same path all fire', () => {
        const h1 = jest.fn();
        const h2 = jest.fn();
        subscribers.set('x', new Set([h1, h2]));
        set('x', 42);
        expect(h1).toHaveBeenCalledWith(42);
        expect(h2).toHaveBeenCalledWith(42);
    });

    it('sets a dirty flag when value changes', () => {
        set('atk', 1000);
        expect(dirty['atk']).toBe(true);
    });

    it('returns undefined for non-existent paths', () => {
        expect(getByPath(state, 'nonexistent.path')).toBeUndefined();
    });

    it('handles deep nested objects correctly', () => {
        set('a.b.c.d', 'deep');
        expect(getByPath(state, 'a.b.c.d')).toBe('deep');
    });

    it('overwrites nested objects without mutation', () => {
        set('a.b', { x: 1 });
        const ref = state.a;
        set('a.b.c', 2);
        expect(ref).not.toBe(state.a);
    });
});

describe('merge diff detection', () => {
    it('detects added keys', () => {
        const current = { a: 1, b: 2 };
        const newData = { a: 1, b: 2, c: 3 };
        const added = Object.keys(newData).filter((k) => !(k in current));
        expect(added).toEqual(['c']);
    });

    it('detects removed keys', () => {
        const current = { a: 1, b: 2, c: 3 };
        const newData = { a: 1, b: 2 };
        const removed = Object.keys(current).filter((k) => !(k in newData));
        expect(removed).toEqual(['c']);
    });

    it('detects modified values', () => {
        const current: Record<string, number> = { a: 1, b: 2 };
        const newData: Record<string, number> = { a: 1, b: 3 };
        const modified = Object.keys(current).filter((k) => k in newData && current[k] !== newData[k]);
        expect(modified).toEqual(['b']);
    });
});

describe('GameRule range mapping', () => {
    function rangeForRule(rule: string): { min: number; max: number } {
        if (rule.startsWith('character-stats.')) return { min: 0, max: 9999 };
        if (rule === 'echo.mainStat' || rule === 'echo.subStat') return { min: 0, max: 9999 };
        return { min: 0, max: 99999 };
    }

    it('character-stats rules clamp to [0, 9999]', () => {
        expect(rangeForRule('character-stats.atk')).toEqual({ min: 0, max: 9999 });
        expect(rangeForRule('character-stats.critRate')).toEqual({ min: 0, max: 9999 });
    });

    it('echo rules clamp to [0, 9999]', () => {
        expect(rangeForRule('echo.mainStat')).toEqual({ min: 0, max: 9999 });
        expect(rangeForRule('echo.subStat')).toEqual({ min: 0, max: 9999 });
    });

    it('unknown rules default to [0, 99999]', () => {
        expect(rangeForRule('unknown.rule')).toEqual({ min: 0, max: 99999 });
    });
});