import { useEffect, useState } from 'react';

const versionBridge = () => (window as unknown as {
    frequencyManager?: { getAppVersion?: () => Promise<string> };
}).frequencyManager;

/** Real Electron/package.json version via IPC — never hardcode a version literal in a component. */
export function useAppVersion(fallback = ''): string {
    const [version, setVersion] = useState(fallback);
    useEffect(() => {
        void (async () => {
            const v = await versionBridge()?.getAppVersion?.();
            if (v) setVersion(v);
        })();
    }, []);
    return version;
}
