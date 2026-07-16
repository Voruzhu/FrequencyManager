# Damage Calculator Module - Process Documentation

## Overview
The Damage Calculator module calculates optimal damage combos and DPS for Wuthering Waves characters based on echo stats, team composition, and enemy resistances. It provides accurate, extensible damage calculations accounting for the game's complex mechanics.

## Data Flow

### 1. Module Initialization
```
Kernel boots
  → ModuleLoader discovers damage-calculator module
  → ModuleLoader reads module.manifest.json
  → ModuleLoader imports src/index.ts (factory function)
  → Factory creates DamageCalculatorModule instance
  → Module.initialize(kernel) called
    → Subscribe to 'damage:calculate-request' events
    → Subscribe to 'echo:scanned' events (from OCR scanner)
    → Load character database (base stats)
    → Set health to 'healthy'
```

### 2. Damage Calculation Request Processing
```
External trigger (UI, optimization request)
  → Event published: 'damage:calculate-request' with { character, echoes, team, enemy, options }
  → DamageCalculatorModule.handleCalculationRequest() receives event
  → Calculate final stats (base + echoes + set bonuses + resonance)
  → Calculate damage breakdown by skill type
  → Generate optimal rotation
  → Calculate total damage and DPS
  → Publish 'damage:calculated' event with result
  → Update internal statistics
```

### 3. Final Stats Calculation
```
Character base stats (level 90)
  → Apply level multiplier
  → Apply ascension bonus
  → For each echo:
    → Apply main stat (scaled by echo level)
    → Apply sub stats (scaled by echo level)
    → Apply set bonus
  → Apply character's own % bonuses
  → Cap crit rate at 100%
  → Apply resonance chain bonuses (if enabled)
  → Calculate elemental damage bonus
  → Return CalculatedStats
```

### 4. Damage Breakdown Calculation
```
Final stats + enemy data
  → Calculate defense reduction: (charLevel + 20) / (charLevel + 20 + enemyLevel + 20)
  → Apply enemy resistance: (1 - resistance/100)
  → Calculate crit multiplier: 1 + (critRate/100) * (critDmg/100)
  → Base multiplier = ATK * defReduction * (1-resistance) * critMultiplier * (1 + dmgBonus/100)
  → For each skill type: damage = baseMultiplier * skillMultiplier
  → Add elemental reactions if concerto effects enabled
  → Sum all damage sources
```

### 5. Rotation Generation
```
Character + stats + options
  → Define skill sequence with multipliers, durations, energy gains
  → Iterate through sequence until rotation length reached
  → Calculate damage per step using stats
  → Track concerto energy accumulation
  → Add outro skill if energy >= 100
  → Return RotationStep[]
```

### 6. Echo Optimization
```
Optimization request: { character, availableEchoes, targetCost, preferredSets, preferredMainStats }
  → Filter echoes by cost <= targetCost
  → Group echoes by cost (4, 3, 2, 1)
  → For each cost tier (highest first):
    → Score each echo:
      +100 if main stat in preferredMainStats
      +50 if set in preferredSets
      +30 if set matches character element
      +2 * mainStatValue
      +3 * subStatValue for crit/atk%/energy, +1 for others
    → Sort by score descending
    → Select best fitting echo
  → Calculate estimated DPS for selected combination
  → Return EchoOptimizationResult
```

### 7. Echo Scanned Event Handling
```
OCR Scanner publishes 'echo:scanned'
  → DamageCalculatorModule.handleEchoScanned() receives event
  → Add echo to internal echoDatabase
  → Log debug info
```

### 8. Configuration Updates
```
Config change event
  → Module.configure(newConfig) called
  → Merge new config with existing
  → Changes apply immediately to next calculation
```

### 9. Health Monitoring
```
Periodic health check (kernel)
  → Module.healthCheck() called
  → Check character database not empty
  → Return 'healthy' / 'degraded'
  → Kernel updates module registry health status
```

### 10. Shutdown
```
Kernel shutdown
  → Module.shutdown() called
  → Clear character and echo databases
  → Set health to 'unloaded'
```

## Event Communication

### Published Events
- `damage:calculated` - Successful calculation with DamageCalculationResult
- `damage:calculation-failed` - Failed calculation with error details
- `damage:optimization-complete` - Echo optimization finished (future)

### Consumed Events
- `damage:calculate-request` - Trigger damage calculation
- `echo:scanned` - New echo data from OCR scanner

## Error Handling
- Calculation errors → ModuleError with code 'CALCULATION_FAILED'
- Missing character data → Graceful degradation with defaults
- Invalid echo data → Skip invalid echoes, log warning
- All errors logged with structured logging (module, correlationId, error)

## Performance Considerations
- Character/echo databases cached in memory (Map for O(1) lookup)
- Calculations are pure functions (no side effects)
- Rotation generation is O(n) where n = number of skills in rotation
- Echo optimization uses greedy algorithm (O(n log n) for sorting)
- No external API calls during calculation

## Security
- Only reads from internal databases
- No file system access beyond config
- No network requests
- Permissions declared: calculation:damage, data:echoes:read, data:characters:read, data:characters:write
- Sandboxed execution prevents system access

## Extensibility
- Character database loadable from external files
- Set bonuses configurable via data files
- Skill multipliers extensible per character
- Enemy defense/resistance formulas customizable
- New elements/weapons/stats added via type definitions