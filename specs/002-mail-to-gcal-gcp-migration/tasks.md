# Tasks 002: `apps/mail-to-gcal` Phase 1b 作業手順

> [!WARNING]
> **アーカイブ済みの当時の記録。** コードは `archive/mail-to-gcal/` へ移した（文中の `apps/mail-to-gcal` も同じ）。扱いは AGENTS.md の「アーカイブ」節に従い、ここに書かれた手順やタスクは実行しない。

Related: [spec.md](./spec.md), [plan.md](./plan.md)

## 前提条件

- [ ] Phase 1a PR がマージ済み
- [ ] CEO が新 GCP プロジェクト作成 + OAuth consent screen 設定を実行可能な状態
- [ ] GitHub Actions secrets 登録権限を CEO が保持

## GCP プロジェクト移行ステップ

### Step 1: 新プロジェクト作成

- [ ] `gcloud projects create tony-stark-labs --name="Tony Stark Labs"`（CEO）
- [ ] Billing account を link（CEO、Console で手動）
- [ ] 必要 API を一括 enable:

  ```bash
  gcloud services enable \
    cloudfunctions.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    pubsub.googleapis.com \
    gmail.googleapis.com \
    iamcredentials.googleapis.com \
    --project=tony-stark-labs
  ```

### Step 2: OAuth 新設

- [ ] OAuth consent screen を作成（CEO、Console）
- [ ] OAuth 2.0 Client ID を作成、`https://developers.google.com/oauthplayground` を Authorized redirect URI に追加
- [ ] `scripts/getRefreshToken.ts` で新 refresh token 取得（CEO）
- [ ] JSON 形式の credentials を JARVIS に共有

### Step 3: Pub/Sub 新設

- [ ] `gcloud pubsub topics create gmail-notifications --project=tony-stark-labs`
- [ ] Gmail API service account (`gmail-api-push@system.gserviceaccount.com`) に publisher 権限付与:

  ```bash
  gcloud pubsub topics add-iam-policy-binding gmail-notifications \
    --member=serviceAccount:gmail-api-push@system.gserviceaccount.com \
    --role=roles/pubsub.publisher \
    --project=tony-stark-labs
  ```

### Step 4: Secret Manager 新設

- [ ] JARVIS が `gcloud secrets create oauth-credentials --project=tony-stark-labs`
- [ ] JARVIS が `gcloud secrets versions add oauth-credentials --data-file=-` で新 credentials を注入
- [ ] 同様に `anthropic-api-key` を作成

### Step 5: Workload Identity Federation 設定

- [ ] `gcloud iam workload-identity-pools create github --location=global --project=tony-stark-labs`
- [ ] `gcloud iam workload-identity-pools providers create-oidc tony-stark-labs --workload-identity-pool=github --issuer-uri=https://token.actions.githubusercontent.com --attribute-mapping='google.subject=assertion.sub,attribute.repository=assertion.repository' --attribute-condition="assertion.repository == 'thanks2music/tony-stark-labs'"`
- [ ] `gcloud iam service-accounts create gha-deployer --project=tony-stark-labs`
- [ ] Service account に role 付与:
  - `roles/cloudfunctions.developer`
  - `roles/iam.serviceAccountUser`
  - `roles/secretmanager.secretAccessor`
  - `roles/artifactregistry.writer`
  - `roles/logging.logWriter`
- [ ] WIF principal に `roles/iam.workloadIdentityUser` を付与

### Step 6: GitHub Actions secrets 登録

- [ ] CEO が以下を GitHub Repository secrets に登録:
  - `WIF_PROVIDER`: `projects/<number>/locations/global/workloadIdentityPools/github/providers/tony-stark-labs`
  - `WIF_SERVICE_ACCOUNT`: `gha-deployer@tony-stark-labs.iam.gserviceaccount.com`
  - `GCP_PROJECT_ID`: `tony-stark-labs`
  - `GOOGLE_CALENDAR_ID`: 該当カレンダー ID

### Step 7: deploy workflow 追加

- [ ] `.github/workflows/deploy-mail-to-gcal.yml` を PR で追加（plan.md の雛形参照）
- [ ] `workflow_dispatch` で staging deploy
- [ ] `gcloud functions describe processEmail` / `renewWatch` で健全性確認

### Step 8: Gmail watch 切り替え

- [ ] `renewWatch` を手動呼び出しで新 topic に register_watch
- [ ] 旧 `wao-event-automation` 側で `gmail.users.stop` を呼んで旧 watch を明示停止
- [ ] 24h 並行稼働で動作確認

### Step 9: 旧プロジェクト退役

- [ ] `gcloud functions delete processEmail --region=asia-northeast1 --project=wao-event-automation`（CEO）
- [ ] `gcloud functions delete renewWatch --region=asia-northeast1 --project=wao-event-automation`（CEO）
- [ ] 30 日 shutdown 期間後、`gcloud projects delete wao-event-automation`（CEO）

---

## 債務返済項目

### 債務 1: 未対応メールの恒久再処理問題（優先度: 高）

**完了条件**:

- [ ] `CalendarIgnored` ラベルを `labelManager.ts` で管理（作成 + ID キャッシュ）
- [ ] `quarantineMessage(gmail, messageId, labelIds)` ヘルパーを `labelManager.ts` に追加
- [ ] `processEmail.ts` で `parseEmail` が null/[] を返した場合、`quarantineMessage` を呼ぶ経路を実装
- [ ] 既存ラベルの migration 手順を `docs/` に documented
- [ ] Vitest で `CalendarIgnored` 付与パスの unit test 追加
- [ ] staging で未対応送信元メールを投入し、同じメールが再処理されないことを 2 回の invocation で確認

