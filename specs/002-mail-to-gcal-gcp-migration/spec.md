# Spec 002: `apps/mail-to-gcal` の新 GCP プロジェクト移行と運用債務返済 (Phase 1b)

> [!WARNING]
> **アーカイブ済みの当時の記録。** コードは `archive/mail-to-gcal/` へ移した（文中の `apps/mail-to-gcal` も同じ）。扱いは AGENTS.md の「アーカイブ」節に従い、ここに書かれた手順やタスクは実行しない。

Related: [specs/001-mail-to-gcal-import/spec.md](../001-mail-to-gcal-import/spec.md)

## 目的

Phase 1a で monorepo 取り込みを完了した `apps/mail-to-gcal` を、既存 GCP プロジェクト `wao-event-automation` から新規プロジェクト `tony-stark-labs` へ移行する。同時に Phase 1a から持ち越された運用債務（元リポジトリ時代からの既存仕様）を解消する。

## ユーザーストーリー

- CEO として、mail-to-gcal を含む個人ツールを単一 GCP プロジェクト `tony-stark-labs` 配下に集約し、GCP プロジェクト数上限を圧迫しない状態にする
- CEO として、GitHub Actions から Workload Identity Federation (WIF) 経由で安全に deploy できる
- オペレータ (CEO) として、本番稼働中 Cloud Functions のログノイズが軽減され、再試行不能データが quarantine される
- オペレータ (CEO) として、Secret Manager で API key / refresh token を rotate すると、warm instance でも 5 分以内に新値が反映される

## 受け入れ条件

- 新 GCP プロジェクト `tony-stark-labs` が作成され、必要 API が enable 済み（Cloud Functions, Cloud Build, Artifact Registry, Secret Manager, Pub/Sub, Gmail API, IAM Credentials）
- 新 OAuth client が作成され、新 refresh token が `scripts/getRefreshToken.ts` 経由で取得済み
- 新 Pub/Sub topic `gmail-notifications` が作成、Gmail API service account に publisher 権限付与済み
- Secret Manager に `oauth-credentials` / `anthropic-api-key` が新プロジェクトで作成、新値で設定済み
- Workload Identity Federation pool / provider / service account が設定され、GitHub Actions から assume 可能
- `.github/workflows/deploy-mail-to-gcal.yml` が追加され、`workflow_dispatch` で staging deploy 成功
- Gmail watch() の push topic が新 topic に切り替え済み、既存 `wao-event-automation` 側の watch は失効待ち or 明示停止済み
- 下記「債務返済項目」の完了条件を全て満たす（詳細は `tasks.md`）

## 債務返済項目の一覧

Phase 1a のコードレビュー（1 次 /simplify、Codex MCP 第三者レビュー、2 次 /simplify）で指摘された運用債務を本 Phase で解消する。各項目の詳細な完了条件は `tasks.md` に記載。

| #   | 債務                                                                      | 優先度 | 根拠                            |
| --- | ------------------------------------------------------------------------- | ------ | ------------------------------- |
| 1   | 未対応メールの恒久再処理問題（`parseEmail` null → `swapLabels` されない） | 高     | Codex 第三者レビュー            |
| 2   | `eventExists` の `q`-based fuzzy 判定（偽陽性／偽陰性リスク）             | 高     | Codex 第三者レビュー            |
| 3   | `Promise.all` 無制限並列（将来の quota 超過リスク）                       | 中     | 1 次 /simplify + Codex          |
| 4   | `resetConfigForTesting` の production export                              | 低     | 1 次 /simplify + 2 次 /simplify |
| 5   | Pub/Sub payload のログ sanitize                                           | 低     | Codex 第三者レビュー            |
| 6   | Secret Manager rotation 追従（TTL cache 化）                              | 中     | 2 次 /simplify                  |

## スコープ（GCP 移行関連）

### In scope

- 新 GCP プロジェクト作成と API enable（gcloud CLI スクリプト化）
- 新 OAuth client の手動作成（CEO が Google Cloud Console で実施、手順書を JARVIS が用意）
- 新 refresh token 取得手順（`scripts/getRefreshToken.ts` 更新 or OAuth Playground 手順）
- 新 Pub/Sub topic 作成と Gmail API publisher 権限付与
- Secret Manager への移行
- WIF pool / provider / service account 設定（gcloud CLI or Terraform で IaC 化検討）
- `.github/workflows/deploy-mail-to-gcal.yml` 新規作成
- Gmail watch の切り替え（新 topic への register_watch + 旧の停止）
- 旧 `wao-event-automation` プロジェクトの退役判断（CEO）
- 債務 1〜6 の解消

### Out of scope

- Phase 1c 以降で扱う Terraform 化（本 Phase は gcloud CLI 手動 + 手順書）
- Refrain / 他アプリの移行
- Gmail 以外の通知チャネル追加（Slack 等）

## 影響範囲

- `apps/mail-to-gcal/src/**` — 債務返済による大規模変更
- `apps/mail-to-gcal/scripts/getRefreshToken.ts` — 新 OAuth client 向け更新
- `apps/mail-to-gcal/package.json` — `p-limit` 追加
- `.github/workflows/deploy-mail-to-gcal.yml` — 新規作成
- 新 GCP プロジェクト `tony-stark-labs`（インフラ側、Terraform or gcloud CLI）
- GCP Secret Manager `oauth-credentials` / `anthropic-api-key`（新プロジェクト）
- GitHub Actions secrets: `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT`, `GCP_PROJECT_ID`, `GOOGLE_CALENDAR_ID`

## 前提条件

- Phase 1a の monorepo 取り込みが完了し、PR がマージ済み
- CEO が新 GCP プロジェクト作成と OAuth client 設定を実行可能
- GitHub Actions secrets 登録は CEO 権限

## リスクと緩和策

| リスク                                            | 緩和策                                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Gmail watch 切り替え中のメール取りこぼし          | 新旧 watch を一時的に並列で有効化し、双方の Pub/Sub topic を 1 つの function で受けるか、旧 function を 24h 残す        |
| 新 OAuth client の scope 不足                     | `scripts/getRefreshToken.ts` 実行時に scope 一覧を CEO が目視確認                                                       |
| WIF 設定不備で deploy 落ち                        | `workflow_dispatch` での最初の deploy 前に `gcloud iam workload-identity-pools describe` で設定健全性確認               |
| 債務 1（quarantine）導入でラベル運用変更          | 既存メールへの影響を spec 起票時に CEO 確認、必要なら既存 `AddToCalendar` 付きメールを一括 `CalendarIgnored` に migrate |
| 債務 2（extended property）で過去イベントと矛盾   | 過去イベントは再処理対象でないため backfill 不要、ただし既知 messageId の衝突検査を staging で実施                      |
| 債務 6（TTL cache）導入で cold start が若干増える | TTL チェックは `Date.now()` 比較のみで μs オーダー、影響は無視できる                                                    |
