/**
 * @fileoverview Default UI specifications for built-in modules.
 *
 * WHY this lives in the renderer:
 * - The kernel can expose UI specs dynamically per game (e.g. a WuWa-specific
 *   damage calculator), but the renderer needs at least a working spec for
 *   every built-in module so the unified panel chrome works out of the box.
 * - When the kernel exposes a spec via `kernel:module-ui`, it overrides the
 *   defaults here. Until then, this file is the source of truth.
 *
 * The schema (`ModuleUISpec`) is game-agnostic — a Genshin module, a WuWa
 * module, a JSON-importer module, etc. all use the SAME structure.
 */
import type { ModuleUISpec } from '../types';

export const DEFAULT_MODULE_UI_SPECS: Record<string, ModuleUISpec> = {
    'damage-calculator': {
        fields: [
            {
                id: 'characterId',
                label: 'Character',
                type: 'select',
                required: true,
                source: 'selection',
                options: [
                    { value: 'rover-spectro', label: 'Rover (Spectro)' },
                    { value: 'jinhsi', label: 'Jinhsi' },
                    { value: 'yinlin', label: 'Yinlin' },
                ],
                description: 'Pick the character to calculate damage for.',
            },
            {
                id: 'rotationLength',
                label: 'Rotation length (s)',
                type: 'number',
                default: 20,
                min: 5,
                max: 60,
                step: 1,
                source: 'user-input',
            },
            {
                id: 'includeResonanceBonus',
                label: 'Include resonance chain bonuses',
                type: 'boolean',
                default: true,
                source: 'user-input',
            },
            {
                id: 'includeConcertoEffects',
                label: 'Include concerto effects',
                type: 'boolean',
                default: true,
                source: 'user-input',
            },
        ],
        actions: [
            {
                id: 'calculate',
                label: 'Calculate Damage',
                style: 'primary',
                requiresFields: ['characterId'],
            },
            {
                id: 'optimize-echoes',
                label: 'Optimize Echoes',
                style: 'secondary',
                requiresFields: ['characterId'],
            },
        ],
        outputs: [
            { id: 'summary', label: 'Summary', kind: 'stat', description: 'Total damage & DPS' },
            { id: 'breakdown', label: 'Breakdown', kind: 'table', description: 'Damage per source' },
            { id: 'rotation', label: 'Rotation', kind: 'list', description: 'Action sequence' },
            { id: 'stats', label: 'Final Stats', kind: 'json' },
        ],
    },
    'ocr-scanner': {
        fields: [
            {
                id: 'imagePath',
                label: 'Screenshot',
                type: 'image',
                required: true,
                source: 'user-input',
                description: 'Pick a game screenshot to scan.',
            },
            {
                id: 'autoAddToDatabase',
                label: 'Auto-add echoes to database',
                type: 'boolean',
                default: true,
                source: 'user-input',
            },
        ],
        actions: [
            { id: 'scan', label: 'Scan Image', style: 'primary', requiresFields: ['imagePath'] },
        ],
        outputs: [
            { id: 'echoes', label: 'Detected Echoes', kind: 'table' },
            { id: 'raw', label: 'Raw OCR Result', kind: 'json' },
        ],
    },
    'json-importer': {
        fields: [
            {
                id: 'source',
                label: 'Import source',
                type: 'select',
                required: true,
                source: 'user-input',
                options: [
                    { value: 'file', label: 'From file' },
                    { value: 'clipboard', label: 'From clipboard' },
                ],
            },
        ],
        actions: [
            { id: 'import', label: 'Import', style: 'primary' },
            { id: 'export', label: 'Export current data', style: 'secondary' },
        ],
        outputs: [
            { id: 'imported', label: 'Imported records', kind: 'list' },
            { id: 'errors', label: 'Validation errors', kind: 'list' },
        ],
    },
    'update-checker': {
        fields: [],
        actions: [
            { id: 'check-now', label: 'Check for updates', style: 'primary' },
        ],
        outputs: [
            { id: 'app', label: 'App updates', kind: 'list' },
            { id: 'games', label: 'Game-definition updates', kind: 'list' },
        ],
    },
    'game-loader': {
        fields: [
            {
                id: 'gameId',
                label: 'Game',
                type: 'select',
                required: true,
                source: 'selection',
                options: [
                    { value: 'wuthering-waves', label: 'Wuthering Waves' },
                    { value: 'genshin-impact', label: 'Genshin Impact' },
                ],
            },
        ],
        actions: [
            { id: 'load', label: 'Load game', style: 'primary', requiresFields: ['gameId'] },
        ],
        outputs: [
            { id: 'game', label: 'Loaded game', kind: 'json' },
        ],
    },
};