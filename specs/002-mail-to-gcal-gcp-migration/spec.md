# Spec 002: `apps/mail-to-gcal` の新 GCP プロジェクト移行と運用債務返済 (Phase 1b)

## 目的

Phase 1a で monorepo 取り込みを完了した `apps/mail-to-gcal` を、既存 GCP プロジェクト `wao-event-automation` から新規プロジェクト `tony-stark-labs` へ移行する。同時に Phase 1a から持ち越された運用債務（元リポジトリ時代からの既存仕様）を解消する。

## ユーザーストーリー

- CEO として、mail-to-gcal を含む個人ツールを単一 GCP プロジェクト `tony-stark-labs` 配下に集約し、GCP プロジェクト数上限を圧迫しない状態にする
- CEO として、GitHub Actions から Workload Identity Federation (WIF) 経由で安全に deploy できる
- オペレータ (CEO) として、本番稼働中 Cloud Functions のログノイズが軽減され、再試行不能データが quarantine される

## 受け入れ条件

- 新 GCP プロジェクト `tony-stark-labs` が作成され、必要 API が enable 済み（Cloud Functions, Cloud Build, Artifact Registry, Secret Manager, Pub/Sub, Gmail API, IAM Credentials）
- 新 OAuth client が作成され、新 refresh token が scripts/getRefreshToken.ts 経由で取得済み
- 新 Pub/Sub topic `gmail-notifications` が作成、Gmail API service account に publisher 権限付与済み
- Secret Manager に `oauth-credentials` / `anthropic-api-key` が新プロジェクトで作成、新値で設定済み
- Workload Identity Federation pool / provider / service account が設定され、GitHub Actions から assume 可能
- `.github/workflows/deploy-mail-to-gcal.yml` が追加され、`workflow_dispatch` で staging deploy 成功
- Gmail watch() の push topic が新 topic に切り替え済み、既存 `wao-event-automation` 側の watch は失効待ち or 明示停止済み
- 下記「債務返済項目」の完了条件を全て満たす

## 債務返済項目（Phase 1a から持ち越し）

Phase 1a のコードレビュー（Codex 第三者レビュー 2026-04-24 分）で高・中優先度として指摘された既存仕様バグを本 Phase で修正する。

### 債務 1: 未対応メールの恒久再処理問題（優先度: 高）

**現状の問題**: `src/functions/processEmail.ts` で `parseEmail` が `null` または `[]` を返した際に `continue` するだけで `swapLabels` されず、`AddToCalendar` ラベルが残留する。結果、次回 Pub/Sub 通知ごとに同じ未対応メールを再走査し続け、運用コスト増・ログノイズ化・実質的な poison data 化を招く。

**完了条件**:

- [ ] 「恒久スキップ対象」を識別するラベル（例: `CalendarIgnored`）を Gmail API で管理
- [ ] `processEmail` で `parseEmail` が null/[] を返した場合、`AddToCalendar` を除去し `CalendarIgnored` を付与する運用経路を実装
- [ ] 既存ラベルの migration 手順（既に `AddToCalendar` が付いたままの過去メール）を documented
- [ ] Vitest で `CalendarIgnored` 付与パスの単体テストが追加
- [ ] staging 環境で未対応送信元メールを投入し、同じメールが再処理されないことを 2 回の invocation で確認

**判定者**: CEO。`gcloud functions logs read processEmail --limit 50` で同一 messageId のエントリが 1 回のみ出ることを確認。

### 債務 2: `eventExists` の `q`-based fuzzy 判定（優先度: 高）

**現状の問題**: `src/calendar/createEvent.ts` の `eventExists` は Google Calendar API の `events.list` を `q` (フリーテキスト検索) + 時刻窓 ±1 分 + `maxResults: 1` で使い重複判定している。`q` は厳密一致でなく、同名イベントや unrelated hit で偽陽性／偽陰性を誘発する。

**完了条件**:

- [ ] `createCalendarEvent` の書き込み時に `extendedProperties.private.messageId = <gmail message id>` を埋め込む
- [ ] `eventExists` を `events.list` の `privateExtendedProperty=messageId=<id>` による安定キー検索に差し替える（`q` と時刻窓による fuzzy 判定を削除）
- [ ] 既存 Calendar に登録済みのイベント（extended property なし）の backfill は不要と判断（過去分は再処理対象でないため）
- [ ] Vitest で mock を使って private extended property の write/read 経路をテスト
- [ ] staging で同一 messageId のメールを 2 回流し、重複イベントが作成されないことを確認

**判定者**: CEO。Google Calendar の該当イベントから messageId プロパティが読めることを API or UI で確認。

### 債務 3: `Promise.all` 無制限並列（優先度: 中）

**現状の問題**: `src/gmail/fetchEmails.ts` で `fetchUnprocessedEmails` の `messages.get` を `Promise.all` で無制限並列に発行している。`fetchUnprocessedEmails` の `maxResults: 10` を運用で増やした際に、Gmail API per-user quota (250 units/sec) に抵触する burst が発生しうる。

