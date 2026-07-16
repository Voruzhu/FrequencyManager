import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
// IBM Plex (Carbon typeface). Bundled by Vite → same-origin, so it satisfies the
// strict CSP (no remote/CDN font loads allowed).
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import { initThemeFromStorage } from './lib/theme';

// Apply the persisted theme before first paint to avoid a flash of the default.
initThemeFromStorage();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
