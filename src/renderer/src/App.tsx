import { AppShell } from './components/shell/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
    return (
        <ErrorBoundary label="FrequencyManager ran into a problem">
            <AppShell />
        </ErrorBoundary>
    );
}
