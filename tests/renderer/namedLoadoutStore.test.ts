import { useNamedLoadoutStore } from '../../src/renderer/src/stores/namedLoadoutStore';

describe('namedLoadoutStore', () => {
    beforeEach(() => useNamedLoadoutStore.setState({ byGame: {} }));

    it('saves and lists loadouts scoped to a character, ignoring other characters/games', () => {
        useNamedLoadoutStore.getState().save('wuthering-waves', { id: 'a', name: 'Crit build', characterId: 'yelan', loadout: { gearIds: ['g1'] } });
        useNamedLoadoutStore.getState().save('wuthering-waves', { id: 'b', name: 'ER build', characterId: 'yelan', loadout: { gearIds: ['g2'] } });
        useNamedLoadoutStore.getState().save('wuthering-waves', { id: 'c', name: 'Other char', characterId: 'jinhsi', loadout: { gearIds: [] } });
        useNamedLoadoutStore.getState().save('genshin-impact', { id: 'd', name: 'Wrong game', characterId: 'yelan', loadout: { gearIds: [] } });

        const list = useNamedLoadoutStore.getState().listFor('wuthering-waves', 'yelan');
        expect(list.map((l) => l.id).sort()).toEqual(['a', 'b']);
    });

    it('removes a saved loadout by id', () => {
        useNamedLoadoutStore.getState().save('wuthering-waves', { id: 'a', name: 'X', characterId: 'yelan', loadout: { gearIds: [] } });
        useNamedLoadoutStore.getState().remove('wuthering-waves', 'a');
        expect(useNamedLoadoutStore.getState().listFor('wuthering-waves', 'yelan')).toHaveLength(0);
    });
});
