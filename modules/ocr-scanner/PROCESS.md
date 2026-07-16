# OCR Scanner Module - Process Documentation

## Overview
The OCR Scanner module provides optical character recognition capabilities for Wuthering Waves echo screenshots. It extracts structured echo data (stats, set names, costs) from images using Tesseract.js.

## Data Flow

### 1. Module Initialization
```
Kernel boots
  → ModuleLoader discovers ocr-scanner module
  → ModuleLoader reads module.manifest.json
  → ModuleLoader imports src/index.ts (factory function)
  → Factory creates OcrScannerModule instance
  → Module.initialize(kernel) called
    → Subscribe to 'ocr:scan-request' events
    → Initialize Tesseract worker with configured language
    → Configure worker parameters (PSM, OEM)
    → Set health to 'healthy'
```

### 2. Scan Request Processing
```
External trigger (UI, hotkey, clipboard)
  → Event published: 'ocr:scan-request' with { imagePath, options }
  → OcrScannerModule.handleScanRequest() receives event
  → Validate image file exists
  → Call worker.recognize(imagePath)
  → Receive OCR result with confidence score
  → Check confidence against threshold
  → If below threshold: publish 'echo:scan-failed'
  → If above threshold: parse echo data
    → Extract name, cost, main stat, sub stats, set name
    → Create ScannedEcho object
    → Publish 'echo:scanned' event with echo data
  → Update internal statistics
```

### 3. Echo Data Parsing
```
Raw OCR text
  → Clean whitespace (normalize spaces)
  → Regex: Extract echo name (first capitalized words)
  → Regex: Extract cost (pattern: "Cost: X")
  → Regex: Extract main stat (ATK/DEF/HP/CRIT Rate/CRIT DMG/etc.)
  → Regex: Extract sub stats (same patterns, exclude main stat)
  → Regex: Extract set name (known set names list)
  → Construct ScannedEcho object with:
    - Unique ID (generated)
    - Name, cost, mainStat, subStats (max 4), setName
    - Confidence score
    - Raw text for debugging
    - Timestamp
```

### 4. Event Communication
```
Published Events:
  - 'ocr:progress' - During OCR recognition (progress %, status)
  - 'echo:scanned' - Successful scan with echo data
  - 'echo:scan-failed' - Failed scan with error details

Consumed Events:
  - 'ocr:scan-request' - Trigger scan with image path and options
```

### 5. Configuration Updates
```
Config change event
  → Module.configure(newConfig) called
  → Merge new config with existing
  → If language changed: reinitialize Tesseract worker
  → Other config changes apply immediately
```

### 6. Health Monitoring
```
Periodic health check (kernel)
  → Module.healthCheck() called
  → Check worker exists and is initialized
  → Return 'healthy' / 'degraded' / 'unhealthy'
  → Kernel updates module registry health status
```

### 7. Shutdown
```
Kernel shutdown
  → Module.shutdown() called
  → Terminate Tesseract worker
  → Clear internal state
  → Set health to 'unloaded'
```

## Error Handling
- Worker initialization failure → ModuleError with code 'WORKER_INIT_FAILED'
- File not found → ScanResult with error message
- Low confidence → ScanResult with confidence threshold error
- Parse failure → ScanResult with parse error
- All errors logged with structured logging

## Performance Considerations
- Worker reused across scans (not recreated)
- Confidence threshold prevents processing low-quality results
- Statistics tracked for monitoring (scan count, avg processing time)
- Progress events for UI feedback during long operations

## Security
- Only reads image files from provided paths
- No network access required
- Permissions declared in manifest: ocr:scan, fs:read, system:clipboard, data:echoes:write
- Sandboxed execution prevents system access beyond declared permissions