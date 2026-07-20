import { useNamedPartyStore } from '../../src/renderer/src/stores/namedPartyStore';

const GAME = 'wuthering-waves';

beforeEach(() => {
    useNamedPartyStore.setState({ byGame: {} });
});

describe('namedPartyStore', () => {
    it('saves and lists a party', () => {
        useNamedPartyStore.getState().save(GAME, { id: 'p1', name: 'Main DPS', memberCharacterIds: ['jinhsi'], disabled: [] });
        expect(useNamedPartyStore.getState().list(GAME)).toEqual([{ id: 'p1', name: 'Main DPS', memberCharacterIds: ['jinhsi'], disabled: [] }]);
    });

    it('caps membership at 3 via addMember, but allows saving fewer directly', () => {
        useNamedPartyStore.getState().save(GAME, { id: 'p1', name: 'Trio', memberCharacterIds: ['a', 'b'], disabled: [] });
        useNamedPartyStore.getState().addMember(GAME, 'p1', 'c');
        useNamedPartyStore.getState().addMember(GAME, 'p1', 'd'); // 4th — no-op
        expect(useNamedPartyStore.getState().list(GAME)[0].memberCharacterIds).toEqual(['a', 'b', 'c']);
    });

    it('removeMember drops a character from an existing party', () => {
        useNamedPartyStore.getState().save(GAME, { id: 'p1', name: 'Trio', memberCharacterIds: ['a', 'b', 'c'], disabled: [] });
        useNamedPartyStore.getState().removeMember(GAME, 'p1', 'b');
        expect(useNamedPartyStore.getState().list(GAME)[0].memberCharacterIds).toEqual(['a', 'c']);
    });

    it('remove deletes the whole party', () => {
        useNamedPartyStore.getState().save(GAME, { id: 'p1', name: 'Trio', memberCharacterIds: ['a'], disabled: [] });
        useNamedPartyStore.getState().remove(GAME, 'p1');
        expect(useNamedPartyStore.getState().list(GAME)).toEqual([]);
    });

    it('toggleEffect adds then removes an id from disabled', () => {
        useNamedPartyStore.getState().save(GAME, { id: 'p1', name: 'Trio', memberCharacterIds: ['a'], disabled: [] });
        useNamedPartyStore.getState().toggleEffect(GAME, 'p1', 'eff-1');
        expect(useNamedPartyStore.getState().list(GAME)[0].disabled).toEqual(['eff-1']);
        useNamedPartyStore.getState().toggleEffect(GAME, 'p1', 'eff-1');
        expect(useNamedPartyStore.getState().list(GAME)[0].disabled).toEqual([]);
    });
});
