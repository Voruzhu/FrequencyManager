/**
 * @fileoverview Genshin Impact artifact (equipment) database
 * @module adapters/game-definitions/genshin-impact/artifacts
 *
 * Artifact definitions with set names, slot types, and icon paths. Icons live under
 * `icons/artifacts/<id>.png` relative to this game package.
 */

export interface GIArtifact {
    id: string;
    name: string;
    setName: string;
    slotType: 'flower' | 'plume' | 'sands' | 'goblet' | 'circlet';
    icon: string;
}

export const ARTIFACTS: GIArtifact[] = [
    { id: 'gladiators-flower', name: "Gladiator's Flower", setName: "Gladiator's Finale", slotType: 'flower', icon: 'icons/artifacts/gladiators-flower.png' },
    { id: 'gladiators-plume', name: "Gladiator's Plume", setName: "Gladiator's Finale", slotType: 'plume', icon: 'icons/artifacts/gladiators-plume.png' },
    { id: 'gladiators-sands', name: "Gladiator's Sands", setName: "Gladiator's Finale", slotType: 'sands', icon: 'icons/artifacts/gladiators-sands.png' },
    { id: 'gladiators-goblet', name: "Gladiator's Goblet", setName: "Gladiator's Finale", slotType: 'goblet', icon: 'icons/artifacts/gladiators-goblet.png' },
    { id: 'gladiators-circlet', name: "Gladiator's Circlet", setName: "Gladiator's Finale", slotType: 'circlet', icon: 'icons/artifacts/gladiators-circlet.png' },
    { id: 'noblesse-flower', name: 'Flower of Noblesse', setName: 'Noblesse Oblige', slotType: 'flower', icon: 'icons/artifacts/noblesse-flower.png' },
    { id: 'noblesse-plume', name: 'Feather of Noblesse', setName: 'Noblesse Oblige', slotType: 'plume', icon: 'icons/artifacts/noblesse-plume.png' },
    { id: 'noblesse-sands', name: 'Hour of Noblesse', setName: 'Noblesse Oblige', slotType: 'sands', icon: 'icons/artifacts/noblesse-sands.png' },
    { id: 'noblesse-goblet', name: 'Goblet of Noblesse', setName: 'Noblesse Oblige', slotType: 'goblet', icon: 'icons/artifacts/noblesse-goblet.png' },
    { id: 'noblesse-circlet', name: 'Crown of Noblesse', setName: 'Noblesse Oblige', slotType: 'circlet', icon: 'icons/artifacts/noblesse-circlet.png' },
    { id: 'viridescent-flower', name: 'Wild Flower of Venerer', setName: 'Viridescent Venerer', slotType: 'flower', icon: 'icons/artifacts/viridescent-flower.png' },
    { id: 'viridescent-plume', name: 'Feather of Venerer', setName: 'Viridescent Venerer', slotType: 'plume', icon: 'icons/artifacts/viridescent-plume.png' },
    { id: 'viridescent-sands', name: 'Time of Venerer', setName: 'Viridescent Venerer', slotType: 'sands', icon: 'icons/artifacts/viridescent-sands.png' },
    { id: 'viridescent-goblet', name: 'Goblet of Venerer', setName: 'Viridescent Venerer', slotType: 'goblet', icon: 'icons/artifacts/viridescent-goblet.png' },
    { id: 'viridescent-circlet', name: 'Crown of Venerer', setName: 'Viridescent Venerer', slotType: 'circlet', icon: 'icons/artifacts/viridescent-circlet.png' },
];

export function getArtifact(id: string): GIArtifact | undefined {
    return ARTIFACTS.find((a) => a.id === id);
}

export function getArtifactsBySet(setName: string): GIArtifact[] {
    return ARTIFACTS.filter((a) => a.setName === setName);
}
