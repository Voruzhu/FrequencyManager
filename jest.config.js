/**
 * @fileoverview Jest configuration for FrequencyManager.
 *
 * WHY this file exists:
 *   - Pin Jest's test file patterns under the tests/ directory.
 *   - Point ts-jest at the test-specific tsconfig so describe, it, jest
 *     and expect are typed correctly.
 *   - Run tests in the node environment.
 *
 * @packageDocumentation
 */

module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: '.',
    roots: ['<rootDir>/tests', '<rootDir>/core', '<rootDir>/modules', '<rootDir>/src'],
    testMatch: [
        '<rootDir>/tests/**/*.test.ts',
        '<rootDir>/tests/**/*.spec.ts',
        '<rootDir>/modules/**/tests/**/*.test.ts',
        '<rootDir>/modules/**/tests/**/*.spec.ts',
    ],
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
    moduleNameMapper: {
        '^@core/(.*)$': '<rootDir>/core/$1',
        '^@modules/(.*)$': '<rootDir>/modules/$1',
        '^@shared/(.*)$': '<rootDir>/shared/$1',
        '^@adapters/(.*)$': '<rootDir>/adapters/$1',
        '^@config/(.*)$': '<rootDir>/config/$1',
        '^@scripts/(.*)$': '<rootDir>/scripts/$1',
    },
    transform: {
        '^.+\\.tsx?$': [
            'ts-jest',
            {
                tsconfig: '<rootDir>/tsconfig.test.json',
            },
        ],
    },
    collectCoverageFrom: [
        'core/**/*.ts',
        'modules/**/src/**/*.ts',
        'src/**/*.ts',
        '!**/*.d.ts',
    ],
    coverageDirectory: 'coverage',
    clearMocks: true,
    restoreMocks: true,
};