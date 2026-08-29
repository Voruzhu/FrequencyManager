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
    { id: 'dreamless', name: 'Dreamless', setName: 'Havoc Eclipse', cost: 4, icon: 'icons/echoes/dreamless.png' },
    { id: 'sigillum', name: 'Sigillum', setName: 'Trailblazing Star', cost: 4, icon: 'icons/echoes/sigillum.png' },
    { id: 'thousand-puppet-pavilion', name: 'Thousand-Puppet Pavilion', setName: 'Song of Feathered Trace', cost: 3, icon: 'icons/echoes/thousand-puppet-pavilion.png' },
    { id: 'hecate', name: 'Hecate', setName: 'Empyrean Anthem', cost: 4, icon: 'icons/echoes/hecate.png' },
    { id: 'hidden-heart', name: 'Hidden Heart', setName: 'Hidden Heart', cost: 3, icon: 'icons/echoes/hidden-heart.png' },
    { id: 'endless-resonance', name: 'Endless Resonance', setName: 'Endless Resonance', cost: 4, icon: 'icons/echoes/endless-resonance.png' },
    { id: 'jue', name: "Ju\u00e9", setName: 'Celestial Light', cost: 4, icon: 'icons/echoes/jue.png' },
    { id: 'reminiscence-fleurdelys', name: 'Reminiscence: Fleurdelys', setName: 'Gusts of Welkin', cost: 4, icon: 'icons/echoes/reminiscence-fleurdelys.png' },
    { id: 'nightmare-hecate', name: 'Nightmare: Hecate', setName: 'Dream of the Lost', cost: 4, icon: 'icons/echoes/nightmare-hecate.png' },
    { id: 'reminiscence-threnodian-leviathan', name: 'Reminiscence: Threnodian - Leviathan', setName: "Flamewing's Shadow", cost: 4, icon: 'icons/echoes/reminiscence-threnodian-leviathan.png' },
    { id: 'reminiscence-threnodian-voidborne', name: 'Reminiscence: Threnodian - Voidborne Construct', setName: 'Wishes of Quiet Snowfall', cost: 4, icon: 'icons/echoes/reminiscence-threnodian-voidborne.png' },
    { id: 'reminiscence-denia', name: 'Reminiscence: Denia', setName: 'Chromatic Foam', cost: 4, icon: 'icons/echoes/reminiscence-denia.png' },
];
export function getEcho(id: string): WUEcho | undefined { return ECHOES.find((e) => e.id === id); }
export function getEchoesBySet(setName: string): WUEcho[] { return ECHOES.filter((e) => e.setName === setName); }
