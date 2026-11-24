# AGENTS.md

このリポジトリで作業する AI エージェント向けの規約。人間向けの説明は [README.md](./README.md) にあり、ここでは README と重ならない、作業時に守ることだけを書く。

## リポジトリ概要

[@thanks2music](https://github.com/thanks2music) の個人用 polyglot monorepo。アプリは `apps/` 配下に独立した workspace として置き、ツールチェーン（Bun / Turborepo / Biome / ESLint / CI）を共有する。ホスティングはアプリごとに選ぶ。

**このリポジトリは GitHub で公開している。** 秘密値だけでなく、実在のドメインや個人の識別子も書かない（「公開リポジトリとしての注意」）。

## コマンド

コマンドの一覧は README の「開発コマンド」節にある。コミット前に、次を通す。

```bash
bun run check && bun run lint && bun run typecheck && bun run test
```

## Commit ルール

- [Conventional Commits](https://www.conventionalcommits.org/) に従う（commitlint で自動検証）
- subject は lowercase で始める。`@commitlint/config-conventional` の既定で、sentence-case / start-case / pascal-case / upper-case は reject される
  - 例: `feat(root): bootstrap Bun workspaces + Turborepo monorepo`（文頭は lowercase、途中の固有名詞は大文字のままでよい）
- `Co-Authored-By:` などの AI の署名は付けない
- type と scope の使い分けは README の「Commit Convention」節を参照

## 開発手法（TDD + SDD）

- **SDD**: 新機能は `specs/NNN-<slug>/` に `spec.md` → `plan.md` → `tasks.md` の順で起票してから実装する。軽微な修正（typo・依存更新・ログ追加）は spec を省略してよい。`tasks.md` のチェックは、リポジトリの外の作業（デプロイや secrets の登録など）も含めて、PR をマージする前に更新する
- **TDD**: Red（失敗するテストの commit）→ Green（実装の commit）→ Refactor の順に進める
- 対象は `apps/` と `packages/`。`scripts/`（個人の作業用スクリプト）と `experiments/` は workspace に属さずテストの仕組みも無いので、SDD と TDD の対象外とする。変更したら、実際に動かして確かめる

## 非自明な設定・制約

### Bun + husky（simple-git-hooks は使わない）

- `bunfig.toml` で `linker = "isolated"`（pnpm 相当。phantom dependency を防ぐ）を採用している
- この linker は `simple-git-hooks` の postinstall script と互換性がない（パス解決に失敗する）
- そのため git hook は **husky v9 + lint-staged + commitlint**。simple-git-hooks に戻さない

### Lint と format は Biome + 型情報だけの ESLint

- format と一般的な lint は Biome（`biome.json`、`bun run check`）。ESLint は typescript-eslint の `recommendedTypeCheckedOnly`（型情報を使うルールだけ）を TypeScript のファイル（`.ts`・`.tsx`・`.mts`・`.cts`）に適用する（`bun run lint`）。理由は [ADR 0001](./docs/adr/0001-biome-with-type-aware-eslint.md)
- **型情報を使わないルールを ESLint に足さない。** Biome とルールが重なる。足したいルールは `biome.json` で有効にする
- `eslint.config.js` は `projectService: true` で、各 workspace の `tsconfig.json` を自動で解決する。lint する `.ts` は、どれかの `tsconfig.json` の `include` に入っている必要がある
- Biome は `.gitignore` を読むが、グローバルの `~/.gitignore` は読まない。グローバルだけで除外している個人のファイル（`CLAUDE.md`・`.claude/`）は、`biome.json` の `files.includes` で除外している
- ルールを止める前に、コード側で直せないかを考える。今ある例外は、bun:test の型の都合で `await-thenable` を CLI のテストだけで止めているもの 1 つ。テストのコードにも本体と同じルールを当てる（`no-unsafe-*` などを緩めない）

### Turbo の実行単位

- `bun run lint` などは、すべて turbo 経由で各 workspace に委譲される

### ランタイムのバージョン

- `.tool-versions`（mise / asdf 互換）を正とする。切り替えは `mise install` / `asdf install`
- Node は LTS の最新に揃える。Cloudflare Workers の実行環境は Node ではない（workerd）ので、Node のバージョンが効くのは手元と CI の wrangler・tsc・ESLint だけ
- Node を上げるときは、`.tool-versions` と `package.json` の `engines` を揃える
- Bun を上げるときは、`.tool-versions`・root の `package.json` の `packageManager` と `engines.bun`・`apps/refrain/cli/package.json` の `engines.bun`・`@types/bun` の 5 か所を揃える
- CI は `.github/actions/setup`（composite action）で、`.tool-versions` の Node と Bun を入れる（ランナーに最初から入っている Node に頼らない）

### 環境変数

- `.env` はローカル専用（gitignore 済み）。`.env.example` を雛形にする
- 機密値は GitHub Actions の secrets に置き、CI が deploy 時に注入する

### 依存は使う workspace に宣言する

- Turborepo の方針どおり、依存はそれを使う workspace の `package.json` に宣言する。root に置くのは、リポジトリを管理するツール（turbo・husky・lint-staged・commitlint・Biome・ESLint と typescript-eslint）だけ（[Managing dependencies](https://turborepo.com/docs/crafting-your-repository/managing-dependencies)）
- `tsc` を呼ぶ workspace は、それぞれ `typescript` を宣言する。root の `typescript` は typescript-eslint の peer dependency のために置いている。**TypeScript 7 に上げない**: typescript-eslint の peerDependencies が `typescript: <6.1.0` で、型情報を使う ESLint が動かなくなる（typescript-eslint が対応したら上げる）
- `vitest` は `refrain-worker` に宣言している。Workers のテストは `@cloudflare/vitest-plugin`（旧 `@cloudflare/vitest-pool-workers`。旧パッケージは非推奨で更新されない）で動かす。**Vitest は 4 系に留める**: Cloudflare の公式の例が `vitest@^4.1.0` で、Vitest 5 は `node:inspector` を読み込むため、`nodejs_compat` の無いこの Worker ではテストのたびにエラーが出る。上げるときは、`@cloudflare/vitest-plugin` の対応と、このエラーが出ないことを確かめる

### refrain のその他の制約

- `apps/refrain/worker/worker-configuration.d.ts` は `wrangler types` の生成物だが、typecheck に必要なので**意図して追跡している**。root の `.gitignore` は同名のファイルを無視するので、否定パターンで例外にしてある。再生成は `bun run --filter refrain-worker cf-typegen`。secret の型は `wrangler.toml` の `[secrets] required` から作られるので、secret を増やしたらそこにも足す（型の生成に `.dev.vars` は要らない。`wrangler dev` で値を使うには引き続き `.dev.vars` に置く。`[secrets]` があると、`wrangler dev` は `required` に無い secret を `.dev.vars` から読み込まない）
- `refrain-cli` の `build` は macOS 専用のバイナリ（約 60 MB）を作る。CI に `turbo run build` を足すときは `--filter=!refrain-cli` を付ける（今の CI は build を実行しない）
- `worker/vitest.config.ts` が `wrangler.toml` を参照するので、`wrangler.toml` を gitignore に戻すと CI の `bun run test` が起動時に落ちる

## 公開リポジトリとしての注意

- `.env` や機密値をコミットしない。`.gitignore` を信頼する前に、ファイルの中身を確かめる
- アプリを載せる独自ドメインとホスト名は、ソース・設定（`wrangler.toml` を含む）・ドキュメントのどこにも書かない。ドキュメントでは `{DOMAIN}` プレースホルダのままにし、デプロイ時に GitHub Actions の **`secrets`**（`vars` ではない）から渡す。理由と渡し方は [refrain の ADR 0001](./apps/refrain/docs/adr/0001-keep-the-domain-out-of-the-repository.md)
- アプリは 1 つにつき専用のサブドメインを 1 つ使い、パスにアプリ名の前置きを付けない（[ADR 0002](./docs/adr/0002-one-subdomain-per-app.md)）
- `docs/plan/`（設計メモ）と `**/docs/report/`（セッションの作業報告）は gitignore している。コミットしない
- `experiments/` は、各ディレクトリの `README.md` だけを追跡する。素材や成果物はコミットしない

## アーカイブ

`archive/` には運用を止めたアプリを当時のまま置いている。workspace・CI・lint・format の対象外で、コードを変更しない（例外は、公開リポジトリに残してはいけない識別子の除去だけ）。ほかのアプリを実装するときの参考や基準にもしない。

## アプリの取り込み

新しいアプリは `git subtree add --prefix=apps/<name> <remote-url> main --squash` で取り込む。取り込み後の手順（devDependencies の昇格・`tsconfig.base.json` への extends・ハードコード値の環境変数化）は README の「新しいアプリを追加する手順」を参照。

## テストランナー

workspace ごとに違う（Workers は Vitest、Bun の CLI は `bun:test`）。対応表と理由は README の「テストツール棲み分け」節を参照。

## Agent skills

### Issue tracker

GitHub Issues（`thanks2music/tony-stark-labs`）を `gh` CLI で扱う。See `docs/agents/issue-tracker.md`.

### Triage labels

デフォルトの 5 ラベル（needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix）をそのまま使う。See `docs/agents/triage-labels.md`.

### Domain docs

multi-context。root の `GLOSSARY-MAP.md` から `apps/<name>/GLOSSARY.md` を引く。See `docs/agents/domain.md`.
