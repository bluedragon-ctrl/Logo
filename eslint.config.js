import js from '@eslint/js';
import globals from 'globals';

const RULES = {
  'no-undef': 'error',
  'no-import-assign': 'error',
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-unreachable': 'error',
};

// The core — interpreter, turtle, formatter — runs without a browser (unit tests,
// future headless uses). It sees no browser globals, so `document`, `window`,
// `requestAnimationFrame` are "undefined" there, and it may not import the
// browser layers. Side effects go through rctx.io (src/interpreter/io.js).
const CORE = ['src/interpreter/**/*.js', 'src/turtle/**/*.js', 'src/format/**/*.js'];

export default [
  { ignores: ['dist/', 'versions/', 'node_modules/'] },
  {
    files: ['src/**/*.js'],
    ignores: CORE,
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.browser },
    rules: RULES,
  },
  {
    files: CORE,
    languageOptions: {
      ecmaVersion: 2022, sourceType: 'module',
      globals: { setTimeout: 'readonly', clearTimeout: 'readonly' },
    },
    rules: {
      ...RULES,
      'no-restricted-imports': ['error', { patterns: [{
        group: ['**/render/*', '**/ui/*', '**/editor/*', '**/app.js', '**/main.js', '**/examples.js'],
        message: 'The interpreter core must not depend on the browser layers. Use rctx.io (interpreter/io.js).',
      }] }],
    },
  },
  {
    files: ['tests/**/*.js', '*.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.node },
  },
];
