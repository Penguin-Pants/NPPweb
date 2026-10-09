// Builds the frontend once before the E2E run. Runs the build script with the
// current Node binary, because spawning npm fails on Windows (npm is a .cmd file).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export default function globalSetup() {
  const script = fileURLToPath(new URL('../scripts/build-web.js', import.meta.url));
  execFileSync(process.execPath, [script], { stdio: 'inherit' });
}
