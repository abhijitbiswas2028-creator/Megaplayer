import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Apply this preference only to the Antigravity session launched here.
// Explicitly requested by the project owner; no global agent settings change.
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const child = spawn('agy', [
  '--mode', 'auto',
  '--dangerously-skip-permissions',
  ...process.argv.slice(2),
], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: false,
});

child.on('error', (error) => {
  console.error(error.code === 'ENOENT'
    ? 'Antigravity CLI (agy) was not found. Install it and add it to PATH, then retry.'
    : `Could not start Antigravity: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
});
