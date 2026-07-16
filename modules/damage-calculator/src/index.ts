/**
 * @fileoverview Damage Calculator Module for FrequencyManager
 * @module modules/damage-calculator
 * 
 * This module calculates optimal damage combos and DPS for Wuthering Waves characters
 * based on echo stats, team composition, and enemy resistances.
 * 
 * WHY: Damage calculation is complex in Wuthering Waves due to:
 * - Elemental reactions and resonance chains
 * - Concerto energy mechanics
 * - Character-specific multipliers and scaling
 * - Echo set bonuses and substat optimization
 * This module provides accurate, extensible calculations.
 * 
 * Events Emitted:
 * - damage:calculated: When a damage calculation completes
 * - damage:optimization-complete: When echo optimization finishes
 * 
 * Events Consumed:
 * - damage:calculate-request: Request a damage calculation
 * - echo:scanned: New echo data from OCR scanner (for auto-optimization)
 * 
 * @packageDocumentation
 */

import {
    ModuleAPI,
    ModuleManifest,
    ModuleLoaderOptions,
    ModuleFactory,
    ModuleError,
    ModuleHealthStatus,
    ModuleState,
    EventMessage,
    KernelInterface,
    generateId,
    generateCorrelationId,
} from '@shared/types';
import { manifest } from './manifest';
import { getGameBundle } from '@adapters/game-definitions';
import type { GameBundle, CharacterEntry, GearEntry } from '@shared/types/game-bundle';
import { optimize as runOptimize, type OptimizeConfig, type Loadout } from '@shared/calc/optimizer';

// Re-export manifest
export { manifest } from './manifest';

/**
 * Character base stats
 */
export interface CharacterStats {
    id: string;
    name: string;
    element: ElementType;
    weapon: WeaponType;
    baseAtk: number;
    baseHp: number;
    baseDef: number;
    critRate: number;
    critDmg: number;
    energyRegen: number;
    atkPercent: number;
    hpPercent: number;
    defPercent: number;
    elementalDmgBonus: Record<ElementType, number>;
    healingBonus: number;
    resonanceChain: number; // 0-6
    level: number;
    ascension: number;
}

/**
 * Echo data for calculations
 */
export interface EchoData {
    id: string;
    name: string;
    cost: number;
    mainStat: {
        type: StatType;
        value: number;
    };
    subStats: Array<{
        type: StatType;
        value: number;
    }>;
    setName?: string;
    level: number;
}

/**
 * Element types in Wuthering Waves
 */
export type ElementType =
    | 'Glacio'
    | 'Fusion'
    | 'Electro'
    | 'Aero'
    | 'Spectro'
    | 'Havoc'
    | 'Physical';

/**
 * Weapon types
 */
export type WeaponType =
    | 'Sword'
    | 'Broadblade'
    | 'Pistols'
    | 'Gauntlets'
    | 'Rectifier';

/**
 * Stat types
 */
export type StatType =
    | 'ATK'
    | 'ATK%'
    | 'HP'
    | 'HP%'
    | 'DEF'
    | 'DEF%'
    | 'CRIT Rate'
    | 'CRIT DMG'
    | 'Energy Regen'
    | 'Healing Bonus'
    | 'Effect Hit Rate'
    | 'Effect RES';

/**
 * Damage calculation request
 */
export interface DamageCalculationRequest {
    character: CharacterStats;
    echoes: EchoData[];
    team?: CharacterStats[]; // Other team members for resonance
    enemy?: {
        level: number;
        resistance: Record<ElementType, number>;
        defense: number;
    };
    options?: {
        includeResonanceBonus?: boolean;
        includeConcertoEffects?: boolean;
        rotationLength?: number; // seconds
    };
}

/**
 * Damage calculation result
 */
export interface DamageCalculationResult {
    id: string;
    characterId: string;
    timestamp: number;
    totalDamage: number;
    dps: number;
    breakdown: DamageBreakdown;
    rotation: RotationStep[];
    stats: CalculatedStats;
}

/**
 * Damage breakdown by source
 */
export interface DamageBreakdown {
    basicAttack: number;
    heavyAttack: number;
    resonanceSkill: number;
    resonanceLiberation: number;
    forteCircuit: number;
    outroSkill: number;
    introSkill: number;
    elementalReactions: number;
    total: number;
}

/**
 * Calculated final stats
 */
