# Plan 001: `apps/mail-to-gcal` 取り込み実装方針

## アーキテクチャ変更点

### 環境変数アクセスの一元化

既存の環境変数参照を `src/config.ts` の `loadConfig()` 経由に集約する。Zod schema で型と required/optional を検証し、default 値をコード中から排除する。テスト時は `resetConfigForTesting()` で cache をリセットする。

```ts
import { z } from 'zod';

const EnvSchema = z.object({
  GCP_PROJECT_ID: z.string().min(1).default('wao-event-automation'),
  PUBSUB_TOPIC: z.string().min(1).default('gmail-notifications'),
  GOOGLE_CALENDAR_ID: z.string().min(1).default('primary'),
  OAUTH_CREDENTIALS: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});
```

### Module resolution の override

root `tsconfig.base.json` は `module: es2022 + moduleResolution: bundler`。GCF 本番の Node 22 は実際のファイルシステムから `.js` を解釈するため、`apps/mail-to-gcal/tsconfig.json` で `module: nodenext + moduleResolution: nodenext` に override する。既存コードは `.js` 拡張子明示 import を徹底しており `nodenext` と整合的。

## モジュール別変更一覧

| ファイル                      | 変更種別 | 変更内容                                                                            |
| ----------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `src/config.ts`               | 新規     | Zod EnvSchema + `loadConfig()` + `resetConfigForTesting()`                          |
| `src/config.test.ts`          | 新規     | `loadConfig` の default / required / override 検証                                  |
| `src/gmail/watchManager.ts`   | 書き換え | `const DEFAULT_PROJECT_ID` / `const TOPIC_NAME` 削除、`loadConfig()` 経由に         |
| `src/calendar/createEvent.ts` | 書き換え | `process.env.GOOGLE_CALENDAR_ID \|\| "primary"` → `loadConfig().GOOGLE_CALENDAR_ID` |
| `src/auth/oauth.ts`           | 書き換え | `process.env.OAUTH_CREDENTIALS` → `loadConfig().OAUTH_CREDENTIALS`                  |
| `src/parser/index.ts`         | 書き換え | `ANTHROPIC_API_KEY` 参照を `loadConfig()` 経由に、遅延呼び出しでテスト互換性維持    |
| `src/parser/aiParser.ts`      | 書き換え | `new Anthropic({ apiKey: loadConfig().ANTHROPIC_API_KEY })`                         |
| `src/parser/index.test.ts`    | 書き換え | `beforeEach(resetConfigForTesting)` 追加                                            |
| `tsconfig.json`               | 書き換え | root base extends + nodenext override                                               |
| `package.json`                | 書き換え | devDependencies 削除、`private: true`、`lint` / `typecheck` scripts 追加            |
| `.env.example`                | 書き換え | 全環境変数を非機密デフォルト付きで列挙                                              |
| `bun.lock`                    | 削除     | root の lockfile に統合                                                             |

### root 側

| ファイル           | 変更                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `package.json`     | `@types/node ^22.0.0` / `vitest ^3.0.0` を devDependencies に追加（typescript は root 既存 `^6.0.3` を採用） |
| `eslint.config.js` | `apps/mail-to-gcal/**` 向け `no-console: off` と `aiParser.ts` 向け `no-explicit-any: warn` override         |

## tsconfig 戦略

- **base 継承**: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `target: es2022` は継承
- **override**: `module: nodenext`, `moduleResolution: nodenext`, `noEmit: false`, `outDir: dist`, `rootDir: src`, `declaration: true`, `declarationMap: true`, `sourceMap: true`, `types: ["node"]`
- **期待される typecheck エラー**:
  - `verbatimModuleSyntax` 起因: 型のみ import が通常 import になっている箇所
  - `noUncheckedIndexedAccess` 起因: `response.content[0].type` などの配列アクセス
  - `exactOptionalPropertyTypes` 起因: optional フィールドへの `undefined` 明示代入
- **対応方針**: 一括で fix commit にまとめ、意味的変更はしない（fallback を追加するなど）

## commit 分割戦略（実施記録）

実装中に想定外の事象（bun isolated linker での cloudevents phantom dep、strict ESLint の unsafe 系 error、OAUTH_CREDENTIALS を loadConfig の required にするとテスト実行性が下がる問題）が複数判明し、commit を細かく分ける方針に変更した。最終的に 14 本（squash subtree の副産物 commit を含めると 15 本）の commit を 1 PR に束ねる。

| #   | type(scope): subject                                                              | 目的                       |
| --- | --------------------------------------------------------------------------------- | -------------------------- |
| 1   | `feat(mail-to-gcal): import from standalone repo via squash subtree`              | subtree 取り込み           |
| 2   | `chore(mail-to-gcal): drop standalone bun.lock`                                   | lockfile 削除              |
| 3   | `chore(root): hoist typescript vitest @types/node to root devDependencies`        | devDeps 昇格               |
| 4   | `chore(mail-to-gcal): extend root tsconfig.base with nodenext override`           | tsconfig                   |
| 5   | `chore(mail-to-gcal): add explicit cloudevents dependency for isolated linker`    | cloudevents 直接 dep       |
| 6   | `chore(root): add eslint override for mail-to-gcal`                               | lint 緩和                  |
| 7   | `fix(mail-to-gcal): satisfy strict index access and exclude tests from typecheck` | typecheck fix phase 1      |
| 8   | `fix(mail-to-gcal): add non-null assertions and restore test typecheck coverage`  | typecheck fix phase 2      |
| 9   | `fix(mail-to-gcal): type JSON.parse results to satisfy strict eslint`             | unsafe-assignment fix      |
| 10  | `test(mail-to-gcal): add failing config loader tests`                             | Red                        |
| 11  | `feat(mail-to-gcal): add zod-backed env config loader`                            | Green                      |
| 12  | `refactor(mail-to-gcal): route env access through config loader`                  | Refactor                   |
| 13  | `chore(mail-to-gcal): update package scripts and env example for monorepo`        | pkg scripts / .env.example |
| 14  | `docs(mail-to-gcal): add spec plan tasks for import phase`                        | SDD ドキュメント           |

全 subject は lowercase で開始、`Co-Authored-By` 署名なし。PR 作成は CEO が実行。

## リスクと緩和策

| リスク                                                                    | 緩和策                                                                      |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 漏洩鍵のローテ未完了のまま取り込みを進める                                | Phase 1a の prerequisite として鍵ローテ完了を定義。DoD チェックリストで明示 |
| `verbatimModuleSyntax` / `noUncheckedIndexedAccess` で typecheck が落ちる | Step 7 の fix commit で一括対応、意味的変更なし                             |
| `parser/index.test.ts` の `process.env` 直接操作が config cache と衝突    | `beforeEach(resetConfigForTesting)` で対応                                  |
| subtree add 実行時の `--squash` 忘れ                                      | コマンド例をそのまま貼り付けて実行、履歴確認で 1 commit 化を確認            |
| 既存 `wao-event-automation` 本番への影響                                  | Phase 1a では `gcloud functions deploy` を一切実行しない                    |
