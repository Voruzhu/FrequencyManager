import { Settings, Globe, Minus, Square, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useModuleStore } from '../stores/moduleStore';

interface TitleBarProps {
    onOpenSettings: () => void;
}

export function TitleBar({ onOpenSettings }: TitleBarProps) {
    const { modules, activeModuleId } = useModuleStore();

    const activeModule = modules.find(m => m.id === activeModuleId);

    const handleDrag = (e: React.MouseEvent) => {
        e.preventDefault();
    };

    return (
        <header
            className="h-10 px-4 flex items-center justify-between border-b border-white/10 bg-bg/80 backdrop-blur-sm"
            onMouseDown={handleDrag}
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                    <Globe className="w-5 h-5 text-black" />
                </div>
                <div className="flex flex-col">
                    <h1 className="text-lg font-semibold text-fg">FrequencyManager</h1>
                    {activeModule && (
                        <span className="text-xs text-muted capitalize">
                            {activeModule.name} • {activeModule.id}
                        </span>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-1">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onOpenSettings}
                    className="h-8 w-8"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    aria-label="Open settings"
                >
                    <Settings className="h-4 w-4 text-muted" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    aria-label="Minimize"
                >
                    <Minus className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    aria-label="Maximize"
                >
                    <Square className="h-3 w-3" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-error/20"
                    style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                    aria-label="Close"
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        </header>
    );
}