export interface CalculatedStats {
    atk: number;
    hp: number;
    def: number;
    critRate: number;
    critDmg: number;
    energyRegen: number;
    elementalDmgBonus: Record<ElementType, number>;
    totalDmgBonus: number;
}

/**
 * Rotation step
 */
export interface RotationStep {
    action: string;
    damage: number;
    time: number;
    concertoEnergy?: number;
}

/**
 * Echo optimization request
 */
export interface EchoOptimizationRequest {
    character: CharacterStats;
    availableEchoes: EchoData[];
    targetCost: number;
    preferredSets?: string[];
    preferredMainStats?: StatType[];
}

/**
 * Echo optimization result
 */
export interface EchoOptimizationResult {
    id: string;
    characterId: string;
    timestamp: number;
    recommendedEchoes: EchoData[];
    estimatedDps: number;
    estimatedTotalDamage: number;
    alternatives: Array<{
        echoes: EchoData[];
        dps: number;
        reason: string;
    }>;
}

/**
 * Module state
 */
interface DamageCalculatorState {
    characterDatabase: Map<string, CharacterStats>;
    echoDatabase: Map<string, EchoData>;
    calculationCount: number;
    lastCalculationTime: number;
}

/**
 * Damage Calculator Module Implementation
 */
class DamageCalculatorModule implements ModuleAPI {
    public readonly moduleId = 'damage-calculator';
    public readonly manifest: ModuleManifest;
    public health: ModuleHealthStatus = 'unloaded';

    private kernel: KernelInterface | null = null;
    private state: DamageCalculatorState = {
        characterDatabase: new Map(),
        echoDatabase: new Map(),
        calculationCount: 0,
        lastCalculationTime: 0,
    };
    private config: {
        damageCalculator?: {
            defaultEnemyLevel?: number;
            defaultEnemyResistance?: number;
            includeResonanceBonus?: boolean;
            includeConcertoEffects?: boolean;
            precision?: number;
        };
    } = {};

    constructor(manifest: ModuleManifest) {
        this.manifest = manifest;
    }

    /**
     * Initialize the module
     */
    async initialize(kernel: KernelInterface): Promise<void> {
        this.kernel = kernel;
        this.config = kernel.config.getAll();

        // Subscribe to events
        kernel.eventBus.subscribe('damage:calculate-request', this.handleCalculationRequest.bind(this));
        kernel.eventBus.subscribe('echo:scanned', this.handleEchoScanned.bind(this));

        // Re-seed the roster whenever the active game changes so this engine
        // always reflects the loaded game (game-agnostic at the data level).
        kernel.eventBus.subscribe('game:loaded', async () => {
            await this.loadCharacterDatabase();
        });

        // Game-agnostic loadout optimization. The renderer sends the character,
        // gear pool and config (targets, buffs, enemy, catalog); we run the
        // SAME shared engine the renderer would and return ranked loadouts.
        // This makes the backend the source of truth for optimization while the
        // renderer keeps a client-side fallback (identical code → identical output).
        kernel.eventBus.onRequest<
            { character: CharacterEntry; pool: GearEntry[]; config: OptimizeConfig },
            { ok: true; loadouts: Loadout[] }
        >('damage-calculator:optimize', async ({ character, pool, config }) => {
            const loadouts = runOptimize(character, pool, config);
            this.state.calculationCount += 1;
            this.state.lastCalculationTime = Date.now();
            return { ok: true, loadouts };
        });

        // Load character database from the active game's bundle.
        await this.loadCharacterDatabase();

        this.health = 'healthy';
        kernel.logger.info('[Damage Calculator] Module initialized');
    }

    /**
     * Resolve the active game id from the kernel config (injected by the
     * game-loader under `game.activeGame`).
     */
    private getActiveGameId(): string | undefined {
        const cfg = this.kernel?.config.getAll() as { game?: { activeGame?: string } } | undefined;
        return cfg?.game?.activeGame;
    }

