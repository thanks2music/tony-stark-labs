# Tasks 003: `apps/refrain` 取り込み作業手順

Related: [spec.md](./spec.md), [plan.md](./plan.md)

以下のステップを順次実施する。各ステップは原則 1 commit に対応させる。

## 前提条件

- [ ] **鍵ローテ不要**: 取り込み元の `worker/.dev.vars` / `worker/wrangler.toml` は git tracked ではない（調査で確認済み）。`UPLOAD_TOKEN` の漏洩なし
- [ ] 作業ツリーがクリーン（`git subtree add` は dirty tree で失敗する）
- [ ] 作業ブランチ `feat/refrain-import` を `main` から作成済み
- [ ] 取り込み元 `gyazo-remake` の `main` は無変更のまま（参考用として保持）

## 作業ステップ

### Step 1: SDD ドキュメント起票

- [ ] `specs/003-refrain-import/{spec.md,plan.md,tasks.md}` を作成
- [ ] commit: `docs(specs): add 003-refrain-import spec, plan, and tasks`

### Step 2: subtree add

- [ ] `git subtree add --prefix=apps/refrain /Users/yoshi/work/dev/my-projects/we-are-all-one/gyazo-remake main --squash -m "feat(refrain): import from standalone repo via squash subtree"`
- [ ] `-m` を最初から渡す（subtree は `commit-tree` 経由で commitlint hook が走らない）
- [ ] 検証: 機密ファイル（`.dev.vars` / `wrangler.toml`）が混入していないこと

### Step 3: 重複する root レベル設定の削除

- [ ] `git rm` で `apps/refrain/{package.json,tsconfig.base.json,eslint.config.js,.prettierrc,.prettierignore,.gitignore,bun.lock}` を削除
- [ ] **`.gitignore` の削除は Step 6 より前に行う**（`worker/wrangler.toml` の無視行を含むため）
- [ ] commit: `chore(refrain): drop standalone repo root config files`

### Step 4: workspace 改名

- [ ] `apps/refrain/worker/package.json` の `name` を `refrain-worker` に
- [ ] `apps/refrain/cli/package.json` の `name` を `refrain-cli` に（`bin.refrain` は据え置き）
- [ ] commit: `chore(refrain): rename workspaces to refrain-worker and refrain-cli`

### Step 5: tsconfig の extends 付け替え

- [ ] `apps/refrain/{worker,cli}/tsconfig.json` の extends を `../../../tsconfig.base.json` に
- [ ] commit: `chore(refrain): extend root tsconfig.base from worker and cli`

### Step 6: wrangler.toml の追跡化

- [ ] `apps/refrain/worker/wrangler.toml` を新規作成（`[[routes]]` を含めない）
- [ ] `apps/refrain/worker/wrangler.toml.sample` を削除
- [ ] 検証: `git check-ignore -v apps/refrain/worker/wrangler.toml` が exit=1
- [ ] commit: `chore(refrain): track wrangler.toml without the custom route`

### Step 7: worker-configuration.d.ts の追跡意図を明示

- [ ] root `.gitignore` に `!apps/refrain/worker/worker-configuration.d.ts` とコメントを追加
- [ ] `apps/refrain/worker/package.json` に `"cf-typegen": "wrangler types"` を追加
- [ ] commit: `chore(root): keep refrain worker-configuration.d.ts tracked`

### Step 8: vitest を v4 に統一

- [ ] root `package.json` の `vitest` を `^4.1.1` に
- [ ] `apps/refrain/worker/package.json` の devDeps から `vitest` を削除
- [ ] commit: `chore(root): bump vitest to v4 for cloudflare vitest-pool-workers`

### Step 9: lockfile 再生成

- [ ] `bun install`
- [ ] 検証: workspace が `mail-to-gcal` / `refrain-worker` / `refrain-cli` の 3 件として認識される
- [ ] commit: `chore(root): regenerate lockfile for refrain workspaces`

### Step 10: Lint 修正（発生した場合のみ）

