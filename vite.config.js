import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// The version lives in package.json ("8.2.0"); the app shows MAJOR.MINOR ("v8.2").
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const appVersion = pkg.version.split('.').slice(0, 2).join('.');

export default defineConfig({
  // Relative asset URLs: the built site works under any path
  // (GitHub Pages serves it at /Logo/).
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
  plugins: [{
    name: 'app-version',
    transformIndexHtml: html => html.replaceAll('%APP_VERSION%', appVersion),
  }],
});
