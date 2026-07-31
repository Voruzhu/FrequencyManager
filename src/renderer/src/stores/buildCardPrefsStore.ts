import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { userStorage } from '../lib/userStorage';

interface BuildCardPrefsState {
    /** byGame[gameId][characterId] = data URL of a user-uploaded override image. */
    customImages: Record<string, Record<string, string>>;
    lastAccentColor?: string;
    setCustomImage: (gameId: string, characterId: string, dataUrl: string | undefined) => void;
    setLastAccentColor: (color: string) => void;
}

export const useBuildCardPrefsStore = create<BuildCardPrefsState>()(
    persist(
        (set) => ({
            customImages: {},
            setCustomImage: (gameId, characterId, dataUrl) => set((s) => {
                const forGame = { ...s.customImages[gameId] };
                if (dataUrl) forGame[characterId] = dataUrl; else delete forGame[characterId];
                return { customImages: { ...s.customImages, [gameId]: forGame } };
            }),
            setLastAccentColor: (color) => set({ lastAccentColor: color }),
        }),
        { name: 'fm-build-card-prefs', storage: createJSONStorage(() => userStorage) },
    ),
);