    /**
     * Map a bundle character (UI-facing shape) to this engine's CharacterStats.
     * The bundle carries derived/current stats; we treat them as the base for
     * calculation. Element is kept as-is (may be a non-WuWa element for other
     * games; it's only used as a lookup key and degrades to no bonus).
     */
    private bundleCharToStats(c: CharacterEntry): CharacterStats {
        const s = c.stats ?? {};
        const elementBonus = { [c.element]: s[`${c.element.toLowerCase()}Dmg`] ?? 0 } as unknown as Record<ElementType, number>;
        return {
            id: c.id,
            name: c.name,
            element: c.element as ElementType,
            weapon: c.weaponType as WeaponType,
            baseAtk: s.atk ?? 0,
            baseHp: s.hp ?? 0,
            baseDef: s.def ?? 0,
            critRate: s.critRate ?? 5,
            critDmg: s.critDmg ?? 50,
            energyRegen: s.energyRegen ?? 100,
            atkPercent: 0,
            hpPercent: 0,
            defPercent: 0,
            elementalDmgBonus: elementBonus,
            healingBonus: 0,
            resonanceChain: 0,
            level: 90,
            ascension: 6,
        };
    }

    /**
     * Load the character base-stats database from the active game's bundle,
     * falling back to a built-in Wuthering Waves roster when no bundle is
     * available (e.g. before the game-loader has injected a game).
     */
    private async loadCharacterDatabase(): Promise<void> {
        const gameId = this.getActiveGameId();
        const bundle: GameBundle | undefined = gameId ? getGameBundle(gameId) : undefined;

        if (bundle && bundle.characters.length > 0) {
            this.state.characterDatabase.clear();
            for (const c of bundle.characters) {
                this.state.characterDatabase.set(c.id, this.bundleCharToStats(c));
            }
            this.kernel?.logger.info('[Damage Calculator] Roster seeded from game bundle', {
                game: bundle.id,
                characters: bundle.characters.length,
            });
            return;
        }

        // Fallback: built-in default characters (Wuthering Waves).
        this.state.characterDatabase.clear();
        const defaultCharacters: CharacterStats[] = [
            {
                id: 'rover-spectro',
                name: 'Rover (Spectro)',
                element: 'Spectro',
                weapon: 'Sword',
                baseAtk: 729,
                baseHp: 12924,
                baseDef: 582,
                critRate: 5,
                critDmg: 50,
                energyRegen: 100,
                atkPercent: 0,
                hpPercent: 0,
                defPercent: 0,
                elementalDmgBonus: {} as Record<ElementType, number>,
                healingBonus: 0,
                resonanceChain: 0,
                level: 90,
                ascension: 6,
            },
            {
                id: 'jinhsi',
                name: 'Jinhsi',
                element: 'Spectro',
                weapon: 'Broadblade',
                baseAtk: 729,
                baseHp: 12924,
                baseDef: 582,
                critRate: 5,
                critDmg: 50,
                energyRegen: 100,
                atkPercent: 0,
                hpPercent: 0,
                defPercent: 0,
                elementalDmgBonus: {} as Record<ElementType, number>,
                healingBonus: 0,
                resonanceChain: 0,
                level: 90,
                ascension: 6,
            },
            {
                id: 'yinlin',
                name: 'Yinlin',
                element: 'Electro',
                weapon: 'Rectifier',
                baseAtk: 729,
                baseHp: 11520,
                baseDef: 518,
                critRate: 5,
                critDmg: 50,
                energyRegen: 100,
                atkPercent: 0,
                hpPercent: 0,
                defPercent: 0,
                elementalDmgBonus: {} as Record<ElementType, number>,
                healingBonus: 0,
                resonanceChain: 0,
                level: 90,
                ascension: 6,
            },
        ];

        for (const char of defaultCharacters) {
            this.state.characterDatabase.set(char.id, char);
        }
    }

    /**
     * Handle damage calculation request
     */
    private async handleCalculationRequest(message: EventMessage<DamageCalculationRequest>): Promise<void> {
        const correlationId = message.correlationId || generateCorrelationId();

        try {
            const result = await this.calculateDamage(message.payload);

            await this.kernel?.eventBus.publish('damage:calculated', {
                result,
            }, { source: this.moduleId, correlationId });
        } catch (error) {
            this.kernel?.logger.error('[Damage Calculator] Calculation failed', { error: (error as Error).message });
            await this.kernel?.eventBus.publish('damage:calculation-failed', {
                error: (error as Error).message,
                request: message.payload,
            }, { source: this.moduleId, correlationId });
        }
    }

    /**
     * Handle new echo from OCR scanner
     */
    private async handleEchoScanned(message: EventMessage<{ echo: any }>): Promise<void> {
        const echo = message.payload.echo;
        this.state.echoDatabase.set(echo.id, echo);
        this.kernel?.logger.debug('[Damage Calculator] Echo added to database', { echoId: echo.id });
    }

