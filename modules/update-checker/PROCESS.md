# Update Checker Module

## Purpose

Two independent update channels, run on app launch:

1. **App update** — handled by `electron-updater` (wired in
   `src/main/electron-main.ts`). Downloads a new NSIS / DMG / AppImage
   installer from GitHub Releases and prompts the user to restart.
2. **Game-definition update** — handled by this module. Polls a remote JSON
   manifest, compares each entry against the locally installed
   `GameDefinition`, and notifies the renderer of available updates.

The user said:

> "if there is an update notify (will do the ui in the future) and there is
> a backwards compatibility."

This module satisfies the **notify** half. The renderer will eventually
show a banner with the event payload; we just publish events and keep
them on the EventBus.

## Data Flow

```
App launch
    │
    ▼
kernel.boot → loads update-checker
    │
    ├─ if config.updates.gameModuleCheckOnBoot = true
    │      │
    │      ▼
    │   fetchManifest(updates.gameDefinitionsManifestUrl)
    │      │
    │      ├─ failure  → log warning, schedule retry next interval
    │      │
    │      └─ success  → compare each remote entry vs local
    │                    │
    │                    ├─ remote > local + app compatible
    │                    │    → publish update-checker:game-update-available
    │                    │
    │                    ├─ remote > local + app too old
    │                    │    → publish update-checker:game-incompatible
    │                    │
    │                    └─ remote ≤ local
    │                         → nothing
    │
    └─ if config.updates.checkIntervalHours > 0
           → setInterval(checkNow, hours * 3_600_000)
```

## Events Published

| Event | Payload | When |
| --- | --- | --- |
| `update-checker:game-update-available` | `GameUpdateAvailableEvent` | remote > local + app compatible |
| `update-checker:game-incompatible` | `GameIncompatibleEvent` | remote > local + app below `minAppVersion` |
| `update-checker:check-complete` | `{ checkedAt, available, incompatible }` | every successful check |

## RPC Surface

| Request | Returns | Notes |
| --- | --- | --- |
| `update-checker:check-now` | `{ ok, checked }` | Manual trigger from renderer |
| `update-checker:get-cache` | `{ lastCheckAt, available[], incompatible[] }` | Late-bound UI readers |

## Remote Manifest Shape

The JSON served from `config.updates.gameDefinitionsManifestUrl` MUST match:

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-06-30T00:00:00.000Z",
  "gameDefinitions": [
    {
      "id": "wuthering-waves",
      "displayName": "Wuthering Waves",
      "version": "1.2.0",
      "minAppVersion": "1.0.0",
      "downloadUrl": "https://raw.githubusercontent.com/.../wuthering-waves-1.2.0.ts",
      "releaseNotes": "New set bonuses added."
    }
  ]
}
```

The `downloadUrl` resolves to a raw `GameDefinition`-shaped `.ts` or `.json`
file. The actual install is performed by the renderer (or a future
`update-installer` module) — this module only checks + notifies.

## Backwards Compatibility

- **Missing `minAppVersion` on a game def** → assumed compatible with any
  app. (Old game defs keep working when this module ships.)
- **Missing `minAppVersion` on a remote entry** → falls back to the local
  copy's `minAppVersion`, or "compatible" if neither is set.
- **Pre-release versions** (`1.2.0-rc.1`) are skipped by default; enable
  via `config.updates.allowPrerelease = true`.
- **Major version mismatch** (e.g. local app `2.x.y` vs required `1.x.y`)
  is treated as compatible if `running.major > required.major`. This is
  intentional: future app versions are forward-compatible with old data.
- **HTTP failures / timeouts** are logged and surface as `update-checker:get-cache`
  returning `lastError`. The module never throws to the kernel — failures
  are non-fatal.

## Configuration

```json
{
  "updates": {
    "appCheckOnBoot": true,
    "gameModuleCheckOnBoot": true,
    "gameDefinitionsManifestUrl": "https://raw.githubusercontent.com/.../manifest.json",
    "notifyOnUpdate": true,
    "allowPrerelease": false,
    "checkIntervalHours": 24,
    "requestTimeoutMs": 10000
  }
}
```

`notifyOnUpdate` is wired in the preload bridge (`src/preload/preload.ts`)
for future renderer use; this module doesn't read it.

## Testing Notes

The pure helpers `parseSemVer` and `compareSemVer` are imported from
`@shared/types` so they're covered by core/ tests already. The HTTP fetch
and event-publishing behaviour is best tested with a fake EventBus and
`fetch` mock (see `modules/update-checker/tests/`).