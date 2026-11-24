# Plan 003: `apps/refrain` 取り込み実装方針

> [!NOTE]
> この spec のあと、Workers のテストは `@cloudflare/vitest-plugin`（旧 `@cloudflare/vitest-pool-workers`）に移り、Vitest は `refrain-worker` に宣言するようになった。今の構成は AGENTS.md を参照。

> [!NOTE]
> この取り込みのあと、`mail-to-gcal` は運用を止めて `archive/` へ移した。文中で mail-to-gcal を現役の workspace として扱っている箇所は、当時の状態の記録。

Related: [spec.md](./spec.md), [tasks.md](./tasks.md)

## 取り込み元の現状（調査で確定した事実）

- git remote 未設定・タグなし・CI なしの完全ローカルリポジトリ。追跡ファイルは 30 件
- 内部が既に Bun workspaces（`worker/` と `cli/`）だが、workspace 名が `worker` / `cli` という汎用名
- `worker/wrangler.toml` は**取り込み元で gitignore 対象**（`.sample` のみ追跡）。したがって subtree では来ない
- `tsconfig.base.json` と `.prettierrc` は monorepo 側と `diff` で完全一致
- root prettier 設定に違反するのは `README.md` のみ（`CLAUDE.md` / `TODO.md` は pass）
- `cli/test/capture.test.ts` は `screencapture` / `sips` を実行せず出力パースのみ → ubuntu CI で通る
- `DEFAULT_ENDPOINT` を参照するテストは存在しない

## アーキテクチャ変更点

### 1. ドメインのリポジトリ外出し

Public リポジトリに独自ドメインを残さないため、ドメインが出現しうる 3 箇所すべてを処理する。

| 箇所                      | 処理                                                          |
| ------------------------- | ------------------------------------------------------------- |
| `worker/wrangler.toml`    | `[[routes]]` を書かない。デプロイ時に `--routes` で注入       |
| `cli/src/config.ts`       | `DEFAULT_ENDPOINT` を廃止し `REFRAIN_ENDPOINT` 環境変数駆動に |
| `README.md` / `CLAUDE.md` | `{DOMAIN}` プレースホルダのまま維持（実値に置換しない）       |

`routes` が省略可能であることは `wrangler/config-schema.json` で確認済み:

> A list of routes that your Worker should be published to. Only one of `routes` or `route` is required. **Only required when workers_dev is false**, and there's no scheduled Worker

`wrangler deploy --help` に `--routes, --route  Routes to upload [array]` が存在するため、デプロイ時注入が成立する。

GitHub Actions では **`vars` ではなく `secrets`** を使う。Repository variables はワークフローログに平文で出力されるが、secrets は自動マスクされるため。

### 2. CLI エンドポイント解決の優先順位

```
REFRAIN_ENDPOINT 環境変数
  → ~/.config/refrain/config.json の endpoint
    → 対話プロンプト（デフォルト値は提示しない）
```

`cli/src/index.ts` の `{DOMAIN}` 残存ガード（コミット `1a44b07`）は**維持する**。旧 `config.json` を持つ環境での早期失敗として機能するため。

### 3. vitest の v4 統一

`@cloudflare/vitest-pool-workers@0.14.7` の peerDependencies は `vitest: ^4.1.0` であり、root の v3 と同居できない。root を v4 へ上げ、worker 側の `vitest` devDep は削除して root に集約する。

mail-to-gcal 側が使う vitest API は `vi.mock` / `vi.hoisted` / `vi.fn` / `vi.clearAllMocks` のみで、v4 で削除された 3 引数 `test(name, fn, {...})` シグネチャは不使用のため移行リスクは低い。v4 で `clearMocks` の既定値が変わるが、`beforeEach` で `vi.clearAllMocks()` を明示呼び出ししているため影響しない。

万一失敗した場合の対処は `@cloudflare/vitest-pool-workers` 同梱の `dist/codemods/vitest-v3-to-v4.mjs`。

### 4. devDependencies の配置方針

「devDeps は root に昇格」規約に従いつつ、アプリ固有のものは workspace ローカルに残す。

| パッケージ                                                                | 配置             | 理由                                 |
| ------------------------------------------------------------------------- | ---------------- | ------------------------------------ |
| `vitest`                                                                  | root             | mail-to-gcal と共用                  |
| `@cloudflare/vitest-pool-workers`                                         | `refrain-worker` | Workers ランタイム専用               |
| `wrangler`                                                                | `refrain-worker` | Cloudflare 専用                      |
| `@types/bun`                                                              | `refrain-cli`    | Bun 専用のグローバル型               |
| `eslint` / `prettier` / `typescript` / `typescript-eslint` / `@eslint/js` | root（既存）     | 取り込み元から削除して root に一本化 |

## モジュール別変更一覧

