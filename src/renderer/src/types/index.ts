/** A single color role expressed as a space-separated RGB channel string, e.g. "15 17 21". */
export type ThemeChannels = string;

/** The color roles every theme preset must define (consumed via rgb(var(--role))). */
export type ThemeRole =
    | 'background' | 'foreground' | 'surface' | 'surface-2'
    | 'card' | 'card-foreground' | 'popover' | 'popover-foreground'
    | 'primary' | 'primary-foreground' | 'secondary' | 'secondary-foreground'
    | 'muted' | 'muted-foreground' | 'border' | 'input' | 'ring'
    | 'destructive' | 'destructive-foreground'
    | 'success' | 'success-foreground' | 'warning' | 'warning-foreground';

export interface ThemePreset {
    name: string;
    label: string;
    /** Drives the `dark` class + native color-scheme. */
    appearance: 'dark' | 'light';
    /** Full role → channel map applied to the DOM at runtime. */
    roles: Record<ThemeRole, ThemeChannels>;
    /** Optional border-radius override, e.g. "0.375rem". */
    radius?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Module UI Specification
//
// A stable, game-agnostic contract that ANY module backend can implement.
// The renderer uses this to render a consistent panel for every module —
// games only differ in their backend logic & data, never in the chrome.
// ────────────────────────────────────────────────────────────────────────────

/** Where a value comes from for a module action. */
export type FieldSource = 'config' | 'user-input' | 'selection' | 'state';

/** Reference to a game-defined validation rule. */
export type GameRuleRef =
    | 'character-stats.atk'
    | 'character-stats.hp'
    | 'character-stats.def'
    | 'character-stats.critRate'
    | 'character-stats.critDmg'
    | 'character-stats.energyRegen'
    | 'character-stats.elementalMastery'
    | 'character-stats.healingBonus'
    | 'character-stats.effectHitRate'
    | 'character-stats.effectRes'
    | 'echo.mainStat'
    | 'echo.subStat';

/** A single step in a character rotation. */
export interface RotationStepSpec {
    characterId: string;
    actionType: 'basic' | 'skill' | 'ultimate' | 'switch' | 'movement' | 'wait';
    skillId?: string;
    skillLabel?: string;
    duration?: number; // seconds
    energyCost?: number;
    energyGain?: number;
    notes?: string;
    /** Talent level for this step's skill, overriding the best-case default (10). */
    talentLevel?: number;
    /** Stack count for this step's skill, overriding the best-case default (skill.stackMax). */
    stackCount?: number;
}

/** Rotation builder configuration exposed by module. */
export interface RotationBuilderSpec {
    /** Available characters for the rotation */
    characters: Array<{ id: string; label: string; icon?: string }>;
    /** Available skills per character (optional, can be fetched from backend) */
    skills?: Record<string, Array<{ id: string; label: string; type: 'basic' | 'skill' | 'ultimate'; energyCost?: number; cooldown?: number; stackMax?: number }>>;
    /** Default rotation template */
    defaultRotation?: RotationStepSpec[];
    /** Maximum rotation length in seconds */
    maxRotationLength?: number;
    /** Whether to show energy bar visualization */
    showEnergy?: boolean;
}

/** Schema for a single input field shown in a module panel. */
export interface FieldSpec {
    id: string;
    label: string;
    type: 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'file' | 'image' | 'rotation';
    required?: boolean;
    default?: unknown;
    options?: Array<{ value: string; label: string }>;
    placeholder?: string;
    min?: number;
    max?: number;
    step?: number;
    description?: string;
    source?: FieldSource;
    /** When source === 'state', the dot-path into shared state (e.g., 'characters.rover-spectro.stats.critRate') */
    statePath?: string;
    /** Reference to a game-defined validation rule for min/max/default */
    gameRule?: GameRuleRef;
    /** Rotation builder config (only used when type === 'rotation') */
    rotationConfig?: RotationBuilderSpec;
}

/** A user-triggerable action exposed by a module. */
export interface ActionSpec {
    id: string;
    label: string;
    description?: string;
    style?: 'primary' | 'secondary' | 'danger' | 'ghost';
    requiresFields?: string[];
    confirmMessage?: string;
}

/** A named output channel a module can publish to. */
export interface OutputSpec {
    id: string;
    label: string;
    kind: 'table' | 'stat' | 'list' | 'chart' | 'json' | 'image';
    description?: string;
}

/** UI contract exposed by a module to the renderer. */
export interface ModuleUISpec {
    fields: FieldSpec[];
    actions: ActionSpec[];
    outputs: OutputSpec[];
}

export interface ModuleInfo {
    id: string;
    name: string;
    version: string;
    enabled: boolean;
    description?: string;
    hasUI?: boolean;
    /** Optional icon hint (name from a small built-in icon set). */
    icon?: string;
    /** Optional tags for grouping in sidebar. */
    tags?: string[];
}

export interface GameDefinition {
    id: string;
    displayName: string;
    version: string;
    description?: string;
}

export interface HealthStatus {
    module: string;
    status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
    message?: string;
    timestamp: number;
}

export interface UpdateInfo {
    available: boolean;
    currentVersion: string;
    latestVersion: string;
    releaseNotes?: string;
}

export interface DevToolsEvent {
    type: string;
    payload: unknown;
    timestamp: number;
    source: string;
}

export interface RPCRequest {
    id: string;
    method: string;
    params: unknown;
}

export interface RPCResponse {
    id: string;
    result?: unknown;
    error?: { code: string; message: string };
}