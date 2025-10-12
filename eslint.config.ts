import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
import stylistic from '@stylistic/eslint-plugin';

export default defineConfig([
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  { files: ['**/*.{js,mjs,cjs,ts,mts,cts}'], plugins: { js, '@stylistic': stylistic }, extends: ['js/recommended'], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  tseslint.configs.recommended,
  stylistic.configs['recommended'],
  {
    rules: {
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/brace-style': ['error', '1tbs'],
    },
  },
]);