    /**
     * Calculate damage for a character with given echoes
     */
    async calculateDamage(request: DamageCalculationRequest): Promise<DamageCalculationResult> {
        const startTime = Date.now();

        // Calculate final stats
        const stats = this.calculateFinalStats(request.character, request.echoes);

        // Calculate damage breakdown
        const breakdown = this.calculateDamageBreakdown(request.character, stats, request.enemy, request.options);

        // Generate rotation
        const rotation = this.generateRotation(request.character, stats, request.options);

        // Calculate total damage and DPS
        const totalDamage = Object.values(breakdown).reduce((sum, val) => sum + val, 0) - breakdown.total;
        const rotationTime = request.options?.rotationLength || 20; // seconds
        const dps = totalDamage / rotationTime;

        const result: DamageCalculationResult = {
            id: generateId('dmg-'),
            characterId: request.character.id,
            timestamp: Date.now(),
            totalDamage,
            dps,
            breakdown,
            rotation,
            stats,
        };

        this.state.calculationCount++;
        this.state.lastCalculationTime = Date.now();

        return result;
    }

    /**
     * Calculate final stats from base + echoes
     */
    private calculateFinalStats(character: CharacterStats, echoes: EchoData[]): CalculatedStats {
        // Base stats at level 90
        const levelMultiplier = this.getLevelMultiplier(character.level);
        const ascensionBonus = this.getAscensionBonus(character.ascension);

        let atk = character.baseAtk * levelMultiplier * (1 + ascensionBonus.atk);
        let hp = character.baseHp * levelMultiplier * (1 + ascensionBonus.hp);
        let def = character.baseDef * levelMultiplier * (1 + ascensionBonus.def);

        // Accumulate flat ATK/HP/DEF from echoes here. WHY an object: numbers are
        // passed by value, so applyStat cannot mutate flat totals through plain
        // number parameters — the additions would be silently discarded.
        const flatBonus = { atk: 0, hp: 0, def: 0 };

        // Add echo stats
        for (const echo of echoes) {
            // Main stat
            const mainValue = this.getEchoStatValue(echo.mainStat, echo.level);
            this.applyStat(character, echo.mainStat.type, mainValue, flatBonus);

            // Sub stats
            for (const subStat of echo.subStats) {
                const subValue = this.getEchoStatValue(subStat, echo.level);
                this.applyStat(character, subStat.type, subValue, flatBonus);
            }

            // Set bonuses
            if (echo.setName) {
                this.applySetBonus(echo.setName, character);
            }
        }

        // Add character's own stat bonuses. ATK%/HP%/DEF% scale the base stats;
        // flat echo ATK/HP/DEF is added on top afterwards (not scaled by %).
        atk *= (1 + character.atkPercent / 100);
        hp *= (1 + character.hpPercent / 100);
        def *= (1 + character.defPercent / 100);

        atk += flatBonus.atk;
        hp += flatBonus.hp;
        def += flatBonus.def;

        // Crit stats (cap at 100%)
        const critRate = Math.min(100, character.critRate);
        const critDmg = character.critDmg;

        // Elemental damage bonus
        const elementalDmgBonus: Record<ElementType, number> = {} as Record<ElementType, number>;
        for (const element of ['Glacio', 'Fusion', 'Electro', 'Aero', 'Spectro', 'Havoc', 'Physical'] as ElementType[]) {
            elementalDmgBonus[element] = (character.elementalDmgBonus[element] || 0);
        }

        // Add resonance chain bonuses
        if (this.config.damageCalculator?.includeResonanceBonus && character.resonanceChain > 0) {
            this.applyResonanceBonus(character, elementalDmgBonus);
        }

        // Calculate total damage bonus
        const totalDmgBonus = elementalDmgBonus[character.element] || 0;

        return {
            atk: Math.floor(atk),
            hp: Math.floor(hp),
            def: Math.floor(def),
            critRate,
            critDmg,
            energyRegen: character.energyRegen,
            elementalDmgBonus,
            totalDmgBonus,
        };
    }