- [ ] `bun run lint` を実行
- [ ] エラーが出た場合のみ root `eslint.config.js` に refrain 用ブロックを追加
- [ ] commit: `fix(refrain): satisfy root eslint flat config`

### Step 11: Prettier 整形

- [ ] `bun run format`
- [ ] commit: `style(refrain): apply root prettier config to imported files`

### Step 12: CLI エンドポイントの環境変数駆動化（TDD）

- [ ] **Red**: `cli/test/config.test.ts` に解決優先順位の失敗テストを追加
- [ ] commit: `test(refrain): add failing tests for endpoint resolution precedence`
- [ ] **Green**: `cli/src/config.ts` に `resolveEndpoint()` を実装、`DEFAULT_ENDPOINT` を廃止
- [ ] `cli/src/index.ts` を `resolveEndpoint()` 経由に（`{DOMAIN}` ガードは維持）
- [ ] commit: `feat(refrain): resolve cli endpoint from REFRAIN_ENDPOINT env var`

### Step 13: アプリドキュメント更新

- [ ] `apps/refrain/README.md` を monorepo レイアウトに書き換え、`TODO.md` の内容を「運用セットアップ」節として統合
- [ ] `{DOMAIN}` プレースホルダは実値に置換しない
- [ ] ホットキー節に「ショートカット.app に `Refrain` として登録、割り当ては `⌃⇧⌘R`」を追記
- [ ] `apps/refrain/TODO.md` を削除
- [ ] `apps/refrain/CLAUDE.md` の実態乖離記述（`[[routes]]` はコメントアウト）を修正、global ルールの重複を削除
- [ ] commit: `docs(refrain): rewrite app docs for the monorepo layout`

### Step 14: root ドキュメント更新

- [ ] `README.md` のアプリ一覧とテストツール棲み分け表を更新
- [ ] `CLAUDE.md`「非自明な設定・制約」に wrangler ルート方針 / 型定義追跡 / vitest v4 制約 / `turbo run build` の注意を追記
- [ ] commit: `docs(root): mark refrain as imported and record wrangler route policy`

### Step 15: デプロイワークフロー

- [ ] `.github/workflows/deploy-refrain.yml` を新規作成
- [ ] `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `REFRAIN_ROUTE` をすべて `secrets` から取得
- [ ] commit: `ci(refrain): add cloudflare workers deploy workflow`

## 完了検証

- [ ] `bunx turbo run typecheck --dry=json` の package が 3 件（`refrain` が出たら Step 3 の削除漏れ）
- [ ] リポジトリ全体を独自ドメイン文字列で grep してヒット 0 件
- [ ] `git check-ignore -v apps/refrain/worker/{wrangler.toml,worker-configuration.d.ts}` が両方 exit=1
- [ ] `bun run lint && bun run format:check && bun run typecheck && bun run test` が 0 exit
- [ ] `bunx turbo run test --dry=text` で `refrain-cli#test` の依存に `refrain-cli#build` が含まれない
- [ ] `bun run --filter refrain-cli build && ./apps/refrain/cli/dist/refrain --help` が動作
- [ ] `bunx wrangler deploy --dry-run --config apps/refrain/worker/wrangler.toml` が成功
- [ ] `bun install --frozen-lockfile` が lockfile 更新なしで成功

## Cloudflare 側セットアップ（スコープ外・別途実施）

deploy ワークフローを有効化する前に必要。詳細は `apps/refrain/README.md` の「運用セットアップ」節。

- [ ] `{DOMAIN}` の NS を Cloudflare に委譲
- [ ] apex にプロキシ ON のダミー A レコード `192.0.2.1` を追加（Workers ルート発火用）
- [ ] R2 を有効化し、バケット `refrain` を作成
- [ ] `openssl rand -hex 32` で生成した値を `wrangler secret put UPLOAD_TOKEN` で投入
- [ ] 同じ値を `~/.config/refrain/token`（chmod 600）に配置
- [ ] GitHub Actions に `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` / `REFRAIN_ROUTE` の secrets を登録