**完了条件**:

- [ ] `MAX_MESSAGES_PER_RUN` を環境変数で設定可能にし、`config.ts` に追加
- [ ] `p-limit` パッケージを使って `messages.get` を最大 5 並列に制限
- [ ] Vitest で並列度上限が効いていることの統合テスト（mock で `setTimeout` を噛ませて測定）
- [ ] 本番で `MAX_MESSAGES_PER_RUN=50` の設定でも 429 エラーが出ないことを staging 検証

**判定者**: CEO。Cloud Logging で 429 エラーが 24h 間出ないこと。

### 債務 4: `resetConfigForTesting` の export scope 整理（優先度: 低）

**現状**: `src/config.ts:54` で `resetConfigForTesting` を production module から export している。テスト専用 API が production の公開面に露出している。

**完了条件**:

- [ ] `resetConfigForTesting` を `src/config.testing.ts` に分離するか、関数名を `__resetConfigForTesting` に変更して JSDoc `@internal` を付与
- [ ] 呼び出し箇所（`config.test.ts`, `parser/index.test.ts`）を追従

**判定者**: JARVIS レビュー。production build の export 一覧に該当関数が含まれないこと。

### 債務 5: Pub/Sub payload のログ sanitize（優先度: 低）

**現状**: `src/functions/processEmail.ts:27` で Pub/Sub の decoded payload をそのまま `console.log` している。現在の payload は Gmail `historyId` のみで非機密だが、payload スキーマ拡張時の情報漏洩リスクを抱えている。

**完了条件**:

- [ ] 構造化ログに切り替え（`console.log('Gmail notification', { historyId: decoded.historyId })` のように必要キーのみ）
- [ ] Pub/Sub payload schema に未知フィールドが混入した場合の warn ログ設定

**判定者**: JARVIS レビュー。`console.log` の引数が whitelist 型の object であること。

## スコープ（GCP 移行関連）

### In scope

- 新 GCP プロジェクト作成と API enable (gcloud CLI スクリプト化)
- 新 OAuth client の手動作成（CEO が Google Cloud Console で実施、手順書を JARVIS が用意）
- 新 refresh token 取得手順（`scripts/getRefreshToken.ts` 更新 or OAuth Playground 手順）
- 新 Pub/Sub topic 作成と Gmail API publisher 権限付与
- Secret Manager への移行
- WIF pool / provider / service account 設定（gcloud CLI or Terraform で IaC 化検討）
- `.github/workflows/deploy-mail-to-gcal.yml` 新規作成
- Gmail watch の切り替え（新 topic への register_watch + 旧の停止）
- 旧 `wao-event-automation` プロジェクトの退役判断（CEO）
- 債務 1〜5 の解消

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

## 移行戦略（ダウンタイム最小化）

1. 新プロジェクト `tony-stark-labs` 作成 + API enable
2. 新 OAuth client 作成、新 refresh token 取得（CEO）
3. 新 Pub/Sub topic 作成 + Gmail API publisher 権限付与
4. Secret Manager に新 secret 設定（JARVIS が gcloud CLI で代行可）
5. WIF pool/provider/SA 設定
6. `.github/workflows/deploy-mail-to-gcal.yml` 追加
7. 新プロジェクトへ `processEmail` / `renewWatch` を deploy（workflow_dispatch）
8. 債務 1〜5 を順次解消する PR を発行（各 PR は staging 環境で検証）
9. Gmail watch を新 topic に切り替え（旧 watch は自動失効 or gmail.users.stop で明示停止）
10. 24h 並行稼働で動作確認（旧プロジェクトはログ専用）
11. 旧 `wao-event-automation` の Cloud Functions を停止（CEO 判断）
12. 旧プロジェクト退役（30 日 shutdown 期間を経て削除）

## リスクと緩和策

| リスク                                          | 緩和策                                                                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Gmail watch 切り替え中のメール取りこぼし        | 新旧 watch を一時的に並列で有効化し、双方の Pub/Sub topic を 1 つの function で受けるか、旧 function を 24h 残す        |
| 新 OAuth client の scope 不足                   | `scripts/getRefreshToken.ts` 実行時に scope 一覧を CEO が目視確認                                                       |
| WIF 設定不備で deploy 落ち                      | `workflow_dispatch` での最初の deploy 前に `gcloud iam workload-identity-pools describe` で設定健全性確認               |
| 債務 1（quarantine）導入でラベル運用変更        | 既存メールへの影響を spec 起票時に CEO 確認、必要なら既存 `AddToCalendar` 付きメールを一括 `CalendarIgnored` に migrate |
| 債務 2（extended property）で過去イベントと矛盾 | 過去イベントは再処理対象でないため backfill 不要、ただし既知 messageId の衝突検査を staging で実施                      |
