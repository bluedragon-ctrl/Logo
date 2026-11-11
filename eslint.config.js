import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// The core — interpreter, turtle, formatter — runs without a browser (unit tests,
// future headless uses). It may not import the browser layers; side effects go
// through rctx.io (src/interpreter/io.ts). That it uses no browser APIs is checked
// by TypeScript: tsconfig.core.json compiles it without the DOM library.
const CORE = ['src/interpreter/**/*.ts', 'src/turtle/**/*.ts', 'src/format/**/*.ts'];

export default tseslint.config(
  { ignores: ['dist/', 'versions/', 'node_modules/'] },
  {
    files: ['src/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.browser },
    rules: {
      'no-undef': 'off', // TypeScript checks names
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-useless-escape': 'off', // the token regexes escape [ ] / - on purpose (and must mirror each other)
    },
  },
  {
    files: ['tests/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.node },
    rules: { 'no-undef': 'off' },
  },
  {
    files: CORE,
    rules: {
      'no-restricted-imports': ['error', { patterns: [{
        group: ['**/render/*', '**/ui/*', '**/editor/*', '**/app.ts', '**/main.ts', '**/examples.ts'],
        message: 'The interpreter core must not depend on the browser layers. Use rctx.io (interpreter/io.ts).',
      }] }],
    },
  },
  {
    files: ['tests/**/*.js', '*.config.js'],
    extends: [js.configs.recommended],
    // Browser globals too: page.evaluate() callbacks run in the page.
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
  },
);
