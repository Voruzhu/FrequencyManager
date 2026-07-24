import { Calculator, ScanLine, Boxes, Sparkles, Monitor, Coffee, ShieldCheck } from 'lucide-react';
import { PageHeader, Card, CardHeader, CardTitle, CardDescription, CardContent, Button } from '../components/ui';
import { useUIStore } from '../stores/uiStore';
import { openExternalLink } from '@/lib/platform';

const REPO_URL = 'https://github.com/Voruzhu/FrequencyManager';
const COFFEE_URL = 'https://buymeacoffee.com/voruzhu';

/**
 * The web build's landing screen — swapped in for `DashboardScreen` (see
 * `screens/registry.tsx`) since the real Dashboard's stats (modules enabled,
 * system health) describe Electron's internal plugin system and mean
 * nothing to a first-time web visitor. Electron keeps the real Dashboard
 * unchanged. See docs/WEB_VERSION.md.
 */
export function WelcomeScreen() {
    const setActiveScreen = useUIStore((s) => s.setActiveScreen);

    return (
        <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
            <PageHeader
                title="FrequencyManager"
                description="Free, open-source damage calculator & gear optimizer for Wuthering Waves and Genshin Impact."
            />

            {/* GitHub's README carries this too, but a web visitor may never see
             * that page — this is the one surface everyone reaches. */}
            <p className="text-xs text-muted-foreground">
                FrequencyManager is an independent fan-made project and is not affiliated with,
                endorsed by, or sponsored by Kuro Games, HoYoverse, or any other game
                developer/publisher. Wuthering Waves, Genshin Impact, and all related assets are
                trademarks of their respective owners.
            </p>

            <Card>
                <CardHeader><CardTitle>What it does</CardTitle></CardHeader>
                <CardContent>
                    <ul className="grid gap-3 sm:grid-cols-2">
                        <li className="flex items-start gap-3">
                            <Calculator className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                            <span className="text-sm text-muted-foreground">Build real damage calculations for any character and loadout.</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <Sparkles className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                            <span className="text-sm text-muted-foreground">Auto-optimize gear combinations for the highest damage or a target stat.</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <ScanLine className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                            <span className="text-sm text-muted-foreground">Scan gear screenshots with OCR instead of typing stats by hand.</span>
                        </li>
                        <li className="flex items-start gap-3">
                            <Boxes className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
                            <span className="text-sm text-muted-foreground">Track your full roster, weapons, and gear collection.</span>
                        </li>
                    </ul>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> This is the web version</CardTitle>
                    <CardDescription>
                        Runs entirely in your browser — nothing you enter is ever uploaded anywhere. Your characters,
                        gear, and saved builds are stored only in this browser's local storage. Clearing your browser
                        data, or switching to a different browser or device, means starting fresh — export a backup
                        first from Settings → Data if you want to bring your data along.
                    </CardDescription>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Monitor className="h-5 w-5 text-primary" /> Want more?</CardTitle>
                    <CardDescription>
                        The free desktop app adds a global hotkey for scanning gear straight out of the game, automatic
                        updates, and support for community-made game packages.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button variant="secondary" onClick={() => openExternalLink(REPO_URL)}>
                        <Monitor /> Get the desktop app
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
                <CardContent className="grid gap-2">
                    <Button variant="secondary" className="justify-start" onClick={() => setActiveScreen('calculator')}>
                        <Calculator /> Calculate damage
                    </Button>
                    <Button variant="secondary" className="justify-start" onClick={() => setActiveScreen('scanner')}>
                        <ScanLine /> Scan a screenshot
                    </Button>
                    <Button variant="secondary" className="justify-start" onClick={() => setActiveScreen('inventory')}>
                        <Boxes /> Open inventory
                    </Button>
                </CardContent>
            </Card>

            <div className="flex justify-end pb-2">
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => openExternalLink(COFFEE_URL)}>
                    <Coffee className="h-4 w-4" /> Buy me a coffee
                </Button>
            </div>
        </div>
    );
}
