# Spec 001: `apps/mail-to-gcal` monorepo 取り込み (Phase 1a)

> [!WARNING]
> **アーカイブ済みの当時の記録。** コードは `archive/mail-to-gcal/` へ移した（文中の `apps/mail-to-gcal` も同じ）。扱いは AGENTS.md の「アーカイブ」節に従い、ここに書かれた手順やタスクは実行しない。

Next phase: [specs/002-mail-to-gcal-gcp-migration/spec.md](../002-mail-to-gcal-gcp-migration/spec.md)

## 目的

独立リポジトリ `mail-to-google-calendar`（Gmail → Google Calendar 自動登録、GCF 2nd gen, Node.js 22）を tony-stark-labs monorepo の `apps/mail-to-gcal/` として取り込み、Bun workspaces + Turborepo ツールチェーン下で `bun run --filter` 経由の lint / typecheck / test が可能な状態にする。既存本番 (`wao-event-automation` プロジェクト) には一切触らない。

## ユーザーストーリー

- CEO として、monorepo root から `bun run --filter mail-to-gcal test` でテストが流せる
- CEO として、`apps/mail-to-gcal/` を編集すると root の CI (`bun run lint typecheck test`) が走る
- JARVIS として、`specs/001-mail-to-gcal-import/` を参照しながら取り込み作業を再現・検証できる

## 受け入れ条件

- `apps/mail-to-gcal/` が subtree squash で取り込まれ、squash commit 1 本に履歴が圧縮されている
- `apps/mail-to-gcal/` 配下に `.env` / `.envrc` / `credentials.json` / `token.json` / 個別 `bun.lock` が存在しない
- `src/config.ts` が Zod 検証で全環境変数（`OAUTH_CREDENTIALS`, `GCP_PROJECT_ID`, `PUBSUB_TOPIC`, `GOOGLE_CALENDAR_ID`, `ANTHROPIC_API_KEY`）を一元化
- 既存の `process.env` / const ハードコードが `loadConfig()` 経由に refactor 済み
- `bun run --filter mail-to-gcal lint / typecheck / test` が 0 exit
- `bun run --filter mail-to-gcal build` が `dist/functions/index.js` を生成

## スコープ外 (Phase 1b 以降)

- 新規 GCP プロジェクト `tony-stark-labs` の作成、API enable、Billing link
- 新 OAuth client 作成、新 refresh token 取得
- Workload Identity Federation 設定
- Secret Manager の新規 secret 作成
- `.github/workflows/deploy-mail-to-gcal.yml` の追加
- Gmail watch の新 topic 切り替え
- 既存 `wao-event-automation` プロジェクトの退役
- 既存 GCP プロジェクトの整理 (`gen-lang-client-0736014835` などの shutdown)
- Terraform 導入

## 影響範囲

- `apps/mail-to-gcal/**`（新規取り込み + 書き換え）
- ルート `package.json`（devDependencies 昇格）
- `eslint.config.js`（override 追加）
- `bun.lock`（再生成）
- 独立リポジトリ `mail-to-google-calendar`（本 Phase では無変更。Phase 1b で移行後に archive 検討）

## 前提条件

- 取り込み元リポジトリの `.env` / `.envrc` / `credentials.json` / `token.json` が **一度も git tracked されていない**（調査済み: `git log --all --full-history` で該当ファイルの履歴は空）
- このため鍵ローテは Phase 1a の必須事項ではない（Phase 1b で新 GCP プロジェクトに移行する際に新 OAuth client / API key を発行する）
