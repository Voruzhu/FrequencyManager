import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fg from 'fast-glob';

const configPath = path.resolve('src/renderer/tailwind.config.js');
const configDir = path.dirname(configPath).replace(/\\/g, '/');

console.log('cwd:', process.cwd());
console.log('configDir:', configDir);
console.log('platform:', process.platform, 'node:', process.version);

const patterns = [`${configDir}/index.html`, `${configDir}/src/**/*.{js,ts,jsx,tsx}`];
for (const p of patterns) {
    const matches = await fg(p, { onlyFiles: true });
    console.log(`pattern: ${p}\n  -> ${matches.length} matches` + (matches.length ? `, e.g. ${matches[0]}` : ''));
}
