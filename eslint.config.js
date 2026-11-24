// @ts-check
// ESLint は型情報を使うルールだけを担当する。それ以外の lint と format は Biome（biome.json）。
// 分担の理由は docs/adr/0001-biome-with-type-aware-eslint.md。
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // 各 workspace は `eslint src test` を実行する。生成物と、lint-staged に渡りうるアーカイブだけ除外する
    ignores: ['**/worker-configuration.d.ts', 'archive/**'],
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommendedTypeCheckedOnly],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // bun:test の型では `expect(...).rejects.toThrow()` が Promise を返さない（void）ため、
    // `await` を付けると await-thenable が誤検知する。
    files: ['apps/refrain/cli/test/**/*.ts'],
    rules: {
      '@typescript-eslint/await-thenable': 'off',
    },
  },
);
