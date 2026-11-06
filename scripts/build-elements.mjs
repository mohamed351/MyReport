// Builds elements-my-report: compiles the Angular Elements app, then bundles polyfills + main into one
// self-registering script (dist/elements/myreport-elements.js) that works with <script src> and bundlers.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const root = new URL('..', import.meta.url);
const p = (rel) => new URL(rel, root).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const tmp = p('dist/.elements-build');
const out = p('dist/elements');

execSync('npx ng build elements --configuration production', { stdio: 'inherit', cwd: p('.') });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const entry = `${tmp}/entry.js`;
writeFileSync(entry, `import './browser/polyfills.js';\nimport './browser/main.js';\n`);
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'iife',
  minify: true,
  // ES2017 (no native class fields): older app build tools (Angular 13–16's Babel, old webpack and terser)
  // re-process node_modules and mishandle ES2022 classes.
  target: 'es2017',
  legalComments: 'none',
  // UMD dependencies (qrcode-generator) check `typeof define`. Hide AMD so they never call the host
  // page's define(): webpack-based apps (Angular 13–16 CLI) and RequireJS pages would hijack them.
  define: { define: 'undefined' },
  outfile: `${out}/myreport-elements.js`,
});

for (const f of ['package.json', 'index.d.ts', 'README.md']) {
  const src = p(`projects/elements/${f}`);
  if (existsSync(src)) copyFileSync(src, `${out}/${f}`);
}
rmSync(tmp, { recursive: true, force: true });
console.log(`elements-my-report → dist/elements (${(statSync(`${out}/myreport-elements.js`).size / 1024).toFixed(0)} kB)`);
