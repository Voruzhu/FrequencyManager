import { applyLucillaMode } from '../../src/renderer/src/lib/lucillaMode';
import type { CharacterEntry } from '../../shared/types/game-bundle';

function char(id: string): CharacterEntry {
    return {
        kind: 'character', id, name: id, element: 'Glacio', weaponType: 'Rectifier', rarity: 5,
        stats: { atk: 1000, hp: 10000, def: 500 },
        skills: [
            { id: 'basic', name: 'Basic Attack', type: 'Basic', multiplier: 0.3, description: '' },
            { id: 'ult', name: 'Resonance Liberation', type: 'Ultimate', multiplier: 0.7, description: '' },
            { id: 'ultLettingItGo', name: 'Letting It Go', type: 'Ultimate', multiplier: 4.2, description: '' },
            { id: 'forte', name: 'Forte Circuit', type: 'Forte', multiplier: 1.4, description: '' },
        ],
        equipped: { gearIds: [] },
    };
}

describe('applyLucillaMode', () => {
    it('is a no-op for any character other than Lucilla', () => {
        const c = char('yelan');
        expect(applyLucillaMode(c, 'chafe')).toBe(c);
    });

    it('Chafe mode sets ult/ultLettingItGo/forte scope to basic, leaves other skills untouched', () => {
        const patched = applyLucillaMode(char('lucilla'), 'chafe');
        expect(patched.skills.find((s) => s.id === 'ult')?.scope).toBe('basic');
        expect(patched.skills.find((s) => s.id === 'ultLettingItGo')?.scope).toBe('basic');
        expect(patched.skills.find((s) => s.id === 'forte')?.scope).toBe('basic');
        expect(patched.skills.find((s) => s.id === 'basic')?.scope).toBeUndefined();
    });

    it('Echo mode sets scope to echo', () => {
        const patched = applyLucillaMode(char('lucilla'), 'echo');
        expect(patched.skills.find((s) => s.id === 'ult')?.scope).toBe('echo');
        expect(patched.skills.find((s) => s.id === 'forte')?.scope).toBe('echo');
    });

    it('does not mutate the original character object', () => {
        const original = char('lucilla');
        applyLucillaMode(original, 'echo');
        expect(original.skills.find((s) => s.id === 'ult')?.scope).toBeUndefined();
    });
});