    /**
     * Apply a stat value to character
     */
    private applyStat(
        character: CharacterStats,
        type: StatType,
        value: number,
        flat: { atk: number; hp: number; def: number }
    ): void {
        switch (type) {
            case 'ATK':
                flat.atk += value;
                break;
            case 'ATK%':
                character.atkPercent += value;
                break;
            case 'HP':
                flat.hp += value;
                break;
            case 'HP%':
                character.hpPercent += value;
                break;
            case 'DEF':
                flat.def += value;
                break;
            case 'DEF%':
                character.defPercent += value;
                break;
            case 'CRIT Rate':
                character.critRate += value;
                break;
            case 'CRIT DMG':
                character.critDmg += value;
                break;
            case 'Energy Regen':
                character.energyRegen += value;
                break;
        }
    }

    /**
     * Get echo stat value at level
     */
    private getEchoStatValue(stat: { type: StatType; value: number }, level: number): number {
        // Echo stats scale with level
        const levelScaling = level / 25; // Max level 25
        return stat.value * levelScaling;
    }

    /**
     * Apply echo set bonus
     */
    private applySetBonus(setName: string, character: CharacterStats): void {
        const setBonuses: Record<string, Partial<CharacterStats>> = {
            'Molten Rift': { elementalDmgBonus: { Fusion: 10 } as Record<ElementType, number> },
            'Thundering Mephis': { elementalDmgBonus: { Electro: 10 } as Record<ElementType, number> },
            'Inferno Rider': { elementalDmgBonus: { Fusion: 12 } as Record<ElementType, number> },
            'Crownless': { atkPercent: 12 },
            'Void Thunder': { elementalDmgBonus: { Electro: 12 } as Record<ElementType, number> },
            'Lampylumen Myriad': { energyRegen: 10 },
            'Celestial Light': { elementalDmgBonus: { Spectro: 10 } as Record<ElementType, number> },
            'Sierra Gale': { elementalDmgBonus: { Aero: 10 } as Record<ElementType, number> },
            'Moonlit Clouds': { hpPercent: 12 },
            'Rejuvenating Glow': { healingBonus: 15 },
            'Hidden Heart': { critRate: 8 },
            'Endless Resonance': { elementalDmgBonus: { Havoc: 10 } as Record<ElementType, number> },
        };

        const bonus = setBonuses[setName];
        if (bonus) {
            Object.assign(character, bonus);
        }
    }

    /**
     * Apply resonance chain bonuses
     */
    private applyResonanceBonus(character: CharacterStats, elementalDmgBonus: Record<ElementType, number>): void {
        // Simplified resonance bonuses
        const chain = character.resonanceChain;
        if (chain >= 1) elementalDmgBonus[character.element] = (elementalDmgBonus[character.element] || 0) + 5;
        if (chain >= 3) character.critRate += 5;
        if (chain >= 5) elementalDmgBonus[character.element] = (elementalDmgBonus[character.element] || 0) + 10;
        if (chain === 6) character.critDmg += 20;
    }

    /**
     * Get level multiplier
     */
    private getLevelMultiplier(level: number): number {
        // Simplified level scaling
        return 1 + (level - 1) * 0.02;
    }

    /**
     * Get ascension bonus
     */
    private getAscensionBonus(ascension: number): { atk: number; hp: number; def: number } {
        const bonuses = [
            { atk: 0, hp: 0, def: 0 },
            { atk: 0.06, hp: 0.06, def: 0.06 },
            { atk: 0.12, hp: 0.12, def: 0.12 },
            { atk: 0.18, hp: 0.18, def: 0.18 },
            { atk: 0.24, hp: 0.24, def: 0.24 },
            { atk: 0.30, hp: 0.30, def: 0.30 },
            { atk: 0.36, hp: 0.36, def: 0.36 },
        ];
        return bonuses[ascension] || bonuses[0];
    }

