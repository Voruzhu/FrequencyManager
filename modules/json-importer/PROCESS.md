# JSON Import / Export Module

## Purpose

Provides generic JSON export/import that works with **any** game. Until the
OCR pipeline is ready, this is the canonical way for players to bring data
into FrequencyManager and take it out again — back up accounts, share builds
with friends, migrate from another tool.

## What it does

1. Wraps any JS object in a versioned envelope:

```json
{
  "schemaVersion": "1.0",
  "exportedAt": "2026-06-30T00:00:00.000Z",
  "exportedBy": "frequency-manager@1.0.0/json-importer@1.0.0",
  "game": { "id": "wuthering-waves", "version": "1.0.0", "displayName": "Wuthering Waves" },
  "description": "My account backup",
  "payload": { ...whatever the caller passed in... }
}
```

2. Serializes the envelope to a JSON string.
3. Writes it to disk (or returns the string for the renderer to handle).
4. On import: parses, validates the envelope shape, detects cross-game imports.

## RPC surface

| Request | Returns | Notes |
| --- | --- | --- |
| `json:export` | `string` (JSON) | `{ payload, options? }` |
| `json:import-string` | `ImportResult` | `{ json }` |
| `json:export-to-file` | `string` (path written) | `{ filePath, payload?, options? }` |
| `json:import-from-file` | `ImportResult` | `{ filePath }` |

## Configuration

```json
{
  "jsonImporter": {
    "exportPath": "frequency-manager-export.json",
    "prettyPrint": true,
    "schemaVersion": "1.0"
  }
}
```

## Cross-game imports

When you import an envelope whose `game.id` does not match the active game,
the import still succeeds (the payload is opaque to this module). The result
includes `crossGame: true` so the caller can warn the user. Schema-version
mismatches are surfaced the same way for future-proofing.

## How OCR will use this later

When OCR scanning lands, the scanner emits `equipment:scanned` events with
canonical Equipment objects. The renderer or another module can call
`json:export-to-file` with an array of those objects to back them up — no
code change needed in this module.