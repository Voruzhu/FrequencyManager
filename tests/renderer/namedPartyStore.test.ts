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

    it('caps membership at the caller-supplied max via addMember, but allows saving fewer directly', () => {
        useNamedPartyStore.getState().save(GAME, { id: 'p1', name: 'Trio', memberCharacterIds: ['a', 'b'], disabled: [] });
        useNamedPartyStore.getState().addMember(GAME, 'p1', 'c', 3);
        useNamedPartyStore.getState().addMember(GAME, 'p1', 'd', 3); // 4th — no-op, over the max
        expect(useNamedPartyStore.getState().list(GAME)[0].memberCharacterIds).toEqual(['a', 'b', 'c']);
    });

    it('the max is per-call, not a fixed constant — a caller can pass a different game\'s real party size', () => {
        // Regression: `max` used to be a hardcoded module constant (always 3),
        // silently capping every game the same way even though Genshin's real
        // party size is 4. Now it's whatever the caller passes.
        useNamedPartyStore.getState().save(GAME, { id: 'p1', name: 'Quartet', memberCharacterIds: ['a', 'b', 'c'], disabled: [] });
        useNamedPartyStore.getState().addMember(GAME, 'p1', 'd', 4);
        expect(useNamedPartyStore.getState().list(GAME)[0].memberCharacterIds).toEqual(['a', 'b', 'c', 'd']);
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
