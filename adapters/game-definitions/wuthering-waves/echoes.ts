export interface WUEcho {
    id: string; name: string; setName: string; cost: number; icon: string;
}
export const ECHOES: WUEcho[] = [
    { id: 'molten-rift', name: 'Molten Rift', setName: 'Molten Rift', cost: 4, icon: 'icons/echoes/molten-rift.png' },
    { id: 'thundering-mephis', name: 'Thundering Mephis', setName: 'Thundering Mephis', cost: 4, icon: 'icons/echoes/thundering-mephis.png' },
    { id: 'inferno-rider', name: 'Inferno Rider', setName: 'Inferno Rider', cost: 4, icon: 'icons/echoes/inferno-rider.png' },
    { id: 'crownless', name: 'Crownless', setName: 'Crownless', cost: 3, icon: 'icons/echoes/crownless.png' },
    { id: 'void-thunder', name: 'Void Thunder', setName: 'Void Thunder', cost: 3, icon: 'icons/echoes/void-thunder.png' },
    { id: 'lampylumen-myriad', name: 'Lampylumen Myriad', setName: 'Lampylumen Myriad', cost: 3, icon: 'icons/echoes/lampylumen-myriad.png' },
    { id: 'celestial-light', name: 'Celestial Light', setName: 'Celestial Light', cost: 1, icon: 'icons/echoes/celestial-light.png' },
    { id: 'sierra-gale', name: 'Sierra Gale', setName: 'Sierra Gale', cost: 1, icon: 'icons/echoes/sierra-gale.png' },
    { id: 'moonlit-clouds', name: 'Moonlit Clouds', setName: 'Moonlit Clouds', cost: 1, icon: 'icons/echoes/moonlit-clouds.png' },
    { id: 'rejuvenating-glow', name: 'Rejuvenating Glow', setName: 'Rejuvenating Glow', cost: 1, icon: 'icons/echoes/rejuvenating-glow.png' },
    { id: 'hidden-heart', name: 'Hidden Heart', setName: 'Hidden Heart', cost: 3, icon: 'icons/echoes/hidden-heart.png' },
    { id: 'endless-resonance', name: 'Endless Resonance', setName: 'Endless Resonance', cost: 4, icon: 'icons/echoes/endless-resonance.png' },
];
export function getEcho(id: string): WUEcho | undefined { return ECHOES.find((e) => e.id === id); }
export function getEchoesBySet(setName: string): WUEcho[] { return ECHOES.filter((e) => e.setName === setName); }
