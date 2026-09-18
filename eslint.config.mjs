import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**', 'tmp/**', '**/.terraform/**'] },
  { files: ['**/*.{js,mjs}'], ...js.configs.recommended,
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }] } },
  { files: ['frontend/**/*.{ts,tsx}'], languageOptions: { parser: tseslint.parser, globals: globals.browser },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: { 'no-debugger': 'error', 'no-duplicate-imports': ['error', { allowSeparateTypeImports: true }], '@typescript-eslint/no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }] } }
];
