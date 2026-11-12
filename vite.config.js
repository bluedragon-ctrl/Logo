import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// The version lives in package.json ("8.16.0"); the app shows all three parts ("v8.16.0").
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const appVersion = pkg.version;

export default defineConfig({
  // Relative asset URLs: the built site works under any path
  // (GitHub Pages serves it at /Logo/).
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  // Vitest: unit tests of the interpreter core, in Node (no browser).
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
  plugins: [{
    name: 'app-version',
    transformIndexHtml: html => html.replaceAll('%APP_VERSION%', appVersion),
  }],
});