    /**
     * Calculate damage breakdown
     */
    private calculateDamageBreakdown(
        character: CharacterStats,
        stats: CalculatedStats,
        enemy?: DamageCalculationRequest['enemy'],
        options?: DamageCalculationRequest['options']
    ): DamageBreakdown {
        const enemyLevel = enemy?.level || this.config.damageCalculator?.defaultEnemyLevel || 90;
        const enemyResistance = enemy?.resistance[character.element] || this.config.damageCalculator?.defaultEnemyResistance || 10;
        const enemyDefense = enemy?.defense || this.getEnemyDefense(enemyLevel);

        // Defense reduction formula
        const defReduction = (character.level + 20) / (character.level + 20 + enemyLevel + 20);
        const defMultiplier = defReduction * (1 - enemyResistance / 100);

        // Crit multiplier
        const critMultiplier = 1 + (stats.critRate / 100) * (stats.critDmg / 100);

        // Base damage multiplier
        const baseMultiplier = stats.atk * defMultiplier * critMultiplier * (1 + stats.totalDmgBonus / 100);

        // Skill multipliers (simplified)
        const multipliers = {
            basicAttack: 1.0,
            heavyAttack: 2.5,
            resonanceSkill: 3.2,
            resonanceLiberation: 5.5,
            forteCircuit: 2.8,
            outroSkill: 1.8,
            introSkill: 1.5,
        };

        const breakdown: DamageBreakdown = {
            basicAttack: 0,
            heavyAttack: 0,
            resonanceSkill: 0,
            resonanceLiberation: 0,
            forteCircuit: 0,
            outroSkill: 0,
            introSkill: 0,
            elementalReactions: 0,
            total: 0,
        };

        for (const [key, multiplier] of Object.entries(multipliers)) {
            const damage = baseMultiplier * multiplier;
            breakdown[key as keyof DamageBreakdown] = Math.floor(damage);
        }

        // Elemental reactions (simplified)
        if (options?.includeConcertoEffects) {
            breakdown.elementalReactions = Math.floor(baseMultiplier * 0.5);
        }

        breakdown.total = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

        return breakdown;
    }

    /**
     * Get enemy defense at level
     */
    private getEnemyDefense(level: number): number {
        // Simplified enemy defense formula
        return Math.floor(100 + level * 5);
    }

    /**
     * Generate optimal rotation
     */
    private generateRotation(
        character: CharacterStats,
        stats: CalculatedStats,
        options?: DamageCalculationRequest['options']
    ): RotationStep[] {
        const rotationLength = options?.rotationLength || 20;
        const rotation: RotationStep[] = [];
        let time = 0;
        let concertoEnergy = 0;

        // Basic rotation pattern
        const steps = [
            { action: 'Resonance Liberation', multiplier: 5.5, duration: 3, energy: 30 },
            { action: 'Resonance Skill', multiplier: 3.2, duration: 2, energy: 15 },
            { action: 'Forte Circuit', multiplier: 2.8, duration: 2.5, energy: 10 },
            { action: 'Heavy Attack', multiplier: 2.5, duration: 1.5, energy: 5 },
            { action: 'Basic Attack', multiplier: 1.0, duration: 1, energy: 2 },
        ];

        for (const step of steps) {
            if (time + step.duration > rotationLength) break;

            const damage = stats.atk * step.multiplier * (1 + stats.totalDmgBonus / 100);
            rotation.push({
                action: step.action,
                damage: Math.floor(damage),
                time,
                concertoEnergy: step.energy,
            });

            time += step.duration;
            concertoEnergy += step.energy;
        }

        // Add outro/intro if team provided
        if (concertoEnergy >= 100) {
            rotation.push({
                action: 'Outro Skill',
                damage: Math.floor(stats.atk * 1.8),
                time,
                concertoEnergy: -100,
            });
            time += 1.5;
        }

        return rotation;
    }

    /**
     * Optimize echo selection for a character
     */
    async optimizeEchoes(request: EchoOptimizationRequest): Promise<EchoOptimizationResult> {
        const { character, availableEchoes, targetCost, preferredSets, preferredMainStats } = request;

        // Filter echoes by cost
        const validEchoes = availableEchoes.filter(e => e.cost <= targetCost);

        // Group by cost
        const echoesByCost = new Map<number, EchoData[]>();
        for (const echo of validEchoes) {
            if (!echoesByCost.has(echo.cost)) {
                echoesByCost.set(echo.cost, []);
            }
            echoesByCost.get(echo.cost)!.push(echo);
        }

        // Find best combination (simplified greedy approach)
        const costs = [4, 3, 2, 1]; // Echo costs
        const selectedEchoes: EchoData[] = [];
        let remainingCost = targetCost;

        for (const cost of costs) {
            const echoes = echoesByCost.get(cost) || [];
            if (echoes.length === 0) continue;

            // Score echoes
            const scored = echoes.map(echo => ({
                echo,
                score: this.scoreEcho(echo, character, preferredSets, preferredMainStats),
            }));

            scored.sort((a, b) => b.score - a.score);

            // Take best that fits
            for (const { echo, score } of scored) {
                if (echo.cost <= remainingCost && !selectedEchoes.some(s => s.id === echo.id)) {
                    selectedEchoes.push(echo);
                    remainingCost -= echo.cost;
                    break;
                }
            }
        }

        // Calculate estimated DPS
        const calcResult = await this.calculateDamage({
            character,
            echoes: selectedEchoes,
        });

        return {
            id: generateId('opt-'),
            characterId: character.id,
            timestamp: Date.now(),
            recommendedEchoes: selectedEchoes,
            estimatedDps: calcResult.dps,
            estimatedTotalDamage: calcResult.totalDamage,
            alternatives: [],
        };
    }

