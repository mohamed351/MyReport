// Builds angular-my-report-legacy with the Angular 13 toolchain in projects/angular-legacy/toolchain.
// Compiling with the oldest supported Angular is what lets every newer Angular (13–22) link the package.
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, root).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const project = p('projects/angular-legacy');
const toolchain = p('projects/angular-legacy/toolchain');

if (!existsSync(`${toolchain}/node_modules/ng-packagr`)) {
  console.log('Installing the Angular 13 toolchain (first build only)…');
  execSync('npm install --no-audit --no-fund', { stdio: 'inherit', cwd: toolchain });
}

execSync('node toolchain/node_modules/ng-packagr/cli/main.js -p ng-package.json -c tsconfig.lib.json', {
  stdio: 'inherit',
  cwd: project,
});
