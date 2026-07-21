import { useState, useEffect } from 'react';
import { useWindowStore } from '../../stores/windowStore';
import { RotationCharacterPickerWindow } from '../CharacterWindows';
import { elapsedTimes, cooldownWarningFor } from '../../lib/rotationEngine';
import type { FieldSpec, RotationStepSpec } from '../../types';

interface RotationBuilderProps {
    field: FieldSpec;
    value: RotationStepSpec[];
    onChange: (value: RotationStepSpec[]) => void;
    disabled?: boolean;
    /** When set, "Add Character" only offers these — no full-roster search
     * override. Undefined = today's full-roster picker (no party selected yet). */
    restrictToCharacterIds?: string[];
}

/**
 * Rotation builder component - a visual timeline editor for character rotations.
 * 
 * The module provides the config via FieldSpec.rotationConfig:
 * - characters: array of { id, label, icon }
 * - skills: record of characterId -> skills array
 * - defaultRotation: optional initial rotation
 * - maxRotationLength: max seconds
 * - showEnergy: show energy bar
 * 
 * The component renders:
 * - Character selector (adds character to rotation)
 * - Timeline with draggable steps (character blocks)
 * - Each step expands to show skill selector, duration, energy
 * - Total time / energy summary
 * - Action buttons (clear, reset, copy)
 */
