/**
 * @fileoverview OCR Scanner Module Manifest
 * @module modules/ocr-scanner/manifest
 */

import { ModuleManifest } from '@shared/types';

export const manifest: ModuleManifest = {
    name: 'ocr-scanner',
    displayName: 'OCR Scanner',
    version: '1.0.0',
    description: 'Scans Wuthering Waves echo screenshots using OCR to extract echo stats and properties',
    author: 'FrequencyManager Team',
    entryPoint: './src/index.ts',
    dependencies: {
        'core': '^1.0.0'
    },
    permissions: [
        'ocr:scan',
        'fs:read',
        'system:clipboard',
        'data:echoes:write'
    ],
    configSchema: {
        type: 'object',
        properties: {
            tesseractPath: { type: 'string', description: 'Path to Tesseract executable' },
            language: { type: 'string', default: 'eng', description: 'OCR language' },
            confidenceThreshold: { type: 'number', default: 60, description: 'Minimum confidence threshold' },
            preprocessing: { type: 'boolean', default: true, description: 'Enable image preprocessing' }
        }
    },
    tags: ['ocr', 'scanner', 'echoes', 'data-input'],
    minCoreVersion: '1.0.0',
    enabledByDefault: true,
    icon: 'scanner'
};