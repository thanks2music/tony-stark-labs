# Tasks 003: `apps/refrain` 取り込み作業手順

> [!NOTE]
> この取り込みのあと、`mail-to-gcal` は運用を止めて `archive/` へ移した。文中で mail-to-gcal を現役の workspace として扱っている箇所は、当時の状態の記録。

Related: [spec.md](./spec.md), [plan.md](./plan.md)

以下のステップを順次実施する。各ステップは原則 1 commit に対応させる。

## 前提条件

- [x] **鍵ローテ不要**: 取り込み元の `worker/.dev.vars` / `worker/wrangler.toml` は git tracked ではない（調査で確認済み）。`UPLOAD_TOKEN` の漏洩なし
- [x] 作業ツリーがクリーン（`git subtree add` は dirty tree で失敗する）
- [x] 作業ブランチ `feat/refrain-import` を `main` から作成済み
- [x] 取り込み元 `gyazo-remake` の `main` は無変更のまま（参考用として保持）

## 作業ステップ

### Step 1: SDD ドキュメント起票

- [x] `specs/003-refrain-import/{spec.md,plan.md,tasks.md}` を作成
- [x] commit: `docs(specs): add 003-refrain-import spec, plan, and tasks`

### Step 2: subtree add

- [x] `git subtree add --prefix=apps/refrain <取り込み元のローカルパス> main --squash -m "feat(refrain): import from standalone repo via squash subtree"`
- [x] `-m` を最初から渡す（subtree は `commit-tree` 経由で commitlint hook が走らない）
- [x] 検証: 機密ファイル（`.dev.vars` / `wrangler.toml`）が混入していないこと

### Step 3: 重複する root レベル設定の削除

- [x] `git rm` で `apps/refrain/{package.json,tsconfig.base.json,eslint.config.js,.prettierrc,.prettierignore,.gitignore,bun.lock}` を削除
- [x] **`.gitignore` の削除は Step 6 より前に行う**（`worker/wrangler.toml` の無視行を含むため）
- [x] commit: `chore(refrain): drop standalone repo root config files`

### Step 4: workspace 改名

- [x] `apps/refrain/worker/package.json` の `name` を `refrain-worker` に
- [x] `apps/refrain/cli/package.json` の `name` を `refrain-cli` に（`bin.refrain` は据え置き）
- [x] commit: `chore(refrain): rename workspaces to refrain-worker and refrain-cli`

### Step 5: tsconfig の extends 付け替え

- [x] `apps/refrain/{worker,cli}/tsconfig.json` の extends を `../../../tsconfig.base.json` に
- [x] commit: `chore(refrain): extend root tsconfig.base from worker and cli`

### Step 6: wrangler.toml の追跡化

- [x] `apps/refrain/worker/wrangler.toml` を新規作成（`[[routes]]` を含めない）
- [x] `apps/refrain/worker/wrangler.toml.sample` を削除
- [x] 検証: `git check-ignore -v apps/refrain/worker/wrangler.toml` が exit=1
- [x] commit: `chore(refrain): track wrangler.toml without the custom route`

### Step 7: worker-configuration.d.ts の追跡意図を明示

- [x] root `.gitignore` に `!apps/refrain/worker/worker-configuration.d.ts` とコメントを追加
- [x] `apps/refrain/worker/package.json` に `"cf-typegen": "wrangler types"` を追加
- [x] commit: `chore(root): keep refrain worker-configuration.d.ts tracked`

### Step 8: vitest を v4 に統一

- [x] root `package.json` の `vitest` を `^4.1.1` に
- [x] `apps/refrain/worker/package.json` の devDeps から `vitest` を削除
- [x] commit: `chore(root): bump vitest to v4 for cloudflare vitest-pool-workers`

### Step 9: lockfile 再生成

- [x] `bun install`
- [x] 検証: workspace が `mail-to-gcal` / `refrain-worker` / `refrain-cli` の 3 件として認識される
- [x] commit: `chore(root): regenerate lockfile for refrain workspaces`

### Step 10: Lint 修正（発生した場合のみ）

- [x] `bun run lint` を実行
- [x] エラーが出た場合のみ root `eslint.config.js` に refrain 用ブロックを追加
- [x] commit: `fix(refrain): satisfy root eslint flat config`

