# Tasks 001: `apps/mail-to-gcal` 取り込み作業手順

> [!WARNING]
> **アーカイブ済み。** `mail-to-gcal` は運用を止め、コードを `archive/mail-to-gcal/` へ移した。この文書は当時の記録として残している。AI エージェントは、ここに書かれた手順や未完了のタスクを実行しないこと。パスの `apps/mail-to-gcal` は、いまは `archive/mail-to-gcal` にある。

以下のステップを順次実施する。各ステップは原則 1 commit に対応させる。

## 前提条件

- [x] **鍵ローテ不要**: 取り込み元の `.env` / `.envrc` / `credentials.json` は git tracked ではなかった（調査で確認済み）。漏洩なし。
- [x] 取り込み元リポジトリの `main` branch は無変更のまま（参考用として保持）

## 作業ステップ

### Step 1: subtree add

- [x] `cd /Users/yoshi/work/dev/my-projects/tony-stark-labs`
- [x] `git pull --ff-only origin main`
- [x] `git subtree add --prefix=apps/mail-to-gcal file:///Users/yoshi/work/dev/my-projects/mail-to-google-calendar main --squash -m "..."`
- [x] 検証: 機密ファイルが混入していないこと

### Step 2: 個別 bun.lock 削除

- [x] `git rm apps/mail-to-gcal/bun.lock`
- [x] commit: `chore(mail-to-gcal): drop standalone bun.lock`

### Step 3: root devDependencies 昇格

- [x] `package.json` の devDependencies に `@types/node ^22` / `vitest ^3` を追加、`apps/mail-to-gcal/package.json` から `typescript` / `vitest` / `@types/node` を削除
- [x] `bun install`
- [x] commit: `chore(root): hoist typescript vitest @types/node to root devDependencies`

### Step 4: tsconfig 書き換え

- [x] `apps/mail-to-gcal/tsconfig.json` を root `tsconfig.base.json` extends + nodenext override に
- [x] commit: `chore(mail-to-gcal): extend root tsconfig.base with nodenext override`

### Step 5: cloudevents 明示依存追加

- [x] bun isolated linker により `cloudevents` を `@google-cloud/functions-framework` 経由で参照できないため、直接 dependencies に追加
- [x] commit: `chore(mail-to-gcal): add explicit cloudevents dependency for isolated linker`

### Step 6: ESLint override 追加

- [x] `eslint.config.js` に `apps/mail-to-gcal/**` 向け `no-console: off` と `aiParser.ts` 向け unsafe 系 warn override を追加
- [x] commit: `chore(root): add eslint override for mail-to-gcal`

### Step 7: typecheck エラー修正（プロダクションコード）

- [x] `src/parser/aiParser.ts`, `src/parser/doorkeeperParser.ts`, `src/parser/findyParser.ts` の `noUncheckedIndexedAccess` 違反を optional chaining + early return で修正
- [x] commit: `fix(mail-to-gcal): satisfy strict index access and exclude tests from typecheck`

### Step 8: テストコード修正

- [x] 4 本のテストファイルに non-null assertion（`[0]!`）を追加
- [x] `eslint.config.js` のテストファイル向け override に `no-non-null-assertion: off` と unsafe 系 warn を追加
- [x] commit: `fix(mail-to-gcal): add non-null assertions and restore test typecheck coverage`

### Step 9: 追加 eslint error 対応

- [x] `src/auth/oauth.ts` の `JSON.parse` 結果を type assertion
- [x] `src/functions/processEmail.ts` の `JSON.parse` 結果を `unknown` 型付け
- [x] commit: `fix(mail-to-gcal): type JSON.parse results to satisfy strict eslint`

### Step 10: Red commit

- [x] `apps/mail-to-gcal/src/config.test.ts` を追加
- [x] commit: `test(mail-to-gcal): add failing config loader tests`

### Step 11: Green commit

- [x] `apps/mail-to-gcal/src/config.ts` を実装
- [x] commit: `feat(mail-to-gcal): add zod-backed env config loader`

### Step 12: Refactor

- [x] `src/gmail/watchManager.ts` / `src/calendar/createEvent.ts` / `src/auth/oauth.ts` / `src/parser/index.ts` / `src/parser/aiParser.ts` / `src/parser/index.test.ts` を `loadConfig()` 経由に変更
- [x] `OAUTH_CREDENTIALS` は Zod で optional に、使用箇所（`auth/oauth.ts`）で明示 require
- [x] commit: `refactor(mail-to-gcal): route env access through config loader`

### Step 13: .env.example と package.json 整理

- [x] 全環境変数を `.env.example` に列挙
- [x] `apps/mail-to-gcal/package.json`: `name: "mail-to-gcal"`、`private: true`、`lint` / `typecheck` scripts 追加、`gcp-build: ""` 削除、`npx` プレフィックス除去
- [x] commit: `chore(mail-to-gcal): update package scripts and env example for monorepo`

### Step 14: SDD ドキュメント commit

- [ ] `specs/001-mail-to-gcal-import/{spec,plan,tasks}.md` を commit
- [ ] commit: `docs(mail-to-gcal): add spec plan tasks for import phase`

### 最終検証

- [ ] `bun run lint / format:check / typecheck / test / build` が全て 0 exit
- [ ] `find apps/mail-to-gcal \( -name ".env" -o -name ".envrc" -o -name "credentials.json" -o -name "token.json" \) -not -name ".env.example"` が空出力
- [ ] `git log --grep="git-subtree-dir: apps/mail-to-gcal" --oneline` で squash commit 確認

### PR 作成（CEO が実行）

- [ ] PR タイトル案: `feat(mail-to-gcal): import from standalone repo with env-var config`
- [ ] PR 本文: Phase 1a の成果と Phase 1b の予告（新 GCP プロジェクト `tony-stark-labs` への移行）
