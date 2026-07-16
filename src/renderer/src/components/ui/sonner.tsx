import { Toaster as Sonner, toast } from 'sonner';
import { useThemeStore } from '@/stores/themeStore';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * App toaster. Colors are driven by our theme tokens (via CSS custom properties
 * sonner reads), and light/dark is taken from the active preset's appearance.
 */
export function Toaster(props: ToasterProps) {
    const theme = useThemeStore((s) => s.theme);
    const presets = useThemeStore((s) => s.presets);
    const appearance = presets.find((p) => p.name === theme)?.appearance ?? 'dark';

    return (
        <Sonner
            theme={appearance}
            position="bottom-right"
            toastOptions={{
                classNames: {
                    toast:
                        'group rounded-md border border-border bg-popover text-popover-foreground shadow-elevation-2 text-sm',
                    description: 'text-muted-foreground',
                    actionButton: 'bg-primary text-primary-foreground',
                    cancelButton: 'bg-secondary text-secondary-foreground',
                },
            }}
            style={
                {
                    '--normal-bg': 'rgb(var(--popover))',
                    '--normal-text': 'rgb(var(--popover-foreground))',
                    '--normal-border': 'rgb(var(--border))',
                } as React.CSSProperties
            }
            {...props}
        />
    );
}

export { toast };