    /**
     * Score an echo for a character
     */
    private scoreEcho(
        echo: EchoData,
        character: CharacterStats,
        preferredSets?: string[],
        preferredMainStats?: StatType[]
    ): number {
        let score = 0;

        // Main stat preference
        if (preferredMainStats?.includes(echo.mainStat.type)) {
            score += 100;
        }

        // Set preference
        if (echo.setName && preferredSets?.includes(echo.setName)) {
            score += 50;
        }

        // Elemental set bonus
        const elementalSets: Record<ElementType, string[]> = {
            Glacio: [],
            Fusion: ['Molten Rift', 'Inferno Rider'],
            Electro: ['Thundering Mephis', 'Void Thunder'],
            Aero: ['Sierra Gale'],
            Spectro: ['Celestial Light', 'Crownless'],
            Havoc: ['Endless Resonance'],
            Physical: ['Hidden Heart'],
        };

        if (echo.setName && elementalSets[character.element]?.includes(echo.setName)) {
            score += 30;
        }

        // Main stat value
        score += echo.mainStat.value * 2;

        // Sub stat quality
        for (const sub of echo.subStats) {
            if (['CRIT Rate', 'CRIT DMG', 'ATK%', 'Energy Regen'].includes(sub.type)) {
                score += sub.value * 3;
            } else {
                score += sub.value;
            }
        }

        return score;
    }

    /**
     * Get module configuration
     */
    getConfig(): Record<string, unknown> {
        return { ...this.config };
    }

    /**
     * Update module configuration
     */
    async configure(config: Record<string, unknown>): Promise<void> {
        this.config = { ...this.config, ...config };
    }

    /**
     * Shutdown the module
     */
    async shutdown(): Promise<void> {
        this.state.characterDatabase.clear();
        this.state.echoDatabase.clear();
        this.health = 'unloaded';
        this.kernel?.logger.info('[Damage Calculator] Module shutdown');
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<ModuleHealthStatus> {
        if (this.state.characterDatabase.size === 0) {
            this.health = 'degraded';
            return 'degraded';
        }
        this.health = 'healthy';
        return 'healthy';
    }

    /**
     * Get module state
     */
    getState(): ModuleState {
        return {
            moduleId: this.moduleId,
            health: this.health,
            uptime: Date.now() - (this.state.lastCalculationTime || Date.now()),
            data: {
                characterCount: this.state.characterDatabase.size,
                echoCount: this.state.echoDatabase.size,
                calculationCount: this.state.calculationCount,
                lastCalculationTime: this.state.lastCalculationTime,
                config: this.config,
            },
            lastHealthCheck: Date.now(),
            loadedAt: this.state.lastCalculationTime || Date.now(),
        };
    }

    /**
     * Get character from database
     */
    getCharacter(id: string): CharacterStats | undefined {
        return this.state.characterDatabase.get(id);
    }

    /**
     * Get all characters
     */
    getAllCharacters(): CharacterStats[] {
        return Array.from(this.state.characterDatabase.values());
    }

    /**
     * Add character to database
     */
    addCharacter(character: CharacterStats): void {
        this.state.characterDatabase.set(character.id, character);
    }

    /**
     * Get echo from database
     */
    getEcho(id: string): EchoData | undefined {
        return this.state.echoDatabase.get(id);
    }

    /**
     * Get all echoes
     */
    getAllEchoes(): EchoData[] {
        return Array.from(this.state.echoDatabase.values());
    }
}

/**
 * Module factory function
 */
const factory: ModuleFactory = async (options: ModuleLoaderOptions): Promise<ModuleAPI> => {
    const module = new DamageCalculatorModule(manifest);
    return module;
};

export default factory;