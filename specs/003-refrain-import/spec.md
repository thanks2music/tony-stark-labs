# Spec 003: `apps/refrain` monorepo 取り込み (Phase 2)

Related: [specs/001-mail-to-gcal-import/spec.md](../001-mail-to-gcal-import/spec.md), [plan.md](./plan.md), [tasks.md](./tasks.md)

## 目的

独立リポジトリ Refrain（Cloudflare Workers + R2 + Bun CLI のスクリーンショット・アップロードシステム）を tony-stark-labs monorepo の `apps/refrain/` として取り込み、Bun workspaces + Turborepo ツールチェーン下で `bun run --filter` 経由の lint / typecheck / test が可能な状態にする。

取り込み元は git remote すら持たない完全ローカルのリポジトリで、CI も存在しない。monorepo 側は `workspaces` の `"apps/refrain/*"`、`turbo.json` の `deploy.env`（`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`）、`eslint.config.js` の `**/.wrangler/**` ignores を既に先回りで用意しており、本 spec でそれらを実際に接続する。

## ユーザーストーリー

- CEO として、monorepo root から `bun run --filter refrain-worker test` / `--filter refrain-cli test` でテストが流せる
- CEO として、`apps/refrain/` を編集すると root の CI（`lint` / `format:check` / `typecheck` / `test`）が走る
- CEO として、**Public リポジトリに独自ドメインを載せずに** Refrain を運用できる
- JARVIS として、`specs/003-refrain-import/` を参照しながら取り込み作業を再現・検証できる

## 受け入れ条件

- `apps/refrain/` が subtree squash で取り込まれ、squash commit に履歴が圧縮されている
- `apps/refrain/{worker,cli}` が `refrain-worker` / `refrain-cli` として独立 workspace 認識されている（`apps/refrain` 自体は workspace ではない）
- `apps/refrain/` 配下に重複設定（`package.json` / `tsconfig.base.json` / `eslint.config.js` / `.prettierrc` / `.prettierignore` / `.gitignore` / `bun.lock`）が存在しない
- `apps/refrain/worker/wrangler.toml` が git 追跡されており、かつ `[[routes]]` を**含まない**
- リポジトリ全体を独自ドメイン文字列で grep してヒット 0 件（実装・設定・ドキュメントのいずれにも残っていない）
- CLI のエンドポイントが `REFRAIN_ENDPOINT` 環境変数 → `~/.config/refrain/config.json` → 対話プロンプトの優先順位で解決される
- root の vitest が v4 に統一され、mail-to-gcal / refrain-worker の両方のテストが通る
- `bun run lint && bun run format:check && bun run typecheck && bun run test` が 0 exit
- `bunx wrangler deploy --dry-run --config apps/refrain/worker/wrangler.toml` が成功する
- `bun run --filter refrain-cli build` が macOS バイナリを生成し、`--help` が出力される
- `.github/workflows/deploy-refrain.yml` が存在し、ルートを secret 由来で注入する

## 設計判断

| 論点                        | 決定                                          | 根拠                                                                                                          |
| --------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| subtree のソース            | ローカルパスを repository 引数に指定          | `git ls-remote <localpath>` が ref を返す。捨てるリポジトリを GitHub に作る必要がない                         |
| vitest のバージョン         | root で v4 に統一                             | `@cloudflare/vitest-pool-workers@0.14.7` の peer が `vitest: ^4.1.0`。v3 との同居は構造的に不可能             |
| `wrangler.toml`             | 追跡する。ただし `[[routes]]` は書かない      | `worker/vitest.config.ts` が `configPath: './wrangler.toml'` を参照するため CI に必須。ルートはテストに無関係 |
| カスタムルート              | `wrangler deploy --routes` でデプロイ時に注入 | `routes` は `workers_dev = true` なら省略可（`config-schema.json`）。ドメインをリポジトリに残さない           |
| `worker-configuration.d.ts` | 追跡継続 + `.gitignore` に否定パターン        | typecheck に必須。CI で `wrangler types` を走らせるとタスクグラフに生成段が増える                             |
| CLI エンドポイント          | `REFRAIN_ENDPOINT` 環境変数駆動               | ドメインをソースから排除できる。`config.json` による上書きは既存実装を流用                                    |

## スコープ外

- Cloudflare 側の実セットアップ作業（NS 委譲 / apex proxied A レコード / R2 バケット作成 / `UPLOAD_TOKEN` 投入）— `apps/refrain/README.md` の「運用セットアップ」節で管理する
- `apps/refrain/macos/` の追加（Swift / Tauri 等の技術選定は別 spec）
- `packages/` への共通化（現時点で refrain と mail-to-gcal に共有コードなし）
- 取り込み元 `gyazo-remake` リポジトリの archive（並行維持する方針）
- `apps/mail-to-gcal/package.json` の `deploy:process` に残る Google Calendar ID のハードコード（別途対応）

## 秘匿性についての注記

`[[routes]]` とドキュメントからドメインを外すのは「Public リポジトリに書かない」という運用上の配慮であり、**秘匿性は得られない**。Refrain が生成する画像 URL (`https://<domain>/apps/refrain/i/<hash>.png`) を外部に貼った時点でドメインは第三者に可視となる。アップロード経路を守るのは `UPLOAD_TOKEN`（32 バイトの Bearer トークン + `crypto.subtle.timingSafeEqual`）のみであり、その前提は本 spec で変わらない。