**判定者**: CEO。`gcloud functions logs read processEmail --limit 50` で同一 messageId のエントリが 1 回のみ出ることを確認。

### 債務 2: `eventExists` の `q`-based fuzzy 判定（優先度: 高）

**完了条件**:

- [ ] `createCalendarEvent` の書き込み時に `extendedProperties.private.messageId = <gmail message id>` を埋め込む
- [ ] `eventExists` を `events.list` の `privateExtendedProperty=['messageId=<id>']` による安定キー検索に差し替える
- [ ] 時刻窓 ±1 分と `q` 検索を削除
- [ ] 既存 Calendar に登録済みイベント（extended property なし）の backfill 不要を明記（過去分は再処理対象でないため）
- [ ] Vitest で mock を使って private extended property の write/read 経路をテスト
- [ ] staging で同一 messageId のメールを 2 回流し、重複イベントが作成されないことを確認

**判定者**: CEO。Google Calendar の該当イベントから messageId プロパティが読めることを API or UI で確認。

### 債務 3: `Promise.all` 無制限並列（優先度: 中）

**完了条件**:

- [ ] `MAX_MESSAGES_PER_RUN` を `config.ts` の Zod schema に追加（`z.coerce.number().int().min(1).default(10)`）
- [ ] `apps/mail-to-gcal/package.json` に `p-limit` を追加
- [ ] `fetchEmails.ts` の `Promise.all` を `pLimit(5)` でラップ
- [ ] `fetchUnprocessedEmails` の `maxResults` を `loadConfig().MAX_MESSAGES_PER_RUN` 参照に
- [ ] Vitest で並列度上限が効いていることの統合テスト（mock で `setTimeout` を噛ませて測定）
- [ ] 本番で `MAX_MESSAGES_PER_RUN=50` の設定でも 429 エラーが出ないことを staging 検証

**判定者**: CEO。Cloud Logging で 429 エラーが 24h 間出ないこと。

### 債務 4: `resetConfigForTesting` の export scope 整理（優先度: 低）

**完了条件**:

- [ ] `src/config.testing.ts` を新規作成し、`__resetConfigForTesting` を移動
  - または関数名を `__resetConfigForTesting` に変更 + JSDoc `@internal` 付与
- [ ] 呼び出し箇所（`config.test.ts`, `parser/index.test.ts`）を追従
- [ ] `tsconfig.json` の include / exclude で production build に含まれないことを確認

**判定者**: JARVIS レビュー。`bun run --filter mail-to-gcal build` 後の `dist/` に該当関数が含まれないこと。

### 債務 5: Pub/Sub payload のログ sanitize（優先度: 低）

**完了条件**:

- [ ] `processEmail.ts` の `console.log('Gmail通知受信:', decoded)` を構造化ログに変更

  ```ts
  const parsed = PubSubPayloadSchema.safeParse(decoded);
  if (parsed.success) {
    console.log('Gmail notification', { historyId: parsed.data.historyId });
  } else {
    console.warn('Unknown Pub/Sub payload schema', { keys: Object.keys(decoded ?? {}) });
  }
  ```
- [ ] `PubSubPayloadSchema` を定義（`historyId` のみ必須）
- [ ] Pub/Sub payload schema に未知フィールドが混入した場合の warn ログ設定
- [ ] Vitest で既知 / 未知 payload のログパス分岐をテスト

**判定者**: JARVIS レビュー。`console.log` の引数が whitelist 型の object であること。

### 債務 6: Secret Manager rotation 追従（優先度: 中）

**完了条件**:

- [ ] `config.ts` の `cached: Env | null` を `cached: { value: Env; expiresAt: number } | null` に変更
- [ ] TTL を 300 秒（5 分）に設定、`Date.now() > expiresAt` で再読込
- [ ] `CONFIG_TTL_SECONDS` を環境変数で上書き可能にし、schema に追加（`z.coerce.number().int().min(0).default(300)`、0 は cache 無効）
- [ ] `oauth.ts` の `cachedAuth` も同様の TTL 化、または cfg 取得時に毎回 `setCredentials` を呼ぶ形にリファクタ
- [ ] Vitest で TTL 切れ時の再読込をテスト（`vi.useFakeTimers()` で時刻操作）
- [ ] staging で Secret rotation → 5 分以内の新値反映を確認

**判定者**: CEO。Secret Manager の新バージョン公開後、次の invocation で新値が使われることを Cloud Logging で確認。

---

## 最終検証

- [ ] `bun run lint / format:check / typecheck / test / build` が green
- [ ] 全 6 債務の完了条件チェックボックスが満たされている
- [ ] staging 24h 稼働で 429 / 401 / unhandled exception が 0 件
- [ ] 本番切り替え後 1 週間の Cloud Logging で異常なし
- [ ] 旧プロジェクト退役手順を完了

## PR 作成（CEO が実行）

- [ ] 各債務ごとに独立 PR（推奨）、または 1 PR に全債務 + GCP 移行を集約（レビュー負荷許容時）
- [ ] PR タイトル案（集約版）: `feat(mail-to-gcal): migrate to tony-stark-labs gcp project and pay down phase 1a debt`