| ファイル                                   | 変更種別 | 変更内容                                                             |
| ------------------------------------------ | -------- | -------------------------------------------------------------------- |
| `apps/refrain/package.json`                | 削除     | `apps/refrain` 自体が workspace 登録されるのを防ぐ                   |
| `apps/refrain/tsconfig.base.json`          | 削除     | root と完全一致                                                      |
| `apps/refrain/eslint.config.js`            | 削除     | root の単一 flat config に一本化                                     |
| `apps/refrain/.prettierrc`                 | 削除     | root と完全一致                                                      |
| `apps/refrain/.prettierignore`             | 削除     | root は `*.md` を整形対象にする方針                                  |
| `apps/refrain/.gitignore`                  | 削除     | `worker/wrangler.toml` の無視行を含むため追跡化の障害になる          |
| `apps/refrain/bun.lock`                    | 削除     | root の lockfile に統合                                              |
| `apps/refrain/worker/package.json`         | 書き換え | name を `refrain-worker` に、`vitest` 削除、`cf-typegen` script 追加 |
| `apps/refrain/cli/package.json`            | 書き換え | name を `refrain-cli` に（`bin.refrain` は据え置き）                 |
| `apps/refrain/{worker,cli}/tsconfig.json`  | 書き換え | extends を `../../../tsconfig.base.json` に                          |
| `apps/refrain/worker/wrangler.toml`        | 新規     | `[[routes]]` を含まない形で追跡化                                    |
| `apps/refrain/worker/wrangler.toml.sample` | 削除     | 本体を追跡した時点で二重管理になる                                   |
| `apps/refrain/cli/src/config.ts`           | 書き換え | `DEFAULT_ENDPOINT` 廃止、`resolveEndpoint()` 導入                    |
| `apps/refrain/cli/src/index.ts`            | 書き換え | `resolveEndpoint()` 経由に。`{DOMAIN}` ガードは維持                  |
| `apps/refrain/cli/test/config.test.ts`     | 書き換え | エンドポイント解決の優先順位テストを追加                             |
| `apps/refrain/README.md`                   | 書き換え | monorepo レイアウト対応 + `TODO.md` を統合                           |
| `apps/refrain/TODO.md`                     | 削除     | README に統合                                                        |
| `apps/refrain/CLAUDE.md`                   | 書き換え | 実態と乖離した記述を修正、global ルールの重複を削除                  |

### root 側

| ファイル                               | 変更種別 | 変更内容                                                   |
| -------------------------------------- | -------- | ---------------------------------------------------------- |
| `package.json`                         | 書き換え | `vitest` を `^4.1.1` へ                                    |
| `.gitignore`                           | 書き換え | `!apps/refrain/worker/worker-configuration.d.ts` を追加    |
| `README.md`                            | 書き換え | アプリ一覧の refrain を「取り込み済み」に、vitest 版を反映 |
| `CLAUDE.md`                            | 書き換え | wrangler ルート方針・型定義追跡・vitest v4 の制約を記録    |
| `.github/workflows/deploy-refrain.yml` | 新規     | secret 由来のルート注入付き deploy                         |
| `eslint.config.js`                     | 条件付き | lint エラーが出た場合のみ refrain 用ブロックを追加         |

## トレードオフと選択根拠

### `wrangler.toml` を追跡する（`.sample` 方式を捨てる）

取り込み元は本体を gitignore し `.sample` のみ追跡していたが、これは `worker/vitest.config.ts` が `configPath: './wrangler.toml'` を参照する構造と矛盾しており、**クローン直後はテストが動かない**状態だった。本体を追跡すれば矛盾が解消し、`.sample` を維持する理由（本体が無いこと）も消える。二重管理による乖離を避けるため `.sample` は削除する。

機密は含まない（worker 名 / R2 バケット名 / `compatibility_date` のみ）。`UPLOAD_TOKEN` は `wrangler secret put` とローカルの `.dev.vars`（gitignore 済み）経由で、設定ファイルには載らない。

### `worker-configuration.d.ts` を追跡継続する

13,026 行の生成物だが typecheck に必須。CI で `wrangler types` を走らせる案は、turbo のタスクグラフに「生成 → typecheck」の段が増え、クリーンクローンでも生成が必須になるため採らない。`.prettierignore` と `eslint.config.js` の ignores で既に除外済みのため差分ノイズは `compatibility_date` 更新時のみ。

root `.gitignore` が同名を無視対象にしているので、意図的な追跡であることを否定パターンとコメントで明示する。これが無いと将来 `git rm --cached` された際に再追加できなくなる。

### workspace 名を改名する

`worker` / `cli` は一意性がなく、将来 `apps/foo/cli` を足した時点で `bun install` が名前衝突で失敗する。かつ root `README.md` が既に `bun run --filter refrain-worker dev` と記載しており、命名は規約として決定済み。ドキュメントを実装に合わせるのではなく、実装をドキュメントに合わせる。

### turbo タスクは `turbo.json` を変更せず接続する

`refrain-worker` の `dev` / `deploy` / `typecheck` / `test`、`refrain-cli` の `dev` / `typecheck` / `test` / `build` はすべて既存 turbo task 名と一致している。`deploy.env` には `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` が宣言済み。

`test` の `dependsOn: ["^build"]` の `^` は**依存 workspace の** build を指すため、他 workspace に依存しない `refrain-cli` では `bun build --compile` が誘発されない。ただし `turbo run build` を root で叩くと macOS 専用バイナリのクロスコンパイルが走るため、将来 CI に `build` を追加する際は `--filter=!refrain-cli` が必要。
