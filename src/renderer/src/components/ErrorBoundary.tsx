import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui';

interface Props {
    children: ReactNode;
    /** Shown as the heading on the fallback screen — keep it short. */
    label?: string;
}
interface State {
    error: Error | null;
}

/**
 * Catches render-time exceptions in its subtree instead of letting them
 * blank the ENTIRE app — no error boundary existed anywhere before this, so
 * any uncaught render exception (a dangling gear/character reference, a
 * malformed imported record, a bug in a rarely-hit component) took down the
 * whole UI with no recovery except restarting. Placed around the main
 * Workspace and Inspector panels separately (see `AppShell.tsx`) so a crash
 * in one is contained instead of also taking out navigation/the other
 * panel, plus one top-level instance in `App.tsx` as a last-resort net.
 */
export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        // eslint-disable-next-line no-console
        console.error('[ErrorBoundary]', this.props.label ?? '(unlabeled)', error, info.componentStack);
    }

    private reset = () => this.setState({ error: null });

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        return (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 p-6 text-center">
                <AlertTriangle className="h-8 w-8 flex-shrink-0 text-destructive" />
                <div>
                    <p className="font-medium text-foreground">{this.props.label ?? 'Something went wrong'}</p>
                    <p className="mt-1 max-w-md text-sm text-muted-foreground">{error.message}</p>
                </div>
                <Button variant="secondary" onClick={this.reset}>Try again</Button>
            </div>
        );
    }
}