### Step 11: Prettier 整形

- [x] `bun run format`
- [x] commit: `style(refrain): apply root prettier config to imported files`

### Step 12: CLI エンドポイントの環境変数駆動化（TDD）

- [x] **Red**: `cli/test/config.test.ts` に解決優先順位の失敗テストを追加
- [x] commit: `test(refrain): add failing tests for endpoint resolution precedence`
- [x] **Green**: `cli/src/config.ts` に `resolveEndpoint()` を実装、`DEFAULT_ENDPOINT` を廃止
- [x] `cli/src/index.ts` を `resolveEndpoint()` 経由に（`{DOMAIN}` ガードは維持）
- [x] commit: `feat(refrain): resolve cli endpoint from REFRAIN_ENDPOINT env var`

### Step 13: アプリドキュメント更新

- [x] `apps/refrain/README.md` を monorepo レイアウトに書き換え、`TODO.md` の内容を「運用セットアップ」節として統合
- [x] `{DOMAIN}` プレースホルダは実値に置換しない
- [x] ホットキー節に「ショートカット.app に `Refrain` として登録、割り当ては `⌃⇧⌘R`」を追記
- [x] `apps/refrain/TODO.md` を削除
- [x] `apps/refrain/CLAUDE.md` の実態乖離記述（`[[routes]]` はコメントアウト）を修正、global ルールの重複を削除
- [x] commit: `docs(refrain): rewrite app docs for the monorepo layout`

### Step 14: root ドキュメント更新

- [x] `README.md` のアプリ一覧とテストツール棲み分け表を更新
- [x] `CLAUDE.md`「非自明な設定・制約」に wrangler ルート方針 / 型定義追跡 / vitest v4 制約 / `turbo run build` の注意を追記
- [x] commit: `docs(root): mark refrain as imported and record wrangler route policy`

### Step 15: デプロイワークフロー

- [x] `.github/workflows/deploy-refrain.yml` を新規作成
- [x] `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `REFRAIN_ROUTE` をすべて `secrets` から取得
- [x] commit: `ci(refrain): add cloudflare workers deploy workflow`

## 完了検証

- [x] `bunx turbo run typecheck --dry=json` の package が 3 件（`refrain` が出たら Step 3 の削除漏れ）
- [x] リポジトリ全体を独自ドメイン文字列で grep してヒット 0 件
- [x] `git check-ignore -v apps/refrain/worker/{wrangler.toml,worker-configuration.d.ts}` が両方 exit=1
- [x] `bun run lint && bun run format:check && bun run typecheck && bun run test` が 0 exit
- [x] `bunx turbo run test --dry=text` で `refrain-cli#test` の依存に `refrain-cli#build` が含まれない
- [x] `bun run --filter refrain-cli build && ./apps/refrain/cli/dist/refrain --help` が動作
- [x] `bunx wrangler deploy --dry-run --config apps/refrain/worker/wrangler.toml` が成功
- [x] `bun install --frozen-lockfile` が lockfile 更新なしで成功

## Cloudflare 側セットアップ（スコープ外・別途実施）

deploy ワークフローを有効化する前に必要。詳細は `apps/refrain/README.md` の「運用セットアップ」節。

**Worker は既に本番稼働中**（取り込み前に手動デプロイ済み）。残るのは CI から自動デプロイするための GitHub Actions secrets 登録のみ。

- [x] `{DOMAIN}` の NS を Cloudflare に委譲（`dig NS` で `*.ns.cloudflare.com` を確認）
- [x] apex にプロキシ ON の A レコードを追加（`dig A` が Cloudflare の proxy IP を返すことを確認）
- [x] R2 を有効化し、バケット `refrain` を作成（Worker が 404 を返す = バインディング疎通を確認）
- [x] `openssl rand -hex 32` で生成した値を `wrangler secret put UPLOAD_TOKEN` で投入（認証なし POST が 401 を返すことを確認）
- [x] 同じ値を `~/.config/refrain/token`（chmod 600）に配置
- [ ] GitHub Actions に `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `REFRAIN_ROUTE` の secrets を登録