export function RotationBuilder({ field, value, onChange, disabled, restrictToCharacterIds }: RotationBuilderProps) {
    const config = field.rotationConfig;

    // Hooks must run unconditionally on every render (Rules of Hooks) — the
    // `!config` guard clause was previously above these, calling them
    // conditionally between renders.
    const [expandedStep, setExpandedStep] = useState<number | null>(null);
    const [totalTime, setTotalTime] = useState(0);
    const [totalEnergy, setTotalEnergy] = useState(0);

    // Calculate totals
    useEffect(() => {
        const time = value.reduce((sum, step) => sum + (step.duration || 0), 0);
        const energy = value.reduce((sum, step) => sum + (step.energyGain || 0) - (step.energyCost || 0), 0);
        setTotalTime(time);
        setTotalEnergy(energy);
    }, [value]);

    if (!config) {
        return (
            <div className="p-4 border border-dashed border-red-500/40 bg-red-500/10 rounded-lg text-red-300 text-sm">
                RotationBuilder: missing rotationConfig in field spec
            </div>
        );
    }

    const characters = config.characters || [];
    const skills = config.skills || {};
    const maxTime = config.maxRotationLength || 30;

    const handleAddStep = (characterId: string) => {
        if (totalTime >= maxTime) return;
        // Not gated on `characters` containing this id: the "Add Character" picker
        // sources the FULL game roster independently, so a character can be added
        // here before the parent's `characters`/`skills` config (which only tracks
        // party members + characters already used in a step) knows about them yet.
        const charSkills = skills[characterId] || [];
        const defaultSkill = charSkills[0];

        const newStep: RotationStepSpec = {
            characterId,
            actionType: 'skill',
            skillId: defaultSkill?.id,
            skillLabel: defaultSkill?.label,
            duration: 2,
            energyCost: defaultSkill?.energyCost || 0,
            energyGain: 0,
        };

        onChange([...value, newStep]);
        setExpandedStep(value.length);
    };

    const handleUpdateStep = (index: number, updates: Partial<RotationStepSpec>) => {
        const next = [...value];
        next[index] = { ...next[index], ...updates };
        onChange(next);
    };

    const handleRemoveStep = (index: number) => {
        onChange(value.filter((_, i) => i !== index));
    };

    const handleMoveStep = (fromIndex: number, toIndex: number) => {
        const next = [...value];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        onChange(next);
    };

    const handleClear = () => {
        if (window.confirm('Clear the entire rotation?')) {
            onChange([]);
        }
    };

    const handleReset = () => {
        if (config.defaultRotation && config.defaultRotation.length > 0) {
            onChange(config.defaultRotation);
        }
    };

    // Available skills for a character
    const getSkillsForCharacter = (characterId: string) => {
        return skills[characterId] || [];
    };

    const elapsed = elapsedTimes(value);
    const cooldownsBySkillId: Record<string, number> = {};
    for (const list of Object.values(skills)) for (const s of list) if (s.cooldown != null) cooldownsBySkillId[s.id] = s.cooldown;

    return (
        <div className="space-y-4">
            {/* Header with summary */}
            <div className="flex items-center justify-between p-3 bg-surface border border-border rounded-lg">
                <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted">Total Time:</span>
                    <span className={`font-mono font-semibold ${totalTime > maxTime ? 'text-red-400' : 'text-accent'}`}>
                        {totalTime.toFixed(1)}s / {maxTime}s
                    </span>
                    {config.showEnergy && (
                        <>
                            <span className="text-muted">| Net Energy:</span>
                            <span className={`font-mono font-semibold ${totalEnergy >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {totalEnergy >= 0 ? '+' : ''}{totalEnergy}
                            </span>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleReset}
                        disabled={disabled || !config.defaultRotation?.length}
                        className="px-3 py-1.5 text-xs bg-surface border border-border rounded hover:bg-surface-2 transition-colors disabled:opacity-50"
                    >
                        Reset to Default
                    </button>
                    <button
                        onClick={handleClear}
                        disabled={disabled || value.length === 0}
                        className="px-3 py-1.5 text-xs bg-red-500/20 border border-red-500/30 text-red-300 rounded hover:bg-red-500/30 transition-colors disabled:opacity-50"
                    >
                        Clear
                    </button>
                </div>
            </div>

            {/* Add Character — restricted to the selected party's members when
                one is set; otherwise a searchable/filterable picker over the
                FULL game roster (no party selected yet, nothing to restrict to). */}
            <div>
                {restrictToCharacterIds && restrictToCharacterIds.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {restrictToCharacterIds.map((id) => {
                            const c = characters.find((ch) => ch.id === id);
                            return (
                                <button
                                    key={id}
                                    onClick={() => handleAddStep(id)}
                                    disabled={disabled || totalTime >= maxTime}
                                    className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {c?.label ?? id}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <button
                        onClick={() => useWindowStore.getState().openWindow('Add Character', <RotationCharacterPickerWindow onPick={handleAddStep} />)}
                        disabled={disabled || totalTime >= maxTime}
                        className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-lg hover:bg-surface-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="text-sm text-fg">Add Character</span>
                    </button>
                )}
            </div>

            {/* Timeline / Rotation steps */}
            <div className="space-y-2">
                {value.length === 0 ? (
                    <div className="p-8 text-center border-2 border-dashed border-border rounded-lg">
                        <svg className="w-12 h-12 mx-auto text-muted/50 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                        </svg>
                        <p className="text-muted">No steps in rotation</p>
                        <p className="text-xs text-muted/70 mt-1">Click a character above to add steps</p>
                    </div>
                ) : (
                    value.map((step, index) => (
                        <RotationStepCard
                            key={`${step.characterId}-${index}`}
                            index={index}
                            isLast={index === value.length - 1}
                            step={step}
                            isExpanded={expandedStep === index}
                            character={characters.find(c => c.id === step.characterId)}
                            availableSkills={getSkillsForCharacter(step.characterId)}
                            cooldownWarning={cooldownWarningFor(value, elapsed, index, cooldownsBySkillId)}
                            onToggleExpand={() => setExpandedStep(expandedStep === index ? null : index)}
                            onUpdate={(updates) => handleUpdateStep(index, updates)}
                            onRemove={() => handleRemoveStep(index)}
                            onMoveUp={() => index > 0 && handleMoveStep(index, index - 1)}
                            onMoveDown={() => index < value.length - 1 && handleMoveStep(index, index + 1)}
                            disabled={disabled}
                        />
                    ))
                )}
            </div>

            {/* Validation warnings */}
            {totalTime > maxTime && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">
                    ⚠ Rotation exceeds maximum time ({totalTime.toFixed(1)}s greater than {maxTime}s)
                </div>
            )}
            {config.showEnergy && totalEnergy < 0 && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-300 text-sm">
                    ⚠ Net energy negative ({totalEnergy}). Consider adding energy-generating skills.
                </div>
            )}
        </div>
    );
}

// ─── Rotation Step Card ────────────────────────────────────────────────────
interface RotationStepCardProps {
    index: number;
    isLast: boolean;
    step: RotationStepSpec;
    isExpanded: boolean;
    character?: { id: string; label: string; icon?: string };
    availableSkills: Array<{ id: string; label: string; type: string; energyCost?: number; cooldown?: number; stackMax?: number }>;
    cooldownWarning?: string;
    onToggleExpand: () => void;
    onUpdate: (updates: Partial<RotationStepSpec>) => void;
    onRemove: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    disabled?: boolean;
}

function RotationStepCard({
    index, isLast, step, isExpanded, character, availableSkills, cooldownWarning,
    onToggleExpand, onUpdate, onRemove, onMoveUp, onMoveDown, disabled
}: RotationStepCardProps) {
    const actionTypeLabels: Record<string, string> = {
        basic: 'Basic Attack',
        skill: 'Skill',
        ultimate: 'Ultimate',
        switch: 'Switch Character',
        movement: 'Movement',
        wait: 'Wait',
    };

    const selectedSkillStackMax = availableSkills.find((s) => s.id === step.skillId)?.stackMax;
    const selectedSkillCooldown = availableSkills.find((s) => s.id === step.skillId)?.cooldown;

    const actionTypeColors: Record<string, string> = {
        basic: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
        skill: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
        ultimate: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
        switch: 'bg-green-500/20 text-green-300 border-green-500/30',
        movement: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
        wait: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    };

    return (
        <div className="bg-surface border border-border rounded-lg overflow-hidden">
            {/* Collapsed header */}
            <button
                onClick={onToggleExpand}
                disabled={disabled}
                className="w-full p-3 flex items-center gap-3 hover:bg-surface transition-colors text-left disabled:opacity-70"
            >
                <span className="w-6 text-center text-muted">{index + 1}</span>
                {character?.icon && (
                    <span className="w-5 h-5" dangerouslySetInnerHTML={{ __html: character.icon }} />
                )}
                <span className="font-medium text-fg flex-1">{character?.label || step.characterId}</span>
                <span className={`px-2 py-0.5 text-xs rounded ${actionTypeColors[step.actionType] || 'bg-surface-2 text-muted'}`}>
                    {actionTypeLabels[step.actionType] || step.actionType}
                </span>
                {step.skillLabel && (
                    <span className="text-sm text-muted/70 px-2 py-0.5 bg-surface rounded">{step.skillLabel}</span>
                )}
                {selectedSkillCooldown != null && (
                    <span className="text-xs text-muted-foreground">CD {selectedSkillCooldown}s</span>
                )}
                {cooldownWarning && (
                    <span className="text-xs text-yellow-400" title={cooldownWarning}>{cooldownWarning}</span>
                )}
                <span className="font-mono text-sm text-muted w-16 text-right">
                    {(step.duration || 0).toFixed(1)}s
                </span>
                {checkStepEnergy(step) && (
                    <span className={`font-mono text-sm ${(step.energyGain || 0) - (step.energyCost || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatStepEnergy((step.energyGain || 0) - (step.energyCost || 0))}
                    </span>
                )}
                <svg className={`w-5 h-5 text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Expanded details */}
            {isExpanded && (
                <div className="px-3 pb-3 border-t border-border bg-surface-2 animate-slide-down">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3">
                        {/* Action type selector */}
                        <div>
                            <label className="block text-xs font-medium text-muted mb-1">Action Type</label>
                            <select
                                value={step.actionType}
                                onChange={(e) => onUpdate({ actionType: e.target.value as RotationStepSpec['actionType'], skillId: undefined, skillLabel: undefined })}
                                disabled={disabled}
                                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                            >
                                <option value="basic">Basic Attack</option>
                                <option value="skill">Skill</option>
                                <option value="ultimate">Ultimate</option>
                                <option value="switch">Switch Character</option>
                                <option value="movement">Movement</option>
                                <option value="wait">Wait</option>
                            </select>
                        </div>

                        {/* Skill selector (for skill/ultimate) */}
                        {(['skill', 'ultimate'].includes(step.actionType) && availableSkills.length > 0) && (
                            <div>
                                <label className="block text-xs font-medium text-muted mb-1">Skill</label>
                                <select
                                    value={step.skillId || ''}
                                    onChange={(e) => {
                                        const skill = availableSkills.find(s => s.id === e.target.value);
                                        onUpdate({
                                            skillId: e.target.value || undefined,
                                            skillLabel: skill?.label,
                                            energyCost: skill?.energyCost,
                                        });
                                    }}
                                    disabled={disabled}
                                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                                >
                                    <option value="">Select skill...</option>
                                    {availableSkills.map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.label} ({s.type}){s.energyCost !== undefined ? ` • ${formatStepEnergy(s.energyCost)}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Duration */}
                        <div>
                            <label className="block text-xs font-medium text-muted mb-1">Duration (s)</label>
                            <input
                                type="number"
                                value={step.duration || 0}
                                onChange={(e) => onUpdate({ duration: parseFloat(e.target.value) || 0 })}
                                min={0.1}
                                max={30}
                                step={0.1}
                                disabled={disabled}
                                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                            />
                        </div>

                        {/* Talent level / stack count override — blank = best case (Lv10 / max stacks), the same default the damage calc assumes. */}
                        {step.skillId && (
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-xs font-medium text-muted mb-1">Talent Level</label>
                                    <input
                                        type="number"
                                        value={step.talentLevel ?? ''}
                                        onChange={(e) => onUpdate({ talentLevel: e.target.value === '' ? undefined : Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) })}
                                        min={1}
                                        max={10}
                                        placeholder="Best (10)"
                                        disabled={disabled}
                                        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent"
                                    />
                                </div>
                                {selectedSkillStackMax != null && (
                                    <div>
                                        <label className="block text-xs font-medium text-muted mb-1">Stack Count</label>
                                        <input
                                            type="number"
                                            value={step.stackCount ?? ''}
                                            onChange={(e) => onUpdate({ stackCount: e.target.value === '' ? undefined : Math.max(0, Math.min(selectedSkillStackMax, parseInt(e.target.value) || 0)) })}
                                            min={0}
                                            max={selectedSkillStackMax}
                                            placeholder={`Best (${selectedSkillStackMax})`}
                                            disabled={disabled}
                                            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-fg placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-accent"
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Energy cost/gain */}
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-xs font-medium text-muted mb-1">Energy Cost</label>
                                <input
                                    type="number"
                                    value={step.energyCost || 0}
                                    onChange={(e) => onUpdate({ energyCost: parseInt(e.target.value) || 0 })}
                                    min={0}
                                    disabled={disabled}
                                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted mb-1">Energy Gain</label>
                                <input
                                    type="number"
                                    value={step.energyGain || 0}
                                    onChange={(e) => onUpdate({ energyGain: parseInt(e.target.value) || 0 })}
                                    min={0}
                                    disabled={disabled}
                                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
                                />
                            </div>
                        </div>

                        {/* Notes */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-medium text-muted mb-1 mb-1">Notes</label>
                            <textarea
                                value={step.notes || ''}
                                onChange={(e) => onUpdate({ notes: e.target.value })}
                                rows={2}
                                disabled={disabled}
                                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                                placeholder="Optional notes for this step..."
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-border mt-3">
                        <button
                            onClick={onMoveUp}
                            disabled={disabled || index === 0}
                            className="p-1.5 rounded hover:bg-surface-2 transition-colors disabled:opacity-50"
                            title="Move up"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                        </button>
                        <button
                            onClick={onMoveDown}
                            disabled={disabled || isLast}
                            className="p-1.5 rounded hover:bg-surface-2 transition-colors disabled:opacity-50"
                            title="Move down"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                        <button
                            onClick={onRemove}
                            disabled={disabled}
                            className="p-1.5 rounded hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-50"
                            title="Remove step"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function configShowEnergy(step: RotationStepSpec): boolean {
    return (step.energyCost !== undefined && step.energyCost > 0) ||
        (step.energyGain !== undefined && step.energyGain > 0);
}

function formatEnergy(e: number): string {
    return e >= 0 ? `+${e}` : String(e);
}

// Helper to check if step shows energy (for use in RotationStepCard)
const checkStepEnergy = configShowEnergy;
const formatStepEnergy = formatEnergy;