# Plan 002: `apps/mail-to-gcal` Phase 1b 実装方針

> [!WARNING]
> **アーカイブ済み。** `mail-to-gcal` は運用を止め、コードを `archive/mail-to-gcal/` へ移した。この文書は当時の記録として残している。AI エージェントは、ここに書かれた手順や未完了のタスクを実行しないこと。パスの `apps/mail-to-gcal` は、いまは `archive/mail-to-gcal` にある。

Related: [spec.md](./spec.md), [tasks.md](./tasks.md)

## アーキテクチャ変更点

### 債務 1: quarantine ラベル運用

- `CalendarIgnored` ラベルを `getLabelIds()` の返却に追加
- `swapLabels` を拡張し、`AddToCalendar` → `CalendarAdded` / `AddToCalendar` → `CalendarIgnored` を出し分け可能にするか、専用の `quarantineMessage(gmail, messageId, labelIds)` ヘルパーを切り出す
- `processEmail` で `parseEmail` が null/[] を返した時、`quarantineMessage` を呼ぶ経路を追加

### 債務 2: Calendar event 安定キー化

- `createCalendarEvent` の `requestBody.extendedProperties.private.messageId = event.messageId` を埋め込む
- `eventExists` を `events.list({ privateExtendedProperty: ['messageId=' + event.messageId], maxResults: 1 })` に変更
- 時刻窓 ±1 分と `q` 検索を削除

### 債務 3: bounded concurrency

- `apps/mail-to-gcal/package.json` に `p-limit` を追加
- `fetchEmails.ts` の `Promise.all` を `pLimit(5)` でラップ
- `MAX_MESSAGES_PER_RUN` を `config.ts` の Zod schema に追加（`z.coerce.number().int().min(1).default(10)`）
- `fetchUnprocessedEmails` の `maxResults` を config 値参照に

### 債務 4: testing API の分離

- `src/config.testing.ts` を新規作成し、`__resetConfigForTesting` を移動
- または `src/config.ts` 内で `@internal` JSDoc + 関数名に `__` prefix を付ける
- 呼び出し側（`config.test.ts`, `parser/index.test.ts`）を追従

### 債務 5: 構造化ログ

- `console.log` → `console.log('event', { key1: val1 })` 形式
- Pub/Sub payload の parse 結果は whitelist 型の object で渡す（`{ historyId: decoded.historyId }` のみ）

### 債務 6: TTL cache

- `config.ts` の `cached: Env | null` を `cached: { value: Env; expiresAt: number } | null` に変更
- TTL を 300 秒（5 分）に設定、`Date.now() > expiresAt` で再読込
- `oauth.ts` の `cachedAuth` も同様の TTL 化、または cfg 取得時に毎回 `setCredentials` を呼ぶ形にリファクタ

### GCP プロジェクト移行

- 新 `tony-stark-labs` プロジェクトを `gcloud projects create` で作成
- Billing account を手動 link（CEO 作業）
- 必要 API を `gcloud services enable` で一括 enable
- OAuth consent screen を新プロジェクトで作成（CEO 作業）
- OAuth client ID を作成、`scripts/getRefreshToken.ts` で refresh token 取得
- Secret Manager に移行後の値を JARVIS が `gcloud secrets versions add` で代行登録

### WIF 設定

- `gcloud iam workload-identity-pools create`
- `gcloud iam workload-identity-pools providers create-oidc` で GitHub 用 OIDC provider
- Service account `gha-deployer` に以下 role を付与:
  - `roles/cloudfunctions.developer`
  - `roles/iam.serviceAccountUser`
  - `roles/secretmanager.secretAccessor`
  - `roles/artifactregistry.writer`
  - `roles/logging.logWriter`
- `roles/iam.workloadIdentityUser` を WIF principal に付与

### GitHub Actions workflow

`.github/workflows/deploy-mail-to-gcal.yml`:

