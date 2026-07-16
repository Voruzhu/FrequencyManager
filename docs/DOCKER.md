# Docker Compatibility Guide

## Overview
FrequencyManager is primarily an Electron desktop application. Docker support is provided for running the **headless server components** (module loader, event bus, kernel logic) without the GUI.

## What Interferes with Docker

### 1. Electron Dependencies
The project depends on Electron (`package.json` line 31), which requires a display server (X11/Wayland) and is designed for desktop environments, not containers.

**Problem**: Electron will crash in a headless container if launched.
**Solution**: The Docker CMD runs `node dist/core/kernel.js` directly, bypassing Electron.

### 2. Electron-Specific Packages
| Package | Purpose | Docker Issue |
|---------|---------|-------------|
| `electron-store` | Persistent config for Electron | Uses Electron APIs, fails in headless |
| `electron-updater` | Auto-update mechanism | Requires Electron runtime |
| `electron-log` | Logging for Electron | Prefers Electron environment |

**Solution**: These packages are installed in node_modules but never imported by the kernel/headless entry point.

### 3. TypeScript Path Aliases
`tsconfig.json` defines path aliases:
```json
"@shared/*": ["shared/*"],
"@core/*": ["core/*"],
"@modules/*": ["modules/*"],
"@adapters/*": ["adapters/*"]
```

**Problem**: TypeScript compiles these to `require('@shared/types')` in the JS output, but Node.js cannot resolve `@shared/...` at runtime without help.
**Solution**: The Dockerfile installs `module-alias` and creates an entry point (`dist/entry.js`) that registers aliases before loading the kernel.

### 4. TypeScript Strict Mode
`tsconfig.json` has `"strict": true` and includes `"electron"` in the types array.

**Problem**: 
- `electron` type definition isn't installed in Docker build context
- Strict mode causes type errors (TS2345, TS2323, etc.) that block compilation

**Solution**: The Dockerfile generates a separate `tsconfig.docker.json` with `"strict": false`, omits `electron` from types, and uses `--skipLibCheck`.

### 5. npm Scripts Targetting Electron
```json
"dev": "electron .",
"build": "tsc && electron-builder"
```

**Problem**: These scripts assume Electron is the runtime target.
**Solution**: Docker uses its own CMD: `node dist/entry.js`.

## Current Docker Status

### ✅ Working
- Docker image builds successfully (tag: `frequency-manager:latest`)
- Container starts and runs with exit code 0
- Module aliases are registered at runtime
- TypeScript compilation with lenient settings in Docker

### ⚠️ Workarounds in Place
The Dockerfile implements these workarounds:
1. Creates `tsconfig.docker.json` inline (strict=false, no electron types)
2. Installs `module-alias` and creates `dist/entry.js` for path resolution
3. Copies compiled shared types to `dist/@shared/` for alias resolution
4. Runs `node dist/entry.js` instead of Electron

## Commands

```bash
# Build
docker build -t frequency-manager -f FrequencyManager\Dockerfile FrequencyManager

# Run
docker run --rm frequency-manager

# Interactive shell
docker run -it --rm --entrypoint /bin/sh frequency-manager