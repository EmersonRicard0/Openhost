import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const privilegedModules = ['electron', 'node:*', 'ssh2', 'node-pty', 'libsodium-wrappers-sumo'];

export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'out/',
      'dist/',
      'build/',
      'coverage/',
      'test-results/',
      'playwright-report/',
      '.specify/',
      '.claude/',
      'tests/fixtures/keys/generated/',
      'frontend/',
      '**/*.min.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Interface e código compartilhado não podem tocar em APIs privilegiadas (Princípio II).
    files: ['frontend/src/**/*.{ts,tsx}', 'frontend/src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: privilegedModules.map((group) => ({
            group: [group],
            message: 'Interface e shared não acessam Node/Electron; use window.shellvault.',
          })),
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs}', 'scripts/**', 'tests/**'],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/*.{js,mjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
);
