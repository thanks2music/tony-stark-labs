// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.wrangler/**',
      '**/dist/**',
      '**/worker-configuration.d.ts',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // bun:test's matcher types treat `.rejects.toThrow()` as synchronous (void)
    // and mock implementations are often `async () =>` without await by design.
    // Relax those two rules for test files only.
    files: ['**/test/**/*.ts'],
    rules: {
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
);