- trigger: `push` to `main` + `paths: ['apps/mail-to-gcal/**']`、`workflow_dispatch`
- `google-github-actions/auth@v2` で WIF 認証
- `working-directory: apps/mail-to-gcal` で `gcloud functions deploy processEmail` / `deploy renewWatch`
- GitHub Actions secrets: `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT`, `GCP_PROJECT_ID`, `GOOGLE_CALENDAR_ID`

## 移行戦略（ダウンタイム最小化）

1. **新プロジェクト作成**: `tony-stark-labs` を create、API enable、Billing link
2. **OAuth 新設**: 新 OAuth client 作成、新 refresh token 取得（CEO）
3. **Pub/Sub 新設**: 新 `gmail-notifications` topic 作成、Gmail API service account に publisher 権限付与
4. **Secret Manager 新設**: `oauth-credentials` / `anthropic-api-key` を新プロジェクトに作成（JARVIS が gcloud CLI で代行）
5. **WIF 設定**: pool / provider / service account 設定
6. **deploy workflow 追加**: `.github/workflows/deploy-mail-to-gcal.yml` を PR で追加
7. **新プロジェクトへ初回 deploy**: `workflow_dispatch` で processEmail / renewWatch を staging deploy
8. **債務 1〜6 を順次解消する PR を発行**: 各 PR は staging 環境で検証してからマージ
9. **Gmail watch 切り替え**: 新 topic に `register_watch`、旧 watch は `gmail.users.stop` で明示停止
10. **24h 並行稼働で動作確認**: 旧プロジェクトはログ専用で残し、実処理は新プロジェクトが担う
11. **旧 Cloud Functions 停止**: `wao-event-automation` の processEmail / renewWatch を `gcloud functions delete`（CEO 判断）
12. **旧プロジェクト退役**: 30 日 shutdown 期間を経て `gcloud projects delete`

## commit 分割戦略

| #   | type(scope): subject                                                         | 内容                                           |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | `chore(mail-to-gcal): create tony-stark-labs gcp project scripts`            | `gcloud projects create` 等の setup スクリプト |
| 2   | `ci(mail-to-gcal): add deploy workflow with workload identity`               | `.github/workflows/deploy-mail-to-gcal.yml`    |
| 3   | `feat(mail-to-gcal): quarantine unparseable emails to CalendarIgnored label` | 債務 1                                         |
| 4   | `refactor(mail-to-gcal): deduplicate calendar events via extendedProperties` | 債務 2                                         |
| 5   | `perf(mail-to-gcal): bound messages.get concurrency with p-limit`            | 債務 3                                         |
| 6   | `refactor(mail-to-gcal): move resetConfigForTesting to config.testing`       | 債務 4                                         |
| 7   | `refactor(mail-to-gcal): use structured logging for pub/sub payload`         | 債務 5                                         |
| 8   | `perf(mail-to-gcal): add TTL cache to config loader for secret rotation`     | 債務 6                                         |

各 commit は独立で staging deploy が可能な粒度。最終的に 1 PR にまとめて送る選択肢もあるが、債務ごとに PR 分離するのが推奨（レビュー粒度）。

## 検証戦略

- 各債務 PR は Vitest で unit test を追加
- staging deploy 後に Pub/Sub 擬似発火で E2E テスト
- Cloud Logging で 24h 間 429 エラー / 401 エラー / stack trace を監視
- 本番切り替え前に CEO の明示 GO を取る

## トレードオフ

- **Terraform 化**: 本 Phase では gcloud CLI 手動 + 手順書に留める。Phase 1c で Terraform 化を検討
- **Refrain 側への影響**: 他アプリは既存の個別 GCP プロジェクト / Cloudflare Workers のまま。統合は Phase 2 以降
- **旧プロジェクトの退役タイミング**: 30 日 shutdown 期間中は quota 消費が続くため、新プロジェクト作成可否に影響する可能性あり
